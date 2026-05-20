import { useState, useRef } from "react";

const COLORS = {
  bg: "#0a0b0f",
  bgCard: "#111218",
  bgCardHover: "#161820",
  border: "#1e2030",
  borderLight: "#2a2d3e",
  accent: "#6366f1",
  accentHover: "#818cf8",
  accentDim: "#6366f120",
  success: "#10b981",
  successDim: "#10b98120",
  warning: "#f59e0b",
  warningDim: "#f59e0b20",
  danger: "#ef4444",
  dangerDim: "#ef444420",
  info: "#3b82f6",
  infoDim: "#3b82f620",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#334155",
};

const NAV_ITEMS = [
  { id: "dashboard", icon: "⬡", label: "Dashboard" },
  { id: "inventory", icon: "◫", label: "Inventory" },
  { id: "orders", icon: "◈", label: "Purchase Orders" },
  { id: "tasks", icon: "◎", label: "Task Board" },
  { id: "analytics", icon: "◉", label: "Analytics" },
  { id: "ai", icon: "◆", label: "AI Copilot" },
  { id: "audit", icon: "▣", label: "Audit Log" },
  { id: "settings", icon: "◌", label: "Settings" },
];

const INVENTORY_DATA = [
  { id: 1, sku: "LAP-001", name: "ThinkPad X1 Carbon", category: "Laptops", qty: 12, reorder: 20, price: 1499, supplier: "Lenovo Direct", status: "low" },
  { id: 2, sku: "MON-042", name: 'Dell UltraSharp 27"', category: "Monitors", qty: 34, reorder: 10, price: 649, supplier: "Dell Inc.", status: "ok" },
  { id: 3, sku: "KEY-007", name: "Keychron K8 Pro", category: "Peripherals", qty: 5, reorder: 15, price: 109, supplier: "Keychron", status: "critical" },
  { id: 4, sku: "SRV-003", name: "Dell PowerEdge R750", category: "Servers", qty: 3, reorder: 2, price: 8900, supplier: "Dell Inc.", status: "ok" },
  { id: 5, sku: "NET-019", name: "Cisco Catalyst 9300", category: "Networking", qty: 8, reorder: 5, price: 4200, supplier: "Cisco Systems", status: "ok" },
  { id: 6, sku: "PHN-033", name: "iPhone 15 Pro", category: "Mobile", qty: 2, reorder: 10, price: 999, supplier: "Apple Inc.", status: "critical" },
  { id: 7, sku: "CAB-011", name: "USB-C Thunderbolt Cable", category: "Accessories", qty: 87, reorder: 30, price: 29, supplier: "Anker", status: "ok" },
  { id: 8, sku: "RAM-008", name: "32GB DDR5 Module", category: "Components", qty: 19, reorder: 25, price: 189, supplier: "Corsair", status: "low" },
];

const ORDERS_DATA = [
  { id: "PO-2024-001", vendor: "Lenovo Direct", amount: 17988, items: 12, status: "APPROVED", created: "2024-01-08", approver: "Sarah Chen" },
  { id: "PO-2024-002", vendor: "Dell Inc.", amount: 35700, items: 4, status: "PENDING_APPROVAL", created: "2024-01-10", approver: null },
  { id: "PO-2024-003", vendor: "Apple Inc.", amount: 9990, items: 10, status: "DRAFT", created: "2024-01-11", approver: null },
  { id: "PO-2024-004", vendor: "Cisco Systems", amount: 42000, items: 10, status: "COMPLETED", created: "2023-12-28", approver: "Marcus Webb" },
  { id: "PO-2024-005", vendor: "Keychron", amount: 1635, items: 15, status: "REJECTED", created: "2024-01-05", approver: "Sarah Chen" },
  { id: "PO-2024-006", vendor: "Corsair", amount: 4725, items: 25, status: "PENDING_APPROVAL", created: "2024-01-12", approver: null },
];

