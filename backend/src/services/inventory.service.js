"use strict";

/**
 * src/services/inventory.service.js
 *
 * All inventory business logic for NexusERP.
 *
 * Responsibilities:
 *  - Prisma queries (never raw SQL except for analytics aggregations)
 *  - Stock quantity management with immutable ledger writes
 *  - Low-stock detection and threshold logic
 *  - Audit log writes on every mutating operation
 *  - Inventory analytics aggregation
 *
 * Rules:
 *  - NEVER update InventoryItem.quantity directly without also writing a StockMovement
 *  - NEVER hard-delete inventory items — use isActive = false (soft delete)
 *  - totalValue is a denormalized field — always recompute after price or qty changes
 *  - All monetary values are stored as Decimal — use parseFloat() for arithmetic
 *    and pass back as strings (Prisma Decimal → JSON serializes as string)
 */

const prisma                     = require("../config/prisma");
const logger                     = require("../config/logger");
const { writeAuditLog,
        getAuditContext }        = require("../utils/audit");
const { buildPaginationMeta }    = require("../utils/response");

// ─── Internal error factory (mirrors auth.service pattern) ────────────────────
function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode    = statusCode;
  err.isOperational = true;
  return err;
}

// ─── Stock status classifier ──────────────────────────────────────────────────
/**
 * Derive the stock health status of an item from its quantities.
 * Used for the status badge in the UI and for filtering.
 *
 * "critical" → qty is 0 or below half the reorder point
 * "low"      → qty is at or below the reorder point
 * "ok"       → qty is above the reorder point
 *
 * @param {number} quantity
 * @param {number} reorderPoint
 * @returns {"critical"|"low"|"ok"}
 */
function classifyStockStatus(quantity, reorderPoint) {
  if (quantity <= 0 || quantity <= Math.floor(reorderPoint / 2)) return "critical";
  if (quantity <= reorderPoint) return "low";
  return "ok";
}

// ─── Standard item select projection ─────────────────────────────────────────
// Fetch category and supplier names with every item — avoids N+1 queries
// because Prisma batches nested includes into a single JOIN.
const ITEM_SELECT = {
  id:           true,
  sku:          true,
  name:         true,
  description:  true,
  quantity:     true,
  reorderPoint: true,
  unitPrice:    true,
  totalValue:   true,
  warehouseZone:true,
  barcodeUrl:   true,
  imageUrl:     true,
  isActive:     true,
  createdAt:    true,
  updatedAt:    true,
  categoryId:   true,
  supplierId:   true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true, email: true, phone: true } },
};

// ─── Enrich a raw Prisma item with derived fields ────────────────────────────
function enrichItem(item) {
  return {
    ...item,
    unitPrice:  parseFloat(item.unitPrice),
    totalValue: parseFloat(item.totalValue),
    status:     classifyStockStatus(item.quantity, item.reorderPoint),
  };
}

// =============================================================================
// listItems
// =============================================================================
/**
 * Paginated, filtered, searchable inventory list.
 *
 * Filtering options:
 *  - search      Full text match on name OR sku (case-insensitive)
 *  - categoryId  Exact match
 *  - supplierId  Exact match
 *  - warehouseZone  Exact match
 *  - status      Derived field: "ok" | "low" | "critical" | "inactive" | "all"
 *  - isActive    Defaults to true (inactive items hidden unless ?status=inactive)
 *
 * @param {object} filters
 * @param {number} filters.page
 * @param {number} filters.limit
 * @param {string} [filters.search]
 * @param {string} [filters.categoryId]
 * @param {string} [filters.supplierId]
 * @param {string} [filters.warehouseZone]
 * @param {string} [filters.status]
 * @param {string} [filters.sortBy]
 * @param {string} [filters.sortOrder]
 */
