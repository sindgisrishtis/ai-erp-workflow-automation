"use strict";

/**
 * Task Management Routes
 * Mounted at: /api/tasks
 *
 * CRITICAL — Route registration order (Express matches top-to-bottom):
 *   1. /analytics          — static, must precede /:id
 *   2. /board              — static, must precede /:id
 *   3. /                   — collection (GET, POST)
 *   4. /:id                — single resource
 *   5. /:id/stage          — sub-action
 *   6. /:id/assignee       — sub-action
 *   7. /:id/comments       — sub-resource collection
 *   8. /:taskId/comments/:commentId — sub-resource item
 *
 * RBAC matrix:
 *   List tasks / Get board    → Any authenticated user
 *   Get task by ID            → Any authenticated user
 *   Get analytics             → ADMIN, MANAGER, FINANCE
 *   Create task               → Any authenticated user
 *   Update task metadata      → Creator, assignee, MANAGER, ADMIN (enforced in service)
 *   Move task (stage)         → Creator, assignee, MANAGER, ADMIN (enforced in service)
 *   Assign task               → Creator, assignee, MANAGER, ADMIN (enforced in service)
 *   Delete task               → ADMIN only (enforced in service)
 *   Get comments              → Any authenticated user
 *   Add comment               → Any authenticated user
 *   Update comment            → Comment author, ADMIN (enforced in service)
 *   Delete comment            → Comment author, ADMIN (enforced in service)
 */

const { Router }  = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/auth.middleware");
const taskController = require("../controllers/task.controller");
const {
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
} = require("../validators/task.validator");

const router = Router();

// ---------------------------------------------------------------------------
// Static routes — registered before /:id to prevent shadowing
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks/analytics
 * Aggregated KPIs: stage breakdown, priority breakdown, workload per user,
 * overdue count, tag frequency, weekly throughput trend.
 */
router.get(
  "/analytics",
  requireAuth,
  authorizeRoles("ADMIN", "MANAGER", "FINANCE"),
  validateTaskAnalytics,
  taskController.getTaskAnalytics
);

/**
 * GET /api/tasks/board
 * Full Kanban board state: tasks grouped by stage.
 * Optional ?assigneeId= to scope the board to a single user.
 * Designed for the frontend drag-and-drop Kanban component.
 */
router.get(
  "/board",
  requireAuth,
  taskController.getKanbanBoard
);

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks
 * Paginated, filtered, sorted task list.
 * Supports: stage, priority, assigneeId, creatorId, tag, overdue,
 *           unassigned, search, sortBy, sortOrder, dateFrom, dateTo.
 */
router.get(
  "/",
  requireAuth,
  validateListTasks,
  taskController.listTasks
);

/**
 * POST /api/tasks
 * Create a new task. Defaults: stage=TODO, priority=MEDIUM.
 * Any authenticated user may create tasks.
 */
router.post(
  "/",
  requireAuth,
  validateCreateTask,
  taskController.createTask
);

// ---------------------------------------------------------------------------
// Single resource routes — dynamic :id segment
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks/:id
 * Full task detail including all comments and user profiles.
 */
router.get(
  "/:id",
  requireAuth,
  validateGetTask,
  taskController.getTaskById
);

/**
 * PUT /api/tasks/:id
 * Update task metadata: title, description, priority, dueDate, tags.
 * Stage and assignee changes use dedicated PATCH endpoints below.
 */
router.put(
  "/:id",
  requireAuth,
  validateUpdateTask,
  taskController.updateTask
);

/**
 * DELETE /api/tasks/:id
 * Hard-delete a task and all its comments (cascade).
 * ADMIN only — enforced at both route (authorizeRoles) and service layer.
 */
router.delete(
  "/:id",
  requireAuth,
  authorizeRoles("ADMIN"),
  validateDeleteTask,
  taskController.deleteTask
);

// ---------------------------------------------------------------------------
// State machine / property action routes
// ---------------------------------------------------------------------------

/**
 * PATCH /api/tasks/:id/stage
 * Move task to a new Kanban stage.
 * Kanban allows free-direction movement; re-opening DONE tasks requires MANAGER/ADMIN.
 */
router.patch(
  "/:id/stage",
  requireAuth,
  validateMoveTask,
  taskController.moveTask
);

/**
 * PATCH /api/tasks/:id/assignee
 * Assign or unassign a task. Send { assigneeId: null } to unassign.
 */
router.patch(
  "/:id/assignee",
  requireAuth,
  validateAssignTask,
  taskController.assignTask
);

// ---------------------------------------------------------------------------
// Comment sub-resource routes
// ---------------------------------------------------------------------------

/**
 * GET /api/tasks/:id/comments
 * Paginated comment list for a task, ordered by createdAt ASC.
 */
router.get(
  "/:id/comments",
  requireAuth,
  validateGetComments,
  taskController.getComments
);

/**
 * POST /api/tasks/:id/comments
 * Add a comment to a task. Any authenticated user may comment.
 */
router.post(
  "/:id/comments",
  requireAuth,
  validateAddComment,
  taskController.addComment
);

/**
 * PUT /api/tasks/:taskId/comments/:commentId
 * Edit a comment. Author or ADMIN only (enforced in service).
 */
router.put(
  "/:taskId/comments/:commentId",
  requireAuth,
  validateUpdateComment,
  taskController.updateComment
);

/**
 * DELETE /api/tasks/:taskId/comments/:commentId
 * Delete a comment. Author or ADMIN only (enforced in service).
 */
router.delete(
  "/:taskId/comments/:commentId",
  requireAuth,
  validateDeleteComment,
  taskController.deleteComment
);

module.exports = router;
