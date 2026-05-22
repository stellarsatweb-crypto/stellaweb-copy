/* ================= FINANCE MODULE ADAPTER =================
   Keeps shared sidebar/auth/layout intact and renders adapted standalone
   Finance functions inside this role module.
*/

const getFinanceMainContent = () => document.getElementById("mainContent");

function financePageHeader({ title, subtitle, icon, searchId = "", extraClass = "", controls = "" }) {
  const search = searchId ? `
        <div style="width:338px;max-width:100%;height:54px;display:inline-flex;align-items:center;gap:12px;padding:0 24px;border-radius:999px;border:1px solid #dbe4ef;background:#fff;box-shadow:0 3px 10px rgba(20,44,86,.08);">
          <i class="ri-search-line" style="color:#8a9bb4;font-size:20px;"></i>
          <input type="text" placeholder="Search here" id="${searchId}" style="width:100%;min-width:0;height:100%;border:0;outline:0;background:transparent;color:#3f4b5f;font-size:16px;font-weight:500;">
        </div>` : "";
  const headerControls = search || controls ? `
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap;">
          ${search}
          ${controls}
        </div>` : "";

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;min-height:92px;padding:32px 22px 18px;margin:0;background:transparent;border:0;border-radius:0;box-shadow:none;color:#173d7a;">
      <div style="display:flex;align-items:center;gap:14px;min-width:240px;flex:1 1 auto;">
        <i class="${icon}" style="width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;color:#173d7a;font-size:29px;"></i>
        <div>
          <h2 style="margin:0;color:#173d7a;font-size:34px;line-height:1.1;font-weight:900;letter-spacing:-.6px;">${title}</h2>
        </div>
      </div>
      ${headerControls}
    </div>`;
}
const financeUser = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
const FINANCE_STANDALONE_API = "";
const financeChartColors = {
  income: "#2563eb",
  expense: "#dc2626",
  collection: "#16a34a",
  project: "#d97706",
  muted: "#64748b",
  card: "#ffffff"
};

/* ── Safe fallbacks for shared utilities from session.js ── */
if (typeof formatCurrency === "undefined") {
  window.formatCurrency = (n) => "\u20b1" + (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
if (typeof formatDate === "undefined") {
  window.formatDate = (d) => { try { return new Date(d).toLocaleDateString("en-PH", { year:"numeric", month:"short", day:"numeric" }); } catch(e) { return d || "\u2014"; } };
}
if (typeof showToast === "undefined") {
  window.showToast = (msg, type) => console.log("[Toast]", type, msg);
}

function financeStandaloneEnsureCharts() {
  if (window.Chart) return Promise.resolve();
  if (window.__financeStandaloneChartPromise) return window.__financeStandaloneChartPromise;
  window.__financeStandaloneChartPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.__financeStandaloneChartPromise;
}

function dashboardSparkSVG(color, trend) {
  const w = 120, h = 44, pts = trend;
  const stepX = w / (pts.length - 1);
  const points = pts.map((v, i) => `${i * stepX},${h - (v / 100) * h}`).join(" ");
  const fillPts = `0,${h} ` + points + ` ${w},${h}`;
  const gid = "sg" + color.replace(/[^a-zA-Z0-9]/g, "");
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:120px;height:44px;overflow:visible;">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:${color};stop-opacity:0.18"/>
        <stop offset="1" style="stop-color:${color};stop-opacity:0"/>
      </linearGradient>
    </defs>
    <polygon points="${fillPts}" fill="url(#${gid})" />
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function loadDashboard() {
  const kpiCards = [
    {
      id: "kpiIncome",
      label: "TOTAL COMPANY INCOME",
      icon: "ri-line-chart-line",
      colorClass: "exp-kpi-teal",
      sparkColor: "#4caf50",
      trend: [30,45,38,55,48,62,58,72,65,80,75,90],
      pct: "+18.5%", pctUp: true,
      onclick: "companyIncome"
    },
    {
      id: "kpiCompExp",
      label: "COMPANY EXPENSES",
      icon: "ri-shopping-cart-line",
      colorClass: "exp-kpi-blue",
      sparkColor: "#2196f3",
      trend: [40,52,47,60,55,65,60,70,68,74,72,80],
      pct: "+8.2%", pctUp: false,
      onclick: "companyExpenses"
    },
    {
      id: "kpiProjExp",
      label: "PROJECT EXPENSES",
      icon: "ri-file-list-3-line",
      colorClass: "exp-kpi-cyan",
      sparkColor: "#00bcd4",
      trend: [60,55,65,58,70,64,75,68,80,72,85,78],
      pct: "-12.4%", pctUp: false,
      onclick: "projectExpenses"
    },
    {
      id: "kpiCollections",
      label: "TOTAL COLLECTIONS",
      icon: "ri-hand-coin-line",
      colorClass: "exp-kpi-indigo",
      sparkColor: "#673ab7",
      trend: [25,38,30,48,42,55,50,62,58,68,65,75],
      pct: "+5.6%", pctUp: true,
      onclick: "collections"
    }
  ];

  getFinanceMainContent().innerHTML = `
  <div class="exp-page finance-dashboard">

    <!-- Page Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;min-height:92px;padding:32px 32px 18px;margin:0;background:transparent;border:0;border-radius:0;box-shadow:none;color:#173d7a;">
      <div style="display:flex;align-items:center;gap:14px;min-width:240px;flex:1 1 auto;">
        <i class="ri-dashboard-line" style="width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;color:#173d7a;font-size:29px;"></i>
        <div>
          <h2 style="margin:0;color:#173d7a;font-size:34px;line-height:1.1;font-weight:900;letter-spacing:-.6px;">Dashboard</h2>
          <div style="margin-top:4px;color:#6b7280;font-size:14px;font-weight:500;">Welcome back, ${financeUser?.full_name || financeUser?.email || "Mark Angelo"} 👋</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap;">
        <div style="width:338px;max-width:100%;height:54px;display:inline-flex;align-items:center;gap:12px;padding:0 24px;border-radius:999px;border:1px solid #dbe4ef;background:#fff;box-shadow:0 3px 10px rgba(20,44,86,.08);">
          <i class="ri-search-line" style="color:#8a9bb4;font-size:20px;"></i>
          <input type="text" placeholder="Search here..." id="financeDashboardSearch" style="width:100%;min-width:0;height:100%;border:0;outline:0;background:transparent;color:#3f4b5f;font-size:16px;font-weight:500;">
        </div>
        <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(20,44,86,.10);border:1px solid #dbe4ef;cursor:pointer;">
          <i class="ri-notification-3-line" style="font-size:20px;color:#173d7a;"></i>
          <span style="position:absolute;top:8px;right:10px;width:8px;height:8px;background:#3b82f6;border-radius:50%;border:2px solid #fff;"></span>
        </div>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="finance-summary-cards" style="padding:0 32px;">
      ${kpiCards.map(c => `
      <div class="exp-kpi-card ${c.colorClass}" onclick="openPage('${c.onclick}')">
        <div class="exp-kpi-icon"><i class="${c.icon}"></i></div>
        <div class="exp-kpi-lbl">${c.label}</div>
        <div class="exp-kpi-val" id="${c.id}">—</div>
        <div class="finance-kpi-footer">
          <div class="finance-kpi-pct ${c.pctUp ? 'up' : 'down'}">
            <i class="${c.pctUp ? 'ri-arrow-up-s-fill' : 'ri-arrow-down-s-fill'}"></i>
            ${c.pct}
            <span class="pct-vs">vs last month</span>
          </div>
          <div class="finance-kpi-spark">${dashboardSparkSVG(c.sparkColor, c.trend)}</div>
        </div>
      </div>`).join("")}
    </div>

    <!-- Latest Financial Activity -->
    <div style="padding:24px 32px 32px;">
      <div class="finance-activity-card">
        <div class="finance-activity-header">
          <div class="finance-activity-title">
            <div class="finance-activity-title-icon"><i class="ri-exchange-funds-line"></i></div>
            LATEST FINANCIAL ACTIVITY
          </div>
          <div style="position:relative;">
            <button class="finance-period-btn" id="dashPeriodBtn" onclick="dashTogglePeriod()">
              <i class="ri-calendar-line" style="font-size:14px;color:#6b7280;"></i>
              <span id="dashPeriodLabel">This Month</span>
              <i class="ri-arrow-down-s-line" style="font-size:15px;color:#9ca3af;"></i>
            </button>
            <div class="finance-period-dd" id="dashPeriodDd">
              ${["This Week","This Month","Last Month","This Year"].map(p =>
                `<div class="finance-period-dd-item" onclick="dashSelectPeriod('${p}')">${p}</div>`
              ).join("")}
            </div>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="finance-activity-table">
            <thead>
              <tr><th>#</th><th>DATE</th><th>DESCRIPTION</th><th>CATEGORY</th><th>AMOUNT</th><th>STATUS</th></tr>
            </thead>
            <tbody>${generateDashboardRows()}</tbody>
          </table>
        </div>
        <div class="finance-activity-footer">
          <button class="finance-view-all-btn" onclick="openPage('companyIncome')">
            View all transactions <i class="ri-arrow-right-line"></i>
          </button>
        </div>
      </div>
    </div>

  </div>`;

  window.dashTogglePeriod = function() {
    document.getElementById("dashPeriodDd")?.classList.toggle("open");
  };
  window.dashSelectPeriod = function(label) {
    const lbl = document.getElementById("dashPeriodLabel");
    if (lbl) lbl.textContent = label;
    document.getElementById("dashPeriodDd")?.classList.remove("open");
  };
  document.addEventListener("click", function(e) {
    const btn = document.getElementById("dashPeriodBtn");
    const dd  = document.getElementById("dashPeriodDd");
    if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
      dd.classList.remove("open");
    }
  });

  // Load KPIs from API
  financeStandaloneApi("GET", "/api/report/kpis").then(kpis => {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = formatCurrency(val); };
    el("kpiIncome",      kpis.total_income);
    el("kpiCompExp",     kpis.comp_expenses);
    el("kpiProjExp",     kpis.proj_expenses);
    el("kpiCollections", kpis.total_collections);
  }).catch(() => {
    ["kpiIncome","kpiCompExp","kpiProjExp","kpiCollections"].forEach(id => {
      const e = document.getElementById(id); if (e) e.textContent = "—";
    });
  });
}

function generateDashboardRows() {
  const rows = [
    { date: "2025-07-15", desc: "Client Payment – Project Alpha", cat: "Income",          amount: 250000, status: "completed" },
    { date: "2025-07-14", desc: "Office Supplies Purchase",        cat: "Expense",         amount: 15200,  status: "completed" },
    { date: "2025-07-13", desc: "Project Beta – Material Cost",    cat: "Project Expense", amount: 88000,  status: "pending"   },
    { date: "2025-07-12", desc: "Utility Bills – July",            cat: "Expense",         amount: 32400,  status: "completed" },
    { date: "2025-07-11", desc: "Consulting Fee – Project Gamma",  cat: "Project Expense", amount: 45000,  status: "completed" },
  ];
  const catCfg = {
    "Income":          { bg:"#dcfce7", fg:"#14532d" },
    "Collection":      { bg:"#dbeafe", fg:"#1e40af" },
    "Project Expense": { bg:"#fef3c7", fg:"#92400e" },
    "Expense":         { bg:"#fee2e2", fg:"#991b1b" }
  };
  const stsCfg = {
    "completed": { bg:"#dcfce7", fg:"#14532d", lbl:"Completed" },
    "pending":   { bg:"#f1f5f9", fg:"#475569", lbl:"Pending"   },
    "progress":  { bg:"#fef3c7", fg:"#92400e", lbl:"In Progress"}
  };
  return rows.map((r, i) => {
    const isIncome = r.cat === "Income" || r.cat === "Collection";
    const cc = catCfg[r.cat] || { bg:"#e5e7eb", fg:"#374151" };
    const sc = stsCfg[r.status] || { bg:"#e5e7eb", fg:"#374151", lbl: r.status };
    return `
    <tr style="border-top:1px solid #f1f5f9;" onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background=''">
      <td style="padding:13px 16px 13px 24px;font-size:13px;font-weight:600;color:#94a3b8;">${i + 1}</td>
      <td style="padding:13px 16px;font-size:13px;color:#64748b;font-weight:500;">${formatDate(r.date)}</td>
      <td style="padding:13px 16px;font-size:13px;color:#1e293b;font-weight:600;">${r.desc}</td>
      <td style="padding:13px 16px;"><span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${cc.bg};color:${cc.fg};letter-spacing:.3px;">${r.cat}</span></td>
      <td style="padding:13px 16px;font-size:13px;font-weight:800;color:${isIncome ? '#16a34a' : '#dc2626'};">${formatCurrency(r.amount)}</td>
      <td style="padding:13px 24px 13px 16px;"><span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.fg};letter-spacing:.3px;">${sc.lbl}</span></td>
    </tr>`;
  }).join("");
}

function generateCollectionRows() {
  const rows = [
    { client: "XYZ Corporation",      due: "2025-07-20", due_amt: 500000, collected: 450000 },
    { client: "ABC Builders",         due: "2025-07-25", due_amt: 320000, collected: 0 },
    { client: "DEF Infrastructure",   due: "2025-08-01", due_amt: 780000, collected: 780000 },
    { client: "GHI Solutions",        due: "2025-08-05", due_amt: 150000, collected: 75000 },
    { client: "JKL Enterprises",      due: "2025-08-10", due_amt: 220000, collected: 0 },
  ];
  return rows.map((r, i) => {
    const balance = r.due_amt - r.collected;
    const pct = r.due_amt > 0 ? Math.round((r.collected / r.due_amt) * 100) : 0;
    const status = pct === 100 ? "completed" : pct > 0 ? "progress" : "pending";
    const statusLabel = pct === 100 ? "Paid" : pct > 0 ? "Partial" : "Unpaid";
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="font-weight:700;color:#374151;">${r.client}</td>
        <td style="color:#64748b;">${formatDate(r.due)}</td>
        <td><span style="font-size:13.5px;font-weight:900;color:#1e3a6e;background:rgba(30,58,110,.07);padding:3px 9px;border-radius:7px;display:inline-block;">${formatCurrency(r.due_amt)}</span></td>
        <td><span style="font-size:13.5px;font-weight:900;color:#16a34a;background:rgba(22,163,74,.07);padding:3px 9px;border-radius:7px;display:inline-block;">${formatCurrency(r.collected)}</span></td>
        <td><span style="font-size:13.5px;font-weight:900;color:${balance > 0 ? "#dc2626" : "#16a34a"};background:${balance > 0 ? "rgba(220,38,38,.07)" : "rgba(22,163,74,.07)"};padding:3px 9px;border-radius:7px;display:inline-block;">${formatCurrency(balance)}</span></td>
        <td>${(() => { const cfg={completed:['#dcfce7','#14532d','Paid'],progress:['#fef3c7','#92400e','Partial'],pending:['#f1f5f9','#475569','Unpaid']}; const [bg,fg,lbl]=cfg[status]||['#e5e7eb','#374151',statusLabel]; return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;background:${bg};color:${fg};letter-spacing:.4px;">${lbl}</span>`; })()}</td>
      </tr>
    `;
  }).join("");
}

/* ================= FINANCE_STANDALONE_API HELPER ================= */

async function financeStandaloneApi(method, url, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': financeUser?.id || '',
      'X-User-Role': financeUser?.role || 'finance'
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(FINANCE_STANDALONE_API + url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function financeStandaloneApiUpload(url, formData) {
  const res = await fetch(FINANCE_STANDALONE_API + url, {
    method: 'POST',
    headers: {
      'X-User-Id': financeUser?.id || '',
      'X-User-Role': financeUser?.role || 'finance'
    },
    body: formData
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

/* ================= COMPANY INCOME ================= */

let incActiveTab    = "overview";
let incOvPeriod     = "year";   // overview period: day|week|month|year|custom
let incOvFrom       = "";       // overview custom from
let incOvTo         = "";       // overview custom to
let incSearchQuery  = "";
let incFilterLot    = "";
let incFilterSource = "";
let incFilterFrom   = "";       // income tab from
let incFilterTo     = "";       // income tab to
let incLineChartInst = null;
let incBarChartInst  = null;
let incDeleteId      = null;
let incTableRows     = [];

function incDestroyCharts() {
  if (incLineChartInst) { incLineChartInst.destroy(); incLineChartInst = null; }
  if (incBarChartInst)  { incBarChartInst.destroy();  incBarChartInst  = null; }
}

function loadCompanyIncome() {
  incDestroyCharts();
  incActiveTab    = "overview";
  incOvPeriod     = "year";
  incOvFrom = incOvTo = "";
  incSearchQuery  = "";
  incFilterLot = incFilterSource = incFilterFrom = incFilterTo = "";

  getFinanceMainContent().innerHTML = `
  <div class="inc-page">

    <!-- Header -->
    ${financePageHeader({
      title: "Company Income",
      subtitle: "Track and manage all income records",
      icon: "ri-money-dollar-circle-line",
      searchId: "incSearchInput",
      controls: `
          <button class="inc-btn-add" id="incAddBtn" style="display:none;">
            <i class="ri-add-line"></i> Add Income
          </button>`
    })}

    <!-- Tabs row — tabs left, controls right (consistent across pages) -->
    <div class="company-income-workspace">
    <div class="page-tab-row">
      <div class="page-tabs">
        <button class="exp-tab active" id="incTabOv">Overview</button>
        <button class="exp-tab"        id="incTabIn">Income</button>
      </div>
      <!-- Overview: period filter -->
      <div id="incPeriodWrap" class="page-tab-controls">
        <div style="position:relative;z-index:500;">
          <button class="inc-btn-flt" id="incFilterBtn">
            <i class="ri-equalizer-line"></i> Filter <i class="ri-arrow-down-s-line"></i>
          </button>
          <div class="inc-flt-dd" id="incFltDd">
            <div class="inc-flt-opt" id="incFopt-day">Day</div>
            <div class="inc-flt-opt" id="incFopt-week">Week</div>
            <div class="inc-flt-opt" id="incFopt-month">Month</div>
            <div class="inc-flt-opt active" id="incFopt-year">Year</div>
            <div class="inc-flt-opt" id="incFopt-custom" style="border-top:1px solid #e5e7eb;margin-top:4px;padding-top:12px;">
              <i class="ri-calendar-line" style="margin-right:4px;"></i>Custom Range
            </div>
          </div>
        </div>
        <div id="incOvCustomRange" style="display:none;align-items:center;gap:6px;">
          <input type="date" id="incOvFrom" class="pe-filter-date">
          <span style="color:#6b7280;font-size:13px;">to</span>
          <input type="date" id="incOvTo" class="pe-filter-date">
          <button id="incOvApply" class="pe-apply-btn">Apply</button>
        </div>
      </div>
      <!-- Income tab: inline filter bar on the right -->
      <div id="incFilterBar" style="display:none;" class="page-tab-controls">
        <input type="date" id="incFltFrom" class="pe-filter-date" placeholder="From">
        <span style="color:#6b7280;font-size:13px;">to</span>
        <input type="date" id="incFltTo" class="pe-filter-date">
        <input type="text" id="incFltLot" placeholder="Project Name" class="pe-filter-text">
        <input type="text" id="incFltSource" placeholder="Source" class="pe-filter-text">
        <button id="incFltApply" class="pe-apply-btn"><i class="ri-filter-line"></i> Apply</button>
        <button id="incFltClear" class="pe-clear-btn"><i class="ri-close-line"></i> Clear</button>
      </div>
    </div>

    <!-- Panels -->
    <div class="inc-body" style="position:relative;z-index:0;">

      <!-- OVERVIEW -->
      <div id="incPanelOv">
        <div class="inc-kpi-card">
          <div class="inc-kpi-icon">&#128176;</div>
          <div>
            <div class="inc-kpi-amount" id="incKpiAmt">Loading...</div>
            <div class="inc-kpi-label" id="incKpiLabel">Total Income this Year</div>
          </div>
        </div>
        <div class="inc-charts-row">
          <div class="inc-chart-card">
            <div class="inc-chart-title">Income Trends</div>
            <canvas id="incLineChart" height="230"></canvas>
          </div>
          <div class="inc-chart-bare">
            <div class="inc-chart-title">Income Per Project</div>
            <canvas id="incBarChart" height="270"></canvas>
          </div>
        </div>
      </div>

      <!-- INCOME TABLE -->
      <div id="incPanelIn" style="display:none;" hidden>
        <!-- Total card at top -->
        <div class="inc-total-summary" style="display:flex;align-items:center;justify-content:space-between;background:#1e3a6e;border-radius:13px;padding:18px 28px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="inc-total-summary-icon" style="width:46px;height:46px;background:rgba(255,255,255,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;">&#128176;</div>
            <div>
              <div class="inc-total-summary-label" style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:.6px;">Total Income</div>
              <div id="incTableTotal" class="inc-total-summary-amount" style="font-size:28px;font-weight:900;color:white;line-height:1.2;">&#8369; 0</div>
            </div>
          </div>
          <div class="inc-total-summary-meta" style="text-align:right;">
            <div id="incTableCount" style="font-size:13px;color:rgba(255,255,255,0.7);"></div>
            <div id="incTableRange" style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;"></div>
          </div>
        </div>
        <!-- Table -->
        <div class="inc-tbl-wrap">
          <div class="inc-tbl-banner">INCOME REPORTS</div>
          <table class="inc-tbl">
            <thead>
              <tr><th>Date</th><th>Project Name</th><th>Source</th><th>Description</th><th>Amount</th><th>Status</th><th>OR #</th><th>Actions</th></tr>
            </thead>
            <tbody id="incTbody"><tr><td colspan="8" class="inc-empty">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>

    </div>
    </div>
  </div>`;

  // Wire all events
  document.getElementById("incTabOv").addEventListener("click", () => incSwitchTab("overview"));
  document.getElementById("incTabIn").addEventListener("click", () => incSwitchTab("income"));
  document.getElementById("incAddBtn").addEventListener("click", incOpenAddModal);
  document.getElementById("incFilterBtn").addEventListener("click", incToggleFilter);
  document.getElementById("incSearchInput").addEventListener("input", () => {
    incSearchQuery = document.getElementById("incSearchInput").value.toLowerCase();
    if (incActiveTab === "income") incRefreshTable();
  });
  ["day","week","month","year"].forEach(p =>
    document.getElementById("incFopt-"+p).addEventListener("click", () => incSetPeriod(p))
  );
  document.getElementById("incFopt-custom").addEventListener("click", () => {
    document.getElementById("incFltDd").classList.remove("show");
    document.querySelectorAll(".inc-flt-opt").forEach(o => o.classList.remove("active"));
    document.getElementById("incFopt-custom").classList.add("active");
    document.getElementById("incOvCustomRange").style.display = "flex";
    incOvPeriod = "custom";
  });
  document.getElementById("incOvApply").addEventListener("click", () => {
    incOvFrom = document.getElementById("incOvFrom").value;
    incOvTo   = document.getElementById("incOvTo").value;
    if (!incOvFrom && !incOvTo) { showToast("Please select at least one date.", "error"); return; }
    incRefreshOverview();
    showToast("Custom range applied.", "info");
  });
  document.getElementById("incFltApply").addEventListener("click", () => {
    incFilterFrom   = document.getElementById("incFltFrom").value;
    incFilterTo     = document.getElementById("incFltTo").value;
    incFilterLot    = document.getElementById("incFltLot").value;
    incFilterSource = document.getElementById("incFltSource").value.trim();
    incRefreshTable();
    showToast("Filters applied.", "info");
  });
  document.getElementById("incFltClear").addEventListener("click", () => {
    incFilterFrom = incFilterTo = incFilterLot = incFilterSource = "";
    document.getElementById("incFltFrom").value = "";
    document.getElementById("incFltTo").value   = "";
    document.getElementById("incFltLot").value   = "";
    document.getElementById("incFltSource").value = "";
    incRefreshTable();
    showToast("Filters cleared.", "info");
  });
  document.removeEventListener("click", incOutsideClick);
  document.addEventListener("click", incOutsideClick);

  incRefreshOverview();
  incRefreshTable();
}

/* ── Tab switch ── */
function incSwitchTab(tab) {
  incActiveTab = tab;
  const isOv = tab === "overview";
  const overviewPanel = document.getElementById("incPanelOv");
  const incomePanel = document.getElementById("incPanelIn");
  document.getElementById("incTabOv").classList.toggle("active",  isOv);
  document.getElementById("incTabIn").classList.toggle("active", !isOv);
  overviewPanel.hidden = !isOv;
  incomePanel.hidden = isOv;
  overviewPanel.style.display = isOv ? "grid" : "none";
  incomePanel.style.display = isOv ? "none" : "";
  document.getElementById("incAddBtn").style.display     = isOv ? "none" : "inline-flex";
  document.getElementById("incPeriodWrap").style.display = isOv ? "flex" : "none";
  document.getElementById("incFilterBar").style.display  = isOv ? "none" : "flex";
  // keep tab row controls visible
  document.getElementById("incPeriodWrap").style.display = isOv ? "flex" : "none";
  if (isOv) { incDestroyCharts(); incRefreshOverview(); }
  else incRefreshTable();
}

/* ── Period filter ── */
function incToggleFilter(e) {
  e && e.stopPropagation();
  document.getElementById("incFltDd").classList.toggle("show");
}
function incOutsideClick(e) {
  const dd = document.getElementById("incFltDd");
  const btn = document.getElementById("incFilterBtn");
  if (dd && btn && dd.classList.contains("show") && !btn.contains(e.target) && !dd.contains(e.target))
    dd.classList.remove("show");
}
function incSetPeriod(p) {
  incOvPeriod = p;
  incOvFrom   = "";
  incOvTo     = "";
  document.getElementById("incFltDd")?.classList.remove("show");
  document.querySelectorAll(".inc-flt-opt").forEach(o => o.classList.remove("active"));
  document.getElementById("incFopt-"+p)?.classList.add("active");
  document.getElementById("incOvCustomRange").style.display = "none";
  incRefreshOverview();
  showToast("Filtered by: " + capitalize(p), "info");
}

/* ── Overview query params ── */
function incOvParams() {
  const p = new URLSearchParams();
  if (incOvPeriod === "custom" && (incOvFrom || incOvTo)) {
    if (incOvFrom) p.set("from", incOvFrom);
    if (incOvTo)   p.set("to",   incOvTo);
  } else {
    p.set("period", incOvPeriod || "year");
  }
  return p.toString();
}

/* ── Income table query params ── */
function incBuildQuery() {
  const p = new URLSearchParams();
  if (incFilterFrom)   p.set("from",   incFilterFrom);
  if (incFilterTo)     p.set("to",     incFilterTo);
  if (incFilterLot)    p.set("lot",    incFilterLot);
  if (incFilterSource) p.set("source", incFilterSource);
  if (incSearchQuery)  p.set("search", incSearchQuery);
  if (!incFilterFrom && !incFilterTo) p.set("period", "all");
  return p.toString();
}

/* ── Overview ── */
async function incRefreshOverview() {
  try {
    const qs = incOvParams();
    const [kpi, monthly, byLot] = await Promise.all([
      financeStandaloneApi("GET", "/api/income/kpi?" + qs),
      financeStandaloneApi("GET", "/api/income/monthly?" + qs),
      financeStandaloneApi("GET", "/api/income/by-project?" + qs),
    ]);
    const el    = document.getElementById("incKpiAmt");
    const label = document.getElementById("incKpiLabel");
    if (el) el.textContent = "\u20b1 " + Number(kpi.total).toLocaleString();
    if (label) {
      const map = { day:"Today", week:"This Week", month:"This Month", year:"This Year", custom:"Custom Range" };
      label.textContent = "Total Income \u2014 " + (map[incOvPeriod] || "This Year");
    }
    incDrawCharts(monthly, byLot);
  } catch (err) {
    const el = document.getElementById("incKpiAmt");
    if (el) el.innerHTML = '<span style="font-size:13px;color:#dc2626;">Server offline \u2014 run npm start</span>';
  }
}

function incDrawCharts(monthly, byLot) {
  const lc = document.getElementById("incLineChart");
  const bc = document.getElementById("incBarChart");
  if (!lc || !bc) return;
  incDestroyCharts();
  const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthMap = {};
  monthly.forEach(r => { monthMap[r.month] = Number(r.total); });
  // Show only months that have data; if no data at all show all 12 with zeros
  const lbls = monthly.length ? monthOrder.filter(m => monthMap[m] !== undefined) : monthOrder;
  const vals = lbls.map(m => monthMap[m] || 0);
  incLineChartInst = new Chart(lc, {
    type:"line",
    data:{labels:lbls,datasets:[{data:vals,borderColor:financeChartColors.income,backgroundColor:"rgba(37, 99, 235, 0.12)",
      borderWidth:2.5,pointBackgroundColor:financeChartColors.income,pointRadius:5,tension:.35,fill:true}]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>"\u20b1"+c.parsed.y.toLocaleString()}}},
      scales:{y:{ticks:{callback:v=>v.toLocaleString(),font:{size:11}},grid:{color:"rgba(0,0,0,.05)"}},
              x:{ticks:{font:{size:11}},grid:{display:false}}}}
  });
  incBarChartInst = new Chart(bc, {
    type:"bar",
    data:{labels:byLot.map(p=>p.label),datasets:[{data:byLot.map(p=>Number(p.amount)),
      backgroundColor:[financeChartColors.income, financeChartColors.collection, financeChartColors.project, financeChartColors.expense, financeChartColors.muted],
      borderRadius:9, barPercentage:.6, categoryPercentage:.7}]},
    options:{
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>"\u20b1"+c.parsed.y.toLocaleString()}}},
      layout:{padding:{bottom:16,left:4,right:4}},
      scales:{
        y:{beginAtZero:true,ticks:{callback:v=>"\u20b1"+v.toLocaleString(),font:{size:11}},grid:{color:"rgba(0,0,0,.05)"}},
        x:{ticks:{font:{size:12,weight:"600"},color:"#1e3a6e",maxRotation:0,minRotation:0,autoSkip:false},grid:{display:false}}
      }
    }
  });
}

async function incRefreshTable() {
  const tbody = document.getElementById("incTbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="inc-empty">Loading...</td></tr>';
  try {
    const rows = await financeStandaloneApi("GET", "/api/income/projects?" + incBuildQuery());
    incTableRows = Array.isArray(rows) ? rows : [];
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const totalEl = document.getElementById("incTableTotal");
    const countEl = document.getElementById("incTableCount");
    const rangeEl = document.getElementById("incTableRange");
    if (totalEl) {
      const end = total, dur = 700, startTime = performance.now();
      const tick = now => {
        const p = 1 - Math.pow(1 - Math.min(now - startTime, dur)/dur, 3);
        totalEl.textContent = "\u20b1 " + Math.round(end * p).toLocaleString();
        if (now - startTime < dur) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    if (countEl) countEl.textContent = rows.length + " record" + (rows.length !== 1 ? "s" : "");
    if (rangeEl) {
      const parts = [];
      if (incFilterLot)    parts.push(incFilterLot);
      if (incFilterSource) parts.push(incFilterSource);
      if (incFilterFrom || incFilterTo) parts.push((incFilterFrom||"start") + " \u2192 " + (incFilterTo||"today"));
      rangeEl.textContent = parts.length ? parts.join(" \u00b7 ") : "All records";
    }
    if (!rows.length) {
      incTableRows = [];
      tbody.innerHTML = '<tr><td colspan="8" class="inc-empty">No records found.</td></tr>';
      return;
    }
    const statusBadge = s => {
      const cfg = { received: ['#dcfce7','#14532d','Received'], pending: ['#f1f5f9','#475569','Pending'], cancelled: ['#fee2e2','#991b1b','Cancelled'] };
      const [bg, fg, lbl] = cfg[s] || ['#e5e7eb','#374151', s];
      return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;background:${bg};color:${fg};letter-spacing:.4px;">${lbl}</span>`;
    };
    tbody.innerHTML = rows.map((r, i) => {
      const project = r.project_name || r.lot;
      const lotC = {'Lot A':['#dbeafe','#1e40af'],'Lot B':['#d1fae5','#065f46'],
        'Lot C':['#fef3c7','#92400e'],'Lot D':['#fce7f3','#9d174d'],
        'Lot E':['#ede9fe','#5b21b6'],'Lot F':['#ffedd5','#9a3412'],'Lot G':['#f0fdf4','#14532d']};
      const [bg, fg] = lotC[project] || ['#e5e7eb','#374151'];
      const projectLabel = project ? `<span style="display:inline-flex;align-items:center;padding:5px 13px;border-radius:20px;font-size:11.5px;font-weight:800;background:${bg};color:${fg};letter-spacing:.4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.08);">${project}</span>` : `<span style="color:#9ca3af;font-size:12px;font-style:italic;">General</span>`;
      return `<tr style="animation-delay:${i*0.04}s">
        <td style="color:#64748b;font-size:12.5px;white-space:nowrap;">${r.date_formatted || formatDate(r.date)}</td>
        <td>${projectLabel}</td>
        <td style="font-weight:600;color:#374151;">${r.source}</td>
        <td style="color:#64748b;font-size:13px;">${r.description}</td>
        <td><span style="font-size:14.5px;font-weight:900;color:#1e3a6e;background:rgba(30,58,110,.07);padding:4px 10px;border-radius:8px;display:inline-block;">&#8369;${Number(r.amount).toLocaleString()}</span></td>
        <td>${statusBadge(r.status || 'received')}</td>
        <td style="font-size:12px;color:#64748b;">${r.or_number ? `<code>${r.or_number}</code>` : '—'}</td>
        <td><div class="inc-row-btns">
          <button class="inc-row-btn inc-btn-edit" type="button" data-inc-edit-id="${r.id}"><i class="ri-pencil-line"></i> Edit</button>
          <button class="inc-row-btn inc-btn-del" onclick="incOpenDeleteModal(${r.id},'${(project||'General').replace(/'/g,"\\'")}',${r.amount})"><i class="ri-delete-bin-line"></i> Delete</button>
        </div></td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll("[data-inc-edit-id]").forEach(btn => {
      btn.addEventListener("click", () => incOpenEditModal(btn.dataset.incEditId));
    });
  } catch (err) {
    incTableRows = [];
    tbody.innerHTML = '<tr><td colspan="8" class="inc-empty" style="color:#dc2626;">Cannot connect to server. Make sure server.js is running.</td></tr>';
  }
}

/* ── Add / Edit / Delete ── */
function incOpenAddModal() {
  document.getElementById("incModalTitle").innerHTML = '<i class="ri-add-circle-line"></i> Add Income';
  document.getElementById("incEditId").value    = "";
  document.getElementById("incFDate").value     = new Date().toISOString().split("T")[0];
  document.getElementById("incFProject").value  = "";
  document.getElementById("incFSource").value   = "";
  document.getElementById("incFDesc").value     = "";
  document.getElementById("incFAmount").value   = "";
  document.getElementById("incFStatus").value   = "pending";
  document.getElementById("incFOR").value       = "";
  document.getElementById("incRecordModal").style.display = "flex";
}
function incOpenEditModal(id, project, source, description, amount, date, status, or_number) {
  if (arguments.length === 1) {
    const row = incTableRows.find(item => String(item.id) === String(id));
    if (!row) {
      showToast("Income record not found. Please refresh and try again.", "error");
      return;
    }
    project = row.project_name || row.lot || "";
    source = row.source || "";
    description = row.description || "";
    amount = row.amount;
    date = row.date;
    status = row.status || "received";
    or_number = row.or_number || "";
  }
  document.getElementById("incModalTitle").innerHTML = '<i class="ri-pencil-line"></i> Edit Income';
  document.getElementById("incEditId").value    = id;
  document.getElementById("incFDate").value     = formatFinanceInventoryInputValue(date, "date");
  document.getElementById("incFProject").value  = project;
  document.getElementById("incFSource").value   = source;
  document.getElementById("incFDesc").value     = description;
  document.getElementById("incFAmount").value   = amount;
  document.getElementById("incFStatus").value   = status || "pending";
  document.getElementById("incFOR").value       = or_number || "";
  document.getElementById("incRecordModal").style.display = "flex";
}
function incCloseModal() { document.getElementById("incRecordModal").style.display = "none"; }
async function incSaveRecord() {
  const date         = document.getElementById("incFDate").value;
  const project_name = document.getElementById("incFProject").value || null;
  const source       = document.getElementById("incFSource").value.trim();
  const description  = document.getElementById("incFDesc").value.trim();
  const amount       = parseFloat(document.getElementById("incFAmount").value);
  const status       = document.getElementById("incFStatus").value;
  const or_number    = document.getElementById("incFOR").value.trim() || null;
  const editId       = document.getElementById("incEditId").value;
  if (!date || !source || !description || !amount || isNaN(amount) || amount <= 0) {
    showToast("Please fill in all required fields correctly.", "error"); return;
  }
  try {
    if (editId) {
      await financeStandaloneApi("PUT", "/api/income/" + editId, { date, project_name, source, description, amount, status, or_number });
      showToast("Record updated.", "success");
    } else {
      await financeStandaloneApi("POST", "/api/income/project", { date, project_name, source, description, amount, status, or_number });
      showToast("Income added.", "success");
    }
    incCloseModal(); incRefreshOverview(); incRefreshTable();
  } catch (err) { showToast("Save failed: " + err.message, "error"); }
}
function incOpenDeleteModal(id, lot, amount) {
  incDeleteId = id;
  document.getElementById("incDeletePreview").textContent = lot + "  |  \u20b1" + Number(amount).toLocaleString();
  document.getElementById("incDeleteModal").style.display = "flex";
}
function incCloseDeleteModal() { document.getElementById("incDeleteModal").style.display = "none"; incDeleteId = null; }
async function incConfirmDelete() {
  try {
    await financeStandaloneApi("DELETE", "/api/income/" + incDeleteId);
    incCloseDeleteModal(); incRefreshOverview(); incRefreshTable();
    showToast("Record deleted.", "info");
  } catch (err) { showToast("Delete failed: " + err.message, "error"); }
}

/* ================= COMPANY EXPENSES ================= */

let expDeleteId  = null;
let expActiveTab = "overview";   // overview | expenses | purchases | overhead
let expBarChart  = null;
let expPieChart  = null;
let expFilterPeriod = "year";   // today|week|month|year
let expFilterCat    = "";
let expFilterStatus = "";
let expSubRows      = [];

/* ── destroy charts on tab change ── */
function expDestroyCharts() {
  if (expBarChart) { expBarChart.destroy(); expBarChart = null; }
  if (expPieChart) { expPieChart.destroy(); expPieChart = null; }
}

function loadCompanyExpenses() {
  expDestroyCharts();
  expActiveTab    = "overview";
  expFilterPeriod = "year";
  expFilterCat    = "";
  expFilterStatus = "";

  getFinanceMainContent().innerHTML = `
  <div class="exp-page">

    <!-- Header -->
    ${financePageHeader({
      title: "Company Expenses",
      subtitle: "Track operational and overhead expenditures",
      icon: "ri-bank-card-line",
      searchId: "expSearchInput"
    })}

    <!-- Tabs row — tabs left, period filter right -->
    <div class="company-expenses-workspace">
    <div class="page-tab-row">
      <div class="page-tabs">
        <button class="exp-tab active" id="expTabOv"   onclick="expSwitchTab('overview')">Overview</button>
        <button class="exp-tab"        id="expTabExp"  onclick="expSwitchTab('expenses')">Company Expenses</button>
        <button class="exp-tab"        id="expTabPur"  onclick="expSwitchTab('purchases')">Purchases</button>
        <button class="exp-tab"        id="expTabOvh"  onclick="expSwitchTab('overhead')">Overhead</button>
        <button class="exp-tab"        id="expTabCon"  onclick="expSwitchTab('contribution')">Contribution</button>
      </div>
      <div class="page-tab-controls pe-filter-bar" id="expPeriodRow">
        <select id="expPeriodSelect" onchange="expSetPeriodSelect(this.value)" class="pe-filter-select">
          <option value="today">Today</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year" selected>Year</option>
          <option value="custom">Custom Range</option>
        </select>
        <div id="expCustomRangeWrap" style="display:none;align-items:center;gap:6px;">
          <input type="date" id="expOvFrom" style="padding:7px 10px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;color:#374151;outline:none;background:white;">
          <span style="color:#6b7280;font-size:13px;">to</span>
          <input type="date" id="expOvTo"   style="padding:7px 10px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;color:#374151;outline:none;background:white;">
          <button onclick="expApplyCustomRange()" style="padding:7px 16px;background:#1e3a6e;color:white;border:none;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">Apply</button>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div class="exp-body">

      <!-- ===== OVERVIEW PANEL ===== -->
      <div id="expPanelOv">

        <!-- KPI cards — Grand Total full-width above, 4 sub-totals in a row below -->
        <div id="expKpiRow">
          <!-- Grand Total: full width, matches the combined width of the 4 cards below -->
          <div class="exp-kpi-grand-wrap">
            <div class="exp-kpi-card exp-kpi-grand">
              <div class="exp-kpi-icon"><i class="ri-money-dollar-circle-line"></i></div>
              <div>
                <div class="exp-kpi-val" id="expKpiTotal">—</div>
                <div class="exp-kpi-lbl">Grand Total</div>
              </div>
            </div>
          </div>
          <!-- 4 sub-totals in equal columns -->
          <div class="exp-kpi-row" style="margin-bottom:0;">
            <div class="exp-kpi-card exp-kpi-teal">
              <div class="exp-kpi-icon"><i class="ri-bank-card-line"></i></div>
              <div><div class="exp-kpi-val" id="expKpiExp">—</div><div class="exp-kpi-lbl">Company Expenses</div></div>
            </div>
            <div class="exp-kpi-card exp-kpi-cyan">
              <div class="exp-kpi-icon"><i class="ri-shopping-cart-line"></i></div>
              <div><div class="exp-kpi-val" id="expKpiPur">—</div><div class="exp-kpi-lbl">Company Purchase</div></div>
            </div>
            <div class="exp-kpi-card exp-kpi-indigo">
              <div class="exp-kpi-icon"><i class="ri-building-line"></i></div>
              <div><div class="exp-kpi-val" id="expKpiOvh">—</div><div class="exp-kpi-lbl">Overhead Expenses</div></div>
            </div>
            <div class="exp-kpi-card exp-kpi-blue">
              <div class="exp-kpi-icon"><i class="ri-team-line"></i></div>
              <div><div class="exp-kpi-val" id="expKpiCon">—</div><div class="exp-kpi-lbl">Contributions</div></div>
            </div>
          </div>
        </div>

        <!-- Charts row -->
        <div class="exp-charts-row">
          <div class="exp-chart-card">
            <div class="inc-chart-title">Expenses per Month</div>
            <canvas id="expBarChartCanvas" height="200"></canvas>
          </div>
          <div class="exp-chart-card">
            <div class="inc-chart-title">Expenses Distribution</div>
            <canvas id="expPieChartCanvas" height="200"></canvas>
          </div>
        </div>

        <!-- Recent Financial Records table -->
        <!-- Dropdowns are OUTSIDE inc-tbl-wrap so overflow:hidden never clips them -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;margin-bottom:6px;flex-wrap:wrap;gap:8px;">
          <span style="font-size:13px;font-weight:800;color:#1e3a6e;letter-spacing:1.5px;text-transform:uppercase;">Recent Financial Records</span>
          <div style="display:flex;gap:8px;position:relative;z-index:9999;">
            <!-- Category dropdown -->
            <div style="position:relative;" id="expCatWrap">
              <button class="exp-sub-dd-btn" id="expCatBtn">Category <i class="ri-arrow-down-s-line"></i></button>
              <div class="exp-sub-dd" id="expCatDd">
                <div class="inc-flt-opt active" onclick="expSetCat('')">All</div>
                <div class="inc-flt-opt" onclick="expSetCat('expenses')">Expenses</div>
                <div class="inc-flt-opt" onclick="expSetCat('purchases')">Purchases</div>
                <div class="inc-flt-opt" onclick="expSetCat('overhead')">Overhead</div>
              </div>
            </div>
            <!-- Status filter dropdown -->
            <div style="position:relative;" id="expStsWrap">
              <button class="exp-sub-dd-btn" id="expStsBtn">
                <i class="ri-equalizer-line"></i> Filter <i class="ri-arrow-down-s-line"></i>
              </button>
              <div class="exp-sub-dd" id="expStsDd">
                <div class="inc-flt-opt active" onclick="expSetStatus('')">All Status</div>
                <div class="inc-flt-opt" onclick="expSetStatus('paid')">Paid</div>
                <div class="inc-flt-opt" onclick="expSetStatus('unpaid')">Unpaid</div>
                <div class="inc-flt-opt" onclick="expSetStatus('pending')">Pending</div>
              </div>
            </div>
          </div>
        </div>
        <div class="inc-tbl-wrap">
          <div class="inc-tbl-banner">RECENT FINANCIAL RECORDS</div>
          <table class="inc-tbl">
            <thead><tr>
              <th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th>
            </tr></thead>
            <tbody id="expRecentTbody"><tr><td colspan="5" class="inc-empty">Loading…</td></tr></tbody>
          </table>
        </div>

      </div><!-- /expPanelOv -->

      <!-- ===== EXPENSES / PURCHASES / OVERHEAD PANELS (shared layout) ===== -->
      <div id="expPanelSub" style="display:none;" hidden>

        <!-- Sub KPI row -->
        <div class="exp-kpi-row" id="expSubKpiRow">
          <div class="exp-kpi-card exp-kpi-blue">
            <div class="exp-kpi-icon"><i class="ri-money-dollar-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="subKpiTotal">—</div><div class="exp-kpi-lbl">Total</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-teal">
            <div class="exp-kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="subKpiPaid">—</div><div class="exp-kpi-lbl">Paid</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-cyan">
            <div class="exp-kpi-icon"><i class="ri-close-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="subKpiUnpaid">—</div><div class="exp-kpi-lbl">Unpaid</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-indigo">
            <div class="exp-kpi-icon"><i class="ri-time-line"></i></div>
            <div><div class="exp-kpi-val" id="subKpiPending">—</div><div class="exp-kpi-lbl">Pending</div></div>
          </div>
        </div>

        <!-- Table header with Add + filters -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin:20px 0 12px;flex-wrap:wrap;gap:10px;">
          <h3 id="expSubTitle" style="font-size:20px;font-weight:800;color:#1e3a6e;"></h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:relative;z-index:500;">
            <button class="inc-btn-add" id="expSubAddBtn" onclick="expOpenAdd()">
              <i class="ri-add-line"></i> Add
            </button>
            <!-- All Categories dropdown -->
            <div style="position:relative;" id="expSubCatWrap">
              <button class="exp-sub-dd-btn" id="expSubCatBtn">All Categories <i class="ri-arrow-down-s-line"></i></button>
              <div class="exp-sub-dd" id="expSubCatDd">
                <div class="inc-flt-opt" onclick="expSubSetCat('')">All Categories</div>
                <div class="inc-flt-opt" id="subCatOpt1"></div>
                <div class="inc-flt-opt" id="subCatOpt2"></div>
                <div class="inc-flt-opt" id="subCatOpt3"></div>
              </div>
            </div>
            <!-- All Status dropdown -->
            <div style="position:relative;" id="expSubStsWrap">
              <button class="exp-sub-dd-btn" id="expSubStsBtn">All Status <i class="ri-arrow-down-s-line"></i></button>
              <div class="exp-sub-dd" id="expSubStsDd">
                <div class="inc-flt-opt" onclick="expSubSetStatus('')">All Status</div>
                <div class="inc-flt-opt" onclick="expSubSetStatus('paid')">Paid</div>
                <div class="inc-flt-opt" onclick="expSubSetStatus('unpaid')">Unpaid</div>
                <div class="inc-flt-opt" onclick="expSubSetStatus('pending')">Pending</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sub-table -->
        <div class="inc-tbl-wrap">
          <table class="inc-tbl">
            <thead><tr>
              <th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="expSubTbody"><tr><td colspan="6" class="inc-empty">Loading…</td></tr></tbody>
          </table>
        </div>

      </div><!-- /expPanelSub -->

      <!-- ===== CONTRIBUTION PANEL ===== -->
      <div id="expPanelCon" style="display:none;" hidden>

        <!-- KPI cards -->
        <div class="exp-kpi-row">
          <div class="exp-kpi-card exp-kpi-blue">
            <div class="exp-kpi-icon"><i class="ri-money-dollar-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="conKpiTotal">—</div><div class="exp-kpi-lbl">Total</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-teal">
            <div class="exp-kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="conKpiPaid">—</div><div class="exp-kpi-lbl">Paid</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-cyan">
            <div class="exp-kpi-icon"><i class="ri-close-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="conKpiUnpaid">—</div><div class="exp-kpi-lbl">Unpaid</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-amber">
            <div class="exp-kpi-icon"><i class="ri-alarm-warning-line"></i></div>
            <div><div class="exp-kpi-val" id="conKpiOverdue">—</div><div class="exp-kpi-lbl">Overdue</div></div>
          </div>
        </div>

        <!-- Table header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin:20px 0 12px;flex-wrap:wrap;gap:10px;">
          <h3 style="font-size:20px;font-weight:800;color:#1e3a6e;">Contributions</h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:relative;z-index:500;">
            <button class="inc-btn-add" onclick="conOpenAdd()">
              <i class="ri-add-line"></i> Add
            </button>
            <!-- Type filter -->
            <select id="conFilterType" onchange="conApplyFilters()"
              style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;background:white;color:#374151;cursor:pointer;">
              <option value="">All Types</option>
              <option value="SSS">SSS</option>
              <option value="PhilHealth">PhilHealth</option>
              <option value="Pag-Ibig">Pag-Ibig</option>
            </select>
            <!-- Status filter -->
            <select id="conFilterStatus" onchange="conApplyFilters()"
              style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;background:white;color:#374151;cursor:pointer;">
              <option value="">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>
        </div>

        <!-- Contribution table -->
        <div class="inc-tbl-wrap">
          <table class="inc-tbl">
            <thead><tr>
              <th>Name</th><th>Type</th><th>Employee Share</th><th>Employer Share</th><th>Total</th><th>Due Date</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="conTbody"><tr><td colspan="8" class="inc-empty">Loading…</td></tr></tbody>
          </table>
        </div>

      </div><!-- /expPanelCon -->

    </div><!-- /exp-body -->
    </div><!-- /company-expenses-workspace -->
  </div><!-- /exp-page -->`;

  // Wire events
  document.getElementById("expCatBtn").onclick = e => {
    e.stopPropagation();
    document.getElementById("expCatDd").classList.toggle("show");
    document.getElementById("expStsDd").classList.remove("show");
  };
  document.getElementById("expStsBtn").onclick = e => {
    e.stopPropagation();
    document.getElementById("expStsDd").classList.toggle("show");
    document.getElementById("expCatDd").classList.remove("show");
  };
  document.getElementById("expSearchInput").addEventListener("input", () => {
    if (expActiveTab === "overview")      expRenderRecentTable();
    else if (expActiveTab === "contribution") conRenderTable();
    else expRenderSubTable();
  });
  // Guard: only register the global close-handler once across page navigations
  if (!window._expDropdownListenerRegistered) {
    document.addEventListener("click", expCloseAllDropdowns);
    window._expDropdownListenerRegistered = true;
  }

  expLoadOverview();
}

function expCloseAllDropdowns(e) {
  const wrappers = ["expCatWrap","expStsWrap","expSubCatWrap","expSubStsWrap"];
  if (wrappers.some(id => { const el = document.getElementById(id); return el && el.contains(e.target); }))
    return;
  ["expCatDd","expStsDd","expSubCatDd","expSubStsDd"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
  });
}

function expSwitchTab(tab) {
  expActiveTab = tab;
  expDestroyCharts();
  ["Ov","Exp","Pur","Ovh","Con"].forEach(t => {
    const btn = document.getElementById("expTab"+t);
    if (btn) btn.classList.remove("active");
  });
  const map = { overview:"Ov", expenses:"Exp", purchases:"Pur", overhead:"Ovh", contribution:"Con" };
  const activeBtn = document.getElementById("expTab"+map[tab]);
  if (activeBtn) activeBtn.classList.add("active");

  const isOv  = tab === "overview";
  const isCon = tab === "contribution";
  const panelOv = document.getElementById("expPanelOv");
  const panelSub = document.getElementById("expPanelSub");
  const panelCon = document.getElementById("expPanelCon");
  panelOv.hidden = !isOv;
  panelSub.hidden = isOv || isCon;
  panelCon.hidden = !isCon;
  panelOv.style.display  = isOv ? "grid" : "none";
  panelSub.style.display = (!isOv && !isCon) ? "block" : "none";
  panelCon.style.display = isCon ? "block" : "none";
  // Show period filter only on overview tab
  const prEl = document.getElementById("expPeriodRow");
  if (prEl) prEl.style.display = isOv ? "flex" : "none";

  if (isOv) {
    expLoadOverview();
  } else if (isCon) {
    conLoadKpis();
    conRenderTable();
  } else {
    // Set sub-panel title + category options per tab
    const cfg = {
      expenses:  { title:"Company Expenses",  cats:["Salaries","Contractor Fees","Legal Fees","Utilities","Other"] },
      purchases: { title:"Company Purchases", cats:["Equipment","Supplies","Materials","Software","Other"] },
      overhead:  { title:"Overhead Expenses", cats:["Rent","Internet","Insurance","Depreciation","Other"] },
    };
    const c = cfg[tab];
    document.getElementById("expSubTitle").textContent = c.title;
    ["subCatOpt1","subCatOpt2","subCatOpt3"].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = c.cats[i] || ""; el.onclick = () => expSubSetCat(c.cats[i]||""); }
    });
    // Wire sub-dropdowns with .onclick so repeated tab switches never stack listeners
    document.getElementById("expSubCatBtn").onclick = e => {
      e.stopPropagation();
      document.getElementById("expSubCatDd").classList.toggle("show");
      document.getElementById("expSubStsDd").classList.remove("show");
    };
    document.getElementById("expSubStsBtn").onclick = e => {
      e.stopPropagation();
      document.getElementById("expSubStsDd").classList.toggle("show");
      document.getElementById("expSubCatDd").classList.remove("show");
    };
    expSubFilterCat    = "";
    expSubFilterStatus = "";
    expRenderSubTable();
    expLoadSubKpis();
  }
}

/* ── Overview ── */
async function expLoadOverview() {
  try {
    const kpis = await financeStandaloneApi("GET", `/api/expenses/kpis?${expOvQueryParams()}`);
    document.getElementById("expKpiTotal").textContent = formatCurrency(kpis.grand_total        || 0);
    document.getElementById("expKpiExp").textContent   = formatCurrency(kpis.expenses_total      || 0);
    document.getElementById("expKpiPur").textContent   = formatCurrency(kpis.purchases_total     || 0);
    document.getElementById("expKpiOvh").textContent   = formatCurrency(kpis.overhead_total      || 0);
    const conEl = document.getElementById("expKpiCon");
    if (conEl) conEl.textContent = formatCurrency(kpis.contribution_total || 0);
  } catch { expSetFallbackKpis(); }
  expRenderRecentTable();
  expRenderBarChart();
  expRenderPieChart();
}

function expSetFallbackKpis() {
  ["expKpiTotal","expKpiExp","expKpiPur","expKpiOvh","expKpiCon"].forEach(id => {
    const e = document.getElementById(id); if (e) e.textContent = "₱0.00";
  });
}

let expOvFrom = "";
let expOvTo   = "";

function expOvQueryParams() {
  if (expFilterPeriod === "custom" && (expOvFrom || expOvTo)) {
    const p = new URLSearchParams();
    if (expOvFrom) p.set("from", expOvFrom);
    if (expOvTo)   p.set("to",   expOvTo);
    return p.toString();
  }
  return "period=" + expFilterPeriod;
}
function expSetPeriod(p) {
  expFilterPeriod = p;
  expDestroyCharts();
  expLoadOverview();
}
function expSetPeriodSelect(p) {
  expFilterPeriod = p;
  const wrap = document.getElementById("expCustomRangeWrap");
  if (p === "custom") {
    if (wrap) wrap.style.display = "flex";
  } else {
    if (wrap) wrap.style.display = "none";
    expOvFrom = ""; expOvTo = "";
    expDestroyCharts();
    expLoadOverview();
  }
}
function expApplyCustomRange() {
  expOvFrom = document.getElementById("expOvFrom")?.value || "";
  expOvTo   = document.getElementById("expOvTo")?.value   || "";
  if (!expOvFrom && !expOvTo) { showToast("Please select at least one date.", "error"); return; }
  expDestroyCharts();
  expLoadOverview();
  showToast("Custom range applied.", "info");
}

function expSetCat(cat) {
  expFilterCat = cat;  // already lowercase from onclick values
  const label = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Category";
  document.getElementById("expCatBtn").innerHTML = label + ' <i class="ri-arrow-down-s-line"></i>';
  document.querySelectorAll("#expCatDd .inc-flt-opt").forEach(el => el.classList.remove("active"));
  const hit = [...document.querySelectorAll("#expCatDd .inc-flt-opt")]
    .find(el => el.textContent.trim().toLowerCase() === (cat || "all"));
  if (hit) hit.classList.add("active");
  document.getElementById("expCatDd").classList.remove("show");
  expRenderRecentTable();
}
function expSetStatus(s) {
  expFilterStatus = s;  // paid | unpaid | pending | ""
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : "Filter";
  document.getElementById("expStsBtn").innerHTML = '<i class="ri-equalizer-line"></i> ' + label + ' <i class="ri-arrow-down-s-line"></i>';
  document.querySelectorAll("#expStsDd .inc-flt-opt").forEach(el => el.classList.remove("active"));
  const hit = [...document.querySelectorAll("#expStsDd .inc-flt-opt")]
    .find(el => el.textContent.trim().toLowerCase() === (s || "all status"));
  if (hit) hit.classList.add("active");
  document.getElementById("expStsDd").classList.remove("show");
  expRenderRecentTable();
}

async function expRenderRecentTable() {
  const tbody = document.getElementById("expRecentTbody");
  if (!tbody) return;
  const q = document.getElementById("expSearchInput")?.value || "";
  try {
    const rows = await financeStandaloneApi("GET", `/api/expenses/recent?${expOvQueryParams()}&cat=${encodeURIComponent(expFilterCat)}&status=${encodeURIComponent(expFilterStatus)}&search=${encodeURIComponent(q)}`);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="inc-empty">No records found.</td></tr>`; return;
    }
    tbody.innerHTML = rows.map(r => {
      const sc = r.status==="paid"?"completed":r.status==="unpaid"?"pending":"progress";
      return `<tr>
        <td>${formatDate(r.date)}</td>
        <td>${r.category}</td>
        <td>${r.description}</td>
        <td style="font-weight:700;color:#dc2626;">${formatCurrency(r.amount)}</td>
        <td><span class="badge ${sc}" style="border-radius:20px;padding:5px 14px;">${capitalize(r.status)}</span></td>
      </tr>`;
    }).join("");
  } catch {
    tbody.innerHTML = expFallbackRecentRows();
  }
}