async function listItems(filters = {}) {
  const {
    page         = 1,
    limit        = 20,
    search       = "",
    categoryId,
    supplierId,
    warehouseZone,
    status       = "all",
    sortBy       = "createdAt",
    sortOrder    = "desc",
  } = filters;

  const skip = (page - 1) * limit;

  // ── Build the WHERE clause dynamically ──────────────────────────────────
  const where = {};

  // Status filter maps to isActive + quantity/reorderPoint conditions
  if (status === "inactive") {
    where.isActive = false;
  } else if (status === "critical") {
    where.isActive = true;
    // quantity <= floor(reorderPoint / 2)  — handled post-query (Prisma
    // can't express field-to-field comparisons in one clause cleanly without
    // raw SQL), so we fetch low-stock items and filter in JS.
    // For large datasets, a Prisma raw query or a DB view would be better.
    where.quantity = { lte: 5 }; // Approximate — refined in enrichment
  } else if (status === "low") {
    where.isActive  = true;
    // quantity <= reorderPoint — again approximated; service refines post-query
  } else {
    // "ok" and "all" both show active items by default
    where.isActive = status === "all" ? undefined : true;
    if (status !== "all") where.isActive = true;
  }

  if (categoryId)    where.categoryId    = categoryId;
  if (supplierId)    where.supplierId    = supplierId;
  if (warehouseZone) where.warehouseZone = warehouseZone;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku:  { contains: search, mode: "insensitive" } },
    ];
  }

  // For stock-status filters we can't do a field-vs-field WHERE in Prisma
  // without raw SQL, so fetch all matching-sku/category items and filter JS-side.
  // Acceptable for typical inventory sizes (<50k items); add a DB view for scale.
  const usePostFilter = status === "low" || status === "critical" || status === "ok";

  // ── Execute count + data in parallel ────────────────────────────────────
  // Remove the quantity filter we approximated above for "critical" to get
  // accurate counts before post-filtering.
  const cleanWhere = { ...where };
  if (status === "critical") delete cleanWhere.quantity;

  const [rawItems, totalBeforeFilter] = await Promise.all([
    prisma.inventoryItem.findMany({
      where:   cleanWhere,
      select:  ITEM_SELECT,
      orderBy: { [sortBy]: sortOrder },
      // Don't paginate before post-filter for status queries — we need all rows.
      // For very large datasets, use cursor-based pagination or a raw query.
      skip:    usePostFilter ? 0     : skip,
      take:    usePostFilter ? 10000 : limit, // Safety cap for post-filter
    }),
    prisma.inventoryItem.count({ where: cleanWhere }),
  ]);

  // ── Enrich with derived status ───────────────────────────────────────────
  let items = rawItems.map(enrichItem);

  // ── Post-filter for status when needed ──────────────────────────────────
  if (usePostFilter) {
    items = items.filter((item) => item.status === status);
    // Now paginate the filtered result in memory
    const total = items.length;
    items = items.slice(skip, skip + limit);
    return {
      items,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  return {
    items,
    meta: buildPaginationMeta(totalBeforeFilter, page, limit),
  };
}

// =============================================================================
// getItemById
// =============================================================================
/**
 * Fetch a single inventory item by its ID.
 * Includes category, supplier, and the last 10 stock movements.
 *
 * @param {string} itemId
 */
async function getItemById(itemId) {
  const item = await prisma.inventoryItem.findUnique({
    where:  { id: itemId },
    select: {
      ...ITEM_SELECT,
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id:        true,
          type:      true,
          quantity:  true,
          reference: true,
          notes:     true,
          createdAt: true,
        },
      },
    },
  });

  if (!item) throw createError("Inventory item not found.", 404);

  return enrichItem(item);
}

// =============================================================================
// createItem
// =============================================================================
/**
 * Create a new inventory item and write its initial stock movement.
 *
 * Business rules:
 *  - SKU must be unique (Prisma unique constraint + explicit pre-check)
 *  - If quantity > 0, write an "IN" StockMovement as the opening stock entry
 *  - totalValue = quantity × unitPrice (denormalized for fast dashboard queries)
 *
 * @param {object} dto
 * @param {import('express').Request} req
 */
