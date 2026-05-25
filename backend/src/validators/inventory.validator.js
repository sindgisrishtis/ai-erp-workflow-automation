"use strict";

/**
 * src/validators/inventory.validator.js
 *
 * Express-validator chains for every inventory endpoint.
 *
 * Design principles:
 *  - Validate at the boundary before any business logic runs
 *  - Return ALL field errors at once (not just the first)
 *  - Coerce numeric query strings into proper JS types via .toInt() / .toFloat()
 *  - Error messages are human-readable — they surface directly in the React UI
 */

const { body, query, param } = require("express-validator");
const { validationResult }   = require("express-validator");
const { send }               = require("../utils/response");

// ─── Valid enum values mirrored from schema.prisma ───────────────────────────
const VALID_MOVEMENT_TYPES = ["IN", "OUT", "ADJUSTMENT", "TRANSFER", "RESERVED"];
const VALID_SORT_FIELDS    = ["name", "sku", "quantity", "unitPrice", "totalValue", "createdAt", "updatedAt"];
const VALID_SORT_ORDERS    = ["asc", "desc"];
const VALID_STATUS_FILTERS = ["all", "ok", "low", "critical", "inactive"];

// =============================================================================
// Shared: validation result handler
// =============================================================================
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((err) => ({
      field:   err.path,
      message: err.msg,
      value:   err.value,
    }));
    return send.validation(res, formatted);
  }
  next();
}

// =============================================================================
// GET /api/inventory — list with filters, search, sorting, pagination
// =============================================================================
const listInventoryValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage("limit must be 1–100")
    .toInt(),

  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("search must not exceed 100 characters"),

  query("categoryId")
    .optional()
    .trim()
    .isLength({ min: 1 }).withMessage("categoryId must not be empty"),

  query("supplierId")
    .optional()
    .trim()
    .isLength({ min: 1 }).withMessage("supplierId must not be empty"),

  query("status")
    .optional()
    .isIn(VALID_STATUS_FILTERS)
    .withMessage(`status must be one of: ${VALID_STATUS_FILTERS.join(", ")}`),

  query("sortBy")
    .optional()
    .isIn(VALID_SORT_FIELDS)
    .withMessage(`sortBy must be one of: ${VALID_SORT_FIELDS.join(", ")}`),

  query("sortOrder")
    .optional()
    .isIn(VALID_SORT_ORDERS)
    .withMessage("sortOrder must be 'asc' or 'desc'"),

  query("warehouseZone")
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage("warehouseZone must not exceed 20 characters"),

  handleValidationErrors,
];

// =============================================================================
// GET /api/inventory/:id — single item
// =============================================================================
const getByIdValidators = [
  param("id").trim().notEmpty().withMessage("Item ID is required"),
  handleValidationErrors,
];

// =============================================================================
// POST /api/inventory — create new item
// =============================================================================
const createItemValidators = [
  body("sku")
    .trim()
    .notEmpty().withMessage("SKU is required")
    .isLength({ min: 2, max: 50 }).withMessage("SKU must be 2–50 characters")
    .matches(/^[A-Z0-9\-_]+$/i).withMessage("SKU may only contain letters, numbers, hyphens, and underscores"),

  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ min: 2, max: 200 }).withMessage("Name must be 2–200 characters"),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage("Description must not exceed 2000 characters"),

  body("quantity")
    .notEmpty().withMessage("quantity is required")
    .isInt({ min: 0 }).withMessage("quantity must be a non-negative integer")
    .toInt(),

  body("reorderPoint")
    .optional()
    .isInt({ min: 0 }).withMessage("reorderPoint must be a non-negative integer")
    .toInt(),

  body("unitPrice")
    .notEmpty().withMessage("Unit price is required")
    .isFloat({ min: 0 }).withMessage("unitPrice must be a non-negative number")
    .toFloat(),

  body("categoryId")
    .optional({ nullable: true })
    .trim(),

  body("supplierId")
    .optional({ nullable: true })
    .trim(),

  body("warehouseZone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage("warehouseZone must not exceed 20 characters"),

  body("barcodeUrl")
    .optional({ nullable: true })
    .trim()
    .isURL().withMessage("barcodeUrl must be a valid URL"),

  body("imageUrl")
    .optional({ nullable: true })
    .trim()
    .isURL().withMessage("imageUrl must be a valid URL"),

  handleValidationErrors,
];