function expFallbackRecentRows() {
  const demo = [
    { date:"2026-01-02", category:"Expenses",  description:"Satellite Service",    amount:120000, status:"pending" },
    { date:"2026-01-02", category:"Expenses",  description:"Satellite Service",    amount:120000, status:"pending" },
    { date:"2026-01-13", category:"Overhead",  description:"Equipment Setup",      amount:80000,  status:"paid"    },
    { date:"2026-01-28", category:"Purchases", description:"Monthly Service Plan", amount:60000,  status:"paid"    },
    { date:"2026-01-02", category:"Expenses",  description:"Satellite Service",    amount:120000, status:"pending" },
    { date:"2026-01-13", category:"Overhead",  description:"Equipment Setup",      amount:80000,  status:"paid"    },
    { date:"2026-01-28", category:"Purchases", description:"Monthly Service Plan", amount:60000,  status:"pending" },
  ];
  return demo.map(r => {
    const sc = r.status==="paid"?"completed":r.status==="unpaid"?"pending":"progress";
    return `<tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.category}</td>
      <td>${r.description}</td>
      <td style="font-weight:700;color:#dc2626;">${formatCurrency(r.amount)}</td>
      <td><span class="badge ${sc}" style="border-radius:20px;padding:5px 14px;">${capitalize(r.status)}</span></td>
    </tr>`;
  }).join("");
}

async function expRenderBarChart() {
  const canvas = document.getElementById("expBarChartCanvas");
  if (!canvas) return;
  let labels = [], data = [];
  try {
    const rows = await financeStandaloneApi("GET", `/api/expenses/monthly?${expOvQueryParams()}`);
    labels = rows.map(r => r.month_label);
    data   = rows.map(r => r.total);
  } catch {
    labels = ["January","February","March","April"];
    data   = [19500, 43000, 13000, 29000];
  }
  const chartTitles = {
    today:  "Expenses Today (by Hour)",
    week:   "Expenses This Week (by Day)",
    month:  "Expenses This Month (by Day)",
    year:   "Expenses per Month",
    custom: (expOvFrom && expOvTo) ? `Expenses: ${expOvFrom} → ${expOvTo}` : "Expenses — Custom Range",
  };
  const titleEl = canvas.closest(".exp-chart-card")?.querySelector(".inc-chart-title");
  if (titleEl) titleEl.textContent = chartTitles[expFilterPeriod] || "Expenses per Month";

  expBarChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(() => financeChartColors.expense),
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "#e5e7eb" }, ticks: { callback: v => "₱"+v.toLocaleString() } },
        x: { grid: { display: false } }
      }
    }
  });
}

async function expRenderPieChart() {
  const canvas = document.getElementById("expPieChartCanvas");
  if (!canvas) return;
  let labels = ["Expenses","Purchases","Overhead","Contribution"], data = [50,25,15,10];
  try {
    const [kpis, conKpis] = await Promise.all([
      financeStandaloneApi("GET", `/api/expenses/kpis?${expOvQueryParams()}`),
      financeStandaloneApi("GET", "/api/contributions/kpis").catch(() => ({ grand_total: 0 })),
    ]);
    const conTotal = Number(conKpis.grand_total || 0);
    const tot = (kpis.expenses_total||0) + (kpis.purchases_total||0) + (kpis.overhead_total||0) + conTotal;
    if (tot > 0) {
      data = [
        Math.round((kpis.expenses_total  / tot) * 100),
        Math.round((kpis.purchases_total / tot) * 100),
        Math.round((kpis.overhead_total  / tot) * 100),
        Math.round((conTotal             / tot) * 100),
      ];
    }
  } catch {}
  expPieChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: [financeChartColors.expense, financeChartColors.project, financeChartColors.income, financeChartColors.muted],
        borderWidth: 2,
        borderColor: financeChartColors.card,
      }]
    },
    options: {
      responsive: true,
      cutout: "55%",
      plugins: {
        legend: {
          position: "right",
          labels: { font: { size: 13 }, padding: 16,
            generateLabels: chart => chart.data.labels.map((lbl, i) => ({
              text: lbl + "\n" + chart.data.datasets[0].data[i] + "%",
              fillStyle: chart.data.datasets[0].backgroundColor[i],
              index: i,
            }))
          }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } }
      }
    }
  });
}

/* ── Sub-panel (Expenses / Purchases / Overhead tabs) ── */
let expSubFilterCat    = "";
let expSubFilterStatus = "";

async function expLoadSubKpis() {
  const type = expActiveTab; // expenses|purchases|overhead
  try {
    const kpis = await financeStandaloneApi("GET", `/api/expenses/sub-kpis?type=${type}`);
    document.getElementById("subKpiTotal").textContent   = formatCurrency(kpis.total   || 0);
    document.getElementById("subKpiPaid").textContent    = formatCurrency(kpis.paid    || 0);
    document.getElementById("subKpiUnpaid").textContent  = formatCurrency(kpis.unpaid  || 0);
    document.getElementById("subKpiPending").textContent = formatCurrency(kpis.pending || 0);
  } catch {
    ["subKpiTotal","subKpiPaid","subKpiUnpaid","subKpiPending"].forEach(id => {
      const e = document.getElementById(id); if (e) e.textContent = "₱0.00";
    });
  }
}

