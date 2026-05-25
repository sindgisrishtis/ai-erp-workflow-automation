"use strict";

const prisma = require("../config/prisma");
const { createError } = require("../utils/response");
const { writeAuditLog } = require("../utils/audit");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a sequential PO number in the format PO-YYYY-NNNN.
 * Uses a COUNT of all POs (including soft-rejected) to guarantee uniqueness.
 * Runs inside the caller's transaction if one is provided.
 */
async function generatePoNumber(tx = prisma) {
  const year = new Date().getFullYear();
  const count = await tx.purchaseOrder.count();
  const sequence = String(count + 1).padStart(4, "0");
  return `PO-${year}-${sequence}`;
}

/**
 * Calculate the total amount for a set of line item inputs.
 * @param {Array<{quantity: number, unitPrice: number}>} items
 * @returns {number}
 */
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/**
 * Fetch a PO by id and throw 404 if not found.
 * Optionally includes relations.
 */
async function findPoOrThrow(id, include = {}) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include,
  });
  if (!po) {
    throw createError("Purchase order not found", 404);
  }
  return po;
}

/**
 * Assert that the PO is in one of the allowed statuses.
 * Throws 409 Conflict if the current status is not in the allowed list.
 */
function assertStatus(po, allowedStatuses, action) {
  if (!allowedStatuses.includes(po.status)) {
    throw createError(
      `Cannot ${action} a purchase order with status '${po.status}'. ` +
        `Allowed statuses: ${allowedStatuses.join(", ")}.`,
      409
    );
  }
}

// ---------------------------------------------------------------------------
// listPOs
// ---------------------------------------------------------------------------

/**
 * Return a paginated, filtered, sorted list of purchase orders.
 *
 * @param {object} filters
 * @param {object} auditCtx  — { userId, ipAddress }
 */