// =============================================================================
// PUT /api/inventory/:id — update item (SKU immutable)
// =============================================================================
const updateItemValidators = [
  param("id").trim().notEmpty().withMessage("Item ID is required"),

  body("sku")
    .not().exists()
    .withMessage("SKU cannot be changed after creation. Delete and recreate the item if needed."),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage("Name must be 2–200 characters"),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage("Description must not exceed 2000 characters"),

  body("reorderPoint")
    .optional()
    .isInt({ min: 0 }).withMessage("reorderPoint must be a non-negative integer")
    .toInt(),

  body("unitPrice")
    .optional()
    .isFloat({ min: 0 }).withMessage("unitPrice must be a non-negative number")
    .toFloat(),

  body("categoryId")
    .optional({ nullable: true })
    .trim(),

  body("supplierId")
    .optional({ nullable: true })
    .trim(),

  body("warehouseZone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage("warehouseZone must not exceed 20 characters"),

  body("barcodeUrl")
    .optional({ nullable: true })
    .trim()
    .isURL().withMessage("barcodeUrl must be a valid URL"),

  body("imageUrl")
    .optional({ nullable: true })
    .trim()
    .isURL().withMessage("imageUrl must be a valid URL"),

  body("isActive")
    .optional()
    .isBoolean().withMessage("isActive must be true or false"),

  handleValidationErrors,
];

// =============================================================================
// POST /api/inventory/:id/adjust — stock movement
// =============================================================================
const adjustStockValidators = [
  param("id").trim().notEmpty().withMessage("Item ID is required"),

  body("type")
    .trim()
    .notEmpty().withMessage("Movement type is required")
    .isIn(VALID_MOVEMENT_TYPES)
    .withMessage(`type must be one of: ${VALID_MOVEMENT_TYPES.join(", ")}`),

  body("quantity")
    .notEmpty().withMessage("Quantity is required")
    .isInt({ min: 1 }).withMessage("Quantity must be a positive integer (minimum 1)")
    .toInt(),

  body("reference")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage("reference must not exceed 100 characters"),

  body("notes")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage("notes must not exceed 500 characters"),

  handleValidationErrors,
];

// =============================================================================
// DELETE /api/inventory/:id — soft delete
// =============================================================================
const deleteItemValidators = [
  param("id").trim().notEmpty().withMessage("Item ID is required"),
  handleValidationErrors,
];

// =============================================================================
// Category validators
// =============================================================================
const createCategoryValidators = [
  body("name")
    .trim()
    .notEmpty().withMessage("Category name is required")
    .isLength({ min: 2, max: 100 }).withMessage("Category name must be 2–100 characters"),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage("Description must not exceed 500 characters"),

  handleValidationErrors,
];

// =============================================================================
// Supplier validators
// =============================================================================
const createSupplierValidators = [
  body("name")
    .trim()
    .notEmpty().withMessage("Supplier name is required")
    .isLength({ min: 2, max: 200 }).withMessage("Supplier name must be 2–200 characters"),

  body("email")
    .optional({ nullable: true })
    .trim()
    .isEmail().withMessage("email must be a valid email address")
    .normalizeEmail(),

  body("phone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 30 }).withMessage("phone must not exceed 30 characters"),

  body("address")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage("address must not exceed 500 characters"),

  body("website")
    .optional({ nullable: true })
    .trim()
    .isURL().withMessage("website must be a valid URL"),

  body("notes")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage("notes must not exceed 2000 characters"),

  handleValidationErrors,
];

// =============================================================================
// Stock movement history filters
// =============================================================================
const movementHistoryValidators = [
  param("id").trim().notEmpty().withMessage("Item ID is required"),

  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 200 }).withMessage("limit must be 1–200")
    .toInt(),

  query("type")
    .optional()
    .isIn(VALID_MOVEMENT_TYPES)
    .withMessage(`type must be one of: ${VALID_MOVEMENT_TYPES.join(", ")}`),

  handleValidationErrors,
];

module.exports = {
  listInventoryValidators,
  getByIdValidators,
  createItemValidators,
  updateItemValidators,
  adjustStockValidators,
  deleteItemValidators,
  createCategoryValidators,
  createSupplierValidators,
  movementHistoryValidators,
  handleValidationErrors,
};