async function expRenderSubTable() {
  const tbody = document.getElementById("expSubTbody");
  if (!tbody) return;
  const q = document.getElementById("expSearchInput")?.value || "";
  const type = expActiveTab;
  try {
    const rows = await financeStandaloneApi("GET", `/api/expenses/list?type=${type}&cat=${encodeURIComponent(expSubFilterCat)}&status=${encodeURIComponent(expSubFilterStatus)}&search=${encodeURIComponent(q)}`);
    expSubRows = Array.isArray(rows) ? rows : [];
    if (!rows.length) {
      expSubRows = [];
      tbody.innerHTML = `<tr><td colspan="6" class="inc-empty">No records found.</td></tr>`; return;
    }
    tbody.innerHTML = rows.map(r => {
      const sc = r.status==="paid"?"completed":r.status==="unpaid"?"pending":"progress";
      return `<tr>
        <td>${formatDate(r.date)}</td>
        <td>${escapeHtml(r.category || "")}</td>
        <td>${escapeHtml(r.description || "")}</td>
        <td style="font-weight:700;color:#dc2626;">${formatCurrency(r.amount)}</td>
        <td><span class="badge ${sc}" style="border-radius:20px;padding:5px 14px;">${capitalize(r.status)}</span></td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
            <button type="button" data-exp-edit-id="${r.id}" style="width:32px;height:32px;border-radius:50%;border:none;background:#e8f4fd;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e3a6e;font-size:15px;"><i class="ri-pencil-line"></i></button>
            <button type="button" data-exp-delete-id="${r.id}" style="width:32px;height:32px;border-radius:50%;border:none;background:#fee2e2;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:15px;"><i class="ri-delete-bin-line"></i></button>
          </div>
        </td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll("[data-exp-edit-id]").forEach(btn => {
      btn.addEventListener("click", () => expOpenEdit(btn.dataset.expEditId));
    });
    tbody.querySelectorAll("[data-exp-delete-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = expSubRows.find(item => String(item.id) === String(btn.dataset.expDeleteId));
        if (row) expOpenDelete(row.id, row.description || "", row.amount);
      });
    });
  } catch {
    expSubRows = [];
    tbody.innerHTML = expFallbackSubRows();
  }
}

function expFallbackSubRows() {
  const demo = [
    { date:"2026-01-02", cat:"Salaries",        desc:"Staff Payroll",                    amt:200000, status:"paid"    },
    { date:"2026-01-13", cat:"Contractor Fees",  desc:"Tower Installation Contractor",   amt:45000,  status:"unpaid"  },
    { date:"2026-01-28", cat:"Legal Fees",       desc:"Contract Review - Legal Team",    amt:15000,  status:"pending" },
  ];
  return demo.map((r, i) => {
    const sc = r.status==="paid"?"completed":r.status==="unpaid"?"pending":"progress";
    return `<tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.cat}</td>
      <td>${r.desc}</td>
      <td style="font-weight:700;color:#dc2626;">${formatCurrency(r.amt)}</td>
      <td><span class="badge ${sc}" style="border-radius:20px;padding:5px 14px;">${capitalize(r.status)}</span></td>
      <td><div style="display:flex;gap:6px;align-items:center;justify-content:center;">
        <button style="width:32px;height:32px;border-radius:50%;border:none;background:#e8f4fd;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e3a6e;font-size:15px;"><i class="ri-pencil-line"></i></button>
        <button style="width:32px;height:32px;border-radius:50%;border:none;background:#fee2e2;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:15px;"><i class="ri-delete-bin-line"></i></button>
      </div></td>
    </tr>`;
  }).join("");
}

function expSubSetCat(cat) {
  expSubFilterCat = cat;
  document.getElementById("expSubCatBtn").innerHTML = (cat||"All Categories") + ' <i class="ri-arrow-down-s-line"></i>';
  document.getElementById("expSubCatDd").classList.remove("show");
  expRenderSubTable();
}
function expSubSetStatus(s) {
  expSubFilterStatus = s;
  document.getElementById("expSubStsBtn").innerHTML = (s ? capitalize(s) : "All Status") + ' <i class="ri-arrow-down-s-line"></i>';
  document.getElementById("expSubStsDd").classList.remove("show");
  expRenderSubTable();
}

/* ── Add / Edit modal ── */
function expOpenAdd() {
  const type = expActiveTab === "overview" ? "expenses" : expActiveTab;
  document.getElementById("expModalTitle").textContent = "Add " + capitalize(type === "expenses" ? "Expense" : type === "purchases" ? "Purchase" : "Overhead");
  document.getElementById("expEditId").value    = "";
  document.getElementById("expFType").value     = type;
  document.getElementById("expFDate").value     = new Date().toISOString().split("T")[0];
  document.getElementById("expFDesc").value     = "";
  document.getElementById("expFCat").value      = "";
  document.getElementById("expFVendor").value   = "";
  document.getElementById("expFAmount").value   = "";
  document.getElementById("expFStatus").value   = "paid";
  expSetModalCategories(type);
  document.getElementById("expModal").style.display = "flex";
}
function expOpenEdit(id, date, desc, cat, vendor, amount, status, type) {
  if (arguments.length === 1) {
    const row = expSubRows.find(item => String(item.id) === String(id));
    if (!row) {
      showToast("Expense record not found. Please refresh and try again.", "error");
      return;
    }
    date = row.date;
    desc = row.description || "";
    cat = row.category || "";
    vendor = row.vendor || "";
    amount = row.amount;
    status = row.status || "pending";
    type = row.type || row.expense_group || expActiveTab;
  }
  document.getElementById("expModalTitle").textContent = "Edit Record";
  document.getElementById("expEditId").value    = id;
  document.getElementById("expFType").value     = type || expActiveTab;
  document.getElementById("expFDate").value     = formatFinanceInventoryInputValue(date, "date");
  document.getElementById("expFDesc").value     = desc;
  document.getElementById("expFVendor").value   = vendor;
  document.getElementById("expFAmount").value   = amount;
  document.getElementById("expFStatus").value   = status;
  expSetModalCategories(type || expActiveTab, cat);
  document.getElementById("expModal").style.display = "flex";
}
function expSetModalCategories(type, selected) {
  const cats = {
    expenses:  ["Salaries","Contractor Fees","Legal Fees","Utilities","Other"],
    purchases: ["Equipment","Supplies","Materials","Software","Other"],
    overhead:  ["Rent","Internet","Insurance","Depreciation","Other"],
  };
  const sel = document.getElementById("expFCat");
  if (!sel) return;
  sel.innerHTML = (cats[type]||cats.expenses).map(c =>
    `<option value="${c}" ${c===selected?"selected":""}>${c}</option>`
  ).join("");
}
function expCloseModal() { document.getElementById("expModal").style.display = "none"; }
async function expSave() {
  const date   = document.getElementById("expFDate").value;
  const desc   = document.getElementById("expFDesc").value.trim();
  const cat    = document.getElementById("expFCat").value;
  const vendor = document.getElementById("expFVendor").value.trim();
  const amount = parseFloat(document.getElementById("expFAmount").value);
  const status = document.getElementById("expFStatus").value;
  const type   = document.getElementById("expFType").value;
  const editId = document.getElementById("expEditId").value;
  if (!date || !desc || !cat || !amount || isNaN(amount)) {
    showToast("Please fill in all required fields.", "error"); return;
  }
  try {
    if (editId) {
      await financeStandaloneApi("PUT", `/api/expenses/${editId}`, { date, desc, cat, vendor, amount, status, type });
      showToast("Record updated.", "success");
    } else {
      await financeStandaloneApi("POST", `/api/expenses`, { date, desc, cat, vendor, amount, status, type });
      showToast("Record added.", "success");
    }
    expCloseModal();
    if (expActiveTab === "overview") expLoadOverview();
    else { expRenderSubTable(); expLoadSubKpis(); }
  } catch (err) { showToast("Save failed: " + err.message, "error"); }
}
function expOpenDelete(id, desc, amount) {
  expDeleteId = id;
  document.getElementById("expDeletePreview").textContent = `${desc}  |  ${formatCurrency(amount)}`;
  document.getElementById("expDeleteModal").style.display = "flex";
}
function expCloseDelete() { document.getElementById("expDeleteModal").style.display = "none"; expDeleteId = null; }
async function expConfirmDelete() {
  try {
    await financeStandaloneApi("DELETE", `/api/expenses/${expDeleteId}`);
    expCloseDelete();
    if (expActiveTab === "overview") expLoadOverview();
    else { expRenderSubTable(); expLoadSubKpis(); }
    showToast("Record deleted.", "info");
  } catch (err) { showToast("Delete failed: " + err.message, "error"); }
}

/* ═══════════════════════════════════════════════
   CONTRIBUTION TAB
═══════════════════════════════════════════════ */

let conEditId     = null;
let conDeleteId   = null;
let conRows       = [];

async function conLoadKpis() {
  try {
    const kpis = await financeStandaloneApi("GET", "/api/contributions/kpis");
    document.getElementById("conKpiTotal").textContent   = formatCurrency(kpis.grand_total   || 0);
    document.getElementById("conKpiPaid").textContent    = formatCurrency(kpis.total_paid    || 0);
    document.getElementById("conKpiUnpaid").textContent  = formatCurrency(kpis.total_unpaid  || 0);
    document.getElementById("conKpiOverdue").textContent = formatCurrency(kpis.total_overdue || 0);
  } catch {
    ["conKpiTotal","conKpiPaid","conKpiUnpaid","conKpiOverdue"].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = "₱0.00";
    });
  }
}

function conApplyFilters() { conRenderTable(); }

async function conRenderTable() {
  const tbody = document.getElementById("conTbody");
  if (!tbody) return;
  const type   = document.getElementById("conFilterType")?.value   || "";
  const status = document.getElementById("conFilterStatus")?.value || "";
  const search = document.getElementById("expSearchInput")?.value  || "";
  tbody.innerHTML = `<tr><td colspan="8" class="inc-empty">Loading…</td></tr>`;
  try {
    let url = `/api/contributions?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`;
    const rows = await financeStandaloneApi("GET", url);
    conRows = Array.isArray(rows) ? rows : [];
    if (!rows.length) {
      conRows = [];
      tbody.innerHTML = `<tr><td colspan="8" class="inc-empty">No records found.</td></tr>`; return;
    }
    tbody.innerHTML = rows.map(r => {
      // Status badge — purpose-built colors per spec
      const statusStyle =
        r.status === "Paid"    ? "background:linear-gradient(135deg,#dcfce7,#bbf7d0);color:#14532d;box-shadow:0 2px 8px rgba(34,197,94,.2);" :
        r.status === "Overdue" ? "background:linear-gradient(135deg,#fff7ed,#ffedd5);color:#9a3412;box-shadow:0 2px 8px rgba(154,52,18,.18);" :
                                 "background:linear-gradient(135deg,#dbeafe,#bfdbfe);color:#1e3a6e;box-shadow:0 2px 8px rgba(30,58,110,.12);";
      // Type badge — pulled from KPI card palette
      const typeStyle =
        r.type === "SSS"       ? "background:linear-gradient(135deg,#1e3a6e,#2d5fa8);" :
        r.type === "PhilHealth"? "background:linear-gradient(135deg,#0f766e,#0d9488);" :
        r.type === "Pag-Ibig"  ? "background:linear-gradient(135deg,#0e7490,#0891b2);" :
                                 "background:linear-gradient(135deg,#475569,#64748b);";
      const typeBadge = `<span style="${typeStyle}color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;display:inline-block;">${r.type}</span>`;
      return `<tr style="border-bottom:1px solid #eef2f8;transition:background .15s;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
        <td style="padding:14px 20px;font-weight:600;">${escapeHtml(r.name || "")}</td>
        <td style="padding:14px 20px;text-align:center;">
          ${typeBadge}
        </td>
        <td style="padding:14px 20px;text-align:center;font-weight:600;">₱${Number(r.employee_share).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
        <td style="padding:14px 20px;text-align:center;font-weight:600;">₱${Number(r.employer_share).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
        <td style="padding:14px 20px;text-align:center;font-weight:800;color:#1e3a6e;">₱${Number(r.total).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
        <td style="padding:14px 20px;text-align:center;">${formatDate(r.due_date)}</td>
        <td style="padding:14px 20px;text-align:center;">
          <span style="${statusStyle}padding:5px 14px;border-radius:20px;font-size:12.5px;font-weight:700;display:inline-block;">${r.status}</span>
        </td>
        <td style="padding:14px 20px;text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;">
            <button type="button" data-con-edit-id="${r.id}"
              style="width:32px;height:32px;border-radius:50%;border:none;background:#e8f4fd;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e3a6e;font-size:15px;" title="Edit">
              <i class="ri-pencil-line"></i>
            </button>
            <button type="button" data-con-delete-id="${r.id}"
              style="width:32px;height:32px;border-radius:50%;border:none;background:#fee2e2;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:15px;" title="Delete">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll("[data-con-edit-id]").forEach(btn => {
      btn.addEventListener("click", () => conOpenEdit(btn.dataset.conEditId));
    });
    tbody.querySelectorAll("[data-con-delete-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = conRows.find(item => String(item.id) === String(btn.dataset.conDeleteId));
        if (row) conOpenDelete(row.id, row.name || "");
      });
    });
  } catch(err) {
    conRows = [];
    tbody.innerHTML = `<tr><td colspan="8" class="inc-empty" style="color:#dc2626;">Error: ${err.message}</td></tr>`;
  }
}

function conOpenAdd() {
  conEditId = null;
  document.getElementById("conModalTitle").textContent = "Add Contribution";
  document.getElementById("conFName").value         = "";
  document.getElementById("conFType").value         = "SSS";
  document.getElementById("conFEmpShare").value     = "";
  document.getElementById("conFErShare").value      = "";
  document.getElementById("conFDueDate").value      = new Date().toISOString().slice(0,10);
  document.getElementById("conFStatus").value       = "Unpaid";
  document.getElementById("conModal").style.display = "flex";
}
function conOpenEdit(id, name, type, empShare, erShare, dueDate, status) {
  if (arguments.length === 1) {
    const row = conRows.find(item => String(item.id) === String(id));
    if (!row) {
      showToast("Contribution record not found. Please refresh and try again.", "error");
      return;
    }
    name = row.name || "";
    type = row.type || "SSS";
    empShare = row.employee_share;
    erShare = row.employer_share;
    dueDate = row.due_date;
    status = row.status || "Unpaid";
  }
  conEditId = id;
  document.getElementById("conModalTitle").textContent = "Edit Contribution";
  document.getElementById("conFName").value         = name;
  document.getElementById("conFType").value         = type;
  document.getElementById("conFEmpShare").value     = empShare;
  document.getElementById("conFErShare").value      = erShare;
  document.getElementById("conFDueDate").value      = formatFinanceInventoryInputValue(dueDate, "date");
  document.getElementById("conFStatus").value       = status;
  document.getElementById("conModal").style.display = "flex";
}
function conCloseModal() { document.getElementById("conModal").style.display = "none"; conEditId = null; }
async function conSave() {
  const name         = document.getElementById("conFName").value.trim();
  const type         = document.getElementById("conFType").value;
  const employee_share = parseFloat(document.getElementById("conFEmpShare").value);
  const employer_share = parseFloat(document.getElementById("conFErShare").value);
  const due_date     = document.getElementById("conFDueDate").value;
  const status       = document.getElementById("conFStatus").value;
  if (!name || isNaN(employee_share) || isNaN(employer_share) || !due_date) {
    showToast("Please fill in all required fields.", "error"); return;
  }
  try {
    if (conEditId) {
      await financeStandaloneApi("PUT",  `/api/contributions/${conEditId}`, { name, type, employee_share, employer_share, due_date, status });
      showToast("Contribution updated.", "success");
    } else {
      await financeStandaloneApi("POST", `/api/contributions`, { name, type, employee_share, employer_share, due_date, status });
      showToast("Contribution added.", "success");
    }
    conCloseModal();
    conLoadKpis();
    conRenderTable();
  } catch(err) { showToast("Save failed: " + err.message, "error"); }
}
function conOpenDelete(id, name) {
  conDeleteId = id;
  document.getElementById("conDeleteName").textContent = name;
  document.getElementById("conDeleteModal").style.display = "flex";
}
function conCloseDelete() { document.getElementById("conDeleteModal").style.display = "none"; conDeleteId = null; }
async function conConfirmDelete() {
  try {
    await financeStandaloneApi("DELETE", `/api/contributions/${conDeleteId}`);
    conCloseDelete();
    conLoadKpis();
    conRenderTable();
    showToast("Record deleted.", "info");
  } catch(err) { showToast("Delete failed: " + err.message, "error"); }
}

/* ================= PROJECT EXPENSES ================= */

let peActiveTab      = "overview";   // overview | expenses | purchases
let peFilterPeriod   = "month";
let peFilterFrom     = "";
let peFilterTo       = "";
let peSubFilterStatus = "";
let peSubFilterCat    = "";
let peBarChart       = null;
let pePieChart       = null;
let peDeleteId       = null;

function loadProjectExpenses() {
  peActiveTab       = "overview";
  peFilterPeriod    = "month";
  peFilterFrom      = "";
  peFilterTo        = "";
  peSubFilterStatus = "";
  peSubFilterCat    = "";
  if (peBarChart) { peBarChart.destroy(); peBarChart = null; }
  if (pePieChart) { pePieChart.destroy(); pePieChart = null; }

  getFinanceMainContent().innerHTML = `
  <div class="exp-page">

    <!-- Header -->
    ${financePageHeader({
      title: "Project Expenses",
      subtitle: "Track project-level expenditures and purchases",
      icon: "ri-folder-chart-line",
      searchId: "peSearchInput"
    })}

    <!-- Tabs row — tabs left, filter right -->
    <div class="project-expenses-workspace">
    <div class="page-tab-row">
      <div class="page-tabs">
        <button class="exp-tab active" id="peTabOv"  onclick="peSwitchTab('overview')">Overview</button>
        <button class="exp-tab"        id="peTabPur" onclick="peSwitchTab('purchases')">Purchases</button>
        <button class="exp-tab"        id="peTabExp" onclick="peSwitchTab('expenses')">Expenses</button>
      </div>
      <div class="page-tab-controls pe-filter-bar" id="peFilterBar">
        <select id="pePeriodSelect" onchange="peSetPeriod(this.value)" class="pe-filter-select">
          <option value="today">Today</option>
          <option value="week">Weekly</option>
          <option value="month" selected>Monthly</option>
          <option value="year">Yearly</option>
          <option value="custom">Custom</option>
        </select>
        <input type="date" id="peFromDate" class="pe-filter-date" style="display:none;">
        <input type="date" id="peToDate"   class="pe-filter-date" style="display:none;">
        <button id="peApplyBtn" onclick="peApplyFilter()" class="pe-apply-btn" style="display:none;">Apply Filter</button>
      </div>
    </div>
    <!-- Body -->
    <div class="exp-body">

      <!-- ===== OVERVIEW PANEL ===== -->
      <div id="pePanelOv">

        <!-- KPI cards -->
        <div class="exp-kpi-row" style="margin-bottom:20px;">
          <div class="exp-kpi-card exp-kpi-blue">
            <div class="exp-kpi-icon"><i class="ri-money-dollar-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="peOvKpiTotal">—</div><div class="exp-kpi-lbl">Grand Total</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-teal">
            <div class="exp-kpi-icon"><i class="ri-folder-chart-line"></i></div>
            <div><div class="exp-kpi-val" id="peOvKpiExp">—</div><div class="exp-kpi-lbl">Project Expenses</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-cyan">
            <div class="exp-kpi-icon"><i class="ri-shopping-bag-line"></i></div>
            <div><div class="exp-kpi-val" id="peOvKpiPur">—</div><div class="exp-kpi-lbl">Project Purchases</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-indigo">
            <div class="exp-kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="peOvKpiApproved">—</div><div class="exp-kpi-lbl">Total Approved</div></div>
          </div>
        </div>

        <!-- Charts: grouped bar + doughnut pie -->
        <div class="exp-charts-row" style="margin-bottom:20px;">
          <div class="exp-chart-card">
            <div class="inc-chart-title">Expenses vs Purchases per Month</div>
            <canvas id="peBarChart" height="200"></canvas>
          </div>
          <div class="exp-chart-card">
            <div class="inc-chart-title">Expenses Distribution</div>
            <canvas id="pePieChart" height="200"></canvas>
          </div>
        </div>

        <!-- Recent records table -->
        <div class="inc-tbl-wrap">
          <div class="inc-tbl-banner">Recent Project Records</div>
          <table class="inc-tbl">
            <thead><tr>
              <th>Date</th><th>Project Name</th><th>Type</th><th>Description</th><th>Amount</th><th>Status</th>
            </tr></thead>
            <tbody id="peTbodyOv"><tr><td colspan="6" class="inc-empty">Loading…</td></tr></tbody>
          </table>
        </div>
      </div><!-- /pePanelOv -->

      <!-- ===== PURCHASES / EXPENSES SUB PANEL ===== -->
      <div id="pePanelSub" style="display:none;" hidden>
        <!-- KPI row -->
        <div class="exp-kpi-row" style="margin-bottom:20px;">
          <div class="exp-kpi-card exp-kpi-blue">
            <div class="exp-kpi-icon"><i class="ri-money-dollar-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="peKpiTotal">—</div><div class="exp-kpi-lbl">Total</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-teal">
            <div class="exp-kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="peKpiApproved">—</div><div class="exp-kpi-lbl">Approved</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-cyan">
            <div class="exp-kpi-icon"><i class="ri-time-line"></i></div>
            <div><div class="exp-kpi-val" id="peKpiPending">—</div><div class="exp-kpi-lbl">Pending</div></div>
          </div>
          <div class="exp-kpi-card exp-kpi-indigo">
            <div class="exp-kpi-icon"><i class="ri-close-circle-line"></i></div>
            <div><div class="exp-kpi-val" id="peKpiRejected">—</div><div class="exp-kpi-lbl">Rejected</div></div>
          </div>
        </div>

        <!-- Table header: title + Add + filters -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <h3 id="peSubTitle" style="font-size:20px;font-weight:800;color:#1e3a6e;"></h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button class="inc-btn-add" onclick="peOpenAdd()">
              <i class="ri-add-line"></i> Add
            </button>
            <select id="peSubFilterCatSel" onchange="peSubApplyFilters()"
              style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;background:white;color:#374151;cursor:pointer;">
              <option value="">All Categories</option>
              <option value="Materials">Materials</option>
              <option value="Labor">Labor</option>
              <option value="Equipment">Equipment</option>
              <option value="Logistics">Logistics</option>
              <option value="Other">Other</option>
            </select>
            <select id="peSubFilterStatusSel" onchange="peSubApplyFilters()"
              style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;background:white;color:#374151;cursor:pointer;">
              <option value="">All Status</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <!-- Sub table -->
        <div class="inc-tbl-wrap">
          <table class="inc-tbl">
            <thead><tr>
              <th>Date</th><th>Project Name</th><th>Description</th><th>Category</th><th>Supplier</th><th>Amount</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="peTbodySub"><tr><td colspan="8" class="inc-empty">Loading…</td></tr></tbody>
          </table>
        </div>
      </div><!-- /pePanelSub -->

    </div><!-- /exp-body -->
    </div><!-- /project-expenses-workspace -->
  </div><!-- /exp-page -->`;

  document.getElementById("peSearchInput").addEventListener("input", () => {
    if (peActiveTab === "overview") peLoadOverview();
    else peRenderSubTable();
  });

  peInitPeriodUI();
  peLoadOverview();
}

function peInitPeriodUI() {
  const sel = document.getElementById("pePeriodSelect");
  if (sel) sel.value = peFilterPeriod;
}

function peSetPeriod(val) {
  peFilterPeriod = val;
  const fromEl = document.getElementById("peFromDate");
  const toEl   = document.getElementById("peToDate");
  const applyBtn = document.getElementById("peApplyBtn");
  const isCustom = val === "custom";
  if (fromEl)   fromEl.style.display   = isCustom ? "" : "none";
  if (toEl)     toEl.style.display     = isCustom ? "" : "none";
  if (applyBtn) applyBtn.style.display = isCustom ? "" : "none";
  if (!isCustom) {
    peFilterFrom = ""; peFilterTo = "";
    if (peActiveTab === "overview") peLoadOverview();
    else { peRenderSubTable(); peLoadSubKpis(); }
  }
}

function peApplyFilter() {
  peFilterFrom = document.getElementById("peFromDate")?.value || "";
  peFilterTo   = document.getElementById("peToDate")?.value   || "";
  if (!peFilterFrom || !peFilterTo) { showToast("Please select both From and To dates.", "error"); return; }
  if (peActiveTab === "overview") peLoadOverview();
  else { peRenderSubTable(); peLoadSubKpis(); }
}

function peSubApplyFilters() {
  peSubFilterCat    = document.getElementById("peSubFilterCatSel")?.value    || "";
  peSubFilterStatus = document.getElementById("peSubFilterStatusSel")?.value || "";
  peRenderSubTable();
  peLoadSubKpis();
}

function peSwitchTab(tab) {
  peActiveTab = tab;
  ["Ov","Pur","Exp"].forEach(t => {
    const b = document.getElementById("peTab"+t); if (b) b.classList.remove("active");
  });
  const map = { overview:"Ov", purchases:"Pur", expenses:"Exp" };
  const ab = document.getElementById("peTab"+map[tab]); if (ab) ab.classList.add("active");

  const isOv = tab === "overview";
  const panelOv = document.getElementById("pePanelOv");
  const panelSub = document.getElementById("pePanelSub");
  panelOv.hidden = !isOv;
  panelSub.hidden = isOv;
  panelOv.style.display = isOv ? "grid" : "none";
  panelSub.style.display = isOv ? "none" : "block";
  const filterBar = document.getElementById("peFilterBar");
  if (filterBar) filterBar.style.display = isOv ? "flex" : "none";

  if (isOv) {
    peLoadOverview();
  } else {
    const titles = { purchases:"Project Purchases", expenses:"Project Expenses" };
    const titleEl = document.getElementById("peSubTitle"); if (titleEl) titleEl.textContent = titles[tab] || tab;
    // Reset sub filters
    peSubFilterCat = ""; peSubFilterStatus = "";
    const cs = document.getElementById("peSubFilterCatSel");    if (cs) cs.value = "";
    const ss = document.getElementById("peSubFilterStatusSel"); if (ss) ss.value = "";
    peRenderSubTable();
    peLoadSubKpis();
  }
}

function peBuildUrlParams() {
  let params = `period=${peFilterPeriod}`;
  if (peFilterPeriod === "custom" && peFilterFrom && peFilterTo)
    params += `&from=${peFilterFrom}&to=${peFilterTo}`;
  return params;
}

function peDestroyCharts() {
  if (peBarChart) { peBarChart.destroy(); peBarChart = null; }
  if (pePieChart) { pePieChart.destroy(); pePieChart = null; }
}

async function peLoadOverview() {
  peDestroyCharts();
  const search = document.getElementById("peSearchInput")?.value || "";
  try {
    const [chartData, recent, kpiPur, kpiExp] = await Promise.all([
      financeStandaloneApi("GET", `/api/project-expenses/chart?${peBuildUrlParams()}`),
      financeStandaloneApi("GET", `/api/project-expenses/recent?${peBuildUrlParams()}&search=${encodeURIComponent(search)}`),
      financeStandaloneApi("GET", `/api/project-expenses/kpis?type=purchases&${peBuildUrlParams()}`),
      financeStandaloneApi("GET", `/api/project-expenses/kpis?type=expenses&${peBuildUrlParams()}`)
    ]);
    // Overview KPI cards
    const grandTotal = Number(kpiPur.total||0) + Number(kpiExp.total||0);
    const totalApproved = Number(kpiPur.approved||0) + Number(kpiExp.approved||0);
    const el = id => document.getElementById(id);
    if (el("peOvKpiTotal"))    el("peOvKpiTotal").textContent    = formatCurrency(grandTotal);
    if (el("peOvKpiExp"))      el("peOvKpiExp").textContent      = formatCurrency(kpiExp.total||0);
    if (el("peOvKpiPur"))      el("peOvKpiPur").textContent      = formatCurrency(kpiPur.total||0);
    if (el("peOvKpiApproved")) el("peOvKpiApproved").textContent = formatCurrency(totalApproved);
    // Charts
    peRenderGroupedBarChart(chartData.purchases || [], chartData.expenses || []);
    peRenderPieChart(kpiPur.total || 0, kpiExp.total || 0);
    peRenderOverviewTable(recent);
  } catch(err) {
    peRenderGroupedBarChart([], []);
    peRenderPieChart(0, 0);
    const tbody = document.getElementById("peTbodyOv");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="inc-empty" style="color:#dc2626;">Error: ${err.message}</td></tr>`;
  }
}

function peRenderGroupedBarChart(purRows, expRows) {
  const canvas = document.getElementById("peBarChart");
  if (!canvas) return;
  const allLabels = [...new Set([
    ...purRows.map(r => r.month_label || ""),
    ...expRows.map(r => r.month_label || "")
  ])].filter(Boolean);
  const labels = allLabels.length ? allLabels : ["No data"];
  const getPurVal = lbl => { const r = purRows.find(r => r.month_label === lbl); return r ? Number(r.total||0) : 0; };
  const getExpVal = lbl => { const r = expRows.find(r => r.month_label === lbl); return r ? Number(r.total||0) : 0; };
  peBarChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Purchases", data: labels.map(getPurVal), backgroundColor: financeChartColors.project, borderRadius: 6, borderSkipped: false },
        { label: "Expenses",  data: labels.map(getExpVal), backgroundColor: financeChartColors.expense, borderRadius: 6, borderSkipped: false }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "top", labels: { font: { size: 12 }, padding: 12, usePointStyle: true } } },
      scales: {
        y: { beginAtZero: true, grid: { color: "#e5e7eb" }, ticks: { callback: v => "₱"+v.toLocaleString() } },
        x: { grid: { display: false } }
      }
    }
  });
}

function peRenderPieChart(purTotal, expTotal) {
  const canvas = document.getElementById("pePieChart");
  if (!canvas) return;
  const tot = purTotal + expTotal;
  const data = tot > 0
    ? [Math.round((purTotal / tot) * 100), Math.round((expTotal / tot) * 100)]
    : [50, 50];
  pePieChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Purchases", "Expenses"],
      datasets: [{ data, backgroundColor: [financeChartColors.project, financeChartColors.expense], borderWidth: 2, borderColor: financeChartColors.card }]
    },
    options: {
      responsive: true,
      cutout: "55%",
      plugins: {
        legend: {
          position: "right",
          labels: { font: { size: 13 }, padding: 16, usePointStyle: true,
            generateLabels: chart => chart.data.labels.map((lbl, i) => ({
              text: lbl + "\n" + chart.data.datasets[0].data[i] + "%",
              fillStyle: chart.data.datasets[0].backgroundColor[i], index: i
            }))
          }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } }
      }
    }
  });
}

function peRenderOverviewTable(rows) {
  const tbody = document.getElementById("peTbodyOv");
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6" class="inc-empty">No records found.</td></tr>`; return; }
  tbody.innerHTML = rows.map(r => {
    const peTypeCls   = r.type === "purchases" ? "pe-type-purchase" : "pe-type-expense";
    const peStatusCls = r.status === "approved" ? "pe-status-approved" : r.status === "rejected" ? "pe-status-rejected" : "pe-status-pending";
    return `<tr style="border-bottom:1px solid #eef2f8;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
      <td style="padding:14px 20px;">${formatDate(r.date)}</td>
      <td style="padding:14px 20px;font-weight:700;">${r.project_name||r.project||"—"}</td>
      <td style="padding:14px 20px;text-align:center;">
        <span class="pe-type-badge ${peTypeCls}">${r.type==="purchases"?"Purchase":"Expense"}</span>
      </td>
      <td style="padding:14px 20px;">${r.description||"—"}</td>
      <td style="padding:14px 20px;font-weight:800;color:#1e3a6e;">₱${Number(r.amount||0).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
      <td style="padding:14px 20px;text-align:center;">
        <span class="pe-status-badge ${peStatusCls}">${capitalize(r.status||"pending")}</span>
      </td>
    </tr>`;
  }).join("");
}

async function peLoadSubKpis() {
  const type = peActiveTab;
  try {
    const k = await financeStandaloneApi("GET", `/api/project-expenses/kpis?type=${type}&${peBuildUrlParams()}`);
    document.getElementById("peKpiTotal").textContent    = formatCurrency(k.total    || 0);
    document.getElementById("peKpiApproved").textContent = formatCurrency(k.approved || 0);
    document.getElementById("peKpiPending").textContent  = formatCurrency(k.pending  || 0);
    document.getElementById("peKpiRejected").textContent = formatCurrency(k.rejected || 0);
  } catch {
    ["peKpiTotal","peKpiApproved","peKpiPending","peKpiRejected"].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = "₱0.00";
    });
  }
}

