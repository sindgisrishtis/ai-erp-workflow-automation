-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'FINANCE', 'HR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('APPROVED', 'REJECTED', 'ESCALATED', 'RECALLED');

-- CreateEnum
CREATE TYPE "TaskStage" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER', 'RESERVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGED', 'TOKEN_REFRESHED', 'CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'APPROVED', 'REJECTED', 'ESCALATED', 'COMPLETED', 'RECALLED', 'SUBMITTED', 'ALERT', 'GENERATED', 'AI_QUERY', 'EXPORTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" VARCHAR(50) NOT NULL,
    "lastName" VARCHAR(50) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "department" VARCHAR(100),
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "address" VARCHAR(500),
    "website" VARCHAR(255),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 10,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "warehouseZone" VARCHAR(20),
    "barcodeUrl" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "supplierId" TEXT,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference" VARCHAR(100),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" VARCHAR(30) NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "invoiceUrl" TEXT,
    "expectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creatorId" TEXT NOT NULL,
    "supplierId" TEXT,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "itemName" VARCHAR(200),
    "notes" VARCHAR(500),
    "orderId" TEXT NOT NULL,
    "itemId" TEXT,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_approvals" (
    "id" TEXT NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,

    CONSTRAINT "purchase_order_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "stage" "TaskStage" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creatorId" TEXT NOT NULL,
    "assigneeId" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100),
    "detail" TEXT,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "dimension" VARCHAR(100),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_department_idx" ON "users"("department");

-- CreateIndex
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_name_key" ON "inventory_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "inventory_items_sku_idx" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "inventory_items_categoryId_idx" ON "inventory_items"("categoryId");

-- CreateIndex
CREATE INDEX "inventory_items_supplierId_idx" ON "inventory_items"("supplierId");

-- CreateIndex
CREATE INDEX "inventory_items_quantity_idx" ON "inventory_items"("quantity");

-- CreateIndex
CREATE INDEX "inventory_items_isActive_idx" ON "inventory_items"("isActive");

-- CreateIndex
CREATE INDEX "inventory_items_name_idx" ON "inventory_items"("name");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_idx" ON "stock_movements"("itemId");

-- CreateIndex
CREATE INDEX "stock_movements_type_idx" ON "stock_movements"("type");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_reference_idx" ON "stock_movements"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_creatorId_idx" ON "purchase_orders"("creatorId");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_createdAt_idx" ON "purchase_orders"("createdAt");

-- CreateIndex
CREATE INDEX "purchase_orders_poNumber_idx" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_order_items_orderId_idx" ON "purchase_order_items"("orderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_itemId_idx" ON "purchase_order_items"("itemId");

-- CreateIndex
CREATE INDEX "purchase_order_approvals_orderId_idx" ON "purchase_order_approvals"("orderId");

-- CreateIndex
CREATE INDEX "purchase_order_approvals_approverId_idx" ON "purchase_order_approvals"("approverId");

-- CreateIndex
CREATE INDEX "purchase_order_approvals_action_idx" ON "purchase_order_approvals"("action");

-- CreateIndex
CREATE INDEX "purchase_order_approvals_createdAt_idx" ON "purchase_order_approvals"("createdAt");

-- CreateIndex
CREATE INDEX "tasks_stage_idx" ON "tasks"("stage");

-- CreateIndex
CREATE INDEX "tasks_priority_idx" ON "tasks"("priority");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");

-- CreateIndex
CREATE INDEX "tasks_creatorId_idx" ON "tasks"("creatorId");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "tasks_createdAt_idx" ON "tasks"("createdAt");

-- CreateIndex
CREATE INDEX "task_comments_taskId_idx" ON "task_comments"("taskId");

-- CreateIndex
CREATE INDEX "task_comments_createdAt_idx" ON "task_comments"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_snapshots_metric_idx" ON "analytics_snapshots"("metric");

-- CreateIndex
CREATE INDEX "analytics_snapshots_snapshotDate_idx" ON "analytics_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "analytics_snapshots_dimension_idx" ON "analytics_snapshots"("dimension");

-- CreateIndex
CREATE INDEX "analytics_snapshots_metric_snapshotDate_idx" ON "analytics_snapshots"("metric", "snapshotDate");

-- CreateIndex
CREATE INDEX "analytics_snapshots_metric_dimension_idx" ON "analytics_snapshots"("metric", "dimension");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_approvals" ADD CONSTRAINT "purchase_order_approvals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_approvals" ADD CONSTRAINT "purchase_order_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
