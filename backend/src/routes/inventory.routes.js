"use strict";

/**
 * src/routes/inventory.routes.js
 *
 * Inventory Management route definitions.
 * Mounted at: /api/inventory  (in server.js)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROUTE MAP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ANALYTICS & ALERTS  (static paths first — must precede /:id to avoid conflicts)
 *   GET  /api/inventory/analytics          Full analytics summary     [AUTH]
 *   GET  /api/inventory/alerts/low-stock   Low/critical stock items   [AUTH]
 *
 * CATEGORIES
 *   GET  /api/inventory/categories         List all categories        [AUTH]
 *   POST /api/inventory/categories         Create category            [ADMIN|MANAGER]
 *
 * SUPPLIERS
 *   GET  /api/inventory/suppliers          List all suppliers         [AUTH]
 *   POST /api/inventory/suppliers          Create supplier            [ADMIN|MANAGER]
 *
 * ITEMS (CRUD)
 *   GET    /api/inventory                  Paginated list + filters   [AUTH]
 *   POST   /api/inventory                  Create new item            [ADMIN|MANAGER]
 *   GET    /api/inventory/:id              Get single item            [AUTH]
 *   PUT    /api/inventory/:id              Update item fields         [ADMIN|MANAGER]
 *   DELETE /api/inventory/:id             Soft delete                [ADMIN]
 *
 * STOCK ADJUSTMENTS
 *   POST /api/inventory/:id/adjust         Record stock movement      [ADMIN|MANAGER|EMPLOYEE]
 *   GET  /api/inventory/:id/movements      Movement history           [AUTH]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RBAC SUMMARY
 * ─────────────────────────────────────────────────────────────────────────────
 *   EMPLOYEE  → read-only + stock adjustments (e.g. issue laptops)
 *   HR        → read-only
 *   FINANCE   → read + analytics
 *   MANAGER   → full create/update/adjust; no hard permissions (soft-delete allowed)
 *   ADMIN     → all operations including delete
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require("express");

const inventoryController = require("../controllers/inventory.controller");
const {
  requireAuth,
  authorizeRoles,
}                         = require("../middleware/auth.middleware");
const {
  listInventoryValidators,
  getByIdValidators,
  createItemValidators,
  updateItemValidators,
  adjustStockValidators,
  deleteItemValidators,
  createCategoryValidators,
  createSupplierValidators,
  movementHistoryValidators,
}                         = require("../validators/inventory.validator");

const router = express.Router();

// All inventory routes require authentication — no public endpoints here
router.use(requireAuth);

// =============================================================================
// STATIC ROUTES  (must be defined BEFORE /:id routes)
// Express matches routes in definition order. "/analytics" would be matched
// as /:id = "analytics" if the /:id routes were defined first.
// =============================================================================

/**
 * GET /api/inventory/analytics
 * Full inventory analytics: totals, category breakdown, supplier breakdown,
 * top value items, movement type distribution.
 * FINANCE and above can access analytics.
 *
 * Example response:
 * {
 *   "success": true,
 *   "data": {
 *     "summary": { "totalItems": 8, "activeItems": 8, "totalInventoryValue": 108011.00, ... },
 *     "categoryBreakdown": [ { "name": "Laptops", "count": 1, "totalValue": 17988.00 }, ... ],
 *     "topValueItems": [ ... ],
 *     "recentMovements": [ ... ]
 *   }
 * }
 */
router.get(
  "/analytics",
  authorizeRoles("ADMIN", "MANAGER", "FINANCE"),
  inventoryController.getInventoryAnalytics
);

/**
 * GET /api/inventory/alerts/low-stock
 * All items at or below reorder threshold. Sorted: critical → low.
 * All authenticated users can view alerts (needed for dashboard widgets).
 */
router.get(
  "/alerts/low-stock",
  inventoryController.getLowStockAlerts
);

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * GET /api/inventory/categories
 * List all categories with item counts.
 *
 * Example response:
 * {
 *   "success": true,
 *   "data": [
 *     { "id": "...", "name": "Laptops", "itemCount": 3 },
 *     { "id": "...", "name": "Monitors", "itemCount": 5 }
 *   ]
 * }
 */
router.get(
  "/categories",
  inventoryController.listCategories
);

/**
 * POST /api/inventory/categories
 * Create a new inventory category. ADMIN / MANAGER only.
 *
 * Body: { "name": "Storage Devices", "description": "HDDs, SSDs, NAS" }
 */
router.post(
  "/categories",
  authorizeRoles("ADMIN", "MANAGER"),
  createCategoryValidators,
  inventoryController.createCategory
);

// =============================================================================
// SUPPLIERS
// =============================================================================

/**
 * GET /api/inventory/suppliers
 * List suppliers. Finance and above.
 * Query: ?search=Dell&page=1&limit=20
 */
router.get(
  "/suppliers",
  authorizeRoles("ADMIN", "MANAGER", "FINANCE"),
  inventoryController.listSuppliers
);

/**
 * POST /api/inventory/suppliers
 * Create a new supplier record. ADMIN / MANAGER only.
 *
 * Body: { "name": "HP Inc.", "email": "orders@hp.com", "phone": "+1-800-000-0000" }
 */
router.post(
  "/suppliers",
  authorizeRoles("ADMIN", "MANAGER"),
  createSupplierValidators,
  inventoryController.createSupplier
);

// =============================================================================
// ITEM COLLECTION
// =============================================================================

