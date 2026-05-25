"use strict";

const { validationResult } = require("express-validator");
const poService = require("../services/purchaseOrder.service");
const { sendSuccess, sendCreated, sendPaginated, sendNoContent, createError } = require("../utils/response");
const { extractAuditContext } = require("../utils/audit");

// ---------------------------------------------------------------------------
// Validation helper — identical pattern to auth.controller.js and inventory.controller.js
// ---------------------------------------------------------------------------

function checkValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = createError("Validation failed", 422);
    err.errors = errors.array();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// listPOs
// GET /api/purchase-orders
// ---------------------------------------------------------------------------

async function listPOs(req, res) {
  checkValidation(req);

  const filters = {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    supplierId: req.query.supplierId,
    creatorId: req.query.creatorId,
    search: req.query.search,
    sortBy: req.query.sortBy,
    sortOrder: req.query.sortOrder,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  };

  const auditCtx = extractAuditContext(req);
  const result = await poService.listPOs(filters, auditCtx);

  return sendPaginated(res, result.items, result.pagination);
}

// ---------------------------------------------------------------------------
// getPOById
// GET /api/purchase-orders/:id
// ---------------------------------------------------------------------------

async function getPOById(req, res) {
  checkValidation(req);
  const po = await poService.getPOById(req.params.id);
  return sendSuccess(res, po);
}

// ---------------------------------------------------------------------------
// createPO
// POST /api/purchase-orders
// ---------------------------------------------------------------------------

async function createPO(req, res) {
  checkValidation(req);

  const { supplierId, notes, items } = req.body;
  const auditCtx = extractAuditContext(req);

  const po = await poService.createPO(
    { supplierId, notes, items },
    req.user.id,
    auditCtx
  );

  return sendCreated(res, po, "Purchase order created successfully");
}

// ---------------------------------------------------------------------------
// updatePO
// PUT /api/purchase-orders/:id
// ---------------------------------------------------------------------------

async function updatePO(req, res) {
  checkValidation(req);

  const { supplierId, notes, items } = req.body;
  const auditCtx = {
    ...extractAuditContext(req),
    userRole: req.user.role,
  };

  const po = await poService.updatePO(
    req.params.id,
    { supplierId, notes, items },
    req.user.id,
    auditCtx
  );

  return sendSuccess(res, po, "Purchase order updated successfully");
}

// ---------------------------------------------------------------------------
// submitPO
// POST /api/purchase-orders/:id/submit
// ---------------------------------------------------------------------------

async function submitPO(req, res) {
  checkValidation(req);

  const auditCtx = {
    ...extractAuditContext(req),
    userRole: req.user.role,
  };

  const po = await poService.submitPO(req.params.id, req.user.id, auditCtx);

  return sendSuccess(res, po, "Purchase order submitted for approval");
}

// ---------------------------------------------------------------------------
// processApproval
// POST /api/purchase-orders/:id/approve
// ---------------------------------------------------------------------------

async function processApproval(req, res) {
  checkValidation(req);

  const { action, comment } = req.body;
  const auditCtx = extractAuditContext(req);

  const po = await poService.processApproval(
    req.params.id,
    { action, comment },
    req.user,    // full user object — service needs role + id
    auditCtx
  );

  const messages = {
    APPROVED: "Purchase order approved successfully",
    REJECTED: "Purchase order rejected",
    ESCALATED: "Purchase order escalated for further review",
    RECALLED: "Purchase order recalled to draft",
  };

  return sendSuccess(res, po, messages[action] || "Approval action recorded");
}

// ---------------------------------------------------------------------------
// completePO
// POST /api/purchase-orders/:id/complete
// ---------------------------------------------------------------------------

async function completePO(req, res) {
  checkValidation(req);

  const { notes } = req.body;
  const auditCtx = extractAuditContext(req);

  const po = await poService.completePO(
    req.params.id,
    { notes },
    req.user,
    auditCtx
  );

  return sendSuccess(res, po, "Purchase order completed. Inventory updated with received stock.");
}

// ---------------------------------------------------------------------------
// cancelPO
// POST /api/purchase-orders/:id/cancel
// ---------------------------------------------------------------------------

async function cancelPO(req, res) {
  checkValidation(req);

  const { reason } = req.body;
  const auditCtx = extractAuditContext(req);

  const po = await poService.cancelPO(
    req.params.id,
    { reason },
    req.user,
    auditCtx
  );

  return sendSuccess(res, po, "Purchase order cancelled");
}

// ---------------------------------------------------------------------------
// getPOApprovals
// GET /api/purchase-orders/:id/approvals
// ---------------------------------------------------------------------------

async function getPOApprovals(req, res) {
  checkValidation(req);
  const approvals = await poService.getPOApprovals(req.params.id);
  return sendSuccess(res, approvals);
}

// ---------------------------------------------------------------------------
// getPOAnalytics
// GET /api/purchase-orders/analytics
// ---------------------------------------------------------------------------

async function getPOAnalytics(req, res) {
  checkValidation(req);

  const filters = {
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  };

  const analytics = await poService.getPOAnalytics(filters);
  return sendSuccess(res, analytics);
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