async function peRenderSubTable() {
  const tbody = document.getElementById("peTbodySub");
  if (!tbody) return;
  const search = document.getElementById("peSearchInput")?.value || "";
  const type   = peActiveTab;
  tbody.innerHTML = `<tr><td colspan="8" class="inc-empty">Loading…</td></tr>`;
  try {
    const url = `/api/project-expenses/list?type=${type}&cat=${encodeURIComponent(peSubFilterCat)}&status=${encodeURIComponent(peSubFilterStatus)}&search=${encodeURIComponent(search)}&${peBuildUrlParams()}`;
    const rows = await financeStandaloneApi("GET", url);
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="inc-empty">No records found.</td></tr>`; return; }
    tbody.innerHTML = rows.map(r => {
      const peStatusCls = r.status==="approved" ? "pe-status-approved" : r.status==="rejected" ? "pe-status-rejected" : "pe-status-pending";
      const peCatCls    = "pe-cat-" + (r.category||"").toLowerCase().replace(/\s+/g,"-");
      const nameEsc = (r.project_name||r.project||"").replace(/'/g,"&apos;");
      const descEsc = (r.description||"").replace(/'/g,"&apos;");
      const vendEsc = (r.vendor||"").replace(/'/g,"&apos;");
      return `<tr style="border-bottom:1px solid #eef2f8;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
        <td style="padding:14px 20px;">${formatDate(r.date)}</td>
        <td style="padding:14px 20px;font-weight:700;">${r.project_name||r.project||"—"}</td>
        <td style="padding:14px 20px;">${r.description||"—"}</td>
        <td style="padding:14px 20px;text-align:center;"><span class="pe-cat-badge ${peCatCls}">${r.category||"—"}</span></td>
        <td style="padding:14px 20px;">${r.vendor||"—"}</td>
        <td style="padding:14px 20px;font-weight:800;color:#1e3a6e;">₱${Number(r.amount||0).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
        <td style="padding:14px 20px;text-align:center;">
          <span class="pe-status-badge ${peStatusCls}">${capitalize(r.status||"pending")}</span>
        </td>
        <td style="padding:14px 20px;text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;">
            <button onclick="peOpenEdit(${r.id},'${r.date?.slice(0,10)||""}','${nameEsc}','${descEsc}','${r.category||""}','${vendEsc}',${r.amount},'${r.status}','${r.type}')"
              style="width:32px;height:32px;border-radius:50%;border:none;background:#e8f4fd;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e3a6e;font-size:15px;" title="Edit">
              <i class="ri-pencil-line"></i>
            </button>
            <button onclick="peOpenDelete(${r.id},'${nameEsc}','${descEsc}',${r.amount})"
              style="width:32px;height:32px;border-radius:50%;border:none;background:#fee2e2;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:15px;" title="Delete">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="8" class="inc-empty" style="color:#dc2626;">Error: ${err.message}</td></tr>`;
  }
}

/* ── Add / Edit modal ── */
let peEditId = null;

function peSetModalOpen(isOpen) {
  const modal = document.getElementById("peModal");
  if (modal) modal.style.display = isOpen ? "flex" : "none";
  document.body.classList.toggle("finance-modal-lock", isOpen);
}

function peOpenAdd() {
  peEditId = null;
  const type = peActiveTab === "purchases" ? "purchases" : "expenses";
  document.getElementById("peModalTitle").textContent = type === "purchases" ? "Add Purchase" : "Add Expense";
  document.getElementById("peFType").value    = type;
  document.getElementById("peFDate").value    = new Date().toISOString().slice(0,10);
  document.getElementById("peFProject").value = "";
  document.getElementById("peFDesc").value    = "";
  document.getElementById("peFCat").value     = "Materials";
  document.getElementById("peFVendor").value  = "";
  document.getElementById("peFAmount").value  = "";
  document.getElementById("peFStatus").value  = "pending";
  peSetModalOpen(true);
}
function peOpenEdit(id, date, project, desc, cat, vendor, amount, status, type) {
  peEditId = id;
  document.getElementById("peModalTitle").textContent = "Edit Record";
  document.getElementById("peFType").value    = type || peActiveTab;
  document.getElementById("peFDate").value    = date;
  document.getElementById("peFDesc").value    = desc;
  document.getElementById("peFCat").value     = cat;
  document.getElementById("peFVendor").value  = vendor;
  document.getElementById("peFAmount").value  = amount;
  document.getElementById("peFStatus").value  = status;
  document.getElementById("peFProject").value = project || "";
  peSetModalOpen(true);
}
function peCloseModal() { peSetModalOpen(false); peEditId = null; }
async function peSave() {
  const date    = document.getElementById("peFDate").value;
  const project = document.getElementById("peFProject").value;
  const desc    = document.getElementById("peFDesc").value.trim();
  const cat     = document.getElementById("peFCat").value;
  const vendor  = document.getElementById("peFVendor").value.trim();
  const amount  = parseFloat(document.getElementById("peFAmount").value);
  const status  = document.getElementById("peFStatus").value;
  const type    = document.getElementById("peFType").value;
  if (!date || !project || !desc || isNaN(amount) || amount <= 0) {
    showToast("Please fill in Date, Project, Description, and Amount.", "error"); return;
  }
  try {
    if (peEditId) {
      await financeStandaloneApi("PUT",  `/api/project-expenses/${peEditId}`, { date, project, desc, cat, vendor, amount, status, type });
      showToast("Record updated.", "success");
    } else {
      await financeStandaloneApi("POST", `/api/project-expenses`, { date, project, desc, cat, vendor, amount, status, type });
      showToast("Record added.", "success");
    }
    peCloseModal();
    if (peActiveTab === "overview") peLoadOverview();
    else { peRenderSubTable(); peLoadSubKpis(); }
  } catch(err) { showToast("Save failed: " + err.message, "error"); }
}
function peOpenDelete(id, project, desc, amount) {
  peDeleteId = id;
  document.getElementById("peDeletePreview").textContent = `${project}  |  ${desc}  |  ₱${Number(amount).toLocaleString("en-PH",{minimumFractionDigits:2})}`;
  document.getElementById("peDeleteModal").style.display = "flex";
}
function peCloseDelete() { document.getElementById("peDeleteModal").style.display = "none"; peDeleteId = null; }
async function peConfirmDelete() {
  try {
    await financeStandaloneApi("DELETE", `/api/project-expenses/${peDeleteId}`);
    peCloseDelete();
    if (peActiveTab === "overview") peLoadOverview();
    else { peRenderSubTable(); peLoadSubKpis(); }
    showToast("Record deleted.", "info");
  } catch(err) { showToast("Delete failed: " + err.message, "error"); }
}

/* ================= FINANCIAL REPORT ================= */

let rpFilterYear  = new Date().getFullYear();
let rpFilterMonth = "";
let rpChart1      = null;  // main bar+line combo
let rpChart2      = null;  // income vs expense doughnut
let rpChart3      = null;  // monthly net sparkline

async function loadFinancialReport() {
  rpFilterYear  = new Date().getFullYear();
  rpFilterMonth = "";
  ['rpChart1','rpChart2','rpChart3'].forEach(k => {
    if (window[k]) { window[k].destroy(); window[k] = null; }
  });

  const yr = new Date().getFullYear();
  const yearOpts = [yr-2,yr-1,yr,yr+1]
    .map(y => `<option value="${y}" ${y===yr?"selected":""}>${y}</option>`).join("");

  getFinanceMainContent().innerHTML = `
  <div class="finance-page-shell finance-report-page" style="background:#f0f4fa;min-height:100%;padding-bottom:48px;">

    <!-- Header -->
    <div class="finance-page-header" style="background:linear-gradient(135deg,#0f2147 0%,#1e3a6e 55%,#2a52a0 100%);
                padding:28px 32px;position:relative;">
      <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.04);pointer-events:none;"></div>
      <div style="position:absolute;bottom:-50px;right:140px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.03);pointer-events:none;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;position:relative;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:46px;height:46px;background:rgba(255,255,255,.13);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;color:white;">
            <i class="ri-bar-chart-2-line"></i>
          </div>
          <div>
            <h2 style="font-size:22px;font-weight:800;color:white;margin:0;letter-spacing:-.3px;">Financial Report</h2>
            <p style="color:rgba(255,255,255,.65);font-size:12.5px;margin:3px 0 0;" id="rpHeaderSub">Yearly summary and breakdown</p>
          </div>
        </div>
        </div>
      </div>

      <!-- Inline mini-KPIs inside header -->
      <div class="finance-report-kpi-strip" style="display:grid;grid-template-columns:repeat(5,1fr);gap:1px;
                  background:rgba(255,255,255,.08);border-radius:14px;overflow:hidden;margin-top:24px;">
        ${[
          ['rpKpiIncome','Total Income','ri-arrow-up-circle-line'],
          ['rpKpiComp','Company Exp.','ri-bank-card-line'],
          ['rpKpiProj','Project Exp.','ri-file-list-3-line'],
          ['rpKpiCol','Collections','ri-hand-coin-line'],
          ['rpKpiNet','Net Income','ri-money-dollar-circle-line'],
        ].map(([id,lbl,ico]) => `
          <div class="finance-report-kpi-card" style="padding:16px 18px;background:rgba(255,255,255,.06);">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
              <i class="${ico}" style="color:rgba(255,255,255,.5);font-size:13px;"></i>
              <span class="finance-report-kpi-label" style="color:rgba(255,255,255,.55);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${lbl}</span>
            </div>
            <div id="${id}" class="finance-report-kpi-value" style="color:white;font-size:18px;font-weight:900;line-height:1;">—</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Period controls row — right-aligned, no tabs -->
    <div class="page-tab-row">
      <div class="page-tabs">
        <!-- Financial report has no sub-tabs — title only -->
        <span class="finance-report-controls-icon"><i class="ri-filter-3-line"></i></span>
        <div>
          <strong>Report Controls</strong>
          <span>Adjust the period, export the report, or print a clean copy.</span>
        </div>
      </div>
      <div class="finance-report-controls-actions">
        <select id="rpYearSel" class="pe-filter-select">${yearOpts}</select>
        <select id="rpMonthSel" class="pe-filter-select">
          <option value="">All Months</option>
          <option value="01">January</option><option value="02">February</option><option value="03">March</option><option value="04">April</option><option value="05">May</option><option value="06">June</option><option value="07">July</option><option value="08">August</option><option value="09">September</option><option value="10">October</option><option value="11">November</option><option value="12">December</option>
        </select>
        <div class="rp-export-wrap">
          <button onclick="rpToggleExportMenu(event)" class="rp-export-btn" type="button" aria-haspopup="true" aria-expanded="false">
            <i class="ri-download-2-line"></i> Export <i class="ri-arrow-down-s-line"></i>
          </button>
          <div id="rpExportMenu" class="rp-export-menu" role="menu">
            <button onclick="rpExportExcel(); rpCloseExportMenu();" type="button" role="menuitem">
              <i class="ri-file-excel-2-line"></i> Export as Excel
            </button>
            <button onclick="rpExportCSV(); rpCloseExportMenu();" type="button" role="menuitem">
              <i class="ri-file-text-line"></i> Export as CSV
            </button>
          </div>
        </div>
        <button onclick="rpPrint()" class="rp-print-btn" type="button">
          <i class="ri-printer-line"></i> Print
        </button>
      </div>
    </div>

    <!-- ══ Trend cards row ════════════════════════════════════════ -->
    <div class="finance-report-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px 32px 0;">

      <!-- Income vs Expense doughnut -->
      <div class="finance-report-card" style="background:white;border-radius:16px;padding:20px;box-shadow:0 4px 18px rgba(0,0,0,.07);">
        <div style="font-size:12px;font-weight:800;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
          <span style="width:3px;height:14px;background:#1e3a6e;border-radius:2px;display:inline-block;"></span>
          Expense Breakdown
        </div>
        <canvas id="rpDoughnut" height="175"></canvas>
        <div id="rpDoughnutLegend" style="margin-top:12px;display:flex;flex-direction:column;gap:6px;"></div>
      </div>

      <!-- Best/Worst month highlights -->
      <div class="finance-report-card" style="background:white;border-radius:16px;padding:20px;box-shadow:0 4px 18px rgba(0,0,0,.07);">
        <div style="font-size:12px;font-weight:800;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
          <span style="width:3px;height:14px;background:#1e3a6e;border-radius:2px;display:inline-block;"></span>
          Period Highlights
        </div>
        <div id="rpHighlights" style="display:flex;flex-direction:column;gap:10px;">
          <div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">Loading...</div>
        </div>
      </div>

      <!-- Net sparkline -->
      <div class="finance-report-card" style="background:white;border-radius:16px;padding:20px;box-shadow:0 4px 18px rgba(0,0,0,.07);">
        <div style="font-size:12px;font-weight:800;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
          <span style="width:3px;height:14px;background:#1e3a6e;border-radius:2px;display:inline-block;"></span>
          Net Income Trend
        </div>
        <canvas id="rpNetLine" height="175"></canvas>
      </div>
    </div>

    <!-- ══ Main bar+line chart ════════════════════════════════════ -->
    <div class="finance-report-card finance-report-wide-card" style="margin:16px 32px 0;background:white;border-radius:16px;padding:22px 24px;box-shadow:0 4px 18px rgba(0,0,0,.07);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:12px;font-weight:800;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;display:flex;align-items:center;gap:8px;">
          <span style="width:3px;height:16px;background:linear-gradient(180deg,#1f3a5f,#2563eb);border-radius:2px;display:inline-block;"></span>
          Income vs Expenses
        </div>
        <div style="display:flex;gap:14px;font-size:12px;font-weight:600;">
          <span style="display:flex;align-items:center;gap:5px;color:#16a34a;"><span style="width:10px;height:10px;background:#16a34a;border-radius:2px;display:inline-block;"></span>Income</span>
          <span style="display:flex;align-items:center;gap:5px;color:#dc2626;"><span style="width:10px;height:10px;background:#dc2626;border-radius:2px;display:inline-block;"></span>Expenses</span>
          <span style="display:flex;align-items:center;gap:5px;color:#3b82f6;"><span style="width:10px;height:10px;background:#3b82f6;border-radius:50%;display:inline-block;"></span>Net</span>
        </div>
      </div>
      <canvas id="rpMainChart" height="85"></canvas>
    </div>

    <!-- ══ Monthly Table ══════════════════════════════════════════ -->
    <div class="finance-table-card finance-report-table-card" style="margin:16px 32px 0;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.07);">
      <div style="background:linear-gradient(135deg,#0f2147,#1e3a6e);padding:16px 24px;
                  display:flex;align-items:center;justify-content:space-between;">
        <span style="color:white;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">
          <i class="ri-table-line" style="margin-right:8px;"></i>Monthly Breakdown
        </span>
        <span id="rpTableLabel" style="color:rgba(255,255,255,.6);font-size:12px;font-weight:600;"></span>
      </div>
      <div class="finance-report-table-scroll">
        <table id="rpTable" class="finance-report-monthly-table" style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:rgba(184,212,236,.45);">
              <th style="padding:12px 20px;text-align:left;font-size:10.5px;font-weight:900;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;">Month</th>
              <th style="padding:12px 20px;text-align:right;font-size:10.5px;font-weight:900;color:#16a34a;text-transform:uppercase;letter-spacing:.8px;">Income</th>
              <th style="padding:12px 20px;text-align:right;font-size:10.5px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:.8px;">Company Exp.</th>
              <th style="padding:12px 20px;text-align:right;font-size:10.5px;font-weight:900;color:#f59e0b;text-transform:uppercase;letter-spacing:.8px;">Project Exp.</th>
              <th style="padding:12px 20px;text-align:right;font-size:10.5px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:.8px;">Total Exp.</th>
              <th style="padding:12px 20px;text-align:right;font-size:10.5px;font-weight:900;color:#7c3aed;text-transform:uppercase;letter-spacing:.8px;">Collections</th>
              <th style="padding:12px 20px;text-align:right;font-size:10.5px;font-weight:900;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;">Net Income</th>
              <th style="padding:12px 20px;text-align:center;font-size:10.5px;font-weight:900;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;">Margin</th>
            </tr>
          </thead>
          <tbody id="rpTbody">
            <tr><td colspan="8" style="text-align:center;padding:48px;color:#94a3b8;">Loading...</td></tr>
          </tbody>
          <tfoot id="rpTfoot"></tfoot>
        </table>
      </div>
    </div>

  </div>`;

  // Wire filter events
  document.getElementById("rpYearSel").addEventListener("change", e => {
    rpFilterYear = parseInt(e.target.value); rpLoad();
  });
  document.getElementById("rpMonthSel").addEventListener("change", e => {
    rpFilterMonth = e.target.value; rpLoad();
  });

  rpLoad();
}

/* ── Load all data ── */
function rpCloseExportMenu() {
  const menu = document.getElementById("rpExportMenu");
  const btn = document.querySelector(".rp-export-btn");
  if (menu) menu.classList.remove("show");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function rpToggleExportMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("rpExportMenu");
  const btn = document.querySelector(".rp-export-btn");
  if (!menu) return;
  const shouldOpen = !menu.classList.contains("show");
  menu.classList.toggle("show", shouldOpen);
  if (btn) btn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

if (!window.__financeReportExportMenuBound) {
  document.addEventListener("click", e => {
    if (!e.target.closest?.(".rp-export-wrap")) rpCloseExportMenu();
  });
  window.__financeReportExportMenuBound = true;
}

async function rpLoad() {
  const p = new URLSearchParams({ year: rpFilterYear });
  if (rpFilterMonth) p.set("month", rpFilterMonth);

  // Update header subtitle
  const months = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
  const periodLabel = rpFilterMonth
    ? `${months[parseInt(rpFilterMonth)]} ${rpFilterYear}`
    : `Full Year ${rpFilterYear}`;
  const sub = document.getElementById("rpHeaderSub");
  if (sub) sub.textContent = `Period: ${periodLabel}`;
  const tbl = document.getElementById("rpTableLabel");
  if (tbl) tbl.textContent = periodLabel;

  try {
    const [kpis, monthly] = await Promise.all([
      financeStandaloneApi("GET", "/api/report/kpis?"    + p.toString()),
      financeStandaloneApi("GET", "/api/report/monthly?" + p.toString()),
    ]);

    // ── KPI strip ──────────────────────────────────────────────
    const income = Number(kpis.total_income   || 0);
    const comp   = Number(kpis.comp_expenses  || 0);
    const proj   = Number(kpis.proj_expenses  || 0);
    const col    = Number(kpis.total_collections || 0);
    const net    = income - comp - proj;

    const fmt = v => formatCurrency(v);
    document.getElementById("rpKpiIncome").textContent = fmt(income);
    document.getElementById("rpKpiComp").textContent   = fmt(comp);
    document.getElementById("rpKpiProj").textContent   = fmt(proj);
    document.getElementById("rpKpiCol").textContent    = fmt(col);
    const netEl = document.getElementById("rpKpiNet");
    if (netEl) {
      netEl.textContent  = fmt(net);
      netEl.style.color  = net >= 0 ? financeChartColors.collection : financeChartColors.expense;
    }

    // ── Charts ─────────────────────────────────────────────────
    rpDrawMainChart(monthly);
    rpDrawDoughnut(comp, proj);
    rpDrawNetLine(monthly);
    rpDrawHighlights(monthly, income, net);

    // ── Table ──────────────────────────────────────────────────
    rpDrawTable(monthly);

  } catch(err) {
    const tb = document.getElementById("rpTbody");
    if (tb) tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:44px;color:#dc2626;">Error: ${err.message}</td></tr>`;
    showToast("Failed to load report: " + err.message, "error");
  }
}

/* ── Main bar+line chart ── */
function rpDrawMainChart(monthly) {
  const canvas = document.getElementById("rpMainChart");
  if (!canvas) return;
  if (rpChart1) { rpChart1.destroy(); rpChart1 = null; }
  if (!monthly.length) return;
  rpChart1 = new Chart(canvas, {
    type:"bar",
    data:{
      labels: monthly.map(r => r.month_label),
      datasets:[
        { label:"Income",   data: monthly.map(r=>Number(r.total_income||0)),
          backgroundColor:"rgba(37, 99, 235, 0.72)", borderRadius:5, order:2 },
        { label:"Expenses", data: monthly.map(r=>Number(r.total_expenses||0)),
          backgroundColor:"rgba(220, 38, 38, 0.68)", borderRadius:5, order:3 },
        { label:"Net",      data: monthly.map(r=>Number(r.net_income||0)),
          type:"line", borderColor:financeChartColors.income, backgroundColor:"rgba(37, 99, 235, 0.12)",
          pointBackgroundColor:financeChartColors.income, pointRadius:4, pointHoverRadius:6,
          borderWidth:2.5, tension:.35, fill:true, order:1 },
      ]
    },
    options:{
      responsive:true,
      interaction:{ mode:"index", intersect:false },
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ${formatCurrency(c.parsed.y)}` } }
      },
      scales:{
        y:{ beginAtZero:true, grid:{color:"rgba(0,0,0,.04)"},
            ticks:{ callback:v=>"₱"+Number(v/1000).toFixed(0)+"k", font:{size:10} } },
        x:{ grid:{display:false}, ticks:{font:{size:11}} }
      }
    }
  });
}

/* ── Doughnut — expense breakdown ── */
function rpDrawDoughnut(comp, proj) {
  const canvas = document.getElementById("rpDoughnut");
  if (!canvas) return;
  if (rpChart2) { rpChart2.destroy(); rpChart2 = null; }
  const total = comp + proj;
  const legend = document.getElementById("rpDoughnutLegend");

  if (total === 0) {
    if (legend) legend.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:13px;">No expense data.</div>`;
    return;
  }
  const cpct = total ? Math.round(comp/total*100) : 0;
  const ppct = total ? Math.round(proj/total*100) : 0;

  rpChart2 = new Chart(canvas, {
    type:"doughnut",
    data:{
      labels:["Company Expenses","Project Expenses"],
      datasets:[{ data:[comp,proj],
        backgroundColor:[financeChartColors.expense, financeChartColors.project],
        borderWidth:3, borderColor:financeChartColors.card, hoverOffset:6 }]
    },
    options:{ cutout:"65%", plugins:{ legend:{display:false},
      tooltip:{ callbacks:{ label: c => ` ${c.label}: ${formatCurrency(c.raw)}` } } } }
  });

  if (legend) legend.innerHTML = [
    ["Company Expenses","#dc2626",comp,cpct],
    ["Project Expenses","#f59e0b",proj,ppct],
  ].map(([lbl,clr,val,pct]) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="display:flex;align-items:center;gap:7px;">
        <span style="width:10px;height:10px;border-radius:2px;background:${clr};flex-shrink:0;display:inline-block;"></span>
        <span style="font-size:12px;color:#374151;font-weight:600;">${lbl}</span>
      </div>
      <div style="text-align:right;">
        <span style="font-size:12px;font-weight:800;color:${clr};">${pct}%</span>
        <span style="font-size:11px;color:#9ca3af;margin-left:6px;">${formatCurrency(val)}</span>
      </div>
    </div>`).join("");
}

/* ── Net income sparkline ── */
function rpDrawNetLine(monthly) {
  const canvas = document.getElementById("rpNetLine");
  if (!canvas) return;
  if (rpChart3) { rpChart3.destroy(); rpChart3 = null; }
  if (!monthly.length) return;
  const netData = monthly.map(r => Number(r.net_income || 0));
  const colors  = netData.map(v => v >= 0 ? "rgba(22, 163, 74, 0.72)" : "rgba(220, 38, 38, 0.72)");
  rpChart3 = new Chart(canvas, {
    type:"bar",
    data:{
      labels: monthly.map(r => r.month_label),
      datasets:[{
        data: netData,
        backgroundColor: colors,
        borderRadius:5,
      }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label: c => ` Net: ${formatCurrency(c.parsed.y)}` } }
      },
      scales:{
        y:{ grid:{color:"rgba(0,0,0,.04)"}, ticks:{ callback:v=>"₱"+Number(v/1000).toFixed(0)+"k", font:{size:10} } },
        x:{ grid:{display:false}, ticks:{font:{size:10},maxRotation:45} }
      }
    }
  });
}

/* ── Highlights panel ── */
function rpDrawHighlights(monthly, totalIncome, totalNet) {
  const el = document.getElementById("rpHighlights");
  if (!el || !monthly.length) return;

  const byNet  = [...monthly].sort((a,b) => Number(b.net_income||0) - Number(a.net_income||0));
  const best   = byNet[0];
  const worst  = byNet[byNet.length-1];
  const losses = monthly.filter(r => Number(r.net_income||0) < 0).length;
  const avgNet = monthly.length ? totalNet / monthly.length : 0;

  const card = (icon, label, value, color, sub) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                border-radius:11px;background:${color}12;border-left:3px solid ${color};">
      <div style="font-size:20px;">${icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        <div style="font-size:13.5px;font-weight:900;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px;">${sub}</div>` : ''}
      </div>
    </div>`;

  el.innerHTML = [
    card("🏆","Best Month", best.month_label, "#16a34a", `Net: ${formatCurrency(Number(best.net_income||0))}`),
    card("📉","Worst Month", worst.month_label, "#dc2626", `Net: ${formatCurrency(Number(worst.net_income||0))}`),
    card("📊","Avg. Net / Month", formatCurrency(avgNet), "#3b82f6", `${monthly.length} period(s)`),
    card("⚠️","Loss Periods", `${losses} month${losses!==1?"s":""}`, losses>0?"#f59e0b":"#16a34a",
         losses>0 ? "Review spending" : "All periods profitable"),
  ].join("");
}

/* ── Monthly table ── */
function rpDrawTable(monthly) {
  const tbody = document.getElementById("rpTbody");
  const tfoot = document.getElementById("rpTfoot");
  if (!tbody) return;

  if (!monthly.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:#94a3b8;">No data for this period.</td></tr>`;
    if (tfoot) tfoot.innerHTML = "";
    return;
  }

  const marginBadge = (income, expenses) => {
    if (!income || income === 0) return `<span style="color:#9ca3af;font-size:12px;">—</span>`;
    const margin = ((income - expenses) / income * 100);
    const color = margin >= 30 ? "#16a34a" : margin >= 0 ? "#f59e0b" : "#dc2626";
    const bg    = margin >= 30 ? "#dcfce7" : margin >= 0 ? "#fef3c7" : "#fee2e2";
    return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;
                          font-size:11.5px;font-weight:800;background:${bg};color:${color};">
              ${margin.toFixed(1)}%
            </span>`;
  };

  tbody.innerHTML = monthly.map((r,i) => {
    const net     = Number(r.net_income   || 0);
    const income  = Number(r.total_income || 0);
    const exp     = Number(r.total_expenses || 0);
    const nc      = net >= 0 ? "#16a34a" : "#dc2626";
    const stripe  = i%2===0 ? "" : "background:#fafbfc;";
    return `<tr style="${stripe}border-bottom:1px solid #eef2f8;transition:background .12s;"
                onmouseover="this.style.background='#f0f7ff'"
                onmouseout="this.style.background='${i%2===0?'':'#fafbfc'}'">
      <td style="padding:13px 20px;font-weight:700;color:#1e3a6e;white-space:nowrap;">${r.month_label}</td>
      <td style="padding:13px 20px;text-align:right;font-weight:600;color:#16a34a;">${formatCurrency(income)}</td>
      <td style="padding:13px 20px;text-align:right;color:#dc2626;">${formatCurrency(r.total_comp_expenses||0)}</td>
      <td style="padding:13px 20px;text-align:right;color:#f59e0b;">${formatCurrency(r.total_proj_expenses||0)}</td>
      <td style="padding:13px 20px;text-align:right;font-weight:600;color:#dc2626;">${formatCurrency(exp)}</td>
      <td style="padding:13px 20px;text-align:right;color:#7c3aed;">${formatCurrency(r.total_collections||0)}</td>
      <td style="padding:13px 20px;text-align:right;font-weight:900;color:${nc};">${formatCurrency(net)}</td>
      <td style="padding:13px 20px;text-align:center;">${marginBadge(income, exp)}</td>
    </tr>`;
  }).join("");

  // Totals footer
  const tot = monthly.reduce((a,r) => ({
    income:   a.income   + Number(r.total_income||0),
    comp:     a.comp     + Number(r.total_comp_expenses||0),
    proj:     a.proj     + Number(r.total_proj_expenses||0),
    expenses: a.expenses + Number(r.total_expenses||0),
    col:      a.col      + Number(r.total_collections||0),
    net:      a.net      + Number(r.net_income||0),
  }), {income:0,comp:0,proj:0,expenses:0,col:0,net:0});

  const totMargin = tot.income > 0 ? ((tot.income - tot.expenses)/tot.income*100).toFixed(1)+"%" : "—";

  if (tfoot) tfoot.innerHTML = `
    <tr style="background:#0f2147;">
      <td style="padding:15px 20px;color:rgba(255,255,255,.7);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;">TOTAL</td>
      <td style="padding:15px 20px;text-align:right;color:#16a34a;font-weight:900;font-size:13.5px;">${formatCurrency(tot.income)}</td>
      <td style="padding:15px 20px;text-align:right;color:#dc2626;font-weight:700;">${formatCurrency(tot.comp)}</td>
      <td style="padding:15px 20px;text-align:right;color:#fcd34d;font-weight:700;">${formatCurrency(tot.proj)}</td>
      <td style="padding:15px 20px;text-align:right;color:#dc2626;font-weight:900;font-size:13.5px;">${formatCurrency(tot.expenses)}</td>
      <td style="padding:15px 20px;text-align:right;color:#2563eb;font-weight:700;">${formatCurrency(tot.col)}</td>
      <td style="padding:15px 20px;text-align:right;font-weight:900;font-size:13.5px;color:${tot.net>=0?financeChartColors.collection:financeChartColors.expense};">${formatCurrency(tot.net)}</td>
      <td style="padding:15px 20px;text-align:center;color:rgba(255,255,255,.75);font-weight:800;">${totMargin}</td>
    </tr>`;
}

/* ── Export Excel (SheetJS) with full design matching PDF ── */
async function rpExportExcel() {
  const table = document.getElementById("rpTable");
  if (!table) { showToast("No data to export.", "error"); return; }

  showToast("Generating Excel file…", "info");

  // Load SheetJS dynamically if needed
  if (typeof XLSX === "undefined") {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = resolve; s.onerror = () => reject(new Error("Failed to load SheetJS"));
      document.head.appendChild(s);
    });
  }

  const MONLABELS = ["","January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
  const period   = rpFilterMonth
    ? `${MONLABELS[parseInt(rpFilterMonth)]} ${rpFilterYear}`
    : `Full Year ${rpFilterYear}`;
  const filename = `Financial_Report_${rpFilterYear}${rpFilterMonth
    ? "_" + MONLABELS[parseInt(rpFilterMonth)] : "_Full_Year"}.xlsx`;

  const get    = id => document.getElementById(id)?.textContent?.trim() || "—";
  const toNum  = txt => { const n = parseFloat(txt.replace(/[^0-9.\-]/g,"")); return isNaN(n)?0:n; };

  // ── Color palette (matches PDF/UI) ──
  const C = {
    navyDark:  "0F2147",
    navy:      "1E3A6E",
    navyLight: "2D5FA8",
    teal:      "0D9488",
    green:     "16A34A",
    greenBg:   "DCFCE7",
    red:       "DC2626",
    redBg:     "FEE2E2",
    amber:     "D97706",
    amberBg:   "FEF3C7",
    purple:    "7C3AED",
    purpleBg:  "EDE9FE",
    white:     "FFFFFF",
    light:     "F8FAFC",
    mid:       "E2E8F0",
    text:      "1E293B",
    muted:     "64748B",
  };

  // Helper: create a styled cell
  function sc(v, style) { return { v, t: typeof v==="number"?"n":"s", s: style }; }

  // Helper: navy header cell
  const hdr = v => sc(v, {
    font:      { bold:true, color:{ rgb: C.white }, sz:10, name:"Calibri" },
    fill:      { patternType:"solid", fgColor:{ rgb: C.navy } },
    alignment: { horizontal:"center", vertical:"center", wrapText:true },
    border:    { top:{style:"thin",color:{rgb:C.navyLight}}, bottom:{style:"thin",color:{rgb:C.navyLight}},
                 left:{style:"thin",color:{rgb:C.navyLight}}, right:{style:"thin",color:{rgb:C.navyLight}} }
  });

  // Helper: title cell (big navy)
  const title = v => sc(v, {
    font:      { bold:true, color:{ rgb: C.white }, sz:16, name:"Calibri" },
    fill:      { patternType:"solid", fgColor:{ rgb: C.navyDark } },
    alignment: { horizontal:"center", vertical:"center" }
  });

  // Helper: subtitle cell
  const subtitle = v => sc(v, {
    font:      { bold:false, color:{ rgb: C.white }, sz:10, name:"Calibri" },
    fill:      { patternType:"solid", fgColor:{ rgb: C.navy } },
    alignment: { horizontal:"center", vertical:"center" }
  });

  // Helper: KPI cell
  const kpiLbl  = (v, bg) => sc(v, { font:{bold:true,color:{rgb:C.white},sz:9,name:"Calibri"},
    fill:{patternType:"solid",fgColor:{rgb:bg}}, alignment:{horizontal:"center"} });
  const kpiVal  = (v, bg) => sc(v, { font:{bold:true,color:{rgb:C.white},sz:13,name:"Calibri"},
    fill:{patternType:"solid",fgColor:{rgb:bg}}, alignment:{horizontal:"center"} });

  // Helper: number data cell
  const numCell = (v, fg, bgHex, bold=false) => ({
    v, t:"n",
    z: '"₱"#,##0.00',
    s: { font:{bold, color:{rgb: fg||C.text}, sz:10, name:"Calibri"},
         fill:{ patternType:"solid", fgColor:{rgb: bgHex||C.white} },
         alignment:{horizontal:"right"},
         border:{bottom:{style:"thin",color:{rgb:C.mid}},right:{style:"thin",color:{rgb:C.mid}}} }
  });

  // Helper: label cell (left-aligned, navy bold)
  const lbl = (v, bgHex, bold=false) => sc(v, {
    font:      { bold, color:{ rgb: bold ? C.navy : C.text }, sz:10, name:"Calibri" },
    fill:      { patternType:"solid", fgColor:{ rgb: bgHex||C.white } },
    alignment: { horizontal:"left", vertical:"center" },
    border:    { bottom:{style:"thin",color:{rgb:C.mid}}, right:{style:"thin",color:{rgb:C.mid}} }
  });

  const wb = XLSX.utils.book_new();

  /* ════════════════════════════════════════════════
     SHEET 1 — FINANCIAL SUMMARY
  ════════════════════════════════════════════════ */
  const income  = toNum(get("rpKpiIncome"));
  const comp    = toNum(get("rpKpiComp"));
  const proj    = toNum(get("rpKpiProj"));
  const colAmt  = toNum(get("rpKpiCol"));
  const net     = toNum(get("rpKpiNet"));
  const totalEx = comp + proj;

  const summaryRows = [
    // Row 0: Big title (merged A1:F1)
    [ title("STELLARSAT SOLUTIONS INC — FINANCIAL REPORT"), "", "", "", "", "" ],
    // Row 1: Period subtitle (merged A2:F2)
    [ subtitle(`Period: ${period}  ·  Generated: ${new Date().toLocaleDateString("en-PH",{dateStyle:"long"})}`), "", "", "", "", "" ],
    // Row 2: blank
    [],
    // Row 3: KPI labels row
    [ kpiLbl("TOTAL INCOME",    C.navy),
      kpiLbl("COMPANY EXP.",    C.red),
      kpiLbl("PROJECT EXP.",    C.amber),
      kpiLbl("COLLECTIONS",    C.purple),
      kpiLbl("NET INCOME",      income-totalEx >= 0 ? C.green : C.red),
      "" ],
    // Row 4: KPI values row
    [ kpiVal(income,   C.navy),
      kpiVal(comp,     C.red),
      kpiVal(proj,     C.amber),
      kpiVal(colAmt,   C.purple),
      kpiVal(net,      income-totalEx >= 0 ? C.green : C.red),
      "" ],
    // Row 5: blank
    [],
    // Row 6: section header
    [ hdr("METRIC"), hdr("VALUE"), "", "", "", "" ],
    // Row 7-13: detail rows
    [ lbl("Total Income",          C.light, true), numCell(income, C.green, C.light, true), "", "", "", "" ],
    [ lbl("Company Expenses",      C.white, false), numCell(comp,  C.red,   C.white),       "", "", "", "" ],
    [ lbl("Project Expenses",      C.light, false), numCell(proj,  C.amber, C.light),       "", "", "", "" ],
    [ lbl("Total Expenses",        C.white, true),  numCell(totalEx, C.red, C.white, true), "", "", "", "" ],
    [ lbl("Collections Received",  C.light, false), numCell(colAmt, C.purple, C.light),     "", "", "", "" ],
    [ lbl("Net Income",            C.white, true),
      numCell(net, net>=0?C.green:C.red, C.white, true), "", "", "", "" ],
    [],
    [ lbl(`Profit Margin`, C.light, false),
      sc((income>0 ? (net/income*100).toFixed(1)+"%" : "N/A"), {
        font:{bold:true, color:{rgb: net>=0?C.green:C.red}, sz:11, name:"Calibri"},
        fill:{patternType:"solid", fgColor:{rgb:C.light}},
        alignment:{horizontal:"right"}
      }), "", "", "", "" ],
    [],
    [ sc("Stellarsat Solutions Inc  ·  Confidential Financial Document", {
        font:{italic:true, color:{rgb:C.muted}, sz:9, name:"Calibri"},
        alignment:{horizontal:"center"}
      }), "", "", "", "", "" ],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1["!cols"] = [{wch:30},{wch:20},{wch:18},{wch:18},{wch:18},{wch:16}];
  ws1["!rows"] = [{hpt:32},{hpt:20},{hpt:8},{hpt:22},{hpt:28},{hpt:8}];
  ws1["!merges"] = [
    {s:{r:0,c:0}, e:{r:0,c:5}},  // title
    {s:{r:1,c:0}, e:{r:1,c:5}},  // subtitle
    {s:{r:3,c:5}, e:{r:4,c:5}},  // KPI padding
    {s:{r:7,c:2}, e:{r:7,c:5}},  // income row padding
    {s:{r:8,c:2}, e:{r:8,c:5}},
    {s:{r:9,c:2}, e:{r:9,c:5}},
    {s:{r:10,c:2},e:{r:10,c:5}},
    {s:{r:11,c:2},e:{r:11,c:5}},
    {s:{r:12,c:2},e:{r:12,c:5}},
    {s:{r:14,c:2},e:{r:14,c:5}},
    {s:{r:16,c:0},e:{r:16,c:5}},
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");

  /* ════════════════════════════════════════════════
     SHEET 2 — MONTHLY REPORT
  ════════════════════════════════════════════════ */
  const thead = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
  const tbody = [];

  table.querySelectorAll("tbody tr").forEach((tr, ri) => {
    const cells = [...tr.querySelectorAll("td")];
    const row = cells.map((td, ci) => {
      const txt = td.textContent.trim();
      if (ci === 0) return lbl(txt, ri%2===0 ? C.light : C.white, true);
      const n = parseFloat(txt.replace(/[^0-9.\-]/g,""));
      const isNet = ci === cells.length - 1;
      const fg = isNet ? (n>=0?C.green:C.red) : (ci===1?C.green:C.red);
      const bg = ri%2===0 ? C.light : C.white;
      return isNaN(n) ? lbl(txt,bg) : numCell(n, fg, bg, isNet);
    });
    tbody.push(row);
  });

  // Footer totals row
  table.querySelectorAll("tfoot tr").forEach(tr => {
    const cells = [...tr.querySelectorAll("td")];
    const row = cells.map((td, ci) => {
      const txt = td.textContent.trim();
      if (ci === 0) return sc(txt, {
        font:{bold:true,color:{rgb:C.white},sz:10,name:"Calibri"},
        fill:{patternType:"solid",fgColor:{rgb:C.navyDark}},
        alignment:{horizontal:"left"}
      });
      const n = parseFloat(txt.replace(/[^0-9.\-]/g,""));
      const isNet = ci === cells.length - 1;
      return {v:isNaN(n)?0:n, t:"n", z:'"₱"#,##0.00', s:{
        font:{bold:true, color:{rgb: isNet?(n>=0?C.green:"FBBF24"):C.white}, sz:10, name:"Calibri"},
        fill:{patternType:"solid", fgColor:{rgb:C.navyDark}},
        alignment:{horizontal:"right"}
      }};
    });
    tbody.push(row);
  });

  // Title rows above the table
  const monthlyTitle = [
    [ title(`MONTHLY FINANCIAL REPORT — ${period}`), ...Array(thead.length-1).fill("") ],
    [ subtitle(`Stellarsat Solutions Inc  ·  ${new Date().toLocaleDateString("en-PH",{dateStyle:"long"})}`),
      ...Array(thead.length-1).fill("") ],
    [],
    thead.map(h => hdr(h)),
    ...tbody,
    [],
    [ sc("All amounts in Philippine Peso (₱)", {
        font:{italic:true,color:{rgb:C.muted},sz:9,name:"Calibri"},
        alignment:{horizontal:"center"}
      }), ...Array(thead.length-1).fill("") ],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(monthlyTitle);
  ws2["!cols"] = [
    {wch:14}, // Month
    {wch:16}, // Total Income
    {wch:18}, // Company Exp
    {wch:18}, // Project Exp
    {wch:18}, // Total Exp
    {wch:16}, // Collections
    {wch:14}, // Net Income
  ];
  ws2["!rows"] = [{hpt:28},{hpt:18}];
  // Merge title rows
  const NC = thead.length - 1;
  ws2["!merges"] = [
    {s:{r:0,c:0},e:{r:0,c:NC}},
    {s:{r:1,c:0},e:{r:1,c:NC}},
    {s:{r:monthlyTitle.length-1,c:0},e:{r:monthlyTitle.length-1,c:NC}},
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Monthly Report");

  /* ════════════════════════════════════════════════
     SHEET 3 — INCOME vs EXPENSES BREAKDOWN
  ════════════════════════════════════════════════ */
  const breakdownRows = [
    [ title("INCOME vs EXPENSES BREAKDOWN"), "" ],
    [ subtitle(`Period: ${period}`), "" ],
    [],
    [ hdr("CATEGORY"), hdr("AMOUNT") ],
    [ lbl("INCOME", C.greenBg, true),  "" ],
    [ lbl("Total Income", C.light),    numCell(income, C.green, C.light) ],
    [],
    [ lbl("EXPENSES", C.redBg, true),  "" ],
    [ lbl("Company Expenses", C.white), numCell(comp,    C.red, C.white) ],
    [ lbl("Project Expenses", C.light), numCell(proj,    C.amber, C.light) ],
    [ lbl("Total Expenses",   C.white, true), numCell(totalEx, C.red, C.white, true) ],
    [],
    [ lbl("COLLECTIONS", C.purpleBg, true), "" ],
    [ lbl("Collections Received", C.light), numCell(colAmt, C.purple, C.light) ],
    [],
    [ lbl("NET RESULT", C.light, true),
      numCell(net, net>=0?C.green:C.red, C.light, true) ],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(breakdownRows);
  ws3["!cols"] = [{wch:28},{wch:22}];
  ws3["!merges"] = [
    {s:{r:0,c:0},e:{r:0,c:1}},
    {s:{r:1,c:0},e:{r:1,c:1}},
    {s:{r:4,c:0},e:{r:4,c:1}},
    {s:{r:7,c:0},e:{r:7,c:1}},
    {s:{r:12,c:0},e:{r:12,c:1}},
  ];
  XLSX.utils.book_append_sheet(wb, ws3, "Breakdown");

  XLSX.writeFile(wb, filename);
  showToast("Excel exported with full design!", "success");
}

/* ── Print / PDF ── */
function rpExportCSV() {
  const table = document.getElementById("rpTable");
  if (!table) { showToast("No data to export.", "error"); return; }

  const months = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
  const period = rpFilterMonth ? `${months[parseInt(rpFilterMonth)]}_${rpFilterYear}` : `Full_Year_${rpFilterYear}`;
  const rows = [...table.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("th,td")].map(cell => {
      const value = cell.textContent.trim().replace(/\s+/g, " ");
      return `"${value.replace(/"/g, '""')}"`;
    }).join(",")
  );

  const blob = new Blob(["\ufeff" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Financial_Report_${period}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("CSV exported successfully.", "success");
}

function rpPrint() {
  const months = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
  const period = rpFilterMonth ? `${months[parseInt(rpFilterMonth)]} ${rpFilterYear}` : `Full Year ${rpFilterYear}`;
  const table  = document.getElementById("rpTable");
  if (!table) { showToast("No data to print.", "error"); return; }

  const get = id => document.getElementById(id)?.textContent || "—";

  const win = window.open("","_blank");
  win.document.write(`<!DOCTYPE html><html><head>
  <title>Financial Report — ${period}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:"Inter","Segoe UI",Arial,sans-serif;}
    body{padding:36px;color:#111827;background:#fff;}
    .header{background:#fff;color:#111827;padding:0 0 18px;border-bottom:2px solid #dbe4ef;margin-bottom:22px;}
    .header h1{font-size:22px;font-weight:900;margin-bottom:6px;color:#10233f;}
    .header p{font-size:12.5px;color:#64748b;}
    .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:24px;}
    .kpi{border-radius:10px;padding:13px 14px;color:#111827!important;background:#fff!important;border:1px solid #d9e4f2;}
    .kpi-lbl{font-size:9.5px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;}
    .kpi-val{font-size:15px;font-weight:900;color:#111827!important;}
    table{width:100%;border-collapse:collapse;font-size:11.5px;background:#fff;border:1px solid #dbe4ef;}
    th{background:#eef4fb!important;color:#22324a!important;padding:9px 11px;text-align:right;font-size:9.5px;text-transform:uppercase;letter-spacing:.45px;border-bottom:1px solid #dbe4ef;}
    th:first-child{text-align:left;}
    td{padding:9px 11px;border-bottom:1px solid #e5edf6;text-align:right;color:#1f2937!important;background:transparent!important;}
    td:first-child{text-align:left;font-weight:700;color:#1e3a6e!important;}
    tr:nth-child(even){background:#f8fafc!important;}
    tfoot td{background:#f1f5f9!important;color:#111827!important;font-weight:900;padding:11px;}
    .footer{margin-top:20px;font-size:10.5px;color:#64748b;text-align:center;border-top:1px solid #e5edf6;padding-top:12px;}
    @media print{
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{padding:14mm;background:#fff!important;}
      .header,.kpi,tr{break-inside:avoid;}
      table{page-break-inside:auto;}
    }
  </style></head><body>
  <div class="header">
    <h1>Financial Report</h1>
    <p>Period: ${period} &nbsp;&bull;&nbsp; Generated: ${new Date().toLocaleDateString("en-PH",{dateStyle:"long"})}</p>
  </div>
  <div class="kpis">
    <div class="kpi" style="background:#1e3a6e;"><div class="kpi-lbl">Total Income</div><div class="kpi-val">${get('rpKpiIncome')}</div></div>
    <div class="kpi" style="background:#dc2626;"><div class="kpi-lbl">Company Exp.</div><div class="kpi-val">${get('rpKpiComp')}</div></div>
    <div class="kpi" style="background:#f59e0b;"><div class="kpi-lbl">Project Exp.</div><div class="kpi-val">${get('rpKpiProj')}</div></div>
    <div class="kpi" style="background:#7c3aed;"><div class="kpi-lbl">Collections</div><div class="kpi-val">${get('rpKpiCol')}</div></div>
    <div class="kpi" style="background:#16a34a;"><div class="kpi-lbl">Net Income</div><div class="kpi-val">${get('rpKpiNet')}</div></div>
  </div>
  ${table.outerHTML}
  <div class="footer">Stellar Sat Solutions Inc. &mdash; Confidential Financial Report</div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

/* ================= COLLECTIONS ================= */

let colDeleteId   = null;
let colFilterFrom = "";
let colFilterTo   = "";
let colFilterSt   = "";
let colExpandedRow = null;
let colActiveTab  = "overview";
let colBarChart   = null;
let colPieChart   = null;
let colRowsCache   = [];

function loadCollections() {
  colFilterFrom = ""; colFilterTo = ""; colFilterSt = "";
  colExpandedRow = null;
  colActiveTab   = "overview";
  if (colBarChart) { colBarChart.destroy(); colBarChart = null; }
  if (colPieChart) { colPieChart.destroy(); colPieChart = null; }

  getFinanceMainContent().innerHTML = `
  <div class="finance-page-shell finance-collections-page" style="background:#f0f4fa;min-height:100%;padding-bottom:40px;">

    <!-- Page Header -->
    ${financePageHeader({
      title: "Collections",
      subtitle: "Track client payments and outstanding balances",
      icon: "ri-hand-coin-line"
    })}

    <div class="collections-workspace">
    <!-- Tabs -->
    <div class="collections-tab-row" style="padding:0 32px 16px;">
      <div style="display:inline-flex;background:white;border-radius:12px;padding:5px;gap:3px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <button class="exp-tab active" id="colTabOv"   onclick="colSwitchTab('overview')">
          <i class="ri-bar-chart-line"></i> Overview
        </button>
        <button class="exp-tab"        id="colTabData" onclick="colSwitchTab('data')">
          <i class="ri-table-line"></i> Collections
        </button>
      </div>
    </div>

    <!-- ═══════════════ OVERVIEW PANEL ═══════════════ -->
    <div id="colPanelOv">

      <!-- Filter bar: Custom Date + Status Filter -->
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 32px 20px;flex-wrap:wrap;">

        <!-- Custom Date -->
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="colDateBtn"
            style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:9px;
                   border:1.5px solid #c8d8e8;background:white;color:#1e3a6e;font-size:13px;font-weight:700;
                   cursor:pointer;font-family:inherit;">
            <i class="ri-calendar-line"></i> Custom Date <i class="ri-arrow-down-s-line"></i>
          </button>
          <div id="colDateWrap" style="display:none;align-items:center;gap:6px;">
            <input type="date" id="colFltFrom"
              style="padding:7px 10px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;color:#374151;outline:none;background:white;">
            <span style="color:#6b7280;font-size:13px;">–</span>
            <input type="date" id="colFltTo"
              style="padding:7px 10px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;color:#374151;outline:none;background:white;">
            <button onclick="colApplyDateRange()"
              style="padding:7px 14px;background:#1e3a6e;color:white;border:none;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">Apply</button>
            <button onclick="colClearDateRange()"
              style="padding:7px 10px;background:white;color:#6b7280;border:1.5px solid #c8d8e8;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">✕</button>
          </div>
        </div>

        <!-- Status Filter -->
        <div style="position:relative;" id="colFltWrap">
          <button id="colFltBtn" class="collection-filter-btn">
            <i class="ri-equalizer-line"></i> Filter <i class="ri-arrow-down-s-line"></i>
          </button>
          <div id="colFltDd" class="collection-dropdown">
            <div class="col-flt-opt collection-dropdown-option active" onclick="colSetStatus('')">All Status</div>
            <div class="col-flt-opt collection-dropdown-option" onclick="colSetStatus('Approved')">Approved</div>
            <div class="col-flt-opt collection-dropdown-option" onclick="colSetStatus('Pending')">Pending</div>
            <div class="col-flt-opt collection-dropdown-option" onclick="colSetStatus('Decline')">Decline</div>
          </div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="exp-kpi-row" style="padding:0 32px;margin-bottom:24px;">
        <div class="exp-kpi-card exp-kpi-blue">
          <div class="exp-kpi-icon"><i class="ri-money-dollar-circle-line"></i></div>
          <div><div class="exp-kpi-val" id="colKpiDue">—</div><div class="exp-kpi-lbl">Total Due</div></div>
        </div>
        <div class="exp-kpi-card exp-kpi-teal">
          <div class="exp-kpi-icon"><i class="ri-hand-coin-line"></i></div>
          <div><div class="exp-kpi-val" id="colKpiCollected">—</div><div class="exp-kpi-lbl">Total Collected</div></div>
        </div>
        <div class="exp-kpi-card exp-kpi-cyan">
          <div class="exp-kpi-icon"><i class="ri-funds-line"></i></div>
          <div><div class="exp-kpi-val" id="colKpiBalance">—</div><div class="exp-kpi-lbl">Total Balance</div></div>
        </div>
        <div class="exp-kpi-card exp-kpi-indigo">
          <div class="exp-kpi-icon"><i class="ri-file-list-3-line"></i></div>
          <div><div class="exp-kpi-val" id="colKpiCount">—</div><div class="exp-kpi-lbl">Total Records</div></div>
        </div>
      </div>

      <!-- Charts -->
      <div class="exp-charts-row" style="padding:0 32px;">
        <div class="exp-chart-card">
          <div class="inc-chart-title">Due vs Collected per Project</div>
          <canvas id="colBarChartCanvas" height="220"></canvas>
        </div>
        <div class="exp-chart-card">
          <div class="inc-chart-title">Status Distribution</div>
          <canvas id="colPieChartCanvas" height="220"></canvas>
        </div>
      </div>

    </div><!-- /colPanelOv -->

    <!-- ═══════════════ COLLECTIONS DATA PANEL ═══════════════ -->
    <div id="colPanelData" style="display:none;" hidden>

      <!-- Controls: Search + Custom Date + Filter + Add -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 32px;flex-wrap:wrap;gap:10px;">

        <!-- Left: search -->
        <div class="search-box" style="max-width:320px;flex:1;">
          <i class="ri-search-line"></i>
          <input type="text" id="colSearch2" placeholder="Search client, project, OR…" style="width:100%;">
        </div>

        <!-- Right: date + filter + add -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">

          <!-- Custom Date -->
          <div style="display:flex;align-items:center;gap:6px;">
            <button id="colDateBtn2"
              style="display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:9px;
                     border:1.5px solid #c8d8e8;background:white;color:#1e3a6e;font-size:13px;font-weight:700;
                     cursor:pointer;font-family:inherit;">
              <i class="ri-calendar-line"></i> Custom Date
            </button>
            <div id="colDateWrap2" style="display:none;align-items:center;gap:6px;">
              <input type="date" id="colFltFrom2"
                style="padding:7px 10px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;color:#374151;outline:none;background:white;">
              <span style="color:#6b7280;font-size:13px;">–</span>
              <input type="date" id="colFltTo2"
                style="padding:7px 10px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;color:#374151;outline:none;background:white;">
              <button onclick="colApplyDateRange2()"
                style="padding:7px 14px;background:#1e3a6e;color:white;border:none;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">Apply</button>
              <button onclick="colClearDateRange2()"
                style="padding:7px 10px;background:white;color:#6b7280;border:1.5px solid #c8d8e8;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">✕</button>
            </div>
          </div>

          <!-- Status Filter -->
          <div style="position:relative;" id="colFltWrap2">
            <button id="colFltBtn2" class="collection-filter-btn">
              <i class="ri-equalizer-line"></i> Filter
            </button>
            <div id="colFltDd2" class="collection-dropdown">
              <div class="col-flt-opt2 collection-dropdown-option active" onclick="colSetStatus2('')">All Status</div>
              <div class="col-flt-opt2 collection-dropdown-option" onclick="colSetStatus2('Approved')">Approved</div>
              <div class="col-flt-opt2 collection-dropdown-option" onclick="colSetStatus2('Pending')">Pending</div>
              <div class="col-flt-opt2 collection-dropdown-option" onclick="colSetStatus2('Decline')">Decline</div>
            </div>
          </div>

          <!-- Add button -->
          <button id="btnAddCollection"
            style="display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:9px;border:none;
                   background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;font-size:13px;font-weight:700;
                   cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(30,58,110,.3);">
            <i class="ri-add-line"></i> Add
          </button>
        </div>
      </div>

      <!-- Table -->
      <div style="padding:0 32px;">
        <div class="finance-table-card" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
          <div id="colBanner"
            style="background:linear-gradient(135deg,#1a3460,#1e3a6e,#2a52a0);color:white;text-align:center;
                   font-size:15px;font-weight:700;padding:16px 24px;letter-spacing:.5px;">
            All Collections
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:linear-gradient(90deg,rgba(184,212,236,.6),rgba(184,212,236,.3));">
                  ${["","#","Date","Client","Project","OR Number","Amount Due","Collected","Balance","Status","Actions"]
                    .map(h=>`<th style="padding:13px 16px;text-align:center;font-size:12.5px;font-weight:700;color:#1e3a6e;white-space:nowrap;">${h}</th>`).join("")}
                </tr>
              </thead>
              <tbody id="colTableBody">
                <tr><td colspan="11" style="text-align:center;padding:40px;color:#9ca3af;">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div><!-- /colPanelData -->
    </div><!-- /collections-workspace -->

  </div>

  <style>
    .col-flt-opt,
    .col-flt-opt2 { padding:10px 16px;font-size:13px;color:#374151;cursor:pointer;transition:.15s; }
    .col-flt-opt:hover,
    .col-flt-opt2:hover { background:#f0f4ff; }
    .col-flt-opt.active,
    .col-flt-opt2.active { color:#1e3a6e;font-weight:700;background:#eef4ff; }
  </style>`;

  // ── Overview filter events ──
  document.getElementById("colDateBtn").addEventListener("click", e => {
    e.stopPropagation();
    const w = document.getElementById("colDateWrap");
    w.style.display = w.style.display === "flex" ? "none" : "flex";
  });
  document.getElementById("colFltBtn").addEventListener("click", e => {
    e.stopPropagation();
    const dd = document.getElementById("colFltDd");
    dd.style.display = dd.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", colCloseDropdowns);

  colLoadKpis();
  colRenderCharts();
}

/* ── Tab switch ── */
function colSwitchTab(tab) {
  colActiveTab = tab;
  const isOv = tab === "overview";
  const overviewPanel = document.getElementById("colPanelOv");
  const dataPanel = document.getElementById("colPanelData");
  document.getElementById("colTabOv")  .classList.toggle("active",  isOv);
  document.getElementById("colTabData").classList.toggle("active", !isOv);
  overviewPanel.hidden = !isOv;
  dataPanel.hidden = isOv;
  overviewPanel.style.display = isOv ? "grid" : "none";
  dataPanel.style.display = isOv ? "none" : "block";

  if (!isOv) {
    // Wire data tab events on first show
    const btn = document.getElementById("btnAddCollection");
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener("click", colOpenAdd);
    }
    const s2 = document.getElementById("colSearch2");
    if (s2 && !s2._wired) {
      s2._wired = true;
      s2.addEventListener("input", colRenderTable);
    }
    const db2 = document.getElementById("colDateBtn2");
    if (db2 && !db2._wired) {
      db2._wired = true;
      db2.addEventListener("click", e => {
        e.stopPropagation();
        const w = document.getElementById("colDateWrap2");
        w.style.display = w.style.display === "flex" ? "none" : "flex";
      });
    }
    const fb2 = document.getElementById("colFltBtn2");
    if (fb2 && !fb2._wired) {
      fb2._wired = true;
      fb2.addEventListener("click", e => {
        e.stopPropagation();
        const dd = document.getElementById("colFltDd2");
        dd.style.display = dd.style.display === "block" ? "none" : "block";
      });
    }
    colRenderTable();
  }
}

/* ── Overview filter state ── */
let colOvFrom = "", colOvTo = "", colOvSt = "";

function colSetStatus(s) {
  colOvSt = s;
  document.querySelectorAll(".col-flt-opt").forEach(el =>
    el.classList.toggle("active", el.textContent.trim() === (s || "All Status"))
  );
  const btn = document.getElementById("colFltBtn");
  if (btn) btn.innerHTML = `<i class="ri-equalizer-line"></i> ${s || "Filter"} <i class="ri-arrow-down-s-line"></i>`;
  document.getElementById("colFltDd").style.display = "none";
  colLoadKpis(); colRenderCharts();
}
function colApplyDateRange() {
  colOvFrom = document.getElementById("colFltFrom")?.value || "";
  colOvTo   = document.getElementById("colFltTo")?.value   || "";
  if (!colOvFrom && !colOvTo) { showToast("Select at least one date.", "error"); return; }
  document.getElementById("colDateWrap").style.display = "none";
  colLoadKpis(); colRenderCharts();
  showToast("Date range applied.", "info");
}
function colClearDateRange() {
  colOvFrom = colOvTo = "";
  const f = document.getElementById("colFltFrom"); if (f) f.value = "";
  const t = document.getElementById("colFltTo");   if (t) t.value = "";
  document.getElementById("colDateWrap").style.display = "none";
  colLoadKpis(); colRenderCharts();
}
function colOvParams() {
  const p = new URLSearchParams();
  if (colOvFrom) p.set("from", colOvFrom);
  if (colOvTo)   p.set("to",   colOvTo);
  if (colOvSt)   p.set("status", colOvSt);
  return p.toString();
}

/* ── Data tab filter state ── */
let colDataFrom = "", colDataTo = "", colDataSt = "";

function colSetStatus2(s) {
  colDataSt = s;
  document.querySelectorAll(".col-flt-opt2").forEach(el =>
    el.classList.toggle("active", el.textContent.trim() === (s || "All Status"))
  );
  const btn = document.getElementById("colFltBtn2");
  if (btn) btn.innerHTML = `<i class="ri-equalizer-line"></i> ${s || "Filter"}`;
  document.getElementById("colFltDd2").style.display = "none";
  // update banner
  const banner = document.getElementById("colBanner");
  if (banner) banner.textContent = s ? `Status: ${s}` : "All Collections";
  colRenderTable();
}
function colApplyDateRange2() {
  colDataFrom = document.getElementById("colFltFrom2")?.value || "";
  colDataTo   = document.getElementById("colFltTo2")?.value   || "";
  if (!colDataFrom && !colDataTo) { showToast("Select at least one date.", "error"); return; }
  // update banner
  const banner = document.getElementById("colBanner");
  if (banner) {
    const fmt = d => new Date(d).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
    banner.textContent = (colDataFrom && colDataTo)
      ? `${fmt(colDataFrom)} – ${fmt(colDataTo)}`
      : colDataFrom ? `From ${fmt(colDataFrom)}` : `Until ${fmt(colDataTo)}`;
  }
  document.getElementById("colDateWrap2").style.display = "none";
  colRenderTable();
  showToast("Date range applied.", "info");
}
function colClearDateRange2() {
  colDataFrom = colDataTo = "";
  const f = document.getElementById("colFltFrom2"); if (f) f.value = "";
  const t = document.getElementById("colFltTo2");   if (t) t.value = "";
  document.getElementById("colDateWrap2").style.display = "none";
  const banner = document.getElementById("colBanner");
  if (banner) banner.textContent = "All Collections";
  colRenderTable();
}

function colCloseDropdowns(e) {
  // Overview dropdowns
  const fw = document.getElementById("colFltWrap");
  if (fw && !fw.contains(e.target)) {
    const dd = document.getElementById("colFltDd");
    if (dd) dd.style.display = "none";
  }
  // Data tab dropdowns
  const fw2 = document.getElementById("colFltWrap2");
  if (fw2 && !fw2.contains(e.target)) {
    const dd2 = document.getElementById("colFltDd2");
    if (dd2) dd2.style.display = "none";
  }
  // Date range wrappers
  ["colDateWrap","colDateWrap2"].forEach(id => {
    const w = document.getElementById(id);
    const b = document.getElementById(id.replace("Wrap","Btn"));
    if (w && b && !b.contains(e.target) && !w.contains(e.target))
      w.style.display = "none";
  });
}

/* ── KPI loader (Overview) ── */
async function colLoadKpis() {
  try {
    const res = await financeStandaloneApi("GET", `/api/collections/kpis?${colOvParams()}`);
    document.getElementById("colKpiDue")      .textContent = formatCurrency(res.total_due       || 0);
    document.getElementById("colKpiCollected").textContent = formatCurrency(res.total_collected  || 0);
    document.getElementById("colKpiBalance")  .textContent = formatCurrency(res.total_balance    || 0);
    document.getElementById("colKpiCount")    .textContent = (res.total_records || 0) + " records";
  } catch {
    ["colKpiDue","colKpiCollected","colKpiBalance","colKpiCount"].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = "—";
    });
  }
}

/* ── Charts (Overview) ── */
async function colRenderCharts() {
  const barCanvas = document.getElementById("colBarChartCanvas");
  const pieCanvas = document.getElementById("colPieChartCanvas");
  if (!barCanvas || !pieCanvas) return;
  if (colBarChart) { colBarChart.destroy(); colBarChart = null; }
  if (colPieChart) { colPieChart.destroy(); colPieChart = null; }

  try {
    const data = await financeStandaloneApi("GET", `/api/collections/chart-data?${colOvParams()}`);

    // Bar chart: Due vs Collected per project
    colBarChart = new Chart(barCanvas, {
      type: "bar",
      data: {
        labels: data.projects.map(p => p.project || "General"),
        datasets: [
          { label: "Amount Due",       data: data.projects.map(p => Number(p.total_due)),       backgroundColor: "rgba(37, 99, 235, 0.72)",  borderRadius: 6 },
          { label: "Amount Collected", data: data.projects.map(p => Number(p.total_collected)), backgroundColor: "rgba(22, 163, 74, 0.72)",  borderRadius: 6 },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "#374151", font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: "#4b6a90" }, grid: { display: false } },
          y: { ticks: { color: "#4b6a90", callback: v => "₱" + v.toLocaleString() }, grid: { color: "#e5e7eb" } }
        }
      }
    });

    // Pie chart: Status distribution
    colPieChart = new Chart(pieCanvas, {
      type: "doughnut",
      data: {
        labels: ["Approved","Pending","Decline"],
        datasets: [{
          data: [data.status.Approved || 0, data.status.Pending || 0, data.status.Decline || 0],
          backgroundColor: [financeChartColors.collection, financeChartColors.project, financeChartColors.expense],
          borderWidth: 2, borderColor: financeChartColors.card
        }]
      },
      options: {
        responsive: true, cutout: "60%",
        plugins: {
          legend: { position: "right", labels: { color: "#374151", padding: 14, font: { size: 13 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} records` } }
        }
      }
    });
  } catch {
    // Fallback empty charts
    colBarChart = new Chart(barCanvas, { type:"bar",   data:{ labels:[], datasets:[] }, options:{} });
    colPieChart = new Chart(pieCanvas, { type:"doughnut", data:{ labels:[], datasets:[] }, options:{} });
  }
}