const TASKS_DATA = {
  todo: [
    { id: "T-001", title: "Audit Q4 inventory discrepancies", priority: "high", assignee: "Alex Kim", due: "Jan 15" },
    { id: "T-002", title: "Update supplier contracts", priority: "medium", assignee: "Jamie Park", due: "Jan 20" },
    { id: "T-003", title: "Configure new Cisco switches", priority: "low", assignee: "Sam Torres", due: "Jan 25" },
  ],
  inprogress: [
    { id: "T-004", title: "Server room reorganization", priority: "high", assignee: "Alex Kim", due: "Jan 14" },
    { id: "T-005", title: "Q1 budget forecast review", priority: "high", assignee: "Jordan Lee", due: "Jan 13" },
    { id: "T-006", title: "Employee device refresh program", priority: "medium", assignee: "Jamie Park", due: "Jan 18" },
  ],
  review: [
    { id: "T-007", title: "Vendor evaluation report", priority: "medium", assignee: "Marcus Webb", due: "Jan 12" },
  ],
  done: [
    { id: "T-008", title: "Annual compliance audit", priority: "high", assignee: "Sarah Chen", due: "Jan 5" },
    { id: "T-009", title: "New ERP module training", priority: "low", assignee: "Sam Torres", due: "Jan 8" },
  ],
};

const AUDIT_DATA = [
  { id: 1, ts: "2024-01-12 14:32", user: "Sarah Chen", role: "Manager", action: "APPROVED", entity: "PO-2024-001", detail: "Purchase order approved — ₹17,988" },
  { id: 2, ts: "2024-01-12 13:15", user: "Alex Kim", role: "Admin", action: "CREATED", entity: "INV-006", detail: "Added item: iPhone 15 Pro (qty: 2)" },
  { id: 3, ts: "2024-01-12 11:48", user: "Jordan Lee", role: "Finance", action: "REJECTED", entity: "PO-2024-005", detail: "Insufficient budget allocation" },
  { id: 4, ts: "2024-01-12 10:22", user: "System", role: "AI", action: "ALERT", entity: "INV-003", detail: "Low stock alert: Keychron K8 Pro (qty: 5)" },
  { id: 5, ts: "2024-01-11 17:05", user: "Jamie Park", role: "Employee", action: "UPDATED", entity: "T-006", detail: "Task status changed: Todo → In Progress" },
  { id: 6, ts: "2024-01-11 15:30", user: "Marcus Webb", role: "Manager", action: "CREATED", entity: "PO-2024-006", detail: "New PO submitted for Corsair (₹4,725)" },
  { id: 7, ts: "2024-01-11 09:14", user: "Sarah Chen", role: "Manager", action: "LOGIN", entity: "AUTH", detail: "Successful login from 192.168.1.45" },
  { id: 8, ts: "2024-01-10 16:47", user: "AI Copilot", role: "AI", action: "GENERATED", entity: "REPORT", detail: "Q4 analytics report auto-generated" },
];

