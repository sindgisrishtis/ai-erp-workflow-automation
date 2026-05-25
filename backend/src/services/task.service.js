"use strict";

const prisma = require("../config/prisma");
const { createError } = require("../utils/response");
const { writeAuditLog } = require("../utils/audit");

// ---------------------------------------------------------------------------
// Canonical projections
// Defined once here so every endpoint returns an identical shape.
// Mirrors the USER_SELECT pattern from auth.middleware.js.
// ---------------------------------------------------------------------------

/**
 * Minimal user shape embedded inside task responses.
 * Never exposes passwordHash or sensitive fields.
 */
const USER_STUB = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  department: true,
};

/**
 * Full task shape used on detail and list endpoints.
 */
const TASK_INCLUDE = {
  assignee: { select: USER_STUB },
  creator:  { select: USER_STUB },
  _count: {
    select: { comments: true },
  },
};

/**
 * Task include with comments hydrated — used on the single-task GET only.
 */
const TASK_INCLUDE_WITH_COMMENTS = {
  assignee:  { select: USER_STUB },
  creator:   { select: USER_STUB },
  comments: {
    include: {
      author: { select: USER_STUB },
    },
    orderBy: { createdAt: "asc" },
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a task by id or throw 404.
 * @param {string}  id
 * @param {object}  include  — Prisma include object
 * @param {object}  tx       — optional transaction client
 */
async function findTaskOrThrow(id, include = {}, tx = prisma) {
  const task = await tx.task.findUnique({ where: { id }, include });
  if (!task) throw createError("Task not found", 404);
  return task;
}

/**
 * Verify that a user exists and is active.
 * Used before assigning a task to someone.
 */
async function assertUserExists(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, firstName: true, lastName: true },
  });
  if (!user)      throw createError("Assignee user not found", 404);
  if (!user.isActive) throw createError("Cannot assign a task to an inactive user", 422);
  return user;
}

/**
 * Determine whether a requester may mutate a task.
 * Allowed: the task creator, the current assignee, MANAGER, ADMIN.
 * Throws 403 if none of the conditions are met.
 */
function assertCanMutate(task, requesterId, requesterRole) {
  const isCreator  = task.creatorId  === requesterId;
  const isAssignee = task.assigneeId === requesterId;
  const isPrivileged = ["MANAGER", "ADMIN"].includes(requesterRole);

  if (!isCreator && !isAssignee && !isPrivileged) {
    throw createError(
      "You are not authorized to modify this task. " +
      "Only the task creator, assignee, or a MANAGER/ADMIN can make changes.",
      403
    );
  }
}

// ---------------------------------------------------------------------------
// listTasks
// GET /api/tasks
// ---------------------------------------------------------------------------

/**
 * Paginated, filtered, sorted task list.
 * Supports: stage, priority, assigneeId, creatorId, tag, overdue, unassigned, search,
 *           sortBy, sortOrder, dateFrom, dateTo.
 *
 * @param {object} filters
 * @returns {{ items: Task[], pagination: object }}
 */