/* ── Table renderer (Data tab) ── */
async function colRenderTable() {
  const tbody = document.getElementById("colTableBody");
  if (!tbody) return;
  const q = document.getElementById("colSearch2")?.value || "";
  let url = `/api/collections?search=${encodeURIComponent(q)}`;
  if (colDataFrom) url += `&from=${colDataFrom}`;
  if (colDataTo)   url += `&to=${colDataTo}`;
  if (colDataSt)   url += `&status=${encodeURIComponent(colDataSt)}`;
  try {
    const rows = await financeStandaloneApi("GET", url);
    colRowsCache = rows;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:44px;color:#9ca3af;">
        <i class="ri-inbox-line" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4;"></i>No records found.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r, i) => {
      const sClass = r.status === "Approved" ? "completed"
                   : r.status === "Decline"  ? "overdue" : "progress";
      const bal       = Number(r.balance ?? (r.amount_due - r.amount_collected));
      const pct       = Math.min(100, Math.round((Number(r.amount_collected) / Math.max(Number(r.amount_due), 1)) * 100));
      const clientEsc = (r.client||"").replace(/'/g,"&apos;");
      const projEsc   = (r.project||"—").replace(/'/g,"&apos;");
      const orEsc     = (r.or_number||"").replace(/'/g,"&apos;");
      const isExp     = String(colExpandedRow) === String(r.id);
      const mainRow = `<tr id="colRow_${r.id}" style="border-bottom:1px solid #eef2f8;transition:background .15s;"
                  onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
        <td style="padding:14px 10px;text-align:center;width:36px;">
          <button onclick="colToggleHistory(${r.id})" title="Payment history"
            style="width:28px;height:28px;border-radius:50%;border:1.5px solid #c8d8e8;
                   background:${isExp?"#1e3a6e":"white"};cursor:pointer;display:flex;align-items:center;
                   justify-content:center;color:${isExp?"white":"#1e3a6e"};font-size:14px;transition:all .2s;">
            <i class="ri-arrow-${isExp?"up":"down"}-s-line"></i>
          </button>
        </td>
        <td style="padding:14px 16px;text-align:center;color:#64748b;font-size:13px;">${String(i+1).padStart(3,"0")}</td>
        <td style="padding:14px 16px;text-align:center;white-space:nowrap;">${formatDate(r.date)}</td>
        <td style="padding:14px 16px;text-align:center;font-weight:600;">${r.client}</td>
        <td style="padding:14px 16px;text-align:center;">
          ${r.project
            ? `<span style="background:#dbeafe;color:#1e40af;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${r.project}</span>`
            : '<span style="color:#9ca3af;">—</span>'}
        </td>
        <td style="padding:14px 16px;text-align:center;font-family:monospace;font-size:13px;color:#475569;">${r.or_number || '<span style="color:#9ca3af;">—</span>'}</td>
        <td style="padding:14px 16px;text-align:center;font-weight:700;color:#1e3a6e;">₱${Number(r.amount_due).toLocaleString("en-PH",{minimumFractionDigits:0})}</td>
        <td style="padding:14px 16px;text-align:center;font-weight:700;color:#16a34a;" id="colCol_${r.id}">₱${Number(r.amount_collected).toLocaleString("en-PH",{minimumFractionDigits:0})}</td>
        <td style="padding:14px 16px;text-align:center;" id="colBal_${r.id}">
          <div style="font-weight:700;color:${bal>0?"#dc2626":"#16a34a"};font-size:13px;">₱${bal.toLocaleString("en-PH",{minimumFractionDigits:0})}</div>
          <div style="background:#e5e7eb;border-radius:99px;height:5px;width:72px;margin:4px auto 2px;overflow:hidden;">
            <div style="height:100%;border-radius:99px;background:${bal<=0?"#16a34a":"#2d5fa8"};width:${pct}%;"></div>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:1px;">${pct}% collected</div>
        </td>
        <td style="padding:14px 16px;text-align:center;"><span class="badge ${sClass}">${r.status||"Pending"}</span></td>
        <td style="padding:14px 16px;text-align:center;">
          <div style="display:flex;gap:6px;justify-content:center;">
            <button onclick="colOpenEdit(${r.id})"
              style="width:32px;height:32px;border-radius:50%;border:none;background:#e8f4fd;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e3a6e;font-size:14px;" title="Edit">
              <i class="ri-pencil-line"></i>
            </button>
            <button onclick="colOpenDelete(${r.id},'${clientEsc}',${r.amount_due})"
              style="width:32px;height:32px;border-radius:50%;border:none;background:#fee2e2;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:14px;" title="Delete">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </td>
      </tr>`;
      const payRow = isExp
        ? `<tr id="colPayRow_${r.id}"><td colspan="11" style="padding:0;background:#f8fafc;border-left:4px solid #1e3a6e;border-bottom:2px solid #dbeafe;">
            <div style="padding:14px 28px 18px;" id="colPayContent_${r.id}">
              <p style="color:#9ca3af;font-size:13px;">Loading...</p>
            </div></td></tr>`
        : "";
      return mainRow + payRow;
    }).join("");
    if (colExpandedRow) colLoadPayments(colExpandedRow);
  } catch (err) {
    colRowsCache = [];
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:#dc2626;">Error loading records: ${err.message}</td></tr>`;
  }
}

function colOpenAdd() {
  document.getElementById("colModalTitle").textContent = "Add Collection";
  document.getElementById("colEditId").value     = "";
  document.getElementById("colFDate").value      = new Date().toISOString().split("T")[0];
  document.getElementById("colFClient").value    = "";
  document.getElementById("colFProject").value   = "";
  document.getElementById("colFOR").value        = "";
  document.getElementById("colFDue").value       = "";
  document.getElementById("colFStatus").value    = "Pending";
  document.getElementById("colModal").style.display = "flex";
}
function colOpenEdit(id) {
  const record = colRowsCache.find(row => String(row.id) === String(id));
  if (!record) {
    showToast("Unable to load the selected collection. Please refresh and try again.", "error");
    return;
  }
  const date = String(record.date || "").slice(0, 10);
  const project = record.project || record.project_name || "";
  document.getElementById("colModalTitle").textContent = "Edit Collection";
  document.getElementById("colEditId").value     = id;
  document.getElementById("colFDate").value      = date;
  document.getElementById("colFClient").value    = record.client || record.client_name || "";
  document.getElementById("colFProject").value   = project === "—" ? "" : project;
  document.getElementById("colFOR").value        = record.or_number || "";
  document.getElementById("colFDue").value       = record.amount_due ?? "";
  document.getElementById("colFStatus").value    = record.status || "Pending";
  document.getElementById("colModal").style.display = "flex";
}
function colCloseModal() { document.getElementById("colModal").style.display = "none"; }
async function colSave() {
  const date      = document.getElementById("colFDate").value;
  const client    = document.getElementById("colFClient").value.trim();
  const project   = document.getElementById("colFProject").value.trim() || null;
  const or_number = document.getElementById("colFOR").value.trim() || null;
  const due       = parseFloat(document.getElementById("colFDue").value);
  const status    = document.getElementById("colFStatus").value;
  const editId    = document.getElementById("colEditId").value;
  if (!date || !client || isNaN(due) || due <= 0) {
    showToast("Please fill in Date, Client, and Amount Due.", "error"); return;
  }
  try {
    if (editId) {
      await financeStandaloneApi("PUT", `/api/collections/${editId}`, { date, client, project, or_number, due, status });
      showToast("Collection updated.", "success");
    } else {
      await financeStandaloneApi("POST", `/api/collections`, { date, client, project, or_number, due, collected: 0, status });
      showToast("Collection added.", "success");
    }
    colCloseModal();
    await colRenderTable();
    colLoadKpis();
    colRenderCharts();
  } catch (err) { showToast("Save failed: " + err.message, "error"); }
}
function colOpenDelete(id, client, due) {
  colDeleteId = id;
  document.getElementById("colDeletePreview").textContent = `${client}  |  Due: ${formatCurrency(due)}`;
  document.getElementById("colDeleteModal").style.display = "flex";
}
function colCloseDelete() { document.getElementById("colDeleteModal").style.display = "none"; colDeleteId = null; }
async function colConfirmDelete() {
  try {
    await financeStandaloneApi("DELETE", `/api/collections/${colDeleteId}`);
    colCloseDelete(); colRenderTable(); colLoadKpis(); colRenderCharts();
    showToast("Collection deleted.", "info");
  } catch (err) { showToast("Delete failed: " + err.message, "error"); }
}

function colToggleHistory(id) {
  colExpandedRow = String(colExpandedRow) === String(id) ? null : id;
  colRenderTable();
}

async function colLoadPayments(collectionId) {
  const container = document.getElementById(`colPayContent_${collectionId}`);
  if (!container) return;
  try {
    const payments = await financeStandaloneApi("GET", `/api/collections/${collectionId}/payments`);
    const tableHtml = payments.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
        <thead>
          <tr style="background:rgba(30,58,110,.08);">
            <th style="padding:9px 14px;text-align:center;font-weight:700;color:#1e3a6e;">#</th>
            <th style="padding:9px 14px;text-align:center;font-weight:700;color:#1e3a6e;">Date</th>
            <th style="padding:9px 14px;text-align:center;font-weight:700;color:#1e3a6e;">Amount Paid</th>
            <th style="padding:9px 14px;text-align:center;font-weight:700;color:#1e3a6e;">Status</th>
            <th style="padding:9px 14px;text-align:center;font-weight:700;color:#1e3a6e;"></th>
          </tr>
        </thead>
        <tbody>
          ${payments.map((p, i) => {
            const pbg = p.status==="Paid" ? "#dcfce7" : p.status==="Pending" ? "#fef3c7" : "#dbeafe";
            const pfg = p.status==="Paid" ? "#15803d" : p.status==="Pending" ? "#92400e" : "#1e40af";
            return `<tr style="border-bottom:1px solid #eef2f8;">
              <td style="padding:9px 14px;text-align:center;color:#6b7280;">${i+1}</td>
              <td style="padding:9px 14px;text-align:center;">${formatDate(p.date)}</td>
              <td style="padding:9px 14px;text-align:center;font-weight:700;color:#1e3a6e;">
                ₱${Number(p.amount_paid).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
              <td style="padding:9px 14px;text-align:center;">
                <span style="background:${pbg};color:${pfg};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">${p.status}</span></td>
              <td style="padding:9px 14px;text-align:center;">
                <button onclick="colDeletePayment(${p.id},${collectionId})"
                  style="width:28px;height:28px;border-radius:6px;border:none;background:#fee2e2;cursor:pointer;
                         color:#dc2626;font-size:13px;display:inline-flex;align-items:center;justify-content:center;" title="Delete">
                  <i class="ri-delete-bin-line"></i></button></td>
            </tr>`; }).join("")}
        </tbody>
      </table>` :
      `<p style="font-size:13px;color:#94a3b8;margin:0 0 14px;">No payment records yet.</p>`;

    container.innerHTML = `
      <div style="margin-bottom:18px;">
        <p style="font-size:12px;font-weight:700;color:#1e3a6e;text-transform:uppercase;letter-spacing:.6px;margin:0 0 12px;">
          <i class="ri-add-circle-line"></i> Add Payment
        </p>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11.5px;font-weight:600;color:#374151;">Amount Paid (₱)</label>
            <input type="number" id="colPayAmt_${collectionId}" placeholder="e.g. 1000" min="0.01" step="0.01"
              style="padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;width:140px;outline:none;font-family:inherit;">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11.5px;font-weight:600;color:#374151;">Date</label>
            <input type="date" id="colPayDate_${collectionId}" value="${new Date().toISOString().slice(0,10)}"
              style="padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;font-family:inherit;">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11.5px;font-weight:600;color:#374151;">Status</label>
            <select id="colPayStatus_${collectionId}"
              style="padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;background:white;font-family:inherit;">
              <option value="Paid">Paid</option>
              <option value="Pending" selected>Pending</option>
            </select>
          </div>
          <button onclick="colAddPayment(${collectionId})"
            style="display:inline-flex;align-items:center;gap:5px;padding:9px 18px;
                   background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;border:none;
                   border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">
            <i class="ri-save-line"></i> Save
          </button>
        </div>
      </div>
      <p style="font-size:12px;font-weight:700;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;">
        <i class="ri-history-line"></i> Payment History
      </p>
      ${tableHtml}`;
  } catch (err) {
    container.innerHTML = `<p style="color:#dc2626;font-size:13px;">Failed: ${err.message}</p>`;
  }
}

async function colAddPayment(collectionId) {
  const amount_paid = parseFloat(document.getElementById(`colPayAmt_${collectionId}`)?.value);
  const date        = document.getElementById(`colPayDate_${collectionId}`)?.value;
  const status      = document.getElementById(`colPayStatus_${collectionId}`)?.value || "Pending";
  if (isNaN(amount_paid) || amount_paid <= 0) { showToast("Enter a valid amount.", "error"); return; }
  if (!date) { showToast("Select a date.", "error"); return; }
  try {
    const res = await financeStandaloneApi("POST", `/api/collections/${collectionId}/payments`, { amount_paid, date, status });
    const col = res.collection;
    if (col) {
      const colEl = document.getElementById(`colCol_${collectionId}`);
      const balEl = document.getElementById(`colBal_${collectionId}`);
      if (colEl) colEl.textContent = `₱${Number(col.amount_collected).toLocaleString("en-PH",{minimumFractionDigits:0})}`;
      if (balEl) {
        const bal = Number(col.balance ?? (col.amount_due - col.amount_collected));
        balEl.querySelector("div").textContent = `₱${bal.toLocaleString("en-PH",{minimumFractionDigits:0})}`;
        balEl.querySelector("div").style.color = bal > 0 ? "#dc2626" : "#16a34a";
      }
    }
    showToast("Payment added.", "success");
    await colLoadPayments(collectionId);
    colLoadKpis(); colRenderCharts();
  } catch (err) { showToast("Failed: " + err.message, "error"); }
}

async function colDeletePayment(paymentId, collectionId) {
  if (!confirm("Delete this payment? The collected amount will be restored.")) return;
  try {
    const res = await financeStandaloneApi("DELETE", `/api/collections/payments/${paymentId}`);
    const col = res.collection;
    if (col) {
      const colEl = document.getElementById(`colCol_${collectionId}`);
      if (colEl) colEl.textContent = `₱${Number(col.amount_collected).toLocaleString("en-PH",{minimumFractionDigits:0})}`;
    }
    showToast("Payment deleted.", "info");
    await colLoadPayments(collectionId);
    colLoadKpis(); colRenderCharts();
  } catch (err) { showToast("Failed: " + err.message, "error"); }
}



/* ================= EMPLOYEE ================= */

let empActiveTab     = "reimburse";
let empSalEditId     = null;
let empSalDeleteId   = null;
let empEmpEditId     = null;
let empEmpDeleteId   = null;
let empEmpFilterPer  = "";
let empEmpFilterEnd  = "";
let empActionType    = "";
let empActionId      = null;

// Per-tab filter state
let empRmbFilterStatus = "";
let empBdgFilterStatus = "";
let empSalFilterStatus = "";
let empIncFilterStatus = "";

function loadEmployee() {
  empActiveTab = "reimburse";
  empRmbFilterStatus = empBdgFilterStatus = empSalFilterStatus = empIncFilterStatus = "";

  getFinanceMainContent().innerHTML = `
  <div class="finance-page-shell finance-employee-page" style="background:#f0f4fa;min-height:100%;">

    <!-- Header -->
    <div class="finance-page-header" style="background:linear-gradient(135deg,#0f2147 0%,#1e3a6e 55%,#2a52a0 100%);
                padding:28px 32px;position:relative;">
      <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.04);pointer-events:none;"></div>
      <div style="position:absolute;bottom:-50px;right:140px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.03);pointer-events:none;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;position:relative;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:46px;height:46px;background:rgba(255,255,255,.13);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;color:white;">
            <i class="ri-team-line"></i>
          </div>
          <div>
            <h2 style="font-size:22px;font-weight:800;color:white;margin:0;letter-spacing:-.3px;">Employee</h2>
            <p style="color:rgba(255,255,255,.65);font-size:12.5px;margin:3px 0 0;">Review employee requests, salary advances, salary increases and payroll</p>
          </div>
        </div>
        <div class="search-box" style="max-width:300px;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.2);">
          <i class="ri-search-line" style="color:rgba(255,255,255,.7);"></i>
          <input type="text" id="empSearch" placeholder="Search here" style="color:white;width:100%;">
        </div>
      </div>
    </div>

    <!-- Tabs row — tabs left, filters + Add button right -->
    <div class="page-tab-row" id="empActionRow">
      <div class="page-tabs">
        <button class="exp-tab active" id="empTabRmb" onclick="empSwitchTab('reimburse')">Reimbursements</button>
        <button class="exp-tab"        id="empTabBdg" onclick="empSwitchTab('budget')">Budget Requests</button>
        <button class="exp-tab"        id="empTabSal" onclick="empSwitchTab('salary')">Salary Advances</button>
        <button class="exp-tab"        id="empTabInc" onclick="empSwitchTab('salary-increase')">Salary Increase</button>
        <button class="exp-tab"        id="empTabEmp" onclick="empSwitchTab('employee-salary')">Employee Salary</button>
      </div>
      <div class="page-tab-controls">
        <div id="empActionLeft" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"></div>
        <button id="empAddBtn" onclick="empOpenAdd()"
          style="display:none;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;border:none;
                 background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;font-size:13px;font-weight:700;
                 font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(30,58,110,.35);">
          <i class="ri-add-line"></i> Add
        </button>
      </div>
    </div>

    <!-- Table card -->
    <div style="padding:0 32px 32px;">
      <div class="finance-table-card emp-request-card">
        <div class="emp-request-card-head">
          <div class="emp-request-title-block">
            <div class="emp-request-eyebrow">Finance Requests</div>
            <h3 id="empBanner">Reimbursements</h3>
            <p id="empBannerSub">Review and manage employee reimbursement requests.</p>
          </div>
          <div class="emp-request-stats" id="empRequestStats">
            <div class="emp-request-stat">
              <span>Total Requests</span>
              <strong id="empTotalCount">0</strong>
            </div>
            <div class="emp-request-stat pending">
              <span>Pending</span>
              <strong id="empPendingCount">0</strong>
            </div>
            <div class="emp-request-stat approved">
              <span>Approved</span>
              <strong id="empApprovedCount">0</strong>
            </div>
            <div class="emp-request-stat rejected">
              <span>Rejected</span>
              <strong id="empRejectedCount">0</strong>
            </div>
          </div>
        </div>
        <div class="emp-request-table-wrap">
          <table class="emp-request-table">
            <thead>
              <tr id="empThead"></tr>
            </thead>
            <tbody id="empTbody"></tbody>
          </table>
        </div>
      </div>
    </div>

  </div>`;

  document.getElementById("empSearch").addEventListener("input", empRefresh);
  empSwitchTab("reimburse");
}

/* ── Tab switch ── */
function empSwitchTab(tab) {
  empActiveTab = tab;
  ["Rmb","Bdg","Sal","Inc","Emp"].forEach(t => {
    const b = document.getElementById("empTab"+t); if (b) b.classList.remove("active");
  });
  const map = { reimburse:"Rmb", budget:"Bdg", salary:"Sal", "salary-increase":"Inc", "employee-salary":"Emp" };
  const ab = document.getElementById("empTab"+(map[tab]||"")); if (ab) ab.classList.add("active");

  const banners = { reimburse:"Reimbursements", budget:"Budget Requests",
                    salary:"Salary Advances", "salary-increase":"Salary Increase Requests", "employee-salary":"Employee Salary" };
  const subtitles = {
    reimburse: "Review and manage employee reimbursement requests.",
    budget: "Review and manage employee budget requests.",
    salary: "Review and manage employee salary advance requests.",
    "salary-increase": "Review and manage employee salary increase requests.",
    "employee-salary": "Manage employee salary records and payroll periods.",
  };
  const bn = document.getElementById("empBanner"); if (bn) bn.textContent = banners[tab]||"";
  const sub = document.getElementById("empBannerSub"); if (sub) sub.textContent = subtitles[tab] || "";
  const stats = document.getElementById("empRequestStats");
  if (stats) stats.style.display = tab === "employee-salary" ? "none" : "grid";

  const heads = {
    reimburse:         ["Employee Name","Request Type","Amount","Purpose / Reason","Date Requested","Status","Actions"],
    budget:            ["Employee Name","Request Type","Amount","Purpose / Reason","Date Requested","Status","Actions"],
    salary:            ["Employee Name","Request Type","Amount","Purpose / Reason","Date Requested","Status","Actions"],
    "salary-increase": ["Employee Name","Request Type","Amount","Purpose / Reason","Date Requested","Status","Actions"],
    "employee-salary": ["Employee Name","Position","Department","Current Salary","Period","Payroll Date","Actions"],
  };
  const tr = document.getElementById("empThead");
  if (tr) tr.innerHTML = (heads[tab]||[]).map(h =>
    `<th>${h}</th>`
  ).join("");

  // Filters + Add button visibility
  const al = document.getElementById("empActionLeft");
  const addBtn = document.getElementById("empAddBtn");

  if (al) {
    if (tab === "reimburse") {
      al.innerHTML = empStatusFilterHTML("empRmbStatus", empRmbFilterStatus, "empApplyRmbFilter", "empClearRmbFilter");
    } else if (tab === "budget") {
      al.innerHTML = empStatusFilterHTML("empBdgStatus", empBdgFilterStatus, "empApplyBdgFilter", "empClearBdgFilter");
    } else if (tab === "salary") {
      al.innerHTML = empStatusFilterHTML("empSalStatus", empSalFilterStatus, "empApplySalFilter", "empClearSalFilter");
    } else if (tab === "salary-increase") {
      al.innerHTML = empStatusFilterHTML("empIncStatus", empIncFilterStatus, "empApplyIncFilter", "empClearIncFilter");
    } else if (tab === "employee-salary") {
      al.innerHTML = `
        <input type="date" id="empEmpFrom"
          style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;">
        <span style="color:#9ca3af;font-size:13px;">to</span>
        <input type="date" id="empEmpTo"
          style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;">
        <button onclick="empEmpApplyFilter()" style="padding:8px 16px;background:#1e3a6e;color:white;border:none;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
          <i class="ri-filter-line"></i> Filter
        </button>
        <button onclick="empEmpClearFilter()" style="padding:8px 14px;background:white;color:#6b7280;border:1.5px solid #c8d8e8;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
          Clear
        </button>`;
    } else {
      al.innerHTML = "";
    }
  }

  // Show Add button only for salary/employee-salary tabs
  if (addBtn) addBtn.style.display = (tab === 'employee-salary') ? 'inline-flex' : 'none';
  // Show action row for all tabs (has filters)
  const ar2 = document.getElementById('empActionRow');
  if (ar2) ar2.style.display = 'flex';

  empRefresh();
}

function empStatusFilterHTML(selectId, currentVal, applyFn, clearFn) {
  return `
    <select id="${selectId}" onchange="${applyFn}()"
      style="padding:8px 12px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;background:white;color:#374151;cursor:pointer;">
      <option value="" ${!currentVal?"selected":""}>All Status</option>
      <option value="Pending"  ${currentVal==="Pending" ?"selected":""}>Pending</option>
      <option value="Approved" ${currentVal==="Approved"?"selected":""}>Approved</option>
      <option value="Rejected" ${currentVal==="Rejected"?"selected":""}>Rejected</option>
      <option value="Cancelled" ${currentVal==="Cancelled"?"selected":""}>Cancelled</option>
    </select>`;
}

// Filter — Reimburse
function empApplyRmbFilter() {
  empRmbFilterStatus = document.getElementById("empRmbStatus")?.value || "";
  empRefresh();
}
function empClearRmbFilter() {
  empRmbFilterStatus = "";
  const el = document.getElementById("empRmbStatus"); if (el) el.value = "";
  empRefresh();
}
// Filter — Budget
function empApplyBdgFilter() {
  empBdgFilterStatus = document.getElementById("empBdgStatus")?.value || "";
  empRefresh();
}
function empClearBdgFilter() {
  empBdgFilterStatus = "";
  const el = document.getElementById("empBdgStatus"); if (el) el.value = "";
  empRefresh();
}
// Filter — Salary
function empApplySalFilter() {
  empSalFilterStatus = document.getElementById("empSalStatus")?.value || "";
  empRefresh();
}
function empClearSalFilter() {
  empSalFilterStatus = "";
  const el = document.getElementById("empSalStatus"); if (el) el.value = "";
  empRefresh();
}
// Filter - Salary Increase
function empApplyIncFilter() {
  empIncFilterStatus = document.getElementById("empIncStatus")?.value || "";
  empRefresh();
}
function empClearIncFilter() {
  empIncFilterStatus = "";
  const el = document.getElementById("empIncStatus"); if (el) el.value = "";
  empRefresh();
}
// Filter — Employee Salary
function empEmpApplyFilter() {
  empEmpFilterPer = document.getElementById("empEmpFrom")?.value || "";
  empEmpFilterEnd = document.getElementById("empEmpTo")?.value   || "";
  empRefresh(); showToast("Filter applied.", "info");
}
function empEmpClearFilter() {
  empEmpFilterPer = empEmpFilterEnd = "";
  const f = document.getElementById("empEmpFrom"); if (f) f.value = "";
  const t = document.getElementById("empEmpTo");   if (t) t.value = "";
  empRefresh(); showToast("Filter cleared.", "info");
}

/* ── empOpenAdd dispatches to correct modal ── */
function empOpenAdd() {
  if      (empActiveTab === "reimburse")       empOpenAddRmb();
  else if (empActiveTab === "budget")          empOpenAddBdg();
  else if (empActiveTab === "salary")          empOpenAddSal();
  else if (empActiveTab === "employee-salary") empEmpOpenAdd();
}

/* ── Render table ── */
async function empRefresh() {
  const tbody = document.getElementById("empTbody"); if (!tbody) return;
  const q = (document.getElementById("empSearch")?.value||"").trim();
  tbody.innerHTML = empLoadingRow();

  try {
    if (empActiveTab === "reimburse") {
      let url = `/api/employee/reimburse?search=${encodeURIComponent(q)}`;
      if (empRmbFilterStatus) url += `&status=${encodeURIComponent(empRmbFilterStatus)}`;
      const rows = await financeStandaloneApi("GET", url);
      empUpdateRequestSummary(rows);
      if (!rows.length) { tbody.innerHTML = empNoData(7); return; }
      tbody.innerHTML = empRenderRequestRows(rows, "reimburse");
      return;
      if (!rows.length) { tbody.innerHTML = empNoData(8); return; }
      tbody.innerHTML = rows.map(r => {
        const statusCls = r.status==="Done"||r.status==="Approved" ? "completed"
                        : r.status==="Decline" ? "overdue" : "progress";
        const nameEsc = (r.name||r.employee_name||"").replace(/'/g,"&apos;");
        const cmtEsc  = (r.comments||"").replace(/'/g,"&apos;");
        return `<tr style="border-bottom:1px solid #eef2f8;transition:background .15s;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
          <td style="padding:16px 20px;text-align:center;font-weight:600;">${r.name||r.employee_name||"—"}</td>
          <td style="padding:16px 20px;text-align:center;"><span style="background:#e8f0fe;color:#1e3a6e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${r.roles||r.role||"—"}</span></td>
          <td style="padding:16px 20px;text-align:center;">${empFmtDate(r.date)}</td>
          <td style="padding:16px 20px;text-align:center;">${r.description||"—"}</td>
          <td style="padding:16px 20px;text-align:center;font-weight:700;">&#8369;${Number(r.amount).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
          <td style="padding:16px 20px;text-align:center;">
            <span class="badge ${statusCls}">${r.status||"Pending"}</span>
          </td>
          <td style="padding:16px 20px;text-align:center;color:#374151;font-size:13px;max-width:180px;word-break:break-word;">
            ${r.comments ? `<span>${r.comments}</span>` : '<span style="color:#9ca3af;">—</span>'}
          </td>
          <td style="padding:16px 20px;text-align:center;">
            <button onclick="empOpenAction('reimburse','${r.id}','${nameEsc}','${cmtEsc}')"
              style="display:inline-flex;align-items:center;gap:5px;padding:7px 16px;background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;border:none;border-radius:20px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
              <i class="ri-check-line"></i> Action
            </button>
          </td>
        </tr>`;
      }).join("");

    } else if (empActiveTab === "budget") {
      let url = `/api/employee/budget?search=${encodeURIComponent(q)}`;
      if (empBdgFilterStatus) url += `&status=${encodeURIComponent(empBdgFilterStatus)}`;
      const rows = await financeStandaloneApi("GET", url);
      empUpdateRequestSummary(rows);
      if (!rows.length) { tbody.innerHTML = empNoData(7); return; }
      tbody.innerHTML = empRenderRequestRows(rows, "budget");
      return;
      if (!rows.length) { tbody.innerHTML = empNoData(8); return; }
      tbody.innerHTML = rows.map(r => {
        const statusCls = r.status==="Done"||r.status==="Approved" ? "completed"
                        : r.status==="Decline" ? "overdue" : "progress";
        const nameEsc = (r.name||r.employee_name||"").replace(/'/g,"&apos;");
        const cmtEsc  = (r.comments||"").replace(/'/g,"&apos;");
        return `<tr style="border-bottom:1px solid #eef2f8;transition:background .15s;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
          <td style="padding:16px 20px;text-align:center;font-weight:600;">${r.name||r.employee_name||"—"}</td>
          <td style="padding:16px 20px;text-align:center;"><span style="background:#e8f0fe;color:#1e3a6e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${r.roles||r.role||"—"}</span></td>
          <td style="padding:16px 20px;text-align:center;">${empFmtDate(r.date)}</td>
          <td style="padding:16px 20px;text-align:center;">${r.description||"—"}</td>
          <td style="padding:16px 20px;text-align:center;font-weight:700;">&#8369;${Number(r.amount).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
          <td style="padding:16px 20px;text-align:center;">
            <span class="badge ${statusCls}">${r.status||"Pending"}</span>
          </td>
          <td style="padding:16px 20px;text-align:center;color:#374151;font-size:13px;max-width:180px;word-break:break-word;">
            ${r.comments ? `<span>${r.comments}</span>` : '<span style="color:#9ca3af;">—</span>'}
          </td>
          <td style="padding:16px 20px;text-align:center;">
            <button onclick="empOpenAction('budget','${r.id}','${nameEsc}','${cmtEsc}')"
              style="display:inline-flex;align-items:center;gap:5px;padding:7px 16px;background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;border:none;border-radius:20px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
              <i class="ri-check-line"></i> Action
            </button>
          </td>
        </tr>`;
      }).join("");

    } else if (empActiveTab === "salary") {
      let url = `/api/employee/salary-advances?search=${encodeURIComponent(q)}`;
      if (empSalFilterStatus) url += `&status=${encodeURIComponent(empSalFilterStatus)}`;
      const rows = await financeStandaloneApi("GET", url);
      empUpdateRequestSummary(rows);
      if (!rows.length) { tbody.innerHTML = empNoData(7); return; }
      tbody.innerHTML = empRenderRequestRows(rows, "salary");
      return;
      if (!rows.length) { tbody.innerHTML = empNoData(6); return; }
      // Clear any expanded state on refresh
      salExpandedRows.clear();
      tbody.innerHTML = rows.map(r => {
        const statusCls = r.status==="Approved" ? "completed"
                        : r.status==="Decline"  ? "overdue" : "progress";
        const nameEsc = (r.name||r.employee_name||"").replace(/'/g,"&apos;");
        const remEsc  = (r.remarks||"").replace(/'/g,"&apos;");
        return `<tr id="salRow_${r.id}" style="border-bottom:1px solid #eef2f8;transition:background .15s;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
          <td style="padding:16px 20px;text-align:center;font-weight:600;">${r.name||r.employee_name||"—"}</td>
          <td style="padding:16px 20px;text-align:center;font-weight:700;">&#8369;${Number(r.amount_borrowed||0).toLocaleString("en-PH",{minimumFractionDigits:0})}</td>
          <td style="padding:16px 20px;text-align:center;font-weight:700;">&#8369;${Number(r.remaining_balance||0).toLocaleString("en-PH",{minimumFractionDigits:0})}</td>
          <td style="padding:16px 20px;text-align:center;">${empFmtDate(r.date_borrowed)}</td>
          <td style="padding:16px 20px;text-align:center;">
            <span class="badge ${statusCls}">${r.status}</span>
          </td>
          <td style="padding:16px 20px;text-align:center;">
            <div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
              <button onclick="salTogglePayments('${r.id}', this)"
                style="display:inline-flex;align-items:center;gap:4px;padding:6px 11px;background:#eef6ff;color:#1e3a6e;border:1.5px solid #c8d8e8;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;" title="Show payment history">
                <i class="ri-history-line"></i> History <i class="ri-arrow-down-s-line"></i>
              </button>
              <button onclick="empOpenAction('salary','${r.id}','${nameEsc}','${remEsc}')"
                style="display:inline-flex;align-items:center;gap:4px;padding:6px 11px;background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">
                <i class="ri-check-line"></i> Action
              </button>
            </div>
          </td>
        </tr>`;
      }).join("");

    } else if (empActiveTab === "salary-increase") {
      let url = `/api/employee/salary-increase-requests?search=${encodeURIComponent(q)}`;
      if (empIncFilterStatus) url += `&status=${encodeURIComponent(empIncFilterStatus)}`;
      const rows = await financeStandaloneApi("GET", url);
      empUpdateRequestSummary(rows);
      if (!rows.length) { tbody.innerHTML = empNoData(7); return; }
      tbody.innerHTML = empRenderRequestRows(rows, "salary-increase");
      return;
      if (!rows.length) { tbody.innerHTML = empNoData(7); return; }
      tbody.innerHTML = rows.map(r => {
        const statusCls = r.status==="Approved" ? "completed"
                        : r.status==="Rejected"||r.status==="Decline" ? "overdue" : "progress";
        const nameEsc = (r.employee_name||"").replace(/'/g,"&apos;");
        const remEsc  = (r.remarks||"").replace(/'/g,"&apos;");
        return `<tr style="border-bottom:1px solid #eef2f8;transition:background .15s;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
          <td style="padding:16px 20px;text-align:center;font-weight:600;">${r.employee_name||"&mdash;"}</td>
          <td style="padding:16px 20px;text-align:center;font-weight:700;">${r.current_salary == null ? "&mdash;" : "&#8369;" + Number(r.current_salary).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
          <td style="padding:16px 20px;text-align:center;font-weight:800;color:#1e3a6e;">&#8369;${Number(r.requested_salary||0).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
          <td style="padding:16px 20px;text-align:center;max-width:260px;word-break:break-word;">${r.justification||"&mdash;"}</td>
          <td style="padding:16px 20px;text-align:center;">${empFmtDate(r.request_date || r.created_at)}</td>
          <td style="padding:16px 20px;text-align:center;">
            <span class="badge ${statusCls}">${r.status||"Pending"}</span>
          </td>
          <td style="padding:16px 20px;text-align:center;">
            <div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
              <button onclick="empOpenSalaryIncreaseView('${r.id}')"
                style="display:inline-flex;align-items:center;gap:4px;padding:6px 11px;background:#eef6ff;color:#1e3a6e;border:1.5px solid #c8d8e8;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">
                <i class="ri-eye-line"></i> View
              </button>
              <button onclick="empOpenAction('salary-increase','${r.id}','${nameEsc}','${remEsc}')"
                style="display:inline-flex;align-items:center;gap:4px;padding:6px 11px;background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">
                <i class="ri-check-line"></i> Action
              </button>
            </div>
          </td>
        </tr>`;
      }).join("");

    } else if (empActiveTab === "employee-salary") {
      let url = `/api/employee/employee-salary?search=${encodeURIComponent(q)}`;
      if (empEmpFilterPer) url += `&period_start=${empEmpFilterPer}`;
      if (empEmpFilterEnd) url += `&period_end=${empEmpFilterEnd}`;
      const rows = await financeStandaloneApi("GET", url);
      empUpdateRequestSummary(rows);
      if (!rows.length) { tbody.innerHTML = empNoData(7); return; }
      tbody.innerHTML = rows.map(r => `
        <tr style="border-bottom:1px solid #eef2f8;transition:background .15s;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
          <td style="padding:16px 20px;text-align:center;font-weight:600;">${r.employee_name}</td>
          <td style="padding:16px 20px;text-align:center;">
            <span style="background:#e8f0fe;color:#1e3a6e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${r.position}</span>
          </td>
          <td style="padding:16px 20px;text-align:center;">${r.department}</td>
          <td style="padding:16px 20px;text-align:center;font-size:15px;font-weight:800;color:#1e3a6e;">
            &#8369;${Number(r.current_salary).toLocaleString("en-PH",{minimumFractionDigits:2})}
          </td>
          <td style="padding:16px 20px;text-align:center;font-size:12.5px;color:#6b7280;">
            ${r.period_start ? empFmtDate(r.period_start) + " – " + empFmtDate(r.period_end) : "—"}
          </td>
          <td style="padding:16px 20px;text-align:center;">${empFmtDate(r.date)}</td>
          <td style="padding:16px 20px;text-align:center;">
            <div style="display:flex;gap:8px;justify-content:center;">
              <button onclick="empEmpOpenEdit('${r.id}')"
                style="width:34px;height:34px;border-radius:50%;border:none;background:#e8f4fd;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1e3a6e;font-size:15px;" title="Edit">
                <i class="ri-pencil-line"></i>
              </button>
              <button onclick="empEmpOpenDelete('${r.id}','${(r.employee_name||"").replace(/'/g,"&apos;")}')"
                style="width:34px;height:34px;border-radius:50%;border:none;background:#fee2e2;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:15px;" title="Delete">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          </td>
        </tr>`).join("");
    }

  } catch(err) {
    const cols = {reimburse:7, budget:7, salary:7, "salary-increase":7, "employee-salary":7}[empActiveTab]||7;
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:40px;color:#dc2626;">Error loading data: ${err.message}</td></tr>`;
  }
}

function empLoadingRow() {
  const cols = {reimburse:7, budget:7, salary:7, "salary-increase":7, "employee-salary":7}[empActiveTab]||7;
  return `<tr><td colspan="${cols}" style="text-align:center;padding:40px;color:#9ca3af;">Loading...</td></tr>`;
}
function empNoData(cols) {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:44px;color:#94a3b8;">No records found.</td></tr>`;
}
function empUpdateRequestSummary(rows) {
  const totalEl = document.getElementById("empTotalCount");
  const pendingEl = document.getElementById("empPendingCount");
  const approvedEl = document.getElementById("empApprovedCount");
  const rejectedEl = document.getElementById("empRejectedCount");
  const rowsArr = Array.isArray(rows) ? rows : [];
  const countByStatus = status => rowsArr.filter(r => String(r.status || 'Pending').toLowerCase() === status).length;
  if (totalEl) totalEl.textContent = rowsArr.length;
  if (pendingEl) pendingEl.textContent = countByStatus('pending');
  if (approvedEl) approvedEl.textContent = countByStatus('approved');
  if (rejectedEl) rejectedEl.textContent = countByStatus('rejected');
}
function empEmptyRows(count, cols, total) {
  const n = Math.max(0, total - count);
  return Array(n).fill(0).map(() =>
    `<tr style="border-bottom:1px solid #eef2f8;">${Array(cols).fill(`<td style="padding:22px 20px;"></td>`).join("")}</tr>`
  ).join("");
}
function empFmtDate(d) {
  if (!d) return "&mdash;";
  try { return new Date(d).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}); }
  catch { return d; }
}