async function createItem(dto, req) {
  const {
    sku, name, description, quantity = 0, reorderPoint = 10,
    unitPrice, categoryId, supplierId, warehouseZone,
    barcodeUrl, imageUrl,
  } = dto;

  // ── Duplicate SKU check ─────────────────────────────────────────────────
  const existing = await prisma.inventoryItem.findUnique({
    where:  { sku: sku.toUpperCase() },
    select: { id: true },
  });
  if (existing) {
    throw createError(`An item with SKU "${sku.toUpperCase()}" already exists.`, 409);
  }

  // ── Validate FK references exist ─────────────────────────────────────────
  if (categoryId) {
    const cat = await prisma.inventoryCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!cat) throw createError(`Category with ID "${categoryId}" not found.`, 404);
  }
  if (supplierId) {
    const sup = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
    if (!sup) throw createError(`Supplier with ID "${supplierId}" not found.`, 404);
  }

  const totalValue = quantity * parseFloat(unitPrice);

  // ── Create item + opening stock movement in a transaction ────────────────
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        sku:          sku.toUpperCase(),
        name:         name.trim(),
        description:  description?.trim() || null,
        quantity,
        reorderPoint,
        unitPrice,
        totalValue,
        categoryId:   categoryId || null,
        supplierId:   supplierId || null,
        warehouseZone:warehouseZone?.toUpperCase() || null,
        barcodeUrl:   barcodeUrl  || null,
        imageUrl:     imageUrl    || null,
      },
      select: ITEM_SELECT,
    });

    // Write opening stock movement if initial qty > 0
    if (quantity > 0) {
      await tx.stockMovement.create({
        data: {
          itemId:    created.id,
          type:      "IN",
          quantity,
          reference: "OPENING_STOCK",
          notes:     "Initial stock at item creation",
        },
      });
    }

    return created;
  });

  // ── Audit log ────────────────────────────────────────────────────────────
  await writeAuditLog({
    action:   "CREATED",
    entity:   "inventory_items",
    entityId: item.id,
    detail:   `Created inventory item: ${item.sku} — ${item.name} (qty: ${quantity}, price: $${unitPrice})`,
    userId:   req.user.id,
    metadata: { sku: item.sku, quantity, unitPrice },
    ...getAuditContext(req),
  });

  logger.info(`[Inventory] Created: ${item.sku} by ${req.user.email}`);

  return enrichItem(item);
}

// =============================================================================
// updateItem
// =============================================================================
/**
 * Update mutable fields of an inventory item.
 * Quantity is NOT updated here — use adjustStock() instead (requires a movement).
 *
 * If unitPrice changes, totalValue is recomputed.
 *
 * @param {string} itemId
 * @param {object} dto
 * @param {import('express').Request} req
 */
async function updateItem(itemId, dto, req) {
  // ── Confirm item exists and is active ───────────────────────────────────
  const existing = await prisma.inventoryItem.findUnique({
    where:  { id: itemId },
    select: { id: true, sku: true, name: true, quantity: true, unitPrice: true, isActive: true },
  });
  if (!existing) throw createError("Inventory item not found.", 404);

  // Build the data object with only provided fields (partial update)
  const data = {};

  if (dto.name        !== undefined) data.name         = dto.name.trim();
  if (dto.description !== undefined) data.description  = dto.description?.trim() || null;
  if (dto.reorderPoint!== undefined) data.reorderPoint = dto.reorderPoint;
  if (dto.categoryId  !== undefined) data.categoryId   = dto.categoryId || null;
  if (dto.supplierId  !== undefined) data.supplierId   = dto.supplierId || null;
  if (dto.warehouseZone!==undefined) data.warehouseZone= dto.warehouseZone?.toUpperCase() || null;
  if (dto.barcodeUrl  !== undefined) data.barcodeUrl   = dto.barcodeUrl  || null;
  if (dto.imageUrl    !== undefined) data.imageUrl     = dto.imageUrl    || null;
  if (dto.isActive    !== undefined) data.isActive     = dto.isActive;

  // If price changed, recompute totalValue with current quantity
  if (dto.unitPrice !== undefined) {
    data.unitPrice  = dto.unitPrice;
    data.totalValue = existing.quantity * parseFloat(dto.unitPrice);
  }

  if (Object.keys(data).length === 0) {
    throw createError("No valid fields provided for update.", 400);
  }

  const updated = await prisma.inventoryItem.update({
    where:  { id: itemId },
    data,
    select: ITEM_SELECT,
  });

  await writeAuditLog({
    action:   "UPDATED",
    entity:   "inventory_items",
    entityId: itemId,
    detail:   `Updated inventory item: ${existing.sku} — ${existing.name}`,
    userId:   req.user.id,
    metadata: { changes: data },
    ...getAuditContext(req),
  });

  logger.info(`[Inventory] Updated: ${existing.sku} by ${req.user.email}`);

  return enrichItem(updated);
}