function Sparkline({ data, color }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBadge({ status }) {
  const map = {
    ok: { label: "In Stock", bg: "#10b98115", color: "#10b981" },
    low: { label: "Low Stock", bg: "#f59e0b15", color: "#f59e0b" },
    critical: { label: "Critical", bg: "#ef444415", color: "#ef4444" },
    DRAFT: { label: "Draft", bg: "#64748b15", color: "#94a3b8" },
    PENDING_APPROVAL: { label: "Pending", bg: "#f59e0b15", color: "#f59e0b" },
    APPROVED: { label: "Approved", bg: "#10b98115", color: "#10b981" },
    REJECTED: { label: "Rejected", bg: "#ef444415", color: "#ef4444" },
    COMPLETED: { label: "Completed", bg: "#6366f115", color: "#6366f1" },
    high: { label: "High", bg: "#ef444415", color: "#ef4444" },
    medium: { label: "Medium", bg: "#f59e0b15", color: "#f59e0b" },
    low2: { label: "Low", bg: "#10b98115", color: "#10b981" },
    APPROVED2: { label: "Approved", bg: "#10b98115", color: "#10b981" },
    CREATED: { label: "Created", bg: "#3b82f615", color: "#3b82f6" },
    REJECTED2: { label: "Rejected", bg: "#ef444415", color: "#ef4444" },
    ALERT: { label: "Alert", bg: "#f59e0b15", color: "#f59e0b" },
    UPDATED: { label: "Updated", bg: "#6366f115", color: "#6366f1" },
    LOGIN: { label: "Login", bg: "#10b98115", color: "#10b981" },
    GENERATED: { label: "Generated", bg: "#8b5cf615", color: "#8b5cf6" },
  };
  const s = map[status] || { label: status, bg: "#64748b15", color: "#94a3b8" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function KpiCard({ label, value, change, positive, spark, color }) {
  return (
    <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, transition: "border-color 0.2s", cursor: "default" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.borderLight}
      onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>{label}</span>
        {spark && <Sparkline data={spark} color={color || COLORS.accent} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.02em" }}>{value}</div>
      {change && (
        <div style={{ fontSize: 12, color: positive ? COLORS.success : COLORS.danger, display: "flex", alignItems: "center", gap: 4 }}>
          {positive ? "↑" : "↓"} {change} vs last month
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <KpiCard label="Total Revenue" value="$2.4M" change="12.5%" positive spark={[40, 55, 48, 62, 58, 72, 80, 74, 88, 92]} color="#6366f1" />
        <KpiCard label="Active POs" value="24" change="3.2%" positive spark={[10, 14, 11, 18, 15, 20, 22, 19, 24, 24]} color="#10b981" />
        <KpiCard label="Low Stock Alerts" value="7" change="2 items" positive={false} spark={[2, 3, 2, 4, 3, 5, 6, 5, 7, 7]} color="#f59e0b" />
        <KpiCard label="Pending Approvals" value="5" change="1.1%" positive={false} spark={[8, 6, 7, 5, 9, 6, 8, 7, 6, 5]} color="#ef4444" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 20 }}>Revenue Trend — 2024</div>
          <MiniBarChart />
        </div>
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 20 }}>Workflow Status</div>
          <DonutChart />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>Recent Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {AUDIT_DATA.slice(0, 5).map((a, i) => (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < 4 ? `1px solid ${COLORS.border}` : "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.accent, fontWeight: 700, flexShrink: 0 }}>
                  {a.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{a.detail}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{a.user} · {a.ts.split(" ")[1]}</div>
                </div>
                <StatusBadge status={a.action} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>🤖 AI Recommendations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: "⚡", text: "Reorder Keychron K8 Pro immediately — stock at 33% below threshold", type: "danger" },
              { icon: "📈", text: "Dell monitors showing 28% demand spike. Consider bulk purchase discount", type: "info" },
              { icon: "🔄", text: "PO-2024-002 has been pending 48hrs. Escalate to senior approver", type: "warning" },
              { icon: "💡", text: "Consolidate Cisco + Dell orders for Q1 to unlock 12% volume discount", type: "success" },
            ].map((r, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: r.type === "danger" ? COLORS.dangerDim : r.type === "warning" ? COLORS.warningDim : r.type === "info" ? COLORS.infoDim : COLORS.successDim, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16 }}>{r.icon}</span>
                <span style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBarChart() {
  const data = [180, 210, 195, 240, 225, 280, 260, 310, 295, 340, 320, 380];
  const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: "100%", background: i === 11 ? COLORS.accent : COLORS.accentDim, borderRadius: "3px 3px 0 0", height: `${(v / max) * 100}px`, transition: "background 0.2s" }} />
          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{months[i]}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart() {
  const segments = [
    { label: "Completed", value: 45, color: "#10b981" },
    { label: "In Progress", value: 30, color: "#6366f1" },
    { label: "Pending", value: 15, color: "#f59e0b" },
    { label: "Rejected", value: 10, color: "#ef4444" },
  ];
  const total = segments.reduce((a, b) => a + b.value, 0);
  let offset = 0;
  const r = 50, cx = 70, cy = 70, stroke = 18;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {segments.map((s) => {
          const dash = (s.value / total) * circ;
          const gap = circ - dash;
          const el = (
            <circle key={s.label} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset * circ / total}
              style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }} />
          );
          offset += s.value;
          return el;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={COLORS.text} fontSize={18} fontWeight={700}>142</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={COLORS.textMuted} fontSize={10}>workflows</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 12, color: COLORS.text, fontWeight: 600, marginLeft: "auto" }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Inventory() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = INVENTORY_DATA.filter(i =>
    (filter === "all" || i.status === filter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Total SKUs", value: INVENTORY_DATA.length, color: COLORS.accent },
          { label: "Low / Critical", value: INVENTORY_DATA.filter(i => i.status !== "ok").length, color: COLORS.warning },
          { label: "Total Value", value: "$" + INVENTORY_DATA.reduce((a, i) => a + i.qty * i.price, 0).toLocaleString(), color: COLORS.success },
        ].map(c => (
          <div key={c.label} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or name..." style={{ flex: 1, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", color: COLORS.text, fontSize: 13, outline: "none" }} />
        {["all", "ok", "low", "critical"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", borderRadius: 6, border: `1px solid ${filter === f ? COLORS.accent : COLORS.border}`, background: filter === f ? COLORS.accentDim : "transparent", color: filter === f ? COLORS.accent : COLORS.textMuted, fontSize: 12, cursor: "pointer", fontWeight: 500, textTransform: "capitalize" }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {["SKU", "Product", "Category", "Qty", "Reorder At", "Unit Price", "Supplier", "Status"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={item.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${COLORS.border}` : "none", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = COLORS.bgCardHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "13px 16px", fontSize: 12, fontFamily: "monospace", color: COLORS.accent }}>{item.sku}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{item.name}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: COLORS.textMuted }}>{item.category}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: item.qty <= item.reorder ? COLORS.warning : COLORS.text, fontWeight: 600 }}>{item.qty}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: COLORS.textMuted }}>{item.reorder}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: COLORS.text }}>${item.price.toLocaleString()}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: COLORS.textMuted }}>{item.supplier}</td>
                <td style={{ padding: "13px 16px" }}><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchaseOrders() {
  const STAGES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "COMPLETED", "REJECTED"];
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {STAGES.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 16px", whiteSpace: "nowrap" }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{s.replace("_", " ")}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>{ORDERS_DATA.filter(o => o.status === s).length}</div>
            </div>
            {i < STAGES.length - 1 && <span style={{ color: COLORS.textDim, fontSize: 18 }}>→</span>}
          </div>
        ))}
      </div>

      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {["PO ID", "Vendor", "Amount", "Items", "Status", "Created", "Approver", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDERS_DATA.map((o, i) => (
              <tr key={o.id} onClick={() => setSelected(selected === o.id ? null : o.id)}
                style={{ borderBottom: i < ORDERS_DATA.length - 1 ? `1px solid ${COLORS.border}` : "none", cursor: "pointer", transition: "background 0.15s", background: selected === o.id ? COLORS.accentDim : "transparent" }}
                onMouseEnter={e => { if (selected !== o.id) e.currentTarget.style.background = COLORS.bgCardHover; }}
                onMouseLeave={e => { if (selected !== o.id) e.currentTarget.style.background = "transparent"; }}>
                <td style={{ padding: "13px 16px", fontSize: 12, fontFamily: "monospace", color: COLORS.accent }}>{o.id}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{o.vendor}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: COLORS.text, fontWeight: 600 }}>${o.amount.toLocaleString()}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: COLORS.textMuted }}>{o.items} items</td>
                <td style={{ padding: "13px 16px" }}><StatusBadge status={o.status} /></td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: COLORS.textMuted }}>{o.created}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: COLORS.textMuted }}>{o.approver || "—"}</td>
                <td style={{ padding: "13px 16px" }}>
                  {o.status === "PENDING_APPROVAL" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${COLORS.success}`, background: COLORS.successDim, color: COLORS.success, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Approve</button>
                      <button style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${COLORS.danger}`, background: COLORS.dangerDim, color: COLORS.danger, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.accent}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: COLORS.accent, fontWeight: 600, marginBottom: 12 }}>Approval Timeline — {selected}</div>
          <div style={{ display: "flex", gap: 0 }}>
            {["Created", "Submitted", "Under Review", "Decision", "Completed"].map((stage, i) => {
              const order = ORDERS_DATA.find(o => o.id === selected);
              const active = i <= (order?.status === "COMPLETED" ? 4 : order?.status === "APPROVED" ? 3 : order?.status === "PENDING_APPROVAL" ? 2 : order?.status === "REJECTED" ? 3 : 1);
              return (
                <div key={stage} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
                    {i > 0 && <div style={{ flex: 1, height: 2, background: active ? COLORS.accent : COLORS.border }} />}
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: active ? COLORS.accent : COLORS.border, flexShrink: 0 }} />
                    {i < 4 && <div style={{ flex: 1, height: 2, background: COLORS.border }} />}
                  </div>
                  <span style={{ fontSize: 10, color: active ? COLORS.accent : COLORS.textMuted, fontWeight: active ? 600 : 400, textAlign: "center" }}>{stage}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskBoard() {
  const COLS = [
    { id: "todo", label: "To Do", color: COLORS.textMuted },
    { id: "inprogress", label: "In Progress", color: COLORS.warning },
    { id: "review", label: "In Review", color: COLORS.info },
    { id: "done", label: "Done", color: COLORS.success },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, alignItems: "start" }}>
      {COLS.map(col => (
        <div key={col.id} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{col.label}</span>
            </div>
            <span style={{ fontSize: 11, color: COLORS.textMuted, background: COLORS.bgCardHover, borderRadius: 4, padding: "2px 6px" }}>{TASKS_DATA[col.id].length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TASKS_DATA[col.id].map(task => (
              <div key={task.id} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, cursor: "pointer", transition: "border-color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.borderLight}
                onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}>
                <div style={{ fontSize: 12, color: COLORS.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>{task.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, background: COLORS.bgCard, padding: "2px 6px", borderRadius: 3 }}>{task.assignee.split(" ")[0]}</div>
                  <StatusBadge status={task.priority === "low" ? "low2" : task.priority} />
                </div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6 }}>Due {task.due}</div>
              </div>
            ))}
            <button style={{ padding: "8px", borderRadius: 7, border: `1px dashed ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontSize: 12, cursor: "pointer", width: "100%" }}>
              + Add Task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Analytics() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const revenue = [180000, 210000, 195000, 240000, 225000, 280000, 260000, 310000, 295000, 340000, 320000, 380000];
  const expenses = [140000, 160000, 150000, 180000, 170000, 200000, 195000, 225000, 210000, 245000, 235000, 268000];
  const maxVal = Math.max(...revenue);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "YTD Revenue", value: "$2.4M", sub: "+14.2% YoY" },
          { label: "YTD Expenses", value: "$1.88M", sub: "+9.1% YoY" },
          { label: "Gross Margin", value: "21.7%", sub: "+5.1 pts" },
          { label: "PO Velocity", value: "4.2 days", sub: "avg approval" },
        ].map(m => (
          <div key={m.label} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: COLORS.success }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Revenue vs Expenses</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: COLORS.textMuted }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.accent, display: "inline-block" }} />Revenue</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.danger, display: "inline-block" }} />Expenses</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160 }}>
          {months.map((m, i) => (
            <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 140 }}>
                <div style={{ flex: 1, background: COLORS.accent, borderRadius: "3px 3px 0 0", height: `${(revenue[i] / maxVal) * 100}%`, opacity: 0.9 }} />
                <div style={{ flex: 1, background: COLORS.danger, borderRadius: "3px 3px 0 0", height: `${(expenses[i] / maxVal) * 100}%`, opacity: 0.7 }} />
              </div>
              <span style={{ fontSize: 9, color: COLORS.textMuted }}>{m}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>Category Spend</div>
          {[
            { cat: "Laptops & Computers", pct: 38, amt: "$714K" },
            { cat: "Servers & Infra", pct: 28, amt: "$526K" },
            { cat: "Networking", pct: 18, amt: "$338K" },
            { cat: "Peripherals", pct: 10, amt: "$188K" },
            { cat: "Other", pct: 6, amt: "$113K" },
          ].map(s => (
            <div key={s.cat} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                <span style={{ color: COLORS.textMuted }}>{s.cat}</span>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>{s.amt}</span>
              </div>
              <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${s.pct}%`, background: COLORS.accent, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 16 }}>Approval Efficiency</div>
          {[
            { label: "Approved same day", value: "34%", color: COLORS.success },
            { label: "Approved within 3 days", value: "28%", color: COLORS.info },
            { label: "Approved within week", value: "22%", color: COLORS.warning },
            { label: "Escalated / Delayed", value: "11%", color: COLORS.danger },
            { label: "Rejected", value: "5%", color: COLORS.textMuted },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${COLORS.border}`, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>{s.label}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AICopilot() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm your AI ERP Copilot. I can help you create purchase orders, analyze inventory, generate reports, and automate workflows. What would you like to do today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const SYSTEM = `You are an AI Copilot for an enterprise ERP system called NexusERP. You help users manage inventory, purchase orders, tasks, analytics, and workflows. You have access to this data:

Inventory: ${JSON.stringify(INVENTORY_DATA.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, reorder: i.reorder, status: i.status })))}

Purchase Orders: ${JSON.stringify(ORDERS_DATA.map(o => ({ id: o.id, vendor: o.vendor, amount: o.amount, status: o.status })))}

Tasks: ${JSON.stringify(Object.entries(TASKS_DATA).flatMap(([stage, tasks]) => tasks.map(t => ({ ...t, stage }))))}

Be concise, action-oriented, and helpful. Use bullet points when listing items. If asked to create something, describe what you would do step by step. If asked about data, reference the actual numbers. Keep responses under 200 words.`;

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't process that request.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const SUGGESTIONS = [
    "What items need reordering?",
    "Create a PO for 20 laptops",
    "Show approval bottlenecks",
    "Which vendor has most POs?",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)", minHeight: 500 }}>
      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◆</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>NexusERP AI Copilot</div>
            <div style={{ fontSize: 11, color: COLORS.success, display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.success }} /> Online · Claude claude-sonnet-4-20250514
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 12, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "assistant" && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.accent, flexShrink: 0 }}>◆</div>
              )}
              <div style={{ maxWidth: "75%", padding: "12px 16px", borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.role === "user" ? COLORS.accent : COLORS.bgCardHover, fontSize: 13, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
              {m.role === "user" && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: COLORS.accent, flexShrink: 0, fontWeight: 700 }}>U</div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.accent }}>◆</div>
              <div style={{ padding: "12px 16px", borderRadius: "12px 12px 12px 3px", background: COLORS.bgCardHover }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(d => (
                    <div key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.accent, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${d * 0.2}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setInput(s)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontSize: 11, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask anything — create POs, analyze inventory, generate reports..."
              style={{ flex: 1, background: COLORS.bgCardHover, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 13, outline: "none" }} />
            <button onClick={send} disabled={loading || !input.trim()}
              style={{ padding: "10px 18px", borderRadius: 8, background: COLORS.accent, border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1 }}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditLog() {
  const ACTION_COLORS = { APPROVED: COLORS.success, CREATED: COLORS.info, REJECTED: COLORS.danger, ALERT: COLORS.warning, UPDATED: COLORS.accent, LOGIN: COLORS.success, GENERATED: "#8b5cf6" };
  return (
    <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Audit Trail</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontSize: 12, cursor: "pointer" }}>Export CSV</button>
          <button style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, fontSize: 12, cursor: "pointer" }}>Filter</button>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            {["Timestamp", "User", "Role", "Action", "Entity", "Details"].map(h => (
              <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AUDIT_DATA.map((a, i) => (
            <tr key={a.id} style={{ borderBottom: i < AUDIT_DATA.length - 1 ? `1px solid ${COLORS.border}` : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = COLORS.bgCardHover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "12px 16px", fontSize: 11, fontFamily: "monospace", color: COLORS.textMuted, whiteSpace: "nowrap" }}>{a.ts}</td>
              <td style={{ padding: "12px 16px", fontSize: 12, color: COLORS.text, fontWeight: 500 }}>{a.user}</td>
              <td style={{ padding: "12px 16px", fontSize: 11, color: COLORS.textMuted }}>{a.role}</td>
              <td style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ACTION_COLORS[a.action] || COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{a.action}</span>
              </td>
              <td style={{ padding: "12px 16px", fontSize: 11, fontFamily: "monospace", color: COLORS.accent }}>{a.entity}</td>
              <td style={{ padding: "12px 16px", fontSize: 12, color: COLORS.textMuted }}>{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Settings() {
  const [theme, setTheme] = useState("dark");
  const [notifs, setNotifs] = useState(true);
  const [aiRecs, setAiRecs] = useState(true);

  const Toggle = ({ value, onChange }) => (
    <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, background: value ? COLORS.accent : COLORS.border, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: value ? 21 : 3, transition: "left 0.2s" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {[
        {
          title: "Organization",
          items: [
            { label: "Company Name", type: "input", value: "Acme Corp" },
            { label: "Industry", type: "select", value: "Technology" },
            { label: "Fiscal Year Start", type: "input", value: "January 1" },
          ]
        },
        {
          title: "Preferences",
          items: [
            { label: "Theme", type: "toggle-group", value: theme, options: ["dark", "light"], onChange: setTheme },
            { label: "Email Notifications", type: "toggle", value: notifs, onChange: setNotifs },
            { label: "AI Recommendations", type: "toggle", value: aiRecs, onChange: setAiRecs },
          ]
        },
        {
          title: "Users & Permissions",
          items: null,
          custom: (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {["Admin", "Manager", "Finance", "HR", "Employee"].map(role => (
                <div key={role} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{role === "Admin" ? "👑" : role === "Manager" ? "🎯" : role === "Finance" ? "💰" : role === "HR" ? "👥" : "👤"}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>{role}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
                    {role === "Admin" ? "Full access" : role === "Manager" ? "Approve POs" : role === "Finance" ? "View reports" : role === "HR" ? "Manage staff" : "Tasks only"}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      ].map(section => (
        <div key={section.title} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, fontWeight: 600, color: COLORS.text }}>{section.title}</div>
          <div style={{ padding: 20 }}>
            {section.custom || section.items?.map(item => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}>{item.label}</span>
                {item.type === "input" && (
                  <input defaultValue={item.value} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", color: COLORS.text, fontSize: 12, outline: "none", width: 200 }} />
                )}
                {item.type === "toggle" && <Toggle value={item.value} onChange={item.onChange} />}
                {item.type === "toggle-group" && (
                  <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
                    {item.options.map(o => (
                      <button key={o} onClick={() => item.onChange(o)} style={{ padding: "5px 12px", border: "none", background: item.value === o ? COLORS.accent : "transparent", color: item.value === o ? "white" : COLORS.textMuted, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>{o}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [user] = useState({ name: "Sarah Chen", role: "Manager", initials: "SC" });
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const MODULES = {
    dashboard: { label: "Dashboard", component: <Dashboard /> },
    inventory: { label: "Inventory Management", component: <Inventory /> },
    orders: { label: "Purchase Orders", component: <PurchaseOrders /> },
    tasks: { label: "Task Board", component: <TaskBoard /> },
    analytics: { label: "Analytics & Reports", component: <Analytics /> },
    ai: { label: "AI Copilot", component: <AICopilot /> },
    audit: { label: "Audit Log", component: <AuditLog /> },
    settings: { label: "Settings", component: <Settings /> },
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        @keyframes pulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        input, button, select { font-family: inherit; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 64 : 220, background: COLORS.bgCard, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", transition: "width 0.3s ease", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setSidebarCollapsed(p => !p)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>⬡</div>
          {!sidebarCollapsed && <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, whiteSpace: "nowrap" }}>NexusERP</div>}
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV_ITEMS.map(item => {
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, border: "none", background: isActive ? COLORS.accentDim : "transparent", color: isActive ? COLORS.accent : COLORS.textMuted, cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: isActive ? 600 : 400, transition: "all 0.15s", width: "100%", whiteSpace: "nowrap" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = COLORS.bgCardHover; e.currentTarget.style.color = COLORS.text; }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = COLORS.textMuted; } }}>
                <span style={{ fontSize: 16, flexShrink: 0, width: 20, textAlign: "center" }}>{item.icon}</span>
                {!sidebarCollapsed && item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: COLORS.accent, fontWeight: 700, flexShrink: 0 }}>{user.initials}</div>
            {!sidebarCollapsed && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>{user.name}</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted }}>{user.role}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ height: 56, borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: COLORS.text }}>{MODULES[active].label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 12px", flex: "0 0 220px" }}>
            <span style={{ color: COLORS.textMuted, fontSize: 13 }}>⌕</span>
            <input placeholder="Search..." style={{ border: "none", background: "transparent", color: COLORS.text, fontSize: 13, outline: "none", width: "100%" }} />
          </div>
          <div style={{ position: "relative" }}>
            <button onClick={() => setNotifOpen(p => !p)} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bgCard, color: COLORS.textMuted, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>🔔</button>
            <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: COLORS.danger, border: `2px solid ${COLORS.bg}` }} />
            {notifOpen && (
              <div style={{ position: "absolute", top: 44, right: 0, width: 300, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, fontWeight: 600, color: COLORS.text }}>Notifications</div>
                {[
                  { icon: "⚠️", msg: "Keychron K8 Pro: critical stock level", time: "2m ago" },
                  { icon: "📋", msg: "PO-2024-002 awaiting your approval", time: "1h ago" },
                  { icon: "🤖", msg: "AI generated Q4 inventory report", time: "3h ago" },
                ].map((n, i) => (
                  <div key={i} style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 10, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.bgCardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 16 }}>{n.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.text }}>{n.msg}</div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.accent, fontWeight: 700 }}>{user.initials}</div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }} onClick={() => notifOpen && setNotifOpen(false)}>
          {MODULES[active].component}
        </div>
      </div>
    </div>
  );
}