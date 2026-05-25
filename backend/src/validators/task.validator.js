"use strict";

const { body, param, query } = require("express-validator");

// ---------------------------------------------------------------------------
// Allowed enum values — mirrored from Prisma schema
// ---------------------------------------------------------------------------

const VALID_STAGES    = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const VALID_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "dueDate",
  "title",
  "stage",
  "priority",
];
const VALID_SORT_ORDERS = ["asc", "desc"];

// ---------------------------------------------------------------------------
// validateListTasks
// GET /api/tasks
// ---------------------------------------------------------------------------

const validateListTasks = [
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

  query("stage")
    .optional()
    .isIn(VALID_STAGES)
    .withMessage(`stage must be one of: ${VALID_STAGES.join(", ")}`),

  query("priority")
    .optional()
    .isIn(VALID_PRIORITIES)
    .withMessage(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`),

  query("assigneeId")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("assigneeId must be a non-empty string"),

  query("creatorId")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("creatorId must be a non-empty string"),

  query("tag")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("tag must be a non-empty string"),

  query("overdue")
    .optional()
    .isBoolean()
    .withMessage("overdue must be a boolean")
    .toBoolean(),

  query("unassigned")
    .optional()
    .isBoolean()
    .withMessage("unassigned must be a boolean")
    .toBoolean(),

  query("search")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("search must be 100 characters or fewer"),

  query("sortBy")
    .optional()
    .isIn(VALID_SORT_FIELDS)
    .withMessage(`sortBy must be one of: ${VALID_SORT_FIELDS.join(", ")}`),

  query("sortOrder")
    .optional()
    .isIn(VALID_SORT_ORDERS)
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
// validateGetTask
// GET /api/tasks/:id
// ---------------------------------------------------------------------------

const validateGetTask = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),
];

// ---------------------------------------------------------------------------
// validateCreateTask
// POST /api/tasks
// ---------------------------------------------------------------------------

const validateCreateTask = [
  body("title")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("title is required")
    .isLength({ max: 255 })
    .withMessage("title must be 255 characters or fewer"),

  body("description")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must be 5000 characters or fewer"),

  body("stage")
    .optional()
    .isIn(VALID_STAGES)
    .withMessage(`stage must be one of: ${VALID_STAGES.join(", ")}`),

  body("priority")
    .optional()
    .isIn(VALID_PRIORITIES)
    .withMessage(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`),

  body("assigneeId")
    .optional({ nullable: true })
    .isString()
    .trim()
    .notEmpty()
    .withMessage("assigneeId must be a non-empty string if provided"),

  body("dueDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("dueDate must be a valid ISO 8601 date"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("tags must be an array"),

  body("tags.*")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage("each tag must be a non-empty string of 50 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateUpdateTask
// PUT /api/tasks/:id
// General metadata update (title, description, priority, dueDate, tags)
// Stage and assignee have dedicated endpoints for proper audit logging
// ---------------------------------------------------------------------------

const validateUpdateTask = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),

  body("title")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("title must be a non-empty string if provided")
    .isLength({ max: 255 })
    .withMessage("title must be 255 characters or fewer"),

  body("description")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must be 5000 characters or fewer"),

  body("priority")
    .optional()
    .isIn(VALID_PRIORITIES)
    .withMessage(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`),

  body("dueDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("dueDate must be a valid ISO 8601 date"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("tags must be an array"),

  body("tags.*")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage("each tag must be a non-empty string of 50 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateMoveTask
// PATCH /api/tasks/:id/stage
// Dedicated stage transition endpoint — produces a targeted audit entry
// ---------------------------------------------------------------------------

const validateMoveTask = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),

  body("stage")
    .isIn(VALID_STAGES)
    .withMessage(`stage must be one of: ${VALID_STAGES.join(", ")}`),
];

// ---------------------------------------------------------------------------
// validateAssignTask
// PATCH /api/tasks/:id/assignee
// Dedicated assignee change endpoint — produces a targeted audit entry
// ---------------------------------------------------------------------------

const validateAssignTask = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),

  body("assigneeId")
    .optional({ nullable: true })
    .isString()
    .trim()
    .withMessage("assigneeId must be a string or null"),
];

// ---------------------------------------------------------------------------
// validateDeleteTask
// DELETE /api/tasks/:id
// ---------------------------------------------------------------------------

const validateDeleteTask = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),
];

// ---------------------------------------------------------------------------
// validateAddComment
// POST /api/tasks/:id/comments
// ---------------------------------------------------------------------------

const validateAddComment = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),

  body("content")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Comment content is required")
    .isLength({ max: 5000 })
    .withMessage("content must be 5000 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateUpdateComment
// PUT /api/tasks/:taskId/comments/:commentId
// ---------------------------------------------------------------------------

const validateUpdateComment = [
  param("taskId")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("taskId is required"),

  param("commentId")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("commentId is required"),

  body("content")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Comment content is required")
    .isLength({ max: 5000 })
    .withMessage("content must be 5000 characters or fewer"),
];

// ---------------------------------------------------------------------------
// validateDeleteComment
// DELETE /api/tasks/:taskId/comments/:commentId
// ---------------------------------------------------------------------------

const validateDeleteComment = [
  param("taskId")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("taskId is required"),

  param("commentId")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("commentId is required"),
];

// ---------------------------------------------------------------------------
// validateGetComments
// GET /api/tasks/:id/comments
// ---------------------------------------------------------------------------

const validateGetComments = [
  param("id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Task id is required"),

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
];

// ---------------------------------------------------------------------------
// validateTaskAnalytics
// GET /api/tasks/analytics
// ---------------------------------------------------------------------------

const validateTaskAnalytics = [
  query("assigneeId")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("assigneeId must be a non-empty string"),

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
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  validateListTasks,
  validateGetTask,
  validateCreateTask,
  validateUpdateTask,
  validateMoveTask,
  validateAssignTask,
  validateDeleteTask,
  validateAddComment,
  validateUpdateComment,
  validateDeleteComment,
  validateGetComments,
  validateTaskAnalytics,
};