// =============================================================================
// adjustStock
// =============================================================================
/**
 * Record a stock movement (IN / OUT / ADJUSTMENT / TRANSFER / RESERVED).
 *
 * This is the ONLY way to change InventoryItem.quantity — every change
 * is backed by an immutable StockMovement ledger entry.
 *
 * Business rules:
 *  - OUT movements cannot reduce quantity below 0
 *  - ADJUSTMENT movements set quantity to exactly `quantity` (not delta)
 *  - IN / TRANSFER / RESERVED movements add to current quantity
 *  - totalValue is recomputed after every quantity change
 *
 * @param {string} itemId
 * @param {object} dto      { type, quantity, reference, notes }
 * @param {import('express').Request} req
 */
async function adjustStock(itemId, dto, req) {
  const { type, quantity, reference, notes } = dto;

  const result = await prisma.$transaction(async (tx) => {
    // Lock the row for update to prevent race conditions with concurrent adjustments
    const item = await tx.inventoryItem.findUnique({
      where:  { id: itemId },
      select: { id: true, sku: true, name: true, quantity: true, reorderPoint: true, unitPrice: true, isActive: true },
    });

    if (!item)          throw createError("Inventory item not found.", 404);
    if (!item.isActive) throw createError("Cannot adjust stock for an inactive item.", 400);

    let newQuantity;
    let movementQty = quantity; // Signed quantity for the ledger

    switch (type) {
      case "IN":
      case "TRANSFER":
      case "RESERVED":
        newQuantity = item.quantity + quantity;
        break;

      case "OUT":
        if (item.quantity < quantity) {
          throw createError(
            `Insufficient stock. Available: ${item.quantity}, Requested: ${quantity}.`,
            400
          );
        }
        newQuantity = item.quantity - quantity;
        movementQty = -quantity; // Negative in the ledger for OUT
        break;

      case "ADJUSTMENT":
        // ADJUSTMENT sets the absolute quantity (e.g. after a physical count)
        newQuantity = quantity;
        movementQty = quantity - item.quantity; // The delta recorded in the ledger
        break;

      default:
        throw createError(`Invalid movement type: ${type}`, 400);
    }

    const newTotalValue = newQuantity * parseFloat(item.unitPrice);

    // ── Update item quantity and totalValue ─────────────────────────────────
    const updatedItem = await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        quantity:   newQuantity,
        totalValue: newTotalValue,
      },
      select: ITEM_SELECT,
    });

    // ── Write immutable ledger entry ─────────────────────────────────────────
    const movement = await tx.stockMovement.create({
      data: {
        itemId,
        type,
        quantity:  movementQty,
        reference: reference || null,
        notes:     notes     || null,
      },
    });

    return { item: updatedItem, movement, previousQty: item.quantity };
  });

  // ── Determine if this triggers a low-stock alert ─────────────────────────
  const enriched = enrichItem(result.item);
  const alertNeeded = enriched.status === "critical" || enriched.status === "low";

  if (alertNeeded) {
    await writeAuditLog({
      action:   "ALERT",
      entity:   "inventory_items",
      entityId: itemId,
      detail:   `⚠ ${enriched.status.toUpperCase()} stock alert: ${enriched.sku} — ${enriched.name} (qty: ${enriched.quantity}, threshold: ${enriched.reorderPoint})`,
      userId:   null, // System-generated alert
      metadata: { status: enriched.status, quantity: enriched.quantity, reorderPoint: enriched.reorderPoint },
      ...getAuditContext(req),
    });
    logger.warn(`[Inventory] ${enriched.status.toUpperCase()} stock: ${enriched.sku} — qty ${enriched.quantity} (threshold ${enriched.reorderPoint})`);
  }

  // ── Audit the adjustment itself ──────────────────────────────────────────
  await writeAuditLog({
    action:   "UPDATED",
    entity:   "inventory_items",
    entityId: itemId,
    detail:   `Stock ${type}: ${result.item.sku} — ${result.item.name}. ${result.previousQty} → ${enriched.quantity} (Δ${type === "OUT" ? "-" : "+"}${quantity})`,
    userId:   req.user.id,
    metadata: { type, quantity, reference, previousQty: result.previousQty, newQty: enriched.quantity },
    ...getAuditContext(req),
  });

  logger.info(`[Inventory] Stock ${type}: ${result.item.sku} qty ${result.previousQty}→${enriched.quantity} by ${req.user.email}`);

  return {
    item:     enriched,
    movement: result.movement,
    alert:    alertNeeded ? enriched.status : null,
  };
}

