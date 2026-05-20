// prisma/seed.js
// Seed NexusERP with realistic demo data

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding NexusERP database...");

  // ─── Clean slate ──────────────────────────────────────────────────────────
  await prisma.auditLog.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.purchaseOrderApproval.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventoryCategory.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();

  const SALT = 10;
  const defaultPassword = await bcrypt.hash("NexusERP@2024", SALT);

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = await Promise.all([
    prisma.user.create({ data: { email: "admin@nexuserp.com",    passwordHash: defaultPassword, firstName: "Alex",   lastName: "Kim",    role: "ADMIN",    department: "IT",          lastLoginAt: new Date() } }),
    prisma.user.create({ data: { email: "sarah@nexuserp.com",    passwordHash: defaultPassword, firstName: "Sarah",  lastName: "Chen",   role: "MANAGER",  department: "Operations",  lastLoginAt: new Date() } }),
    prisma.user.create({ data: { email: "marcus@nexuserp.com",   passwordHash: defaultPassword, firstName: "Marcus", lastName: "Webb",   role: "MANAGER",  department: "Procurement", lastLoginAt: new Date() } }),
    prisma.user.create({ data: { email: "jordan@nexuserp.com",   passwordHash: defaultPassword, firstName: "Jordan", lastName: "Lee",    role: "FINANCE",  department: "Finance",     lastLoginAt: new Date() } }),
    prisma.user.create({ data: { email: "jamie@nexuserp.com",    passwordHash: defaultPassword, firstName: "Jamie",  lastName: "Park",   role: "HR",       department: "HR",          lastLoginAt: new Date() } }),
    prisma.user.create({ data: { email: "sam@nexuserp.com",      passwordHash: defaultPassword, firstName: "Sam",    lastName: "Torres", role: "EMPLOYEE", department: "IT",          lastLoginAt: new Date() } }),
  ]);

  const [admin, sarah, marcus, jordan, jamie, sam] = users;
  console.log(`✅ Created ${users.length} users`);

  // ─── Suppliers ────────────────────────────────────────────────────────────
  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { name: "Lenovo Direct",  email: "orders@lenovo.com",   phone: "+1-800-426-7378", address: "Research Triangle Park, NC", website: "https://lenovo.com" } }),
    prisma.supplier.create({ data: { name: "Dell Inc.",      email: "orders@dell.com",     phone: "+1-800-289-3355", address: "Round Rock, TX",             website: "https://dell.com" } }),
    prisma.supplier.create({ data: { name: "Apple Inc.",     email: "business@apple.com",  phone: "+1-800-275-2273", address: "Cupertino, CA",              website: "https://apple.com" } }),
    prisma.supplier.create({ data: { name: "Cisco Systems",  email: "orders@cisco.com",    phone: "+1-800-553-6387", address: "San Jose, CA",               website: "https://cisco.com" } }),
    prisma.supplier.create({ data: { name: "Keychron",       email: "sales@keychron.com",  phone: "+1-888-000-0001", address: "Los Angeles, CA",            website: "https://keychron.com" } }),
    prisma.supplier.create({ data: { name: "Corsair",        email: "sales@corsair.com",   phone: "+1-888-222-4346", address: "Milpitas, CA",               website: "https://corsair.com" } }),
    prisma.supplier.create({ data: { name: "Anker",          email: "orders@anker.com",    phone: "+1-888-649-9866", address: "Shenzhen, China",            website: "https://anker.com" } }),
  ]);

  const [lenovo, dell, apple, cisco, keychron, corsair, anker] = suppliers;
  console.log(`✅ Created ${suppliers.length} suppliers`);

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.inventoryCategory.create({ data: { name: "Laptops",       description: "Portable computing devices" } }),
    prisma.inventoryCategory.create({ data: { name: "Monitors",      description: "Display screens and monitors" } }),
    prisma.inventoryCategory.create({ data: { name: "Peripherals",   description: "Keyboards, mice, and accessories" } }),
    prisma.inventoryCategory.create({ data: { name: "Servers",       description: "Server hardware and rack equipment" } }),
    prisma.inventoryCategory.create({ data: { name: "Networking",    description: "Network switches, routers, and cabling" } }),
    prisma.inventoryCategory.create({ data: { name: "Mobile",        description: "Smartphones and tablets" } }),
    prisma.inventoryCategory.create({ data: { name: "Accessories",   description: "Cables, adapters, and miscellaneous" } }),
    prisma.inventoryCategory.create({ data: { name: "Components",    description: "RAM, SSDs, CPUs, and components" } }),
  ]);

  const [catLaptops, catMonitors, catPeripherals, catServers, catNetworking, catMobile, catAccessories, catComponents] = categories;
  console.log(`✅ Created ${categories.length} categories`);

  // ─── Inventory Items ──────────────────────────────────────────────────────
  const inventoryItems = await Promise.all([
    prisma.inventoryItem.create({ data: { sku: "LAP-001", name: "ThinkPad X1 Carbon",       quantity: 12, reorderPoint: 20, unitPrice: 1499.00, totalValue: 17988.00, categoryId: catLaptops.id,     supplierId: lenovo.id,   warehouseZone: "A1" } }),
    prisma.inventoryItem.create({ data: { sku: "MON-042", name: 'Dell UltraSharp 27"',      quantity: 34, reorderPoint: 10, unitPrice: 649.00,  totalValue: 22066.00, categoryId: catMonitors.id,    supplierId: dell.id,     warehouseZone: "B2" } }),
    prisma.inventoryItem.create({ data: { sku: "KEY-007", name: "Keychron K8 Pro",           quantity: 5,  reorderPoint: 15, unitPrice: 109.00,  totalValue: 545.00,   categoryId: catPeripherals.id, supplierId: keychron.id, warehouseZone: "C1" } }),
    prisma.inventoryItem.create({ data: { sku: "SRV-003", name: "Dell PowerEdge R750",       quantity: 3,  reorderPoint: 2,  unitPrice: 8900.00, totalValue: 26700.00, categoryId: catServers.id,     supplierId: dell.id,     warehouseZone: "D1" } }),
    prisma.inventoryItem.create({ data: { sku: "NET-019", name: "Cisco Catalyst 9300",       quantity: 8,  reorderPoint: 5,  unitPrice: 4200.00, totalValue: 33600.00, categoryId: catNetworking.id,  supplierId: cisco.id,    warehouseZone: "D2" } }),
    prisma.inventoryItem.create({ data: { sku: "PHN-033", name: "iPhone 15 Pro",             quantity: 2,  reorderPoint: 10, unitPrice: 999.00,  totalValue: 1998.00,  categoryId: catMobile.id,      supplierId: apple.id,    warehouseZone: "C2" } }),
    prisma.inventoryItem.create({ data: { sku: "CAB-011", name: "USB-C Thunderbolt Cable",   quantity: 87, reorderPoint: 30, unitPrice: 29.00,   totalValue: 2523.00,  categoryId: catAccessories.id, supplierId: anker.id,    warehouseZone: "E1" } }),
    prisma.inventoryItem.create({ data: { sku: "RAM-008", name: "32GB DDR5 Module",          quantity: 19, reorderPoint: 25, unitPrice: 189.00,  totalValue: 3591.00,  categoryId: catComponents.id,  supplierId: corsair.id,  warehouseZone: "A2" } }),
  ]);

  console.log(`✅ Created ${inventoryItems.length} inventory items`);

  // ─── Purchase Orders ──────────────────────────────────────────────────────
  const po1 = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2024-001",
      status: "APPROVED",
      totalAmount: 17988.00,
      notes: "Q1 laptop refresh for engineering team",
      creatorId: marcus.id,
      supplierId: lenovo.id,
      expectedAt: new Date("2024-02-01"),
      items: {
        create: [{ quantity: 12, unitPrice: 1499.00, totalPrice: 17988.00, itemId: inventoryItems[0].id, itemName: "ThinkPad X1 Carbon" }]
      },
      approvals: {
        create: [{ action: "APPROVED", comment: "Approved for Q1 refresh cycle", approverId: sarah.id }]
      }
    }
  });

  const po2 = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2024-002",
      status: "PENDING_APPROVAL",
      totalAmount: 35700.00,
      notes: "Data center expansion — server hardware",
      creatorId: marcus.id,
      supplierId: dell.id,
      expectedAt: new Date("2024-02-15"),
      items: {
        create: [{ quantity: 4, unitPrice: 8925.00, totalPrice: 35700.00, itemId: inventoryItems[3].id, itemName: "Dell PowerEdge R750" }]
      }
    }
  });

  const po3 = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2024-003",
      status: "DRAFT",
      totalAmount: 9990.00,
      notes: "Mobile devices for sales team",
      creatorId: sam.id,
      supplierId: apple.id,
      items: {
        create: [{ quantity: 10, unitPrice: 999.00, totalPrice: 9990.00, itemId: inventoryItems[5].id, itemName: "iPhone 15 Pro" }]
      }
    }
  });

  const po4 = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2024-004",
      status: "COMPLETED",
      totalAmount: 42000.00,
      notes: "Network infrastructure upgrade",
      creatorId: marcus.id,
      supplierId: cisco.id,
      completedAt: new Date("2024-01-05"),
      items: {
        create: [{ quantity: 10, unitPrice: 4200.00, totalPrice: 42000.00, itemId: inventoryItems[4].id, itemName: "Cisco Catalyst 9300" }]
      },
      approvals: {
        create: [{ action: "APPROVED", comment: "Critical infrastructure — approved", approverId: marcus.id }]
      }
    }
  });

  const po5 = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2024-005",
      status: "REJECTED",
      totalAmount: 1635.00,
      notes: "Keyboard upgrades for entire office",
      creatorId: sam.id,
      supplierId: keychron.id,
      items: {
        create: [{ quantity: 15, unitPrice: 109.00, totalPrice: 1635.00, itemId: inventoryItems[2].id, itemName: "Keychron K8 Pro" }]
      },
      approvals: {
        create: [{ action: "REJECTED", comment: "Insufficient Q1 budget allocation. Defer to Q2.", approverId: sarah.id }]
      }
    }
  });

  const po6 = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2024-006",
      status: "PENDING_APPROVAL",
      totalAmount: 4725.00,
      notes: "RAM upgrade for developer workstations",
      creatorId: marcus.id,
      supplierId: corsair.id,
      items: {
        create: [{ quantity: 25, unitPrice: 189.00, totalPrice: 4725.00, itemId: inventoryItems[7].id, itemName: "32GB DDR5 Module" }]
      }
    }
  });

  console.log(`✅ Created 6 purchase orders`);

  // ─── Tasks ────────────────────────────────────────────────────────────────
  const tasks = await Promise.all([
    prisma.task.create({ data: { title: "Audit Q4 inventory discrepancies",   stage: "TODO",        priority: "HIGH",   assigneeId: admin.id,   creatorId: sarah.id,  dueDate: new Date("2024-01-15"), tags: ["inventory", "audit"] } }),
    prisma.task.create({ data: { title: "Update supplier contracts",           stage: "TODO",        priority: "MEDIUM", assigneeId: jamie.id,   creatorId: sarah.id,  dueDate: new Date("2024-01-20"), tags: ["procurement", "legal"] } }),
    prisma.task.create({ data: { title: "Configure new Cisco switches",        stage: "TODO",        priority: "LOW",    assigneeId: sam.id,     creatorId: admin.id,  dueDate: new Date("2024-01-25"), tags: ["networking", "infra"] } }),
    prisma.task.create({ data: { title: "Server room reorganization",          stage: "IN_PROGRESS", priority: "HIGH",   assigneeId: admin.id,   creatorId: admin.id,  dueDate: new Date("2024-01-14"), tags: ["infra", "hardware"] } }),
    prisma.task.create({ data: { title: "Q1 budget forecast review",           stage: "IN_PROGRESS", priority: "HIGH",   assigneeId: jordan.id,  creatorId: sarah.id,  dueDate: new Date("2024-01-13"), tags: ["finance", "planning"] } }),
    prisma.task.create({ data: { title: "Employee device refresh program",     stage: "IN_PROGRESS", priority: "MEDIUM", assigneeId: jamie.id,   creatorId: sarah.id,  dueDate: new Date("2024-01-18"), tags: ["hr", "devices"] } }),
    prisma.task.create({ data: { title: "Vendor evaluation report",            stage: "REVIEW",      priority: "MEDIUM", assigneeId: marcus.id,  creatorId: sarah.id,  dueDate: new Date("2024-01-12"), tags: ["procurement", "vendors"] } }),
    prisma.task.create({ data: { title: "Annual compliance audit",             stage: "DONE",        priority: "HIGH",   assigneeId: sarah.id,   creatorId: admin.id,  dueDate: new Date("2024-01-05"), completedAt: new Date("2024-01-05"), tags: ["compliance"] } }),
    prisma.task.create({ data: { title: "New ERP module training",             stage: "DONE",        priority: "LOW",    assigneeId: sam.id,     creatorId: jamie.id,  dueDate: new Date("2024-01-08"), completedAt: new Date("2024-01-08"), tags: ["training", "erp"] } }),
  ]);

  await prisma.taskComment.createMany({
    data: [
      { taskId: tasks[0].id, content: "Found 3 SKUs with mismatched counts — investigating warehouse logs." },
      { taskId: tasks[3].id, content: "Zone A cleared. Moving to Zone B tomorrow." },
      { taskId: tasks[4].id, content: "Draft sent to Finance team for review." },
    ]
  });

  console.log(`✅ Created ${tasks.length} tasks with comments`);

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { userId: sarah.id,  action: "APPROVED",  entity: "purchase_orders", entityId: po1.id, detail: "Purchase order PO-2024-001 approved — $17,988", ipAddress: "192.168.1.45" },
      { userId: admin.id,  action: "CREATED",   entity: "inventory_items", entityId: inventoryItems[5].id, detail: "Added item: iPhone 15 Pro (qty: 2)", ipAddress: "192.168.1.12" },
      { userId: jordan.id, action: "REJECTED",  entity: "purchase_orders", entityId: po5.id, detail: "PO-2024-005 rejected: insufficient budget", ipAddress: "192.168.1.34" },
      { userId: null,      action: "ALERT",     entity: "inventory_items", entityId: inventoryItems[2].id, detail: "Low stock alert: Keychron K8 Pro (qty: 5, threshold: 15)" },
      { userId: jamie.id,  action: "UPDATED",   entity: "tasks", entityId: tasks[5].id, detail: "Task stage changed: TODO → IN_PROGRESS", ipAddress: "192.168.1.56" },
      { userId: marcus.id, action: "CREATED",   entity: "purchase_orders", entityId: po6.id, detail: "New PO submitted: Corsair RAM — $4,725", ipAddress: "192.168.1.23" },
      { userId: sarah.id,  action: "LOGIN",     entity: "auth", detail: "Successful login", ipAddress: "192.168.1.45" },
      { userId: null,      action: "GENERATED", entity: "analytics", detail: "Q4 analytics snapshot auto-generated" },
    ]
  });

  console.log(`✅ Created audit log entries`);

  // ─── Analytics Snapshots ──────────────────────────────────────────────────
  const months = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06",
                  "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12"];
  const revenueData = [180000, 210000, 195000, 240000, 225000, 280000, 260000, 310000, 295000, 340000, 320000, 380000];
  const expenseData = [140000, 160000, 150000, 180000, 170000, 200000, 195000, 225000, 210000, 245000, 235000, 268000];

  const snapshots = [];
  months.forEach((m, i) => {
    snapshots.push(
      { metric: "revenue",  snapshotDate: new Date(`${m}-01`), value: revenueData[i], dimension: "monthly", createdById: jordan.id },
      { metric: "expenses", snapshotDate: new Date(`${m}-01`), value: expenseData[i], dimension: "monthly", createdById: jordan.id }
    );
  });
  await prisma.analyticsSnapshot.createMany({ data: snapshots });

  console.log(`✅ Created ${snapshots.length} analytics snapshots`);

  // ─── Stock Movements ──────────────────────────────────────────────────────
  await prisma.stockMovement.createMany({
    data: [
      { itemId: inventoryItems[0].id, type: "IN",  quantity: 20,  reference: "PO-2024-001", notes: "Initial stock receipt" },
      { itemId: inventoryItems[0].id, type: "OUT", quantity: 8,   reference: "ISSUE-001",   notes: "Issued to engineering team" },
      { itemId: inventoryItems[2].id, type: "IN",  quantity: 20,  reference: "PO-2023-041", notes: "Q4 stock" },
      { itemId: inventoryItems[2].id, type: "OUT", quantity: 15,  reference: "ISSUE-002",   notes: "Office distribution" },
      { itemId: inventoryItems[5].id, type: "IN",  quantity: 10,  reference: "PO-2023-038", notes: "Sales team mobiles" },
      { itemId: inventoryItems[5].id, type: "OUT", quantity: 8,   reference: "ISSUE-003",   notes: "Distributed to sales team" },
    ]
  });

  console.log("✅ Created stock movement history");
  console.log("\n🎉 Seed complete! Default password for all users: NexusERP@2024");
  console.log("\nUser accounts:");
  users.forEach(u => console.log(`  ${u.role.padEnd(10)} → ${u.email}`));
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());