"use strict";

/**
 * src/controllers/inventory.controller.js
 *
 * Thin HTTP layer — extract, delegate, respond.
 * Zero business logic lives here; everything is in inventory.service.js.
 *
 * Controllers are responsible for:
 *  1. Extracting validated data from req.body / req.query / req.params
 *  2. Calling the service method
 *  3. Sending a standardized response via send.*
 *
 * express-async-errors ensures any thrown error is forwarded to the
 * global error handler without needing explicit try/catch blocks.
 */

const inventoryService = require("../services/inventory.service");
const { send }         = require("../utils/response");

// =============================================================================
// Inventory Items
// =============================================================================

/**
 * GET /api/inventory
 * List inventory items with filtering, search, sorting, and pagination.
 *
 * Query params:
 *   page, limit, search, categoryId, supplierId,
 *   status (all|ok|low|critical|inactive),
 *   sortBy, sortOrder, warehouseZone
 *
 * Response:
 * {
 *   success: true,
 *   data: [ { id, sku, name, quantity, reorderPoint, status, ... } ],
 *   meta: { total, page, limit, totalPages, hasNext, hasPrev }
 * }
 */
async function listItems(req, res) {
  const filters = {
    page:          req.query.page         || 1,
    limit:         req.query.limit        || 20,
    search:        req.query.search       || "",
    categoryId:    req.query.categoryId,
    supplierId:    req.query.supplierId,
    warehouseZone: req.query.warehouseZone,
    status:        req.query.status       || "all",
    sortBy:        req.query.sortBy       || "createdAt",
    sortOrder:     req.query.sortOrder    || "desc",
  };

  const { items, meta } = await inventoryService.listItems(filters);
  return send.paginated(res, items, meta, `${meta.total} inventory item(s) found.`);
}

/**
 * GET /api/inventory/:id
 * Fetch a single inventory item with full details.
 *
 * Response includes: item fields + category + supplier + last 10 stock movements
 */
async function getItemById(req, res) {
  const item = await inventoryService.getItemById(req.params.id);
  return send.ok(res, item, "Inventory item retrieved.");
}

/**
 * POST /api/inventory
 * Create a new inventory item.
 *
 * Body: { sku, name, description?, quantity, reorderPoint?,
 *         unitPrice, categoryId?, supplierId?, warehouseZone?,
 *         barcodeUrl?, imageUrl? }
 *
 * Response 201 with created item + opening stock movement if qty > 0.
 */
async function createItem(req, res) {
  const item = await inventoryService.createItem(req.body, req);
  return send.created(res, item, `Inventory item "${item.sku}" created successfully.`);
}

/**
 * PUT /api/inventory/:id
 * Update mutable fields of an inventory item.
 * SKU is immutable — rejected by the validator if present in body.
 * Quantity updates must go through POST /api/inventory/:id/adjust.
 */
async function updateItem(req, res) {
  const item = await inventoryService.updateItem(req.params.id, req.body, req);
  return send.ok(res, item, `Inventory item "${item.sku}" updated successfully.`);
}

/**
 * DELETE /api/inventory/:id
 * Soft-delete an inventory item (sets isActive = false).
 * Hard delete is not supported — historical records must be preserved.
 */
async function deleteItem(req, res) {
  await inventoryService.softDeleteItem(req.params.id, req);
  return send.ok(res, null, "Inventory item deactivated successfully.");
}

// =============================================================================
// Stock Adjustments
// =============================================================================

/**
 * POST /api/inventory/:id/adjust
 * Record a stock movement and update the item's quantity.
 *
 * Body: { type (IN|OUT|ADJUSTMENT|TRANSFER|RESERVED), quantity, reference?, notes? }
 *
 * Response includes the updated item, the movement record, and
 * an alert field ("critical" | "low" | null) if a threshold was crossed.
 *
 * Example — receive 20 units:
 * POST /api/inventory/item123/adjust
 * { "type": "IN", "quantity": 20, "reference": "PO-2024-007", "notes": "Received from Dell" }
 *
 * Example — issue 5 units to a team:
 * POST /api/inventory/item123/adjust
 * { "type": "OUT", "quantity": 5, "reference": "ISSUE-042", "notes": "Engineering team allocation" }
 *
 * Example — stock count correction:
 * POST /api/inventory/item123/adjust
 * { "type": "ADJUSTMENT", "quantity": 18, "notes": "Physical count — 2 units damaged" }
 */