function empRequestStatusCls(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'done') return 'completed';
  if (s === 'rejected' || s === 'decline' || s === 'cancelled') return 'overdue';
  return 'progress';
}

function empMoney(value) {
  if (value === null || value === undefined || value === '') return '&mdash;';
  return `&#8369;${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function empJsString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function empInitials(name) {
  const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
}

function empAvatarTone(seed) {
  const tones = ['blue', 'green', 'violet', 'gold', 'cyan'];
  const n = String(seed || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return tones[n % tones.length];
}

function empRequestEndpoint(type, id = '') {
  const base = {
    reimburse: '/api/employee/reimburse',
    budget: '/api/employee/budget',
    salary: '/api/employee/salary-advances',
    'salary-increase': '/api/employee/salary-increase-requests',
  }[type] || '';
  return id ? `${base}/${id}` : base;
}

function empCloseActionMenus() {
  document.querySelectorAll('.emp-request-menu.show').forEach(menu => {
    menu.classList.remove('show');
    menu.style.left = '';
    menu.style.top = '';
  });
}

function empToggleActionMenu(event, key) {
  event.stopPropagation();
  const menu = document.getElementById(`empReqMenu_${key}`);
  const isOpen = menu?.classList.contains('show');
  empCloseActionMenus();
  if (menu && !isOpen) {
    const rect = event.currentTarget.getBoundingClientRect();
    menu.classList.add('show');
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(window.innerWidth - menuRect.width - 12, Math.max(12, rect.right - menuRect.width));
    const top = Math.min(window.innerHeight - menuRect.height - 12, rect.bottom + 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
}

if (!window.__empRequestMenuOutsideBound) {
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.emp-request-menu-wrap')) empCloseActionMenus();
  });
  window.__empRequestMenuOutsideBound = true;
}

function empRenderRequestRows(rows, type) {
  return rows.map(r => {
    const employee = r.employee_name || r.name || 'Unknown';
    const employeeId = r.id_no || `REQ-${String(r.id || '').padStart(4, '0')}`;
    const requestType = r.request_type || ({
      reimburse: 'Reimbursement Request',
      budget: 'Budget Request',
      salary: 'Salary Advance Request',
      'salary-increase': 'Salary Increase Request',
    }[type] || 'Request');
    const amount = type === 'salary-increase' ? r.requested_salary : r.amount;
    const reason = r.description || r.purpose || r.reason || r.justification || '&mdash;';
    const comment = r.comments || r.remarks || '';
    const employeeArg = escapeHtml(empJsString(employee));
    const commentArg = escapeHtml(empJsString(comment));
    const statusArg = escapeHtml(empJsString(r.status || 'Pending'));
    return `<tr>
      <td>
        <div class="emp-request-person">
          <div class="emp-request-avatar ${empAvatarTone(employee)}">${escapeHtml(empInitials(employee))}</div>
          <div>
            <strong>${escapeHtml(employee)}</strong>
            <span>ID: ${escapeHtml(employeeId)}</span>
          </div>
        </div>
      </td>
      <td><span class="emp-request-type-pill"><i class="ri-wallet-3-line"></i>${escapeHtml(requestType)}</span></td>
      <td class="emp-request-amount">${empMoney(amount)}</td>
      <td><span class="emp-request-reason" title="${reason === '&mdash;' ? '' : escapeHtml(reason)}">${reason === '&mdash;' ? reason : escapeHtml(reason)}</span></td>
      <td class="emp-request-date">${empFmtDate(r.date || r.request_date || r.created_at)}</td>
      <td><span class="emp-request-status ${empRequestStatusCls(r.status)}">${escapeHtml(r.status || 'Pending')}</span></td>
      <td>
        <div class="emp-request-actions">
          <button class="emp-request-view-btn" onclick="empOpenRequestDetails('${type}','${r.id}')">
            <i class="ri-eye-line"></i> View
          </button>
          <div class="emp-request-menu-wrap">
            <button class="emp-request-menu-btn" onclick="empToggleActionMenu(event, '${type}_${r.id}')" title="More actions">
              <i class="ri-more-2-fill"></i>
            </button>
            <div class="emp-request-menu" id="empReqMenu_${type}_${r.id}">
              <button onclick="empQuickStatus('${type}','${r.id}','Approved')"><i class="ri-check-line"></i> Approve</button>
              <button onclick="empQuickStatus('${type}','${r.id}','Rejected')"><i class="ri-close-line"></i> Reject</button>
              <button onclick="empOpenAction('${type}','${r.id}','${employeeArg}','${commentArg}','${statusArg}')"><i class="ri-edit-2-line"></i> Update Status</button>
              <button onclick="empOpenRequestDetails('${type}','${r.id}')"><i class="ri-eye-line"></i> View Details</button>
            </div>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function empRequestDetailRows(type, r) {
  const attachment = r.receipt_path || r.supporting_file || '';
  const attachmentName = r.receipt_name || r.supporting_file_name || 'View attachment';
  const rows = [
    ['Employee Name', r.employee_name],
    ['Status', r.status || 'Pending'],
  ];
  if (type === 'reimburse') {
    rows.push(
      ['Request Type', 'Reimbursement Request'],
      ['Category', r.category],
      ['Amount', empMoney(r.amount)],
      ['Date Requested', empFmtDate(r.request_date || r.created_at)],
      ['Date of Expense', empFmtDate(r.expense_date)],
      ['Purpose / Reason', r.purpose],
      ['Department', r.department],
      ['Remarks', r.remarks]
    );
  } else if (type === 'budget') {
    rows.push(
      ['Request Type', 'Budget Request'],
      ['Budget Title / Purpose', r.title],
      ['Department / Project', r.department_project],
      ['Requested Amount', empMoney(r.requested_amount)],
      ['Date Requested', empFmtDate(r.request_date || r.created_at)],
      ['Date Needed', empFmtDate(r.date_needed)],
      ['Reason / Justification', r.justification],
      ['Remarks', r.remarks]
    );
  } else if (type === 'salary') {
    rows.push(
      ['Request Type', 'Salary Advance Request'],
      ['Requested Amount', empMoney(r.requested_amount)],
      ['Date Requested', empFmtDate(r.request_date || r.created_at)],
      ['Preferred Deduction Start Date', empFmtDate(r.deduction_start_date)],
      ['Deduction Terms / Number of Cutoffs', r.deduction_terms],
      ['Reason', r.reason],
      ['Remarks', r.remarks]
    );
  } else if (type === 'salary-increase') {
    rows.push(
      ['Request Type', 'Salary Increase Request'],
      ['Current Salary', empMoney(r.current_salary)],
      ['Requested Salary', empMoney(r.requested_salary)],
      ['Date Requested', empFmtDate(r.request_date || r.created_at)],
      ['Effective Date', empFmtDate(r.effective_date)],
      ['Reason / Justification', r.justification],
      ['Department', r.department],
      ['Remarks', r.remarks]
    );
  }
  if (attachment) {
    rows.push(['Attachment', `<a href="${escapeHtml(attachment)}" target="_blank" rel="noopener" style="color:#1e3a6e;font-weight:800;">${escapeHtml(attachmentName)}</a>`]);
  }
  return rows.map(([label, value]) => {
    const rawValue = String(value || value === 0 ? value : '&mdash;');
    const htmlValue = rawValue.startsWith('<a ') || rawValue.includes('&#8369;') || rawValue === '&mdash;'
      ? rawValue
      : escapeHtml(rawValue);
    return `
    <div class="inc-fg" style="margin-bottom:0;">
      <label>${escapeHtml(label)}</label>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;color:#374151;min-height:40px;word-break:break-word;">
        ${htmlValue}
      </div>
    </div>
  `;
  }).join('');
}

async function empOpenRequestDetails(type, id) {
  try {
    empCloseActionMenus();
    const r = await financeStandaloneApi("GET", empRequestEndpoint(type, id));
    document.getElementById("empRequestDetailsModal")?.remove();
    const modal = document.createElement("div");
    modal.className = "inc-modal-overlay";
    modal.id = "empRequestDetailsModal";
    modal.style.display = "flex";
    modal.innerHTML = `
      <div class="inc-modal-box" style="max-width:680px;max-height:86vh;overflow:hidden;display:flex;flex-direction:column;">
        <h3 style="color:#1e3a6e;font-size:16px;font-weight:900;margin-bottom:14px;padding-bottom:14px;border-bottom:2px solid rgba(30,58,110,.1);display:flex;align-items:center;gap:8px;">
          <i class="ri-file-list-3-line"></i> Request Details
        </h3>
        <div style="overflow:auto;padding-right:4px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
            ${empRequestDetailRows(type, r)}
          </div>
        </div>
        <div class="inc-mbtns" style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:14px;">
          <button class="inc-mbtn" onclick="document.getElementById('empRequestDetailsModal')?.remove()"><i class="ri-close-line"></i> Close</button>
        </div>
      </div>`;
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(err) {
    showToast("Failed to load details: " + err.message, "error");
  }
}

async function empQuickStatus(type, id, status) {
  try {
    await financeStandaloneApi("PATCH", `/api/employee/${type === "salary" ? "salary-advances" : type}/${id}/action`, { status });
    showToast(`Marked as ${status}.`, status === "Approved" ? "success" : "info");
    empCloseActionMenus();
    empRmbFilterStatus = empBdgFilterStatus = empSalFilterStatus = empIncFilterStatus = "";
    empRefresh();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  }
}

async function empOpenSalaryIncreaseView(id) {
  try {
    const r = await financeStandaloneApi("GET", `/api/employee/salary-increase-requests/${id}`);
    document.getElementById("empSalaryIncreaseViewModal")?.remove();
    const statusCls = r.status==="Approved" ? "completed"
                    : r.status==="Rejected"||r.status==="Decline" ? "overdue" : "progress";
    const modal = document.createElement("div");
    modal.className = "inc-modal-overlay";
    modal.id = "empSalaryIncreaseViewModal";
    modal.style.display = "flex";
    modal.innerHTML = `
      <div class="inc-modal-box" style="max-width:520px;">
        <h3 style="color:#1e3a6e;"><i class="ri-money-dollar-circle-line"></i> Salary Increase Details</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div class="inc-fg"><label>Employee</label><div style="font-weight:800;color:#1e3a6e;">${r.employee_name||"&mdash;"}</div></div>
          <div class="inc-fg"><label>Status</label><span class="badge ${statusCls}">${r.status||"Pending"}</span></div>
          <div class="inc-fg"><label>Current Salary</label><div>${r.current_salary == null ? "&mdash;" : "&#8369;" + Number(r.current_salary).toLocaleString("en-PH",{minimumFractionDigits:2})}</div></div>
          <div class="inc-fg"><label>Requested Salary</label><div style="font-weight:800;color:#1e3a6e;">&#8369;${Number(r.requested_salary||0).toLocaleString("en-PH",{minimumFractionDigits:2})}</div></div>
          <div class="inc-fg"><label>Date Requested</label><div>${empFmtDate(r.request_date || r.created_at)}</div></div>
          <div class="inc-fg"><label>Effective Date</label><div>${empFmtDate(r.effective_date)}</div></div>
        </div>
        <div class="inc-fg"><label>Reason / Justification</label><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;color:#374151;">${r.justification||"&mdash;"}</div></div>
        <div class="inc-fg"><label>Remarks</label><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;color:#374151;">${r.remarks||"No remarks yet."}</div></div>
        <div class="inc-mbtns">
          <button class="inc-mbtn" onclick="document.getElementById('empSalaryIncreaseViewModal')?.remove()"><i class="ri-close-line"></i> Close</button>
        </div>
      </div>`;
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(err) {
    showToast("Failed to load details: " + err.message, "error");
  }
}

/* ── Action modal (Reimburse & Budget: Approve/Decline + comment) ── */
function empOpenAction(type, id, name, existingComment, currentStatus = "Pending") {
  empCloseActionMenus();
  empActionType = type;
  empActionId   = id;
  document.getElementById("empActionName").textContent    = name;
  document.getElementById("empActionComment").value       = existingComment || "";
  const statusEl = document.getElementById("empActionStatus");
  if (statusEl) statusEl.value = currentStatus || "Pending";
  document.getElementById("empActionModal").style.display = "flex";
}
function empCloseAction() {
  document.getElementById("empActionModal").style.display = "none";
  empActionType = ""; empActionId = null;
}
async function empDoAction(status) {
  const comments = document.getElementById("empActionComment").value.trim();
  const type = empActionType === "salary" ? "salary-advances" : empActionType;
  const nextStatus = status === "Decline" ? "Rejected" : status;
  const url = `/api/employee/${type}/${empActionId}/action`;
  try {
    await financeStandaloneApi("PATCH", url, { status: nextStatus, comments: comments || undefined });
    showToast(`Marked as ${nextStatus}.`, nextStatus==="Approved"||nextStatus==="Done" ? "success" : "info");
    empCloseAction();
    // Reset filter to show all records (so the updated record stays visible)
    empRmbFilterStatus = empBdgFilterStatus = empSalFilterStatus = empIncFilterStatus = "";
    const selMap = { reimburse: "empRmbStatus", budget: "empBdgStatus", salary: "empSalStatus", "salary-increase": "empIncStatus" };
    const sel = document.getElementById(selMap[empActiveTab] || "");
    if (sel) sel.value = "";
    empRefresh();
  } catch(err) { showToast("Failed: " + err.message, "error"); }
}

async function empSaveStatusUpdate() {
  const status = document.getElementById("empActionStatus")?.value || "Pending";
  await empDoAction(status);
}

async function empSaveComment() {
  const comments = document.getElementById("empActionComment").value.trim();
  if (!comments) { showToast("Please enter a comment first.", "error"); return; }
  const type = empActionType === "salary" ? "salary-advances" : empActionType;
  const url = `/api/employee/${type}/${empActionId}/action`;
  try {
    await financeStandaloneApi("PATCH", url, { comments });
    showToast("Comment saved.", "success");
    empCloseAction();
    empRefresh();
  } catch(err) { showToast("Failed to save comment: " + err.message, "error"); }
}

/* ═══════════════════════════════════════════════
   SALARY ADVANCE — expandable payment history
═══════════════════════════════════════════════ */

const salExpandedRows = new Set();

async function salTogglePayments(advanceId, btnEl) {
  const existing = document.getElementById(`salPayRow_${advanceId}`);
  if (existing) {
    existing.remove();
    salExpandedRows.delete(advanceId);
    if (btnEl) btnEl.innerHTML = '<i class="ri-history-line"></i> History <i class="ri-arrow-down-s-line"></i>';
    return;
  }
  salExpandedRows.add(advanceId);
  if (btnEl) btnEl.innerHTML = '<i class="ri-history-line"></i> History <i class="ri-arrow-up-s-line"></i>';

  const mainRow = document.getElementById(`salRow_${advanceId}`);
  if (!mainRow) return;

  const loadTr = document.createElement("tr");
  loadTr.id = `salPayRow_${advanceId}`;
  loadTr.innerHTML = `<td colspan="6" style="padding:0;background:#f8fafc;">
    <div style="padding:14px 32px;color:#94a3b8;font-size:13px;text-align:center;">Loading payments...</div>
  </td>`;
  mainRow.insertAdjacentElement("afterend", loadTr);

  try {
    const payments = await financeStandaloneApi("GET", `/api/employee/salary-advances/${advanceId}/payments`);
    const payHtml = payments.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:rgba(30,58,110,.08);">
            <th style="padding:10px 20px;text-align:center;font-weight:700;color:#1e3a6e;">#</th>
            <th style="padding:10px 20px;text-align:center;font-weight:700;color:#1e3a6e;">Amount Paid</th>
            <th style="padding:10px 20px;text-align:center;font-weight:700;color:#1e3a6e;">Date</th>
            <th style="padding:10px 20px;text-align:center;font-weight:700;color:#1e3a6e;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map((p,i) => {
            const pbg = p.status==="Paid" ? "#dcfce7" : p.status==="Unpaid" ? "#fee2e2" : "#fef3c7";
            const pfg = p.status==="Paid" ? "#15803d" : p.status==="Unpaid" ? "#dc2626" : "#92400e";
            return `<tr style="border-bottom:1px solid #eef2f8;">
              <td style="padding:10px 20px;text-align:center;color:#6b7280;">${i+1}</td>
              <td style="padding:10px 20px;text-align:center;font-weight:700;">&#8369;${Number(p.amount_paid).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
              <td style="padding:10px 20px;text-align:center;">${empFmtDate(p.date)}</td>
              <td style="padding:10px 20px;text-align:center;">
                <span style="background:${pbg};color:${pfg};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${p.status}</span>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>` : `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">No payment records yet.</div>`;

    document.getElementById(`salPayRow_${advanceId}`).innerHTML = `
      <td colspan="6" style="padding:0;background:#f8fafc;border-left:4px solid #1e3a6e;">
        <div style="padding:12px 32px 16px;">
          <div style="font-size:12px;font-weight:700;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
            <i class="ri-history-line"></i> Payment History
          </div>
          ${payHtml}
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;">
            <div style="font-size:12px;font-weight:700;color:#1e3a6e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
              <i class="ri-add-circle-line"></i> Add Payment
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
              <div>
                <label style="font-size:11px;color:#6b7280;font-weight:600;display:block;margin-bottom:4px;">Amount (₱)</label>
                <input type="number" id="salPayAmt_${advanceId}" placeholder="e.g. 1000" min="1"
                  style="padding:7px 11px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;width:130px;">
              </div>
              <div>
                <label style="font-size:11px;color:#6b7280;font-weight:600;display:block;margin-bottom:4px;">Date</label>
                <input type="date" id="salPayDate_${advanceId}" value="${new Date().toISOString().slice(0,10)}"
                  style="padding:7px 11px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;">
              </div>
              <div>
                <label style="font-size:11px;color:#6b7280;font-weight:600;display:block;margin-bottom:4px;">Status</label>
                <select id="salPayStatus_${advanceId}"
                  style="padding:7px 11px;border:1.5px solid #c8d8e8;border-radius:8px;font-size:13px;outline:none;background:white;color:#374151;">
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <button onclick="salAddPayment('${advanceId}')"
                style="padding:8px 18px;background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;border:none;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;">
                <i class="ri-save-line"></i> Save
              </button>
            </div>
          </div>
        </div>
      </td>`;
  } catch(err) {
    document.getElementById(`salPayRow_${advanceId}`).innerHTML = `
      <td colspan="6" style="padding:14px 32px;color:#dc2626;font-size:13px;background:#fff5f5;">
        Error: ${err.message}
      </td>`;
  }
}

/* ═══════════════════════════════════════════════
   SALARY ADVANCE — add a payment from the history panel
═══════════════════════════════════════════════ */

async function salAddPayment(advanceId) {
  const amount = parseFloat(document.getElementById(`salPayAmt_${advanceId}`)?.value);
  const date   = document.getElementById(`salPayDate_${advanceId}`)?.value;
  const status = document.getElementById(`salPayStatus_${advanceId}`)?.value || 'Paid';
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount.', 'error'); return; }
  if (!date) { showToast('Select a date.', 'error'); return; }
  try {
    await financeStandaloneApi('POST', `/api/employee/salary-advances/${advanceId}/payments`, { amount_paid: amount, date, status });
    showToast('Payment added.', 'success');
    // Remove expanded row and re-open to refresh list
    const payRow = document.getElementById(`salPayRow_${advanceId}`);
    if (payRow) payRow.remove();
    salExpandedRows.delete(String(advanceId));
    // Find the history button in the main row and re-trigger
    const mainRow = document.getElementById(`salRow_${advanceId}`);
    const histBtn = mainRow ? mainRow.querySelector('button[onclick*="salTogglePayments"]') : null;
    salTogglePayments(advanceId, histBtn);
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
}

/* ═══════════════════════════════════════════════
   EMPLOYEE SALARY — CRUD functions
═══════════════════════════════════════════════ */

let empEmpList = [];

async function empEmpLoadList() {
  if (empEmpList.length) return empEmpList;
  try { empEmpList = await financeStandaloneApi("GET", "/api/employees"); }
  catch { empEmpList = []; }
  return empEmpList;
}

async function empEmpOpenAdd() {
  empEmpEditId = null;
  await empEmpLoadList();
  const sel = document.getElementById("empEmpFEmpId");
  if (sel) {
    sel.innerHTML = '<option value="">— Select Employee —</option>' +
      empEmpList.map(e => `<option value="${e.id}">${e.full_name} (${e.position})</option>`).join("");
  }
  const t = document.getElementById("empEmpModalTitle");
  if (t) t.textContent = "Add Employee Salary";
  const today = new Date().toISOString().slice(0,10);
  ["empEmpFSalary","empEmpFPeriodStart","empEmpFPeriodEnd"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  const dt = document.getElementById("empEmpFDate"); if (dt) dt.value = today;
  const m = document.getElementById("empEmpModal"); if (m) m.style.display = "flex";
}

async function empEmpOpenEdit(id) {
  empEmpEditId = id;
  await empEmpLoadList();
  try {
    const r = await financeStandaloneApi("GET", `/api/employee/employee-salary/${id}`);
    const sel = document.getElementById("empEmpFEmpId");
    if (sel) sel.innerHTML = '<option value="">— Select Employee —</option>' +
      empEmpList.map(e =>
        `<option value="${e.id}" ${e.id == r.employee_id ? "selected":""}>${e.full_name} (${e.position})</option>`
      ).join("");
    const t = document.getElementById("empEmpModalTitle");
    if (t) t.textContent = "Edit Employee Salary";
    const flds = {
      empEmpFSalary:      r.current_salary || "",
      empEmpFDate:        r.date         ? r.date.toString().slice(0,10)         : "",
      empEmpFPeriodStart: r.period_start ? r.period_start.toString().slice(0,10) : "",
      empEmpFPeriodEnd:   r.period_end   ? r.period_end.toString().slice(0,10)   : "",
    };
    Object.entries(flds).forEach(([fid,v]) => { const el = document.getElementById(fid); if(el) el.value = v; });
    const m = document.getElementById("empEmpModal"); if (m) m.style.display = "flex";
  } catch(err) { showToast("Failed to load: " + err.message, "error"); }
}

function empEmpCloseModal() {
  const m = document.getElementById("empEmpModal"); if (m) m.style.display = "none";
  empEmpEditId = null;
}

async function empEmpSave() {
  const employee_id    = document.getElementById("empEmpFEmpId")?.value;
  const current_salary = parseFloat(document.getElementById("empEmpFSalary")?.value);
  const date           = document.getElementById("empEmpFDate")?.value;
  const period_start   = document.getElementById("empEmpFPeriodStart")?.value || null;
  const period_end     = document.getElementById("empEmpFPeriodEnd")?.value   || null;
  if (!employee_id || isNaN(current_salary) || current_salary < 0 || !date) {
    showToast("Please fill in Employee, Salary, and Date.", "error"); return;
  }
  const body = { employee_id: parseInt(employee_id), current_salary, date, period_start, period_end };
  try {
    if (empEmpEditId) {
      await financeStandaloneApi("PUT",  `/api/employee/employee-salary/${empEmpEditId}`, body);
      showToast("Salary record updated.", "success");
    } else {
      await financeStandaloneApi("POST", "/api/employee/employee-salary", body);
      showToast("Salary record added.", "success");
    }
    empEmpCloseModal();
    empRefresh();
  } catch(err) { showToast("Save failed: " + err.message, "error"); }
}

function empEmpOpenDelete(id, name) {
  empEmpDeleteId = id;
  const el = document.getElementById("empEmpDeleteName"); if (el) el.textContent = name;
  const m  = document.getElementById("empEmpDeleteModal"); if (m) m.style.display = "flex";
}
function empEmpCloseDelete() {
  const m = document.getElementById("empEmpDeleteModal"); if (m) m.style.display = "none";
  empEmpDeleteId = null;
}
async function empEmpConfirmDelete() {
  try {
    await financeStandaloneApi("DELETE", `/api/employee/employee-salary/${empEmpDeleteId}`);
    empEmpCloseDelete();
    empRefresh();
    showToast("Record deleted.", "info");
  } catch(err) { showToast("Delete failed: " + err.message, "error"); }
}

/* ── Reimburse Add modal ── */
function empOpenAddRmb() {
  document.getElementById("empRmbModalTitle").textContent = "Add Reimbursement";
  document.getElementById("empRmbEditId").value   = "";
  document.getElementById("empRmbFName").value    = "";
  document.getElementById("empRmbFRole").value    = "";
  document.getElementById("empRmbFDate").value    = new Date().toISOString().slice(0,10);
  document.getElementById("empRmbFDesc").value    = "";
  document.getElementById("empRmbFAmount").value  = "";
  document.getElementById("empRmbFStatus").value  = "Pending";
  document.getElementById("empRmbFComment").value = "";
  document.getElementById("empRmbModal").style.display = "flex";
}
function empOpenEditRmb(id, name, role, date, desc, amount, status, comments) {
  document.getElementById("empRmbModalTitle").textContent = "Edit Reimbursement";
  document.getElementById("empRmbEditId").value   = id;
  document.getElementById("empRmbFName").value    = name;
  document.getElementById("empRmbFRole").value    = role;
  document.getElementById("empRmbFDate").value    = date ? date.slice(0,10) : "";
  document.getElementById("empRmbFDesc").value    = desc;
  document.getElementById("empRmbFAmount").value  = amount;
  document.getElementById("empRmbFStatus").value  = status || "Pending";
  document.getElementById("empRmbFComment").value = comments || "";
  document.getElementById("empRmbModal").style.display = "flex";
}
function empCloseRmb() { document.getElementById("empRmbModal").style.display = "none"; }
async function empSaveRmb() {
  const editId   = document.getElementById("empRmbEditId").value;
  const full_name = document.getElementById("empRmbFName").value.trim();
  const role     = document.getElementById("empRmbFRole").value.trim();
  const date     = document.getElementById("empRmbFDate").value;
  const desc     = document.getElementById("empRmbFDesc").value.trim();
  const amount   = parseFloat(document.getElementById("empRmbFAmount").value);
  const status   = document.getElementById("empRmbFStatus").value;
  const comments = document.getElementById("empRmbFComment").value.trim() || null;
  if (!full_name || !date || isNaN(amount) || amount <= 0) {
    showToast("Please fill in Name, Date, and Amount.", "error"); return;
  }
  const body = { full_name, role, date, description: desc, amount, status, comments };
  try {
    if (editId) { await financeStandaloneApi("PUT",  `/api/employee/reimburse/${editId}`, body); showToast("Updated.", "success"); }
    else        { await financeStandaloneApi("POST", `/api/employee/reimburse`, body);            showToast("Added.", "success"); }
    empCloseRmb(); empRefresh();
  } catch(err) { showToast("Save failed: " + err.message, "error"); }
}

/* ── Budget Add modal ── */
function empOpenAddBdg() {
  document.getElementById("empBdgModalTitle").textContent = "Add Budget Request";
  document.getElementById("empBdgEditId").value   = "";
  document.getElementById("empBdgFName").value    = "";
  document.getElementById("empBdgFRole").value    = "";
  document.getElementById("empBdgFDate").value    = new Date().toISOString().slice(0,10);
  document.getElementById("empBdgFDesc").value    = "";
  document.getElementById("empBdgFAmount").value  = "";
  document.getElementById("empBdgFStatus").value  = "Pending";
  document.getElementById("empBdgFComment").value = "";
  document.getElementById("empBdgModal").style.display = "flex";
}
function empCloseRmbBdg() { document.getElementById("empBdgModal").style.display = "none"; }
async function empSaveBdg() {
  const editId    = document.getElementById("empBdgEditId").value;
  const full_name = document.getElementById("empBdgFName").value.trim();
  const role      = document.getElementById("empBdgFRole").value.trim();
  const date      = document.getElementById("empBdgFDate").value;
  const desc      = document.getElementById("empBdgFDesc").value.trim();
  const amount    = parseFloat(document.getElementById("empBdgFAmount").value);
  const status    = document.getElementById("empBdgFStatus").value;
  const comments  = document.getElementById("empBdgFComment").value.trim() || null;
  if (!full_name || !date || isNaN(amount) || amount <= 0) {
    showToast("Please fill in Name, Date, and Amount.", "error"); return;
  }
  const body = { full_name, role, date, description: desc, amount, status, comments };
  try {
    if (editId) { await financeStandaloneApi("PUT",  `/api/employee/budget/${editId}`, body); showToast("Updated.", "success"); }
    else        { await financeStandaloneApi("POST", `/api/employee/budget`, body);            showToast("Added.", "success"); }
    empCloseRmbBdg(); empRefresh();
  } catch(err) { showToast("Save failed: " + err.message, "error"); }
}

/* ── Salary Advance Add / Edit / Delete ── */
async function empOpenAddSal() {
  empSalEditId = null;
  document.getElementById("empSalModalTitle").textContent = "Add Salary Advance";
  document.getElementById("empSalAmount").value  = "";
  document.getElementById("empSalBalance").value = "";
  document.getElementById("empSalDate").value    = new Date().toISOString().slice(0,10);
  document.getElementById("empSalStatus").value  = "Pending";
  await empLoadSalEmployeeDropdown(null);
  document.getElementById("empSalModal").style.display = "flex";
}
async function empOpenEditSal(id) {
  empSalEditId = id;
  try {
    const r = await financeStandaloneApi("GET", `/api/employee/salary-advances/${id}`);
    document.getElementById("empSalModalTitle").textContent = "Edit Salary Advance";
    document.getElementById("empSalAmount").value  = r.amount_borrowed || "";
    document.getElementById("empSalBalance").value = r.remaining_balance || "";
    document.getElementById("empSalDate").value    = r.date_borrowed ? r.date_borrowed.slice(0,10) : "";
    document.getElementById("empSalStatus").value  = r.status || "Pending";
    await empLoadSalEmployeeDropdown(r.employee_id);
    document.getElementById("empSalModal").style.display = "flex";
  } catch(err) { showToast("Load failed: " + err.message, "error"); }
}
async function empLoadSalEmployeeDropdown(selectedId) {
  const sel = document.getElementById("empSalEmployeeId");
  if (!sel) return;
  sel.innerHTML = `<option value="">— Select Employee —</option>`;
  try {
    const employees = await financeStandaloneApi("GET", "/api/employees");
    employees.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.full_name} (${e.position})`;
      if (String(e.id) === String(selectedId)) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch(err) {
    sel.innerHTML = `<option value="">Failed to load employees</option>`;
  }
}
function empCloseSal() { document.getElementById("empSalModal").style.display = "none"; empSalEditId = null; }
async function empSaveSal() {
  const employee_id       = document.getElementById("empSalEmployeeId").value;
  const amount_borrowed   = parseFloat(document.getElementById("empSalAmount").value);
  const remaining_balance = parseFloat(document.getElementById("empSalBalance").value);
  const date_borrowed     = document.getElementById("empSalDate").value;
  const status            = document.getElementById("empSalStatus").value;

  if (!employee_id) { showToast("Please select an employee.", "error"); return; }
  if (isNaN(amount_borrowed) || amount_borrowed <= 0) { showToast("Please enter a valid amount.", "error"); return; }
  if (!date_borrowed) { showToast("Please select a date.", "error"); return; }

  const body = {
    employee_id,
    amount_borrowed,
    remaining_balance: isNaN(remaining_balance) ? amount_borrowed : remaining_balance,
    date_borrowed,
    status
  };
  try {
    if (empSalEditId) { await financeStandaloneApi("PUT",  `/api/employee/salary-advances/${empSalEditId}`, body); showToast("Updated.", "success"); }
    else              { await financeStandaloneApi("POST", `/api/employee/salary-advances`, body);                  showToast("Added.", "success"); }
    empCloseSal(); empRefresh();
  } catch(err) { showToast("Save failed: " + err.message, "error"); }
}
function empOpenDeleteSal(id, name) {
  empSalDeleteId = id;
  document.getElementById("empSalDeleteName").textContent = name;
  document.getElementById("empSalDeleteModal").style.display = "flex";
}
function empCloseSalDelete() { document.getElementById("empSalDeleteModal").style.display = "none"; empSalDeleteId = null; }
async function empConfirmSalDelete() {
  try {
    await financeStandaloneApi("DELETE", `/api/employee/salary-advances/${empSalDeleteId}`);
    empCloseSalDelete(); empRefresh();
    showToast("Deleted.", "info");
  } catch(err) { showToast("Delete failed: " + err.message, "error"); }
}

/* ================= SHARED UI BUILDERS ================= */

function buildPageShell({ icon, title, subtitle, addBtnLabel, addBtnId, tableHeaders, tableBodyId }) {
  return `
    <div style="background:#f0f4fa;min-height:100%;padding-bottom:40px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:28px 32px 24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:26px;font-weight:800;color:#1e3a6e;margin:0;display:flex;align-items:center;gap:10px;">
            <i class="${icon}" style="color:#2d5fa8;"></i> ${title}
          </h2>
          <p style="color:#6b7280;font-size:13px;margin:4px 0 0;">${subtitle}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="search-box" style="max-width:320px;">
            <i class="ri-search-line"></i>
            <input type="text" placeholder="Search here…">
          </div>
          <button style="display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:10px;border:none;background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(30,58,110,.28);" id="${addBtnId}">
            <i class="ri-add-line"></i> ${addBtnLabel}
          </button>
        </div>
      </div>
      <div style="padding:0 32px;">
        <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
          <div style="background:linear-gradient(135deg,#1a3460,#1e3a6e,#2a52a0);color:white;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:15px;font-weight:800;letter-spacing:.5px;">${title}</span>
            <button style="display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:8px;border:none;background:rgba(255,255,255,.15);color:white;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">
              <i class="ri-download-2-line"></i> Export
            </button>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:linear-gradient(90deg,rgba(184,212,236,.6),rgba(184,212,236,.3));">
                  ${tableHeaders.map(h => `<th style="padding:13px 20px;text-align:left;font-size:12px;font-weight:700;color:#1e3a6e;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">${h}</th>`).join("")}
                </tr>
              </thead>
              <tbody id="${tableBodyId}">
                <tr><td colspan="${tableHeaders.length}" style="text-align:center;padding:44px;color:#9ca3af;">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function renderPlaceholderTable(tbodyId, rows, rowRenderer) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;padding:40px;color:#9ca3af;">No records found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r, i) => rowRenderer(r, i)).join("");
}

function actionBtns() {
  return `
    <div style="display:flex;gap:6px;">
      <button class="tool-btn" style="padding:4px 8px;" title="Edit"><i class="ri-edit-line"></i></button>
      <button class="tool-btn danger-btn" style="padding:4px 8px;" title="Delete"><i class="ri-delete-bin-line"></i></button>
    </div>
  `;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

/* ================= FINANCE INVENTORY ================= */
let finInvItems = [];
let finInvSummary = null;
let finInvActiveTab = 'overview';
let finInvSearch = '';
let finInvStatusFilter = 'all';
let finInvDateFrom = '';
let finInvDateTo = '';
let finInvEditingItem = null;
let finInvStatusChart = null;
let finInvDistributionChart = null;

/* ================= INVENTORY ================= */

const FIN_INV_STATUSES = ['In Stock', 'Deployed', 'For Repair', 'Returned', 'Condemned', 'Missing'];
const FIN_INV_CATEGORIES = ['Network Cables', 'Router', 'Access Point Devices', 'Network Switches', 'Modem', 'Power Supply', 'Tools', 'Other'];
const FIN_INV_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged'];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function financeInventoryApiBase() {
  return '/api/finance/inventory';
}

function financeInventoryFetchOptions(options = {}) {
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-User-Id': financeUser?.id || '',
      'X-User-Role': financeUser?.role || 'finance'
    }
  };
}

function loadFinanceInventory() {
  finInvEditingItem = null;
    getFinanceMainContent().innerHTML = `
    <div class="inventory-page">
      <div class="inventory-header">
        <div class="inventory-header-identity">
          <div class="inventory-header-icon"><i class="ri-dashboard-line"></i></div>
          <div>
            <h2>Inventory</h2>
          </div>
        </div>
        <div class="inventory-search">
          <i class="ri-search-line"></i>
          <input id="invSearchInput" type="text" placeholder="Search inventory..." value="${escapeHtml(finInvSearch)}">
        </div>
      </div>

      <div class="inventory-tabs">
        <button class="inventory-tab ${finInvActiveTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
        <button class="inventory-tab ${finInvActiveTab === 'items' ? 'active' : ''}" data-tab="items">Inventory Items</button>
      </div>

      <div id="inventoryBody">
        <div class="inventory-loading"><i class="ri-loader-4-line spin"></i> Loading inventory...</div>
      </div>
    </div>
  `;

  document.querySelectorAll('.inventory-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      finInvActiveTab = btn.dataset.tab;
      finInvEditingItem = null;
      renderFinanceInventory();
    });
  });

  let searchTimer;
  document.getElementById('invSearchInput')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      finInvSearch = e.target.value.trim();
      loadFinanceInventoryData();
    }, 220);
  });

  loadFinanceInventoryData();
}