async function listTasks(filters) {
  const {
    page      = 1,
    limit     = 20,
    stage,
    priority,
    assigneeId,
    creatorId,
    tag,
    overdue,
    unassigned,
    search,
    sortBy     = "createdAt",
    sortOrder  = "desc",
    dateFrom,
    dateTo,
  } = filters;

  const skip = (page - 1) * limit;
  const now  = new Date();

  // Build where clause progressively
  const where = {};

  if (stage)      where.stage    = stage;
  if (priority)   where.priority = priority;
  if (assigneeId) where.assigneeId = assigneeId;
  if (creatorId)  where.creatorId  = creatorId;

  // Unassigned filter
  if (unassigned === true) {
    where.assigneeId = null;
  }

  // Tag filter — Prisma array contains
  if (tag) {
    where.tags = { hasSome: [tag] };
  }

  // Overdue: dueDate is in the past AND task is not DONE
  if (overdue === true) {
    where.dueDate = { lt: now };
    where.stage   = { not: "DONE" };
  }

  // Full-text search on title (case-insensitive)
  if (search) {
    where.OR = [
      { title:       { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  // Created-at date range
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo)   where.createdAt.lte = new Date(dateTo);
  }

  const [total, items] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      skip,
      take:     limit,
      orderBy:  { [sortBy]: sortOrder },
      include:  TASK_INCLUDE,
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages:  Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
}

// ---------------------------------------------------------------------------
// getKanbanBoard
// GET /api/tasks/board
// Returns all tasks grouped by stage — optimised for frontend Kanban rendering.
// No pagination: returns full board state (tasks are bounded per project scope).
// ---------------------------------------------------------------------------

/**
 * Returns tasks grouped by their stage, with an optional assigneeId filter
 * so individual users can view their own board.
 *
 * @param {object} filters — { assigneeId? }
 * @returns {object}  — { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] }
 */
async function getKanbanBoard(filters = {}) {
  const { assigneeId } = filters;

  const where = assigneeId ? { assigneeId } : {};

  const tasks = await prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  // Group into stage buckets
  const board = {
    TODO:        [],
    IN_PROGRESS: [],
    REVIEW:      [],
    DONE:        [],
  };

  for (const task of tasks) {
    if (board[task.stage]) {
      board[task.stage].push(task);
    }
  }

  // Attach column metadata
  return {
    columns: [
      { stage: "TODO",        label: "To Do",      count: board.TODO.length,        tasks: board.TODO },
      { stage: "IN_PROGRESS", label: "In Progress", count: board.IN_PROGRESS.length, tasks: board.IN_PROGRESS },
      { stage: "REVIEW",      label: "In Review",   count: board.REVIEW.length,      tasks: board.REVIEW },
      { stage: "DONE",        label: "Done",        count: board.DONE.length,        tasks: board.DONE },
    ],
    totalTasks: tasks.length,
  };
}

// ---------------------------------------------------------------------------
// getTaskById
// GET /api/tasks/:id
// ---------------------------------------------------------------------------

/**
 * Single task with full relations: assignee, creator, and all comments.
 */
async function getTaskById(id) {
  return findTaskOrThrow(id, TASK_INCLUDE_WITH_COMMENTS);
}

// ---------------------------------------------------------------------------
// createTask
// POST /api/tasks
// ---------------------------------------------------------------------------

/**
 * Create a new task. Default stage is TODO; default priority is MEDIUM.
 * Assignee is validated if provided.
 *
 * @param {object} data        — { title, description?, stage?, priority?, assigneeId?, dueDate?, tags? }
 * @param {string} creatorId
 * @param {object} auditCtx
 */
async function createTask(data, creatorId, auditCtx) {
  const {
    title,
    description,
    stage    = "TODO",
    priority = "MEDIUM",
    assigneeId,
    dueDate,
    tags     = [],
  } = data;

  // Validate assignee if provided
  if (assigneeId) {
    await assertUserExists(assigneeId);
  }

  // Deduplicate tags
  const normalizedTags = [...new Set((tags || []).map((t) => t.trim().toLowerCase()))];

  const task = await prisma.task.create({
    data: {
      title:       title.trim(),
      description: description ? description.trim() : null,
      stage,
      priority,
      assigneeId:  assigneeId || null,
      creatorId,
      dueDate:     dueDate ? new Date(dueDate) : null,
      tags:        normalizedTags,
    },
    include: TASK_INCLUDE,
  });

  await writeAuditLog({
    action:   "CREATED",
    entity:   "Task",
    entityId: task.id,
    detail:   `Created task "${task.title}" [${task.stage}] priority=${task.priority}${assigneeId ? ` assigned to ${assigneeId}` : ""}`,
    ...auditCtx,
  });

  return task;
}

// ---------------------------------------------------------------------------
// updateTask
// PUT /api/tasks/:id
// General metadata update — title, description, priority, dueDate, tags.
// Stage and assignee changes have dedicated endpoints for cleaner audit trails.
// ---------------------------------------------------------------------------

/**
 * @param {string} id
 * @param {object} data        — { title?, description?, priority?, dueDate?, tags? }
 * @param {object} requester   — { id, role }
 * @param {object} auditCtx
 */
async function updateTask(id, data, requester, auditCtx) {
  const task = await findTaskOrThrow(id);

  assertCanMutate(task, requester.id, requester.role);

  const { title, description, priority, dueDate, tags } = data;
  const updateData = {};
  const changes    = [];

  if (title !== undefined) {
    updateData.title = title.trim();
    changes.push(`title="${title.trim()}"`);
  }

  if (description !== undefined) {
    updateData.description = description ? description.trim() : null;
    changes.push("description updated");
  }

  if (priority !== undefined) {
    updateData.priority = priority;
    changes.push(`priority=${priority}`);
  }

  if (dueDate !== undefined) {
    updateData.dueDate = dueDate ? new Date(dueDate) : null;
    changes.push(`dueDate=${dueDate || "cleared"}`);
  }

  if (tags !== undefined) {
    updateData.tags = [...new Set(tags.map((t) => t.trim().toLowerCase()))];
    changes.push(`tags=[${updateData.tags.join(", ")}]`);
  }

  if (Object.keys(updateData).length === 0) {
    throw createError("No valid fields provided for update", 422);
  }

  const updated = await prisma.task.update({
    where:   { id },
    data:    updateData,
    include: TASK_INCLUDE,
  });

  await writeAuditLog({
    action:   "UPDATED",
    entity:   "Task",
    entityId: id,
    detail:   `Updated task "${updated.title}": ${changes.join("; ")}`,
    ...auditCtx,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// moveTask (stage transition)
// PATCH /api/tasks/:id/stage
// ---------------------------------------------------------------------------

/**
 * Move a task to a new Kanban stage.
 * Kanban allows free movement in any direction — no forward-only constraint.
 * The only guard is that DONE tasks require MANAGER/ADMIN to re-open them.
 *
 * @param {string} id
 * @param {string} newStage    — target TaskStage value
 * @param {object} requester   — { id, role }
 * @param {object} auditCtx
 */
async function moveTask(id, newStage, requester, auditCtx) {
  const task = await findTaskOrThrow(id);

  assertCanMutate(task, requester.id, requester.role);

  // Prevent no-op moves
  if (task.stage === newStage) {
    throw createError(`Task is already in stage '${newStage}'`, 409);
  }

  // Re-opening a DONE task requires elevated privileges
  if (task.stage === "DONE" && !["MANAGER", "ADMIN"].includes(requester.role)) {
    throw createError(
      "Only a MANAGER or ADMIN can re-open a completed task",
      403
    );
  }

  const previousStage = task.stage;

  const updated = await prisma.task.update({
    where:   { id },
    data:    { stage: newStage },
    include: TASK_INCLUDE,
  });

  await writeAuditLog({
    action:   "UPDATED",
    entity:   "Task",
    entityId: id,
    detail:   `Moved task "${updated.title}" from ${previousStage} → ${newStage}`,
    ...auditCtx,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// assignTask
// PATCH /api/tasks/:id/assignee
// ---------------------------------------------------------------------------

/**
 * Change (or clear) the assignee of a task.
 * Only the creator, current assignee, MANAGER, or ADMIN may reassign.
 *
 * @param {string}      id
 * @param {string|null} newAssigneeId  — null to unassign
 * @param {object}      requester
 * @param {object}      auditCtx
 */
async function assignTask(id, newAssigneeId, requester, auditCtx) {
  const task = await findTaskOrThrow(id, {
    assignee: { select: { id: true, firstName: true, lastName: true } },
  });

  assertCanMutate(task, requester.id, requester.role);

  // Validate new assignee if provided
  let newAssigneeLabel = "unassigned";
  if (newAssigneeId) {
    const user = await assertUserExists(newAssigneeId);
    newAssigneeLabel = `${user.firstName} ${user.lastName}`;
  }

  const previousAssigneeLabel = task.assignee
    ? `${task.assignee.firstName} ${task.assignee.lastName}`
    : "unassigned";

  // Prevent no-op reassignment
  if (task.assigneeId === (newAssigneeId || null)) {
    throw createError(
      newAssigneeId
        ? "Task is already assigned to this user"
        : "Task is already unassigned",
      409
    );
  }

  const updated = await prisma.task.update({
    where:   { id },
    data:    { assigneeId: newAssigneeId || null },
    include: TASK_INCLUDE,
  });

  await writeAuditLog({
    action:   "UPDATED",
    entity:   "Task",
    entityId: id,
    detail:   `Reassigned task "${updated.title}" from ${previousAssigneeLabel} to ${newAssigneeLabel}`,
    ...auditCtx,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// deleteTask
// DELETE /api/tasks/:id
// ---------------------------------------------------------------------------

/**
 * Hard-delete a task and cascade to its comments (onDelete: Cascade in schema).
 * Only ADMIN can delete; all others receive 403.
 * DONE tasks that are "closed" can also be deleted by the creator if they are ADMIN.
 *
 * @param {string} id
 * @param {object} requester
 * @param {object} auditCtx
 */
async function deleteTask(id, requester, auditCtx) {
  if (requester.role !== "ADMIN") {
    throw createError("Only ADMIN users can delete tasks", 403);
  }

  const task = await findTaskOrThrow(id);

  // Capture title before deletion for the audit log
  const taskTitle = task.title;

  await prisma.task.delete({ where: { id } });

  await writeAuditLog({
    action:   "DELETED",
    entity:   "Task",
    entityId: id,
    detail:   `Deleted task "${taskTitle}"`,
    ...auditCtx,
  });
}

// ---------------------------------------------------------------------------
// Comment operations
// ---------------------------------------------------------------------------

/**
 * getComments
 * GET /api/tasks/:id/comments
 * Paginated comment list for a task.
 */
async function getComments(taskId, filters = {}) {
  // Verify task exists first
  await findTaskOrThrow(taskId);

  const { page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.taskComment.count({ where: { taskId } }),
    prisma.taskComment.findMany({
      where:   { taskId },
      skip,
      take:    limit,
      orderBy: { createdAt: "asc" },
      include: { author: { select: USER_STUB } },
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages:  Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * addComment
 * POST /api/tasks/:id/comments
 * Any authenticated user can comment on any task.
 *
 * @param {string} taskId
 * @param {string} content
 * @param {string} authorId
 * @param {object} auditCtx
 */
async function addComment(taskId, content, authorId, auditCtx) {
  // Verify task exists
  const task = await findTaskOrThrow(taskId);

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      content: content.trim(),
      authorId,
    },
    include: { author: { select: USER_STUB } },
  });

  await writeAuditLog({
    action:   "CREATED",
    entity:   "TaskComment",
    entityId: comment.id,
    detail:   `Added comment on task "${task.title}"`,
    ...auditCtx,
  });

  return comment;
}

/**
 * updateComment
 * PUT /api/tasks/:taskId/comments/:commentId
 * Only the comment author or ADMIN can edit a comment.
 *
 * @param {string} taskId
 * @param {string} commentId
 * @param {string} content
 * @param {object} requester
 * @param {object} auditCtx
 */
async function updateComment(taskId, commentId, content, requester, auditCtx) {
  // Verify task exists
  await findTaskOrThrow(taskId);

  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) throw createError("Comment not found", 404);
  if (comment.taskId !== taskId) throw createError("Comment does not belong to this task", 400);

  // Authorization: author or ADMIN only
  if (comment.authorId !== requester.id && requester.role !== "ADMIN") {
    throw createError("You can only edit your own comments", 403);
  }

  const updated = await prisma.taskComment.update({
    where:   { id: commentId },
    data:    { content: content.trim() },
    include: { author: { select: USER_STUB } },
  });

  await writeAuditLog({
    action:   "UPDATED",
    entity:   "TaskComment",
    entityId: commentId,
    detail:   `Edited comment on task ${taskId}`,
    ...auditCtx,
  });

  return updated;
}

/**
 * deleteComment
 * DELETE /api/tasks/:taskId/comments/:commentId
 * Only the comment author or ADMIN can delete.
 *
 * @param {string} taskId
 * @param {string} commentId
 * @param {object} requester
 * @param {object} auditCtx
 */
async function deleteComment(taskId, commentId, requester, auditCtx) {
  // Verify task exists
  await findTaskOrThrow(taskId);

  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) throw createError("Comment not found", 404);
  if (comment.taskId !== taskId) throw createError("Comment does not belong to this task", 400);

  if (comment.authorId !== requester.id && requester.role !== "ADMIN") {
    throw createError("You can only delete your own comments", 403);
  }

  await prisma.taskComment.delete({ where: { id: commentId } });

  await writeAuditLog({
    action:   "DELETED",
    entity:   "TaskComment",
    entityId: commentId,
    detail:   `Deleted comment on task ${taskId}`,
    ...auditCtx,
  });
}

// ---------------------------------------------------------------------------
// getTaskAnalytics
// GET /api/tasks/analytics
// ---------------------------------------------------------------------------

/**
 * Returns:
 *   - Total task counts broken down by stage
 *   - Total task counts broken down by priority
 *   - Overdue task count (dueDate < now, stage != DONE)
 *   - Unassigned task count
 *   - Completion rate (DONE / total)
 *   - Per-user workload: task counts grouped by assignee
 *   - Tag frequency: most-used tags across all tasks
 *   - Tasks completed per week for the last 8 weeks (throughput trend)
 *
 * @param {object} filters — { assigneeId?, dateFrom?, dateTo? }
 */
async function getTaskAnalytics(filters = {}) {
  const { assigneeId, dateFrom, dateTo } = filters;
  const now = new Date();

  const baseWhere = {};
  if (assigneeId) baseWhere.assigneeId = assigneeId;
  if (dateFrom || dateTo) {
    baseWhere.createdAt = {};
    if (dateFrom) baseWhere.createdAt.gte = new Date(dateFrom);
    if (dateTo)   baseWhere.createdAt.lte = new Date(dateTo);
  }

  // ── Stage breakdown ────────────────────────────────────────────────────────
  const stageBreakdown = await prisma.task.groupBy({
    by:    ["stage"],
    where: baseWhere,
    _count: { id: true },
  });

  const byStage = Object.fromEntries(
    stageBreakdown.map((r) => [r.stage, r._count.id])
  );

  // ── Priority breakdown ─────────────────────────────────────────────────────
  const priorityBreakdown = await prisma.task.groupBy({
    by:    ["priority"],
    where: baseWhere,
    _count: { id: true },
  });

  const byPriority = Object.fromEntries(
    priorityBreakdown.map((r) => [r.priority, r._count.id])
  );

  // ── Overdue count ──────────────────────────────────────────────────────────
  const overdueCount = await prisma.task.count({
    where: {
      ...baseWhere,
      dueDate: { lt: now, not: null },
      stage:   { not: "DONE" },
    },
  });

  // ── Unassigned count ───────────────────────────────────────────────────────
  const unassignedCount = await prisma.task.count({
    where: { ...baseWhere, assigneeId: null },
  });

  // ── Totals and completion rate ─────────────────────────────────────────────
  const totalTasks = stageBreakdown.reduce((sum, r) => sum + r._count.id, 0);
  const doneTasks  = byStage["DONE"] || 0;
  const completionRate = totalTasks > 0
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;

  // ── Per-user workload ──────────────────────────────────────────────────────
  const workloadRows = await prisma.task.groupBy({
    by:    ["assigneeId"],
    where: { ...baseWhere, assigneeId: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const assigneeIds = workloadRows.map((r) => r.assigneeId).filter(Boolean);
  const assigneeUsers = await prisma.user.findMany({
    where:  { id: { in: assigneeIds } },
    select: { id: true, firstName: true, lastName: true, email: true, department: true },
  });
  const userMap = Object.fromEntries(assigneeUsers.map((u) => [u.id, u]));

  const workload = workloadRows.map((row) => {
    const user = userMap[row.assigneeId];
    return {
      assigneeId:   row.assigneeId,
      assigneeName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
      email:        user?.email,
      department:   user?.department,
      taskCount:    row._count.id,
    };
  });

  // ── Tag frequency ──────────────────────────────────────────────────────────
  // Prisma cannot group by array elements — aggregate in JS from a raw tags query
  const tasksWithTags = await prisma.task.findMany({
    where:  { ...baseWhere, tags: { isEmpty: false } },
    select: { tags: true },
  });

  const tagFrequency = {};
  for (const { tags } of tasksWithTags) {
    for (const tag of tags) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // ── Weekly completion throughput — last 8 weeks ────────────────────────────
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const completedRecently = await prisma.task.findMany({
    where: {
      stage:     "DONE",
      updatedAt: { gte: eightWeeksAgo },
    },
    select: { updatedAt: true },
  });

  // Bucket by ISO week (YYYY-WNN)
  const weeklyThroughput = {};
  for (const { updatedAt } of completedRecently) {
    const weekKey = getISOWeekKey(updatedAt);
    weeklyThroughput[weekKey] = (weeklyThroughput[weekKey] || 0) + 1;
  }

  const throughputArray = Object.entries(weeklyThroughput)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, completed]) => ({ week, completed }));

  return {
    summary: {
      totalTasks,
      doneTasks,
      completionRate,
      overdueCount,
      unassignedCount,
      inProgressCount: byStage["IN_PROGRESS"] || 0,
      reviewCount:     byStage["REVIEW"] || 0,
    },
    byStage,
    byPriority,
    workload,
    topTags,
    weeklyThroughput: throughputArray,
  };
}

/**
 * Returns an ISO week key string "YYYY-WNN" for a given date.
 * Used for grouping task completion into weekly buckets.
 * @param {Date} date
 * @returns {string}
 */
function getISOWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week determines the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.round(
    ((d - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7
  ) + 1;
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
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