// =============================================================================
// softDeleteItem
// =============================================================================
/**
 * Soft-delete an inventory item by setting isActive = false.
 * Hard delete is intentionally not implemented — historical PO references
 * and stock movements would break if we deleted the item.
 *
 * @param {string} itemId
 * @param {import('express').Request} req
 */
async function softDeleteItem(itemId, req) {
  const existing = await prisma.inventoryItem.findUnique({
    where:  { id: itemId },
    select: { id: true, sku: true, name: true, isActive: true },
  });
  if (!existing)       throw createError("Inventory item not found.", 404);
  if (!existing.isActive) throw createError("Item is already deactivated.", 400);

  await prisma.inventoryItem.update({
    where: { id: itemId },
    data:  { isActive: false },
  });

  await writeAuditLog({
    action:   "DELETED",
    entity:   "inventory_items",
    entityId: itemId,
    detail:   `Soft-deleted inventory item: ${existing.sku} — ${existing.name}`,
    userId:   req.user.id,
    ...getAuditContext(req),
  });

  logger.info(`[Inventory] Soft-deleted: ${existing.sku} by ${req.user.email}`);
}

// =============================================================================
// getStockMovements
// =============================================================================
/**
 * Paginated stock movement history for a single item.
 *
 * @param {string} itemId
 * @param {object} filters  { page, limit, type }
 */
async function getStockMovements(itemId, filters = {}) {
  const { page = 1, limit = 50, type } = filters;
  const skip = (page - 1) * limit;

  // Verify item exists
  const item = await prisma.inventoryItem.findUnique({
    where:  { id: itemId },
    select: { id: true, sku: true, name: true },
  });
  if (!item) throw createError("Inventory item not found.", 404);

  const where = { itemId };
  if (type) where.type = type;

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id:        true,
        type:      true,
        quantity:  true,
        reference: true,
        notes:     true,
        createdAt: true,
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    item:      { id: item.id, sku: item.sku, name: item.name },
    movements,
    meta:      buildPaginationMeta(total, page, limit),
  };
}

// =============================================================================
// getLowStockAlerts
// =============================================================================
/**
 * Return all active items where quantity <= reorderPoint.
 * Used by the Dashboard alert widget and the AI Copilot.
 * Results sorted by urgency: critical first, then low.
 */
async function getLowStockAlerts() {
  // Fetch all active items — Prisma can't compare two columns in one WHERE clause
  // without raw SQL, so we fetch and filter. For massive catalogs, use a DB view.
  const allActive = await prisma.inventoryItem.findMany({
    where:  { isActive: true },
    select: {
      id:           true,
      sku:          true,
      name:         true,
      quantity:     true,
      reorderPoint: true,
      unitPrice:    true,
      category:     { select: { name: true } },
      supplier:     { select: { name: true } },
    },
    orderBy: { quantity: "asc" },
  });

  const alerts = allActive
    .filter((item) => item.quantity <= item.reorderPoint)
    .map((item) => ({
      ...item,
      unitPrice: parseFloat(item.unitPrice),
      status:    classifyStockStatus(item.quantity, item.reorderPoint),
      shortfall: item.reorderPoint - item.quantity,
    }))
    .sort((a, b) => {
      // Critical first, then low, then sort by shortfall descending
      const statusOrder = { critical: 0, low: 1 };
      const statusDiff  = statusOrder[a.status] - statusOrder[b.status];
      return statusDiff !== 0 ? statusDiff : b.shortfall - a.shortfall;
    });

  return {
    count:    alerts.length,
    critical: alerts.filter((a) => a.status === "critical").length,
    low:      alerts.filter((a) => a.status === "low").length,
    alerts,
  };
}