async function listPOs(filters, auditCtx) {
  const {
    page = 1,
    limit = 20,
    status,
    supplierId,
    creatorId,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    dateFrom,
    dateTo,
  } = filters;

  const skip = (page - 1) * limit;

  // Build the where clause
  const where = {};

  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;
  if (creatorId) where.creatorId = creatorId;

  if (search) {
    where.OR = [
      { poNumber: { contains: search, mode: "insensitive" } },
      {
        supplier: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [total, items] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        supplier: {
          select: { id: true, name: true, email: true },
        },
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { items: true, approvals: true },
        },
      },
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
}

// ---------------------------------------------------------------------------
// getPOById
// ---------------------------------------------------------------------------

/**
 * Return a single PO with full detail: line items, approval history, supplier,
 * creator, and approver profiles.
 */
async function getPOById(id) {
  const po = await findPoOrThrow(id, {
    supplier: {
      select: { id: true, name: true, email: true, phone: true },
    },
    creator: {
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    },
    items: {
      include: {
        inventoryItem: {
          select: { id: true, sku: true, name: true, warehouseZone: true },
        },
      },
      orderBy: { id: "asc" },
    },
    approvals: {
      include: {
        approver: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    },
  });

  return po;
}

// ---------------------------------------------------------------------------
// createPO
// ---------------------------------------------------------------------------

/**
 * Create a new purchase order in DRAFT status.
 * All line items are created atomically with the PO.
 *
 * @param {object} data        — { supplierId?, notes?, items[] }
 * @param {string} creatorId   — authenticated user id
 * @param {object} auditCtx    — { userId, ipAddress, userAgent }
 */
async function createPO(data, creatorId, auditCtx) {
  const { supplierId, notes, items } = data;

  // Validate supplier exists if provided
  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw createError("Supplier not found", 404);
    if (!supplier.isActive) throw createError("Supplier is inactive", 422);
  }

  // Validate all inventory items exist and are active
  const inventoryItemIds = items.map((i) => i.inventoryItemId);
  const foundItems = await prisma.inventoryItem.findMany({
    where: { id: { in: inventoryItemIds } },
    select: { id: true, name: true, unitPrice: true, isActive: true },
  });

  if (foundItems.length !== inventoryItemIds.length) {
    const foundIds = new Set(foundItems.map((i) => i.id));
    const missing = inventoryItemIds.filter((id) => !foundIds.has(id));
    throw createError(`Inventory item(s) not found: ${missing.join(", ")}`, 404);
  }

  const inactiveItems = foundItems.filter((i) => !i.isActive);
  if (inactiveItems.length > 0) {
    throw createError(
      `Inventory item(s) are inactive: ${inactiveItems.map((i) => i.name).join(", ")}`,
      422
    );
  }

  // Build a lookup map for item names (use provided itemName or fall back to DB name)
  const itemNameMap = Object.fromEntries(foundItems.map((i) => [i.id, i.name]));

  // Enrich line items and compute total
  const enrichedItems = items.map((item) => ({
    inventoryItemId: item.inventoryItemId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
    itemName: item.itemName || itemNameMap[item.inventoryItemId],
  }));

  const totalAmount = calculateTotal(enrichedItems.map((i) => ({
    quantity: i.quantity,
    unitPrice: i.unitPrice,
  })));

  // Execute atomically
  const po = await prisma.$transaction(async (tx) => {
    const poNumber = await generatePoNumber(tx);

    const created = await tx.purchaseOrder.create({
      data: {
        poNumber,
        status: "DRAFT",
        totalAmount,
        notes: notes || null,
        creatorId,
        supplierId: supplierId || null,
        items: {
          create: enrichedItems,
        },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return created;
  });

  await writeAuditLog({
    action: "CREATED",
    entity: "PurchaseOrder",
    entityId: po.id,
    detail: `Created PO ${po.poNumber} with ${items.length} line item(s). Total: $${totalAmount.toFixed(2)}`,
    ...auditCtx,
  });

  return po;
}

// ---------------------------------------------------------------------------
// updatePO
// ---------------------------------------------------------------------------

/**
 * Update a DRAFT purchase order's metadata and/or replace all its line items.
 * Replacing items: existing items are deleted and new ones inserted in one transaction.
 *
 * @param {string} id
 * @param {object} data        — { supplierId?, notes?, items? }
 * @param {string} requesterId — authenticated user id
 * @param {object} auditCtx
 */
async function updatePO(id, data, requesterId, auditCtx) {
  const po = await findPoOrThrow(id);

  assertStatus(po, ["DRAFT"], "update");

  // Only the creator or ADMIN can update a draft
  if (po.creatorId !== requesterId && auditCtx.userRole !== "ADMIN") {
    throw createError("You are not authorized to update this purchase order", 403);
  }

  const { supplierId, notes, items } = data;
  const updateData = {};

  if (supplierId !== undefined) {
    if (supplierId !== null) {
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw createError("Supplier not found", 404);
      if (!supplier.isActive) throw createError("Supplier is inactive", 422);
    }
    updateData.supplierId = supplierId;
  }

  if (notes !== undefined) updateData.notes = notes;

  let updatedPO;

  if (items && items.length > 0) {
    // Validate new items
    const inventoryItemIds = items.map((i) => i.inventoryItemId);
    const foundItems = await prisma.inventoryItem.findMany({
      where: { id: { in: inventoryItemIds } },
      select: { id: true, name: true, isActive: true },
    });

    if (foundItems.length !== inventoryItemIds.length) {
      const foundIds = new Set(foundItems.map((i) => i.id));
      const missing = inventoryItemIds.filter((id) => !foundIds.has(id));
      throw createError(`Inventory item(s) not found: ${missing.join(", ")}`, 404);
    }

    const inactiveItems = foundItems.filter((i) => !i.isActive);
    if (inactiveItems.length > 0) {
      throw createError(
        `Inventory item(s) are inactive: ${inactiveItems.map((i) => i.name).join(", ")}`,
        422
      );
    }

    const itemNameMap = Object.fromEntries(foundItems.map((i) => [i.id, i.name]));
    const enrichedItems = items.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
      itemName: item.itemName || itemNameMap[item.inventoryItemId],
    }));

    const newTotal = calculateTotal(enrichedItems.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })));

    updatedPO = await prisma.$transaction(async (tx) => {
      // Delete existing line items and recreate
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...updateData,
          totalAmount: newTotal,
          items: { create: enrichedItems },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          items: true,
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  } else {
    updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true } },
        items: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  await writeAuditLog({
    action: "UPDATED",
    entity: "PurchaseOrder",
    entityId: id,
    detail: `Updated PO ${updatedPO.poNumber}`,
    ...auditCtx,
  });

  return updatedPO;
}

// ---------------------------------------------------------------------------
// submitPO
// ---------------------------------------------------------------------------

/**
 * Transition a DRAFT PO to PENDING_APPROVAL.
 * Validates that the PO has at least one line item before submission.
 *
 * @param {string} id
 * @param {string} requesterId
 * @param {object} auditCtx
 */