async function adjustStock(req, res) {
  const result = await inventoryService.adjustStock(req.params.id, req.body, req);

  const message = result.alert
    ? `Stock ${req.body.type}. ⚠ ${result.alert.toUpperCase()} stock alert for ${result.item.sku}.`
    : `Stock ${req.body.type} recorded. New quantity: ${result.item.quantity}.`;

  return send.ok(res, result, message);
}

/**
 * GET /api/inventory/:id/movements
 * Paginated stock movement history for a single item.
 *
 * Query params: page, limit, type (filter by movement type)
 */
async function getStockMovements(req, res) {
  const filters = {
    page:  req.query.page  || 1,
    limit: req.query.limit || 50,
    type:  req.query.type,
  };

  const result = await inventoryService.getStockMovements(req.params.id, filters);
  return send.paginated(res, result.movements, result.meta, `Stock movements for ${result.item.sku}.`);
}

// =============================================================================
// Alerts & Analytics
// =============================================================================

/**
 * GET /api/inventory/alerts/low-stock
 * Return all items at or below their reorder threshold.
 * Sorted: critical first, then low; by shortfall descending within each group.
 *
 * Used by:
 *  - Dashboard alert widget
 *  - AI Copilot "what needs reordering?" queries
 */
async function getLowStockAlerts(req, res) {
  const result = await inventoryService.getLowStockAlerts();
  return send.ok(
    res,
    result,
    `${result.count} item(s) need attention (${result.critical} critical, ${result.low} low).`
  );
}

/**
 * GET /api/inventory/analytics
 * Comprehensive inventory analytics for the Analytics module.
 *
 * Returns:
 *  - summary: totals, value, stock health counts
 *  - categoryBreakdown: value and count per category
 *  - supplierBreakdown: value and count per supplier
 *  - topValueItems: top 10 by total inventory value
 *  - recentMovements: last 20 movements across all items
 *  - movementTypeCounts: IN/OUT/ADJUSTMENT distribution
 */
async function getInventoryAnalytics(req, res) {
  const analytics = await inventoryService.getInventoryAnalytics();
  return send.ok(res, analytics, "Inventory analytics retrieved.");
}

// =============================================================================
// Categories
// =============================================================================

/**
 * GET /api/inventory/categories
 * List all inventory categories with item counts.
 */
async function listCategories(req, res) {
  const categories = await inventoryService.listCategories();
  return send.ok(res, categories, `${categories.length} categories found.`);
}

/**
 * POST /api/inventory/categories
 * Create a new inventory category. ADMIN / MANAGER only.
 *
 * Body: { name, description? }
 */
async function createCategory(req, res) {
  const category = await inventoryService.createCategory(req.body, req);
  return send.created(res, category, `Category "${category.name}" created.`);
}

// =============================================================================
// Suppliers
// =============================================================================

/**
 * GET /api/inventory/suppliers
 * List all active suppliers with item and PO counts.
 *
 * Query params: page, limit, search
 */
async function listSuppliers(req, res) {
  const filters = {
    page:  req.query.page  || 1,
    limit: req.query.limit || 50,
    search:req.query.search|| "",
  };

  const { suppliers, meta } = await inventoryService.listSuppliers(filters);
  return send.paginated(res, suppliers, meta, `${meta.total} supplier(s) found.`);
}

/**
 * POST /api/inventory/suppliers
 * Create a new supplier. ADMIN / MANAGER only.
 *
 * Body: { name, email?, phone?, address?, website?, notes? }
 */
async function createSupplier(req, res) {
  const supplier = await inventoryService.createSupplier(req.body, req);
  return send.created(res, supplier, `Supplier "${supplier.name}" created.`);
}

module.exports = {
  listItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  adjustStock,
  getStockMovements,
  getLowStockAlerts,
  getInventoryAnalytics,
  listCategories,
  createCategory,
  listSuppliers,
  createSupplier,
};