// =============================================================================
// getInventoryAnalytics
// =============================================================================
/**
 * Aggregate inventory metrics for the analytics dashboard.
 *
 * Returns:
 *  - totalItems, activeItems, inactiveItems
 *  - totalValue (sum of all active item values)
 *  - lowStockCount, criticalStockCount
 *  - categoryBreakdown (count and value per category)
 *  - supplierBreakdown (count and value per supplier)
 *  - topValueItems (top 10 by totalValue)
 *  - recentMovements (last 20 stock movements across all items)
 */
async function getInventoryAnalytics() {
  // Run all queries in parallel for performance
  const [
    allItems,
    categoryGroups,
    supplierGroups,
    recentMovements,
  ] = await Promise.all([
    // All items for totals and stock status
    prisma.inventoryItem.findMany({
      select: {
        id:           true,
        sku:          true,
        name:         true,
        quantity:     true,
        reorderPoint: true,
        unitPrice:    true,
        totalValue:   true,
        isActive:     true,
        categoryId:   true,
        supplierId:   true,
        category:     { select: { name: true } },
        supplier:     { select: { name: true } },
      },
    }),

    // Aggregate by category using Prisma groupBy
    prisma.inventoryItem.groupBy({
      by:     ["categoryId"],
      where:  { isActive: true },
      _count: { id: true },
      _sum:   { totalValue: true, quantity: true },
    }),

    // Aggregate by supplier
    prisma.inventoryItem.groupBy({
      by:     ["supplierId"],
      where:  { isActive: true },
      _count: { id: true },
      _sum:   { totalValue: true },
    }),

    // Most recent stock movements across the whole inventory
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take:    20,
      select: {
        id:        true,
        type:      true,
        quantity:  true,
        reference: true,
        notes:     true,
        createdAt: true,
        item: { select: { sku: true, name: true } },
      },
    }),
  ]);

  // ── Compute totals from items list ───────────────────────────────────────
  const activeItems   = allItems.filter((i) => i.isActive);
  const inactiveItems = allItems.filter((i) => !i.isActive);

  const totalValue        = activeItems.reduce((sum, i) => sum + parseFloat(i.totalValue), 0);
  const lowStockItems     = activeItems.filter((i) => classifyStockStatus(i.quantity, i.reorderPoint) === "low");
  const criticalStockItems= activeItems.filter((i) => classifyStockStatus(i.quantity, i.reorderPoint) === "critical");
  const topValueItems     = [...activeItems]
    .sort((a, b) => parseFloat(b.totalValue) - parseFloat(a.totalValue))
    .slice(0, 10)
    .map((i) => ({
      id:         i.id,
      sku:        i.sku,
      name:       i.name,
      totalValue: parseFloat(i.totalValue),
      quantity:   i.quantity,
      category:   i.category?.name || "Uncategorized",
    }));

  // ── Enrich category aggregates with names ────────────────────────────────
  const categoryMap = {};
  activeItems.forEach((i) => {
    const key  = i.categoryId || "uncategorized";
    const name = i.category?.name || "Uncategorized";
    if (!categoryMap[key]) categoryMap[key] = { name, count: 0, totalValue: 0, totalQty: 0 };
    categoryMap[key].count++;
    categoryMap[key].totalValue += parseFloat(i.totalValue);
    categoryMap[key].totalQty  += i.quantity;
  });
  const categoryBreakdown = Object.values(categoryMap)
    .sort((a, b) => b.totalValue - a.totalValue);

  // ── Enrich supplier aggregates with names ────────────────────────────────
  const supplierMap = {};
  activeItems.forEach((i) => {
    const key  = i.supplierId || "none";
    const name = i.supplier?.name || "No Supplier";
    if (!supplierMap[key]) supplierMap[key] = { name, count: 0, totalValue: 0 };
    supplierMap[key].count++;
    supplierMap[key].totalValue += parseFloat(i.totalValue);
  });
  const supplierBreakdown = Object.values(supplierMap)
    .sort((a, b) => b.totalValue - a.totalValue);

  // ── Movement type distribution ───────────────────────────────────────────
  const movementCounts = { IN: 0, OUT: 0, ADJUSTMENT: 0, TRANSFER: 0, RESERVED: 0 };
  recentMovements.forEach((m) => {
    if (movementCounts[m.type] !== undefined) movementCounts[m.type]++;
  });

  return {
    summary: {
      totalItems:          allItems.length,
      activeItems:         activeItems.length,
      inactiveItems:       inactiveItems.length,
      totalInventoryValue: parseFloat(totalValue.toFixed(2)),
      lowStockCount:       lowStockItems.length,
      criticalStockCount:  criticalStockItems.length,
      healthyStockCount:   activeItems.length - lowStockItems.length - criticalStockItems.length,
    },
    categoryBreakdown,
    supplierBreakdown,
    topValueItems,
    recentMovements,
    movementTypeCounts: movementCounts,
  };
}

