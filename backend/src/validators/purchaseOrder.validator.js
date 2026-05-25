"use strict";

const { body, param, query } = require("express-validator");

// ---------------------------------------------------------------------------
// Reusable field rules
// ---------------------------------------------------------------------------

const validPoStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "COMPLETED", "REJECTED"];
const validApprovalActions = ["APPROVED", "REJECTED", "ESCALATED", "RECALLED"];
const validSortFields = ["createdAt", "updatedAt", "totalAmount", "poNumber", "status"];
const validSortOrders = ["asc", "desc"];

// ---------------------------------------------------------------------------
// validateListPOs
// GET /api/purchase-orders
// ---------------------------------------------------------------------------
const validateListPOs = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100")
    .toInt(),

  query("status")
    .optional()
    .isIn(validPoStatuses)
    .withMessage(`status must be one of: ${validPoStatuses.join(", ")}`),

  query("supplierId")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("supplierId must be a non-empty string"),

  query("creatorId")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("creatorId must be a non-empty string"),

  query("search")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("search must be 100 characters or fewer"),

  query("sortBy")
    .optional()
    .isIn(validSortFields)
    .withMessage(`sortBy must be one of: ${validSortFields.join(", ")}`),

  query("sortOrder")
    .optional()
    .isIn(validSortOrders)
    .withMessage("sortOrder must be 'asc' or 'desc'"),

  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),

  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
];

// ---------------------------------------------------------------------------
// validateGetPO
// GET /api/purchase-orders/:id
// ---------------------------------------------------------------------------
const validateGetPO = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),
];

// ---------------------------------------------------------------------------
// validateCreatePO
// POST /api/purchase-orders
// ---------------------------------------------------------------------------
const validateCreatePO = [
  body("supplierId")
    .optional({ nullable: true })
    .isString()
    .trim()
    .notEmpty()
    .withMessage("supplierId must be a non-empty string if provided"),

  body("notes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("notes must be 2000 characters or fewer"),

  body("items")
    .isArray({ min: 1 })
    .withMessage("items must be a non-empty array"),

  body("items.*.inventoryItemId")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("each item must have a valid inventoryItemId"),

  body("items.*.quantity")
    .isInt({ min: 1 })
    .withMessage("each item quantity must be a positive integer")
    .toInt(),

  body("items.*.unitPrice")
    .isFloat({ min: 0 })
    .withMessage("each item unitPrice must be a non-negative number")
    .toFloat(),

  body("items.*.itemName")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage("itemName must be 255 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateUpdatePO
// PUT /api/purchase-orders/:id
// Only allowed while PO is in DRAFT status
// ---------------------------------------------------------------------------
const validateUpdatePO = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),

  body("supplierId")
    .optional({ nullable: true })
    .isString()
    .trim()
    .notEmpty()
    .withMessage("supplierId must be a non-empty string if provided"),

  body("notes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("notes must be 2000 characters or fewer"),

  body("items")
    .optional()
    .isArray({ min: 1 })
    .withMessage("items must be a non-empty array if provided"),

  body("items.*.inventoryItemId")
    .if(body("items").exists())
    .isString()
    .trim()
    .notEmpty()
    .withMessage("each item must have a valid inventoryItemId"),

  body("items.*.quantity")
    .if(body("items").exists())
    .isInt({ min: 1 })
    .withMessage("each item quantity must be a positive integer")
    .toInt(),

  body("items.*.unitPrice")
    .if(body("items").exists())
    .isFloat({ min: 0 })
    .withMessage("each item unitPrice must be a non-negative number")
    .toFloat(),

  body("items.*.itemName")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage("itemName must be 255 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateSubmitPO
// POST /api/purchase-orders/:id/submit
// Transitions DRAFT → PENDING_APPROVAL
// ---------------------------------------------------------------------------
const validateSubmitPO = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),
];

// ---------------------------------------------------------------------------
// validateApprovePO
// POST /api/purchase-orders/:id/approve
// Records an ApprovalAction against the PO
// ---------------------------------------------------------------------------
const validateApprovePO = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),

  body("action")
    .isIn(validApprovalActions)
    .withMessage(`action must be one of: ${validApprovalActions.join(", ")}`),

  body("comment")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("comment must be 1000 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateCompletePO
// POST /api/purchase-orders/:id/complete
// Transitions APPROVED → COMPLETED and triggers stock IN movements
// ---------------------------------------------------------------------------
const validateCompletePO = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),

  body("notes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("notes must be 1000 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateCancelPO
// POST /api/purchase-orders/:id/cancel
// Transitions DRAFT or PENDING_APPROVAL → REJECTED (cancellation by creator)
// ---------------------------------------------------------------------------
const validateCancelPO = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),

  body("reason")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("reason must be 1000 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateGetApprovals
// GET /api/purchase-orders/:id/approvals
// ---------------------------------------------------------------------------
const validateGetApprovals = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("PO id is required"),
];

// ---------------------------------------------------------------------------
// validatePOAnalytics
// GET /api/purchase-orders/analytics
// ---------------------------------------------------------------------------
const validatePOAnalytics = [
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),

  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
];

module.exports = {
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
};