async function loadFinanceInventoryData() {
  const params = new URLSearchParams();
  if (finInvSearch) params.set('q', finInvSearch);
  if (finInvStatusFilter && finInvStatusFilter !== 'all') params.set('status', finInvStatusFilter);
  if (finInvDateFrom) params.set('date_from', finInvDateFrom);
  if (finInvDateTo) params.set('date_to', finInvDateTo);

  try {
    const [itemsRes, summaryRes] = await Promise.all([
      fetch(`${financeInventoryApiBase()}/items?${params.toString()}`, financeInventoryFetchOptions()),
      fetch(`${financeInventoryApiBase()}/summary`, financeInventoryFetchOptions())
    ]);
    const items = await itemsRes.json().catch(() => []);
    const summary = await summaryRes.json().catch(() => ({}));
    if (!itemsRes.ok) throw new Error(items.error || 'Failed to load inventory items');
    if (!summaryRes.ok) throw new Error(summary.error || 'Failed to load inventory summary');
    finInvItems = Array.isArray(items) ? items : [];
    finInvSummary = summary || {};
    renderFinanceInventory();
  } catch (err) {
    const body = document.getElementById('inventoryBody');
    if (body) body.innerHTML = `<div class="inventory-empty"><i class="ri-error-warning-line"></i><span>${escapeHtml(err.message || 'Inventory failed to load.')}</span></div>`;
  }
}

function renderFinanceInventory() {
  const body = document.getElementById('inventoryBody');
  if (!body) return;
  body.innerHTML = finInvActiveTab === 'overview' ? financeInventoryOverviewHTML() : financeInventoryItemsHTML();
  if (finInvActiveTab === 'overview') {
    renderFinanceInventoryCharts();
  } else {
    bindFinanceInventoryItemsEvents();
  }
}

function getFinanceInventoryStatusCount(status) {
  const rows = finInvSummary?.byStatus || [];
  const found = rows.find(r => String(r.status || '').toLowerCase() === status.toLowerCase());
  return found ? Number(found.count || 0) : 0;
}