/**
 * GET /api/inventory
 * Paginated, filtered, searchable item list.
 *
 * Query parameters:
 *   page=1            Current page (default 1)
 *   limit=20          Page size (default 20, max 100)
 *   search=laptop     Filter by name or SKU (case-insensitive)
 *   categoryId=abc    Filter by category ID
 *   supplierId=xyz    Filter by supplier ID
 *   status=low        Filter: all | ok | low | critical | inactive
 *   sortBy=quantity   Sort field: name|sku|quantity|unitPrice|totalValue|createdAt
 *   sortOrder=asc     Sort direction: asc | desc
 *   warehouseZone=A1  Filter by warehouse zone
 *
 * Example:
 *   GET /api/inventory?status=low&sortBy=quantity&sortOrder=asc&limit=50
 */
router.get(
  "/",
  listInventoryValidators,
  inventoryController.listItems
);

/**
 * POST /api/inventory
 * Create a new inventory item. ADMIN / MANAGER only.
 *
 * Example body:
 * {
 *   "sku": "SSD-128",
 *   "name": "Samsung 1TB SSD",
 *   "description": "Samsung 970 EVO Plus NVMe M.2",
 *   "quantity": 25,
 *   "reorderPoint": 10,
 *   "unitPrice": 89.99,
 *   "categoryId": "cat_components_id",
 *   "supplierId": "sup_samsung_id",
 *   "warehouseZone": "A3"
 * }
 *
 * Example success response:
 * {
 *   "success": true,
 *   "message": "Inventory item 'SSD-128' created successfully.",
 *   "data": {
 *     "id": "clx...",
 *     "sku": "SSD-128",
 *     "name": "Samsung 1TB SSD",
 *     "quantity": 25,
 *     "reorderPoint": 10,
 *     "unitPrice": 89.99,
 *     "totalValue": 2249.75,
 *     "status": "ok",
 *     "category": { "id": "...", "name": "Components" },
 *     "supplier": { "id": "...", "name": "Samsung" }
 *   }
 * }
 */
router.post(
  "/",
  authorizeRoles("ADMIN", "MANAGER"),
  createItemValidators,
  inventoryController.createItem
);

// =============================================================================
// SINGLE ITEM  /:id  (dynamic routes after all static routes)
// =============================================================================

/**
 * GET /api/inventory/:id
 * Fetch item with full details including last 10 stock movements.
 */
router.get(
  "/:id",
  getByIdValidators,
  inventoryController.getItemById
);

/**
 * PUT /api/inventory/:id
 * Update item metadata. ADMIN / MANAGER only.
 * SKU is immutable — validator rejects it if present in body.
 * Quantity changes must go to /:id/adjust.
 *
 * Example body (partial update):
 * {
 *   "name": "ThinkPad X1 Carbon Gen 12",
 *   "reorderPoint": 25,
 *   "unitPrice": 1599.00
 * }
 */
router.put(
  "/:id",
  authorizeRoles("ADMIN", "MANAGER"),
  updateItemValidators,
  inventoryController.updateItem
);

/**
 * DELETE /api/inventory/:id
 * Soft-delete (deactivate) an item. ADMIN only.
 * Hard delete not supported — historical records must be preserved.
 */
router.delete(
  "/:id",
  authorizeRoles("ADMIN"),
  deleteItemValidators,
  inventoryController.deleteItem
);

// =============================================================================
// STOCK MOVEMENTS  /:id/adjust  and  /:id/movements
// =============================================================================

/**
 * POST /api/inventory/:id/adjust
 * Record a stock movement. ADMIN, MANAGER, EMPLOYEE can adjust stock.
 * HR and FINANCE are read-only.
 *
 * Movement types and their effects:
 *   IN         → quantity += amount   (receiving stock from a PO)
 *   OUT        → quantity -= amount   (issuing stock to a team; fails if insufficient)
 *   ADJUSTMENT → quantity = amount    (absolute set after physical stock count)
 *   TRANSFER   → quantity += amount   (moved from another zone; pair with OUT on source)
 *   RESERVED   → quantity += amount   (allocated to a PO, not yet consumed)
 *
 * Example — receive stock from PO:
 * POST /api/inventory/clxabc123/adjust
 * {
 *   "type": "IN",
 *   "quantity": 10,
 *   "reference": "PO-2024-007",
 *   "notes": "Received from Lenovo, all units inspected"
 * }
 *
 * Example response when stock goes critical:
 * {
 *   "success": true,
 *   "message": "Stock IN recorded. ⚠ CRITICAL stock alert for KEY-007.",
 *   "data": {
 *     "item": { "sku": "KEY-007", "quantity": 3, "reorderPoint": 15, "status": "critical" },
 *     "movement": { "id": "...", "type": "IN", "quantity": 3 },
 *     "alert": "critical"
 *   }
 * }
 */
router.post(
  "/:id/adjust",
  authorizeRoles("ADMIN", "MANAGER", "EMPLOYEE"),
  adjustStockValidators,
  inventoryController.adjustStock
);

/**
 * GET /api/inventory/:id/movements
 * Paginated stock movement history for one item.
 *
 * Query: ?page=1&limit=50&type=OUT
 *
 * Example response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "...",
 *       "type": "OUT",
 *       "quantity": -8,
 *       "reference": "ISSUE-001",
 *       "notes": "Issued to engineering team",
 *       "createdAt": "2024-01-08T..."
 *     }
 *   ],
 *   "meta": { "total": 12, "page": 1, "limit": 50 }
 * }
 */
router.get(
  "/:id/movements",
  movementHistoryValidators,
  inventoryController.getStockMovements
);

module.exports = router;