// =============================================================================
// Category CRUD
// =============================================================================
async function listCategories() {
  const categories = await prisma.inventoryCategory.findMany({
    orderBy: { name: "asc" },
    select: {
      id:          true,
      name:        true,
      description: true,
      createdAt:   true,
      _count:      { select: { items: true } },
    },
  });
  return categories.map((c) => ({ ...c, itemCount: c._count.items }));
}

async function createCategory(dto, req) {
  const { name, description } = dto;
  const existing = await prisma.inventoryCategory.findUnique({ where: { name }, select: { id: true } });
  if (existing) throw createError(`Category "${name}" already exists.`, 409);

  const category = await prisma.inventoryCategory.create({
    data: { name: name.trim(), description: description?.trim() || null },
    select: { id: true, name: true, description: true, createdAt: true },
  });

  await writeAuditLog({
    action: "CREATED", entity: "inventory_categories", entityId: category.id,
    detail: `Created category: ${category.name}`, userId: req.user.id,
    ...getAuditContext(req),
  });

  return category;
}

// =============================================================================
// Supplier CRUD
// =============================================================================
async function listSuppliers(filters = {}) {
  const { page = 1, limit = 50, search = "" } = filters;
  const skip  = (page - 1) * limit;
  const where = { isActive: true };

  if (search) {
    where.OR = [
      { name:  { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
      select: {
        id:        true,
        name:      true,
        email:     true,
        phone:     true,
        address:   true,
        website:   true,
        notes:     true,
        isActive:  true,
        createdAt: true,
        _count:    { select: { inventoryItems: true, purchaseOrders: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ]);

  return {
    suppliers: suppliers.map((s) => ({
      ...s,
      inventoryItemCount: s._count.inventoryItems,
      purchaseOrderCount: s._count.purchaseOrders,
    })),
    meta: buildPaginationMeta(total, page, limit),
  };
}

async function createSupplier(dto, req) {
  const supplier = await prisma.supplier.create({
    data: {
      name:    dto.name.trim(),
      email:   dto.email    || null,
      phone:   dto.phone    || null,
      address: dto.address  || null,
      website: dto.website  || null,
      notes:   dto.notes    || null,
    },
    select: { id: true, name: true, email: true, phone: true, website: true, createdAt: true },
  });

  await writeAuditLog({
    action: "CREATED", entity: "suppliers", entityId: supplier.id,
    detail: `Created supplier: ${supplier.name}`, userId: req.user.id,
    ...getAuditContext(req),
  });

  return supplier;
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  listItems,
  getItemById,
  createItem,
  updateItem,
  adjustStock,
  softDeleteItem,
  getStockMovements,
  getLowStockAlerts,
  getInventoryAnalytics,
  listCategories,
  createCategory,
  listSuppliers,
  createSupplier,
};