function financeInventoryOverviewHTML() {
  const cards = [
    { label: 'Total Items', value: finInvSummary?.totalItems || 0, icon: 'ri-stack-line', cls: 'blue' },
    { label: 'Deployed', value: getFinanceInventoryStatusCount('Deployed'), icon: 'ri-send-plane-line', cls: 'green' },
    { label: 'In Stock', value: getFinanceInventoryStatusCount('In Stock'), icon: 'ri-archive-line', cls: 'cyan' },
    { label: 'For Repair', value: getFinanceInventoryStatusCount('For Repair'), icon: 'ri-tools-line', cls: 'amber' },
    { label: 'Missing', value: getFinanceInventoryStatusCount('Missing'), icon: 'ri-error-warning-line', cls: 'red' }
  ];
  const activities = finInvSummary?.recentActivities || [];
  return `
    <div class="inventory-summary-grid">
      ${cards.map(c => `
        <div class="inventory-stat-card ${c.cls}">
          <div class="inventory-stat-icon"><i class="${c.icon}"></i></div>
          <div>
            <strong>${Number(c.value || 0).toLocaleString()}</strong>
            <span>${escapeHtml(c.label)}</span>
          </div>
        </div>`).join('')}
    </div>

    <div class="inventory-charts-grid">
      <div class="inventory-card">
        <div class="inventory-card-head">
          <h3>Inventory Status</h3>
          <span>Current item lifecycle</span>
        </div>
        <div class="inventory-chart-wrap"><canvas id="finInvStatusChart"></canvas></div>
      </div>
      <div class="inventory-card">
        <div class="inventory-card-head">
          <h3>Inventory Distribution</h3>
          <span>Items by category</span>
        </div>
        <div class="inventory-chart-wrap"><canvas id="finInvDistributionChart"></canvas></div>
      </div>
    </div>

    <div class="inventory-card inventory-activity-card">
      <div class="inventory-card-head">
        <h3>Recent Activities</h3>
        <span>Latest inventory movement</span>
      </div>
      <div class="inventory-table-wrap">
        <table class="inventory-table activity">
          <thead><tr><th>Date</th><th>Time</th><th>Item</th><th>Action</th><th>Site</th></tr></thead>
          <tbody>
            ${activities.length ? activities.map(a => {
              const d = a.created_at ? new Date(a.created_at) : null;
              return `<tr>
                <td>${d ? escapeHtml(d.toLocaleDateString()) : '&mdash;'}</td>
                <td>${d ? escapeHtml(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '&mdash;'}</td>
                <td>${escapeHtml(a.item_label || 'Item')}</td>
                <td><span class="inventory-action-pill">${escapeHtml(a.action || 'Updated')}</span></td>
                <td>${escapeHtml(a.site || '—')}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="5" class="inventory-empty-cell">No recent activities yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
async function renderFinanceInventoryCharts() {
  try {
    await financeStandaloneEnsureCharts();
  } catch (err) {
    document.querySelectorAll('.inventory-chart-wrap').forEach(wrap => {
      wrap.innerHTML = `<div class="inventory-empty small">${escapeHtml(err.message || 'Charts unavailable.')}</div>`;
    });
    return;
  }

  const isDark = document.body.classList.contains('dark');
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)';
  const statusLabels = ['In Stock', 'Deployed', 'For Repair', 'Returned', 'Condemned', 'Missing'];
  const statusData = statusLabels.map(getFinanceInventoryStatusCount);
  const statusCanvas = document.getElementById('finInvStatusChart');
  const distCanvas = document.getElementById('finInvDistributionChart');

  if (statusCanvas) {
    if (finInvStatusChart) { try { finInvStatusChart.destroy(); } catch {} }
    finInvStatusChart = new Chart(statusCanvas, {
      type: 'bar',
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusData,
          backgroundColor: [financeChartColors.income, financeChartColors.income, financeChartColors.project, financeChartColors.collection, financeChartColors.muted, financeChartColors.expense],
          borderRadius: 8,
          barThickness: 28
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11, weight: 700 } } },
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0, color: textColor } }
        }
      }
    });
  }

  if (distCanvas) {
    if (finInvDistributionChart) { try { finInvDistributionChart.destroy(); } catch {} }
    const rows = finInvSummary?.byCategory?.length ? finInvSummary.byCategory : [
      { category: 'Network Cables', count: 0 },
      { category: 'Router', count: 0 },
      { category: 'Access Point Devices', count: 0 },
      { category: 'Network Switches', count: 0 }
    ];
    finInvDistributionChart = new Chart(distCanvas, {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r.category),
        datasets: [{
          data: rows.map(r => Number(r.count || 0)),
          backgroundColor: [financeChartColors.income, financeChartColors.project, financeChartColors.collection, financeChartColors.expense, financeChartColors.muted],
          borderWidth: 0,
          hoverOffset: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, usePointStyle: true, font: { size: 11 } } }
        }
      }
    });
  }
}

function financeInventoryItemsHTML() {
  return `
    <div class="inventory-items-toolbar">
      <div class="inventory-filter-group">
        <button class="inventory-outline-btn" id="invFilterBtn"><i class="ri-filter-3-line"></i> Filter</button>
        <select id="finInvStatusFilter" class="inventory-filter-select">
          <option value="all">All Status</option>
          ${FIN_INV_STATUSES.map(s => `<option value="${escapeHtml(s)}" ${finInvStatusFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
        <span class="inventory-outline-btn inventory-date-label"><i class="ri-calendar-event-line"></i> Custom Date</span>
        <label class="inventory-date-filter"><i class="ri-calendar-line"></i><input id="finInvDateFrom" type="date" value="${escapeHtml(finInvDateFrom)}"></label>
        <label class="inventory-date-filter"><input id="finInvDateTo" type="date" value="${escapeHtml(finInvDateTo)}"></label>
      </div>
      <button class="inventory-add-btn" id="invAddBtn"><i class="ri-add-line"></i> Add</button>
    </div>
    <div id="inventoryFormHost">${finInvEditingItem ? financeInventoryFormHTML(finInvEditingItem) : ''}</div>
    <div class="inventory-card">
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead><tr><th>Date</th><th>Serial No</th><th>Category</th><th>Brand</th><th>Status</th><th>Site</th><th>Actions</th></tr></thead>
          <tbody>
            ${finInvItems.length ? finInvItems.map(item => `
              <tr>
                <td>${formatFinanceInventoryDate(item.date_received || item.created_at)}</td>
                <td><strong>${escapeHtml(item.serial_no || '—')}</strong><small>${escapeHtml(item.item_code || '')}</small></td>
                <td>${escapeHtml(item.category || '—')}</td>
                <td>${escapeHtml(item.brand || '—')}</td>
                <td>${financeInventoryStatusBadge(item.status)}</td>
                <td>${escapeHtml(item.site_name || item.site_id || '—')}</td>
                <td>
                  <div class="inventory-row-actions">
                    <button class="inventory-icon-btn edit" data-id="${item.id}" title="Edit"><i class="ri-edit-line"></i></button>
                    <button class="inventory-icon-btn delete" data-id="${item.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="7" class="inventory-empty-cell">No inventory items found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
function financeInventoryFormHTML(item = {}) {
  const isEdit = Boolean(item.id);
  const input = (name, label, type = 'text', extra = '') => `
    <label class="inventory-field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escapeHtml(formatFinanceInventoryInputValue(item[name], type))}" ${extra}>
    </label>`;
  const select = (name, label, options) => `
    <label class="inventory-field">
      <span>${label}</span>
      <select name="${name}">
        ${options.map(opt => `<option value="${escapeHtml(opt)}" ${String(item[name] || '') === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
      </select>
    </label>`;
  return `
    <form class="inventory-form" id="inventoryItemForm" data-id="${isEdit ? item.id : ''}">
      <div class="inventory-form-title">
        <div><h3>${isEdit ? 'Edit Inventory Item' : 'Add Inventory Item'}</h3><span>${isEdit ? 'Update item details and status' : 'Create a new inventory record'}</span></div>
        <button type="button" class="inventory-outline-btn" id="invCancelFormBtn">Cancel</button>
      </div>
      <div class="inventory-form-grid">
        <div class="inventory-form-col">
          <section class="inventory-form-section">
            <h4>Basic Information</h4>
            ${input('serial_no', 'Serial Number', 'text', 'required')}
            ${select('category', 'Category', FIN_INV_CATEGORIES)}
            ${input('item_code', 'Item Code / Secondary Number')}
            ${input('brand', 'Brand')}
            ${input('model', 'Model')}
            <label class="inventory-field full"><span>Description</span><textarea name="description">${escapeHtml(item.description || '')}</textarea></label>
          </section>
          <section class="inventory-form-section">
            <h4>Receiving Information</h4>
            ${input('date_received', 'Date Received', 'date')}
            ${input('received_by', 'Received By')}
          </section>
          <section class="inventory-form-section">
            <h4>Deployment Information</h4>
            ${input('site_id', 'Site ID')}
            ${input('site_name', 'Site Name')}
            ${input('deployed_at', 'Deployed At', 'date')}
            ${input('deployed_by', 'Deployed By')}
          </section>
        </div>
        <div class="inventory-form-col">
          <section class="inventory-form-section">
            <h4>Purchase Information</h4>
            ${input('purchase_date', 'Purchase Date', 'date')}
            ${input('price', 'Price', 'number', 'step="0.01" min="0"')}
            ${input('supplier', 'Supplier')}
            ${input('purchase_order_no', 'Purchase Order No.')}
          </section>
          <section class="inventory-form-section">
            <h4>Condition & Status</h4>
            ${select('condition', 'Condition', FIN_INV_CONDITIONS)}
            ${select('status', 'Status', FIN_INV_STATUSES)}
          </section>
          <section class="inventory-form-section">
            <h4>Project Information</h4>
            ${input('project_name', 'Project Name')}
            ${input('project_id', 'Project ID')}
          </section>
        </div>
      </div>
      <div class="inventory-form-footer">
        <button type="submit" class="inventory-save-btn"><i class="ri-save-3-line"></i> Save</button>
      </div>
    </form>
  `;
}

function bindFinanceInventoryItemsEvents() {
  document.getElementById('invAddBtn')?.addEventListener('click', () => {
    finInvEditingItem = {
      category: FIN_INV_CATEGORIES[0],
      condition: 'Good',
      status: 'In Stock'
    };
    renderFinanceInventory();
    document.getElementById('inventoryItemForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('invCancelFormBtn')?.addEventListener('click', () => {
    finInvEditingItem = null;
    renderFinanceInventory();
  });
  document.getElementById('finInvStatusFilter')?.addEventListener('change', e => {
    finInvStatusFilter = e.target.value;
    loadFinanceInventoryData();
  });
  document.getElementById('finInvDateFrom')?.addEventListener('change', e => {
    finInvDateFrom = e.target.value;
    loadFinanceInventoryData();
  });
  document.getElementById('finInvDateTo')?.addEventListener('change', e => {
    finInvDateTo = e.target.value;
    loadFinanceInventoryData();
  });
  document.getElementById('invFilterBtn')?.addEventListener('click', () => {
    finInvStatusFilter = 'all';
    finInvDateFrom = '';
    finInvDateTo = '';
    loadFinanceInventoryData();
  });
  document.querySelectorAll('.inventory-icon-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      finInvEditingItem = finInvItems.find(item => String(item.id) === String(btn.dataset.id)) || null;
      renderFinanceInventory();
      document.getElementById('inventoryItemForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.querySelectorAll('.inventory-icon-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteFinanceInventoryItem(btn.dataset.id));
  });
  document.getElementById('inventoryItemForm')?.addEventListener('submit', saveFinanceInventoryItem);
}

async function saveFinanceInventoryItem(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('.inventory-save-btn');
  const id = form.dataset.id;
  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());
  payload.created_by = financeUser?.id || null;
  payload.actor_name = financeUser?.full_name || financeUser?.email || 'User';
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving';
  try {
    const res = await fetch(id ? `${financeInventoryApiBase()}/items/${id}` : `${financeInventoryApiBase()}/items`, financeInventoryFetchOptions({
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save inventory item');
    showToast(id ? 'Inventory item updated.' : 'Inventory item added.', 'success');
    finInvEditingItem = null;
    await loadFinanceInventoryData();
  } catch (err) {
    showToast(err.message || 'Failed to save inventory item.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-save-3-line"></i> Save';
  }
}

async function deleteFinanceInventoryItem(id) {
  const item = finInvItems.find(row => String(row.id) === String(id));
  if (!confirm(`Delete ${item?.serial_no || 'this inventory item'}?`)) return;
  try {
    const actor = encodeURIComponent(financeUser?.full_name || financeUser?.email || 'User');
    const res = await fetch(`${financeInventoryApiBase()}/items/${id}?actor=${actor}`, financeInventoryFetchOptions({ method: 'DELETE' }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete inventory item');
    showToast('Inventory item deleted.', 'success');
    await loadFinanceInventoryData();
  } catch (err) {
    showToast(err.message || 'Delete failed.', 'error');
  }
}

function financeInventoryStatusBadge(status = 'In Stock') {
  const key = String(status || 'In Stock').toLowerCase().replace(/\s+/g, '-');
  return `<span class="inventory-status-badge ${key}">${escapeHtml(status || 'In Stock')}</span>`;
}

function formatFinanceInventoryDate(value) {
  if (!value) return '&mdash;';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(value));
  return escapeHtml(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
}

function formatFinanceInventoryInputValue(value, type) {
  if (!value) return '';
  if (type === 'date') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return value;
}


(function injectModals() {
  if (document.getElementById("incRecordModal")) return;
  const modals = `
  <!-- INCOME: Add / Edit Modal -->
  <div class="inc-modal-overlay" id="incRecordModal">
    <div class="inc-modal-box">
      <h3 id="incModalTitle"><i class="ri-add-circle-line"></i> Add Income</h3>
      <input type="hidden" id="incEditId">
      <div class="inc-fg"><label>Date</label><input type="date" id="incFDate"></div>
      <div class="inc-fg">
        <label>Project Name <span style="color:#9ca3af;font-weight:400;">(leave blank for General Income)</span></label>
        <input type="text" id="incFProject" placeholder="e.g. Lot A, Lot B, Project Alpha...">
      </div>
      <div class="inc-fg"><label>Source</label>
        <select id="incFSource">
          <option value="">&#8212; Select Source &#8212;</option>
          <option>Service Fee</option><option>Installation Fee</option>
          <option>Subscription</option><option>Maintenance</option>
          <option>Client Payment</option><option>Other</option>
        </select>
      </div>
      <div class="inc-fg"><label>Description</label><input type="text" id="incFDesc" placeholder="e.g. Satellite Service — Jan"></div>
      <div class="inc-fg"><label>Amount (&#8369;)</label><input type="number" id="incFAmount" placeholder="e.g. 120000" min="1"></div>
      <div class="inc-fg"><label>Status</label>
        <select id="incFStatus">
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div class="inc-fg"><label>OR Number <span style="color:#9ca3af;font-weight:400;">(optional)</span></label><input type="text" id="incFOR" placeholder="e.g. OR-2026-001"></div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="incCloseModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="incSaveRecord()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- INCOME: Delete Confirm Modal -->
  <div class="inc-modal-overlay" id="incDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;"><i class="ri-delete-bin-line"></i> Delete Record</h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Are you sure you want to delete this record?</p>
      <p id="incDeletePreview" style="font-size:12.5px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;"></p>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="incCloseDeleteModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="incConfirmDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML("beforeend", modals);

  // ── Employee Salary modals ─────────────────────────────────────
  const empEmpModals = `
  <!-- Employee Salary: Add/Edit Modal -->
  <div class="inc-modal-overlay" id="empEmpModal">
    <div class="inc-modal-box" style="max-width:480px;">
      <h3 id="empEmpModalTitle" style="font-size:16px;font-weight:900;color:#1e3a6e;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid rgba(30,58,110,.1);display:flex;align-items:center;gap:8px;">
        <i class="ri-money-dollar-circle-line"></i> Add Employee Salary
      </h3>
      <div class="inc-fg">
        <label>Employee</label>
        <select id="empEmpFEmpId">
          <option value="">— Select Employee —</option>
        </select>
      </div>
      <div class="inc-fg">
        <label>Current Salary (&#8369;)</label>
        <input type="number" id="empEmpFSalary" placeholder="e.g. 18000" min="0" step="0.01">
      </div>
      <div class="inc-fg">
        <label>Payroll Date</label>
        <input type="date" id="empEmpFDate">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="inc-fg">
          <label>Period Start</label>
          <input type="date" id="empEmpFPeriodStart">
        </div>
        <div class="inc-fg">
          <label>Period End</label>
          <input type="date" id="empEmpFPeriodEnd">
        </div>
      </div>
      <div class="inc-mbtns" style="margin-top:20px;">
        <button class="inc-mbtn" onclick="empEmpCloseModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="empEmpSave()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- Employee Salary: Delete Modal -->
  <div class="inc-modal-overlay" id="empEmpDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;font-size:16px;font-weight:900;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <i class="ri-delete-bin-line"></i> Delete Salary Record
      </h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Delete salary record for:</p>
      <p id="empEmpDeleteName" style="font-size:13px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;font-weight:700;"></p>
      <div class="inc-mbtns" style="margin-top:20px;">
        <button class="inc-mbtn" onclick="empEmpCloseDelete()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="empEmpConfirmDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", empEmpModals);

  // Inject additional modals
  const extraModals = `
  <!-- EXPENSE: Add/Edit Modal -->
  <div class="inc-modal-overlay" id="expModal">
    <div class="inc-modal-box">
      <h3 id="expModalTitle">Add Expense</h3>
      <input type="hidden" id="expEditId">
      <input type="hidden" id="expFType" value="expenses">
      <div class="inc-fg"><label>Date</label><input type="date" id="expFDate"></div>
      <div class="inc-fg"><label>Description</label><input type="text" id="expFDesc" placeholder="e.g. Staff Payroll"></div>
      <div class="inc-fg"><label>Category</label>
        <select id="expFCat">
          <option>Salaries</option><option>Contractor Fees</option><option>Legal Fees</option>
          <option>Utilities</option><option>Other</option>
        </select>
      </div>
      <div class="inc-fg"><label>Supplier / Vendor <span style="color:#9ca3af;font-weight:400;">(optional)</span></label><input type="text" id="expFVendor" placeholder="e.g. MERALCO"></div>
      <div class="inc-fg"><label>Amount (₱)</label><input type="number" id="expFAmount" placeholder="e.g. 15000" min="1"></div>
      <div class="inc-fg"><label>Status</label>
        <select id="expFStatus">
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="expCloseModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="expSave()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- EXPENSE: Delete Modal -->
  <div class="inc-modal-overlay" id="expDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;"><i class="ri-delete-bin-line"></i> Delete Expense</h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Are you sure you want to delete this record?</p>
      <p id="expDeletePreview" style="font-size:12.5px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;"></p>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="expCloseDelete()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="expConfirmDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>

  <!-- CONTRIBUTION: Add/Edit Modal -->
  <div class="inc-modal-overlay" id="conModal">
    <div class="inc-modal-box">
      <h3 id="conModalTitle">Add Contribution</h3>
      <div class="inc-fg"><label>Employee Name</label><input type="text" id="conFName" placeholder="e.g. Juan Dela Cruz"></div>
      <div class="inc-fg"><label>Type</label>
        <select id="conFType">
          <option value="SSS">SSS</option>
          <option value="PhilHealth">PhilHealth</option>
          <option value="Pag-Ibig">Pag-Ibig</option>
        </select>
      </div>
      <div class="inc-fg"><label>Employee Share (₱)</label><input type="number" id="conFEmpShare" placeholder="e.g. 1125" min="0" step="0.01"></div>
      <div class="inc-fg"><label>Employer Share (₱)</label><input type="number" id="conFErShare" placeholder="e.g. 2250" min="0" step="0.01"></div>
      <div class="inc-fg"><label>Due Date</label><input type="date" id="conFDueDate"></div>
      <div class="inc-fg"><label>Status</label>
        <select id="conFStatus">
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Overdue">Overdue</option>
        </select>
      </div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="conCloseModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="conSave()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- CONTRIBUTION: Delete Modal -->
  <div class="inc-modal-overlay" id="conDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;"><i class="ri-delete-bin-line"></i> Delete Contribution</h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Are you sure you want to delete this record?</p>
      <p id="conDeleteName" style="font-size:13px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;font-weight:600;"></p>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="conCloseDelete()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="conConfirmDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>

  <!-- PROJECT EXPENSE: Add/Edit Modal -->
  <!-- PROJECT EXPENSE: Add/Edit Modal -->
  <div class="inc-modal-overlay" id="peModal">
    <div class="inc-modal-box">
      <h3 id="peModalTitle">Add Project Expense</h3>
      <input type="hidden" id="peFType" value="expenses">
      <div class="inc-fg"><label>Date</label><input type="date" id="peFDate"></div>
      <div class="inc-fg"><label>Project Name</label><input type="text" id="peFProject" placeholder="e.g. Project A"></div>
      <div class="inc-fg"><label>Description</label><input type="text" id="peFDesc" placeholder="e.g. Concrete Materials"></div>
      <div class="inc-fg"><label>Category</label>
        <select id="peFCat">
          <option value="Materials">Materials</option>
          <option value="Labor">Labor</option>
          <option value="Equipment">Equipment</option>
          <option value="Logistics">Logistics</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="inc-fg"><label>Supplier <span style="color:#9ca3af;font-weight:400;">(optional)</span></label><input type="text" id="peFVendor" placeholder="e.g. SM Construct"></div>
      <div class="inc-fg"><label>Amount (₱)</label><input type="number" id="peFAmount" placeholder="e.g. 88000" min="1"></div>
      <div class="inc-fg"><label>Status</label>
        <select id="peFStatus">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="peCloseModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="peSave()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- PROJECT EXPENSE: Delete Modal -->
  <div class="inc-modal-overlay" id="peDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;"><i class="ri-delete-bin-line"></i> Delete Project Record</h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Are you sure you want to delete this record?</p>
      <p id="peDeletePreview" style="font-size:12.5px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;"></p>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="peCloseDelete()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="peConfirmDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>

  <!-- COLLECTIONS: Add/Edit Modal -->
  <div class="inc-modal-overlay" id="colModal">
    <div class="inc-modal-box" style="max-width:480px;">
      <h3 id="colModalTitle"><i class="ri-hand-coin-line"></i> Add Collection</h3>
      <input type="hidden" id="colEditId">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="inc-fg"><label>Date</label><input type="date" id="colFDate"></div>
        <div class="inc-fg"><label>Status</label>
          <select id="colFStatus" style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:9px;font-size:13.5px;font-family:inherit;outline:none;background:white;">
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Decline">Decline</option>
          </select>
        </div>
      </div>
      <div class="inc-fg"><label>Client</label><input type="text" id="colFClient" placeholder="e.g. BBM, Jae, Mariott"></div>
      <div class="inc-fg"><label>Project <span style="color:#9ca3af;font-weight:400;">(optional)</span></label>
        <input type="text" id="colFProject" placeholder="e.g. Project A, Project B">
      </div>
      <div class="inc-fg"><label>OR Number <span style="color:#9ca3af;font-weight:400;">(optional)</span></label>
        <input type="text" id="colFOR" placeholder="e.g. 2434">
      </div>
      <div class="inc-fg"><label>Amount Due (₱)</label><input type="number" id="colFDue" placeholder="e.g. 3200" min="1"></div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="colCloseModal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="colSave()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- COLLECTIONS: Delete Modal -->
  <div class="inc-modal-overlay" id="colDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;"><i class="ri-delete-bin-line"></i> Delete Collection</h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Are you sure you want to delete this record?</p>
      <p id="colDeletePreview" style="font-size:12.5px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;"></p>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="colCloseDelete()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="colConfirmDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>

  <!-- EMPLOYEE: Action Modal (Approve / Decline + optional comment) -->
  <div class="inc-modal-overlay" id="empActionModal">
    <div class="inc-modal-box" style="max-width:420px;">
      <h3 style="color:#1e3a6e;font-size:16px;font-weight:900;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid rgba(30,58,110,.1);display:flex;align-items:center;gap:8px;">
        <i class="ri-shield-check-line"></i> Action
      </h3>
      <p style="font-size:13.5px;color:#374151;margin-bottom:16px;">
        Employee: <strong id="empActionName"></strong>
      </p>
      <div class="inc-fg">
        <label>Status</label>
        <select id="empActionStatus"
          style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:9px;font-size:13.5px;font-family:inherit;outline:none;background:white;color:#374151;">
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <div class="inc-fg">
        <label>Comment <span style="color:#94a3b8;font-weight:400;">(optional)</span></label>
        <textarea id="empActionComment" rows="3"
          placeholder="Add a comment..."
          style="width:100%;padding:10px 14px;border-radius:11px;border:1.5px solid #e2e8f0;font-size:13px;font-family:inherit;outline:none;resize:vertical;"
          onfocus="this.style.borderColor='#1e3a6e'" onblur="this.style.borderColor='#e2e8f0'"></textarea>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;">
        <button onclick="empSaveStatusUpdate()"
          style="display:inline-flex;align-items:center;gap:6px;padding:9px 20px;border-radius:50px;border:none;
                 background:linear-gradient(135deg,#1e3a6e,#2d5fa8);color:white;font-size:13px;font-weight:700;
                 cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(30,58,110,.3);">
          <i class="ri-save-line"></i> Update Status
        </button>
      </div>
      <div class="inc-mbtns" style="margin-top:14px;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:14px;">
        <button class="inc-mbtn" onclick="empCloseAction()">
          <i class="ri-close-line"></i> Cancel
        </button>
        <div style="display:flex;gap:8px;">
          <button onclick="empDoAction('Rejected')"
            style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:50px;border:none;background:linear-gradient(135deg,#dc2626,#ef4444);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(220,38,38,.3);">
            <i class="ri-close-circle-line"></i> Reject
          </button>
          <button onclick="empDoAction('Approved')"
            style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:50px;border:none;background:linear-gradient(135deg,#16a34a,#22c55e);color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(22,163,74,.3);">
            <i class="ri-check-double-line"></i> Approve
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- EMPLOYEE: Salary Delete Confirm Modal -->
  <div class="inc-modal-overlay" id="empSalDeleteModal">
    <div class="inc-modal-box" style="max-width:380px;">
      <h3 style="color:#dc2626;"><i class="ri-delete-bin-line"></i> Delete Salary Advance</h3>
      <p style="font-size:14px;color:#374151;margin-bottom:8px;">Are you sure you want to delete this record?</p>
      <p id="empSalDeleteName" style="font-size:13px;color:#6b7280;background:#f8fafc;padding:10px 14px;border-radius:9px;font-weight:600;"></p>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="empCloseSalDelete()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-del" onclick="empConfirmSalDelete()"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>
  </div>

  <!-- EMPLOYEE: Salary Add/Edit Modal -->
  <div class="inc-modal-overlay" id="empSalModal">
    <div class="inc-modal-box" style="max-width:420px;">
      <h3 id="empSalModalTitle"><i class="ri-money-dollar-circle-line"></i> Add Salary Advance</h3>
      <div class="inc-fg"><label>Employee</label>
        <select id="empSalEmployeeId" style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:9px;font-size:13.5px;font-family:inherit;outline:none;background:white;color:#374151;">
          <option value="">— Select Employee —</option>
        </select>
      </div>
      <div class="inc-fg"><label>Amount Borrowed (&#8369;)</label>
        <input type="number" id="empSalAmount" placeholder="e.g. 5000" min="1">
      </div>
      <div class="inc-fg"><label>Remaining Balance (&#8369;) <span style="color:#9ca3af;font-weight:400;">(leave blank = same as amount)</span></label>
        <input type="number" id="empSalBalance" placeholder="e.g. 13000" min="0">
      </div>
      <div class="inc-fg"><label>Date</label>
        <input type="date" id="empSalDate">
      </div>
      <div class="inc-fg"><label>Status</label>
        <select id="empSalStatus">
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Decline">Decline</option>
        </select>
      </div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="empCloseSal()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="empSaveSal()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>


  <!-- EMPLOYEE: Reimburse Add/Edit Modal -->
  <div class="inc-modal-overlay" id="empRmbModal">
    <div class="inc-modal-box" style="max-width:440px;">
      <h3 id="empRmbModalTitle" style="color:#1e3a6e;"><i class="ri-refund-2-line"></i> Add Reimbursement</h3>
      <input type="hidden" id="empRmbEditId">
      <div class="inc-fg"><label>Employee Name</label>
        <input type="text" id="empRmbFName" placeholder="e.g. Arianne Mendiola">
      </div>
      <div class="inc-fg"><label>Role / Position</label>
        <input type="text" id="empRmbFRole" placeholder="e.g. NOC">
      </div>
      <div class="inc-fg"><label>Date</label>
        <input type="date" id="empRmbFDate">
      </div>
      <div class="inc-fg"><label>Description</label>
        <input type="text" id="empRmbFDesc" placeholder="e.g. Grab fare">
      </div>
      <div class="inc-fg"><label>Amount (&#8369;)</label>
        <input type="number" id="empRmbFAmount" placeholder="e.g. 500" min="0.01" step="0.01">
      </div>
      <div class="inc-fg"><label>Status</label>
        <select id="empRmbFStatus">
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Done">Done</option>
          <option value="Decline">Decline</option>
        </select>
      </div>
      <div class="inc-fg"><label>Comments <span style="color:#9ca3af;font-weight:400;">(optional)</span></label>
        <textarea id="empRmbFComment" rows="2" placeholder="Optional remark..."
          style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid #d1d5db;font-size:14px;resize:vertical;font-family:inherit;outline:none;"></textarea>
      </div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="empCloseRmb()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="empSaveRmb()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- EMPLOYEE: Budget Request Add/Edit Modal -->
  <div class="inc-modal-overlay" id="empBdgModal">
    <div class="inc-modal-box" style="max-width:440px;">
      <h3 id="empBdgModalTitle" style="color:#1e3a6e;"><i class="ri-wallet-3-line"></i> Add Budget Request</h3>
      <input type="hidden" id="empBdgEditId">
      <div class="inc-fg"><label>Employee Name</label>
        <input type="text" id="empBdgFName" placeholder="e.g. Arianne Mendiola">
      </div>
      <div class="inc-fg"><label>Role / Position</label>
        <input type="text" id="empBdgFRole" placeholder="e.g. NOC">
      </div>
      <div class="inc-fg"><label>Date</label>
        <input type="date" id="empBdgFDate">
      </div>
      <div class="inc-fg"><label>Description</label>
        <input type="text" id="empBdgFDesc" placeholder="e.g. Bond paper">
      </div>
      <div class="inc-fg"><label>Amount (&#8369;)</label>
        <input type="number" id="empBdgFAmount" placeholder="e.g. 500" min="0.01" step="0.01">
      </div>
      <div class="inc-fg"><label>Status</label>
        <select id="empBdgFStatus">
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Done">Done</option>
          <option value="Decline">Decline</option>
        </select>
      </div>
      <div class="inc-fg"><label>Comments <span style="color:#9ca3af;font-weight:400;">(optional)</span></label>
        <textarea id="empBdgFComment" rows="2" placeholder="Optional remark..."
          style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid #d1d5db;font-size:14px;resize:vertical;font-family:inherit;outline:none;"></textarea>
      </div>
      <div class="inc-mbtns">
        <button class="inc-mbtn" onclick="empCloseRmbBdg()"><i class="ri-close-line"></i> Cancel</button>
        <button class="inc-mbtn inc-mbtn-save" onclick="empSaveBdg()"><i class="ri-save-line"></i> Save</button>
      </div>
    </div>
  </div>

`;
  document.body.insertAdjacentHTML("beforeend", extraModals);

})();
/* exp-kpi-amber is now defined in the CSS file */

/* ================= FINANCE LOADER OVERRIDES ================= */
(function installFinanceStandaloneLoaders() {
  const wrap = (fn) => async function financeStandaloneWrappedLoader(...args) {
    await financeStandaloneEnsureCharts().catch(() => {});
    return fn(...args);
  };

  window.loadFinanceDashboard = wrap(loadDashboard);
  window.loadFinanceCompanyIncome = wrap(loadCompanyIncome);
  window.loadFinanceCompanyExpenses = wrap(loadCompanyExpenses);
  window.loadFinanceEmployeeCenter = wrap(loadEmployee);
  window.loadFinanceReportV2 = wrap(loadFinancialReport);
  window.loadFinanceInventory = wrap(loadFinanceInventory);
  window.loadFinanceSettings = async function loadFinanceSharedSettings() {
    if (typeof loadSettings !== "function") {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-shared-settings="noc"]');
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "/modules/noc/noc-dashboard.js";
        script.defer = true;
        script.dataset.sharedSettings = "noc";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Unable to load shared Settings module."));
        document.head.appendChild(script);
      });
    }
    if (typeof loadSettings !== "function") throw new Error("Shared Settings module is unavailable.");
    return loadSettings();
  };
  window.loadFinanceLedger = wrap((sectionKey) => {
    if (sectionKey === "project_expenses") return loadProjectExpenses();
    if (sectionKey === "collections") return loadCollections();
    return loadDashboard();
  });

  window.FINANCE_PAGE_DEFS = {
    financeDashboard: { label: "Dashboard", icon: "ri-dashboard-line", loader: () => window.loadFinanceDashboard() },
    companyIncome: { label: "Company Income", icon: "ri-line-chart-line", loader: () => window.loadFinanceCompanyIncome() },
    companyExpenses: { label: "Company Expenses", icon: "ri-shopping-cart-line", loader: () => window.loadFinanceCompanyExpenses() },
    projectExpenses: { label: "Project Expenses", icon: "ri-file-list-3-line", loader: () => window.loadFinanceLedger("project_expenses") },
    collections: { label: "Collections", icon: "ri-hand-coin-line", loader: () => window.loadFinanceLedger("collections") },
    inventory: { label: "Inventory", icon: "ri-archive-2-line", loader: () => window.loadFinanceInventory() },
    files: { label: "Files", icon: "ri-file-line", loader: () => window.loadFinanceFiles() },
    employee: { label: "Employee", icon: "ri-user-line", loader: () => window.loadFinanceEmployeeCenter() },
    financialReport: { label: "Financial Report", icon: "ri-bar-chart-2-line", loader: () => window.loadFinanceReportV2() },
    settings: { label: "Settings", icon: "ri-settings-3-line", loader: () => window.loadFinanceSettings() },
    logout: { label: "Log Out", icon: "ri-logout-circle-r-line", loader: () => showLogoutModal() }
  };
  window.FINANCE_SIDEBAR_SECTIONS = [
    { label: "Main", pages: ["financeDashboard"] },
    { label: "Finance", pages: ["companyIncome", "companyExpenses", "projectExpenses", "collections"] },
    { label: "Management", pages: ["inventory", "files", "employee", "financialReport"] },
    { label: "System", pages: ["settings", "logout"] }
  ];
  window.FINANCE_START_PAGE = window.location.pathname === "/settings" ? "settings" : window.location.pathname === "/finance/files" ? "files" : window.location.pathname === "/finance/inventory" ? "inventory" : "financeDashboard";
})();