async function submitPO(id, requesterId, auditCtx) {
  const po = await findPoOrThrow(id, {
    items: { select: { id: true } },
  });

  assertStatus(po, ["DRAFT"], "submit");

  // Only the creator or ADMIN can submit
  if (po.creatorId !== requesterId && auditCtx.userRole !== "ADMIN") {
    throw createError("You are not authorized to submit this purchase order", 403);
  }

  if (po.items.length === 0) {
    throw createError(
      "Cannot submit a purchase order with no line items. Add at least one item first.",
      422
    );
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: "PENDING_APPROVAL",
      submittedAt: new Date(),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      creator: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await writeAuditLog({
    action: "SUBMITTED",
    entity: "PurchaseOrder",
    entityId: id,
    detail: `Submitted PO ${updated.poNumber} for approval. Total: $${parseFloat(updated.totalAmount).toFixed(2)}`,
    ...auditCtx,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// processApproval
// ---------------------------------------------------------------------------

/**
 * Record an approval action against a PO in PENDING_APPROVAL status.
 *
 * - APPROVED  → transitions status to APPROVED
 * - REJECTED  → transitions status to REJECTED
 * - RECALLED  → transitions status back to DRAFT (creator takes it back)
 * - ESCALATED → status remains PENDING_APPROVAL, logged for audit trail
 *
 * RECALLED can only be performed by the PO creator or ADMIN.
 * APPROVED / REJECTED / ESCALATED requires MANAGER or ADMIN role.
 *
 * @param {string} id
 * @param {object} data        — { action, comment? }
 * @param {object} approver    — full user object from requireAuth
 * @param {object} auditCtx
 */
async function processApproval(id, data, approver, auditCtx) {
  const { action, comment } = data;

  const po = await findPoOrThrow(id, {
    items: { select: { id: true } },
    creator: { select: { id: true } },
  });

  // RECALLED is a special case — creator or ADMIN only, from PENDING_APPROVAL
  if (action === "RECALLED") {
    if (po.creatorId !== approver.id && approver.role !== "ADMIN") {
      throw createError(
        "Only the purchase order creator or an ADMIN can recall a pending order",
        403
      );
    }
    assertStatus(po, ["PENDING_APPROVAL"], "recall");
  } else {
    // APPROVED, REJECTED, ESCALATED — MANAGER or ADMIN role required
    if (!["MANAGER", "ADMIN"].includes(approver.role)) {
      throw createError(
        "Only MANAGER or ADMIN users can approve, reject, or escalate purchase orders",
        403
      );
    }
    assertStatus(po, ["PENDING_APPROVAL"], action.toLowerCase());

    // Prevent the creator from approving their own PO (unless ADMIN)
    if (po.creatorId === approver.id && approver.role !== "ADMIN") {
      throw createError(
        "You cannot approve a purchase order you created. An independent approver is required.",
        403
      );
    }
  }

  // Determine the new PO status based on the action
  const statusMap = {
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    RECALLED: "DRAFT",
    ESCALATED: "PENDING_APPROVAL", // Status unchanged — escalated for higher review
  };
  const newStatus = statusMap[action];

  const [approval] = await prisma.$transaction([
    // Immutable approval record
    prisma.purchaseOrderApproval.create({
      data: {
        orderId: id,
        approverId: approver.id,
        action,
        comment: comment || null,
      },
    }),
    // Update PO status
    prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        ...(action === "APPROVED" && { approvedAt: new Date() }),
        ...(action === "REJECTED" && { rejectedAt: new Date() }),
        ...(action === "RECALLED" && { submittedAt: null }),
      },
    }),
  ]);

  // Re-fetch the updated PO for the response
  const updatedPO = await getPOById(id);

  const auditAction = action === "APPROVED"
    ? "APPROVED"
    : action === "REJECTED"
    ? "REJECTED"
    : action === "ESCALATED"
    ? "ESCALATED"
    : "RECALLED";

  await writeAuditLog({
    action: auditAction,
    entity: "PurchaseOrder",
    entityId: id,
    detail: `${action} PO ${updatedPO.poNumber}${comment ? `: "${comment}"` : ""}`,
    ...auditCtx,
  });

  return updatedPO;
}

// ---------------------------------------------------------------------------
// completePO
// ---------------------------------------------------------------------------

/**
 * Transition an APPROVED PO to COMPLETED.
 * Triggers stock IN movements for every line item — atomically.
 *
 * Only MANAGER or ADMIN can mark a PO as completed (goods received).
 *
 * @param {string} id
 * @param {object} data       — { notes? }
 * @param {object} requester  — full user object
 * @param {object} auditCtx
 */
async function completePO(id, data, requester, auditCtx) {
  const { notes } = data;

  if (!["MANAGER", "ADMIN"].includes(requester.role)) {
    throw createError(
      "Only MANAGER or ADMIN users can mark a purchase order as completed",
      403
    );
  }

  const po = await findPoOrThrow(id, {
    items: {
      include: {
        inventoryItem: { select: { id: true, name: true, quantity: true, unitPrice: true } },
      },
    },
  });

  assertStatus(po, ["APPROVED"], "complete");

  if (po.items.length === 0) {
    throw createError("Cannot complete a purchase order with no line items", 422);
  }

  // Atomic transaction:
  // 1. Mark PO as COMPLETED
  // 2. For each line item: create a stock IN movement + update inventory quantity + recalculate totalValue
  const updatedPO = await prisma.$transaction(async (tx) => {
    // Update PO status
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        ...(notes && { notes }),
      },
    });

    // Process stock movements for each line item
    for (const lineItem of po.items) {
      const { inventoryItem } = lineItem;
      const newQuantity = inventoryItem.quantity + lineItem.quantity;

      // Update inventory quantity and recalculate denormalized totalValue
      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          quantity: newQuantity,
          totalValue: newQuantity * parseFloat(inventoryItem.unitPrice),
          updatedAt: new Date(),
        },
      });

      // Immutable stock movement record
      await tx.stockMovement.create({
        data: {
          itemId: inventoryItem.id,
          type: "IN",
          quantity: lineItem.quantity,          // positive — stock coming in
          reference: po.poNumber,
          notes: `Stock received via ${po.poNumber}${notes ? ` — ${notes}` : ""}`,
        },
      });
    }

    return tx.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, sku: true, name: true } },
          },
        },
        approvals: {
          include: {
            approver: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  await writeAuditLog({
    action: "COMPLETED",
    entity: "PurchaseOrder",
    entityId: id,
    detail: `Completed PO ${updatedPO.poNumber}. Stock IN movements created for ${po.items.length} item(s).`,
    ...auditCtx,
  });

  return updatedPO;
}

// ---------------------------------------------------------------------------
// cancelPO
// ---------------------------------------------------------------------------

/**
 * Cancel a DRAFT or PENDING_APPROVAL PO (creator or ADMIN).
 * Internally records a REJECTED status — no distinct "CANCELLED" state in the schema.
 * A cancellation approval record is written for audit trail completeness.
 *
 * @param {string} id
 * @param {object} data       — { reason? }
 * @param {object} requester  — full user object
 * @param {object} auditCtx
 */
async function cancelPO(id, data, requester, auditCtx) {
  const { reason } = data;

  const po = await findPoOrThrow(id, {
    creator: { select: { id: true } },
  });

  assertStatus(po, ["DRAFT", "PENDING_APPROVAL"], "cancel");

  if (po.creatorId !== requester.id && requester.role !== "ADMIN") {
    throw createError(
      "Only the purchase order creator or an ADMIN can cancel a purchase order",
      403
    );
  }

  const updatedPO = await prisma.$transaction(async (tx) => {
    // Write cancellation record for audit trail if PO was in PENDING_APPROVAL
    if (po.status === "PENDING_APPROVAL") {
      await tx.purchaseOrderApproval.create({
        data: {
          orderId: id,
          approverId: requester.id,
          action: "RECALLED",
          comment: reason ? `Cancelled: ${reason}` : "Cancelled by requester",
        },
      });
    }

    return tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  });

  await writeAuditLog({
    action: "REJECTED",
    entity: "PurchaseOrder",
    entityId: id,
    detail: `Cancelled PO ${updatedPO.poNumber}${reason ? `: "${reason}"` : ""}`,
    ...auditCtx,
  });

  return updatedPO;
}

// ---------------------------------------------------------------------------
// getPOApprovals
// ---------------------------------------------------------------------------

/**
 * Return the complete approval history for a single PO.
 */
async function getPOApprovals(id) {
  // Verify PO exists first
  await findPoOrThrow(id);

  const approvals = await prisma.purchaseOrderApproval.findMany({
    where: { orderId: id },
    include: {
      approver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          department: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return approvals;
}

// ---------------------------------------------------------------------------
// getPOAnalytics
// ---------------------------------------------------------------------------

/**
 * Aggregated analytics for the purchase orders module.
 * Returns:
 *   - Total PO count + breakdown by status
 *   - Total spend (COMPLETED POs only)
 *   - Average PO value
 *   - Monthly spend trend (last 12 months)
 *   - Top 5 suppliers by spend
 *
 * @param {object} filters — { dateFrom?, dateTo? }
 */
async function getPOAnalytics(filters = {}) {
  const { dateFrom, dateTo } = filters;

  const dateFilter = {};
  if (dateFrom) dateFilter.gte = new Date(dateFrom);
  if (dateTo) dateFilter.lte = new Date(dateTo);
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const baseWhere = hasDateFilter ? { createdAt: dateFilter } : {};

  // ── Status breakdown ──────────────────────────────────────────────────────
  const statusBreakdown = await prisma.purchaseOrder.groupBy({
    by: ["status"],
    where: baseWhere,
    _count: { id: true },
    _sum: { totalAmount: true },
  });

  const statusMap = Object.fromEntries(
    statusBreakdown.map((row) => [
      row.status,
      {
        count: row._count.id,
        totalAmount: parseFloat(row._sum.totalAmount || 0),
      },
    ])
  );

  // ── Total spend (COMPLETED only) ──────────────────────────────────────────
  const completedAgg = await prisma.purchaseOrder.aggregate({
    where: { ...baseWhere, status: "COMPLETED" },
    _sum: { totalAmount: true },
    _avg: { totalAmount: true },
    _count: { id: true },
  });

  // ── Monthly spend trend — last 12 months ─────────────────────────────────
  // We use raw Prisma date functions via groupBy on completedAt month
  // Fallback: client-side aggregation from raw records (safer across DB versions)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const completedPOs = await prisma.purchaseOrder.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: twelveMonthsAgo },
    },
    select: { completedAt: true, totalAmount: true },
  });

  // Group by YYYY-MM in JavaScript (avoids raw SQL for cross-DB portability)
  const monthlyTrend = {};
  for (const po of completedPOs) {
    if (!po.completedAt) continue;
    const key = po.completedAt.toISOString().slice(0, 7); // "YYYY-MM"
    if (!monthlyTrend[key]) monthlyTrend[key] = { month: key, spend: 0, count: 0 };
    monthlyTrend[key].spend += parseFloat(po.totalAmount);
    monthlyTrend[key].count += 1;
  }
  const trendArray = Object.values(monthlyTrend).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // ── Top 5 suppliers by spend (COMPLETED POs) ──────────────────────────────
  const topSupplierRows = await prisma.purchaseOrder.groupBy({
    by: ["supplierId"],
    where: {
      ...baseWhere,
      status: "COMPLETED",
      supplierId: { not: null },
    },
    _sum: { totalAmount: true },
    _count: { id: true },
    orderBy: { _sum: { totalAmount: "desc" } },
    take: 5,
  });

  // Hydrate supplier names
  const supplierIds = topSupplierRows.map((r) => r.supplierId).filter(Boolean);
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: supplierIds } },
    select: { id: true, name: true },
  });
  const supplierNameMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const topSuppliers = topSupplierRows.map((row) => ({
    supplierId: row.supplierId,
    supplierName: supplierNameMap[row.supplierId] || "Unknown",
    totalSpend: parseFloat(row._sum.totalAmount || 0),
    orderCount: row._count.id,
  }));

  // ── Pending approval workload ─────────────────────────────────────────────
  const pendingCount = await prisma.purchaseOrder.count({
    where: { status: "PENDING_APPROVAL" },
  });

  return {
    summary: {
      totalOrders: statusBreakdown.reduce((sum, r) => sum + r._count.id, 0),
      totalSpend: parseFloat(completedAgg._sum.totalAmount || 0),
      averageOrderValue: parseFloat(completedAgg._avg.totalAmount || 0),
      completedOrders: completedAgg._count.id,
      pendingApprovalCount: pendingCount,
    },
    statusBreakdown: statusMap,
    monthlySpendTrend: trendArray,
    topSuppliers,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listPOs,
  getPOById,
  createPO,
  updatePO,
  submitPO,
  processApproval,
  completePO,
  cancelPO,
  getPOApprovals,
  getPOAnalytics,
};
