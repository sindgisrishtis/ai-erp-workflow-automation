"use strict";

/**
 * Purchase Order Routes
 * Mounted at: /api/purchase-orders
 *
 * Route registration order matters for Express pattern matching:
 *   Static routes (/analytics) must be registered BEFORE dynamic routes (/:id)
 *
 * RBAC matrix:
 *   List POs             → Any authenticated role
 *   Get PO by ID         → Any authenticated role
 *   Get PO Analytics     → ADMIN, MANAGER, FINANCE
 *   Create PO (draft)    → Any authenticated role (EMPLOYEE, HR, FINANCE, MANAGER, ADMIN)
 *   Update PO (draft)    → Creator or ADMIN (enforced in service layer)
 *   Submit PO            → Creator or ADMIN (enforced in service layer)
 *   Process Approval     → MANAGER, ADMIN (RECALLED: creator or ADMIN — enforced in service)
 *   Complete PO          → MANAGER, ADMIN
 *   Cancel PO            → Creator or ADMIN (enforced in service layer)
 *   Get PO Approvals     → Any authenticated role
 */

const { Router } = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/auth.middleware");
const poController = require("../controllers/purchaseOrder.controller");
const {
  validateListPOs,
  validateGetPO,
  validateCreatePO,
  validateUpdatePO,
  validateSubmitPO,
  validateApprovePO,
  validateCompletePO,
  validateCancelPO,
  validateGetApprovals,
  validatePOAnalytics,
} = require("../validators/purchaseOrder.validator");

const router = Router();

// ---------------------------------------------------------------------------
// Static routes — must come before /:id to avoid Express shadowing
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/analytics
 * Purchase order aggregation: spend trends, status breakdown, top suppliers
 */
router.get(
  "/analytics",
  requireAuth,
  authorizeRoles("ADMIN", "MANAGER", "FINANCE"),
  validatePOAnalytics,
  poController.getPOAnalytics
);

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders
 * Paginated list with filters: status, supplier, creator, date range, search
 */
router.get(
  "/",
  requireAuth,
  validateListPOs,
  poController.listPOs
);

/**
 * POST /api/purchase-orders
 * Create a new DRAFT purchase order with line items
 * Any authenticated user can initiate a PO
 */
router.post(
  "/",
  requireAuth,
  validateCreatePO,
  poController.createPO
);

// ---------------------------------------------------------------------------
// Single resource routes — dynamic :id segment
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/:id
 * Full PO detail: header, line items, approval history, supplier, creator
 */
router.get(
  "/:id",
  requireAuth,
  validateGetPO,
  poController.getPOById
);

/**
 * PUT /api/purchase-orders/:id
 * Update a DRAFT PO's metadata and/or replace its line items
 * Creator or ADMIN only (enforced in service)
 */
router.put(
  "/:id",
  requireAuth,
  validateUpdatePO,
  poController.updatePO
);

// ---------------------------------------------------------------------------
// State machine action routes — POST per action (REST action pattern)
// ---------------------------------------------------------------------------

/**
 * POST /api/purchase-orders/:id/submit
 * Transition DRAFT → PENDING_APPROVAL
 * Creator or ADMIN only (enforced in service)
 */
router.post(
  "/:id/submit",
  requireAuth,
  validateSubmitPO,
  poController.submitPO
);

/**
 * POST /api/purchase-orders/:id/approve
 * Record an approval action: APPROVED | REJECTED | ESCALATED | RECALLED
 * Route-level: any authenticated user (fine-grained RBAC in service for each action)
 * APPROVED / REJECTED / ESCALATED: MANAGER or ADMIN
 * RECALLED: creator or ADMIN
 */
router.post(
  "/:id/approve",
  requireAuth,
  validateApprovePO,
  poController.processApproval
);

/**
 * POST /api/purchase-orders/:id/complete
 * Transition APPROVED → COMPLETED + trigger stock IN movements
 * MANAGER or ADMIN only
 */
router.post(
  "/:id/complete",
  requireAuth,
  authorizeRoles("MANAGER", "ADMIN"),
  validateCompletePO,
  poController.completePO
);

/**
 * POST /api/purchase-orders/:id/cancel
 * Cancel a DRAFT or PENDING_APPROVAL PO → REJECTED
 * Creator or ADMIN only (enforced in service)
 */
router.post(
  "/:id/cancel",
  requireAuth,
  validateCancelPO,
  poController.cancelPO
);

// ---------------------------------------------------------------------------
// Sub-resource routes
// ---------------------------------------------------------------------------

/**
 * GET /api/purchase-orders/:id/approvals
 * Full approval history for a single PO (immutable audit trail)
 */
router.get(
  "/:id/approvals",
  requireAuth,
  validateGetApprovals,
  poController.getPOApprovals
);

module.exports = router;
