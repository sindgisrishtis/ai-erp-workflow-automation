"use strict";

const { validationResult } = require("express-validator");
const taskService = require("../services/task.service");
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent,
  createError,
} = require("../utils/response");
const { extractAuditContext } = require("../utils/audit");

// ---------------------------------------------------------------------------
// Shared validation helper — identical pattern across all controllers
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
// listTasks
// GET /api/tasks
// ---------------------------------------------------------------------------

async function listTasks(req, res) {
  checkValidation(req);

  const filters = {
    page:       req.query.page,
    limit:      req.query.limit,
    stage:      req.query.stage,
    priority:   req.query.priority,
    assigneeId: req.query.assigneeId,
    creatorId:  req.query.creatorId,
    tag:        req.query.tag,
    overdue:    req.query.overdue,
    unassigned: req.query.unassigned,
    search:     req.query.search,
    sortBy:     req.query.sortBy,
    sortOrder:  req.query.sortOrder,
    dateFrom:   req.query.dateFrom,
    dateTo:     req.query.dateTo,
  };

  const result = await taskService.listTasks(filters);
  return sendPaginated(res, result.items, result.pagination);
}

// ---------------------------------------------------------------------------
// getKanbanBoard
// GET /api/tasks/board
// ---------------------------------------------------------------------------

async function getKanbanBoard(req, res) {
  const filters = {
    assigneeId: req.query.assigneeId,
  };

  const board = await taskService.getKanbanBoard(filters);
  return sendSuccess(res, board);
}

// ---------------------------------------------------------------------------
// getTaskById
// GET /api/tasks/:id
// ---------------------------------------------------------------------------

async function getTaskById(req, res) {
  checkValidation(req);
  const task = await taskService.getTaskById(req.params.id);
  return sendSuccess(res, task);
}

// ---------------------------------------------------------------------------
// createTask
// POST /api/tasks
// ---------------------------------------------------------------------------

async function createTask(req, res) {
  checkValidation(req);

  const { title, description, stage, priority, assigneeId, dueDate, tags } =
    req.body;
  const auditCtx = extractAuditContext(req);

  const task = await taskService.createTask(
    { title, description, stage, priority, assigneeId, dueDate, tags },
    req.user.id,
    auditCtx
  );

  return sendCreated(res, task, "Task created successfully");
}

// ---------------------------------------------------------------------------
// updateTask
// PUT /api/tasks/:id
// ---------------------------------------------------------------------------

async function updateTask(req, res) {
  checkValidation(req);

  const { title, description, priority, dueDate, tags } = req.body;
  const auditCtx = extractAuditContext(req);

  const task = await taskService.updateTask(
    req.params.id,
    { title, description, priority, dueDate, tags },
    req.user,
    auditCtx
  );

  return sendSuccess(res, task, "Task updated successfully");
}

// ---------------------------------------------------------------------------
// moveTask
// PATCH /api/tasks/:id/stage
// ---------------------------------------------------------------------------

async function moveTask(req, res) {
  checkValidation(req);

  const auditCtx = extractAuditContext(req);

  const task = await taskService.moveTask(
    req.params.id,
    req.body.stage,
    req.user,
    auditCtx
  );

  return sendSuccess(res, task, `Task moved to ${req.body.stage}`);
}

// ---------------------------------------------------------------------------
// assignTask
// PATCH /api/tasks/:id/assignee
// ---------------------------------------------------------------------------

async function assignTask(req, res) {
  checkValidation(req);

  // assigneeId may be explicitly null to unassign
  const newAssigneeId = req.body.assigneeId !== undefined
    ? req.body.assigneeId
    : null;

  const auditCtx = extractAuditContext(req);

  const task = await taskService.assignTask(
    req.params.id,
    newAssigneeId,
    req.user,
    auditCtx
  );

  const message = newAssigneeId
    ? "Task assigned successfully"
    : "Task unassigned successfully";

  return sendSuccess(res, task, message);
}

// ---------------------------------------------------------------------------
// deleteTask
// DELETE /api/tasks/:id
// ---------------------------------------------------------------------------

async function deleteTask(req, res) {
  checkValidation(req);

  const auditCtx = extractAuditContext(req);

  await taskService.deleteTask(req.params.id, req.user, auditCtx);

  return sendNoContent(res);
}

// ---------------------------------------------------------------------------
// getComments
// GET /api/tasks/:id/comments
// ---------------------------------------------------------------------------

async function getComments(req, res) {
  checkValidation(req);

  const filters = {
    page:  req.query.page,
    limit: req.query.limit,
  };

  const result = await taskService.getComments(req.params.id, filters);
  return sendPaginated(res, result.items, result.pagination);
}

// ---------------------------------------------------------------------------
// addComment
// POST /api/tasks/:id/comments
// ---------------------------------------------------------------------------

async function addComment(req, res) {
  checkValidation(req);

  const auditCtx = extractAuditContext(req);

  const comment = await taskService.addComment(
    req.params.id,
    req.body.content,
    req.user.id,
    auditCtx
  );

  return sendCreated(res, comment, "Comment added successfully");
}

// ---------------------------------------------------------------------------
// updateComment
// PUT /api/tasks/:taskId/comments/:commentId
// ---------------------------------------------------------------------------

async function updateComment(req, res) {
  checkValidation(req);

  const auditCtx = extractAuditContext(req);

  const comment = await taskService.updateComment(
    req.params.taskId,
    req.params.commentId,
    req.body.content,
    req.user,
    auditCtx
  );

  return sendSuccess(res, comment, "Comment updated successfully");
}

// ---------------------------------------------------------------------------
// deleteComment
// DELETE /api/tasks/:taskId/comments/:commentId
// ---------------------------------------------------------------------------

async function deleteComment(req, res) {
  checkValidation(req);

  const auditCtx = extractAuditContext(req);

  await taskService.deleteComment(
    req.params.taskId,
    req.params.commentId,
    req.user,
    auditCtx
  );

  return sendNoContent(res);
}

// ---------------------------------------------------------------------------
// getTaskAnalytics
// GET /api/tasks/analytics
// ---------------------------------------------------------------------------

async function getTaskAnalytics(req, res) {
  checkValidation(req);

  const filters = {
    assigneeId: req.query.assigneeId,
    dateFrom:   req.query.dateFrom,
    dateTo:     req.query.dateTo,
  };

  const analytics = await taskService.getTaskAnalytics(filters);
  return sendSuccess(res, analytics);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listTasks,
  getKanbanBoard,
  getTaskById,
  createTask,
  updateTask,
  moveTask,
  assignTask,
  deleteTask,
  getComments,
  addComment,
  updateComment,
  deleteComment,
  getTaskAnalytics,
};
