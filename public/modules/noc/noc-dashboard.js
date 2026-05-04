/* ================= NOC MODULE ================= */

/* ================= SETTINGS: IN-APP MESSAGING STATE ================= */
let stgMessageFolder = 'inbox'; // kept for backward compatibility
let stgMessages = [];
let stgUsers = [];
let stgConversations = [];
let stgSelectedConversationId = null;
let stgChatSearch = '';
let stgSelectedMessage = null; // kept for backward compatibility
let stgMessagingView = 'chat'; // chat only
let stgReplyToMessage = null;  // kept for backward compatibility
let stgRequestFilter = null;   // set when jumping to messaging from My Requests

/* ================= UNIFIED THREAD INBOX STATE ================= */
let utThreads = [];
let utSelectedThreadId = null;
let utSelectedThread = null;
let utFilter = 'messages';   // messages | requests (matches utFolder)
let utStatusFilter = 'all';  // all | pending | approved | rejected
let utSearch = '';
let utView = 'list';         // list | thread | compose
let utFolder = 'inbox';      // inbox | sent | drafts | starred
let utDrafts = [];           // locally stored drafts [{id, recipient_id, subject, body, created_at}]
let utStarred = new Set(JSON.parse(localStorage.getItem('ut_starred') || '[]')); // starred thread_ids
let utTypingState = { isTyping: false, typingUserId: null };
let utPresenceByUser = {};
let utRealtimeTimer = null;
let utPresenceTimer = null;
let utTypingIdleTimer = null;
let utLastTypingEmitAt = 0;
let utNotificationTimer = null;
let utKnownMessageIds = new Set();
let utMessageNotificationAudio = null;
let utNotificationAudioUnlocked = false;
let utGroupPhotoDataUrl = '';
let utPendingGroupMemberIds = new Set();
let utAttachmentRegistry = new Map();
let lettersUploadQueue = [];

/* ================= INVENTORY STATE ================= */
let invItems = [];
let invSummary = null;
let invActiveTab = 'overview';
let invSearch = '';
let invStatusFilter = 'all';
let invDateFrom = '';
let invDateTo = '';
let invEditingItem = null;
let invStatusChart = null;
let invDistributionChart = null;
let invModule = 'noc';

/* ================= INVENTORY ================= */

const INV_STATUSES = ['In Stock', 'Deployed', 'For Repair', 'Returned', 'Condemned', 'Missing'];
const INV_CATEGORIES = ['Network Cables', 'Router', 'Access Point Devices', 'Network Switches', 'Modem', 'Power Supply', 'Tools', 'Other'];
const INV_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged'];
let chartLoaderPromise = null;

function ensureChartsLoaded() {
  if (window.Chart) return Promise.resolve();
  if (chartLoaderPromise) return chartLoaderPromise;
  chartLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load charts."));
    document.head.appendChild(script);
  });
  return chartLoaderPromise;
}

function inventoryApiBase() {
  return '/api/inventory';
}

function inventoryFetchOptions(options = {}) {
  return options;
}

function loadInventory() {
  invModule = 'noc';
  invEditingItem = null;
  const title = 'Inventory';
  mainContent.innerHTML = `
    <div class="inventory-page">
      <div class="inventory-header">
        <div>
          <h2>${title}</h2>
        </div>
        <div class="inventory-search">
          <i class="ri-search-line"></i>
          <input id="invSearchInput" type="text" placeholder="Search inventory..." value="${escHtml(invSearch)}">
        </div>
      </div>

      <div class="inventory-tabs">
        <button class="inventory-tab ${invActiveTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
        <button class="inventory-tab ${invActiveTab === 'items' ? 'active' : ''}" data-tab="items">Inventory Items</button>
      </div>

      <div id="inventoryBody">
        <div class="inventory-loading"><i class="ri-loader-4-line spin"></i> Loading inventory...</div>
      </div>
    </div>
  `;

  document.querySelectorAll('.inventory-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      invActiveTab = btn.dataset.tab;
      invEditingItem = null;
      renderInventory();
    });
  });

  let searchTimer;
  document.getElementById('invSearchInput')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      invSearch = e.target.value.trim();
      loadInventoryData();
    }, 220);
  });

  loadInventoryData();
}

async function loadInventoryData() {
  const params = new URLSearchParams();
  if (invSearch) params.set('q', invSearch);
  if (invStatusFilter && invStatusFilter !== 'all') params.set('status', invStatusFilter);
  if (invDateFrom) params.set('date_from', invDateFrom);
  if (invDateTo) params.set('date_to', invDateTo);

  try {
    const [itemsRes, summaryRes] = await Promise.all([
      fetch(`${inventoryApiBase()}/items?${params.toString()}`, inventoryFetchOptions()),
      fetch(`${inventoryApiBase()}/summary`, inventoryFetchOptions())
    ]);
    const items = await itemsRes.json().catch(() => []);
    const summary = await summaryRes.json().catch(() => ({}));
    if (!itemsRes.ok) throw new Error(items.error || 'Failed to load inventory items');
    if (!summaryRes.ok) throw new Error(summary.error || 'Failed to load inventory summary');
    invItems = Array.isArray(items) ? items : [];
    invSummary = summary || {};
    renderInventory();
  } catch (err) {
    const body = document.getElementById('inventoryBody');
    if (body) body.innerHTML = `<div class="inventory-empty"><i class="ri-error-warning-line"></i><span>${escHtml(err.message || 'Inventory failed to load.')}</span></div>`;
  }
}

function renderInventory() {
  const body = document.getElementById('inventoryBody');
  if (!body) return;
  body.innerHTML = invActiveTab === 'overview' ? inventoryOverviewHTML() : inventoryItemsHTML();
  if (invActiveTab === 'overview') {
    renderInventoryCharts();
  } else {
    bindInventoryItemsEvents();
  }
}

function getInventoryStatusCount(status) {
  const rows = invSummary?.byStatus || [];
  const found = rows.find(r => String(r.status || '').toLowerCase() === status.toLowerCase());
  return found ? Number(found.count || 0) : 0;
}

function inventoryOverviewHTML() {
  const cards = [
    { label: 'Total Items', value: invSummary?.totalItems || 0, icon: 'ri-stack-line', cls: 'blue' },
    { label: 'Deployed', value: getInventoryStatusCount('Deployed'), icon: 'ri-send-plane-line', cls: 'green' },
    { label: 'In Stock', value: getInventoryStatusCount('In Stock'), icon: 'ri-archive-line', cls: 'cyan' },
    { label: 'For Repair', value: getInventoryStatusCount('For Repair'), icon: 'ri-tools-line', cls: 'amber' },
    { label: 'Missing', value: getInventoryStatusCount('Missing'), icon: 'ri-error-warning-line', cls: 'red' }
  ];
  const activities = invSummary?.recentActivities || [];
  return `
    <div class="inventory-summary-grid">
      ${cards.map(c => `
        <div class="inventory-stat-card ${c.cls}">
          <div class="inventory-stat-icon"><i class="${c.icon}"></i></div>
          <div>
            <strong>${Number(c.value || 0).toLocaleString()}</strong>
            <span>${escHtml(c.label)}</span>
          </div>
        </div>`).join('')}
    </div>

    <div class="inventory-charts-grid">
      <div class="inventory-card">
        <div class="inventory-card-head">
          <h3>Inventory Status</h3>
          <span>Current item lifecycle</span>
        </div>
        <div class="inventory-chart-wrap"><canvas id="invStatusChart"></canvas></div>
      </div>
      <div class="inventory-card">
        <div class="inventory-card-head">
          <h3>Inventory Distribution</h3>
          <span>Items by category</span>
        </div>
        <div class="inventory-chart-wrap"><canvas id="invDistributionChart"></canvas></div>
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
                <td>${d ? escHtml(d.toLocaleDateString()) : '&mdash;'}</td>
                <td>${d ? escHtml(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '&mdash;'}</td>
                <td>${escHtml(a.item_label || 'Item')}</td>
                <td><span class="inventory-action-pill">${escHtml(a.action || 'Updated')}</span></td>
                <td>${escHtml(a.site || '—')}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="5" class="inventory-empty-cell">No recent activities yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
async function renderInventoryCharts() {
  try {
    await ensureChartsLoaded();
  } catch (err) {
    document.querySelectorAll('.inventory-chart-wrap').forEach(wrap => {
      wrap.innerHTML = `<div class="inventory-empty small">${escHtml(err.message || 'Charts unavailable.')}</div>`;
    });
    return;
  }

  const isDark = document.body.classList.contains('dark');
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)';
  const statusLabels = ['In Stock', 'Deployed', 'For Repair', 'Returned', 'Condemned', 'Missing'];
  const statusData = statusLabels.map(getInventoryStatusCount);
  const statusCanvas = document.getElementById('invStatusChart');
  const distCanvas = document.getElementById('invDistributionChart');

  if (statusCanvas) {
    if (invStatusChart) { try { invStatusChart.destroy(); } catch {} }
    invStatusChart = new Chart(statusCanvas, {
      type: 'bar',
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusData,
          backgroundColor: ['#60a5fa', '#2563eb', '#f59e0b', '#10b981', '#64748b', '#ef4444'],
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
    if (invDistributionChart) { try { invDistributionChart.destroy(); } catch {} }
    const rows = invSummary?.byCategory?.length ? invSummary.byCategory : [
      { category: 'Network Cables', count: 0 },
      { category: 'Router', count: 0 },
      { category: 'Access Point Devices', count: 0 },
      { category: 'Network Switches', count: 0 }
    ];
    invDistributionChart = new Chart(distCanvas, {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r.category),
        datasets: [{
          data: rows.map(r => Number(r.count || 0)),
          backgroundColor: ['#2563eb', '#60a5fa', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b'],
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

function inventoryItemsHTML() {
  return `
    <div class="inventory-items-toolbar">
      <div class="inventory-filter-group">
        <button class="inventory-outline-btn" id="invFilterBtn"><i class="ri-filter-3-line"></i> Filter</button>
        <select id="invStatusFilter" class="inventory-filter-select">
          <option value="all">All Status</option>
          ${INV_STATUSES.map(s => `<option value="${escHtml(s)}" ${invStatusFilter === s ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}
        </select>
        <span class="inventory-outline-btn inventory-date-label"><i class="ri-calendar-event-line"></i> Custom Date</span>
        <label class="inventory-date-filter"><i class="ri-calendar-line"></i><input id="invDateFrom" type="date" value="${escHtml(invDateFrom)}"></label>
        <label class="inventory-date-filter"><input id="invDateTo" type="date" value="${escHtml(invDateTo)}"></label>
      </div>
      <button class="inventory-add-btn" id="invAddBtn"><i class="ri-add-line"></i> Add</button>
    </div>
    <div id="inventoryFormHost">${invEditingItem ? inventoryFormHTML(invEditingItem) : ''}</div>
    <div class="inventory-card">
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead><tr><th>Date</th><th>Serial No</th><th>Category</th><th>Brand</th><th>Status</th><th>Site</th><th>Actions</th></tr></thead>
          <tbody>
            ${invItems.length ? invItems.map(item => `
              <tr>
                <td>${formatInventoryDate(item.date_received || item.created_at)}</td>
                <td><strong>${escHtml(item.serial_no || '—')}</strong><small>${escHtml(item.item_code || '')}</small></td>
                <td>${escHtml(item.category || '—')}</td>
                <td>${escHtml(item.brand || '—')}</td>
                <td>${inventoryStatusBadge(item.status)}</td>
                <td>${escHtml(item.site_name || item.site_id || '—')}</td>
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
function inventoryFormHTML(item = {}) {
  const isEdit = Boolean(item.id);
  const input = (name, label, type = 'text', extra = '') => `
    <label class="inventory-field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escHtml(formatInventoryInputValue(item[name], type))}" ${extra}>
    </label>`;
  const select = (name, label, options) => `
    <label class="inventory-field">
      <span>${label}</span>
      <select name="${name}">
        ${options.map(opt => `<option value="${escHtml(opt)}" ${String(item[name] || '') === opt ? 'selected' : ''}>${escHtml(opt)}</option>`).join('')}
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
            ${select('category', 'Category', INV_CATEGORIES)}
            ${input('item_code', 'Item Code / Secondary Number')}
            ${input('brand', 'Brand')}
            ${input('model', 'Model')}
            <label class="inventory-field full"><span>Description</span><textarea name="description">${escHtml(item.description || '')}</textarea></label>
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
            ${select('condition', 'Condition', INV_CONDITIONS)}
            ${select('status', 'Status', INV_STATUSES)}
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

function bindInventoryItemsEvents() {
  document.getElementById('invAddBtn')?.addEventListener('click', () => {
    invEditingItem = {
      category: INV_CATEGORIES[0],
      condition: 'Good',
      status: 'In Stock'
    };
    renderInventory();
    document.getElementById('inventoryItemForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('invCancelFormBtn')?.addEventListener('click', () => {
    invEditingItem = null;
    renderInventory();
  });
  document.getElementById('invStatusFilter')?.addEventListener('change', e => {
    invStatusFilter = e.target.value;
    loadInventoryData();
  });
  document.getElementById('invDateFrom')?.addEventListener('change', e => {
    invDateFrom = e.target.value;
    loadInventoryData();
  });
  document.getElementById('invDateTo')?.addEventListener('change', e => {
    invDateTo = e.target.value;
    loadInventoryData();
  });
  document.getElementById('invFilterBtn')?.addEventListener('click', () => {
    invStatusFilter = 'all';
    invDateFrom = '';
    invDateTo = '';
    loadInventoryData();
  });
  document.querySelectorAll('.inventory-icon-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      invEditingItem = invItems.find(item => String(item.id) === String(btn.dataset.id)) || null;
      renderInventory();
      document.getElementById('inventoryItemForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.querySelectorAll('.inventory-icon-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteInventoryItem(btn.dataset.id));
  });
  document.getElementById('inventoryItemForm')?.addEventListener('submit', saveInventoryItem);
}

async function saveInventoryItem(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('.inventory-save-btn');
  const id = form.dataset.id;
  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());
  payload.created_by = user?.id || null;
  payload.actor_name = user?.full_name || user?.email || 'User';
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving';
  try {
    const res = await fetch(id ? `${inventoryApiBase()}/items/${id}` : `${inventoryApiBase()}/items`, inventoryFetchOptions({
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save inventory item');
    showToast(id ? 'Inventory item updated.' : 'Inventory item added.', 'success');
    invEditingItem = null;
    await loadInventoryData();
  } catch (err) {
    showToast(err.message || 'Failed to save inventory item.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-save-3-line"></i> Save';
  }
}

async function deleteInventoryItem(id) {
  const item = invItems.find(row => String(row.id) === String(id));
  if (!confirm(`Delete ${item?.serial_no || 'this inventory item'}?`)) return;
  try {
    const actor = encodeURIComponent(user?.full_name || user?.email || 'User');
    const res = await fetch(`${inventoryApiBase()}/items/${id}?actor=${actor}`, inventoryFetchOptions({ method: 'DELETE' }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete inventory item');
    showToast('Inventory item deleted.', 'success');
    await loadInventoryData();
  } catch (err) {
    showToast(err.message || 'Delete failed.', 'error');
  }
}

function inventoryStatusBadge(status = 'In Stock') {
  const key = String(status || 'In Stock').toLowerCase().replace(/\s+/g, '-');
  return `<span class="inventory-status-badge ${key}">${escHtml(status || 'In Stock')}</span>`;
}

function formatInventoryDate(value) {
  if (!value) return '&mdash;';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escHtml(String(value));
  return escHtml(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
}

function formatInventoryInputValue(value, type) {
  if (!value) return '';
  if (type === 'date') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return value;
}


/* ================= REPORTS ================= */

// ── State ──────────────────────────────────────────────────────────────────
let expandedReportId  = null;
let allReportData     = [];
let rptCurrentProject = null;
let rptAllProjects    = [];

const RPT_DEFAULT_COLUMNS = [
  { key: 'mir',    label: 'MIR',    enabled: true },
  { key: 'ticket', label: 'Ticket', enabled: true },
  { key: 'sla',    label: 'SLA',    enabled: true },
];

// ── Helpers ────────────────────────────────────────────────────────────────

// Read a column value — checks top-level row first, then extra_data JSONB
function rptColValue(row, key) {
  if (row[key] != null && row[key] !== '') return row[key];
  if (row.extra_data && typeof row.extra_data === 'object' && row.extra_data[key] != null) {
    return row.extra_data[key];
  }
  // extra_data may be a JSON string
  if (typeof row.extra_data === 'string') {
    try {
      const parsed = JSON.parse(row.extra_data);
      if (parsed && parsed[key] != null) return parsed[key];
    } catch {}
  }
  return null;
}

function getProjectColumns(project) {
  const src = project || rptCurrentProject;
  let cols = src?.columns;
  // columns may arrive as a JSON string from postgres
  if (typeof cols === 'string') { try { cols = JSON.parse(cols); } catch { cols = null; } }
  if (!Array.isArray(cols) || !cols.length) cols = RPT_DEFAULT_COLUMNS.map(c => ({ ...c }));
  return cols.filter(c => c.enabled !== false);
}

// ── Entry point ────────────────────────────────────────────────────────────
function loadReports() {
  expandedReportId  = null;
  allReportData     = [];
  rptCurrentProject = null;

  mainContent.innerHTML = `
    <div class="rpt-page" id="rptPage">

      <!-- TOP BAR -->
      <div class="rpt-topbar">
        <h2 class="rpt-title"><i class="ri-bar-chart-2-line"></i> Reports</h2>
        <div class="rpt-topbar-right">
          <div class="rpt-search-box">
            <i class="ri-search-line"></i>
            <input type="text" id="rptSearch" placeholder="Search region…">
          </div>
          <button class="rpt-center-btn" id="rptExportBtn">
            <i class="ri-file-chart-line"></i> Progress Report
          </button>
          <button class="rpt-add-btn" id="rptAddProjectBtn">
            <i class="ri-add-line"></i> New Project
          </button>
        </div>
      </div>

      <!-- DATE BAR -->
      <div class="rpt-date-bar">
        <i class="ri-calendar-2-line"></i>
        <span id="rptDateBarLabel">Loading…</span>
      </div>

      <!-- PROJECT SELECTOR -->
      <div class="rpt-project-shell" id="rptProjectShell">
        <div class="rpt-project-selector-wrap" id="rptProjectSelectorWrap">
          <div class="rpt-proj-select-group">
            <i class="ri-folder-chart-line rpt-proj-select-icon"></i>
            <select class="rpt-proj-dropdown" id="rptProjectDropdown">
              <option value="">Loading projects…</option>
            </select>
            <i class="ri-arrow-down-s-line rpt-proj-select-arrow"></i>
          </div>
        </div>
        <div class="rpt-project-actions" id="rptProjectActions" style="display:none;">
          <button class="rpt-col-config-btn" id="rptColConfigBtn">
            <i class="ri-settings-3-line"></i> Columns
          </button>
          <button class="rpt-proj-edit-btn" id="rptProjEditBtn" title="Edit project">
            <i class="ri-edit-line"></i>
          </button>
          <button class="rpt-proj-delete-btn" id="rptProjDeleteBtn" title="Delete project">
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
      </div>

      <!-- TABLE CARD -->
      <div class="rpt-card hidden" id="rptTableCard">
        <div class="rpt-card-toolbar">
          <div class="rpt-card-toolbar-left">
            <i class="ri-map-2-line" style="color:#2f4b85;font-size:16px;"></i>
            <span class="rpt-card-title" id="rptCardTitle">—</span>
            <span class="rpt-region-count" id="rptRegionCount"></span>
          </div>
          <button class="rpt-add-region-btn" id="rptAddRegionBtn">
            <i class="ri-add-line"></i> Add Region
          </button>
        </div>
        <div class="rpt-table-wrap">
          <table class="rpt-table" id="rptTable">
            <thead><tr class="rpt-thead-row" id="rptThead"></tr></thead>
            <tbody id="rptTbody">
              <tr><td colspan="8" class="rpt-empty-cell">
                <i class="ri-loader-4-line spin"></i> Loading…
              </td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- EMPTY STATE -->
      <div class="rpt-empty-projects hidden" id="rptEmptyProjects">
        <div class="rpt-empty-icon"><i class="ri-folder-chart-line"></i></div>
        <h3>No projects yet</h3>
        <p>Create your first report project to start tracking regional progress.</p>
        <button class="rpt-add-btn" id="rptEmptyNewBtn">
          <i class="ri-add-line"></i> Create First Project
        </button>
      </div>

    </div>
  `;

  // Date bar
  (() => {
    const now   = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fmt   = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const el    = document.getElementById('rptDateBarLabel');
    if (el) el.textContent = fmt(first) + ' – ' + fmt(last);
  })();

  document.getElementById('rptSearch').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderReportRows(allReportData.filter(r => (r.region || '').toLowerCase().includes(q)));
  });

  document.getElementById('rptAddProjectBtn').addEventListener('click', () => openProjectModal());
  document.getElementById('rptEmptyNewBtn')?.addEventListener('click', () => openProjectModal());

  document.getElementById('rptColConfigBtn').addEventListener('click', () => {
    if (rptCurrentProject) openProjectModal(rptCurrentProject);
  });
  document.getElementById('rptProjEditBtn').addEventListener('click', () => {
    if (rptCurrentProject) openProjectModal(rptCurrentProject);
  });
  document.getElementById('rptProjDeleteBtn').addEventListener('click', () => {
  if (!rptCurrentProject) return;

  showConfirmDeleteModal(1, async () => {
    try {
      const res = await fetch(`/api/reports/projects/${rptCurrentProject.id}`, {
        method: 'DELETE'
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast('Delete failed: ' + (result.error || 'Unknown'), 'error');
        return;
      }

      rptCurrentProject = null;
      await fetchProjects();
      showToast('Project deleted.', 'success');
    } catch (err) {
      showToast('Network error.', 'error');
    }
  });
});

  fetchProjects();
}

// ── Projects ───────────────────────────────────────────────────────────────
async function fetchProjects() {
  try {
    const res  = await fetch('/api/reports/projects');
    const data = await res.json();
    rptAllProjects = data;
    renderProjectTabs(data);
  } catch {
    const tabs = document.getElementById('rptProjectTabs');
    if (tabs) tabs.innerHTML = `<span style="color:#ef4444;font-size:13px;">
      <i class="ri-error-warning-line"></i> Failed to load projects</span>`;
  }
}

function renderProjectTabs(projects) {
  const dropdown = document.getElementById('rptProjectDropdown');
  const empty    = document.getElementById('rptEmptyProjects');
  const card     = document.getElementById('rptTableCard');
  const actions  = document.getElementById('rptProjectActions');
  if (!dropdown) return;

  if (!projects.length) {
    dropdown.innerHTML = '<option value="">No projects yet\u2026</option>';
    empty.classList.remove('hidden');
    card.classList.add('hidden');
    actions.style.display = 'none';
    return;
  }

  // Hide empty state when we have projects
  empty.classList.add('hidden');

  const toSelect = rptCurrentProject
    ? (rptAllProjects.find(p => p.id === rptCurrentProject.id) || projects[0])
    : projects[0];

  dropdown.innerHTML = projects.map(p =>
    `<option value="${p.id}" ${toSelect?.id === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
  ).join('');

  // Remove old listener before adding new one
  const newDropdown = dropdown.cloneNode(true);
  dropdown.parentNode.replaceChild(newDropdown, dropdown);
  newDropdown.addEventListener('change', function() {
    const selected = rptAllProjects.find(p => p.id === parseInt(this.value));
    if (selected) selectProject(selected);
  });

  selectProject(toSelect);
}

function selectProject(project) {
  if (!project) return;
  rptCurrentProject = project;
  expandedReportId  = null;
  allReportData     = [];

  // Sync dropdown selection
  const dropdown = document.getElementById('rptProjectDropdown');
  if (dropdown) dropdown.value = String(project.id);

  document.getElementById('rptTableCard').classList.remove('hidden');
  document.getElementById('rptEmptyProjects').classList.add('hidden');
  document.getElementById('rptProjectActions').style.display = 'flex';

  const titleEl = document.getElementById('rptCardTitle');
  if (titleEl) titleEl.textContent = project.name;

  renderReportHeader(project);

  // Re-bind Add Region (clone to remove old listeners)
  const addBtn = document.getElementById('rptAddRegionBtn');
  if (addBtn) {
    const newBtn = addBtn.cloneNode(true);
    addBtn.replaceWith(newBtn);
    newBtn.addEventListener('click', () => openRegionModal(null, project));
  }

  fetchReports(project.id);
}

function renderReportHeader(project) {
  const thead = document.getElementById('rptThead');
  if (!thead) return;
  const cols = getProjectColumns(project);
  thead.innerHTML = `
    <th class="rpt-th-region">Region</th>
    <th class="rpt-th-deadline">Deadline</th>
    ${cols.map(c => `<th>${escHtml(c.label)}</th>`).join('')}
    <th class="rpt-th-progress">Progress</th>
  `;
}

// ── Fetch & Render ─────────────────────────────────────────────────────────
async function fetchReports(projectId) {
  const tbody = document.getElementById('rptTbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="rpt-empty-cell">
    <i class="ri-loader-4-line spin"></i> Loading…
  </td></tr>`;

  try {
    const url  = projectId ? `/api/reports?project_id=${projectId}` : '/api/reports';
    const res  = await fetch(url);
    const data = await res.json();
    allReportData = data;

    // Update count badge
    const countEl = document.getElementById('rptRegionCount');
    if (countEl) countEl.textContent = data.length ? `${data.length} region${data.length !== 1 ? 's' : ''}` : '';

    renderReportRows(data);
  } catch {
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="rpt-empty-cell">
      <i class="ri-error-warning-line"></i> Failed to load reports
    </td></tr>`;
  }
}

function rptBar(pct) {
  const v = parseFloat(pct) || 0;
  const c = v >= 80 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
  return `
    <div class="rpt-bar-wrap">
      <div class="rpt-bar-track">
        <div class="rpt-bar-fill" style="width:${Math.min(v,100)}%;background:${c};"></div>
      </div>
      <span class="rpt-bar-pct" style="color:${c};">${v}%</span>
    </div>`;
}

function rptCircle(pct) {
  const v    = Math.min(100, parseFloat(pct) || 0);
  const c    = v >= 80 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
  const R    = 22;
  const circ = 2 * Math.PI * R;
  const dash = v >= 100 ? circ : (v / 100) * circ;
  const gap  = v >= 100 ? 0 : circ - dash;
  return `
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="#e5e7eb" stroke-width="5"/>
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="${c}" stroke-width="5"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
        stroke-linecap="butt"/>
      <text x="28" y="33" text-anchor="middle" font-size="10.5" font-weight="700" fill="${c}">${Math.round(v)}%</text>
    </svg>`;
}

function renderReportRows(data) {
  const tbody = document.getElementById('rptTbody');
  if (!tbody) return;

  const project = rptCurrentProject;
  const cols    = getProjectColumns(project);
  const colSpan = 2 + cols.length + 1;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="rpt-empty-cell">
      <i class="ri-inbox-line"></i>
      No regions yet — click <strong>Add Region</strong> to get started.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  data.forEach(row => {
    const isExpanded = expandedReportId === row.id;

    // Compute values for enabled columns using rptColValue (handles extra_data)
    const colValues = cols.map(c => parseFloat(rptColValue(row, c.key) ?? 0));
    const enabledCount = colValues.filter((_, i) => rptColValue(row, cols[i].key) != null).length;
    const progress = parseFloat(row.progress ??
      (enabledCount > 0 ? colValues.reduce((a, b) => a + b, 0) / colValues.length : 0));

    // Deadline cell
    const deadlineCell = (() => {
      if (!row.date_start && !row.date_end) return '<span class="rpt-no-val">—</span>';
      const fmt   = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '?';
      const dEnd  = row.date_end ? new Date(row.date_end) : null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (dEnd) dEnd.setHours(0, 0, 0, 0);
      const range = fmt(row.date_start) + ' – ' + fmt(row.date_end);
      if (dEnd && dEnd < today)
        return `<span class="rpt-deadline-overdue"><i class="ri-error-warning-line"></i> ${range}</span>`;
      if (dEnd && dEnd.getTime() === today.getTime())
        return `<span class="rpt-deadline-today"><i class="ri-alarm-line"></i> ${range}</span>`;
      return `<span class="rpt-deadline-ok"><i class="ri-calendar-check-line"></i> ${range}</span>`;
    })();

    const tr = document.createElement('tr');
    tr.className = 'rpt-row' + (isExpanded ? ' rpt-row-open' : '');
    tr.dataset.id = row.id;
    tr.innerHTML = `
      <td><span class="rpt-region-badge">${escHtml(row.region || '—')}</span></td>
      <td class="rpt-deadline-cell">${deadlineCell}</td>
      ${cols.map(c => {
        const val = rptColValue(row, c.key);
        return `<td>${rptBar(parseFloat(val ?? 0))}</td>`;
      }).join('')}
      <td>
        <div class="rpt-progress-cell">
          ${rptCircle(progress)}
          <button class="rpt-expand-btn ${isExpanded ? 'expanded' : ''}" data-id="${row.id}">
            <i class="ri-arrow-down-s-line"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // Expand row
    const expandTr = document.createElement('tr');
    expandTr.className = 'rpt-expand-row' + (isExpanded ? ' open' : '');
    expandTr.dataset.id = row.id;
    expandTr.innerHTML = `
      <td colspan="${colSpan}" class="rpt-expand-cell">
        <div class="rpt-panel ${isExpanded ? 'open' : ''}" id="rpt-panel-${row.id}">
          <div class="rpt-panel-header">
            <div class="rpt-panel-title">
              <i class="ri-history-line"></i>
              History — <strong>${escHtml(row.region || '')}</strong>
            </div>
            <div class="rpt-panel-actions">
              <button class="rpt-panel-add-btn" data-report-id="${row.id}" data-region="${escHtml(row.region || '')}">
                <i class="ri-add-line"></i> Add Update
              </button>
              <button class="rpt-edit-report-btn" data-id="${row.id}" title="Edit region">
                <i class="ri-edit-line"></i>
              </button>
              <button class="rpt-del-report-btn" data-id="${row.id}" title="Delete region">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          </div>
          <div class="rpt-rem-table-wrap">
            <table class="rpt-rem-table">
              <thead>
                <tr>
                  <th>Date</th>
                  ${cols.map(c => `<th>${escHtml(c.label)}</th>`).join('')}
                  <th>By</th>
                </tr>
              </thead>
              <tbody id="rpt-rem-tbody-${row.id}">
                <tr><td colspan="${cols.length + 2}" class="rpt-empty-cell">
                  <i class="ri-loader-4-line spin"></i> Loading…
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(expandTr);

    if (isExpanded) fetchReminders(row.id, cols);
  });

  // Expand / collapse
  tbody.querySelectorAll('.rpt-expand-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const id = parseInt(this.dataset.id);
      expandedReportId = (expandedReportId === id) ? null : id;
      const q = document.getElementById('rptSearch')?.value.toLowerCase() || '';
      renderReportRows(allReportData.filter(r => !q || (r.region || '').toLowerCase().includes(q)));
      if (expandedReportId) {
        setTimeout(() => document.querySelector('.rpt-expand-row.open')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
      }
    });
  });

  tbody.querySelectorAll('.rpt-edit-report-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = allReportData.find(r => r.id === parseInt(btn.dataset.id));
      if (row) openRegionModal(row, rptCurrentProject);
    });
  });

tbody.querySelectorAll('.rpt-del-report-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showConfirmDeleteModal(1, async () => {
      try {
        const res = await fetch(`/api/reports/${btn.dataset.id}`, {
          method: 'DELETE'
        });

        const result = await res.json().catch(() => ({}));

        if (!res.ok) {
          showToast('Failed to delete region: ' + (result.error || 'Unknown'), 'error');
          return;
        }

        expandedReportId = null;
        await fetchReports(rptCurrentProject?.id);
        showToast('Region deleted.', 'success');
      } catch (err) {
        showToast('Error deleting region.', 'error');
      }
    });
  });
});

  tbody.querySelectorAll('.rpt-panel-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openReminderModal(parseInt(btn.dataset.reportId), btn.dataset.region, getProjectColumns(rptCurrentProject));
    });
  });
}

// ── History ────────────────────────────────────────────────────────────────
async function fetchReminders(regionId, cols) {
  const tbody = document.getElementById(`rpt-rem-tbody-${regionId}`);
  if (!tbody) return;
  const activeCols = cols || getProjectColumns(rptCurrentProject);
  try {
    const res  = await fetch(`/api/reports/${regionId}/history`);
    const data = await res.json();
    renderReminderRows(regionId, data, activeCols);
  } catch {
    tbody.innerHTML = `<tr><td colspan="${activeCols.length + 2}" class="rpt-empty-cell">
      <i class="ri-error-warning-line"></i> Failed to load
    </td></tr>`;
  }
}

function renderReminderRows(regionId, data, cols) {
  const tbody = document.getElementById(`rpt-rem-tbody-${regionId}`);
  if (!tbody) return;
  const activeCols = cols || getProjectColumns(rptCurrentProject);

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="${activeCols.length + 2}" class="rpt-empty-cell">
      <i class="ri-inbox-line"></i> No updates yet — click <strong>Add Update</strong> to log progress.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((r, idx) => {
    const isLatest = idx === 0;
    const dateStr  = r.date
      ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const byName = r.created_by_name || r.created_by || '<span class="rpt-no-val">—</span>';
    return `
      <tr class="rpt-rem-row ${isLatest ? 'rpt-rem-latest' : ''}">
        <td class="rpt-rem-date">
          ${isLatest ? '<span class="rpt-latest-badge">Latest</span>' : ''}
          ${dateStr}
        </td>
        ${activeCols.map(c => {
          const val = rptColValue(r, c.key);
          const display = val != null ? parseFloat(val).toFixed(1) + '%' : '<span class="rpt-no-val">—</span>';
          return `<td><span class="rpt-rem-val">${display}</span></td>`;
        }).join('')}
        <td class="rpt-rem-by">${byName}</td>
      </tr>
    `;
  }).join('');
}

// ── Project Modal ──────────────────────────────────────────────────────────
function openProjectModal(existing = null) {
  const isEdit = !!existing;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box add-modal-box" style="max-width:500px;">
      <div class="add-modal-header">
        <div class="add-modal-icon"><i class="ri-folder-chart-line"></i></div>
        <div class="add-modal-title">
          <h3>${isEdit ? 'Edit Project' : 'New Project'}</h3>
          <p>${isEdit ? 'Update project name and column configuration.' : 'Create a new report project with custom columns.'}</p>
        </div>
        <button class="modal-close-btn" id="projModalClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="add-modal-body">
        <div class="add-fields-grid" style="grid-template-columns:1fr;">
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-folder-line"></i> Project Name *</label>
            <input type="text" id="proj-f-name" class="add-field-input"
              placeholder="e.g. DICT438 Phase 1" value="${escHtml(existing?.name || '')}">
          </div>
          <div class="add-field-item">
            <label class="add-field-label" style="margin-bottom:10px;">
              <i class="ri-table-line"></i> Report Columns
              <span style="font-weight:400;text-transform:none;font-size:11px;color:#94a3b8;margin-left:6px;">
                Toggle, rename, or add columns
              </span>
            </label>
            <div id="projColsList" class="rpt-cols-config-list">
              ${rptBuildColumnConfigRows(
                (() => {
                  let c = existing?.columns;
                  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
                  return c || RPT_DEFAULT_COLUMNS.map(x => ({ ...x }));
                })()
              )}
            </div>
            <button type="button" class="rpt-add-col-btn" id="projAddColBtn">
              <i class="ri-add-line"></i> Add Column
            </button>
          </div>
        </div>
      </div>
      <div class="add-modal-footer">
        <span class="add-modal-hint"><i class="ri-information-line"></i> Fields marked * are required</span>
        <div class="modal-actions">
          <button class="tool-btn" id="projModalCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="projModalSave">
            <i class="ri-save-line"></i> ${isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('projModalClose').onclick  = close;
  document.getElementById('projModalCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  document.getElementById('projAddColBtn').addEventListener('click', () => {
    const list   = document.getElementById('projColsList');
    const newKey = 'col_' + Date.now();
    const row    = document.createElement('div');
    row.className   = 'rpt-col-config-row';
    row.dataset.key = newKey;
    row.innerHTML   = rptColRowHTML({ key: newKey, label: '', enabled: true });
    list.appendChild(row);
    rptBindColRow(row);
    row.querySelector('.rpt-col-label-input')?.focus();
  });

  m.querySelectorAll('.rpt-col-config-row').forEach(row => rptBindColRow(row));

  document.getElementById('projModalSave').onclick = async () => {
    const name = document.getElementById('proj-f-name').value.trim();
    if (!name) { showToast('Project name is required.', 'error'); return; }

    const columns = [];
    m.querySelectorAll('.rpt-col-config-row').forEach(row => {
      const key   = row.dataset.key;
      const label = row.querySelector('.rpt-col-label-input')?.value.trim() || '';
      const enabled = row.querySelector('.rpt-col-toggle')?.checked !== false;
      if (label) columns.push({ key, label, enabled });
    });

    if (!columns.length) { showToast('Add at least one column.', 'error'); return; }

    const btn = document.getElementById('projModalSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';

    try {
      const url    = isEdit ? `/api/reports/projects/${existing.id}` : '/api/reports/projects';
      const method = isEdit ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, columns })
      });
      const result = await res.json();
      if (!res.ok) { showToast('Save failed: ' + (result.error || 'Unknown'), 'error'); return; }

      // Store columns locally so selectProject has them immediately
      result.columns = columns;
      close();
      await fetchProjects();

      if (isEdit) {
        const updated = rptAllProjects.find(p => p.id === existing.id);
        if (updated) { updated.columns = columns; selectProject(updated); }
      } else {
        const created = rptAllProjects.find(p => p.id === result.id) || result;
        if (created) { created.columns = columns; selectProject(created); }
      }

      showToast(isEdit ? 'Project updated.' : 'Project created.', 'success');
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = `<i class="ri-save-line"></i> ${isEdit ? 'Save Changes' : 'Create Project'}`; }
  };
}

function rptBuildColumnConfigRows(columns) {
  return (columns || RPT_DEFAULT_COLUMNS).map(col =>
    `<div class="rpt-col-config-row" data-key="${escHtml(col.key)}">
      ${rptColRowHTML(col)}
    </div>`
  ).join('');
}

function rptColRowHTML(col) {
  return `
    <label class="rpt-col-toggle-wrap" title="Enable/disable">
      <input type="checkbox" class="rpt-col-toggle" ${col.enabled !== false ? 'checked' : ''}>
      <span class="rpt-col-toggle-track"><span class="rpt-col-toggle-thumb"></span></span>
    </label>
    <input type="text" class="add-field-input rpt-col-label-input"
      placeholder="Column label" value="${escHtml(col.label || '')}"
      style="flex:1;min-width:0;">
    <button type="button" class="rpt-col-remove-btn" title="Remove">
      <i class="ri-delete-bin-line"></i>
    </button>
  `;
}

function rptBindColRow(row) {
  row.querySelector('.rpt-col-remove-btn')?.addEventListener('click', () => row.remove());
}

// ── Region Modal ───────────────────────────────────────────────────────────
function openRegionModal(existing = null, project = null) {
  const isEdit = !!existing;
  const proj   = project || rptCurrentProject;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box add-modal-box" style="max-width:460px;">
      <div class="add-modal-header">
        <div class="add-modal-icon"><i class="ri-map-pin-line"></i></div>
        <div class="add-modal-title">
          <h3>${isEdit ? 'Edit Region' : 'Add Region'}</h3>
          <p>${proj ? escHtml(proj.name) : 'Regional progress entry'}</p>
        </div>
        <button class="modal-close-btn" id="rptRegModalClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="add-modal-body">
        <div class="add-fields-grid" style="grid-template-columns:1fr;">
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-map-pin-line"></i> Region Name *</label>
            <input type="text" id="rpt-f-region" class="add-field-input"
              placeholder="e.g. BENGUET" value="${escHtml(existing?.region || '')}">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-calendar-line"></i> Start Date</label>
            <input type="date" id="rpt-f-date-start" class="add-field-input"
              value="${existing?.date_start ? existing.date_start.split('T')[0] : ''}">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-calendar-check-line"></i> End Date</label>
            <input type="date" id="rpt-f-date-end" class="add-field-input"
              value="${existing?.date_end ? existing.date_end.split('T')[0] : ''}">
          </div>
        </div>
      </div>
      <div class="add-modal-footer">
        <span class="add-modal-hint"><i class="ri-information-line"></i> Fields marked * are required</span>
        <div class="modal-actions">
          <button class="tool-btn" id="rptRegModalCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="rptRegModalSave">
            <i class="ri-save-line"></i> ${isEdit ? 'Save Changes' : 'Add Region'}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('rptRegModalClose').onclick  = close;
  document.getElementById('rptRegModalCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  document.getElementById('rptRegModalSave').onclick = async () => {
    const region = document.getElementById('rpt-f-region').value.trim();
    if (!region) { showToast('Region name is required.', 'error'); return; }
    const payload = {
      region,
      project_id: proj?.id || null,
      date_start: document.getElementById('rpt-f-date-start').value || null,
      date_end:   document.getElementById('rpt-f-date-end').value   || null,
    };
    const btn = document.getElementById('rptRegModalSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const res = await fetch(isEdit ? `/api/reports/${existing.id}` : '/api/reports', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) { showToast('Save failed: ' + (result.error || 'Unknown'), 'error'); return; }
      close();
      await fetchReports(proj?.id);
      showToast(isEdit ? 'Region updated.' : 'Region added.', 'success');
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = `<i class="ri-save-line"></i> ${isEdit ? 'Save Changes' : 'Add Region'}`; }
  };
}

// ── Add Update Modal ───────────────────────────────────────────────────────
function openReminderModal(regionId, region, cols) {
  const activeCols = cols || getProjectColumns(rptCurrentProject);
  const loggedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const fullName   = loggedUser.full_name || loggedUser.name || 'Unknown';
  const userId     = loggedUser.id || null;

  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box add-modal-box" style="max-width:460px;">
      <div class="add-modal-header">
        <div class="add-modal-icon" style="background:rgba(255,255,255,0.15)">
          <i class="ri-history-line"></i>
        </div>
        <div class="add-modal-title">
          <h3>Add Update</h3>
          <p>Region: <strong>${escHtml(region || '')}</strong></p>
        </div>
        <button class="modal-close-btn" id="remModalClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="add-modal-body">
        <div class="add-fields-grid" style="grid-template-columns:1fr 1fr;">
          ${activeCols.map(c => `
            <div class="add-field-item">
              <label class="add-field-label">
                <i class="ri-percent-line"></i> ${escHtml(c.label)}
              </label>
              <input type="number" id="rem-f-${escHtml(c.key)}" class="add-field-input"
                placeholder="0 – 100" min="0" max="100" step="0.01">
            </div>
          `).join('')}
          <div class="add-field-item" style="grid-column:1/-1;">
            <label class="add-field-label"><i class="ri-user-line"></i> Updated By</label>
            <input type="text" class="add-field-input" value="${escHtml(fullName)}" readonly
              style="background:#f8faff;color:#64748b;cursor:default;">
          </div>
        </div>
      </div>
      <div class="add-modal-footer">
        <span class="add-modal-hint"><i class="ri-information-line"></i> Each save creates a new history record</span>
        <div class="modal-actions">
          <button class="tool-btn" id="remModalCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="remModalSave">
            <i class="ri-save-line"></i> Save Update
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('remModalClose').onclick  = close;
  document.getElementById('remModalCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  document.getElementById('remModalSave').onclick = async () => {
    // Separate known cols (mir/ticket/sla) from custom extra cols
    const knownKeys  = ['mir', 'ticket', 'sla'];
    const payload    = { report_id: regionId, created_by: userId };
    const extraData  = {};

    activeCols.forEach(c => {
      const val = document.getElementById(`rem-f-${c.key}`)?.value;
      const num = val !== '' && val != null ? parseFloat(val) : null;
      if (knownKeys.includes(c.key)) {
        payload[c.key] = num;
      } else {
        extraData[c.key] = num;
      }
    });

    // Merge extra_data into payload so server's spread picks it up
    if (Object.keys(extraData).length) {
      Object.assign(payload, extraData);
    }

    const btn = document.getElementById('remModalSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';

    try {
      const res    = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) { showToast('Save failed: ' + (result.error || 'Unknown'), 'error'); return; }
      close();
      fetchReminders(regionId, activeCols);
      await fetchReports(rptCurrentProject?.id);
      showToast('Update saved.', 'success');
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save Update'; }
  };
}




/* ================= MAP ================= */

// ─── Persistent state helpers ──────────────────────────────────────────────
const MAP_STATE_KEY = 'mapPageState';
function saveMapState(state) {
  try { localStorage.setItem(MAP_STATE_KEY, JSON.stringify(state)); } catch {}
}
function loadMapState() {
  try { return JSON.parse(localStorage.getItem(MAP_STATE_KEY) || '{}'); } catch { return {}; }
}

function loadMap() {
  mainContent.innerHTML = `
    <div class="map-page-wrap">

      <!-- TOP FILTER BAR -->
      <div class="map-top-bar">
        <div class="map-search-box" id="mapSearchBox">
          <i class="ri-search-line"></i>
          <input type="text" id="mapSearch" placeholder="Search site, municipality, province…" autocomplete="off">
          <button class="map-search-clear hidden" id="mapSearchClear" title="Clear"><i class="ri-close-line"></i></button>
        </div>
        <select id="mapProjectFilter"  class="map-filter-select"><option value="">All Projects</option></select>
        <select id="mapProvinceFilter" class="map-filter-select"><option value="">All Provinces</option></select>
        <select id="mapStatusFilter"   class="map-filter-select">
          <option value="">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <div class="map-active-filters" id="mapActiveFilters"></div>
        <div class="map-bulk-row" id="mapBulkRow" style="display:none;">
          <button class="map-bulk-btn map-bulk-activate"   id="mapBulkActivate"><i class="ri-checkbox-circle-line"></i> Activate</button>
          <button class="map-bulk-btn map-bulk-deactivate" id="mapBulkDeactivate"><i class="ri-close-circle-line"></i> Deactivate</button>
        </div>
        <button class="map-import-btn" id="mapAddSiteBtn"><i class="ri-add-line"></i> Add Site</button>
        <button class="map-import-btn" id="mapImportBtn"><i class="ri-upload-cloud-2-line"></i> Import Sites</button>
      </div>

      <!-- BODY ROW: SIDEBAR + MAP -->
      <div class="map-body-row">

        <!-- LEFT SIDEBAR -->
        <div class="map-sidebar" id="mapSidebar">
          <div class="map-sidebar-header">
            <div class="map-sidebar-count" id="mapSidebarCount">Showing — sites</div>
            <button class="map-sidebar-toggle-btn" id="mapSidebarCollapseBtn" title="Collapse list">
              <i class="ri-arrow-left-s-line"></i>
            </button>
          </div>
          <div class="map-sidebar-list" id="mapSiteList">
            <div class="map-list-loading"><i class="ri-loader-4-line spin"></i> Loading sites…</div>
          </div>
          <!-- Virtual scroll sentinel -->
          <div id="mapListSentinel" style="height:1px;"></div>
        </div>

        <!-- SIDEBAR EXPAND BUTTON (when collapsed) -->
        <button class="map-sidebar-expand-btn hidden" id="mapSidebarExpandBtn" title="Show site list">
          <i class="ri-list-unordered"></i>
        </button>

        <!-- CENTER: MAP -->
        <div class="map-card-wrap">
          <!-- Stats overlay -->
          <div class="map-stats-overlay">
            <span class="map-stat-chip" id="mapStatTotal"><i class="ri-map-pin-2-line"></i> — Total</span>
            <span class="map-stat-chip active-chip"   id="mapStatActive"><i class="ri-radio-button-fill"></i> — Active</span>
            <span class="map-stat-chip inactive-chip" id="mapStatInactive"><i class="ri-radio-button-line"></i> — Inactive</span>
          </div>

          <!-- Hover preview card -->
          <div class="map-hover-card hidden" id="mapHoverCard">
            <div class="map-hover-name" id="mapHoverName"></div>
            <div class="map-hover-status" id="mapHoverStatus"></div>
            <div class="map-hover-meta" id="mapHoverMeta"></div>
            <div class="map-hover-hint"><i class="ri-cursor-line"></i> Click for details</div>
          </div>

          <div id="mapContainer" class="map-container"></div>
        </div>

        <!-- RIGHT: DETAILS PANEL (overlay) -->
        <div class="map-details-panel hidden" id="mapDetailsPanel">
          <div class="map-details-header">
            <div class="map-details-title-wrap">
              <div class="map-details-name" id="mapDetailsName">—</div>
              <div class="map-details-sub"  id="mapDetailsSub">—</div>
            </div>
            <div class="map-details-header-actions">
              <button class="map-details-edit-btn" id="mapDetailsEditBtn"><i class="ri-edit-line"></i> Edit</button>
              <button class="map-details-close-btn" id="mapDetailsPanelClose"><i class="ri-close-line"></i></button>
            </div>
          </div>
          <div class="map-details-body" id="mapDetailsBody"></div>
        </div>

      </div>
    </div>
  `;

  // Restore persisted state
  const savedState = loadMapState();

  // Load Leaflet + MarkerCluster
  const loadLeaflet = () => new Promise(resolve => {
    if (!document.getElementById('leafletCss')) {
      const l = document.createElement('link');
      l.id = 'leafletCss'; l.rel = 'stylesheet';
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(l);
    }
    const loadClusterCss = () => {
      if (!document.getElementById('clusterCss')) {
        const c = document.createElement('link');
        c.id = 'clusterCss'; c.rel = 'stylesheet';
        c.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
        document.head.appendChild(c);
        const cd = document.createElement('link');
        cd.rel = 'stylesheet';
        cd.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
        document.head.appendChild(cd);
      }
    };
    const loadClusterJs = (cb) => {
      if (window.L && window.L.markerClusterGroup) { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
      s.onload = cb;
      document.head.appendChild(s);
    };
    if (typeof L !== 'undefined') {
      loadClusterCss();
      loadClusterJs(resolve);
    } else {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => { loadClusterCss(); loadClusterJs(resolve); };
      document.head.appendChild(s);
    }
  });

  loadLeaflet().then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => initMap(savedState)));
  });
}

function initMap(savedState = {}) {
  const container = document.getElementById('mapContainer');
  if (!container) return;

  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    setTimeout(() => initMap(savedState), 80);
    return;
  }

  if (leafletMap && typeof leafletMap.remove === 'function') {
    leafletMap.remove(); leafletMap = null;
  }
  if (container._leaflet_id) delete container._leaflet_id;

  // Restore saved position or default
  const initCenter = savedState.center ? savedState.center : [16.5, 121.0];
  const initZoom   = savedState.zoom   ? savedState.zoom   : 7;

  const map = L.map('mapContainer', {
    zoomControl: false,
    preferCanvas: true
  }).setView(initCenter, initZoom);
  leafletMap = map;

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
    crossOrigin: true
  }).addTo(map);

  // ── Resize handling ─────────────────────────────────────────────────────
  function forceMapRefresh() {
    if (leafletMap !== map) return;
    map.invalidateSize({ animate: false, pan: false });
  }
  function refreshMapLayout() {
    [0, 150, 400, 800].forEach(d => setTimeout(() => { if (leafletMap===map) forceMapRefresh(); }, d));
  }
  requestAnimationFrame(() => refreshMapLayout());
  map.whenReady(() => forceMapRefresh());

  window.addEventListener('resize', forceMapRefresh);
  map.on('unload', () => window.removeEventListener('resize', forceMapRefresh));

  const bodyRow = document.querySelector('.map-body-row');
  if (typeof ResizeObserver !== 'undefined' && bodyRow) {
    const ro = new ResizeObserver(() => forceMapRefresh());
    ro.observe(bodyRow);
    map.on('unload', () => ro.disconnect());
  }

  // Save map position on move
  map.on('moveend zoomend', () => {
    const c = map.getCenter();
    const st = loadMapState();
    saveMapState({ ...st, center: [c.lat, c.lng], zoom: map.getZoom() });
  });

  // ── Marker Cluster ──────────────────────────────────────────────────────
  const clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    animate: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size  = count < 10 ? 36 : count < 50 ? 44 : 52;
      const color = '#2f4b85';
      return L.divIcon({
        html: `<div class="map-cluster-icon" style="width:${size}px;height:${size}px;background:${color};">
                 <span>${count}</span>
               </div>`,
        className: '',
        iconSize: [size, size]
      });
    }
  });
  map.addLayer(clusterGroup);

  // ── Icons ───────────────────────────────────────────────────────────────
  function makeIcon(color, size = 30, pulse = false, selected = false) {
    return L.divIcon({
      className: '',
      html: `<div class="map-pin ${pulse ? 'map-pin-pulse' : ''} ${selected ? 'map-pin-selected' : ''}"
                  style="--pin-color:${color};width:${size}px;height:${size}px;">
               <i class="ri-map-pin-2-fill" style="font-size:${size}px;line-height:1;color:${color};"></i>
             </div>`,
      iconSize: [size, size], iconAnchor: [size/2, size], popupAnchor: [0, -(size+4)]
    });
  }

  function siteIcon(site, selected = false) {
    if (selected) return makeIcon('#f59e0b', 36, true, true);
    return isActive(site) ? makeIcon('#22c55e', 30) : makeIcon('#ef4444', 26);
  }

  // ── State ───────────────────────────────────────────────────────────────
  let allSites     = [];
  let allMarkers   = {};
  let selectedSite = null;
  let panelEditMode = false;
  let hoverTimeout  = null;

  // Virtual scroll state
  const VIRT_BATCH = 40;
  let virtRendered  = 0;
  let virtFiltered  = [];

  function isActive(site) {
    return site.is_active === true || site.is_active === 't' || site.is_active === 'true' || site.is_active === 1;
  }

  // ── Hover preview card ──────────────────────────────────────────────────
  const hoverCard = document.getElementById('mapHoverCard');
  function showHoverCard(site, markerEl) {
    clearTimeout(hoverTimeout);
    const active = isActive(site);
    document.getElementById('mapHoverName').textContent   = site.site_name.replace(/^VSTG2-/i, '');
    document.getElementById('mapHoverStatus').innerHTML   =
      `<span class="map-hover-badge ${active ? 'active' : 'inactive'}">
         <i class="ri-record-circle-${active ? 'fill' : 'line'}"></i> ${active ? 'Active' : 'Inactive'}
       </span>`;
    document.getElementById('mapHoverMeta').textContent   =
      [site.project_name || 'DICT438', site.municipality].filter(Boolean).join(' · ');
    hoverCard.classList.remove('hidden');
    // Position near marker
    const mapRect   = document.getElementById('mapContainer').getBoundingClientRect();
    const markerRect = markerEl ? markerEl.getBoundingClientRect() : null;
    if (markerRect) {
      let left = markerRect.left - mapRect.left + markerRect.width / 2;
      let top  = markerRect.top  - mapRect.top  - 10;
      hoverCard.style.left      = left + 'px';
      hoverCard.style.top       = top  + 'px';
      hoverCard.style.transform = 'translate(-50%, -100%)';
    }
  }
  function hideHoverCard() {
    hoverTimeout = setTimeout(() => hoverCard?.classList.add('hidden'), 120);
  }

  // ── Plot markers ─────────────────────────────────────────────────────────
  function plotMarkers(sites) {
    clusterGroup.clearLayers();
    allMarkers = {};

    sites.forEach(site => {
      const lat = parseFloat(site.lat);
      const lng = parseFloat(site.long);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const marker = L.marker([lat, lng], { icon: siteIcon(site) });

      // Hover preview
      marker.on('mouseover', function() {
        const el = this.getElement();
        showHoverCard(site, el);
      });
      marker.on('mouseout', hideHoverCard);

      // Click → select
      marker.on('click', () => selectSite(site, marker));

      allMarkers[site.site_name] = marker;
      clusterGroup.addLayer(marker);
    });

    // Restore selected site marker
    if (selectedSite && allMarkers[selectedSite.site_name]) {
      allMarkers[selectedSite.site_name].setIcon(siteIcon(selectedSite, true));
    }
  }

  // ── Virtual scroll sidebar list ──────────────────────────────────────────
  function renderVirtBatch() {
    const el = document.getElementById('mapSiteList');
    if (!el) return;
    const nextBatch = virtFiltered.slice(virtRendered, virtRendered + VIRT_BATCH);
    if (!nextBatch.length) return;
    nextBatch.forEach(s => {
      const active = isActive(s);
      const hasPt  = s.lat && s.long;
      const item   = document.createElement('div');
      item.className = `map-list-item${selectedSite?.site_name === s.site_name ? ' selected' : ''}`;
      item.dataset.name = s.site_name;
      item.innerHTML = `
        <div class="map-list-dot" style="background:${active?'#22c55e':'#ef4444'};
          ${active?'box-shadow:0 0 0 3px rgba(34,197,94,0.2)':'box-shadow:0 0 0 3px rgba(239,68,68,0.2)'}"></div>
        <div class="map-list-text">
          <div class="map-list-name">${escHtml(s.site_name.replace(/^VSTG2-/,''))}</div>
          <div class="map-list-meta">${escHtml(s.project_name||'DICT438')} | ${escHtml(s.municipality||'—')}</div>
        </div>
        ${!hasPt ? '<span class="map-list-nocoord" title="No coordinates"><i class="ri-map-pin-off-line"></i></span>' : ''}`;
      item.addEventListener('click', () => {
        const site   = allSites.find(x => x.site_name === item.dataset.name);
        const marker = allMarkers[item.dataset.name];
        if (site) selectSite(site, marker);
      });
      el.appendChild(item);
    });
    virtRendered += nextBatch.length;
  }

  function renderSiteList(sites) {
    const el = document.getElementById('mapSiteList');
    if (!el) return;
    virtFiltered = sites;
    virtRendered = 0;
    el.innerHTML = '';

    if (!sites.length) {
      el.innerHTML = `<div class="map-list-empty">
        <i class="ri-search-line" style="font-size:24px;margin-bottom:8px;"></i>
        <div>No sites match your filters.</div>
        <button class="map-list-clear-btn" id="mapListClearFilters">Clear filters</button>
      </div>`;
      document.getElementById('mapListClearFilters')?.addEventListener('click', clearAllFilters);
      return;
    }

    renderVirtBatch();
  }

  // Infinite scroll sentinel
  const sentinel = document.getElementById('mapListSentinel');
  if (typeof IntersectionObserver !== 'undefined' && sentinel) {
    const sentinelObs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) renderVirtBatch();
    }, { root: document.querySelector('.map-sidebar'), threshold: 0.1 });
    sentinelObs.observe(sentinel);
    map.on('unload', () => sentinelObs.disconnect());
  }

  // ── Select site ──────────────────────────────────────────────────────────
  function selectSite(site, marker) {
    // Reset previous
    if (selectedSite) {
      const prev = allMarkers[selectedSite.site_name];
      if (prev) prev.setIcon(siteIcon(selectedSite, false));
    }
    selectedSite = site;
    panelEditMode = false;

    // Highlight marker + fly to
    if (marker) {
      marker.setIcon(siteIcon(site, true));
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 12), { duration: 0.7, easeLinearity: 0.4 });
    }

    // Sync sidebar highlight + scroll
    document.querySelectorAll('.map-list-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.name === site.site_name);
    });
    const listEl = document.querySelector(`.map-list-item[data-name="${CSS.escape(site.site_name)}"]`);
    listEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Hide hover card
    hoverCard?.classList.add('hidden');

    // Persist
    const st = loadMapState();
    saveMapState({ ...st, selectedSite: site.site_name });

    showDetailsPanel(site);
  }

  // ── Filter chips / active filter tags ───────────────────────────────────
  function renderFilterChips() {
    const container = document.getElementById('mapActiveFilters');
    if (!container) return;
    const q      = (document.getElementById('mapSearch')?.value || '').trim();
    const proj   = document.getElementById('mapProjectFilter')?.value  || '';
    const prov   = document.getElementById('mapProvinceFilter')?.value || '';
    const status = document.getElementById('mapStatusFilter')?.value   || '';

    const chips = [];
    if (q)      chips.push({ label: `"${q}"`,        clear: () => { document.getElementById('mapSearch').value=''; applyFilters(); }});
    if (proj)   chips.push({ label: proj,             clear: () => { document.getElementById('mapProjectFilter').value=''; applyFilters(); }});
    if (prov)   chips.push({ label: prov,             clear: () => { document.getElementById('mapProvinceFilter').value=''; applyFilters(); }});
    if (status) chips.push({ label: status==='active'?'Active only':'Inactive only', clear: () => { document.getElementById('mapStatusFilter').value=''; applyFilters(); }});

    if (!chips.length) { container.innerHTML = ''; return; }
    container.innerHTML = chips.map((c,i) =>
      `<span class="map-filter-chip" data-idx="${i}">${escHtml(c.label)}<button class="map-chip-x">×</button></span>`
    ).join('') + `<button class="map-chip-clear-all" id="mapChipClearAll">Clear all</button>`;

    container.querySelectorAll('.map-filter-chip').forEach((chip, i) => {
      chip.querySelector('.map-chip-x').addEventListener('click', () => chips[i].clear());
    });
    document.getElementById('mapChipClearAll')?.addEventListener('click', clearAllFilters);
  }

  function clearAllFilters() {
    const search = document.getElementById('mapSearch');
    const proj   = document.getElementById('mapProjectFilter');
    const prov   = document.getElementById('mapProvinceFilter');
    const status = document.getElementById('mapStatusFilter');
    if (search) search.value = '';
    if (proj)   proj.value   = '';
    if (prov)   prov.value   = '';
    if (status) status.value = '';
    document.getElementById('mapSearchClear')?.classList.add('hidden');
    applyFilters();
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  function getFiltered() {
    const q      = (document.getElementById('mapSearch')?.value || '').toLowerCase();
    const proj   = document.getElementById('mapProjectFilter')?.value  || '';
    const prov   = document.getElementById('mapProvinceFilter')?.value || '';
    const status = document.getElementById('mapStatusFilter')?.value   || '';
    return allSites.filter(s => {
      if (q && !((s.site_name||'').toLowerCase().includes(q) ||
                 (s.municipality||'').toLowerCase().includes(q) ||
                 (s.province||'').toLowerCase().includes(q))) return false;
      if (proj   && s.project_name !== proj)  return false;
      if (prov   && s.province     !== prov)  return false;
      if (status === 'active'   && !isActive(s)) return false;
      if (status === 'inactive' &&  isActive(s)) return false;
      return true;
    });
  }

  function updateSidebarCount(filtered) {
    const el = document.getElementById('mapSidebarCount');
    if (el) el.textContent = `Showing ${filtered.length} of ${allSites.length} sites`;
  }

  function isFilterActive() {
    return !!(
      (document.getElementById('mapSearch')?.value || '').trim() ||
      document.getElementById('mapProjectFilter')?.value ||
      document.getElementById('mapProvinceFilter')?.value ||
      document.getElementById('mapStatusFilter')?.value
    );
  }

  // Search with auto-focus first result
  let searchDebounce = null;
  function handleSearch() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const q = (document.getElementById('mapSearch')?.value || '').trim();
      document.getElementById('mapSearchClear')?.classList.toggle('hidden', !q);
      applyFilters();
      // Auto-zoom to first result if search gives a single match
      if (q) {
        const filtered = getFiltered();
        if (filtered.length === 1 && filtered[0].lat && filtered[0].long) {
          const site = filtered[0];
          const marker = allMarkers[site.site_name];
          selectSite(site, marker);
        } else if (filtered.length > 0 && filtered.length <= 10) {
          // Fit bounds to all results
          const pts = filtered.filter(s=>s.lat&&s.long).map(s=>[parseFloat(s.lat),parseFloat(s.long)]);
          if (pts.length) map.flyToBounds(pts, { padding: [60,60], maxZoom: 13, duration: 0.8 });
        }
      }
    }, 280);
  }

  function applyFilters() {
    const filtered = getFiltered();
    renderSiteList(filtered);
    updateMapStats(filtered);
    updateSidebarCount(filtered);
    renderFilterChips();

    const filterActive = isFilterActive();
    const bulkRow = document.getElementById('mapBulkRow');
    if (bulkRow) bulkRow.style.display = filterActive ? 'flex' : 'none';

    // Update cluster markers
    clusterGroup.clearLayers();
    Object.entries(allMarkers).forEach(([name, marker]) => {
      const inFilter = filtered.some(s => s.site_name === name);
      if (inFilter) clusterGroup.addLayer(marker);
    });

    // Persist filter state
    const st = loadMapState();
    saveMapState({
      ...st,
      search:  document.getElementById('mapSearch')?.value || '',
      project: document.getElementById('mapProjectFilter')?.value || '',
      province:document.getElementById('mapProvinceFilter')?.value || '',
      status:  document.getElementById('mapStatusFilter')?.value || ''
    });
  }

  document.getElementById('mapSearch')?.addEventListener('input', handleSearch);
  document.getElementById('mapSearchClear')?.addEventListener('click', () => {
    document.getElementById('mapSearch').value = '';
    document.getElementById('mapSearchClear').classList.add('hidden');
    applyFilters();
  });
  ['mapProjectFilter','mapProvinceFilter','mapStatusFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  // ── Sidebar collapse/expand ──────────────────────────────────────────────
  const sidebar       = document.getElementById('mapSidebar');
  const collapseBtn   = document.getElementById('mapSidebarCollapseBtn');
  const expandBtn     = document.getElementById('mapSidebarExpandBtn');

  function setMapSidebarOpen(open) {
    if (open) {
      sidebar?.classList.remove('map-sidebar-collapsed');
      expandBtn?.classList.add('hidden');
      expandBtn?.classList.remove('map-expand-visible');
    } else {
      sidebar?.classList.add('map-sidebar-collapsed');
      expandBtn?.classList.remove('hidden');
      // small delay so transition starts after display:flex kicks in
      requestAnimationFrame(() => expandBtn?.classList.add('map-expand-visible'));
    }
    setTimeout(() => forceMapRefresh(), 350);
  }

  collapseBtn?.addEventListener('click', () => setMapSidebarOpen(false));
  expandBtn?.addEventListener('click',   () => setMapSidebarOpen(true));

  // ── Stats ────────────────────────────────────────────────────────────────
  function updateMapStats(sites) {
    const active   = sites.filter(s => isActive(s)).length;
    const inactive = sites.length - active;
    const tot = document.getElementById('mapStatTotal');
    const act = document.getElementById('mapStatActive');
    const ina = document.getElementById('mapStatInactive');
    if (tot) tot.innerHTML = `<i class="ri-map-pin-2-line"></i> ${sites.length} Total`;
    if (act) act.innerHTML = `<i class="ri-radio-button-fill"></i> ${active} Active`;
    if (ina) ina.innerHTML = `<i class="ri-radio-button-line"></i> ${inactive} Inactive`;
  }

  // ── Details Panel helpers ────────────────────────────────────────────────
  function deviceTypeLabel(name) {
    if (!name) return '—';
    const m = name.match(/\b(AP\s*1|AP\s*2|AP\s*3|ER|ROUTER)\b/i);
    if (m) return m[0].replace(/\s+/,'').toUpperCase();
    const parts = name.split(/[-_]/);
    return parts[parts.length-1].toUpperCase().slice(0,6);
  }
  function deviceTypeColor(t) {
    t = (t||'').toLowerCase();
    if (t.includes('er')||t.includes('router')) return '#ef4444';
    if (t.includes('ap1')) return '#2f4b85';
    if (t.includes('ap2')) return '#7c3aed';
    if (t.includes('ap3')) return '#0891b2';
    return '#64748b';
  }
  function isExpired(d) { return d && new Date(d) < new Date(); }
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  }
  function buildDeviceCard(d, site) {
    const devActive = d.is_active !== false;
    const expired   = isExpired(d.license_due);
    const tLabel    = deviceTypeLabel(d.device_name);
    const tColor    = deviceTypeColor(tLabel);
    return `
      <div class="map-dev-card ${devActive?'':'map-dev-inactive'}" data-dev-id="${d.id}">
        <div class="map-dev-card-header">
          <span class="map-dev-type-badge" style="background:${tColor}18;color:${tColor};border-color:${tColor}40;">${escHtml(tLabel)}</span>
          <span class="map-dev-name-full">${escHtml(d.device_name||'—')}</span>
          <div class="map-dev-card-actions">
            <span class="map-dev-status-dot ${devActive?'dev-active':'dev-inactive'}"></span>
            <button class="map-dev-toggle-btn" data-id="${d.id}" data-active="${devActive}" title="${devActive?'Deactivate':'Activate'}"><i class="ri-power-line"></i></button>
            <button class="map-dev-edit-btn"   data-id="${d.id}" title="Edit device"><i class="ri-edit-line"></i></button>
          </div>
        </div>
        <div class="map-dev-card-body">
          <div class="map-dev-info-row"><span class="map-dev-lbl">SN</span><span>${escHtml(d.serial||d.serial_number||'—')}</span></div>
          <div class="map-dev-info-row"><span class="map-dev-lbl">MAC</span><span>${escHtml(d.mac_address||'—')}</span></div>
          <div class="map-dev-info-row"><span class="map-dev-lbl">Model</span><span>${escHtml(d.model||'—')}</span></div>
          <div class="map-dev-info-row ${expired?'map-dev-lic-expired':''}">
            <span class="map-dev-lbl">Lic.</span>
            <span>${fmtDate(d.license_due)}${expired?'<span class="map-dev-expired-tag">Expired</span>':''}</span>
          </div>
        </div>
      </div>`;
  }

  // ── Details Panel ─────────────────────────────────────────────────────────
  function showDetailsPanel(site) {
    const panel = document.getElementById('mapDetailsPanel');
    if (!panel) return;

    const wasHidden = panel.classList.contains('hidden');
    panel.classList.remove('hidden');
    // Animate in
    requestAnimationFrame(() => panel.classList.add('map-panel-visible'));

    document.querySelector('.map-page-wrap')?.classList.add('details-open');

    // Make draggable (only bind once)
    if (wasHidden) {
      panel.style.right = '14px';
      panel.style.top   = '14px';
      panel.style.left  = '';
    }
    if (!panel._dragBound) {
      panel._dragBound = true;
      const header = panel.querySelector('.map-details-header');
      if (header) header.style.cursor = 'grab';
      header?.addEventListener('mousedown', function(e) {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const r    = panel.getBoundingClientRect();
        const offX = e.clientX - r.left;
        const offY = e.clientY - r.top;
        panel.style.transition = 'none';
        panel.style.left  = r.left + 'px';
        panel.style.top   = r.top  + 'px';
        panel.style.right = 'auto';
        header.style.cursor = 'grabbing';
        const onMove = ev => {
          const wrap = document.querySelector('.map-body-row')?.getBoundingClientRect()
                    || { left:0, top:0, right:window.innerWidth, bottom:window.innerHeight };
          panel.style.left = Math.min(Math.max(ev.clientX - offX, wrap.left), wrap.right  - panel.offsetWidth)  + 'px';
          panel.style.top  = Math.min(Math.max(ev.clientY - offY, wrap.top),  wrap.bottom - panel.offsetHeight) + 'px';
        };
        const onUp = () => {
          header.style.cursor = 'grab';
          panel.style.transition = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });
    }

    const active   = isActive(site);
    const devices  = Array.isArray(site.devices) ? site.devices : [];
    const hasIssue = devices.some(d => d.is_active===false || isExpired(d.license_due));

    document.getElementById('mapDetailsName').textContent =
      site.site_name.replace(/^VSTG2-/,'') || '—';
    document.getElementById('mapDetailsSub').textContent =
      `${site.project_name||'DICT438'} | ${site.province||'—'} | ${site.municipality||'—'}`;

    document.getElementById('mapDetailsBody').innerHTML = `
      <div class="map-details-status-row">
        <span class="map-details-status-badge ${active?'active':'inactive'}">
          <i class="ri-record-circle-${active?'fill':'line'}"></i> ${active?'Active':'Inactive'}
        </span>
        <button class="map-activate-btn ${active?'deactivate':'activate'}" id="mapDetailToggleStatus">
          <i class="ri-${active?'close':'check'}-circle-line"></i> ${active?'Deactivate':'Activate'}
        </button>
      </div>

      <div class="map-overview-grid">
        <div class="map-ov-item">
          <span class="map-ov-label"><i class="ri-server-line"></i> IP Address</span>
          <span class="map-ov-value">${escHtml(site.ip||'—')}</span>
        </div>
        <div class="map-ov-item">
          <span class="map-ov-label"><i class="ri-building-line"></i> Municipality</span>
          <span class="map-ov-value">${escHtml(site.municipality||'—')}</span>
        </div>
        <div class="map-ov-item">
          <span class="map-ov-label"><i class="ri-map-pin-2-line"></i> Province</span>
          <span class="map-ov-value">${escHtml(site.province||'—')}</span>
        </div>
        <div class="map-ov-item">
          <span class="map-ov-label"><i class="ri-cpu-line"></i> Devices</span>
          <span class="map-ov-value">${devices.length} linked ${hasIssue?'<span class="map-ov-issue"><i class="ri-error-warning-line"></i></span>':''}</span>
        </div>
      </div>

      <button class="map-see-more-btn" id="mapSeeMoreBtn">
        <i class="ri-arrow-down-s-line"></i> See More Details
      </button>

      <div class="map-expanded-section hidden" id="mapExpandedSection">
        <div class="map-exp-divider"><span>Details</span></div>
        <div class="map-details-section">
          <div class="map-details-row"><span class="map-details-label">Coords</span>
            <span>${site.lat?parseFloat(site.lat).toFixed(5):'—'}, ${site.long?parseFloat(site.long).toFixed(5):'—'}</span>
          </div>
          <div class="map-details-row"><span class="map-details-label">Installed</span><span>${escHtml(site.installed_by||'—')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Repaired</span><span>${escHtml(site.repaired_by||'—')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Installed On</span><span>${site.date_installed?new Date(site.date_installed).toLocaleDateString():'—'}</span></div>
          <div class="map-details-row"><span class="map-details-label">Accepted</span><span>${site.acceptance_date?new Date(site.acceptance_date).toLocaleDateString():'—'}</span></div>
          <div class="map-details-row"><span class="map-details-label">Created By</span><span>${escHtml(site.created_by_name||'—')}</span></div>
        </div>
        <div class="map-exp-divider"><span>Equipment</span></div>
        <div class="map-details-section">
          <div class="map-details-row"><span class="map-details-label">Modem</span><span>${escHtml(site.modem||'—')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Transceiver</span><span>${escHtml(site.transceiver||'—')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Dish</span><span>${escHtml(site.dish||'—')}</span></div>
        </div>
        <div class="map-exp-divider"><span>Contacts</span></div>
        <div class="map-details-section">
          <div class="map-details-row"><span class="map-details-label">Personnel</span><span>${escHtml(site.contacts||'—')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Email</span><span>${escHtml(site.email||'—')}</span></div>
        </div>
        <div class="map-exp-divider"><span>Network Devices ${hasIssue?'<span class="map-dev-warn-badge"><i class="ri-error-warning-line"></i> Issue</span>':''}</span></div>
        <div class="map-devices-list" id="mapDevicesList">
          ${devices.length?devices.map(d=>buildDeviceCard(d,site)).join(''):'<div class="map-dev-empty"><i class="ri-cpu-line"></i> No devices linked.</div>'}
        </div>
        <div class="map-exp-divider"><span>History</span></div>
        <div class="map-details-section">
          ${Array.isArray(site.history)&&site.history.length
            ? site.history.map(item=>`
                <div class="map-details-row">
                  <span class="map-details-label">${escHtml(item.action_type||'update')}</span>
                  <span>${escHtml(item.actor_name||'System')} • ${item.action_date?new Date(item.action_date).toLocaleString():'—'}${item.notes?` • ${escHtml(item.notes)}`:''}</span>
                </div>`).join('')
            : '<div class="map-details-row"><span class="map-details-label">Track</span><span>No history yet.</span></div>'}
        </div>
      </div>
    `;

    // Toggle status button
    document.getElementById('mapDetailToggleStatus')?.addEventListener('click', async function() {
      const newStatus = !isActive(site);
      this.disabled = true;
      this.innerHTML = '<i class="ri-loader-4-line spin"></i>';
      await activateSite(site, newStatus);
    });

    // See More toggle
    document.getElementById('mapSeeMoreBtn')?.addEventListener('click', function() {
      const expanded = document.getElementById('mapExpandedSection');
      const isOpen   = !expanded.classList.contains('hidden');
      expanded.classList.toggle('hidden', isOpen);
      this.classList.toggle('open', !isOpen);
      this.innerHTML = isOpen
        ? '<i class="ri-arrow-down-s-line"></i> See More Details'
        : '<i class="ri-arrow-up-s-line"></i> See Less';
      if (!isOpen) {
        setTimeout(() => {
          const body = document.getElementById('mapDetailsBody');
          if (body) body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
        }, 120);
      }
    });

    // Close button
    document.getElementById('mapDetailsPanelClose').onclick = () => {
      panel.classList.remove('map-panel-visible');
      setTimeout(() => {
        panel.classList.add('hidden');
        document.querySelector('.map-page-wrap')?.classList.remove('details-open');
      }, 200);
      if (selectedSite) {
        const m = allMarkers[selectedSite.site_name];
        if (m) m.setIcon(siteIcon(selectedSite, false));
      }
      document.querySelectorAll('.map-list-item').forEach(el => el.classList.remove('selected'));
      selectedSite = null;
      const st = loadMapState();
      saveMapState({ ...st, selectedSite: null });
    };

    document.getElementById('mapDetailsEditBtn').onclick = () => openMapEditModal(site);

    // Device actions
    document.querySelectorAll('.map-dev-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id  = parseInt(btn.dataset.id);
        const cur = btn.dataset.active === 'true';
        btn.disabled = true;
        try {
          const r = await fetch(`/api/map/devices/${id}/status`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_active:!cur})});
          if (!r.ok) throw new Error();
          const dev = site.devices.find(d=>d.id===id);
          if (dev) dev.is_active = !cur;
          const marker = allMarkers[site.site_name];
          if (marker) marker.setIcon(siteIcon(site, selectedSite?.site_name===site.site_name));
          showDetailsPanel(site);
          showToast(`Device ${!cur?'activated':'deactivated'}.`,'success');
        } catch { showToast('Device update failed.','error'); }
        finally { btn.disabled=false; }
      });
    });
    document.querySelectorAll('.map-dev-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dev = site.devices.find(d=>d.id===parseInt(btn.dataset.id));
        if (dev) openDeviceEditModal(dev, site);
      });
    });
  }

  // ── Activate / Deactivate ─────────────────────────────────────────────────
  async function activateSite(site, newStatus) {
    try {
      const res = await fetch(`/api/map/sites/${encodeURIComponent(site.site_name)}/status`,{
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({is_active: newStatus})
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const idx = allSites.findIndex(s=>s.site_name===site.site_name);
      if (idx !== -1) allSites[idx].is_active = newStatus;
      site.is_active = newStatus;
      const marker = allMarkers[site.site_name];
      if (marker) marker.setIcon(siteIcon(site, true));
      applyFilters();
      showDetailsPanel(site);
      showToast(`Site ${newStatus?'activated':'deactivated'}.`, 'success');
    } catch(e) { showToast('Status update failed: '+e.message,'error'); }
  }

  // ── Device Edit Modal ────────────────────────────────────────────────────
  function openDeviceEditModal(dev, site) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal-box add-modal-box" style="max-width:480px;">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-router-line"></i></div>
          <div class="add-modal-title"><h3>Edit Device</h3><p>${escHtml(dev.device_name||'—')}</p></div>
          <button class="modal-close-btn" id="devEditClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid">
            <div class="add-field-item"><label class="add-field-label">Device Name</label><input id="devEditName" class="add-field-input" value="${escHtml(dev.device_name||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">Type</label>
              <select id="devEditType" class="add-field-input">
                <option value="ER_ROUTER" ${(dev.device_type||'').toUpperCase()==='ER_ROUTER'?'selected':''}>ER Router</option>
                <option value="AP1" ${(dev.device_type||'').toUpperCase()==='AP1'?'selected':''}>AP 1</option>
                <option value="AP2" ${(dev.device_type||'').toUpperCase()==='AP2'?'selected':''}>AP 2</option>
                <option value="AP3" ${(dev.device_type||'').toUpperCase()==='AP3'?'selected':''}>AP 3</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div class="add-field-item"><label class="add-field-label">Serial Number</label><input id="devEditSN" class="add-field-input" value="${escHtml(dev.serial_number||dev.serial||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">MAC Address</label><input id="devEditMAC" class="add-field-input" value="${escHtml(dev.mac_address||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">Model</label><input id="devEditModel" class="add-field-input" value="${escHtml(dev.model||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">License Expiry</label><input id="devEditLic" class="add-field-input" type="date" value="${dev.license_due?new Date(dev.license_due).toISOString().slice(0,10):''}"></div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Saved to database</span>
          <div class="modal-actions">
            <button class="tool-btn" id="devEditCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="devEditSave"><i class="ri-save-line"></i> Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    document.getElementById('devEditClose').onclick  = close;
    document.getElementById('devEditCancel').onclick = close;
    m.onclick = e => { if(e.target===m) close(); };
    document.getElementById('devEditSave').onclick = async () => {
      const payload = {
        device_name:   document.getElementById('devEditName').value.trim(),
        device_type:   document.getElementById('devEditType').value,
        serial_number: document.getElementById('devEditSN').value.trim(),
        mac_address:   document.getElementById('devEditMAC').value.trim(),
        model:         document.getElementById('devEditModel').value.trim(),
        license_due:   document.getElementById('devEditLic').value || null,
      };
      const btn = document.getElementById('devEditSave');
      btn.disabled=true; btn.innerHTML='<i class="ri-loader-4-line spin"></i> Saving…';
      try {
        const res = await fetch(`/api/map/devices/${dev.id}/edit`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if (!res.ok) throw new Error((await res.json()).error);
        Object.assign(dev, payload);
        close(); showDetailsPanel(site);
        showToast('Device updated.','success');
      } catch(e) { showToast('Save failed: '+e.message,'error'); }
      finally { btn.disabled=false; btn.innerHTML='<i class="ri-save-line"></i> Save'; }
    };
  }

  // ── Edit Site Modal ──────────────────────────────────────────────────────
  function openMapEditModal(site) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'mapEditModal';
    m.innerHTML = `
      <div class="modal-box add-modal-box" style="max-width:500px;">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-map-pin-2-line"></i></div>
          <div class="add-modal-title"><h3>Edit Site</h3><p>${escHtml(site.site_name)}</p></div>
          <button class="modal-close-btn" id="mapEditClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid" style="grid-template-columns:1fr 1fr;">
            <div class="add-field-item"><label class="add-field-label">IP Address</label><input type="text" id="mapEditIp" class="add-field-input" value="${escHtml(site.ip||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">MAC Address</label><input type="text" id="mapEditMac" class="add-field-input" value="${escHtml(site.mac||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">Latitude</label><input type="number" id="mapEditLat" class="add-field-input" step="0.0000001" value="${site.lat||''}"></div>
            <div class="add-field-item"><label class="add-field-label">Longitude</label><input type="number" id="mapEditLng" class="add-field-input" step="0.0000001" value="${site.long||''}"></div>
            <div class="add-field-item"><label class="add-field-label">Modem</label><input type="text" id="mapEditModem" class="add-field-input" value="${escHtml(site.modem||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">Transceiver</label><input type="text" id="mapEditTransceiver" class="add-field-input" value="${escHtml(site.transceiver||'')}"></div>
            <div class="add-field-item" style="grid-column:1/-1;"><label class="add-field-label">Dish</label><input type="text" id="mapEditDish" class="add-field-input" value="${escHtml(site.dish||'')}"></div>
            <div class="add-field-item" style="grid-column:1/-1;"><label class="add-field-label">Project</label><input type="text" id="mapEditProject" class="add-field-input" value="${escHtml(site.project_name||'DICT438')}"></div>
            <div class="add-field-item"><label class="add-field-label">Installed By</label><input type="text" id="mapEditInstalledBy" class="add-field-input" value="${escHtml(site.installed_by||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">Repaired By</label><input type="text" id="mapEditRepairedBy" class="add-field-input" value="${escHtml(site.repaired_by||'')}"></div>
            <div class="add-field-item"><label class="add-field-label">Date Installed</label><input type="date" id="mapEditDateInstalled" class="add-field-input" value="${site.date_installed?new Date(site.date_installed).toISOString().slice(0,10):''}"></div>
            <div class="add-field-item"><label class="add-field-label">Acceptance Date</label><input type="date" id="mapEditAcceptanceDate" class="add-field-input" value="${site.acceptance_date?new Date(site.acceptance_date).toISOString().slice(0,10):''}"></div>
            <div class="add-field-item" style="grid-column:1/-1;"><label class="add-field-label">Contacts</label><textarea id="mapEditContacts" class="add-field-input" style="resize:vertical;min-height:54px;">${escHtml(site.contacts||'')}</textarea></div>
            <div class="add-field-item" style="grid-column:1/-1;"><label class="add-field-label">Email / Social</label><input type="text" id="mapEditEmail" class="add-field-input" value="${escHtml(site.email||'')}"></div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"></span>
          <div class="modal-actions">
            <button class="tool-btn" id="mapEditCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="mapEditSave"><i class="ri-save-line"></i> Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    document.getElementById('mapEditClose').onclick  = close;
    document.getElementById('mapEditCancel').onclick = close;
    m.onclick = e => { if(e.target===m) close(); };
    document.getElementById('mapEditSave').onclick = async () => {
      const payload = {
        ip:            document.getElementById('mapEditIp').value.trim(),
        mac:           document.getElementById('mapEditMac').value.trim(),
        lat:           parseFloat(document.getElementById('mapEditLat').value)||null,
        long:          parseFloat(document.getElementById('mapEditLng').value)||null,
        modem:         document.getElementById('mapEditModem').value.trim()||null,
        transceiver:   document.getElementById('mapEditTransceiver').value.trim()||null,
        dish:          document.getElementById('mapEditDish').value.trim()||null,
        project_name:  document.getElementById('mapEditProject').value.trim()||'DICT438',
        installed_by:  document.getElementById('mapEditInstalledBy').value.trim()||null,
        repaired_by:   document.getElementById('mapEditRepairedBy').value.trim()||null,
        date_installed:  document.getElementById('mapEditDateInstalled').value||null,
        acceptance_date: document.getElementById('mapEditAcceptanceDate').value||null,
        contacts: document.getElementById('mapEditContacts').value.trim()||null,
        email:    document.getElementById('mapEditEmail').value.trim()||null,
      };
      const btn = document.getElementById('mapEditSave');
      btn.disabled=true; btn.innerHTML='<i class="ri-loader-4-line spin"></i> Saving…';
      try {
        const res = await fetch(`/api/map/sites/${encodeURIComponent(site.site_name)}/edit`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if (!res.ok) throw new Error((await res.json()).error||'Save failed');
        Object.assign(site, payload);
        // Update marker if coords changed
        if (payload.lat && payload.long) {
          const oldM = allMarkers[site.site_name];
          if (oldM) { clusterGroup.removeLayer(oldM); delete allMarkers[site.site_name]; }
          const newM = L.marker([payload.lat, payload.long], {icon: siteIcon(site,true)});
          newM.on('click', () => selectSite(site, newM));
          newM.on('mouseover', function() { showHoverCard(site, this.getElement()); });
          newM.on('mouseout', hideHoverCard);
          allMarkers[site.site_name] = newM;
          clusterGroup.addLayer(newM);
        }
        close(); showDetailsPanel(site);
        showToast('Site updated.','success');
      } catch(e) { showToast('Save failed: '+e.message,'error'); }
      finally { btn.disabled=false; btn.innerHTML='<i class="ri-save-line"></i> Save'; }
    };
  }

  // ── Bulk Activate / Deactivate ────────────────────────────────────────────
  async function bulkUpdateStatus(newStatus) {
    const filtered = getFiltered();
    if (!filtered.length) { showToast('No sites match current filters.','error'); return; }
    const msg = `${newStatus?'Activate':'Deactivate'} ${filtered.length} filtered site${filtered.length!==1?'s':''}?`;
    if (!confirm(msg)) return;
    const btnId = newStatus ? 'mapBulkActivate' : 'mapBulkDeactivate';
    const btn = document.getElementById(btnId);
    const orig = btn.innerHTML;
    btn.disabled=true; btn.innerHTML='<i class="ri-loader-4-line spin"></i> Processing…';
    try {
      const res = await fetch('/api/map/sites/bulk-status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({site_names:filtered.map(s=>s.site_name),is_active:newStatus})});
      if (!res.ok) throw new Error((await res.json()).error);
      const result = await res.json();
      filtered.forEach(site => {
        site.is_active = newStatus;
        const idx = allSites.findIndex(s=>s.site_name===site.site_name);
        if (idx!==-1) allSites[idx].is_active = newStatus;
        const marker = allMarkers[site.site_name];
        if (marker) marker.setIcon(siteIcon(site));
      });
      applyFilters();
      showToast(`${result.updated||filtered.length} sites ${newStatus?'activated':'deactivated'}.`,'success');
    } catch(e) { showToast('Bulk update failed: '+e.message,'error'); }
    finally { btn.disabled=false; btn.innerHTML=orig; }
  }
  document.getElementById('mapBulkActivate')?.addEventListener('click', ()=>bulkUpdateStatus(true));
  document.getElementById('mapBulkDeactivate')?.addEventListener('click', ()=>bulkUpdateStatus(false));

  // ── Add Site Modal ────────────────────────────────────────────────────────
  document.getElementById('mapAddSiteBtn')?.addEventListener('click', () => {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal-box add-modal-box" style="max-width:500px;">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-map-pin-add-line"></i></div>
          <div class="add-modal-title"><h3>Add Site</h3><p>Register a new network site.</p></div>
          <button class="modal-close-btn" id="mapAddSiteClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid" style="grid-template-columns:1fr 1fr;">
            <div class="add-field-item" style="grid-column:1/-1;"><label class="add-field-label">Site Name *</label><input type="text" id="asSiteName" class="add-field-input" placeholder="e.g. L1-0001-ABIANG-BRGY"></div>
            <div class="add-field-item"><label class="add-field-label">Municipality</label><input type="text" id="asMuni" class="add-field-input" placeholder="e.g. ATOK"></div>
            <div class="add-field-item"><label class="add-field-label">Province</label><input type="text" id="asProvince" class="add-field-input" placeholder="e.g. BENGUET"></div>
            <div class="add-field-item"><label class="add-field-label">Latitude</label><input type="number" id="asLat" class="add-field-input" step="0.0000001"></div>
            <div class="add-field-item"><label class="add-field-label">Longitude</label><input type="number" id="asLng" class="add-field-input" step="0.0000001"></div>
            <div class="add-field-item"><label class="add-field-label">IP Address</label><input type="text" id="asIp" class="add-field-input"></div>
            <div class="add-field-item"><label class="add-field-label">Project</label><input type="text" id="asProject" class="add-field-input" value="DICT438"></div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Fields marked * required</span>
          <div class="modal-actions">
            <button class="tool-btn" id="mapAddSiteCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="mapAddSiteSave"><i class="ri-save-line"></i> Add Site</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    document.getElementById('mapAddSiteClose').onclick  = close;
    document.getElementById('mapAddSiteCancel').onclick = close;
    m.onclick = e => { if(e.target===m) close(); };
    document.getElementById('mapAddSiteSave').onclick = async () => {
      const site_name = document.getElementById('asSiteName').value.trim();
      if (!site_name) { showToast('Site name is required.','error'); return; }
      const payload = {
        site_name,
        municipality: document.getElementById('asMuni').value.trim()||null,
        province:     document.getElementById('asProvince').value.trim()||null,
        lat:          parseFloat(document.getElementById('asLat').value)||null,
        long:         parseFloat(document.getElementById('asLng').value)||null,
        ip:           document.getElementById('asIp').value.trim()||null,
        project_name: document.getElementById('asProject').value.trim()||'DICT438',
        created_by_name: user?.full_name||null,
      };
      const btn = document.getElementById('mapAddSiteSave');
      btn.disabled=true; btn.innerHTML='<i class="ri-loader-4-line spin"></i> Saving…';
      try {
        const res = await fetch('/api/map/sites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result = await res.json();
        if (!res.ok) { showToast('Failed: '+(result.error||'Unknown'),'error'); return; }
        result.devices = [];
        allSites.push(result);
        if (result.lat && result.long) {
          const marker = L.marker([parseFloat(result.lat),parseFloat(result.long)],{icon:siteIcon(result)});
          marker.on('click', () => selectSite(result, marker));
          marker.on('mouseover', function() { showHoverCard(result, this.getElement()); });
          marker.on('mouseout', hideHoverCard);
          allMarkers[result.site_name] = marker;
          clusterGroup.addLayer(marker);
        }
        applyFilters();
        close();
        showToast(`Site "${site_name}" added.`,'success');
      } catch(err) { showToast('Network error: '+err.message,'error'); }
      finally { btn.disabled=false; btn.innerHTML='<i class="ri-save-line"></i> Add Site'; }
    };
  });

  // ── Import Sites ──────────────────────────────────────────────────────────
  document.getElementById('mapImportBtn')?.addEventListener('click', () => {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal-box add-modal-box" style="max-width:480px;">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-upload-cloud-2-line"></i></div>
          <div class="add-modal-title"><h3>Import Sites</h3><p>Upload CSV or XLSX to bulk-add sites.</p></div>
          <button class="modal-close-btn" id="mapImportClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="import-drop-zone" id="mapImportDropZone" style="margin-bottom:8px;">
            <i class="ri-file-upload-line" style="font-size:36px;color:#2f4b85;"></i>
            <p style="margin:8px 0 4px;font-weight:600;color:#1e293b;">Drop file here or click to browse</p>
            <p style="font-size:12px;color:#94a3b8;">CSV or XLSX</p>
            <input type="file" id="mapImportFileInput" accept=".csv,.xlsx" class="hidden">
          </div>
          <div id="mapImportFileName" style="font-size:13px;color:#2f4b85;min-height:18px;"></div>
          <div id="mapImportProgress" style="display:none;margin-top:14px;">
            <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
              <div id="mapImportBar" style="height:100%;background:#2f4b85;width:0%;transition:width 0.3s;border-radius:99px;"></div>
            </div>
            <div id="mapImportProgressText" style="font-size:12px;color:#64748b;margin-top:6px;"></div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Duplicate site names skipped</span>
          <div class="modal-actions">
            <button class="tool-btn" id="mapImportCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="mapImportConfirm" disabled><i class="ri-upload-2-line"></i> Import</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    let parsedRows = [];
    const close = () => m.remove();
    document.getElementById('mapImportClose').onclick  = close;
    document.getElementById('mapImportCancel').onclick = close;
    m.onclick = e => { if(e.target===m) close(); };
    const zone  = document.getElementById('mapImportDropZone');
    const input = document.getElementById('mapImportFileInput');
    zone.onclick = () => input.click();
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add('drop-hover'); };
    zone.ondragleave = () => zone.classList.remove('drop-hover');
    zone.ondrop      = e => { e.preventDefault(); zone.classList.remove('drop-hover'); handleFile(e.dataTransfer.files[0]); };
    input.onchange   = () => handleFile(input.files[0]);
    async function handleFile(file) {
      if (!file) return;
      const fname   = document.getElementById('mapImportFileName');
      const confirm = document.getElementById('mapImportConfirm');
      parsedRows = []; confirm.disabled = true;
      try {
        const COLS = ['site_name','municipality','province','lat','long','ip','project_name','installed_by','repaired_by','date_installed','acceptance_date','modem','transceiver','dish','contacts','email'];
        const norm = s => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
        if (file.name.endsWith('.csv')) {
          const lines = (await file.text()).split(/\r?\n/).filter(l=>l.trim());
          const headers = lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
          parsedRows = lines.slice(1).map(line=>{
            const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,))/g)||[];
            const row = {};
            headers.forEach((h,i)=>{ const c=COLS.find(x=>norm(x)===norm(h)); if(c) row[c]=(vals[i]||'').replace(/^"|"$/g,'').trim(); });
            return row;
          }).filter(r=>r.site_name);
        } else {
          await new Promise((res,rej)=>{ if(window.XLSX){res();return;} const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
          const wb = XLSX.read(await file.arrayBuffer(),{type:'array'});
          parsedRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}).map(r=>{
            const row={};
            Object.entries(r).forEach(([h,v])=>{ const c=COLS.find(x=>norm(x)===norm(h)); if(c) row[c]=String(v||'').trim(); });
            return row;
          }).filter(r=>r.site_name);
        }
        fname.textContent = `📄 ${file.name} — ${parsedRows.length} rows found`;
        confirm.disabled = parsedRows.length===0;
      } catch(err) { document.getElementById('mapImportFileName').textContent='⚠️ '+err.message; }
    }
    document.getElementById('mapImportConfirm').onclick = async () => {
      if (!parsedRows.length) return;
      const btn  = document.getElementById('mapImportConfirm');
      const bar  = document.getElementById('mapImportBar');
      const txt  = document.getElementById('mapImportProgressText');
      document.getElementById('mapImportProgress').style.display='block';
      btn.disabled=true; btn.innerHTML='<i class="ri-loader-4-line spin"></i> Importing…';
      bar.style.width='30%'; txt.textContent='Sending to server…';
      try {
        const res = await fetch('/api/map/sites/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sites:parsedRows})});
        const result = await res.json();
        bar.style.width='100%';
        if (!res.ok) { showToast('Import failed: '+(result.error||'Unknown'),'error'); return; }
        txt.textContent=`Done — ${result.inserted} inserted, ${result.skipped} skipped.`;
        showToast(`Imported ${result.inserted} site(s).`, result.inserted>0?'success':'error');
        setTimeout(async()=>{ close(); const r2=await fetch('/api/map/sites'); allSites=await r2.json(); plotMarkers(allSites); applyFilters(); }, 1200);
      } catch(err) { showToast('Network error: '+err.message,'error'); }
      finally { btn.disabled=false; btn.innerHTML='<i class="ri-upload-2-line"></i> Import'; }
    };
  });

  // ── Load sites ────────────────────────────────────────────────────────────
  async function loadSites() {
    try {
      const res = await fetch('/api/map/sites');
      allSites  = await res.json();

      // Populate dropdowns
      const projects  = [...new Set(allSites.map(s=>s.project_name).filter(Boolean))].sort();
      const provinces = [...new Set(allSites.map(s=>s.province).filter(Boolean))].sort();
      const pjSel = document.getElementById('mapProjectFilter');
      const pvSel = document.getElementById('mapProvinceFilter');
      projects.forEach(p  => { const o=document.createElement('option'); o.value=o.textContent=p; pjSel.appendChild(o); });
      provinces.forEach(p => { const o=document.createElement('option'); o.value=o.textContent=p; pvSel.appendChild(o); });

      // Restore saved filter state
      if (savedState.search)   { const el=document.getElementById('mapSearch');        if(el){el.value=savedState.search; document.getElementById('mapSearchClear')?.classList.toggle('hidden',!savedState.search);} }
      if (savedState.project)  { const el=document.getElementById('mapProjectFilter'); if(el) el.value=savedState.project; }
      if (savedState.province) { const el=document.getElementById('mapProvinceFilter');if(el) el.value=savedState.province; }
      if (savedState.status)   { const el=document.getElementById('mapStatusFilter');  if(el) el.value=savedState.status; }

      plotMarkers(allSites);
      applyFilters();
      updateMapStats(allSites);

      // Restore selected site
      if (savedState.selectedSite) {
        const site = allSites.find(s => s.site_name === savedState.selectedSite);
        const marker = site ? allMarkers[site.site_name] : null;
        if (site) selectSite(site, marker);
      }

      showToast(`${allSites.length} sites loaded.`, 'success');
    } catch {
      const el = document.getElementById('mapSiteList');
      if (el) el.innerHTML = '<div class="map-list-empty"><i class="ri-error-warning-line"></i> Failed to load sites.</div>';
    }
  }

  loadSites();

  // ESC to close panel
  document.addEventListener('keydown', function onMapEsc(e) {
    if (e.key !== 'Escape') return;
    const panel = document.getElementById('mapDetailsPanel');
    if (panel && !panel.classList.contains('hidden')) {
      panel.classList.remove('map-panel-visible');
      setTimeout(() => panel.classList.add('hidden'), 200);
      document.querySelector('.map-page-wrap')?.classList.remove('details-open');
      if (selectedSite) { const mk=allMarkers[selectedSite.site_name]; if(mk) mk.setIcon(siteIcon(selectedSite,false)); }
      document.querySelectorAll('.map-list-item').forEach(el=>el.classList.remove('selected'));
      selectedSite = null;
    }
    if (!document.getElementById('mapContainer')) document.removeEventListener('keydown', onMapEsc);
  });
}
/* ================= TERMINALS ================= */

let terminalData = [];
let terminalCurrentRegion = null;
let terminalImportFile = null;
let terminalFiltered = [];
let terminalPage = 1;
const terminalRowsPerPage = 10;
let terminalSortCol = null;
let terminalSortDir = 1;
let terminalSelectedRows = new Set();
let terminalSelectMode = false;

async function loadTerminals() {
  terminalData        = [];
  terminalFiltered    = [];
  terminalPage        = 1;
  terminalSelectMode  = false;
  terminalSelectedRows = new Set();
  terminalSortCol     = null;
  terminalSortDir     = 1;
  terminalCurrentRegion = null;
  
  mainContent.innerHTML = `
    <div class="terminals-header">
      <h2><i class="ri-computer-line"></i> Terminals</h2>
      <div class="terminals-actions">
        <div class="search-box">
          <i class="ri-search-line"></i>
          <input type="text" id="terminalSearch" placeholder="Search here…">
        </div>
      </div>
    </div>

    <!-- Region selection view -->
    <div id="termRegionView">
      <div class="term-region-card">
        <div class="term-region-header">
          <i class="ri-map-pin-2-line"></i>
          <div>
            <h3>Select a Region</h3>
            <p>Choose a region to view or manage its terminal records.</p>
          </div>
        </div>
        <div class="term-region-body">
          <div class="term-region-controls-row">
            <select id="termRegionSelect" class="term-region-select">
              <option value="">— Select Region —</option>
            </select>
            <button class="tool-btn" id="termNewRegionBtn"><i class="ri-add-line"></i> Add New Region</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Terminal table view (hidden until region selected) -->
    <div id="termTableView" class="hidden">
      <div class="table-card">
        <div class="table-card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span id="regionTitle" class="table-title-text">Records</span>
          </div>
          <div class="table-tools">
            <button class="tool-btn" id="btnAdd"><i class="ri-add-line"></i> Add</button>
            <button class="tool-btn" id="btnSortFilter"><i class="ri-sliders-h-line"></i> Sort & Filter</button>
            <button class="tool-btn" id="btnSelect"><i class="ri-checkbox-multiple-line"></i> Select</button>
          </div>
        </div>

        <div id="sortFilterBar" class="filter-bar hidden">
          <div class="filter-group">
            <label>Province</label>
            <input type="text" id="filterProvince" placeholder="e.g. BENGUET">
          </div>
          <div class="filter-group">
            <label>Municipality</label>
            <input type="text" id="filterMuni" placeholder="e.g. ATOK">
          </div>
          <div class="filter-group">
            <label>Region</label>
            <input type="text" id="filterRegion" placeholder="e.g. CAR">
          </div>
          <div class="filter-sort-divider"></div>
          <div class="filter-group">
            <label>Sort by</label>
            <select id="sortColSelect" style="padding:7px 10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;outline:none;background:white;"></select>
          </div>
          <button class="tool-btn" id="toggleSortDir">ASC</button>
          <button class="tool-btn apply-btn" id="applyFilterSort"><i class="ri-check-line"></i> Apply</button>
          <button class="tool-btn" id="clearFilterSort"><i class="ri-close-line"></i> Clear</button>
        </div>

        <div id="bulkActions" class="bulk-actions hidden">
          <label class="bulk-select-all-wrap" title="Select all rows">
            <input type="checkbox" id="bulkSelectAllChk">
            <span class="bulk-select-all-label"><i class="ri-check-double-line"></i> Select All</span>
          </label>
          <span class="bulk-divider"></span>
          <span class="bulk-count-badge" id="selectedCount"><i class="ri-checkbox-multiple-line"></i> 0 selected</span>
          <div class="bulk-spacer"></div>
          <button class="tool-btn" id="exportSelectedCsv"><i class="ri-download-2-line"></i> Export</button>
          <span class="bulk-divider"></span>
          <button class="tool-btn danger-btn" id="deleteSelected"><i class="ri-delete-bin-line"></i> Delete Selected</button>
          <button class="tool-btn" id="btnCancelSelect" title="Exit selection mode"><i class="ri-close-line"></i> Done</button>
        </div>

        <div class="table-wrapper terminals-table-wrapper">
          <table class="data-grid terminals-grid" id="terminalTable">
            <thead id="terminalThead"></thead>
            <tbody id="terminalTbody"></tbody>
          </table>
        </div>
        <div class="pagination-bar" id="terminalPagination"></div>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <div id="confirmDeleteModal" class="modal-overlay hidden">
      <div class="modal-box confirm-modal-box">
        <div class="confirm-modal-icon danger-icon"><i class="ri-delete-bin-2-line"></i></div>
        <h3 class="confirm-modal-title">Delete Records</h3>
        <p class="confirm-modal-msg" id="confirmDeleteMsg">Are you sure?</p>
        <div class="confirm-modal-actions">
          <button class="tool-btn" id="cancelDeleteBtn">Cancel</button>
          <button class="tool-btn danger-btn" id="confirmDeleteBtn"><i class="ri-delete-bin-line"></i> Yes, Delete</button>
        </div>
      </div>
    </div>

    <!-- Edit Row Modal -->
    <div id="editRowModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon" style="background:rgba(255,255,255,0.15)"><i class="ri-edit-line"></i></div>
          <div class="add-modal-title"><h3>Edit Terminal</h3><p>Update the details for this terminal entry.</p></div>
          <button class="modal-close-btn" id="cancelEditRow"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body"><div id="editRowFields" class="add-fields-grid"></div></div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Changes will be saved to the database</span>
          <div class="modal-actions">
            <button class="tool-btn" id="cancelEditRowFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="confirmEditRow"><i class="ri-save-line"></i> Save Changes</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Choice Modal -->
    <div id="addChoiceModal" class="modal-overlay hidden">
      <div class="add-choice-box">
        <div class="add-choice-header">
          <div class="add-choice-title">
            <i class="ri-add-circle-line"></i>
            <div>
              <div class="add-choice-heading">Add Terminal</div>
              <div class="add-choice-sub">How would you like to add records?</div>
            </div>
          </div>
          <button class="modal-close-btn" id="choiceModalClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-choice-options">
          <button class="add-choice-btn add-choice-primary" id="chooseManualBtn">
            <div class="add-choice-btn-icon"><i class="ri-edit-2-line"></i></div>
            <div class="add-choice-btn-text">
              <div class="add-choice-btn-label">Manual Entry</div>
              <div class="add-choice-btn-desc">Fill in a form to add one record</div>
            </div>
            <i class="ri-arrow-right-s-line add-choice-arrow"></i>
          </button>
          <button class="add-choice-btn add-choice-secondary" id="chooseImportBtn">
            <div class="add-choice-btn-icon"><i class="ri-upload-cloud-2-line"></i></div>
            <div class="add-choice-btn-text">
              <div class="add-choice-btn-label">Import File</div>
              <div class="add-choice-btn-desc">Upload CSV or XLSX to bulk import</div>
            </div>
            <i class="ri-arrow-right-s-line add-choice-arrow"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Manual Add Row Modal -->
    <div id="addRowModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-router-line"></i></div>
          <div class="add-modal-title"><h3>Add New Terminal</h3><p>Fill in the details to register a new terminal entry.</p></div>
          <button class="modal-close-btn" id="cancelAddRow"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body"><div id="addRowFields" class="add-fields-grid"></div></div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> All fields are optional unless marked</span>
          <div class="modal-actions">
            <button class="tool-btn small-btn" id="cancelAddRowFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="confirmAddRow"><i class="ri-save-line"></i> Save Terminal</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Import File Modal -->
    <div id="importModal" class="modal-overlay hidden">
      <div class="modal-box" style="max-width:480px;padding:36px 32px;">
        <h3 style="margin:0 0 6px;font-size:20px;color:#1e293b;"><i class="ri-upload-cloud-2-line" style="color:#2f4b85"></i> Import Records</h3>
        <p style="color:#64748b;font-size:13px;margin:0 0 22px;">Upload a CSV or XLSX file. Column headers must match the database fields.</p>
        <div class="import-drop-zone" id="importDropZone">
          <i class="ri-file-upload-line" style="font-size:36px;color:#2f4b85;"></i>
          <p style="margin:8px 0 4px;font-weight:600;color:#1e293b;">Drop file here or click to browse</p>
          <p style="font-size:12px;color:#94a3b8;">CSV or XLSX, up to 50MB</p>
          <input type="file" id="importFileInput" accept=".csv,.xlsx,.xls" class="hidden">
        </div>
        <div id="importFileName" style="font-size:13px;color:#2f4b85;margin:10px 0 0;min-height:18px;"></div>
        <div id="importProgress" style="display:none;margin-top:14px;">
          <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
            <div id="importProgressBar" style="height:100%;background:#2f4b85;width:0%;transition:width 0.3s;border-radius:99px;"></div>
          </div>
          <div id="importProgressText" style="font-size:12px;color:#64748b;margin-top:6px;"></div>
        </div>
        <div class="modal-actions" style="margin-top:20px;">
          <button class="tool-btn" id="importCancelBtn">Cancel</button>
          <button class="tool-btn apply-btn" id="importConfirmBtn" disabled><i class="ri-upload-2-line"></i> Import</button>
        </div>
      </div>
    </div>

    <!-- New Region Modal -->
    <div id="newRegionModal" class="modal-overlay hidden">
      <div class="modal-box" style="max-width:400px;padding:32px;">
        <h3 style="margin:0 0 6px;font-size:18px;color:#1e293b;"><i class="ri-map-pin-add-line" style="color:#2f4b85"></i> Add New Region</h3>
        <p style="color:#64748b;font-size:13px;margin:0 0 18px;">Enter the name of the new region to add it to the system.</p>
        <input type="text" id="newRegionInput" class="add-field-input" placeholder="e.g. MOUNTAIN PROVINCE" style="width:100%;box-sizing:border-box;">
        <div class="modal-actions" style="margin-top:16px;">
          <button class="tool-btn" id="newRegionCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="newRegionConfirm"><i class="ri-save-line"></i> Create Region</button>
        </div>
      </div>
    </div>
  `;

  
  // Load regions into dropdown
  fetchRegions();

  // Search
  document.getElementById('terminalSearch').addEventListener('input', () => {
    applyTerminalSearch(); renderTerminalTable(); renderTerminalPagination();
  });

  // Region select
  document.getElementById('termRegionSelect').addEventListener('change', function () {
    const sel = document.getElementById('termRegionSelect');
    const region = sel.value;
    if (!region) return;
    terminalCurrentRegion = region;
    localStorage.setItem(`selectedRegion_terminals_${user?.id || 'guest'}`, region);
    document.getElementById('regionTitle').textContent = region + ' Records';
    document.getElementById('termRegionView').classList.add('hidden');
    document.getElementById('termTableView').classList.remove('hidden');
    fetchTerminals(region);
  });

  
  // Add New Region
  document.getElementById('termNewRegionBtn').addEventListener('click', () => {
    document.getElementById('newRegionInput').value = '';
    document.getElementById('newRegionModal').classList.remove('hidden');
  });
  document.getElementById('newRegionCancel').addEventListener('click', () => document.getElementById('newRegionModal').classList.add('hidden'));
  document.getElementById('newRegionModal').addEventListener('click', e => { if (e.target === document.getElementById('newRegionModal')) document.getElementById('newRegionModal').classList.add('hidden'); });
  document.getElementById('newRegionConfirm').addEventListener('click', async () => {
    const name = document.getElementById('newRegionInput').value.trim();
    if (!name) { showToast('Region name is required.', 'error'); return; }
    const btn = document.getElementById('newRegionConfirm');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Creating…';
    try {
      const res = await fetch('/api/regions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region_name: name }) });
      const result = await res.json();
      if (!res.ok) { showToast('Failed: ' + (result.error || 'Unknown'), 'error'); return; }
      showToast(`Region "${result.region_name}" created.`, 'success');
      document.getElementById('newRegionModal').classList.add('hidden');
      await fetchRegions();
      // Auto-select the new region
      document.getElementById('termRegionSelect').value = result.region_name;
      document.getElementById('termGoBtn').disabled = false;
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Create Region'; }
  });

  // Sort/Filter bindings (wired after table view shown)
  document.getElementById('btnSortFilter').addEventListener('click', () => {
    document.getElementById('sortFilterBar').classList.toggle('hidden');
    document.getElementById('btnSortFilter').classList.toggle('active-tool', !document.getElementById('sortFilterBar').classList.contains('hidden'));
  });

  document.getElementById('btnSelect').addEventListener('click', () => {
    terminalSelectMode = !terminalSelectMode;
    terminalSelectedRows.clear();
    document.getElementById('btnSelect').classList.toggle('active-tool', terminalSelectMode);
    document.getElementById('bulkActions').classList.toggle('hidden', !terminalSelectMode);
    renderTerminalTable();
  });

  // Bulk Select All checkbox — selects ALL filtered rows across all pages
  document.addEventListener('change', function(e) {
    if (e.target.id !== 'bulkSelectAllChk') return;
    if (e.target.checked) {
      terminalFiltered.forEach((_, i) => terminalSelectedRows.add(i));
    } else {
      terminalSelectedRows.clear();
    }
    updateSelectedCount();
    renderTerminalTable();
  });

  // Done / Cancel select mode
  document.getElementById('btnCancelSelect').addEventListener('click', () => {
    terminalSelectMode = false;
    terminalSelectedRows.clear();
    document.getElementById('btnSelect')?.classList.remove('active-tool');
    document.getElementById('bulkActions')?.classList.add('hidden');
    const chk = document.getElementById('bulkSelectAllChk');
    if (chk) { chk.checked = false; chk.indeterminate = false; }
    renderTerminalTable();
    updateSelectedCount();
  });

  document.getElementById('deleteSelected').addEventListener('click', async () => {
    if (!terminalSelectedRows.size) { showToast('No rows selected.', 'error'); return; }
    const toDelete = Array.from(terminalSelectedRows).map(i => terminalFiltered[i]);
    showConfirmDeleteModal(toDelete.length, async () => {
      const btn = document.getElementById('deleteSelected');
      btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Deleting…';
      try {
        const ids = toDelete.map(r => r.id);
        const res = await fetch(`/api/terminals/${encodeURIComponent(terminalCurrentRegion)}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
        });
        const result = await res.json();
        if (!res.ok) { showToast('Delete failed: ' + (result.error || 'Unknown'), 'error'); return; }
        const delSet = new Set(toDelete);
        terminalFiltered = terminalFiltered.filter(r => !delSet.has(r));
        terminalData     = terminalData.filter(r => !delSet.has(r));
        terminalSelectedRows.clear(); updateSelectedCount();
        const maxPage = Math.max(1, Math.ceil(terminalFiltered.length / terminalRowsPerPage));
        if (terminalPage > maxPage) terminalPage = maxPage;
        renderTerminalTable(); renderTerminalPagination();
        showToast(`${result.deleted} record(s) deleted.`, 'success');
        dashboardDataChanged();
      } catch { showToast('Network error.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete Selected'; }
    });
  });

  // Export CSV
  document.getElementById('exportSelectedCsv').addEventListener('click', () => {
    if (!terminalSelectedRows.size) { showToast('No rows selected.', 'error'); return; }
    const rows = Array.from(terminalSelectedRows).sort((a,b)=>a-b).map(i => terminalFiltered[i]);
    const cols = Object.keys(rows[0]);
    const esc  = v => { const s = String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
    const csv  = [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `terminals_${terminalCurrentRegion}_${Date.now()}.csv`; a.click();
    showToast(`${rows.length} rows exported to CSV.`, 'success');
  });

  // Add button → choice modal
  document.getElementById('btnAdd').addEventListener('click', () => {
    document.getElementById('addChoiceModal').classList.remove('hidden');
  });
  document.getElementById('choiceModalClose').addEventListener('click', () => document.getElementById('addChoiceModal').classList.add('hidden'));
  document.getElementById('addChoiceModal').addEventListener('click', e => { if (e.target === document.getElementById('addChoiceModal')) document.getElementById('addChoiceModal').classList.add('hidden'); });
  document.getElementById('chooseManualBtn').addEventListener('click', () => {
    document.getElementById('addChoiceModal').classList.add('hidden');
    openAddModal();
  });
  document.getElementById('chooseImportBtn').addEventListener('click', () => {
    document.getElementById('addChoiceModal').classList.add('hidden');
    openImportModal();
  });

  // Import modal
  bindImportModal();

  // Sort/filter apply
  document.getElementById('toggleSortDir').addEventListener('click', function () {
    terminalSortDir *= -1;
    this.innerHTML = terminalSortDir === 1 ? '<i class="ri-arrow-up-line"></i> ASC' : '<i class="ri-arrow-down-line"></i> DESC';
  });
  document.getElementById('applyFilterSort').addEventListener('click', () => {
    const prov = document.getElementById('filterProvince').value.trim().toUpperCase();
    const muni = document.getElementById('filterMuni').value.trim().toUpperCase();
    const reg  = document.getElementById('filterRegion').value.trim().toUpperCase();
    const col  = document.getElementById('sortColSelect').value;
    terminalFiltered = terminalData.filter(row =>
      (!prov || String(row['PROVINCE']??'').toUpperCase().includes(prov)) &&
      (!muni || String(row['MUNICIPALITY']??'').toUpperCase().includes(muni)) &&
      (!reg  || String(row['REGION']??'').toUpperCase().includes(reg))
    );
    if (col) terminalFiltered.sort((a, b) => String(a[col]??'').localeCompare(String(b[col]??''), undefined, { numeric: true }) * terminalSortDir);
    terminalPage = 1; renderTerminalTable(); renderTerminalPagination();
    document.getElementById('sortFilterBar').classList.add('hidden');
    document.getElementById('btnSortFilter').classList.remove('active-tool');
  });
  document.getElementById('clearFilterSort').addEventListener('click', () => {
    terminalFiltered = [...terminalData]; terminalSortCol = null; terminalSortDir = 1;
    ['filterProvince','filterMuni','filterRegion'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('toggleSortDir').innerHTML = '<i class="ri-arrow-up-line"></i> ASC';
    terminalPage = 1; renderTerminalTable(); renderTerminalPagination();
  });
}

async function fetchRegions() {
  try {
    const res  = await fetch('/api/regions');
    const data = await res.json();
    const sel  = document.getElementById('termRegionSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Region —</option>' +
      data.map(r => `<option value="${r.region_name}">${r.region_name}</option>`).join('');

    // Restore saved region (per user), fallback to first; only if none already active
    if (data.length > 0 && !terminalCurrentRegion) {
      const saved       = localStorage.getItem(`selectedRegion_terminals_${user?.id || 'guest'}`);
      const names       = data.map(r => r.region_name);
      const regionToUse = (saved && names.includes(saved)) ? saved : data[0].region_name;
      sel.value = regionToUse;
      terminalCurrentRegion = regionToUse;
      const titleEl = document.getElementById('regionTitle');
      if (titleEl) titleEl.textContent = regionToUse + ' Records';
      document.getElementById('termRegionView')?.classList.add('hidden');
      document.getElementById('termTableView')?.classList.remove('hidden');
      fetchTerminals(regionToUse);
    }
  } catch { showToast('Could not load regions.', 'error'); }
}

function openImportModal() {
  terminalImportFile = null;
  const fileInput = document.getElementById('importFileInput');
  const nameEl    = document.getElementById('importFileName');
  const confirmBtn = document.getElementById('importConfirmBtn');
  const prog      = document.getElementById('importProgress');
  const bar       = document.getElementById('importProgressBar');
  if (nameEl)     nameEl.textContent = '';
  if (confirmBtn) confirmBtn.disabled = true;
  if (prog)       prog.style.display = 'none';
  if (bar)        bar.style.width = '0%';
  if (fileInput)  fileInput.value = '';
  document.getElementById('importModal').classList.remove('hidden');
}

function bindImportModal() {
  const dropZone   = document.getElementById('importDropZone');
  const fileInput  = document.getElementById('importFileInput');
  const nameEl     = document.getElementById('importFileName');
  const confirmBtn = document.getElementById('importConfirmBtn');
  const cancelBtn  = document.getElementById('importCancelBtn');

  const setFile = (f) => {
    if (!f) return;
    terminalImportFile = f;
    nameEl.textContent = f.name;
    confirmBtn.disabled = false;
  };

  const closeImport = () => {
    document.getElementById('importModal').classList.add('hidden');
    terminalImportFile = null;
    nameEl.textContent = '';
    confirmBtn.disabled = true;
    fileInput.value = '';
    document.getElementById('importProgress').style.display = 'none';
    document.getElementById('importProgressBar').style.width = '0%';
  };

  dropZone.onclick     = () => fileInput.click();
  fileInput.onclick    = e => e.stopPropagation();
  cancelBtn.onclick    = closeImport;
  document.getElementById('importModal').onclick = e => {
    if (e.target === document.getElementById('importModal')) closeImport();
  };
  dropZone.ondragover  = e => { e.preventDefault(); dropZone.classList.add('drop-hover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('drop-hover');
  dropZone.ondrop      = e => { e.preventDefault(); dropZone.classList.remove('drop-hover'); setFile(e.dataTransfer.files[0]); };
  fileInput.onchange   = function () { setFile(this.files[0]); };

  confirmBtn.onclick = async () => {
    if (!terminalImportFile || !terminalCurrentRegion) {
      showToast('Please select a file first.', 'error'); return;
    }
    const btn = confirmBtn;
    const prog = document.getElementById('importProgress');
    const bar  = document.getElementById('importProgressBar');
    const txt  = document.getElementById('importProgressText');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Importing…';
    prog.style.display = 'block'; bar.style.width = '30%'; txt.textContent = 'Uploading file…';
    const fd = new FormData();
    fd.append('file', terminalImportFile);
    try {
      bar.style.width = '60%'; txt.textContent = 'Processing rows…';
      const res    = await fetch('/api/terminals/' + encodeURIComponent(terminalCurrentRegion) + '/import', { method: 'POST', body: fd });
      const result = await res.json();
      bar.style.width = '100%';
      if (!res.ok) { showToast('Import failed: ' + (result.error || 'Unknown'), 'error'); return; }
      const unmappedList = result.unmappedColumns && result.unmappedColumns.length
        ? ' | Unrecognised: ' + result.unmappedColumns.slice(0,3).join(', ') + (result.unmappedColumns.length > 3 ? '…' : '')
        : '';
      txt.textContent = 'Imported ' + result.inserted + ' of ' + result.total + ' rows — ' + (result.mappedColumns || 0) + ' columns matched, ' + (result.skipped || 0) + ' skipped.' + unmappedList;
      if (result.inserted > 0) {
        let msg = 'Imported ' + result.inserted + ' record' + (result.inserted !== 1 ? 's' : '') + ' successfully.';
        if (result.unmappedColumns && result.unmappedColumns.length)
          msg += ' ' + result.unmappedColumns.length + ' unrecognised column(s) ignored.';
        showToast(msg, 'success');
      } else {
        const errDetail = (result.errors && result.errors[0]) || result.error || 'Check that your file has the correct column headers.';
        showToast('Import failed — 0 records inserted. ' + errDetail, 'error');
      }
      setTimeout(() => { closeImport(); fetchTerminals(terminalCurrentRegion); }, 1400);
    } catch (err) {
      showToast('Network error during import.', 'error');
      console.error('Import error:', err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-upload-2-line"></i> Import';
    }
  };
}


function toggleBar(id) { document.getElementById(id).classList.toggle("hidden"); }
function hideBar(id) { document.getElementById(id).classList.add("hidden"); }
function capitalize(word) { return word.charAt(0).toUpperCase() + word.slice(1); }

async function fetchTerminals(region) {
  const tbody = document.getElementById("terminalTbody");
  const thead = document.getElementById("terminalThead");
  tbody.innerHTML = `<tr><td colspan="20" class="loading-cell"><i class="ri-loader-4-line spin"></i> Loading data…</td></tr>`;
  thead.innerHTML = "";
  try {
    const res = await fetch(`/api/terminals/${encodeURIComponent(region)}`);
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="20" class="empty-cell"><i class="ri-inbox-line"></i> No records found</td></tr>`;
      return;
    }
    const allCols = Object.keys(data[0]);
    const cleaned = data.filter(row => {
      const valueCols = allCols.slice(1);
      return valueCols.some(col => { const v = row[col]; return v !== null && v !== undefined && String(v).trim() !== ""; });
    });
    terminalData = cleaned;
    terminalFiltered = [...cleaned];
    terminalPage = 1;
    const cols = Object.keys(data[0]);
    const sortSel = document.getElementById("sortColSelect");
    sortSel.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join("");
    renderTerminalTable();
    renderTerminalPagination();
  } catch (err) {
    console.error("Fetch error:", err);
    document.getElementById("terminalTbody").innerHTML = `<tr><td colspan="20" class="error-cell"><i class="ri-error-warning-line"></i> Error loading data</td></tr>`;
  }
}

function renderTerminalTable() {
  const thead = document.getElementById("terminalThead");
  const tbody = document.getElementById("terminalTbody");
  if (!terminalFiltered.length) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td class="empty-cell"><i class="ri-search-line"></i> No results match your search</td></tr>`;
    return;
  }
  const columns = Object.keys(terminalFiltered[0]);
  const visibleColumns = columns.filter(col => col !== 'id');
  const start = (terminalPage - 1) * terminalRowsPerPage;
  const pageData = terminalFiltered.slice(start, start + terminalRowsPerPage);
  thead.innerHTML = `
    <tr>
      ${terminalSelectMode ? '<th class="select-col"><input type="checkbox" id="selectAll"></th>' : ''}
      ${visibleColumns.map(col => `<th>${col}</th>`).join("")}
      <th class="actions-col">Actions</th>
    </tr>
  `;
  if (terminalSelectMode) {
    document.getElementById("selectAll").addEventListener("change", function () {
      pageData.forEach((_, i) => { const idx = start + i; if (this.checked) terminalSelectedRows.add(idx); else terminalSelectedRows.delete(idx); });
      updateSelectedCount(); renderTerminalTable();
    });
  }
  tbody.innerHTML = pageData.map((row, i) => {
    const globalIdx = start + i;
    const isChecked = terminalSelectedRows.has(globalIdx);
    return `
      <tr class="${isChecked ? 'selected-row' : ''}" data-idx="${globalIdx}">
        ${terminalSelectMode ? `<td class="select-col"><input type="checkbox" class="row-check" ${isChecked ? 'checked' : ''}></td>` : ''}
        ${visibleColumns.map(col => `<td>${row[col] ?? ''}</td>`).join("")}
        <td class="actions-col">
          <button class="row-action-btn edit-btn" data-idx="${globalIdx}" title="Edit"><i class="ri-edit-line"></i></button>
          <button class="row-action-btn delete-single-btn" data-idx="${globalIdx}" title="Delete"><i class="ri-delete-bin-line"></i></button>
        </td>
      </tr>
    `;
  }).join("");
  if (terminalSelectMode) {
    document.querySelectorAll(".row-check").forEach((cb, i) => {
      cb.addEventListener("change", function () {
        const idx = start + i;
        if (this.checked) terminalSelectedRows.add(idx); else terminalSelectedRows.delete(idx);
        updateSelectedCount(); this.closest("tr").classList.toggle("selected-row", this.checked);
      });
    });
  }
  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(parseInt(btn.getAttribute("data-idx"))));
  });
  document.querySelectorAll(".delete-single-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"));
      const row = terminalFiltered[idx];
      showConfirmDeleteModal(1, async () => {
        const region = document.getElementById("regionSelect").value;
        const firstCol = Object.keys(row)[0];
        try {
          const res = await fetch(`/api/terminals/${region}`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [row.id] })
          });
          const result = await res.json();
          if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown error"), "error"); return; }
          terminalFiltered = terminalFiltered.filter(r => r !== row);
          terminalData = terminalData.filter(r => r !== row);
          const maxPage = Math.max(1, Math.ceil(terminalFiltered.length / terminalRowsPerPage));
          if (terminalPage > maxPage) terminalPage = maxPage;
          renderTerminalTable(); renderTerminalPagination();
          showToast("Record deleted successfully.", "success");
          dashboardDataChanged();
        } catch (err) { showToast("Network error — could not delete record.", "error"); }
      });
    });
  });
}

function ensureConfirmDeleteModal() {
  if (document.getElementById("confirmDeleteModal")) return;

  const modal = document.createElement("div");
  modal.id = "confirmDeleteModal";
  modal.className = "modal-overlay hidden";
  modal.innerHTML = `
    <div class="modal-box confirm-modal-box">
      <div class="confirm-modal-icon danger-icon"><i class="ri-delete-bin-2-line"></i></div>
      <h3 class="confirm-modal-title">Delete Records</h3>
      <p class="confirm-modal-msg" id="confirmDeleteMsg">Are you sure?</p>
      <div class="confirm-modal-actions">
        <button class="tool-btn" id="cancelDeleteBtn">Cancel</button>
        <button class="tool-btn danger-btn" id="confirmDeleteBtn"><i class="ri-delete-bin-line"></i> Yes, Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function showConfirmDeleteModal(count, onConfirm) {
  ensureConfirmDeleteModal();

  const modal = document.getElementById("confirmDeleteModal");
  document.getElementById("confirmDeleteMsg").innerHTML =
    `You are about to permanently delete <strong>${count} record${count > 1 ? 's' : ''}</strong>.<br>This action <strong>cannot be undone</strong>.`;

  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const cancelBtn = document.getElementById("cancelDeleteBtn");
  const newConfirm = confirmBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);

  confirmBtn.replaceWith(newConfirm);
  cancelBtn.replaceWith(newCancel);

  const close = () => modal.classList.add("hidden");

  modal.classList.remove("hidden");
  document.getElementById("cancelDeleteBtn").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    close();
    await onConfirm();
  };
}

function openEditModal(idx) {
  const row = terminalFiltered[idx];
  if (!row) return;
  const cols = Object.keys(row);
  const getIcon = (col) => {
    const c = col.toLowerCase();
    if (c.includes("name") || c.includes("site")) return "ri-map-pin-line";
    if (c.includes("province") || c.includes("region")) return "ri-earth-line";
    if (c.includes("munic") || c.includes("city")) return "ri-building-line";
    if (c.includes("mac") || c.includes("airmac") || c.includes("modem")) return "ri-router-line";
    if (c.includes("phase")) return "ri-git-branch-line";
    if (c.includes("date") || c.includes("time")) return "ri-calendar-line";
    if (c.includes("status")) return "ri-checkbox-circle-line";
    return "ri-input-field";
  };
  document.getElementById("editRowFields").innerHTML = cols.filter(col => col !== 'id').map(col => `
    <div class="add-field-item">
      <label class="add-field-label"><i class="${getIcon(col)}"></i> ${col}</label>
      <input type="text" data-col="${col}" class="add-field-input edit-field-input"
        value="${String(row[col] ?? '').replace(/"/g, '&quot;')}" autocomplete="off">
    </div>
  `).join("");
  const modal = document.getElementById("editRowModal");
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("cancelEditRow").onclick = close;
  document.getElementById("cancelEditRowFooter").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.getElementById("confirmEditRow").onclick = async () => {
    const updatedRow = {};
    cols.forEach(col => { const input = modal.querySelector(`[data-col="${col}"]`); updatedRow[col] = input ? input.value.trim() : row[col]; });
    const saveBtn = document.getElementById("confirmEditRow");
    saveBtn.disabled = true; saveBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    const region = document.getElementById("regionSelect").value;
    const firstCol = cols[0];
    try {
      const res = await fetch(`/api/terminals/${encodeURIComponent(terminalCurrentRegion)}/${row.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: updatedRow })
      });
      const result = await res.json();
      if (!res.ok) { showToast("Update failed: " + (result.error || "Unknown error"), "error"); return; }
      const saved = result.row || updatedRow;
      const fIdx = terminalFiltered.indexOf(row); const dIdx = terminalData.indexOf(row);
      if (fIdx !== -1) terminalFiltered[fIdx] = saved;
      if (dIdx !== -1) terminalData[dIdx] = saved;
      renderTerminalTable(); close(); showToast("Record updated successfully.", "success");
    } catch (err) { showToast("Network error — could not update record.", "error"); }
    finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ri-save-line"></i> Save Changes'; }
  };
}

function openAddModal() {
  if (!terminalData.length) return;
  const cols = Object.keys(terminalData[0]);
  const getIcon = (col) => {
    const c = col.toLowerCase();
    if (c.includes("name") || c.includes("site")) return "ri-map-pin-line";
    if (c.includes("province") || c.includes("region")) return "ri-earth-line";
    if (c.includes("munic") || c.includes("city")) return "ri-building-line";
    if (c.includes("mac") || c.includes("airmac") || c.includes("modem")) return "ri-router-line";
    if (c.includes("phase")) return "ri-git-branch-line";
    if (c.includes("date") || c.includes("time")) return "ri-calendar-line";
    if (c.includes("status")) return "ri-checkbox-circle-line";
    return "ri-input-field";
  };
  document.getElementById("addRowFields").innerHTML = cols.filter(col => col !== 'id').map(col => `
    <div class="add-field-item">
      <label class="add-field-label"><i class="${getIcon(col)}"></i> ${col}</label>
      <input type="text" data-col="${col}" class="add-field-input" placeholder="Enter ${col.toLowerCase()}…" autocomplete="off">
    </div>
  `).join("");
  const modal = document.getElementById("addRowModal");
  modal.classList.remove("hidden");
  const closeModal = () => modal.classList.add("hidden");
  document.getElementById("cancelAddRow").onclick = closeModal;
  document.getElementById("cancelAddRowFooter").onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  document.getElementById("confirmAddRow").onclick = async () => {
    const newRow = {};
    cols.forEach(col => { const input = document.querySelector(`[data-col="${col}"]`); newRow[col] = input ? input.value.trim() : ""; });
    const saveBtn = document.getElementById("confirmAddRow");
    saveBtn.disabled = true; saveBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const region = document.getElementById("regionSelect").value;
      const res = await fetch(`/api/terminals/${region}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow)
      });
      const result = await res.json();
      if (!res.ok) { alert("Failed to save: " + (result.error || "Unknown error")); return; }
      const saved = result.row || newRow;
      terminalData.unshift(saved); terminalFiltered = [...terminalData];
      terminalPage = 1; renderTerminalTable(); renderTerminalPagination(); closeModal();
    } catch (err) { console.error("Save error:", err); alert("Network error — could not save the terminal."); }
    finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ri-save-line"></i> Save Terminal'; }
  };
}

function updateProbSelectedCount() {
  const n     = probSelectedRows.size;
  const total = probFiltered.length;
  const el    = document.getElementById("probSelectedCount");
  if (el) el.innerHTML = `<i class="ri-checkbox-multiple-line"></i> ${n} of ${total} selected`;
  const chk = document.getElementById("probBulkSelectAllChk");
  if (chk) {
    chk.checked       = total > 0 && n === total;
    chk.indeterminate = n > 0 && n < total;
  }
}

function updateSelectedCount() {
  const n   = terminalSelectedRows.size;
  const total = terminalFiltered.length;
  const el  = document.getElementById("selectedCount");
  if (el) el.innerHTML = `<i class="ri-checkbox-multiple-line"></i> ${n} of ${total} selected`;
  // Sync Select All checkbox state against ALL filtered rows
  const chk = document.getElementById("bulkSelectAllChk");
  if (chk) {
    chk.checked       = total > 0 && n === total;
    chk.indeterminate = n > 0 && n < total;
  }
}

function renderTerminalPagination() {
  const container = document.getElementById("terminalPagination");
  const total = Math.ceil(terminalFiltered.length / terminalRowsPerPage);
  if (total <= 1) { container.innerHTML = ""; return; }
  const start = (terminalPage - 1) * terminalRowsPerPage + 1;
  const end = Math.min(terminalPage * terminalRowsPerPage, terminalFiltered.length);
  let pages = [];
  pages.push({ label: '<i class="ri-arrow-left-s-line"></i>', page: terminalPage - 1, disabled: terminalPage === 1 });
  getPageRange(terminalPage, total).forEach(p => {
    if (p === '...') pages.push({ label: '…', page: null, dots: true });
    else pages.push({ label: p, page: p, active: p === terminalPage });
  });
  pages.push({ label: '<i class="ri-arrow-right-s-line"></i>', page: terminalPage + 1, disabled: terminalPage === total });
  container.innerHTML = `
    <span class="page-info">Showing ${start}–${end} of ${terminalFiltered.length}</span>
    <div class="page-buttons">
      ${pages.map(p => `<button class="page-btn ${p.active ? 'active' : ''} ${p.disabled ? 'disabled' : ''} ${p.dots ? 'dots' : ''}"
        ${p.page && !p.disabled && !p.dots ? `onclick="goTerminalPage(${p.page})"` : ''} ${p.disabled ? 'disabled' : ''}>${p.label}</button>`).join("")}
    </div>
  `;
}

function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function goTerminalPage(page) {
  terminalPage = page; renderTerminalTable(); renderTerminalPagination();
  document.querySelector(".terminals-table-wrapper").scrollTop = 0;
}

function applyTerminalSearch() {
  const q = document.getElementById("terminalSearch").value.toLowerCase();
  terminalFiltered = terminalData.filter(row => Object.values(row).some(v => String(v ?? "").toLowerCase().includes(q)));
}

/* ================= TOAST ================= */

function showToast(message, type = "success") {
  const existing = document.getElementById("toastNotif");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "toastNotif";
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="${type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("toast-show"), 10);
  setTimeout(() => { toast.classList.remove("toast-show"); setTimeout(() => toast.remove(), 400); }, 3500);
}

function showMessageNotificationToast({ senderName, preview, createdAt, onClick }) {
  let stack = document.getElementById('messageToastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'messageToastStack';
    stack.className = 'message-toast-stack';
    document.body.appendChild(stack);
  }

  const toast = document.createElement('button');
  toast.type = 'button';
  toast.className = 'message-toast';
  toast.innerHTML = `
    <div class="message-toast-icon"><i class="ri-message-3-line"></i></div>
    <div class="message-toast-body">
      <div class="message-toast-top">
        <strong>${escHtml(senderName || 'New message')}</strong>
        ${createdAt ? `<span>${escHtml(relativeTime(createdAt))}</span>` : ''}
      </div>
      <div class="message-toast-preview">${escHtml(preview || 'Sent a message')}</div>
    </div>
  `;
  toast.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 180);
    onClick?.();
  });
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 220);
  }, 4500);
}

function playMessageNotificationSound() {
  try {
    utMessageNotificationAudio ||= new Audio('/notification.mp3');
    utMessageNotificationAudio.currentTime = 0;
    utMessageNotificationAudio.play().catch(() => {});
  } catch {}
}

function unlockMessageNotificationSound() {
  if (utNotificationAudioUnlocked) return;
  utNotificationAudioUnlocked = true;
  try {
    utMessageNotificationAudio ||= new Audio('/notification.mp3');
    utMessageNotificationAudio.volume = 0.45;
  } catch {}
}
['click', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, unlockMessageNotificationSound, { once: true, passive: true });
});
setTimeout(() => startUtNotificationPolling(), 1000);

/* ================= DASHBOARD ================= */

// Dashboard state — declared before loadDashboard so they exist on first call
let _dashPrev        = {};
let _chartProbStatus = null;
let _chartTickets    = null;

function loadDashboard() {
  mainContent.innerHTML = `
    <div class="topbar">
      <div class="left">
        <div class="dash-greeting">
          <span class="dash-greeting-hi">Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},</span>
          <h2>${escHtml(user.full_name?.split(' ')[0] || 'there')} 👋</h2>
        </div>
      </div>
      <div class="right">
        <div class="search-box">
          <i class="ri-search-line"></i>
          <input type="text" placeholder="Search here…">
        </div>
        <button id="dashRefreshBtn" class="icon-btn" title="Refresh dashboard"><i class="ri-refresh-line"></i></button>
        <div class="dash-user-chip">
          <div class="dash-user-avatar">${user.full_name ? user.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : 'U'}</div>
          <div class="dash-user-info">
            <div class="dash-user-name">${escHtml(user.full_name || '—')}</div>
            <div class="dash-user-role">${escHtml(user.role || '—')}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="dash-header-row">
      <h3 class="section-title">Overview</h3>
      <span class="dash-last-updated" id="dashLastUpdated">—</span>
    </div>

    <!-- Stat cards -->
    <div class="cards" id="dashCards">
      <div class="card" id="dashCardSites">
        <div class="card-top">
          <div class="icon-box blue"><i class="ri-map-pin-2-line"></i></div>
          <div class="stat"><h1 class="counter" id="statTotalSites">—</h1><span class="trend" id="trendSites"></span></div>
        </div>
        <p>Total Sites</p>
      </div>
      <div class="card" id="dashCardActive">
        <div class="card-top">
          <div class="icon-box green"><i class="ri-shield-check-line"></i></div>
          <div class="stat"><h1 class="counter" id="statActiveSites">—</h1><span class="trend" id="trendActive"></span></div>
        </div>
        <p>Active Sites</p>
      </div>
      <div class="card alert-card" id="dashCardProb">
        <div class="card-top">
          <div class="icon-box orange pulse"><i class="ri-error-warning-line"></i></div>
          <div class="stat"><h1 class="counter" id="statProbSites">—</h1><span class="trend" id="trendProb"></span></div>
        </div>
        <p>Problematic Sites</p>
      </div>
      <div class="card" id="dashCardTickets">
        <div class="card-top">
          <div class="icon-box red"><i class="ri-ticket-2-line"></i></div>
          <div class="stat"><h1 class="counter" id="statOpenTickets">—</h1><span class="trend" id="trendTickets"></span></div>
        </div>
        <p>Open Tickets</p>
      </div>
    </div>

    <div class="dash-section-divider"></div>

    <!-- Charts row -->
    <div class="dash-charts-row">

      <!-- Donut: Problematic Sites by Status -->
      <div class="dash-chart-card">
        <div class="dash-chart-header">
          <div class="dash-chart-header-left">
            <div class="dash-chart-icon"><i class="ri-pie-chart-2-line"></i></div>
            <div>
              <div class="dash-chart-title">Sites by Status</div>
              <div class="dash-chart-sub">Problematic sites breakdown</div>
            </div>
          </div>
          <div class="dash-chart-badge" id="chartProbTotal">—</div>
        </div>
        <div class="dash-chart-wrap">
          <canvas id="chartProbStatus"></canvas>
        </div>
      </div>

      <!-- Bar: Ticket Summary -->
      <div class="dash-chart-card">
        <div class="dash-chart-header">
          <div class="dash-chart-header-left">
            <div class="dash-chart-icon dash-chart-icon-red"><i class="ri-ticket-2-line"></i></div>
            <div>
              <div class="dash-chart-title">Ticket Summary</div>
              <div class="dash-chart-sub">Open vs closed tickets</div>
            </div>
          </div>
          <div class="dash-chart-badge dash-chart-badge-red" id="chartTicketTotal">—</div>
        </div>
        <div class="dash-chart-wrap">
          <canvas id="chartTickets"></canvas>
        </div>
        <div class="dash-chart-legend" id="chartTicketLegend"></div>
      </div>

    </div>

    <!-- Recent tickets table -->
    <div class="table-container">
      <div class="table-title">
        <i class="ri-file-list-3-line"></i> Recent Tickets
        <span class="dash-view-all" id="dashViewAllTickets">View all →</span>
      </div>
      <table id="dashRecentTable">
        <thead>
          <tr><th>ID</th><th>Subject</th><th>Department</th><th>Status</th><th>Date</th></tr>
        </thead>
        <tbody id="dashRecentBody">
          <tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">
            <i class="ri-loader-4-line spin"></i> Loading…
          </td></tr>
        </tbody>
      </table>
    </div>
  `;

  // Manual refresh button
  document.getElementById('dashRefreshBtn').addEventListener('click', () => {
    document.getElementById('dashRefreshBtn').querySelector('i').style.animation = 'spin 0.5s linear';
    fetchDashboardStats(true);
    setTimeout(() => {
      const icon = document.getElementById('dashRefreshBtn')?.querySelector('i');
      if (icon) icon.style.animation = '';
    }, 600);
  });

  // Navigate to tickets on "View all"
  document.getElementById('dashViewAllTickets').addEventListener('click', () => openPage('ticket'));

  // Reset chart instances so they are recreated on each visit
  if (_chartProbStatus) { try { _chartProbStatus.destroy(); } catch(e) {} _chartProbStatus = null; }
  if (_chartTickets)    { try { _chartTickets.destroy();    } catch(e) {} _chartTickets    = null; }
  _dashPrev = {};

  // Fetch after a short paint delay
  if (window._dashInterval) clearInterval(window._dashInterval);
  setTimeout(() => {
    fetchDashboardStats(true);
    window._dashInterval = setInterval(() => {
      if (document.getElementById('dashCards')) fetchDashboardStats(false);
      else clearInterval(window._dashInterval);
    }, 30000);
  }, 50);
}

async function fetchDashboardStats(animate = false) {
  const fallback = {
    totalSites: 0, activeSites: 0, problematicSites: 0,
    totalTickets: 0, openTickets: 0,
    recentTickets: [], probByStatus: [], sitesByRegion: []
  };

  // Always render immediately with cached or fallback data so the page isn't blank
  if (animate) {
    updateDashCards(fallback, true);
    updateDashTable([]);
  }

  try {
    const res  = await fetch('/api/dashboard/stats');
    const data = res.ok ? await res.json() : fallback;

    updateDashCards(data, animate);
    updateDashCharts(data);
    updateDashTable(data.recentTickets || []);

    const el = document.getElementById('dashLastUpdated');
    if (el) el.textContent = 'Last updated: ' + new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    _dashPrev = data;
  } catch (e) {
    console.warn('Dashboard fetch error:', e);
    // Still render with zeros so the page shows something
    updateDashCards(fallback, animate);
    updateDashTable([]);
    const el = document.getElementById('dashLastUpdated');
    if (el) el.textContent = 'Could not reach server';
  }
}

function animateCounter(el, from, to, duration = 600) {
  if (!el) return;
  if (from === to) { el.textContent = to.toLocaleString(); return; }
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * ease).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = to.toLocaleString();
  };
  requestAnimationFrame(update);
}

function flashCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.remove('dash-card-flash');
  void card.offsetWidth; // reflow
  card.classList.add('dash-card-flash');
}

function updateDashCards(data, animate) {
  const cards = [
    { id: 'statTotalSites',  val: data.totalSites,       prev: _dashPrev.totalSites,       card: 'dashCardSites',   trend: 'trendSites' },
    { id: 'statActiveSites', val: data.activeSites,      prev: _dashPrev.activeSites,      card: 'dashCardActive',  trend: 'trendActive' },
    { id: 'statProbSites',   val: data.problematicSites, prev: _dashPrev.problematicSites, card: 'dashCardProb',    trend: 'trendProb' },
    { id: 'statOpenTickets', val: data.openTickets,      prev: _dashPrev.openTickets,      card: 'dashCardTickets', trend: 'trendTickets' },
  ];

  cards.forEach(({ id, val, prev, card, trend }) => {
    const el    = document.getElementById(id);
    const tEl   = document.getElementById(trend);
    const from  = typeof prev === 'number' ? prev : val;
    const changed = typeof prev === 'number' && prev !== val;

    if (animate || changed) {
      animateCounter(el, animate ? 0 : from, val);
      if (changed) flashCard(card);
    } else if (el) {
      el.textContent = val.toLocaleString();
    }

    // Trend badge
    if (tEl && typeof prev === 'number' && prev !== val) {
      const diff = val - prev;
      const pct  = prev > 0 ? Math.abs(Math.round((diff / prev) * 100)) : 0;
      const up   = diff > 0;
      tEl.className = `trend ${up ? 'up' : 'down'}`;
      tEl.textContent = `${up ? '↑' : '↓'} ${pct > 0 ? pct + '%' : (up ? '+' + diff : diff)}`;
    }
  });
}

function updateDashCharts(data) {
  // Load Chart.js lazily
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s.onload = () => renderDashCharts(data);
    document.head.appendChild(s);
  } else {
    renderDashCharts(data);
  }
}

function renderDashCharts(data) {
  const isDark = document.body.classList.contains('dark');
  const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const tickColor  = isDark ? '#64748b' : '#94a3b8';
  const fontFamily = "'Inter','Segoe UI',sans-serif";

  // Shared tooltip style
  const tooltipBase = {
    backgroundColor: isDark ? '#1e293b' : '#fff',
    titleColor:      isDark ? '#f1f5f9' : '#1e293b',
    bodyColor:       isDark ? '#94a3b8' : '#475569',
    borderColor:     isDark ? '#334155' : '#e2e8f0',
    borderWidth:     1,
    padding:         12,
    cornerRadius:    10,
    titleFont:       { family: fontFamily, weight: '700', size: 13 },
    bodyFont:        { family: fontFamily, size: 12 },
    boxPadding:      6,
    displayColors:   true,
  };

  // ── Donut: Problematic Sites by Status ──────────────────────────────────
  const probCanvas = document.getElementById('chartProbStatus');
  if (probCanvas) {
    const probRows   = data.probByStatus || [];
    const labels     = probRows.length ? probRows.map(r => r.status || 'Unknown') : ['No Data'];
    const counts     = probRows.length ? probRows.map(r => parseInt(r.count) || 0) : [1];
    const total      = counts.reduce((a,b) => a+b, 0);

    // Balanced, professional status palette
    const statusColors = {
      'offline':        '#e05252',   // soft red
      'in progress':    '#f4a443',   // warm amber
      'for monitoring': '#4a90d9',   // calm blue
      'online':         '#52b788',   // muted green
      'unknown':        '#a0aec0',   // neutral grey
      'low signal':     '#9b72cf',   // muted purple
      'intermittent':   '#f08080',   // light coral
    };
    const fallback = ['#4a90d9','#52b788','#f4a443','#e05252','#9b72cf','#a0aec0','#f08080'];
    const colors = labels.map((l, i) =>
      statusColors[l.toLowerCase()] || fallback[i % fallback.length]
    );

    // Update badge
    const badge = document.getElementById('chartProbTotal');
    if (badge) badge.textContent = total + ' sites';

    const probCfg = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: colors,
          borderColor:     isDark ? '#1e293b' : '#ffffff',
          borderWidth:     3,
          hoverBorderWidth: 0,
          hoverOffset:     10,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { family: fontFamily, size: 12, weight: '600' },
              color: tickColor,
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle',
              generateLabels: (chart) => {
                const ds = chart.data.datasets[0];
                return chart.data.labels.map((label, i) => ({
                  text: `${label}  ${ds.data[i]}`,
                  fillStyle: ds.backgroundColor[i],
                  hidden: false, index: i,
                  pointStyle: 'circle',
                }));
              }
            }
          },
          tooltip: {
            ...tooltipBase,
            callbacks: {
              title: ctx => ctx[0].label,
              label: ctx => {
                const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                return `  ${ctx.parsed} sites  (${pct}%)`;
              }
            }
          }
        },
        animation: { animateRotate: true, animateScale: true, duration: 700, easing: 'easeOutQuart' }
      },
      plugins: [{
        // Centre text plugin
        id: 'centreText',
        afterDraw(chart) {
          const { ctx, chartArea: { top, bottom, left, right } } = chart;
          const cx = (left + right) / 2;
          const cy = (top + bottom) / 2;
          ctx.save();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `700 24px ${fontFamily}`;
          ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
          ctx.fillText(total, cx, cy - 8);
          ctx.font = `500 11px ${fontFamily}`;
          ctx.fillStyle = tickColor;
          ctx.fillText('total', cx, cy + 12);
          ctx.restore();
        }
      }]
    };

    if (_chartProbStatus) {
      _chartProbStatus.data.labels = labels;
      _chartProbStatus.data.datasets[0].data = counts;
      _chartProbStatus.data.datasets[0].backgroundColor = colors;
      _chartProbStatus.update('active');
      const badge2 = document.getElementById('chartProbTotal');
      if (badge2) badge2.textContent = total + ' sites';
    } else {
      _chartProbStatus = new Chart(probCanvas, probCfg);
    }
  }

  // ── Bar: Ticket Summary ──────────────────────────────────────────────────
  const tkCanvas = document.getElementById('chartTickets');
  if (tkCanvas) {
    const total  = data.totalTickets || 0;
    const open   = data.openTickets  || 0;
    const closed = total - open;

    // Update badge + legend
    const badge = document.getElementById('chartTicketTotal');
    if (badge) badge.textContent = total + ' total';
    const legend = document.getElementById('chartTicketLegend');
    if (legend) legend.innerHTML = `
      <span class="dcl-item"><span class="dcl-dot" style="background:#4a90d9"></span>Total</span>
      <span class="dcl-item"><span class="dcl-dot" style="background:#e05252"></span>Open <strong>${open}</strong></span>
      <span class="dcl-item"><span class="dcl-dot" style="background:#52b788"></span>Closed <strong>${closed}</strong></span>
    `;

    // Gradient fills
    const mkGrad = (canvas, top, bottom) => {
      const ctx = canvas.getContext('2d');
      const g   = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      return g;
    };

    const tkCfg = {
      type: 'bar',
      data: {
        labels: ['Total', 'Open', 'Closed'],
        datasets: [{
          data: [total, open, closed],
          backgroundColor: [
            mkGrad(tkCanvas, '#4a90d9', 'rgba(74,144,217,0.35)'),  // blue  — Total
            mkGrad(tkCanvas, '#e05252', 'rgba(224,82,82,0.35)'),    // red   — Open
            mkGrad(tkCanvas, '#52b788', 'rgba(82,183,136,0.35)'),   // green — Closed
          ],
          borderColor: ['#4a90d9','#e05252','#52b788'],
          borderWidth: 0,
          borderRadius: 10,
          borderSkipped: false,
          barPercentage: 0.55,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipBase,
            callbacks: {
              label: ctx => `  ${ctx.parsed.y} ticket${ctx.parsed.y !== 1 ? 's' : ''}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: fontFamily, size: 12, weight: '600' }, color: tickColor }
          },
          y: {
            beginAtZero: true,
            border: { display: false, dash: [4,4] },
            grid: { color: gridColor },
            ticks: {
              font: { family: fontFamily, size: 11 },
              color: tickColor,
              stepSize: Math.max(1, Math.ceil(total / 5)),
              callback: v => Number.isInteger(v) ? v : ''
            }
          }
        },
        animation: { duration: 700, easing: 'easeOutQuart' }
      }
    };

    if (_chartTickets) {
      _chartTickets.data.datasets[0].data = [total, open, closed];
      _chartTickets.update('active');
    } else {
      _chartTickets = new Chart(tkCanvas, tkCfg);
    }
  }
}

function updateDashTable(tickets) {
  const tbody = document.getElementById('dashRecentBody');
  if (!tbody) return;
  if (!tickets.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">No recent tickets.</td></tr>`;
    return;
  }
  tbody.innerHTML = tickets.map(t => {
    const statusClass = t.status?.toLowerCase() === 'open'   ? 'badge open-badge'
                      : t.status?.toLowerCase() === 'closed' ? 'badge completed'
                      : 'badge pending';
    const date = t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    return `
      <tr>
        <td>#${t.id}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.subject || '—')}</td>
        <td>${escHtml(t.department || '—')}</td>
        <td><span class="${statusClass}">${escHtml(t.status || '—')}</span></td>
        <td>${date}</td>
      </tr>`;
  }).join('');
}


/* ================= PROBLEMATIC SITES ================= */

let probData = [];
let probFiltered = [];
let probPage = 1;
const probRowsPerPage = 10;
let probSortDir = 1;
let probSelectedRows = new Set();
let probSelectMode = false;
let probCurrentRegion = null;
let probRegionsList = []; // loaded dynamically from /api/regions

const PROB_COLUMNS = [
  { key: "Sitename",                         icon: "ri-map-pin-line",         type: "text" },
  { key: "Province",                          icon: "ri-earth-line",           type: "text" },
  { key: "Municipality",                      icon: "ri-building-line",        type: "text" },
  { key: "Region",                            icon: "ri-map-2-line",           type: "select", options: [] }, // filled dynamically
  { key: "Status",                            icon: "ri-checkbox-circle-line", type: "select",
    options: ["Online","Offline","In Progress","For Monitoring","Unknown"] },
  { key: "Cause (Assume)",                    icon: "ri-question-line",        type: "text" },
  { key: "Remarks",                           icon: "ri-chat-3-line",          type: "textarea" },
  { key: "KAD Name",                          icon: "ri-user-line",            type: "text" },
  { key: "KAD Visit Date",                    icon: "ri-calendar-line",        type: "date" },
  { key: "Site Online Date",                  icon: "ri-calendar-check-line",  type: "date" },
  { key: "Found Problem / Cause in the Site", icon: "ri-bug-line",             type: "textarea" },
  { key: "Solution",                          icon: "ri-tools-line",           type: "textarea" },
];


async function loadProblematicSites() {
  probData = []; probFiltered = []; probPage = 1;
  probSelectedRows = new Set(); probSelectMode = false;
  probCurrentRegion = null;

  // Load regions dynamically
  try {
    const rRes = await fetch("/api/regions");
    probRegionsList = rRes.ok ? await rRes.json() : [];
  } catch { probRegionsList = []; }

  // Update Region column options dynamically
  const regionCol = PROB_COLUMNS.find(c => c.key === "Region");
  if (regionCol) regionCol.options = probRegionsList.map(r => r.region_name);

  const regionOptions = probRegionsList.map(r =>
    `<option value="${r.region_name}">${r.region_name}</option>`
  ).join("");

  mainContent.innerHTML = `
    <div class="terminals-header">
      <h2><i class="ri-error-warning-line"></i> Problematic Sites</h2>
    </div>

    <!-- Region selection view -->
    <div id="probRegionView">
      <div class="term-region-card">
        <div class="term-region-header">
          <i class="ri-map-pin-2-line"></i>
          <div>
            <h3>Select a Region</h3>
            <p>Choose a region to view or manage its problematic site records.</p>
          </div>
        </div>
        <div class="term-region-body">
          <div class="term-region-controls-row">
            <select id="probRegionSelect" class="term-region-select">
              <option value="">— Select Region —</option>
              ${regionOptions}
            </select>
            <button class="tool-btn" id="probNewRegionBtn"><i class="ri-add-line"></i> Add New Region</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table view (hidden until region selected) -->
    <div id="probTableView" class="hidden">
      <div class="table-card">
        <div class="table-card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span id="probRegionTitle" class="table-title-text">Records</span>
          </div>
          <div class="table-tools">
            <button class="tool-btn" id="probBtnAdd"><i class="ri-add-line"></i> Add</button>
            <button class="tool-btn" id="probBtnSortFilter"><i class="ri-sliders-h-line"></i> Filter & Sort</button>
            <button class="tool-btn" id="probBtnSelect"><i class="ri-checkbox-multiple-line"></i> Select</button>
            <button class="tool-btn apply-btn" id="probExportExcel" title="Export Excel" style="padding:0 12px;"><i class="ri-download-2-line" style="font-size:17px;"></i></button>
          </div>
        </div>

        <div id="probSortFilterBar" class="filter-bar hidden">
          <div class="filter-group">
            <label>Province</label>
            <input type="text" id="probFilterProvince" placeholder="e.g. BENGUET">
          </div>
          <div class="filter-group">
            <label>Municipality</label>
            <input type="text" id="probFilterMuni" placeholder="e.g. ATOK">
          </div>
          <div class="filter-group">
            <label>Status</label>
            <select id="probFilterStatus" style="padding:7px 10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;outline:none;background:white;">
              <option value="">All Statuses</option>
              <option>Offline</option>
              <option>Online</option>
              <option>In Progress</option>
              <option>For Monitoring</option>
              <option>Unknown</option>
            </select>
          </div>
          <div class="filter-sort-divider"></div>
          <div class="filter-group">
            <label>Sort by</label>
            <select id="probSortColSelect" style="padding:7px 10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;outline:none;background:white;">
              ${PROB_COLUMNS.map(c => `<option value="${c.key}">${c.key}</option>`).join("")}
            </select>
          </div>
          <button class="tool-btn" id="probToggleSortDir"><i class="ri-arrow-up-line"></i> ASC</button>
          <button class="tool-btn apply-btn" id="probApplyFilterSort"><i class="ri-check-line"></i> Apply</button>
          <button class="tool-btn" id="probClearFilterSort"><i class="ri-close-line"></i> Clear</button>
        </div>

        <div id="probBulkActions" class="bulk-actions hidden">
          <label class="bulk-select-all-wrap" title="Select all rows">
            <input type="checkbox" id="probBulkSelectAllChk">
            <span class="bulk-select-all-label"><i class="ri-check-double-line"></i> Select All</span>
          </label>
          <span class="bulk-divider"></span>
          <span class="bulk-count-badge" id="probSelectedCount"><i class="ri-checkbox-multiple-line"></i> 0 of 0 selected</span>
          <div class="bulk-spacer"></div>
          <button class="tool-btn danger-btn" id="probDeleteSelected"><i class="ri-delete-bin-line"></i> Delete Selected</button>
          <button class="tool-btn" id="probBtnCancelSelect" title="Exit selection mode"><i class="ri-close-line"></i> Done</button>
        </div>

        <div class="table-wrapper terminals-table-wrapper">
          <table class="data-grid terminals-grid">
            <thead id="probThead"></thead>
            <tbody id="probTbody">
              <tr><td colspan="15" class="loading-cell"><i class="ri-loader-4-line spin"></i> Loading data…</td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination-bar" id="probPagination"></div>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <div id="probConfirmDeleteModal" class="modal-overlay hidden">
      <div class="modal-box confirm-modal-box">
        <div class="confirm-modal-icon danger-icon"><i class="ri-delete-bin-2-line"></i></div>
        <h3 class="confirm-modal-title">Delete Records</h3>
        <p class="confirm-modal-msg" id="probConfirmDeleteMsg">Are you sure?</p>
        <div class="confirm-modal-actions">
          <button class="tool-btn" id="probCancelDeleteBtn">Cancel</button>
          <button class="tool-btn danger-btn" id="probConfirmDeleteBtn"><i class="ri-delete-bin-line"></i> Yes, Delete</button>
        </div>
      </div>
    </div>

    <!-- Add Choice Modal -->
    <div id="probAddChoiceModal" class="modal-overlay hidden">
      <div class="add-choice-box">
        <div class="add-choice-header">
          <div class="add-choice-title">
            <i class="ri-add-circle-line"></i>
            <div>
              <div class="add-choice-heading">Add Problematic Site</div>
              <div class="add-choice-sub">How would you like to add records?</div>
            </div>
          </div>
          <button class="modal-close-btn" id="probChoiceClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-choice-options">
          <button class="add-choice-btn add-choice-primary" id="probChooseManual">
            <div class="add-choice-btn-icon"><i class="ri-edit-2-line"></i></div>
            <div class="add-choice-btn-text">
              <div class="add-choice-btn-label">Manual Entry</div>
              <div class="add-choice-btn-desc">Fill in a form to add one record</div>
            </div>
            <i class="ri-arrow-right-s-line add-choice-arrow"></i>
          </button>
          <button class="add-choice-btn add-choice-secondary" id="probChooseImport">
            <div class="add-choice-btn-icon"><i class="ri-upload-cloud-2-line"></i></div>
            <div class="add-choice-btn-text">
              <div class="add-choice-btn-label">Import File</div>
              <div class="add-choice-btn-desc">Upload CSV or XLSX to bulk import</div>
            </div>
            <i class="ri-arrow-right-s-line add-choice-arrow"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Manual Add Modal -->
    <div id="probAddModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-error-warning-line"></i></div>
          <div class="add-modal-title">
            <h3>Add Problematic Site</h3>
            <p>Fill in the details to log a new problematic site.</p>
          </div>
          <button class="modal-close-btn" id="probCancelAdd"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body"><div id="probAddFields" class="add-fields-grid"></div></div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Sitename is required</span>
          <div class="modal-actions">
            <button class="tool-btn small-btn" id="probCancelAddFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="probConfirmAdd"><i class="ri-save-line"></i> Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div id="probImportModal" class="modal-overlay hidden">
      <div class="modal-box" style="max-width:480px;padding:36px 32px;">
        <h3 style="margin:0 0 6px;font-size:20px;color:#1e293b;"><i class="ri-upload-cloud-2-line" style="color:#2f4b85"></i> Import Records</h3>
        <p style="color:#64748b;font-size:13px;margin:0 0 22px;">Upload a CSV or XLSX file. Column headers must match the fields (Sitename, Province, Municipality, Region, Status, etc.).</p>
        <div class="import-drop-zone" id="probImportDropZone">
          <i class="ri-file-upload-line" style="font-size:36px;color:#2f4b85;"></i>
          <p style="margin:8px 0 4px;font-weight:600;color:#1e293b;">Drop file here or click to browse</p>
          <p style="font-size:12px;color:#94a3b8;">CSV or XLSX, up to 50MB</p>
          <input type="file" id="probImportFileInput" accept=".csv,.xlsx,.xls" class="hidden">
        </div>
        <div id="probImportFileName" style="font-size:13px;color:#2f4b85;margin:10px 0 0;min-height:18px;"></div>
        <div id="probImportProgress" style="display:none;margin-top:14px;">
          <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
            <div id="probImportProgressBar" style="height:100%;background:#2f4b85;width:0%;transition:width 0.3s;border-radius:99px;"></div>
          </div>
          <div id="probImportProgressText" style="font-size:12px;color:#64748b;margin-top:6px;"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
          <button class="tool-btn" id="probImportCancelBtn">Cancel</button>
          <button class="tool-btn apply-btn" id="probImportConfirmBtn" disabled><i class="ri-upload-2-line"></i> Import</button>
        </div>
      </div>
    </div>

    <!-- New Region Modal -->
    <div id="probNewRegionModal" class="modal-overlay hidden">
      <div class="modal-box" style="max-width:400px;padding:32px;">
        <h3 style="margin:0 0 6px;font-size:18px;color:#1e293b;"><i class="ri-map-pin-add-line" style="color:#2f4b85"></i> Add New Region</h3>
        <p style="color:#64748b;font-size:13px;margin:0 0 18px;">Enter the name of the new region to add it to the system.</p>
        <input type="text" id="probNewRegionInput" class="add-field-input" placeholder="e.g. MOUNTAIN PROVINCE" style="width:100%;box-sizing:border-box;">
        <div class="modal-actions" style="margin-top:16px;">
          <button class="tool-btn" id="probNewRegionCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="probNewRegionConfirm"><i class="ri-save-line"></i> Create Region</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div id="probEditModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-edit-line"></i></div>
          <div class="add-modal-title">
            <h3>Edit Problematic Site</h3>
            <p>Update the details for this site entry.</p>
          </div>
          <button class="modal-close-btn" id="probCancelEdit"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body"><div id="probEditFields" class="add-fields-grid"></div></div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Changes are saved to the database</span>
          <div class="modal-actions">
            <button class="tool-btn small-btn" id="probCancelEditFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="probConfirmEdit"><i class="ri-save-line"></i> Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Region select → show table view
  document.getElementById("probRegionSelect").addEventListener("change", function () {
    const val = this.value;
    if (!val) return;
    probCurrentRegion = val;
    localStorage.setItem(`selectedRegion_problematicSites_${user?.id || 'guest'}`, val);
    document.getElementById("probRegionTitle").textContent = val + " — Problematic Sites";
    document.getElementById("probRegionView").classList.add("hidden");
    document.getElementById("probTableView").classList.remove("hidden");
    fetchProbData(val);
  });

  // Restore saved region (per user), fallback to first; only if none already active
  if (probRegionsList.length > 0 && !probCurrentRegion) {
    const saved       = localStorage.getItem(`selectedRegion_problematicSites_${user?.id || 'guest'}`);
    const names       = probRegionsList.map(r => r.region_name);
    const regionToUse = (saved && names.includes(saved)) ? saved : probRegionsList[0].region_name;
    const probSel     = document.getElementById("probRegionSelect");
    if (probSel) probSel.value = regionToUse;
    probCurrentRegion = regionToUse;
    document.getElementById("probRegionTitle").textContent = regionToUse + " — Problematic Sites";
    document.getElementById("probRegionView").classList.add("hidden");
    document.getElementById("probTableView").classList.remove("hidden");
    fetchProbData(regionToUse);
  }



  // Add New Region
  document.getElementById("probNewRegionBtn").addEventListener("click", () => {
    document.getElementById("probNewRegionInput").value = "";
    document.getElementById("probNewRegionModal").classList.remove("hidden");
  });
  document.getElementById("probNewRegionCancel").addEventListener("click", () =>
    document.getElementById("probNewRegionModal").classList.add("hidden"));
  document.getElementById("probNewRegionModal").addEventListener("click", e => {
    if (e.target === document.getElementById("probNewRegionModal"))
      document.getElementById("probNewRegionModal").classList.add("hidden");
  });
  document.getElementById("probNewRegionConfirm").addEventListener("click", async () => {
    const name = document.getElementById("probNewRegionInput").value.trim().toUpperCase();
    if (!name) { showToast("Region name is required.", "error"); return; }
    const btn = document.getElementById("probNewRegionConfirm");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Creating…';
    try {
      const res = await fetch("/api/regions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region_name: name })
      });
      const result = await res.json();
      if (!res.ok) { showToast("Failed: " + (result.error || "Unknown"), "error"); return; }
      showToast(`Region "${result.region_name}" created.`, "success");
      document.getElementById("probNewRegionModal").classList.add("hidden");
      const rRes = await fetch("/api/regions");
      probRegionsList = rRes.ok ? await rRes.json() : probRegionsList;
      const rCol = PROB_COLUMNS.find(c => c.key === "Region");
      if (rCol) rCol.options = probRegionsList.map(r => r.region_name);
      const sel = document.getElementById("probRegionSelect");
      const newOpt = document.createElement("option");
      newOpt.value = result.region_name;
      newOpt.textContent = result.region_name;
      sel.appendChild(newOpt);
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Create Region'; }
  });

  // Sort & Filter bar — wired after table view shown via event delegation
  document.getElementById("probBtnSortFilter").addEventListener("click", () => {
    document.getElementById("probSortFilterBar").classList.toggle("hidden");
    document.getElementById("probBtnSortFilter").classList.toggle("active-tool",
      !document.getElementById("probSortFilterBar").classList.contains("hidden"));
  });
  document.getElementById("probToggleSortDir").addEventListener("click", function () {
    probSortDir *= -1;
    this.innerHTML = probSortDir === 1 ? '<i class="ri-arrow-up-line"></i> ASC' : '<i class="ri-arrow-down-line"></i> DESC';
  });
  document.getElementById("probApplyFilterSort").addEventListener("click", () => {
    const prov = document.getElementById("probFilterProvince").value.trim().toUpperCase();
    const muni = document.getElementById("probFilterMuni").value.trim().toUpperCase();
    const stat = document.getElementById("probFilterStatus").value;
    const col  = document.getElementById("probSortColSelect").value;
    probFiltered = [...probData];
    if (prov) probFiltered = probFiltered.filter(r => String(r["Province"] ?? "").toUpperCase().includes(prov));
    if (muni) probFiltered = probFiltered.filter(r => String(r["Municipality"] ?? "").toUpperCase().includes(muni));
    if (stat) probFiltered = probFiltered.filter(r => String(r["Status"] ?? "") === stat);
    if (col)  probFiltered.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? ""), undefined, { numeric: true }) * probSortDir);
    probPage = 1; renderProbTable(); renderProbPagination();
    document.getElementById("probSortFilterBar").classList.add("hidden");
    document.getElementById("probBtnSortFilter").classList.remove("active-tool");
  });
  document.getElementById("probClearFilterSort").addEventListener("click", () => {
    ["probFilterProvince","probFilterMuni"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("probFilterStatus").value = "";
    document.getElementById("probToggleSortDir").innerHTML = '<i class="ri-arrow-up-line"></i> ASC';
    probSortDir = 1;
    probFiltered = [...probData];
    probPage = 1; renderProbTable(); renderProbPagination();
  });

  // Select mode
  document.getElementById("probBtnSelect").addEventListener("click", () => {
    probSelectMode = !probSelectMode;
    probSelectedRows.clear();
    document.getElementById("probBtnSelect").classList.toggle("active-tool", probSelectMode);
    document.getElementById("probBulkActions").classList.toggle("hidden", !probSelectMode);
    renderProbTable();
  });

  // Bulk delete
  document.getElementById("probDeleteSelected").addEventListener("click", async () => {
    if (probSelectedRows.size === 0) { showToast("No rows selected.", "error"); return; }
    const toDeleteRows = Array.from(probSelectedRows).map(idx => probFiltered[idx]);
    showProbConfirmDeleteModal(toDeleteRows.length, async () => {
      const ids = toDeleteRows.map(r => r["id"]);
      const btn = document.getElementById("probDeleteSelected");
      btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Deleting…';
      try {
        const res = await fetch("/api/problematic-sites", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids })
        });
        const result = await res.json();
        if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown error"), "error"); return; }
        const toDeleteSet = new Set(toDeleteRows);
        probFiltered = probFiltered.filter(r => !toDeleteSet.has(r));
        probData = probData.filter(r => !toDeleteSet.has(r));
        probSelectedRows.clear();
        updateProbSelectedCount();
        const maxPage = Math.max(1, Math.ceil(probFiltered.length / probRowsPerPage));
        if (probPage > maxPage) probPage = maxPage;
        renderProbTable(); renderProbPagination();
        showToast(`${result.deleted} record(s) deleted.`, "success");
        dashboardDataChanged();
      } catch (err) { showToast("Network error — could not delete.", "error"); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete Selected'; }
    });
  });

  // Done / Cancel prob select mode
  document.getElementById('probBtnCancelSelect')?.addEventListener('click', () => {
    probSelectMode = false;
    probSelectedRows.clear();
    document.getElementById('probBtnSelect')?.classList.remove('active-tool');
    document.getElementById('probBulkActions')?.classList.add('hidden');
    const chk = document.getElementById('probBulkSelectAllChk');
    if (chk) { chk.checked = false; chk.indeterminate = false; }
    renderProbTable();
    updateProbSelectedCount();
  });

  // Prob Select All checkbox
  document.addEventListener('change', function(e) {
    if (e.target.id !== 'probBulkSelectAllChk') return;
    if (e.target.checked) {
      probFiltered.forEach((_, i) => probSelectedRows.add(i));
    } else {
      probSelectedRows.clear();
    }
    updateProbSelectedCount();
    renderProbTable();
  });

  // Prob Export Excel (selected rows)


  document.getElementById("probExportExcel") && document.getElementById("probExportExcel").addEventListener("click", async () => {
    const btn = document.getElementById("probExportExcel");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Generating…';
    try {
      const res = await fetch("/api/problematic-sites/export-excel");
      if (!res.ok) { showToast("Export failed.", "error"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `problematic_sites_${Date.now()}.xlsx`;
      a.click();
      showToast("Excel file downloaded.", "success");
    } catch (err) { showToast("Export error: " + err.message, "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-file-excel-line"></i> Export Excel'; }
  });

  // Add button → choice modal
  document.getElementById("probBtnAdd").addEventListener("click", () => {
    document.getElementById("probAddChoiceModal").classList.remove("hidden");
  });
  document.getElementById("probChoiceClose").addEventListener("click", () => {
    document.getElementById("probAddChoiceModal").classList.add("hidden");
  });
  document.getElementById("probAddChoiceModal").addEventListener("click", e => {
    if (e.target === document.getElementById("probAddChoiceModal"))
      document.getElementById("probAddChoiceModal").classList.add("hidden");
  });
  document.getElementById("probChooseManual").addEventListener("click", () => {
    document.getElementById("probAddChoiceModal").classList.add("hidden");
    openProbAddModal();
  });
  document.getElementById("probChooseImport").addEventListener("click", () => {
    document.getElementById("probAddChoiceModal").classList.add("hidden");
    openProbImportModal();
  });
}

async function fetchProbData(region) {
  try {
    const url = region ? `/api/problematic-sites?region=${encodeURIComponent(region)}` : "/api/problematic-sites";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    if (!data.length) {
      probData = []; probFiltered = [];
      document.getElementById("probTbody").innerHTML =
        `<tr><td colspan="15" class="empty-cell"><i class="ri-inbox-line"></i> No records yet — click <strong>Add</strong> to create the first one.</td></tr>`;
      document.getElementById("probThead").innerHTML = "";
      return;
    }
    probData = data;
    probFiltered = [...probData];
    probPage = 1;
    renderProbTable(); renderProbPagination();
  } catch (err) {
    document.getElementById("probTbody").innerHTML =
      `<tr><td colspan="15" class="error-cell"><i class="ri-error-warning-line"></i> Error loading data</td></tr>`;
  }
}

function renderProbTable() {
  const thead = document.getElementById("probThead");
  const tbody = document.getElementById("probTbody");
  if (!probFiltered.length) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td colspan="15" class="empty-cell"><i class="ri-search-line"></i> No results match your search</td></tr>`;
    return;
  }
  const allCols = Object.keys(probFiltered[0]);
  const columns = allCols.filter(c => c !== "id");
  const start = (probPage - 1) * probRowsPerPage;
  const pageData = probFiltered.slice(start, start + probRowsPerPage);

  thead.innerHTML = `
    <tr>
      ${probSelectMode ? '<th class="select-col"><input type="checkbox" id="probSelectAll"></th>' : ''}
      ${columns.map(col => `<th>${col}</th>`).join("")}
      <th class="actions-col">Actions</th>
    </tr>
  `;

  if (probSelectMode) {
    document.getElementById("probSelectAll").addEventListener("change", function () {
      pageData.forEach((_, i) => { const idx = start + i; if (this.checked) probSelectedRows.add(idx); else probSelectedRows.delete(idx); });
      document.getElementById("probSelectedCount").innerText = `${probSelectedRows.size} rows selected`;
      renderProbTable();
    });
  }

  tbody.innerHTML = pageData.map((row, i) => {
    const globalIdx = start + i;
    const isChecked = probSelectedRows.has(globalIdx);
    const statusVal = String(row["Status"] ?? "").toLowerCase();
    const statusClass = statusVal.includes("online") && !statusVal.includes("offline") ? "completed"
      : statusVal.includes("offline") ? "high"
      : statusVal.includes("progress") ? "progress"
      : statusVal.includes("monitoring") ? "medium" : "pending";
    return `
      <tr class="${isChecked ? 'selected-row' : ''}">
        ${probSelectMode ? `<td class="select-col"><input type="checkbox" class="prob-row-check" ${isChecked ? 'checked' : ''}></td>` : ''}
        ${columns.map(col => {
          if (col === "Status" && row[col]) return `<td><span class="badge ${statusClass}">${row[col]}</span></td>`;
          return `<td>${row[col] ?? ''}</td>`;
        }).join("")}
        <td class="actions-col">
          <button class="row-action-btn edit-btn prob-edit-btn" data-idx="${globalIdx}" title="Edit"><i class="ri-edit-line"></i></button>
          <button class="row-action-btn delete-single-btn prob-delete-btn" data-idx="${globalIdx}" title="Delete"><i class="ri-delete-bin-line"></i></button>
        </td>
      </tr>
    `;
  }).join("");

  if (probSelectMode) {
    document.querySelectorAll(".prob-row-check").forEach((cb, i) => {
      cb.addEventListener("change", function () {
        const idx = start + i;
        if (this.checked) probSelectedRows.add(idx); else probSelectedRows.delete(idx);
        updateProbSelectedCount();
        document.getElementById("probSelectedCount").innerText = `${probSelectedRows.size} rows selected`;
        this.closest("tr").classList.toggle("selected-row", this.checked);
      });
    });
  }

  document.querySelectorAll(".prob-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openProbEditModal(parseInt(btn.getAttribute("data-idx"))));
  });

  document.querySelectorAll(".prob-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"));
      const row = probFiltered[idx];
      showProbConfirmDeleteModal(1, async () => {
        try {
          const res = await fetch("/api/problematic-sites", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [row["id"]] })
          });
          const result = await res.json();
          if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown error"), "error"); return; }
          probFiltered = probFiltered.filter(r => r !== row);
          probData = probData.filter(r => r !== row);
          const maxPage = Math.max(1, Math.ceil(probFiltered.length / probRowsPerPage));
          if (probPage > maxPage) probPage = maxPage;
          renderProbTable(); renderProbPagination();
          showToast("Record deleted successfully.", "success");
          dashboardDataChanged();
        } catch (err) { showToast("Network error — could not delete.", "error"); }
      });
    });
  });
}

function renderProbPagination() {
  const container = document.getElementById("probPagination");
  const total = Math.ceil(probFiltered.length / probRowsPerPage);
  if (total <= 1) { container.innerHTML = ""; return; }
  const start = (probPage - 1) * probRowsPerPage + 1;
  const end = Math.min(probPage * probRowsPerPage, probFiltered.length);
  const range = getPageRange(probPage, total);
  container.innerHTML = `
    <span class="page-info">Showing ${start}–${end} of ${probFiltered.length}</span>
    <div class="page-buttons">
      <button class="page-btn ${probPage===1?'disabled':''}" onclick="goProbPage(${probPage-1})" ${probPage===1?'disabled':''}><i class="ri-arrow-left-s-line"></i></button>
      ${range.map(p => p==='...' ? `<button class="page-btn dots" disabled>…</button>` : `<button class="page-btn ${p===probPage?'active':''}" onclick="goProbPage(${p})">${p}</button>`).join("")}
      <button class="page-btn ${probPage===total?'disabled':''}" onclick="goProbPage(${probPage+1})" ${probPage===total?'disabled':''}><i class="ri-arrow-right-s-line"></i></button>
    </div>
  `;
}

function goProbPage(page) {
  const total = Math.ceil(probFiltered.length / probRowsPerPage);
  if (page < 1 || page > total) return;
  probPage = page; renderProbTable(); renderProbPagination();
  document.querySelector(".terminals-table-wrapper")?.scrollTo(0, 0);
}

function showProbConfirmDeleteModal(count, onConfirm) {
  const modal = document.getElementById("probConfirmDeleteModal");
  document.getElementById("probConfirmDeleteMsg").innerHTML =
    `You are about to permanently delete <strong>${count} record${count > 1 ? 's' : ''}</strong>.<br>This action <strong>cannot be undone</strong>.`;
  modal.classList.remove("hidden");
  const confirmBtn = document.getElementById("probConfirmDeleteBtn");
  const cancelBtn  = document.getElementById("probCancelDeleteBtn");
  const newConfirm = confirmBtn.cloneNode(true); confirmBtn.replaceWith(newConfirm);
  const newCancel  = cancelBtn.cloneNode(true);  cancelBtn.replaceWith(newCancel);
  const close = () => modal.classList.add("hidden");
  document.getElementById("probCancelDeleteBtn").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("probConfirmDeleteBtn").onclick = async () => { close(); await onConfirm(); };
}

function buildProbFields(containerId, rowData = {}) {
  // Refresh Region options in case new regions were added
  const regionCol = PROB_COLUMNS.find(c => c.key === "Region");
  if (regionCol && probRegionsList.length) regionCol.options = probRegionsList.map(r => r.region_name);

  const container = document.getElementById(containerId);
  container.innerHTML = PROB_COLUMNS.map(col => {
    const raw = rowData[col.key];
    const val = String(raw ?? "").replace(/"/g, "&quot;");
    let input = "";
    if (col.type === "textarea") {
      input = `<textarea data-col="${col.key}" class="add-field-input prob-textarea" rows="2">${raw ?? ""}</textarea>`;
    } else if (col.type === "select") {
      input = `<select data-col="${col.key}" class="add-field-input">
        <option value="">— Select —</option>
        ${col.options.map(o => `<option value="${o}" ${val === o ? "selected" : ""}>${o}</option>`).join("")}
      </select>`;
    } else {
      input = `<input type="${col.type}" data-col="${col.key}" class="add-field-input" value="${val}" autocomplete="off">`;
    }
    return `
      <div class="add-field-item ${col.type === 'textarea' ? 'field-full' : ''}">
        <label class="add-field-label"><i class="${col.icon}"></i> ${col.key}</label>
        ${input}
      </div>
    `;
  }).join("");
}

function getProbFormData(containerId) {
  const container = document.getElementById(containerId);
  const data = {};
  PROB_COLUMNS.forEach(col => {
    const el = container.querySelector(`[data-col="${col.key}"]`);
    data[col.key] = el ? el.value.trim() : "";
  });
  return data;
}

function openProbAddModal() {
  buildProbFields("probAddFields");
  // Pre-fill Region with currently selected region
  if (probCurrentRegion) {
    const regionEl = document.querySelector('#probAddFields [data-col="Region"]');
    if (regionEl) regionEl.value = probCurrentRegion;
  }
  const modal = document.getElementById("probAddModal");
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("probCancelAdd").onclick = close;
  document.getElementById("probCancelAddFooter").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("probConfirmAdd").onclick = async () => {
    const newRow = getProbFormData("probAddFields");
    if (!newRow["Sitename"]) { showToast("Sitename is required.", "error"); return; }
    const btn = document.getElementById("probConfirmAdd");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const res = await fetch("/api/problematic-sites", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow)
      });
      let result; try { result = await res.json(); } catch(e) { result = {}; }
      if (!res.ok) { showToast("Save failed: " + (result.error || res.statusText), "error"); return; }
      const saved = result.row || newRow;
      probData.unshift(saved);
      probFiltered = [...probData];
      probPage = 1; renderProbTable(); renderProbPagination();
      close(); showToast("Record added successfully.", "success");
    } catch (err) { showToast("Network error: " + err.message, "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save'; }
  };
}

function openProbImportModal() {
  const modal  = document.getElementById("probImportModal");
  const zone   = document.getElementById("probImportDropZone");
  const input  = document.getElementById("probImportFileInput");
  const fname  = document.getElementById("probImportFileName");
  const prog   = document.getElementById("probImportProgress");
  const bar    = document.getElementById("probImportProgressBar");
  const txt    = document.getElementById("probImportProgressText");
  const impBtn = document.getElementById("probImportConfirmBtn");

  let parsedRows = [];

  fname.textContent = "";
  prog.style.display = "none";
  bar.style.width = "0%";
  txt.textContent = "";
  impBtn.disabled = true;
  input.value = "";

  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("probImportCancelBtn").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  zone.onclick = () => input.click();
  zone.ondragover = e => { e.preventDefault(); zone.style.background = "#eff6ff"; };
  zone.ondragleave = () => { zone.style.background = ""; };
  zone.ondrop = e => { e.preventDefault(); zone.style.background = ""; if (e.dataTransfer.files[0]) handleProbImportFile(e.dataTransfer.files[0]); };
  input.onchange = () => { if (input.files[0]) handleProbImportFile(input.files[0]); };

  async function handleProbImportFile(file) {
    fname.textContent = `📄 ${file.name}`;
    parsedRows = [];
    impBtn.disabled = true;
    try {
      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        parsedRows = lines.slice(1).map(line => {
          const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,))/g) || [];
          const row = {};
          headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
          return row;
        }).filter(r => Object.values(r).some(v => v));
      } else {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      }
      fname.textContent = `📄 ${file.name} — ${parsedRows.length} rows found`;
      impBtn.disabled = parsedRows.length === 0;
    } catch (err) {
      fname.textContent = `⚠️ Could not read file: ${err.message}`;
    }
  }

  impBtn.onclick = async () => {
    if (!parsedRows.length) return;
    impBtn.disabled = true;
    prog.style.display = "block";
    let inserted = 0, skipped = 0;
    const PROB_KEYS = PROB_COLUMNS.map(c => c.key);
    for (let i = 0; i < parsedRows.length; i++) {
      const raw = parsedRows[i];
      // Map CSV headers to DB columns (case-insensitive)
      const row = {};
      PROB_KEYS.forEach(key => {
        const match = Object.keys(raw).find(k => k.trim().toLowerCase() === key.toLowerCase());
        if (match !== undefined) row[key] = String(raw[match] ?? "").trim();
      });
      // Always stamp the selected region so records stay in the right region
      row["Region"] = probCurrentRegion;
      try {
        const res = await fetch("/api/problematic-sites", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row)
        });
        if (res.ok) { const r = await res.json(); probData.unshift(r.row || row); inserted++; }
        else skipped++;
      } catch { skipped++; }
      const pct = Math.round(((i + 1) / parsedRows.length) * 100);
      bar.style.width = pct + "%";
      txt.textContent = `Importing… ${i + 1} of ${parsedRows.length}`;
    }
    txt.textContent = `Done — ${inserted} inserted, ${skipped} skipped.`;
    probFiltered = [...probData];
    probPage = 1; renderProbTable(); renderProbPagination();
    showToast(`Imported ${inserted} record(s).`, inserted > 0 ? "success" : "error");
    setTimeout(() => close(), 1800);
  };
}

function openProbEditModal(idx) {
  const row = probFiltered[idx];
  if (!row) return;
  buildProbFields("probEditFields", row);
  const modal = document.getElementById("probEditModal");
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("probCancelEdit").onclick = close;
  document.getElementById("probCancelEditFooter").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("probConfirmEdit").onclick = async () => {
    const updated = getProbFormData("probEditFields");
    const btn = document.getElementById("probConfirmEdit");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const res = await fetch(`/api/problematic-sites/${row["id"]}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated)
      });
      const result = await res.json();
      if (!res.ok) { showToast("Update failed: " + (result.error || "Unknown error"), "error"); return; }
      const saved = result.row || updated;
      const fIdx = probFiltered.indexOf(row); const dIdx = probData.indexOf(row);
      if (fIdx !== -1) probFiltered[fIdx] = saved;
      if (dIdx !== -1) probData[dIdx] = saved;
      renderProbTable(); close(); showToast("Record updated successfully.", "success");
    } catch (err) { showToast("Network error — could not update.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save Changes'; }
  };
}

/* ================= TICKETS ================= */

let ticketData = [];
let tkCurrentView  = "My Tickets";
let tkCurrentDept  = "All Department";
let tkCurrentChan  = "All Channel";
let tkSearchQuery  = "";
let tkCurrentPage  = 1;
const tkRowsPerPage = 10;

const tkViews = [
  { label: "My Tickets",           count: 0 },
  { label: "My Open Tickets",      count: 0 },
  { label: "My Closed Tickets",    count: 0 },
  { label: "My On hold Tickets",   count: 0 },
  { label: "My Overdue Tickets",   count: 0 },
  null,
  { label: "Team Tickets",         count: 0 },
  { label: "Team Open Tickets",    count: 0 },
  { label: "Team Closed Tickets",  count: 0 },
  { label: "Team On Hold Tickets", count: 0 },
  { label: "Team Overdue Tickets", count: 0 },
];

async function loadTickets() {
  tkCurrentView = "My Tickets";
  tkCurrentDept = "All Department";
  tkCurrentChan = "All Channel";
  tkSearchQuery = "";
  tkCurrentPage = 1;

  mainContent.innerHTML = `
    <div class="tk-topbar">
      <div class="tk-title-row">
        <h2 class="tk-title"><i class="ri-ticket-2-line"></i> Ticket</h2>
        <span class="tk-subtitle">My Area</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div class="tk-search-box">
          <i class="ri-search-line"></i>
          <input type="text" id="tkSearch" placeholder="Search here">
        </div>
        <button class="tool-btn apply-btn" id="tkAddBtn" style="gap:6px;padding:10px 18px;font-size:14px;">
          <i class="ri-add-line"></i> Add ticket
        </button>
        <button class="tool-btn" style="gap:6px;padding:10px 14px;">
          <i class="ri-equalizer-line"></i> Filter
        </button>
        <button class="tool-btn" style="padding:10px 12px;"><i class="ri-more-2-fill"></i></button>
      </div>
    </div>

    <div class="tk-layout">
      <div class="tk-main-card">
        <div class="tk-tabs-bar">
          <div class="tk-dropdown-wrap" id="tkDeptWrap">
            <button class="tk-tab-btn" id="tkDeptBtn">
              <span id="tkDeptLabel">All Department</span>
              <i class="ri-arrow-down-s-line"></i>
            </button>
            <div class="tk-tab-menu hidden" id="tkDeptMenu">
              ${["All Department","NOC Department","Finance Department"].map(d =>
                `<div class="tk-tab-opt${d === "All Department" ? ' active' : ''}" data-dept="${d}">${d}</div>`
              ).join("")}
            </div>
          </div>
          <div class="tk-dropdown-wrap" id="tkChanWrap">
            <button class="tk-tab-btn" id="tkChanBtn">
              <span id="tkChanLabel">All Channel</span>
              <i class="ri-arrow-down-s-line"></i>
            </button>
            <div class="tk-tab-menu hidden" id="tkChanMenu">
              ${["All Channel","Web","Email","Phone"].map(c =>
                `<div class="tk-tab-opt${c === "All Channel" ? ' active' : ''}" data-chan="${c}">${c}</div>`
              ).join("")}
            </div>
          </div>
        </div>

        <div class="tk-list" id="tkList">
          <div class="tk-empty"><i class="ri-loader-4-line spin"></i><p>Loading tickets…</p></div>
        </div>
        <div class="tk-pagination" id="tkPagination"></div>
      </div>

      <div class="tk-sidebar">
        <div class="tk-sidebar-title">Views</div>
        <div class="tk-views" id="tkViewsList">
          ${tkViews.map(v => v === null
            ? `<div class="tk-view-divider"></div>`
            : `<div class="tk-view-item${v.label === "My Tickets" ? ' active' : ''}" data-view="${v.label}">
                 <span>${v.label}</span>
                 <span class="tk-view-count" id="tkCount_${v.label.replace(/\s+/g,'_')}"></span>
               </div>`
          ).join("")}
        </div>
      </div>
    </div>

    <!-- Submit Ticket Modal -->
    <div id="tkSubmitModal" class="modal-overlay hidden">
      <div class="tka-shell">

        <!-- Header -->
        <div class="tka-header">
          <div class="tka-header-bg"></div>
          <div class="tka-header-content">
            <div class="tka-header-left">
              <div class="tka-icon-wrap"><i class="ri-ticket-2-line"></i></div>
              <div>
                <div class="tka-header-title">New Ticket</div>
                <div class="tka-header-sub">Fill in the details below to submit a support request</div>
              </div>
            </div>
            <button class="tka-close-btn" id="tkDiscardBtnX"><i class="ri-close-line"></i></button>
          </div>
        </div>

        <!-- Body -->
        <div class="tka-body">

          <!-- Subject -->
          <div class="tka-field-group">
            <label class="tka-label">
              <i class="ri-bookmark-line"></i> Subject
              <span class="tka-required">*</span>
            </label>
            <input type="text" id="tkSubjectInput" class="tka-input" placeholder="Brief summary of the issue…">
          </div>

          <!-- Description -->
          <div class="tka-field-group">
            <label class="tka-label">
              <i class="ri-file-text-line"></i> Description
              <span class="tka-required">*</span>
            </label>
            <textarea id="tkDescInput" class="tka-textarea" rows="5" placeholder="Describe the issue in detail — include steps to reproduce, impact, and any relevant context…"></textarea>
          </div>

          <!-- Two-col row: Airmac + Status -->
          <div class="tka-row">
            <div class="tka-field-group">
              <label class="tka-label"><i class="ri-router-line"></i> Airmac / ESN</label>
              <input type="text" id="tkEsnInput" class="tka-input" placeholder="e.g. AA:BB:CC:DD:EE:FF">
            </div>
            <div class="tka-field-group">
              <label class="tka-label"><i class="ri-flag-line"></i> Status</label>
              <div class="tka-select-wrap">
                <select id="tkStatusInput" class="tka-select">
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                  <option value="On hold">On hold</option>
                </select>
                <i class="ri-arrow-down-s-line tka-select-arrow"></i>
              </div>

            </div>
          </div>

          <!-- Department -->
          <div class="tka-field-group">
            <label class="tka-label"><i class="ri-building-4-line"></i> Department</label>
            <div class="tka-dept-pills">
              <label class="tka-dept-pill">
                <input type="radio" name="tkDeptRadio" value="NOC Department" checked>
                <span><i class="ri-signal-tower-line"></i> NOC Department</span>
              </label>
              <label class="tka-dept-pill">
                <input type="radio" name="tkDeptRadio" value="Finance Department">
                <span><i class="ri-bank-line"></i> Finance Department</span>
              </label>
            </div>

          </div>

        </div>

        <!-- Footer -->
        <div class="tka-footer">
          <span class="tka-hint"><i class="ri-information-line"></i> Fields marked <span class="tka-required">*</span> are required</span>
          <div class="tka-footer-actions">
            <button class="tka-discard-btn" id="tkDiscardBtn">Cancel</button>
            <button class="tka-submit-btn" id="tkSubmitBtn">
              <i class="ri-send-plane-line"></i> Submit Ticket
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- Edit Ticket Modal -->
    <div id="tkEditModal" class="modal-overlay hidden">
      <div class="tk-form-box" style="max-height:80vh;">
        <h2 class="tk-form-title">Edit Ticket</h2>
        <input type="hidden" id="tkEditId">

        <div class="tk-form-section-label">Ticket Information</div>
        <div class="tk-form-group">
          <label class="tk-form-label">Subject <span class="tk-required">*</span></label>
          <input type="text" id="tkEditSubject" class="tk-form-input">
        </div>
        <div class="tk-form-group">
          <label class="tk-form-label">Description</label>
          <textarea id="tkEditDesc" class="tk-form-textarea" rows="5"></textarea>
        </div>
        <div class="tk-form-group">
          <label class="tk-form-label">Airmac / ESN</label>
          <input type="text" id="tkEditEsn" class="tk-form-input">
        </div>
        <div class="tk-form-group">
          <label class="tk-form-label">Status</label>
          <select id="tkEditStatus" class="tk-form-input">
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
            <option value="On hold">On hold</option>
          </select>
        </div>

        <div class="tk-form-actions">
          <button class="tool-btn apply-btn" id="tkEditSaveBtn" style="padding:11px 28px;font-size:14px;"><i class="ri-save-line"></i> Save Changes</button>
          <button class="tool-btn" id="tkEditCancelBtn" style="padding:11px 22px;font-size:14px;">Cancel</button>
        </div>
      </div>
    </div>

    <!-- View Ticket Modal -->
    <div id="tkViewModal" class="modal-overlay hidden">
      <div class="tkd-shell">

        <!-- Left accent bar + header -->
        <div class="tkd-header">
          <div class="tkd-header-bg"></div>
          <div class="tkd-header-content">
            <div class="tkd-header-left">
              <div class="tkd-icon-wrap"><i class="ri-ticket-2-line"></i></div>
              <div>
                <div class="tkd-header-title">Ticket Details</div>
                <div class="tkd-header-sub">Full record overview</div>
              </div>
            </div>
            <button class="tkd-close-btn" id="tkViewCloseBtn"><i class="ri-close-line"></i></button>
          </div>

          <!-- Pill strip: ID + Status + Date -->
          <div class="tkd-meta-strip">
            <span class="tkd-meta-pill"><i class="ri-hashtag"></i><span id="tkViewId"></span></span>
            <span class="tkd-meta-pill" id="tkViewStatus"></span>
            <span class="tkd-meta-pill"><i class="ri-calendar-line"></i><span id="tkViewCreated"></span></span>
          </div>
        </div>

        <!-- Body -->
        <div class="tkd-body">

          <!-- Subject -->
          <div class="tkd-subject-row">
            <div class="tkd-subject-label">Subject</div>
            <div class="tkd-subject-value" id="tkViewSubject"></div>
          </div>

          <!-- Two-column info cards -->
          <div class="tkd-cards-row">
            <div class="tkd-info-card">
              <div class="tkd-card-label"><i class="ri-router-line"></i> Airmac / ESN</div>
              <div class="tkd-card-value" id="tkViewEsn"></div>
            </div>
            <div class="tkd-info-card">
              <div class="tkd-card-label"><i class="ri-building-4-line"></i> Department</div>
              <div class="tkd-card-value" id="tkViewDept"></div>
            </div>
          </div>

          <!-- Description -->
          <div class="tkd-desc-block">
            <div class="tkd-desc-label"><i class="ri-file-text-line"></i> Description</div>
            <div class="tkd-desc-body" id="tkViewDesc"></div>
          </div>

          <!-- Replies -->
          <div class="tkd-replies-section">
            <div class="tkd-replies-label"><i class="ri-chat-3-line"></i> Replies</div>
            <div class="tkd-replies-list" id="tkRepliesList">
              <div class="tkd-replies-empty"><i class="ri-loader-4-line spin"></i> Loading…</div>
            </div>
            <div class="tkd-reply-input-wrap">
              <textarea id="tkReplyInput" class="tkd-reply-textarea" placeholder="Write a reply…" rows="3"></textarea>
              <button class="tkd-send-btn" id="tkSendReplyBtn">
                <i class="ri-send-plane-fill"></i> Send Reply
              </button>
            </div>
          </div>

        </div>



      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <div id="tkDeleteModal" class="modal-overlay hidden">
      <div class="modal-box confirm-modal-box">
        <div class="confirm-modal-icon danger-icon"><i class="ri-delete-bin-2-line"></i></div>
        <h3 class="confirm-modal-title">Delete Ticket</h3>
        <p class="confirm-modal-msg">Are you sure you want to delete this ticket? This cannot be undone.</p>
        <div class="confirm-modal-actions">
          <button class="tool-btn" id="tkDeleteCancelBtn">Cancel</button>
          <button class="tool-btn danger-btn" id="tkDeleteConfirmBtn"><i class="ri-delete-bin-line"></i> Delete</button>
        </div>
      </div>
    </div>
  `;

  // Search
  document.getElementById("tkSearch").addEventListener("input", function () {
    tkSearchQuery = this.value.trim().toLowerCase();
    tkCurrentPage = 1; renderTkList(); renderTkPagination();
  });

  // Dept dropdown
  document.getElementById("tkDeptBtn").addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("tkChanMenu").classList.add("hidden");
    document.getElementById("tkDeptMenu").classList.toggle("hidden");
  });
  document.getElementById("tkDeptMenu").addEventListener("click", e => {
    const opt = e.target.closest(".tk-tab-opt"); if (!opt) return;
    tkCurrentDept = opt.dataset.dept;
    document.getElementById("tkDeptLabel").textContent = tkCurrentDept;
    document.querySelectorAll("#tkDeptMenu .tk-tab-opt").forEach(o => o.classList.toggle("active", o.dataset.dept === tkCurrentDept));
    document.getElementById("tkDeptMenu").classList.add("hidden");
    tkCurrentPage = 1; renderTkList(); renderTkPagination();
  });

  // Channel dropdown
  document.getElementById("tkChanBtn").addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("tkDeptMenu").classList.add("hidden");
    document.getElementById("tkChanMenu").classList.toggle("hidden");
  });
  document.getElementById("tkChanMenu").addEventListener("click", e => {
    const opt = e.target.closest(".tk-tab-opt"); if (!opt) return;
    tkCurrentChan = opt.dataset.chan;
    document.getElementById("tkChanLabel").textContent = tkCurrentChan;
    document.querySelectorAll("#tkChanMenu .tk-tab-opt").forEach(o => o.classList.toggle("active", o.dataset.chan === tkCurrentChan));
    document.getElementById("tkChanMenu").classList.add("hidden");
    tkCurrentPage = 1; renderTkList(); renderTkPagination();
  });

  // Close dropdowns on outside click
  document.addEventListener("click", () => {
    document.getElementById("tkDeptMenu")?.classList.add("hidden");
    document.getElementById("tkChanMenu")?.classList.add("hidden");
  });

  // Views sidebar
  document.getElementById("tkViewsList").addEventListener("click", e => {
    const item = e.target.closest(".tk-view-item"); if (!item) return;
    tkCurrentView = item.dataset.view;
    document.querySelectorAll(".tk-view-item").forEach(i => i.classList.toggle("active", i.dataset.view === tkCurrentView));
    tkCurrentPage = 1; renderTkList(); renderTkPagination();
  });

  // Add ticket modal
  document.getElementById("tkAddBtn").addEventListener("click", () => {
    document.getElementById("tkSubmitModal").classList.remove("hidden");
  });

  // Submit ticket → POST to DB
  document.getElementById("tkSubmitBtn").addEventListener("click", async () => {
    const subject     = document.getElementById("tkSubjectInput").value.trim();
    const description = document.getElementById("tkDescInput").value.trim();
    const airmac_esn  = document.getElementById("tkEsnInput").value.trim();
    const status      = document.getElementById("tkStatusInput").value;
    const deptRadio   = document.querySelector("input[name=tkDeptRadio]:checked");
    const department  = deptRadio ? deptRadio.value : "NOC Department";
    if (!subject)     { showToast("Subject is required.", "error"); return; }
    if (!description) { showToast("Description is required.", "error"); return; }

    const btn = document.getElementById("tkSubmitBtn");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Submitting…';
    try {
      const res    = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, airmac_esn, status, department })
      });
      const result = await res.json();
      if (!res.ok) { showToast("Failed: " + (result.error || "Unknown error"), "error"); return; }
      document.getElementById("tkSubmitModal").classList.add("hidden");
      document.getElementById("tkSubjectInput").value = "";
      document.getElementById("tkDescInput").value    = "";
      document.getElementById("tkEsnInput").value     = "";
      const firstRadio = document.querySelector("input[name=tkDeptRadio][value='NOC Department']");
      if (firstRadio) firstRadio.checked = true;

      await fetchTickets();
      showToast("Ticket submitted successfully.", "success");
      dashboardDataChanged();
    } catch (err) {
      showToast("Network error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.innerHTML = "Submit";
    }
  });

  // Discard
  document.getElementById("tkDiscardBtnX")?.addEventListener("click", () => {
    document.getElementById("tkSubmitModal").classList.add("hidden");
  });
  document.getElementById("tkDiscardBtn").addEventListener("click", () => {
    document.getElementById("tkSubmitModal").classList.add("hidden");
  });
  document.getElementById("tkSubmitModal").addEventListener("click", e => {
    if (e.target === document.getElementById("tkSubmitModal"))
      document.getElementById("tkSubmitModal").classList.add("hidden");
  });

  // Edit modal
  document.getElementById("tkEditSaveBtn").addEventListener("click", async () => {
    const id          = document.getElementById("tkEditId").value;
    const subject     = document.getElementById("tkEditSubject").value.trim();
    const description = document.getElementById("tkEditDesc").value.trim();
    const airmac_esn  = document.getElementById("tkEditEsn").value.trim();
    const status      = document.getElementById("tkEditStatus").value;
    if (!subject) { showToast("Subject is required.", "error"); return; }

    const btn = document.getElementById("tkEditSaveBtn");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const res    = await fetch(`/api/tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, airmac_esn, status })
      });
      const result = await res.json();
      if (!res.ok) { showToast("Update failed: " + (result.error || "Unknown error"), "error"); return; }
      document.getElementById("tkEditModal").classList.add("hidden");
      await fetchTickets();
      showToast("Ticket updated.", "success");
    } catch (err) {
      showToast("Network error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save Changes';
    }
  });
  document.getElementById("tkEditCancelBtn").addEventListener("click", () => {
    document.getElementById("tkEditModal").classList.add("hidden");
  });
  document.getElementById("tkEditModal").addEventListener("click", e => {
    if (e.target === document.getElementById("tkEditModal"))
      document.getElementById("tkEditModal").classList.add("hidden");
  });

  // Delete modal
  document.getElementById("tkDeleteCancelBtn").addEventListener("click", () => {
    document.getElementById("tkDeleteModal").classList.add("hidden");
  });

  // View modal
  document.getElementById("tkViewCloseBtn").addEventListener("click", () => {
    document.getElementById("tkViewModal").classList.add("hidden");
  });

  document.getElementById("tkViewModal").addEventListener("click", e => {
    if (e.target === document.getElementById("tkViewModal"))
      document.getElementById("tkViewModal").classList.add("hidden");
  });

  // Fetch from DB
  await fetchTickets();
}

async function fetchTickets() {
  try {
    const res  = await fetch("/api/tickets");
    if (!res.ok) throw new Error("Server error");
    ticketData = await res.json();
    updateTkViewCounts();
    renderTkList();
    renderTkPagination();
  } catch (err) {
    const list = document.getElementById("tkList");
    if (list) list.innerHTML = `<div class="tk-empty"><i class="ri-error-warning-line"></i><p>Error loading tickets</p></div>`;
  }
}

function updateTkViewCounts() {
  const counts = {
    "My Tickets":           ticketData.length,
    "My Open Tickets":      ticketData.filter(t => t.status === "Open").length,
    "My Closed Tickets":    ticketData.filter(t => t.status === "Closed").length,
    "My On hold Tickets":   ticketData.filter(t => t.status === "On hold").length,
    "My Overdue Tickets":   0,
    "Team Tickets":         ticketData.length,
    "Team Open Tickets":    ticketData.filter(t => t.status === "Open").length,
    "Team Closed Tickets":  ticketData.filter(t => t.status === "Closed").length,
    "Team On Hold Tickets": ticketData.filter(t => t.status === "On hold").length,
    "Team Overdue Tickets": 0,
  };
  Object.entries(counts).forEach(([label, count]) => {
    const el = document.getElementById("tkCount_" + label.replace(/\s+/g, "_"));
    if (el) el.textContent = count > 0 ? count : "";
  });
}

function getTkFiltered() {
  return ticketData.filter(t => {
    const matchSearch = !tkSearchQuery ||
      (t.subject || "").toLowerCase().includes(tkSearchQuery) ||
      String(t.id).includes(tkSearchQuery) ||
      (t.airmac_esn || "").toLowerCase().includes(tkSearchQuery);
    const matchView = (() => {
      if (tkCurrentView === "My Tickets")           return true;
      if (tkCurrentView === "My Open Tickets")      return t.status === "Open";
      if (tkCurrentView === "My Closed Tickets")    return t.status === "Closed";
      if (tkCurrentView === "My On hold Tickets")   return t.status === "On hold";
      if (tkCurrentView === "My Overdue Tickets")   return false;
      if (tkCurrentView === "Team Tickets")         return true;
      if (tkCurrentView === "Team Open Tickets")    return t.status === "Open";
      if (tkCurrentView === "Team Closed Tickets")  return t.status === "Closed";
      if (tkCurrentView === "Team On Hold Tickets") return t.status === "On hold";
      if (tkCurrentView === "Team Overdue Tickets") return false;
      return true;
    })();
    return matchSearch && matchView;
  });
}

function openTkEditModal(t) {
  document.getElementById("tkEditId").value       = t.id;
  document.getElementById("tkEditSubject").value  = t.subject || "";
  document.getElementById("tkEditDesc").value     = t.description || "";
  document.getElementById("tkEditEsn").value      = t.airmac_esn || "";
  document.getElementById("tkEditStatus").value   = t.status || "Open";
  document.getElementById("tkEditModal").classList.remove("hidden");
}

function openTkDeleteModal(id) {
  const modal      = document.getElementById("tkDeleteModal");
  const confirmBtn = document.getElementById("tkDeleteConfirmBtn");
  modal.classList.remove("hidden");
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newBtn);
  document.getElementById("tkDeleteCancelBtn").onclick = () => modal.classList.add("hidden");
  modal.onclick = e => { if (e.target === modal) modal.classList.add("hidden"); };
  newBtn.onclick = async () => {
    newBtn.disabled = true; newBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Deleting…';
    try {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown"), "error"); return; }
      modal.classList.add("hidden");
      await fetchTickets();
      showToast("Ticket deleted.", "success");
    } catch (err) { showToast("Network error.", "error"); }
    finally { newBtn.disabled = false; newBtn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete'; }
  };
}

function openTkViewModal(t) {
  // Status config
  const statusMap = {
    'Open':    { cls: 'tkd-status-open',    icon: 'ri-radio-button-line' },
    'Closed':  { cls: 'tkd-status-closed',  icon: 'ri-checkbox-circle-line' },
    'On hold': { cls: 'tkd-status-hold',    icon: 'ri-pause-circle-line' },
    'Overdue': { cls: 'tkd-status-overdue', icon: 'ri-error-warning-line' },
  };
  const s = statusMap[t.status] || { cls: 'tkd-status-open', icon: 'ri-radio-button-line' };

  // Ticket ID
  document.getElementById('tkViewId').textContent = '#' + (t.id || '—');

  // Status pill
  document.getElementById('tkViewStatus').innerHTML =
    `<i class="${s.icon}"></i><span>${t.status || 'Open'}</span>`;
  document.getElementById('tkViewStatus').className = `tkd-meta-pill tkd-status-pill ${s.cls}`;

  // Date
  let dateStr = '—';
  if (t.created_at) {
    try {
      dateStr = new Date(t.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch(e) {}
  }
  document.getElementById('tkViewCreated').textContent = dateStr;

  // Subject
  document.getElementById('tkViewSubject').textContent = t.subject || 'No subject provided';

  // Airmac / ESN
  document.getElementById('tkViewEsn').textContent = t.airmac_esn || '—';

  // Department
  document.getElementById('tkViewDept').textContent = t.department || '—';

  // Description
  document.getElementById('tkViewDesc').textContent = t.description || 'No description provided.';

  document.getElementById('tkViewModal').classList.remove('hidden');

  // Load replies for this ticket
  loadTkReplies(t.id);

  // Wire Send Reply button
  const sendBtn = document.getElementById('tkSendReplyBtn');
  // Remove previous listener by cloning
  const newBtn = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newBtn, sendBtn);
  newBtn.addEventListener('click', () => sendTkReply(t.id));

  // Also send on Ctrl+Enter
  const textarea = document.getElementById('tkReplyInput');
  const newTa = textarea.cloneNode(true);
  textarea.parentNode.replaceChild(newTa, textarea);
  newTa.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendTkReply(t.id);
  });
}

async function loadTkReplies(ticketId) {
  const list = document.getElementById('tkRepliesList');
  if (!list) return;
  list.innerHTML = '<div class="tkd-replies-empty"><i class="ri-loader-4-line spin"></i> Loading…</div>';
  try {
    const res  = await fetch(`/api/tickets/${ticketId}/replies`);
    const data = await res.json();
    renderTkReplies(data);
  } catch {
    list.innerHTML = '<div class="tkd-replies-empty"><i class="ri-error-warning-line"></i> Could not load replies.</div>';
  }
}

function renderTkReplies(replies) {
  const list = document.getElementById('tkRepliesList');
  if (!list) return;
  if (!replies.length) {
    list.innerHTML = '<div class="tkd-replies-empty"><i class="ri-chat-off-line"></i> No replies yet. Be the first to respond.</div>';
    return;
  }
  const loggedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  list.innerHTML = replies.map(r => {
    const isMine = r.user_id && String(r.user_id) === String(loggedUser.id);
    const name   = r.full_name || 'User #' + (r.user_id || '?');
    const time   = r.created_at ? new Date(r.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }) : '—';
    const actions = isMine ? `
      <div class="tkd-reply-actions">
        <button class="tkd-reply-act-btn tkd-reply-edit-btn" data-id="${r.id}" title="Edit"><i class="ri-edit-line"></i></button>
        <button class="tkd-reply-act-btn tkd-reply-del-btn"  data-id="${r.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
      </div>` : '';
    return `
      <div class="tkd-reply-bubble ${isMine ? 'mine' : 'theirs'}" data-id="${r.id}">
        <div class="tkd-reply-header">
          <div class="tkd-reply-meta">
            <span class="tkd-reply-author">${escHtml(name)}</span>
            <span class="tkd-reply-time">${time}</span>
          </div>
          ${actions}
        </div>
        <div class="tkd-reply-msg" id="tkd-reply-msg-${r.id}">${escHtml(r.message)}</div>
        <div class="tkd-reply-edit-wrap hidden" id="tkd-reply-edit-${r.id}">
          <textarea class="tkd-reply-edit-input">${escHtml(r.message)}</textarea>
          <div class="tkd-reply-edit-actions">
            <button class="tkd-reply-save-btn" data-id="${r.id}"><i class="ri-check-line"></i> Save</button>
            <button class="tkd-reply-cancel-btn" data-id="${r.id}"><i class="ri-close-line"></i> Cancel</button>
          </div>
        </div>
      </div>`;
  }).join('');

  list.scrollTop = list.scrollHeight;

  // Wire edit buttons
  list.querySelectorAll('.tkd-reply-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      document.getElementById(`tkd-reply-msg-${id}`).classList.add('hidden');
      document.getElementById(`tkd-reply-edit-${id}`).classList.remove('hidden');
      btn.closest('.tkd-reply-bubble').querySelector('.tkd-reply-del-btn').style.display = 'none';
      btn.style.display = 'none';
    });
  });

  // Wire cancel edit
  list.querySelectorAll('.tkd-reply-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      document.getElementById(`tkd-reply-msg-${id}`).classList.remove('hidden');
      document.getElementById(`tkd-reply-edit-${id}`).classList.add('hidden');
      const bubble = btn.closest('.tkd-reply-bubble');
      bubble.querySelector('.tkd-reply-edit-btn').style.display = '';
      bubble.querySelector('.tkd-reply-del-btn').style.display  = '';
    });
  });

  // Wire save edit
  list.querySelectorAll('.tkd-reply-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.id;
      const val = document.querySelector(`#tkd-reply-edit-${id} .tkd-reply-edit-input`).value.trim();
      if (!val) { showToast('Message cannot be empty.', 'error'); return; }
      btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i>';
      try {
        const res = await fetch(`/api/replies/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: val })
        });
        if (!res.ok) throw new Error();
        // Update in-place
        document.getElementById(`tkd-reply-msg-${id}`).textContent = val;
        document.getElementById(`tkd-reply-msg-${id}`).classList.remove('hidden');
        document.getElementById(`tkd-reply-edit-${id}`).classList.add('hidden');
        const bubble = btn.closest('.tkd-reply-bubble');
        bubble.querySelector('.tkd-reply-edit-btn').style.display = '';
        bubble.querySelector('.tkd-reply-del-btn').style.display  = '';
        showToast('Reply updated.', 'success');
      } catch { showToast('Failed to update reply.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-check-line"></i> Save'; }
    });
  });

  // Wire delete buttons
  list.querySelectorAll('.tkd-reply-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      // Use inline confirm inside the bubble instead of the global modal
      const bubble = btn.closest('.tkd-reply-bubble');
      // Prevent double-click
      if (bubble.dataset.delPending) return;
      bubble.dataset.delPending = '1';
      btn.innerHTML = '<i class="ri-loader-4-line spin"></i>';
      btn.disabled = true;
      try {
        const res = await fetch(`/api/replies/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        bubble.style.transition = 'opacity 0.2s, transform 0.2s';
        bubble.style.opacity = '0';
        bubble.style.transform = 'scale(0.95)';
        setTimeout(() => {
          bubble.remove();
          if (!list.querySelector('.tkd-reply-bubble')) {
            list.innerHTML = '<div class="tkd-replies-empty"><i class="ri-chat-off-line"></i> No replies yet. Be the first to respond.</div>';
          }
        }, 200);
        showToast('Reply deleted.', 'success');
      } catch {
        showToast('Failed to delete reply.', 'error');
        delete bubble.dataset.delPending;
        btn.innerHTML = '<i class="ri-delete-bin-line"></i>';
        btn.disabled = false;
      }
    });
  });
}

async function sendTkReply(ticketId) {
  const input = document.getElementById('tkReplyInput');
  if (!input) return;
  const message = input.value.trim();
  if (!message) { showToast('Reply cannot be empty.', 'error'); return; }

  const loggedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const btn = document.getElementById('tkSendReplyBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Sending…';

  try {
    const res = await fetch(`/api/tickets/${ticketId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, user_id: loggedUser.id || null })
    });
    const result = await res.json();
    if (!res.ok) { showToast('Failed: ' + (result.error || 'Unknown'), 'error'); return; }
    input.value = '';
    await loadTkReplies(ticketId);
    showToast('Reply sent.', 'success');
  } catch { showToast('Network error.', 'error'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-send-plane-fill"></i> Send Reply';
  }
}


function renderTkList() {
  const list = document.getElementById("tkList");
  if (!list) return;
  const filtered = getTkFiltered();
  const start    = (tkCurrentPage - 1) * tkRowsPerPage;
  const paged    = filtered.slice(start, start + tkRowsPerPage);

  if (!paged.length) {
    list.innerHTML = `<div class="tk-empty"><i class="ri-inbox-line"></i><p>No tickets found</p></div>`;
    return;
  }

  const assignee = (user?.full_name || user?.email || "U").slice(0, 2).toUpperCase();

  list.innerHTML = paged.map(t => {
    const statusClass = t.status === "Closed" ? "tk-status-closed"
      : t.status === "Open" ? "tk-status-open"
      : "tk-status-hold";
    const age = t.created_at ? timeAgo(new Date(t.created_at)) : "";
    return `
      <div class="tk-row">
        <div class="tk-row-main tk-ticket-open" data-id="${t.id}" role="button" tabindex="0" aria-label="View ticket ${escHtml(t.subject || `#${t.id}`)}">
          <div class="tk-row-subject">${escHtml(t.subject)}</div>
          <div class="tk-row-meta">
            <span class="tk-id">#${t.id}</span>
            <span class="tk-dot">•</span>
            <i class="ri-global-line tk-meta-icon"></i>
            ${t.airmac_esn ? `<span class="tk-dot">•</span><span>${escHtml(t.airmac_esn)}</span>` : ''}
            ${age ? `<span class="tk-dot">•</span><span>${age}</span>` : ''}
          </div>
        </div>
        <div class="tk-row-right">
          <div class="tk-avatar">${assignee}</div>
          <span class="tk-status-badge ${statusClass}">${escHtml(t.status)}</span>
        </div>
      </div>
    `;
  }).join("");
  list.querySelectorAll(".tk-ticket-open").forEach(el => {
    const openTicket = () => {
      const t = ticketData.find(x => String(x.id) === el.dataset.id);
      if (t) openTkViewModal(t);
    };
    el.addEventListener("click", openTicket);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openTicket();
      }
    });
  });
}

function renderTkPagination() {
  const container = document.getElementById("tkPagination");
  if (!container) return;
  const filtered = getTkFiltered();
  const total    = Math.ceil(filtered.length / tkRowsPerPage);
  if (total <= 1) { container.innerHTML = ""; return; }
  const range = getPageRange(tkCurrentPage, total);
  container.innerHTML = `
    <button class="page-btn ${tkCurrentPage===1?'disabled':''}" onclick="goTkPage(${tkCurrentPage-1})" ${tkCurrentPage===1?'disabled':''}><i class="ri-arrow-left-s-line"></i></button>
    ${range.map(p => p==='...'
      ? `<button class="page-btn dots" disabled>…</button>`
      : `<button class="page-btn ${p===tkCurrentPage?'active':''}" onclick="goTkPage(${p})">${p}</button>`
    ).join("")}
    <button class="page-btn ${tkCurrentPage===total?'disabled':''}" onclick="goTkPage(${tkCurrentPage+1})" ${tkCurrentPage===total?'disabled':''}><i class="ri-arrow-right-s-line"></i></button>
  `;
}

function goTkPage(page) {
  const total = Math.ceil(getTkFiltered().length / tkRowsPerPage);
  if (page < 1 || page > total) return;
  tkCurrentPage = page; renderTkList(); renderTkPagination();
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return Math.floor(diff/60) + " min ago";
  if (diff < 86400) return Math.floor(diff/3600) + " hr ago";
  if (diff < 2592000) return Math.floor(diff/86400) + " days ago";
  if (diff < 31536000) return Math.floor(diff/2592000) + " months ago";
  return Math.floor(diff/31536000) + " yr ago";
}

/* ================= LETTERS ================= */

let lettersFolderStack    = [];
let lettersSearchQuery    = "";
let lettersFilterType     = "all";
let lettersFilterUploader = "";
let lettersFilterModified = "all";
let lettersClipboard      = null;
let lettersPreviewItems   = [];
let lettersPreviewIndex   = -1;
let lettersPreviewKeydown = null;

function lettersCurrentFolder() { return lettersFolderStack.length ? lettersFolderStack[lettersFolderStack.length - 1] : null; }
function lettersCurrentFolderId() { const f = lettersCurrentFolder(); return f ? f.id : null; }
function lettersModuleScope() { return "noc"; }
function lettersApiUrl(path, params = {}) {
  const search = new URLSearchParams();
  search.set("module", lettersModuleScope());
  Object.entries(params || {}).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") search.set(key, val);
  });
  return `${path}${path.includes("?") ? "&" : "?"}${search.toString()}`;
}

function loadLetters() {
  lettersFolderStack    = [];
  lettersSearchQuery    = "";
  lettersFilterType     = "all";
  lettersFilterUploader = "";
  lettersFilterModified = "all";

  mainContent.innerHTML = `
    <div class="letters-topbar">
      <h2 class="letters-title"><i class="ri-folder-open-line"></i> Files</h2>
      <div class="letters-search-box">
        <i class="ri-search-line"></i>
        <input type="text" id="lettersSearch" placeholder="Search files and folders…">
      </div>
    </div>

    <div class="letters-layout">
      <div class="letters-sidebar-card">
        <div class="letters-sidebar-header">Recent Files</div>
        <div class="letters-recent-list" id="lettersRecentList">
          <div class="letters-empty-recent"><i class="ri-loader-4-line spin"></i></div>
        </div>
      </div>

      <div class="letters-main-card">
        <div class="letters-main-toolbar">
          <div class="letters-breadcrumb" id="lettersBreadcrumb"></div>
          <div class="letters-main-actions">
            <button class="tool-btn letters-paste-btn hidden" id="lettersPasteBtn"><i class="ri-clipboard-line"></i> Paste</button>
            <button class="tool-btn" id="lettersViewDownloadsBtn"><i class="ri-download-cloud-2-line"></i> View Downloads</button>
            <button class="tool-btn apply-btn" id="lettersNewBtn"><i class="ri-add-line"></i> New</button>
          </div>
        </div>

        <div class="letters-filter-bar" id="lettersFilterBar">
          <div class="letters-filter-chip" id="chipType">
            <span class="chip-label">Type</span>
            <i class="ri-arrow-down-s-line chip-arrow"></i>
            <div class="letters-chip-dropdown" id="dropType">
              <div class="chip-option chip-opt-type active" data-val="all">All types</div>
              <div class="chip-option chip-opt-type" data-val="pdf"><i class="ri-file-pdf-2-fill" style="color:#e74c3c"></i> PDF</div>
              <div class="chip-option chip-opt-type" data-val="word"><i class="ri-file-word-2-fill" style="color:#2f4b85"></i> Word</div>
              <div class="chip-option chip-opt-type" data-val="excel"><i class="ri-file-excel-2-fill" style="color:#27ae60"></i> Excel</div>
              <div class="chip-option chip-opt-type" data-val="image"><i class="ri-image-fill" style="color:#f59e0b"></i> Image</div>
              <div class="chip-option chip-opt-type" data-val="video"><i class="ri-video-fill" style="color:#8b5cf6"></i> Video</div>
            </div>
          </div>
          <div class="letters-filter-chip" id="chipUploader">
            <span class="chip-label">Uploader</span>
            <i class="ri-arrow-down-s-line chip-arrow"></i>
            <div class="letters-chip-dropdown" id="dropUploader">
              <div class="chip-option chip-opt-uploader active" data-val="">Anyone</div>
            </div>
          </div>
          <div class="letters-filter-chip" id="chipModified">
            <span class="chip-label">Modified</span>
            <i class="ri-arrow-down-s-line chip-arrow"></i>
            <div class="letters-chip-dropdown" id="dropModified">
              <div class="chip-option chip-opt-modified active" data-val="all">Any time</div>
              <div class="chip-option chip-opt-modified" data-val="today">Today</div>
              <div class="chip-option chip-opt-modified" data-val="week">This week</div>
              <div class="chip-option chip-opt-modified" data-val="month">This month</div>
              <div class="chip-option chip-opt-modified" data-val="year">This year</div>
            </div>
          </div>
          <button class="letters-filter-clear hidden" id="lettersClearFilters"><i class="ri-close-line"></i> Clear</button>
        </div>

        <div class="letters-content" id="lettersContent">
          <div class="letters-empty"><i class="ri-loader-4-line spin"></i></div>
        </div>
      </div>
    </div>

    <!-- New Folder Modal -->
    <div id="lettersFolderModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-folder-add-line"></i></div>
          <div class="add-modal-title"><h3>New Folder</h3><p>Create a new folder to organise your files.</p></div>
          <button class="modal-close-btn" id="lettersFolderModalClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid" style="grid-template-columns:1fr;">
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-folder-line"></i> Folder Name</label>
              <input id="newFolderName" type="text" class="add-field-input" placeholder="e.g. Relocation" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Folder name must be unique</span>
          <div class="modal-actions">
            <button class="tool-btn" id="lettersFolderModalCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="lettersFolderModalConfirm"><i class="ri-save-line"></i> Create</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Upload File Modal -->
    <div id="lettersFileModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-file-upload-line"></i></div>
          <div class="add-modal-title"><h3>Upload File</h3><p>Add a new letter or document to this folder.</p></div>
          <button class="modal-close-btn" id="lettersFileModalClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid" style="grid-template-columns:1fr;">
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-upload-line"></i> Choose File</label>
              <label class="letters-upload-drop" id="lettersUploadDrop" for="newFileInput">
                <i class="ri-upload-cloud-2-line"></i>
                <strong>Drop files here or click to browse</strong>
                <span>Upload multiple PDF, Word, Excel, image, archive, or video files</span>
              </label>
              <input id="newFileInput" type="file" class="add-field-input letters-upload-input" multiple accept=".pdf,.docx,.xlsx,.doc,.xls,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.mp4,.webm,.mov,.avi,.mkv">
              <div class="letters-upload-queue" id="lettersUploadQueue"></div>
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-user-line"></i> Uploader Name</label>
              <input id="newFileUploader" type="text" class="add-field-input" placeholder="Your name" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint" id="lettersFileUploadHint"><i class="ri-information-line"></i> PDF, Word, Excel, Images, Videos supported</span>
          <div class="modal-actions">
            <button class="tool-btn" id="lettersFileModalCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="lettersFileModalConfirm"><i class="ri-upload-line"></i> Upload</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Rename Modal -->
    <div id="lettersRenameModal" class="modal-overlay hidden">
      <div class="modal-box" style="width:400px;padding:28px;">
        <h3 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;color:#1e3a6e;font-size:17px;"><i class="ri-edit-line"></i> Rename</h3>
        <div class="form-group">
          <label>New Name</label>
          <input id="renameInput" type="text" class="add-field-input" style="width:100%;" autocomplete="off">
        </div>
        <div class="modal-actions">
          <button class="tool-btn" id="lettersRenameCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="lettersRenameConfirm"><i class="ri-save-line"></i> Rename</button>
        </div>
      </div>
    </div>

    <!-- File Preview Modal -->
    <div id="lettersPreviewModal" class="modal-overlay hidden">
      <div class="letters-preview-box">
        <div class="letters-preview-header">
          <div class="letters-preview-title">
            <i class="ri-file-line" id="lettersPreviewIcon"></i>
            <span id="lettersPreviewName">Document</span>
          </div>
          <div class="letters-preview-header-actions">
            <button class="letters-preview-nav-btn" id="lettersPreviewPrev" title="Previous file" aria-label="Previous file"><i class="ri-arrow-left-s-line"></i></button>
            <button class="letters-preview-nav-btn" id="lettersPreviewNext" title="Next file" aria-label="Next file"><i class="ri-arrow-right-s-line"></i></button>
            <a class="tool-btn" id="lettersPreviewDownload" target="_blank" title="Download">
              <i class="ri-download-line"></i> Download
            </a>
            <button class="modal-close-btn" id="lettersPreviewClose" style="position:static;"><i class="ri-close-line"></i></button>
          </div>
        </div>
        <div class="letters-preview-body" id="lettersPreviewBody">
          <div class="letters-empty"><i class="ri-loader-4-line spin"></i><p>Loading preview…</p></div>
        </div>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <div id="lettersDeleteModal" class="modal-overlay hidden">
      <div class="modal-box confirm-modal-box">
        <div class="confirm-modal-icon danger-icon"><i class="ri-delete-bin-2-line"></i></div>
        <h3 class="confirm-modal-title">Delete</h3>
        <p class="confirm-modal-msg" id="lettersDeleteMsg">Are you sure?</p>
        <div class="confirm-modal-actions">
          <button class="tool-btn" id="lettersDeleteCancel">Cancel</button>
          <button class="tool-btn danger-btn" id="lettersDeleteConfirm"><i class="ri-delete-bin-line"></i> Delete</button>
        </div>
      </div>
    </div>

    <!-- ── Download History Modal ── -->
    <div class="modal-overlay hidden" id="dlHistoryModal">
      <div class="dl-history-modal-box">
        <div class="dl-history-modal-header">
          <div class="dl-history-modal-title"><i class="ri-download-2-line"></i> Download History<span id="dlHistoryModalFileName"></span></div>
          <div class="dl-history-modal-search">
            <div class="dl-history-search-wrap">
              <i class="ri-search-line"></i>
              <input type="text" id="dlHistorySearch" placeholder="Search downloads…" autocomplete="off">
            </div>
          </div>
          <button class="modal-close-btn" id="dlHistoryModalClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="dl-history-table-wrap">
          <table class="dl-history-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Downloaded By</th>
                <th>Date</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="dlHistoryBody">
              <tr><td colspan="4" class="dl-history-empty"><i class="ri-loader-4-line spin"></i> Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById("lettersSearch").addEventListener("input", function () {
    lettersSearchQuery = this.value.trim();
    fetchLettersContent();
  });

  document.getElementById("lettersNewBtn").addEventListener("click", () => {
    openLettersNewChoiceMenu(document.getElementById("lettersNewBtn"));
  });

  document.getElementById("lettersViewDownloadsBtn")?.addEventListener("click", () => {
    openDownloadHistoryModal();
  });

  fetchLettersRecent();
  fetchLettersContent();
  bindLettersFilterChips();
  updateLettersClearBtn();
  bindLettersPasteBtn();

  // Download history modal
  document.getElementById('dlHistoryModalClose')?.addEventListener('click', () => {
    document.getElementById('dlHistoryModal').classList.add('hidden');
  });
  document.getElementById('dlHistoryModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });
  document.getElementById('dlHistorySearch')?.addEventListener('input', function () {
    renderDownloadHistory(this.value.trim());
  });
}

/* ── Download History ── */
let dlHistoryAll = [];

function openDownloadHistoryModal(fileId, fileName) {
  const modal = document.getElementById('dlHistoryModal');
  if (!modal) return;
  const fileNameEl = document.getElementById('dlHistoryModalFileName');
  if (fileNameEl) fileNameEl.textContent = fileName ? ` — ${fileName}` : '';
  const searchInput = document.getElementById('dlHistorySearch');
  if (searchInput) searchInput.value = '';
  modal.classList.remove('hidden');

  if (fileId) {
    // Filter history for this specific file
    fetch(lettersApiUrl('/api/letters/download-history'))
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        dlHistoryAll = (rows || []).filter(r => String(r.file_id) === String(fileId));
        renderDownloadHistory('');
      })
      .catch(() => { dlHistoryAll = []; renderDownloadHistory(''); });
  } else {
    fetchDownloadHistory();
  }
}


function fetchDownloadHistory() {
  fetch(lettersApiUrl('/api/letters/download-history'))
    .then(r => r.ok ? r.json() : [])
    .then(rows => {
      dlHistoryAll = rows || [];
      renderDownloadHistory('');
    })
    .catch(() => {
      dlHistoryAll = [];
      renderDownloadHistory('');
    });
}

function renderDownloadHistory(query) {
  const tbody = document.getElementById('dlHistoryBody');
  if (!tbody) return;
  let rows = dlHistoryAll;
  if (query) {
    const q = query.toLowerCase();
    rows = rows.filter(r =>
      (r.file_name || '').toLowerCase().includes(q) ||
      (r.downloaded_by || '').toLowerCase().includes(q)
    );
  }
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="dl-history-empty">${query ? 'No results found.' : 'No downloads recorded yet.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const d = r.downloaded_at ? new Date(r.downloaded_at) : null;
    const dateStr = d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
    return `<tr>
      <td><i class="ri-file-line" style="color:#3b82f6;margin-right:6px;"></i>${escHtml(r.file_name || '—')}</td>
      <td>${escHtml(r.downloaded_by || '—')}</td>
      <td>${dateStr}</td>
      <td>${timeStr}</td>
    </tr>`;
  }).join('');
}

function logDownloadHistory(fileId, fileName) {
  const u = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const downloadedBy = u.full_name || u.email || 'Unknown';
  fetch(lettersApiUrl('/api/letters/download-history'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, file_name: fileName, downloaded_by: downloadedBy, module: lettersModuleScope() })
  }).catch(() => {});
}

function bindLettersFilterChips() {
  const closeAllDrops = () =>
    document.querySelectorAll(".letters-chip-dropdown").forEach(d => d.classList.remove("open"));

  ["chipType","chipUploader","chipModified"].forEach(chipId => {
    const chip = document.getElementById(chipId);
    if (!chip) return;
    chip.addEventListener("click", e => {
      e.stopPropagation();
      const drop = chip.querySelector(".letters-chip-dropdown");
      const wasOpen = drop.classList.contains("open");
      closeAllDrops();
      if (!wasOpen) { drop.classList.add("open"); positionChipDropdown(chip, drop); }
    });
  });

  document.addEventListener("click", closeAllDrops);

  document.getElementById("dropType")?.addEventListener("click", e => {
    const opt = e.target.closest(".chip-opt-type"); if (!opt) return;
    e.stopPropagation();
    document.querySelectorAll(".chip-opt-type").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    lettersFilterType = opt.dataset.val;
    const chip = document.getElementById("chipType");
    chip.querySelector(".chip-label").textContent = lettersFilterType === "all" ? "Type" : opt.textContent.trim();
    chip.classList.toggle("chip-active", lettersFilterType !== "all");
    closeAllDrops(); updateLettersClearBtn(); fetchLettersContent();
  });

  document.getElementById("dropUploader")?.addEventListener("click", e => {
    const opt = e.target.closest(".chip-opt-uploader"); if (!opt) return;
    e.stopPropagation();
    document.querySelectorAll(".chip-opt-uploader").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    lettersFilterUploader = opt.dataset.val;
    const chip = document.getElementById("chipUploader");
    chip.querySelector(".chip-label").textContent = lettersFilterUploader || "Uploader";
    chip.classList.toggle("chip-active", lettersFilterUploader !== "");
    closeAllDrops(); updateLettersClearBtn(); fetchLettersContent();
  });

  document.getElementById("dropModified")?.addEventListener("click", e => {
    const opt = e.target.closest(".chip-opt-modified"); if (!opt) return;
    e.stopPropagation();
    document.querySelectorAll(".chip-opt-modified").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    lettersFilterModified = opt.dataset.val;
    const chip = document.getElementById("chipModified");
    chip.querySelector(".chip-label").textContent = lettersFilterModified === "all" ? "Modified" : opt.textContent.trim();
    chip.classList.toggle("chip-active", lettersFilterModified !== "all");
    closeAllDrops(); updateLettersClearBtn(); fetchLettersContent();
  });

  document.getElementById("lettersClearFilters")?.addEventListener("click", () => {
    lettersFilterType = "all"; lettersFilterUploader = ""; lettersFilterModified = "all"; lettersSearchQuery = "";
    const si = document.getElementById("lettersSearch"); if (si) si.value = "";
    document.getElementById("chipType").querySelector(".chip-label").textContent = "Type";
    document.getElementById("chipUploader").querySelector(".chip-label").textContent = "Uploader";
    document.getElementById("chipModified").querySelector(".chip-label").textContent = "Modified";
    ["chipType","chipUploader","chipModified"].forEach(id => document.getElementById(id)?.classList.remove("chip-active"));
    document.querySelectorAll(".chip-opt-type").forEach(o => o.classList.toggle("active", o.dataset.val === "all"));
    document.querySelectorAll(".chip-opt-uploader").forEach(o => o.classList.toggle("active", o.dataset.val === ""));
    document.querySelectorAll(".chip-opt-modified").forEach(o => o.classList.toggle("active", o.dataset.val === "all"));
    updateLettersClearBtn();
    fetchLettersContent();
  });
}

function positionChipDropdown(chip, drop) {
  const rect = chip.getBoundingClientRect();
  drop.style.position = "fixed";
  drop.style.top  = (rect.bottom + 4) + "px";
  drop.style.left = rect.left + "px";
  drop.style.zIndex = "9999";
}

function updateLettersClearBtn() {
  const btn = document.getElementById("lettersClearFilters");
  if (!btn) return;
  const active = lettersFilterType !== "all" || lettersFilterUploader !== "" || lettersFilterModified !== "all" || lettersSearchQuery !== "";
  btn.classList.toggle("hidden", !active);
}

function populateUploaderChip(files) {
  const drop = document.getElementById("dropUploader");
  if (!drop) return;
  const names   = [...new Set(files.map(f => f.uploader_name).filter(Boolean))];
  const current = lettersFilterUploader;
  const anyActive = current === "" ? " active" : "";
  drop.innerHTML = `<div class="chip-option chip-opt-uploader${anyActive}" data-val="">Anyone</div>`;
  names.forEach(name => {
    const el = document.createElement("div");
    el.className = "chip-option chip-opt-uploader" + (current === name ? " active" : "");
    el.dataset.val = name;
    el.textContent = name;
    drop.appendChild(el);
  });
}

function applyLettersFileFilters(files) {
  let list = [...files];
  if (lettersSearchQuery) {
    const q = lettersSearchQuery.toLowerCase();
    list = list.filter(f => f.file_name.toLowerCase().includes(q) || (f.uploader_name || "").toLowerCase().includes(q));
  }
  if (lettersFilterType !== "all") {
    list = list.filter(f => {
      const t = (f.file_type || "").toLowerCase();
      const e = (f.file_name || "").split(".").pop().toLowerCase();
      if (lettersFilterType === "pdf")   return t === "pdf"   || e === "pdf";
      if (lettersFilterType === "word")  return ["word","doc","docx"].includes(t) || ["doc","docx"].includes(e);
      if (lettersFilterType === "excel") return ["excel","xls","xlsx"].includes(t) || ["xls","xlsx"].includes(e);
      if (lettersFilterType === "image") return ["image","jpg","jpeg","png","gif","webp"].includes(t);
      if (lettersFilterType === "video") return ["video","mp4","webm","mov","avi","mkv"].includes(t);
      return true;
    });
  }
  if (lettersFilterUploader) list = list.filter(f => f.uploader_name === lettersFilterUploader);
  if (lettersFilterModified !== "all") {
    const now = new Date();
    const cutoffs = {
      today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      week:  new Date(now - 7  * 86400000),
      month: new Date(now.getFullYear(), now.getMonth(), 1),
      year:  new Date(now.getFullYear(), 0, 1),
    };
    const cutoff = cutoffs[lettersFilterModified];
    if (cutoff) list = list.filter(f => new Date(f.created_at) >= cutoff);
  }
  return list;
}

async function fetchLettersRecent() {
  try {
    const res  = await fetch(lettersApiUrl("/api/letters/files/recent"));
    const data = await res.json();
    renderLettersRecent(data);
  } catch { renderLettersRecent([]); }
}

async function fetchLettersContent() {
  renderLettersBreadcrumb();
  updateLettersPasteBtn();
  const content = document.getElementById("lettersContent");
  content.innerHTML = `<div class="letters-empty"><i class="ri-loader-4-line spin"></i></div>`;
  const fid = lettersCurrentFolderId();
  try {
    if (fid === null) {
      const res  = await fetch(lettersApiUrl("/api/letters/folders"));
      const data = await res.json();
      renderLettersFolders(data, null);
    } else {
      const [subfoldersRes, filesRes] = await Promise.all([
        fetch(lettersApiUrl("/api/letters/folders", { parent_id: fid })),
        fetch(lettersApiUrl(`/api/letters/folders/${fid}/files`, { q: lettersSearchQuery }))
      ]);
      const subfolders = await subfoldersRes.json();
      const files      = await filesRes.json();
      renderLettersFolderContents(subfolders, files, fid);
    }
  } catch (err) {
    content.innerHTML = `<div class="letters-empty"><i class="ri-error-warning-line"></i><p>Error loading data</p></div>`;
  }
}

function renderLettersBreadcrumb() {
  const bc = document.getElementById("lettersBreadcrumb");
  if (!bc) return;
  const crumbs = [
    `<span class="crumb ${lettersFolderStack.length === 0 ? "crumb-active" : "crumb-link"}" data-depth="-1"><i class="ri-home-4-line"></i> Home</span>`
  ];
  lettersFolderStack.forEach((f, i) => {
    crumbs.push(`<i class="ri-arrow-right-s-line crumb-sep"></i>`);
    const isLast = i === lettersFolderStack.length - 1;
    crumbs.push(`<span class="crumb ${isLast ? "crumb-active" : "crumb-link"}" data-depth="${i}">${f.name}</span>`);
  });
  bc.innerHTML = crumbs.join("");
  bc.querySelectorAll(".crumb-link").forEach(el => {
    el.addEventListener("click", () => {
      const depth = parseInt(el.dataset.depth);
      if (depth === -1) lettersFolderStack = [];
      else lettersFolderStack = lettersFolderStack.slice(0, depth + 1);
      lettersSearchQuery = "";
      const si = document.getElementById("lettersSearch");
      if (si) si.value = "";
      fetchLettersContent();
    });
  });
}

function renderLettersRecent(files) {
  const list = document.getElementById("lettersRecentList");
  if (!list) return;
  if (!files.length) { list.innerHTML = `<div class="letters-empty-recent">No files yet</div>`; return; }
  list.innerHTML = files.map(f => {
    const fi = getLettersFileIcon(f.file_type, f.file_name);
    return `
      <div class="letters-recent-item" title="${f.file_name}">
        ${getLettersThumbHtml(f, fi, "recent")}
        <span class="letters-recent-name">${f.file_name}</span>
      </div>
    `;
  }).join("");
}

function buildFolderCardsHTML(list) {
  const folderIcons = ["ri-map-pin-2-fill","ri-tools-fill","ri-file-text-fill","ri-team-fill","ri-settings-5-fill","ri-folder-fill"];
  return list.map((f, i) => `
    <div class="letters-folder-card" data-id="${f.id}" data-name="${f.folder_name}">
      <div class="letters-folder-actions">
        <button class="letters-kebab" data-type="folder" data-id="${f.id}" data-name="${f.folder_name}"><i class="ri-more-2-fill"></i></button>
      </div>
      <div class="letters-folder-icon"><i class="${folderIcons[i % folderIcons.length]}"></i></div>
      <div class="letters-folder-name">${f.folder_name}</div>
      <div class="letters-folder-count">${f.file_count ?? 0} item${(f.file_count ?? 0) !== 1 ? "s" : ""}</div>
    </div>
  `).join("");
}

function bindFolderCardClicks(container) {
  container.querySelectorAll(".letters-folder-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".letters-kebab")) return;
      const folderId = parseInt(card.dataset.id);
      if (lettersCurrentFolderId() === folderId) return;
      lettersFolderStack.push({ id: folderId, name: card.dataset.name });
      fetchLettersContent();
    });
  });
}

function renderLettersFolders(folders) {
  const content = document.getElementById("lettersContent");
  const q = lettersSearchQuery.toLowerCase();
  let list = folders;
  if (q) list = folders.filter(f => f.folder_name.toLowerCase().includes(q));
  if (!list.length) {
    content.innerHTML = `<div class="letters-empty"><i class="ri-folder-open-line"></i><p>${q ? "No folders match your search" : "No folders yet — click <strong>New</strong> to create one."}</p></div>`;
    return;
  }
  content.innerHTML = `<div class="letters-folders-grid">${buildFolderCardsHTML(list)}</div>`;
  bindFolderCardClicks(content);
  bindLettersKebabs(content);
}

function renderLettersFolderContents(subfolders, files, parentId) {
  const content = document.getElementById("lettersContent");
  const q = lettersSearchQuery.toLowerCase();
  let filteredFolders = q ? subfolders.filter(f => f.folder_name.toLowerCase().includes(q)) : subfolders;
  if (lettersFilterType !== "all") filteredFolders = [];
  let html = "";
  if (filteredFolders.length) {
    html += `<div class="letters-section-label"><i class="ri-folder-line"></i> Folders</div>`;
    html += `<div class="letters-folders-grid">${buildFolderCardsHTML(filteredFolders)}</div>`;
  }
  const filteredFiles = applyLettersFileFilters(files);
  lettersPreviewItems = filteredFiles;
  populateUploaderChip(files);
  if (filteredFiles.length) {
    html += `<div class="letters-section-label" style="margin-top:${filteredFolders.length ? "24px" : "0"}"><i class="ri-file-line"></i> Files</div>`;
    html += `<div class="letters-files-list">${filteredFiles.map(f => {
      const fi   = getLettersFileIcon(f.file_type, f.file_name);
      const size = formatFileSize(f.file_size);
      const date = f.created_at ? new Date(f.created_at).toLocaleDateString() : "";
      return `
        <div class="letters-file-row" data-id="${f.id}" data-name="${escHtml(f.file_name)}" data-filetype="${escHtml(f.file_type || '')}" title="Double-click to open">
          ${getLettersThumbHtml(f, fi, "row")}
          <div class="letters-file-info">
            <div class="letters-file-name">${escHtml(f.file_name)}</div>
            <div class="letters-file-meta">${[f.uploader_name, size, date].filter(Boolean).join(" · ")}</div>
          </div>
          <button class="letters-kebab" data-type="file" data-id="${f.id}" data-name="${escHtml(f.file_name)}" data-filetype="${escHtml(f.file_type || '')}"><i class="ri-more-2-fill"></i></button>
        </div>
      `;
    }).join("")}</div>`;
  }
  if (!filteredFolders.length && !filteredFiles.length) {
    html = `<div class="letters-empty"><i class="ri-folder-open-line"></i><p>This folder is empty.<br>Click <strong>New</strong> to add a subfolder or file.</p></div>`;
  }
  content.innerHTML = html;
  bindFolderCardClicks(content);
  bindLettersFileRows(content);
  bindLettersKebabs(content);
}

function getLettersFileExt(fileName = "") {
  return String(fileName || "").split(".").pop().toLowerCase();
}

function getLettersFileIcon(type, fileName = "") {
  const t = (type || "").toLowerCase();
  const e = getLettersFileExt(fileName);
  if (t.includes("pdf") || e === "pdf") return { icon: "ri-file-pdf-2-fill", color: "#dc2626", kind: "pdf" };
  if (["doc","docx","word"].includes(t) || ["doc","docx"].includes(e) || t.includes("word")) return { icon: "ri-file-word-2-fill", color: "#2563eb", kind: "word" };
  if (["xls","xlsx","excel"].includes(t) || ["xls","xlsx"].includes(e) || t.includes("sheet")) return { icon: "ri-file-excel-2-fill", color: "#16a34a", kind: "excel" };
  if (["png","jpg","jpeg","gif","webp","image"].includes(t) || ["png","jpg","jpeg","gif","webp"].includes(e)) return { icon: "ri-image-fill", color: "#f59e0b", kind: "image" };
  if (["zip","rar","archive"].includes(t) || ["zip","rar"].includes(e)) return { icon: "ri-file-zip-fill", color: "#a855f7", kind: "archive" };
  if (["mp4","webm","mov","avi","mkv","video"].includes(t) || ["mp4","webm","mov","avi","mkv"].includes(e)) return { icon: "ri-video-fill", color: "#8b5cf6", kind: "video" };
  return { icon: "ri-file-fill", color: "#6b7280", kind: "unknown" };
}

function getLettersThumbHtml(file, fi, variant = "row") {
  const cls = variant === "recent" ? "letters-file-thumb recent" : "letters-file-thumb";
  if (fi.kind === "image" && file?.id) {
    return `<span class="${cls} image"><img src="${lettersApiUrl(`/api/letters/files/${file.id}/preview`)}" alt=""></span>`;
  }
  return `<span class="${cls} ${fi.kind}"><i class="${fi.icon}" style="color:${fi.color};"></i></span>`;
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024)    return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function openLettersPreview(id, name, type) {
  const modal = document.getElementById("lettersPreviewModal");
  const body  = document.getElementById("lettersPreviewBody");
  const title = document.getElementById("lettersPreviewName");
  const icon  = document.getElementById("lettersPreviewIcon");
  const dl    = document.getElementById("lettersPreviewDownload");
  title.textContent = name;
  dl.href = getLettersDownloadUrl(id);
  dl.onclick = () => logDownloadHistory(id, name);
  const fi = getLettersFileIcon(type);
  icon.className = fi.icon;
  icon.style.color = fi.color;
  body.innerHTML = `<div class="letters-empty"><i class="ri-loader-4-line spin"></i><p>Loading preview…</p></div>`;
  modal.classList.remove("hidden");
  const close = () => { modal.classList.add("hidden"); body.innerHTML = ""; };
  document.getElementById("lettersPreviewClose").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  const t   = (type || "").toLowerCase();
  const ext = name.split(".").pop().toLowerCase();
  const previewUrl = lettersApiUrl(`/api/letters/files/${id}/preview`);
  const isPdf   = t === "pdf"  || ext === "pdf";
  const isWord  = ["word","doc","docx"].includes(t) || ["doc","docx"].includes(ext);
  const isExcel = ["excel","xls","xlsx"].includes(t) || ["xls","xlsx"].includes(ext);
  const isImg   = ["image","jpg","jpeg","png","gif","webp"].includes(t) || ["jpg","jpeg","png","gif","webp"].includes(ext);
  const isVideo = ["video","mp4","webm","mov","avi","mkv"].includes(t) || ["mp4","webm","mov","avi","mkv"].includes(ext);
  try {
    if (isPdf) {
      const blob = await fetch(previewUrl).then(r => { if (!r.ok) throw new Error(); return r.blob(); });
      body.innerHTML = `<iframe src="${URL.createObjectURL(blob)}" class="letters-preview-frame" title="${name}"></iframe>`;
    } else if (isWord) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
      const ab     = await fetch(previewUrl).then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      const result = await mammoth.convertToHtml({ arrayBuffer: ab });
      body.innerHTML = `<div class="letters-preview-docx">${result.value || "<p><em>Document appears to be empty.</em></p>"}</div>`;
    } else if (isExcel) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const ab       = await fetch(previewUrl).then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      const workbook = XLSX.read(ab, { type: "array" });
      const tabs = workbook.SheetNames.length > 1
        ? `<div class="letters-excel-tabs">${workbook.SheetNames.map((s, i) =>
            `<button class="letters-excel-tab${i === 0 ? " active" : ""}" data-sheet="${s}">${s}</button>`
          ).join("")}</div>` : "";
      const firstHtml = XLSX.utils.sheet_to_html(workbook.Sheets[workbook.SheetNames[0]], { editable: false });
      body.innerHTML = `${tabs}<div class="letters-preview-excel" id="lettersExcelContent">${firstHtml}</div>`;
      styleExcelTable(body);
      body.querySelectorAll(".letters-excel-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          body.querySelectorAll(".letters-excel-tab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          document.getElementById("lettersExcelContent").innerHTML =
            XLSX.utils.sheet_to_html(workbook.Sheets[btn.dataset.sheet], { editable: false });
          styleExcelTable(body);
        });
      });
    } else if (isImg) {
      body.innerHTML = `<div class="letters-preview-img-wrap"><img src="${previewUrl}" class="letters-preview-img" alt="${name}"></div>`;
    } else if (isVideo) {
      const mimeTypes = { mp4:"video/mp4", webm:"video/webm", mov:"video/quicktime", avi:"video/x-msvideo", mkv:"video/x-matroska" };
      const mime = mimeTypes[ext] || "video/mp4";
      body.innerHTML = `
        <div class="letters-preview-video-wrap">
          <video class="letters-preview-video" controls autoplay muted>
            <source src="${previewUrl}" type="${mime}">
            Your browser does not support video playback.
          </video>
        </div>
      `;
    } else {
      showLettersPreviewFallback(body, id);
    }
  } catch (err) {
    console.error("Preview error:", err);
    showLettersPreviewFallback(body, id);
  }
}

function styleExcelTable(container) {
  const table = container.querySelector("table");
  if (!table) return;
  table.classList.add("letters-excel-table");
  const firstRow = table.querySelector("tr");
  if (firstRow) firstRow.classList.add("excel-header-row");
}

function showLettersPreviewFallback(body, id, msg) {
  body.innerHTML = `
    <div class="letters-preview-fallback">
      <i class="ri-file-line"></i>
      <p>${msg || "Preview is not available for this file type."}</p>
      <a class="tool-btn apply-btn" href="${getLettersDownloadUrl(id)}" target="_blank" onclick="logDownloadHistory(${id}, '${(name||'').replace(/'/g,"\\'")}')">
        <i class="ri-download-line"></i> Download to view
      </a>
    </div>
  `;
}

function getLettersDownloadUrl(id) {
  const u = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const downloadedBy = u.full_name || u.email || 'Unknown';
  return lettersApiUrl(`/api/letters/files/${id}/download`, { user: downloadedBy });
}

function closeLettersDrivePreview() {
  const modal = document.getElementById("lettersPreviewModal");
  const body = document.getElementById("lettersPreviewBody");
  modal?.classList.add("hidden");
  if (body) body.innerHTML = "";
  document.body.classList.remove("letters-preview-open");
  if (lettersPreviewKeydown) {
    document.removeEventListener("keydown", lettersPreviewKeydown);
    lettersPreviewKeydown = null;
  }
}

function openLettersDrivePreviewAt(index) {
  if (index < 0 || index >= lettersPreviewItems.length) return;
  const file = lettersPreviewItems[index];
  openLettersDrivePreview(file.id, file.file_name, file.file_type);
}

async function openLettersDrivePreview(id, name, type) {
  const modal = document.getElementById("lettersPreviewModal");
  const body  = document.getElementById("lettersPreviewBody");
  const title = document.getElementById("lettersPreviewName");
  const icon  = document.getElementById("lettersPreviewIcon");
  const dl    = document.getElementById("lettersPreviewDownload");
  const prev  = document.getElementById("lettersPreviewPrev");
  const next  = document.getElementById("lettersPreviewNext");
  if (!modal || !body || !title || !icon || !dl) return;

  const index = lettersPreviewItems.findIndex(f => String(f.id) === String(id));
  if (index >= 0) lettersPreviewIndex = index;

  const fi = getLettersFileIcon(type);
  const ext = String(name || "").split(".").pop().toLowerCase();
  const t = String(type || "").toLowerCase();
  const previewUrl = lettersApiUrl(`/api/letters/files/${id}/preview`);
  const isPdf = t === "pdf" || ext === "pdf";
  const isImg = ["image","jpg","jpeg","png","gif","webp"].includes(t) || ["jpg","jpeg","png","gif","webp"].includes(ext);
  const isVideo = ["video","mp4","webm","mov","avi","mkv"].includes(t) || ["mp4","webm","mov","avi","mkv"].includes(ext);
  const isWord = ["word","docx"].includes(t) || ext === "docx";
  const isExcel = ["excel","xls","xlsx"].includes(t) || ["xls","xlsx"].includes(ext);

  title.textContent = name || "File";
  icon.className = fi.icon;
  icon.style.color = fi.color;
  dl.href = getLettersDownloadUrl(id);
  dl.onclick = null;
  body.innerHTML = `<div class="letters-preview-loading"><i class="ri-loader-4-line spin"></i><p>Loading file...</p></div>`;
  modal.classList.remove("hidden");
  document.body.classList.add("letters-preview-open");

  const goPrev = () => openLettersDrivePreviewAt(lettersPreviewIndex - 1);
  const goNext = () => openLettersDrivePreviewAt(lettersPreviewIndex + 1);
  document.getElementById("lettersPreviewClose").onclick = closeLettersDrivePreview;
  if (prev) {
    prev.onclick = goPrev;
    prev.disabled = lettersPreviewIndex <= 0;
  }
  if (next) {
    next.onclick = goNext;
    next.disabled = lettersPreviewIndex < 0 || lettersPreviewIndex >= lettersPreviewItems.length - 1;
  }
  modal.onclick = e => { if (e.target === modal) closeLettersDrivePreview(); };
  if (lettersPreviewKeydown) document.removeEventListener("keydown", lettersPreviewKeydown);
  lettersPreviewKeydown = e => {
    if (modal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLettersDrivePreview();
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
  };
  document.addEventListener("keydown", lettersPreviewKeydown);

  try {
    if (isPdf) {
      body.innerHTML = `<iframe src="${previewUrl}" class="letters-preview-frame" title="${escHtml(name)}"></iframe>`;
    } else if (isImg) {
      body.innerHTML = `<div class="letters-preview-img-wrap"><img src="${previewUrl}" class="letters-preview-img" alt="${escHtml(name)}"></div>`;
    } else if (isVideo) {
      body.innerHTML = `<div class="letters-preview-video-wrap"><video class="letters-preview-video" controls src="${previewUrl}"></video></div>`;
    } else if (isWord) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
      const ab = await fetch(previewUrl).then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      const result = await mammoth.convertToHtml({ arrayBuffer: ab });
      body.innerHTML = `<div class="letters-preview-doc-shell"><div class="letters-preview-docx">${result.value || "<p><em>Document appears to be empty.</em></p>"}</div></div>`;
    } else if (isExcel) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const ab = await fetch(previewUrl).then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      const workbook = XLSX.read(ab, { type: "array" });
      const tabs = workbook.SheetNames.length > 1
        ? `<div class="letters-excel-tabs">${workbook.SheetNames.map((s, i) =>
            `<button class="letters-excel-tab${i === 0 ? " active" : ""}" data-sheet="${escHtml(s)}">${escHtml(s)}</button>`
          ).join("")}</div>` : "";
      body.innerHTML = `<div class="letters-preview-sheet-shell">${tabs}<div class="letters-preview-excel" id="lettersExcelContent">${XLSX.utils.sheet_to_html(workbook.Sheets[workbook.SheetNames[0]], { editable: false })}</div></div>`;
      styleExcelTable(body);
      body.querySelectorAll(".letters-excel-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          body.querySelectorAll(".letters-excel-tab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          document.getElementById("lettersExcelContent").innerHTML =
            XLSX.utils.sheet_to_html(workbook.Sheets[btn.dataset.sheet], { editable: false });
          styleExcelTable(body);
        });
      });
    } else {
      showLettersDriveFallback(body, id, name, type);
    }
  } catch (err) {
    console.error("File preview error:", err);
    showLettersDriveFallback(body, id, name, type, "Preview failed. You can still download the file.");
  }
}

function showLettersDriveFallback(body, id, name, type, message = "This file type cannot be previewed in the browser.") {
  const fi = getLettersFileIcon(type);
  body.innerHTML = `
    <div class="letters-preview-fallback">
      <i class="${fi.icon}" style="color:${fi.color};"></i>
      <strong>${escHtml(name || "File")}</strong>
      <p>${escHtml(message)}</p>
      <a class="tool-btn apply-btn" href="${getLettersDownloadUrl(id)}" target="_blank">
        <i class="ri-download-line"></i> Download to view
      </a>
    </div>`;
}

function bindLettersFileRows(container) {
  container.querySelectorAll(".letters-file-row").forEach(row => {
    row.addEventListener("dblclick", e => {
      if (e.target.closest(".letters-kebab")) return;
      openLettersDrivePreview(
        parseInt(row.dataset.id, 10),
        row.dataset.name || "",
        row.dataset.filetype || ""
      );
    });
  });
}

function openLettersNewChoiceMenu(anchorEl) {
  document.querySelectorAll(".letters-new-menu").forEach(m => m.remove());
  const insideFolder = lettersCurrentFolder() !== null;
  const menu = document.createElement("div");
  menu.className = "letters-new-menu";
  menu.innerHTML = `
    <div class="letters-new-item" id="newChoiceFolder"><i class="ri-folder-add-line"></i> New Folder</div>
    ${insideFolder ? `<div class="letters-new-item" id="newChoiceFile"><i class="ri-file-upload-line"></i> Upload File</div>` : ""}
  `;
  anchorEl.style.position = "relative";
  anchorEl.appendChild(menu);
  menu.querySelector("#newChoiceFolder").onclick = (e) => { e.stopPropagation(); menu.remove(); openLettersFolderModal(); };
  if (insideFolder) {
    menu.querySelector("#newChoiceFile").onclick = (e) => { e.stopPropagation(); menu.remove(); openLettersFileModal(); };
  }
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}

function lettersCopyItem(type, id, name, sourceFolderId) {
  lettersClipboard = { type, id, name, sourceFolderId };
  updateLettersPasteBtn();
  showToast(`"${name}" copied — navigate to a folder and click Paste.`, "success");
}

function updateLettersPasteBtn() {
  const btn = document.getElementById("lettersPasteBtn");
  if (!btn) return;
  const show = lettersClipboard !== null && lettersCurrentFolderId() !== null;
  btn.classList.toggle("hidden", !show);
  if (lettersClipboard) {
    const icon = lettersClipboard.type === "folder" ? "ri-folder-transfer-line" : "ri-clipboard-line";
    btn.innerHTML = `<i class="${icon}"></i> Paste "${lettersClipboard.name}"`;
  }
}

function bindLettersPasteBtn() {
  document.getElementById("lettersPasteBtn")?.addEventListener("click", () => {
    if (!lettersClipboard) return;
    if (lettersClipboard.type === "file") lettersPasteFile();
    else lettersPasteFolder();
  });
}

async function lettersPasteFile() {
  const { id, name } = lettersClipboard;
  const targetFolderId = lettersCurrentFolderId();
  if (!targetFolderId) { showToast("Open a folder first to paste into.", "error"); return; }
  const btn = document.getElementById("lettersPasteBtn");
  btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Pasting…';
  try {
    const res    = await fetch(lettersApiUrl(`/api/letters/files/${id}/copy`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_folder_id: targetFolderId, module: lettersModuleScope() })
    });
    const result = await res.json();
    if (!res.ok) { showToast("Paste failed: " + (result.error || "Unknown"), "error"); return; }
    showToast(`"${name}" pasted successfully.`, "success");
    lettersClipboard = null;
    fetchLettersContent(); fetchLettersRecent();
  } catch { showToast("Network error.", "error"); }
  finally { btn.disabled = false; updateLettersPasteBtn(); }
}

async function lettersPasteFolder() {
  const { id, name } = lettersClipboard;
  const targetParentId = lettersCurrentFolderId();
  if (!targetParentId) { showToast("Open a folder first to paste into.", "error"); return; }
  const btn = document.getElementById("lettersPasteBtn");
  btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Pasting…';
  try {
    const res    = await fetch(lettersApiUrl(`/api/letters/folders/${id}/copy`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_parent_id: targetParentId, module: lettersModuleScope() })
    });
    const result = await res.json();
    if (!res.ok) { showToast("Paste failed: " + (result.error || "Unknown"), "error"); return; }
    showToast(`Folder "${name}" pasted successfully.`, "success");
    lettersClipboard = null;
    fetchLettersContent();
  } catch { showToast("Network error.", "error"); }
  finally { btn.disabled = false; updateLettersPasteBtn(); }
}

async function lettersDuplicateFile(id, name) {
  const folderId = lettersCurrentFolderId();
  if (!folderId) return;
  try {
    const res    = await fetch(lettersApiUrl(`/api/letters/files/${id}/copy`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_folder_id: folderId, module: lettersModuleScope() })
    });
    const result = await res.json();
    if (!res.ok) { showToast("Duplicate failed: " + (result.error || "Unknown"), "error"); return; }
    showToast(`"${name}" duplicated.`, "success");
    fetchLettersContent(); fetchLettersRecent();
  } catch { showToast("Network error.", "error"); }
}

function bindLettersKebabs(container) {
  container.querySelectorAll(".letters-kebab").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      closeAllLettersKebabs();
      const type  = btn.dataset.type;
      const id    = parseInt(btn.dataset.id);
      const name  = btn.dataset.name;
      const ftype = btn.dataset.filetype || "";
      const menu = document.createElement("div");
      menu.className = "letters-kebab-menu";
      if (type === "file") {
        menu.innerHTML = `
          <div class="kebab-item km-download"><i class="ri-download-line"></i> Download File</div>
          <div class="kebab-item km-dl-history"><i class="ri-history-line"></i> View Download History</div>
          <div class="kebab-divider"></div>
          <div class="kebab-item km-copy"><i class="ri-file-copy-line"></i> Copy</div>
          <div class="kebab-item km-duplicate"><i class="ri-file-add-line"></i> Duplicate</div>
          <div class="kebab-divider"></div>
          <div class="kebab-item km-rename"><i class="ri-edit-line"></i> Rename</div>
          <div class="kebab-item kebab-danger km-delete"><i class="ri-delete-bin-line"></i> Delete</div>
        `;
        menu.querySelector(".km-download").onclick  = () => { closeAllLettersKebabs(); logDownloadHistory(id, name); window.location.href = getLettersDownloadUrl(id); };
        menu.querySelector(".km-dl-history").onclick = () => { closeAllLettersKebabs(); openDownloadHistoryModal(id, name); };
        menu.querySelector(".km-copy").onclick      = () => { closeAllLettersKebabs(); lettersCopyItem("file", id, name, lettersCurrentFolderId()); };
        menu.querySelector(".km-duplicate").onclick = () => { closeAllLettersKebabs(); lettersDuplicateFile(id, name); };
      } else {
        menu.innerHTML = `
          <div class="kebab-item km-copy"><i class="ri-folder-transfer-line"></i> Copy</div>
          <div class="kebab-divider"></div>
          <div class="kebab-item km-rename"><i class="ri-edit-line"></i> Rename</div>
          <div class="kebab-item kebab-danger km-delete"><i class="ri-delete-bin-line"></i> Delete</div>
        `;
        menu.querySelector(".km-copy").onclick = () => { closeAllLettersKebabs(); lettersCopyItem("folder", id, name, lettersCurrentFolderId()); };
      }
      menu.querySelector(".km-rename").onclick = () => { closeAllLettersKebabs(); openLettersRename(type, id, name); };
      menu.querySelector(".km-delete").onclick = () => { closeAllLettersKebabs(); openLettersDelete(type, id, name); };
      document.body.appendChild(menu);
      const rect = btn.getBoundingClientRect();
      const menuW = 160;
      let left = rect.right - menuW;
      let top  = rect.bottom + 4;
      if (top + 200 > window.innerHeight) top = rect.top - 200;
      if (left < 8) left = 8;
      menu.style.cssText = `position:fixed;top:${top}px;left:${left}px;min-width:${menuW}px;z-index:9999;`;
      setTimeout(() => {
        document.addEventListener("click", closeAllLettersKebabs, { once: true });
        document.addEventListener("scroll", closeAllLettersKebabs, { once: true, capture: true });
        document.querySelector(".letters-main-card")?.addEventListener("scroll", closeAllLettersKebabs, { once: true });
      }, 0);
    });
  });
}

function closeAllLettersKebabs() {
  document.querySelectorAll(".letters-kebab-menu").forEach(m => m.remove());
}

function openLettersRename(type, id, currentName) {
  const modal = document.getElementById("lettersRenameModal");
  document.getElementById("renameInput").value = currentName;
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("lettersRenameCancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("lettersRenameConfirm").onclick = async () => {
    const newName = document.getElementById("renameInput").value.trim();
    if (!newName) { showToast("Name cannot be empty.", "error"); return; }
    const btn = document.getElementById("lettersRenameConfirm");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i>';
    try {
      const url    = type === "folder" ? lettersApiUrl(`/api/letters/folders/${id}`) : lettersApiUrl(`/api/letters/files/${id}`);
      const body   = type === "folder" ? { folder_name: newName } : { file_name: newName };
      const res    = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) { showToast("Rename failed: " + (result.error || "Unknown"), "error"); return; }
      close();
      const curFolder = lettersCurrentFolder();
      if (type === "folder" && curFolder?.id === id) curFolder.name = newName;
      fetchLettersContent(); fetchLettersRecent();
      showToast("Renamed successfully.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Rename'; }
  };
}

function openLettersDelete(type, id, name) {
  const modal = document.getElementById("lettersDeleteModal");
  document.getElementById("lettersDeleteMsg").innerHTML =
    `Delete <strong>${name}</strong>${type === "folder" ? " and all its files" : ""}? This cannot be undone.`;
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("lettersDeleteCancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("lettersDeleteConfirm").onclick = async () => {
    const btn = document.getElementById("lettersDeleteConfirm");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i>';
    try {
      const url = type === "folder" ? lettersApiUrl(`/api/letters/folders/${id}`) : lettersApiUrl(`/api/letters/files/${id}`);
      const res = await fetch(url, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown"), "error"); return; }
      close();
      const curFolder = lettersCurrentFolder();
      if (type === "folder" && curFolder?.id === id) lettersFolderStack.pop();
      fetchLettersContent(); fetchLettersRecent();
      showToast("Deleted.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete'; }
  };
}

function openLettersFolderModal() {
  const modal = document.getElementById("lettersFolderModal");
  document.getElementById("newFolderName").value = "";
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("lettersFolderModalClose").onclick = close;
  document.getElementById("lettersFolderModalCancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("lettersFolderModalConfirm").onclick = async () => {
    const name = document.getElementById("newFolderName").value.trim();
    if (!name) { showToast("Please enter a folder name.", "error"); return; }
    const btn = document.getElementById("lettersFolderModalConfirm");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Creating…';
    try {
      const parent_id = lettersCurrentFolderId();
      const res    = await fetch(lettersApiUrl("/api/letters/folders"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_name: name, parent_id, module: lettersModuleScope() }) });
      const result = await res.json();
      if (!res.ok) { showToast("Failed: " + (result.error || "Unknown"), "error"); return; }
      close(); fetchLettersContent(); showToast("Folder created.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Create'; }
  };
}

function openLettersFileModal() {
  const modal = document.getElementById("lettersFileModal");
  document.getElementById("newFileInput").value = "";
  document.getElementById("newFileUploader").value = user?.full_name || user?.email || "";
  document.getElementById("lettersFileUploadHint").innerHTML = '<i class="ri-information-line"></i> PDF, Word, Excel, Images, Videos supported';
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("lettersFileModalClose").onclick = close;
  document.getElementById("lettersFileModalCancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("newFileInput").onchange = function () {
    const f = this.files[0];
    if (f) document.getElementById("lettersFileUploadHint").innerHTML = `<i class="ri-file-line"></i> ${f.name} (${formatFileSize(f.size)})`;
  };
  document.getElementById("lettersFileModalConfirm").onclick = async () => {
    const fileInput    = document.getElementById("newFileInput");
    const uploaderName = document.getElementById("newFileUploader").value.trim();
    if (!fileInput.files[0]) { showToast("Please choose a file.", "error"); return; }
    const btn = document.getElementById("lettersFileModalConfirm");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Uploading…';
    try {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("uploader_name", uploaderName);
      formData.append("folder_id", lettersCurrentFolder().id);
      formData.append("module", lettersModuleScope());
      const res    = await fetch(lettersApiUrl("/api/letters/files"), { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) { showToast("Upload failed: " + (result.error || "Unknown"), "error"); return; }
      close(); fetchLettersContent(); fetchLettersRecent(); showToast("File uploaded.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-upload-line"></i> Upload'; }
  };
}

function openLettersFileModal() {
  const modal = document.getElementById("lettersFileModal");
  const fileInput = document.getElementById("newFileInput");
  const drop = document.getElementById("lettersUploadDrop");
  fileInput.value = "";
  lettersUploadQueue = [];
  document.getElementById("newFileUploader").value = user?.full_name || user?.email || "";
  document.getElementById("lettersFileUploadHint").innerHTML = '<i class="ri-information-line"></i> PDF, Word, Excel, Images, Archives, Videos supported';
  renderLettersUploadQueue();
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  document.getElementById("lettersFileModalClose").onclick = close;
  document.getElementById("lettersFileModalCancel").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  const setFiles = fileList => {
    lettersUploadQueue = Array.from(fileList || []).map((file, index) => ({
      id: `up_${Date.now()}_${index}`,
      file,
      progress: 0,
      status: "Ready"
    }));
    document.getElementById("lettersFileUploadHint").innerHTML = lettersUploadQueue.length
      ? `<i class="ri-stack-line"></i> ${lettersUploadQueue.length} file${lettersUploadQueue.length === 1 ? "" : "s"} selected`
      : '<i class="ri-information-line"></i> PDF, Word, Excel, Images, Archives, Videos supported';
    renderLettersUploadQueue();
  };
  fileInput.onchange = function () { setFiles(this.files); };
  ["dragenter", "dragover"].forEach(evt => drop?.addEventListener(evt, e => {
    e.preventDefault();
    drop.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach(evt => drop?.addEventListener(evt, e => {
    e.preventDefault();
    drop.classList.remove("drag-over");
  }));
  drop?.addEventListener("drop", e => setFiles(e.dataTransfer.files));
  document.getElementById("lettersFileModalConfirm").onclick = async () => {
    const uploaderName = document.getElementById("newFileUploader").value.trim();
    if (!lettersUploadQueue.length) { showToast("Please choose at least one file.", "error"); return; }
    const btn = document.getElementById("lettersFileModalConfirm");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Uploading...';
    let completed = 0;
    try {
      for (const item of lettersUploadQueue) {
        updateLettersUploadQueueItem(item.id, { status: "Uploading", progress: 8 });
        await uploadLetterFileWithProgress(item, uploaderName, progress => {
          updateLettersUploadQueueItem(item.id, { status: "Uploading", progress });
        });
        completed += 1;
        updateLettersUploadQueueItem(item.id, { status: "Completed", progress: 100 });
      }
      fetchLettersContent(); fetchLettersRecent();
      showToast(`${completed} file${completed === 1 ? "" : "s"} uploaded.`, "success");
      setTimeout(close, 450);
    } catch (err) { showToast(err.message || "Upload failed.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-upload-line"></i> Upload'; }
  };
}

function renderLettersUploadQueue() {
  const wrap = document.getElementById("lettersUploadQueue");
  if (!wrap) return;
  if (!lettersUploadQueue.length) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = lettersUploadQueue.map(item => {
    const fi = getLettersFileIcon("", item.file.name);
    return `
      <div class="letters-upload-item" data-upload-id="${item.id}">
        <span class="letters-file-thumb ${fi.kind}"><i class="${fi.icon}" style="color:${fi.color};"></i></span>
        <div class="letters-upload-info">
          <div class="letters-upload-name">${escHtml(item.file.name)}</div>
          <div class="letters-upload-status">${escHtml(item.status)} · ${formatFileSize(item.file.size)}</div>
          <div class="letters-upload-track"><span style="width:${Math.max(0, Math.min(100, item.progress))}%"></span></div>
        </div>
      </div>`;
  }).join("");
}

function updateLettersUploadQueueItem(id, patch) {
  lettersUploadQueue = lettersUploadQueue.map(item => item.id === id ? { ...item, ...patch } : item);
  renderLettersUploadQueue();
}

function uploadLetterFileWithProgress(item, uploaderName, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("uploader_name", uploaderName);
    formData.append("folder_id", lettersCurrentFolder().id);
    formData.append("module", lettersModuleScope());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", lettersApiUrl("/api/letters/files"));
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.max(8, Math.round((e.loaded / e.total) * 92)));
    };
    xhr.onload = () => {
      let result = {};
      try { result = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(result);
      else {
        updateLettersUploadQueueItem(item.id, { status: "Failed", progress: 100 });
        reject(new Error(result.error || "Upload failed"));
      }
    };
    xhr.onerror = () => {
      updateLettersUploadQueueItem(item.id, { status: "Failed", progress: 100 });
      reject(new Error("Network error"));
    };
    xhr.send(formData);
  });
}

/* ================= COUNTERS ================= */

function runCounters() {
  document.querySelectorAll(".counter").forEach(counter => {
    const target = +counter.getAttribute("data-target");
    let count = 0;
    const update = () => {
      if (count < target) { count += Math.ceil(target / 80); counter.innerText = Math.min(count, target); setTimeout(update, 12); }
      else { counter.innerText = target; }
    };
    update();
  });
}

/* ================= SETTINGS ================= */

function loadSettings() {
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();

  const initials = user.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  mainContent.innerHTML = `
    <div class="stg-page">

      <!-- Two-column layout -->
      <div class="stg-layout">

        <!-- ── Left sidebar nav ── -->
        <nav class="stg-sidenav">
          <button class="stg-navitem active" data-tab="account">
            <div class="stg-navitem-icon"><i class="ri-user-3-line"></i></div>
            <div class="stg-navitem-text">
              <span class="stg-navitem-label">Account</span>
              <span class="stg-navitem-sub">Profile &amp; security</span>
            </div>
            <i class="ri-arrow-right-s-line stg-navitem-arrow"></i>
          </button>
          <button class="stg-navitem" data-tab="display">
            <div class="stg-navitem-icon"><i class="ri-palette-line"></i></div>
            <div class="stg-navitem-text">
              <span class="stg-navitem-label">Display</span>
              <span class="stg-navitem-sub">Theme &amp; appearance</span>
            </div>
            <i class="ri-arrow-right-s-line stg-navitem-arrow"></i>
          </button>
          <button class="stg-navitem" data-tab="privacy">
            <div class="stg-navitem-icon"><i class="ri-shield-check-line"></i></div>
            <div class="stg-navitem-text">
              <span class="stg-navitem-label">Privacy &amp; Data</span>
              <span class="stg-navitem-sub">Security &amp; export</span>
            </div>
            <i class="ri-arrow-right-s-line stg-navitem-arrow"></i>
          </button>

          <button class="stg-navitem" data-tab="inbox">
            <div class="stg-navitem-icon"><i class="ri-inbox-2-line"></i></div>
            <div class="stg-navitem-text">
              <span class="stg-navitem-label">Inbox</span>
              <span class="stg-navitem-sub">Messages &amp; Requests</span>
            </div>
            <i class="ri-arrow-right-s-line stg-navitem-arrow"></i>
          </button>

          <button class="stg-navitem" data-tab="myrequests">
            <div class="stg-navitem-icon"><i class="ri-file-list-3-line"></i></div>
            <div class="stg-navitem-text">
              <span class="stg-navitem-label">My Requests</span>
              <span class="stg-navitem-sub">Track your submissions</span>
            </div>
            <i class="ri-arrow-right-s-line stg-navitem-arrow"></i>
          </button>

<div class="stg-nav-usercard">
            <div class="stg-nav-avatar">
              ${user.photo
                ? `<img src="${user.photo}" class="stg-nav-avatar-img" alt="avatar">`
                : `<span>${initials}</span>`}
            </div>
            <div class="stg-nav-userinfo">
              <div class="stg-nav-username">${escHtml(user.full_name || '—')}</div>
              <div class="stg-nav-userrole">${escHtml(user.role || '—')}</div>
            </div>
          </div>
        </nav>

        <!-- ── Right panels ── -->
        <div class="stg-panels">

          <!-- ACCOUNT -->
          <div class="stg-panel active" id="stg-tab-account">

            <!-- Profile card -->
            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-user-3-line"></i> Profile Information</div>
                <button class="stg-outline-btn" id="stgEditBtn"><i class="ri-edit-line"></i> Edit Profile</button>
              </div>

              <div class="stg-profile-hero">
                <div class="stg-avatar-wrap">
                  ${user.photo
                    ? `<img src="${user.photo}" class="stg-avatar-img" id="stgAvatarImg" alt="Profile">`
                    : `<div class="stg-avatar" id="stgAvatar">${initials}</div>`}
                  <label class="stg-avatar-upload-btn" for="stgPhotoInput" title="Change photo">
                    <i class="ri-camera-line"></i>
                  </label>
                  <input type="file" id="stgPhotoInput" accept="image/*" style="display:none;">
                </div>
                <div class="stg-profile-hero-info">
                  <div class="stg-profile-name">${escHtml(user.full_name || '—')}</div>
                  <span class="stg-role-badge">${escHtml(user.role || '—')}</span>
                  <div class="stg-photo-hint"><i class="ri-information-line"></i> Click the camera icon to update your photo</div>
                </div>
              </div>

              <div class="stg-info-grid">
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-user-line"></i> Full Name</div>
                  <div class="stg-info-value">${escHtml(user.full_name || '—')}</div>
                </div>
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-id-card-line"></i> ID Number</div>
                  <div class="stg-info-value">${escHtml(user.id_no || '—')}</div>
                </div>
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-mail-line"></i> Email Address</div>
                  <div class="stg-info-value">${escHtml(user.email || '—')}</div>
                </div>
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-shield-user-line"></i> Role</div>
                  <div class="stg-info-value" style="text-transform:capitalize;">${escHtml(user.role || '—')}</div>
                </div>
              </div>
            </div>

            <!-- Quick actions card -->
            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-flashlight-line"></i> Quick Actions</div>
              </div>
              <div class="stg-action-tiles">
                <button class="stg-action-tile" id="stgChangePwBtn">
                  <div class="stg-tile-icon stg-tile-blue"><i class="ri-lock-password-line"></i></div>
                  <div class="stg-tile-body">
                    <div class="stg-tile-label">Change Password</div>
                    <div class="stg-tile-desc">Update your account password</div>
                  </div>
                  <i class="ri-arrow-right-s-line stg-tile-arrow"></i>
                </button>
                <button class="stg-action-tile" id="stgRequestBtn">
  <div class="stg-tile-icon stg-tile-green"><i class="ri-file-list-3-line"></i></div>
  <div class="stg-tile-body">
    <div class="stg-tile-label">Request</div>
    <div class="stg-tile-desc">Choose and submit a request type</div>
  </div>
  <i class="ri-arrow-right-s-line stg-tile-arrow"></i>
</button>
              </div>
            </div>

          </div>

          <!-- DISPLAY -->
          <div class="stg-panel" id="stg-tab-display">

            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-sun-line"></i> Brightness &amp; Color</div>
              </div>
              <div class="stg-row-list">

                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#fef9c3;color:#b45309;"><i class="ri-sun-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Brightness</div>
                    <div class="stg-row-desc">Adjust the display brightness level</div>
                  </div>
                  <div class="stg-row-ctrl">
                    <span class="stg-val-badge" id="stgBrightnessVal">100%</span>
                    <input type="range" class="stg-slider" id="stgBrightness" min="20" max="100" value="100">
                  </div>
                </div>

                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#ede9fe;color:#7c3aed;"><i class="ri-moon-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Night Light</div>
                    <div class="stg-row-desc">Warmer colors to reduce eye strain</div>
                  </div>
                  <label class="stg-toggle">
                    <input type="checkbox" id="stgNightLight">
                    <span class="stg-toggle-track"><span class="stg-toggle-thumb"></span></span>
                  </label>
                </div>

              </div>
            </div>

            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-contrast-2-line"></i> Theme</div>
              </div>
              <div class="stg-row-list">
                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#f0f9ff;color:#0284c7;"><i class="ri-contrast-2-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Color Mode</div>
                    <div class="stg-row-desc">Switch between light and dark interface</div>
                  </div>
                  <div class="stg-theme-pills" id="stgThemePills">
                    <button class="stg-theme-pill active" data-theme="light"><i class="ri-sun-fill"></i> Light</button>
                    <button class="stg-theme-pill" data-theme="dark"><i class="ri-moon-fill"></i> Dark</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-text-spacing"></i> Typography</div>
              </div>
              <div class="stg-row-list">
                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#f0fdf4;color:#16a34a;font-size:15px;font-weight:800;letter-spacing:-1px;">Aa</div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Text Size</div>
                    <div class="stg-row-desc">Adjust font size throughout the app</div>
                  </div>
                  <div class="stg-row-ctrl">
                    <span class="stg-font-sm">A</span>
                    <input type="range" class="stg-slider" id="stgFontSize" min="12" max="20" value="14">
                    <span class="stg-font-lg">A</span>
                    <span class="stg-val-badge" id="stgFontVal">14px</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="stg-card2-footer">
              <button class="stg-outline-btn" id="stgFontApply"><i class="ri-refresh-line"></i> Apply Font</button>
              <button class="stg-save-btn" id="stgDisplaySave"><i class="ri-save-line"></i> Save Changes</button>
            </div>

          </div>

          <!-- PRIVACY -->
          <div class="stg-panel" id="stg-tab-privacy">

            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-lock-line"></i> File Upload Privacy</div>
              </div>
              <div class="stg-row-list">
                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#eff6ff;color:#2563eb;"><i class="ri-file-shield-2-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Restrict Evidence Files</div>
                    <div class="stg-row-desc">Limit file access to authorized users only</div>
                  </div>
                  <label class="stg-toggle">
                    <input type="checkbox" id="stgPrivRestrict" checked>
                    <span class="stg-toggle-track"><span class="stg-toggle-thumb"></span></span>
                  </label>
                </div>
                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#f0fdf4;color:#16a34a;"><i class="ri-global-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Public File Access</div>
                    <div class="stg-row-desc">Allow anyone to view uploaded evidence files</div>
                  </div>
                  <label class="stg-toggle">
                    <input type="checkbox" id="stgPrivPublic">
                    <span class="stg-toggle-track"><span class="stg-toggle-thumb"></span></span>
                  </label>
                </div>
              </div>
            </div>

            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-database-2-line"></i> Data Management</div>
              </div>
              <div class="stg-row-list">
                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#f0fdf4;color:#16a34a;"><i class="ri-cloud-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Automatic Backup</div>
                    <div class="stg-row-desc">Enable scheduled system backups</div>
                  </div>
                  <label class="stg-toggle">
                    <input type="checkbox" id="stgBackup" checked>
                    <span class="stg-toggle-track"><span class="stg-toggle-thumb"></span></span>
                  </label>
                </div>
                <div class="stg-row">
                  <div class="stg-row-icon" style="background:#eff6ff;color:#2563eb;"><i class="ri-file-chart-line"></i></div>
                  <div class="stg-row-body">
                    <div class="stg-row-label">Export Reports</div>
                    <div class="stg-row-desc">Download all reports as a CSV file</div>
                  </div>
                  <button class="stg-outline-btn" id="stgExportBtn"><i class="ri-download-2-line"></i> Export</button>
                </div>
              </div>
            </div>

            <div class="stg-card2 stg-danger-zone">
              <div class="stg-card2-header stg-danger-header">
                <div class="stg-card2-title" style="color:#dc2626;"><i class="ri-error-warning-line"></i> Danger Zone</div>
              </div>
              <div class="stg-danger-row">
                <div>
                  <div class="stg-danger-label">Delete Account</div>
                  <div class="stg-danger-desc">A deletion request will be sent to the admin. This cannot be undone.</div>
                </div>
                <button class="stg-delete-btn" id="stgDeleteAccBtn">
                  <i class="ri-delete-bin-line"></i> Request Deletion
                </button>
              </div>
            </div>

          </div>


              <div class="stg-panel" id="stg-tab-inbox">
                <div id="utInboxMount" style="min-height:540px;">
                  <div class="ut-empty-state">
                    <i class="ri-inbox-2-line"></i>
                    <div>Click Inbox in the sidebar to load your messages and requests.</div>
                  </div>
                </div>
              </div>

              <div class="stg-panel" id="stg-tab-myrequests">
                <div class="stg-card2">
                  <div class="stg-card2-header">
                    <div class="stg-card2-title"><i class="ri-file-list-3-line"></i> My Requests</div>
                    <button class="stg-outline-btn" id="stgNewRequestBtn"><i class="ri-add-line"></i> New Request</button>
                  </div>
                  <div id="stgRequestsMount">
                    <div class="stg-req-empty"><i class="ri-loader-4-line spin"></i><span>Loading…</span></div>
                  </div>
                </div>
              </div>

        </div><!-- /stg-panels -->
      </div><!-- /stg-layout -->
    </div>

    <!-- Change Password Modal -->
    <div class="modal-overlay hidden" id="stgPwModal">
      <div class="acc-modal-shell">
        <div class="acc-modal-header">
          <div class="acc-modal-title-row">
            <div class="acc-modal-icon"><i class="ri-lock-password-line"></i></div>
            <div>
              <div class="acc-modal-title">Change Password</div>
              <div class="acc-modal-sub">Enter your current and new password</div>
            </div>
          </div>
          <button class="acc-modal-close-btn" id="stgPwClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="acc-modal-body" style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label class="acc-modal-label">Current Password</label>
            <input type="password" id="stgPwCurrent" class="acc-modal-input" placeholder="Enter current password">
          </div>
          <div>
            <label class="acc-modal-label">New Password</label>
            <input type="password" id="stgPwNew" class="acc-modal-input" placeholder="Enter new password">
          </div>
          <div>
            <label class="acc-modal-label">Confirm New Password</label>
            <input type="password" id="stgPwConfirm" class="acc-modal-input" placeholder="Repeat new password">
          </div>
        </div>
        <div class="acc-modal-footer">
          <button class="acc-modal-cancel" id="stgPwCancel">Cancel</button>
          <button class="acc-modal-submit" id="stgPwSave"><i class="ri-save-line"></i> Update Password</button>
        </div>
      </div>
    </div>

    <!-- Edit Profile Modal -->
    <div class="modal-overlay hidden" id="stgEditModal">
      <div class="acc-modal-shell">
        <div class="acc-modal-header">
          <div class="acc-modal-title-row">
            <div class="acc-modal-icon"><i class="ri-user-settings-line"></i></div>
            <div>
              <div class="acc-modal-title">Edit Profile</div>
              <div class="acc-modal-sub">Update your display name and email</div>
            </div>
          </div>
          <button class="acc-modal-close-btn" id="stgEditClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="acc-modal-body" style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label class="acc-modal-label">Full Name</label>
            <input type="text" id="stgEditName" class="acc-modal-input" value="${escHtml(user.full_name || '')}">
          </div>
          <div>
            <label class="acc-modal-label">Email Address</label>
            <input type="email" id="stgEditEmail" class="acc-modal-input" value="${escHtml(user.email || '')}">
          </div>
        </div>
        <div class="acc-modal-footer">
          <button class="acc-modal-cancel" id="stgEditCancel">Cancel</button>
          <button class="acc-modal-submit" id="stgEditSave"><i class="ri-save-line"></i> Save Changes</button>
        </div>
      </div>
    </div>
  `;

  // ── Nav switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.stg-navitem').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.stg-navitem').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stg-panel').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      const panel = document.getElementById(`stg-tab-${this.dataset.tab}`);
      if (panel) panel.classList.add('active');

      if (this.dataset.tab === 'inbox') {
        utSelectedThreadId = null;
        utSelectedThread   = null;
        utView             = 'list';
        utFilter           = 'messages';
        utFolder           = 'inbox';
        utStatusFilter     = 'all';
        // utSearch and DOM input are cleared inside loadUnifiedInbox() itself
        loadUnifiedInbox();
      } else {
        // Clear search state whenever leaving the inbox tab
        utSearch = '';
        const si = document.getElementById('utSearchInput');
        if (si) si.value = '';
      }

      if (this.dataset.tab === 'myrequests') {
        loadMyRequests();
      }

      if (this.dataset.tab === 'messaging') {
  stgSelectedMessage = null;
  stgReplyToMessage  = null;
  stgMessagingView   = 'chat';
  loadStgMessagingData();
}
    });
  });

  // ── Photo Upload ─────────────────────────────────────────────────────────────
  document.getElementById('stgPhotoInput')?.addEventListener('change', async function() {
    const file = this.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024)    { showToast('Image must be under 5MB.', 'error'); return; }

    // Preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target.result;
      const img = document.getElementById('stgAvatarImg');
      const div = document.getElementById('stgAvatar');
      if (img) { img.src = src; }
      else if (div) {
        div.insertAdjacentHTML('afterend', `<img src="${src}" class="stg-avatar-img" id="stgAvatarImg" alt="Profile">`);
        div.remove();
      }
    };
    reader.readAsDataURL(file);

    // Upload to server
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res    = await fetch(`/api/users/${user.id}/photo`, { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || 'Upload failed.', 'error'); return; }
      const updated = { ...user, photo: result.photo };
      localStorage.setItem('user', JSON.stringify(updated));
      showToast('Profile photo updated.', 'success');
    } catch { showToast('Upload failed — network error.', 'error'); }
  });

  // ── Edit Profile ───────────────────────────────────────────────────────────
  document.getElementById('stgEditBtn').onclick = () =>
    document.getElementById('stgEditModal').classList.remove('hidden');
  document.getElementById('stgEditClose').onclick  =
  document.getElementById('stgEditCancel').onclick = () =>
    document.getElementById('stgEditModal').classList.add('hidden');
  document.getElementById('stgEditModal').onclick = function(e) {
    if (e.target === this) this.classList.add('hidden');
  };

  document.getElementById('stgEditSave').onclick = async () => {
    const full_name = document.getElementById('stgEditName').value.trim();
    const email     = document.getElementById('stgEditEmail').value.trim();
    if (!full_name || !email) { showToast('Name and email are required.', 'error'); return; }
    const btn = document.getElementById('stgEditSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email })
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || 'Update failed.', 'error'); return; }
      // Update localStorage
      const updated = { ...user, full_name, email };
      localStorage.setItem('user', JSON.stringify(updated));
      document.getElementById('stgEditModal').classList.add('hidden');
      showToast('Profile updated.', 'success');
      loadSettings(); // refresh
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save Changes'; }
  };

  // ── Change Password ────────────────────────────────────────────────────────
  document.getElementById('stgChangePwBtn').onclick = () =>
    document.getElementById('stgPwModal').classList.remove('hidden');
  document.getElementById('stgPwClose').onclick  =
  document.getElementById('stgPwCancel').onclick = () =>
    document.getElementById('stgPwModal').classList.add('hidden');
  document.getElementById('stgPwModal').onclick = function(e) {
    if (e.target === this) this.classList.add('hidden');
  };

  document.getElementById('stgPwSave').onclick = async () => {
    const current = document.getElementById('stgPwCurrent').value;
    const newPw   = document.getElementById('stgPwNew').value;
    const confirm = document.getElementById('stgPwConfirm').value;
    if (!current || !newPw || !confirm) { showToast('All fields are required.', 'error'); return; }
    if (newPw !== confirm) { showToast('New passwords do not match.', 'error'); return; }
    if (newPw.length < 6)  { showToast('Password must be at least 6 characters.', 'error'); return; }
    const btn = document.getElementById('stgPwSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Updating…';
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: newPw })
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || 'Failed.', 'error'); return; }
      document.getElementById('stgPwModal').classList.add('hidden');
      showToast('Password updated successfully.', 'success');
      ['stgPwCurrent','stgPwNew','stgPwConfirm'].forEach(id => document.getElementById(id).value = '');
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Update Password'; }
  };

  // ── Display: Theme mode ────────────────────────────────────────────────────
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark');
    document.querySelectorAll('.stg-theme-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.theme === 'dark');
    });
  }
  document.querySelectorAll('.stg-theme-pill').forEach(pill => {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.stg-theme-pill').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      if (this.dataset.theme === 'dark') document.body.classList.add('dark');
      else document.body.classList.remove('dark');
      localStorage.setItem('theme', this.dataset.theme);
    });
  });

  // ── Display: Night Light ───────────────────────────────────────────────────
  const nightLight = localStorage.getItem('nightLight') === 'true';
  document.getElementById('stgNightLight').checked = nightLight;
  applyDisplayVisualSettings();

  document.getElementById('stgNightLight').addEventListener('change', function() {
    localStorage.setItem('nightLight', this.checked);
    applyDisplayVisualSettings();
  });

  // ── Display: Brightness ────────────────────────────────────────────────────
  const savedBright = localStorage.getItem('brightness') || '100';
  document.getElementById('stgBrightness').value = savedBright;
  document.getElementById('stgBrightnessVal').textContent = savedBright + '%';
  applyDisplayVisualSettings();

  document.getElementById('stgBrightness').addEventListener('input', function() {
    document.getElementById('stgBrightnessVal').textContent = this.value + '%';
    localStorage.setItem('brightness', this.value);
    applyDisplayVisualSettings();
  });

  // ── Display: Font size ─────────────────────────────────────────────────────
  const savedFont = localStorage.getItem('fontSize') || '14';
  document.getElementById('stgFontSize').value = savedFont;
  document.getElementById('stgFontVal').textContent = savedFont + 'px';
  applyTypographySettings(savedFont);

  document.getElementById('stgFontSize').addEventListener('input', function () {
    document.getElementById('stgFontVal').textContent = this.value + 'px';
    localStorage.setItem('fontSize', this.value);
    applyTypographySettings(this.value);
  });

  document.getElementById('stgFontApply').onclick = () => {
    const size = document.getElementById('stgFontSize').value;
    localStorage.setItem('fontSize', size);
    applyTypographySettings(size);
    showToast('Font size applied.', 'success');
  };

  // ── Display: Save Changes ──────────────────────────────────────────────────
  document.getElementById('stgDisplaySave').onclick = () => {
    localStorage.setItem('brightness', document.getElementById('stgBrightness').value);
    localStorage.setItem('fontSize',   document.getElementById('stgFontSize').value);
    showToast('Display settings saved.', 'success');
  };

  // ── Export Reports ─────────────────────────────────────────────────────────
  document.getElementById('stgExportBtn').onclick = async () => {
    try {
      const res  = await fetch('/api/reports');
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      const esc  = v => { const s = String(v ?? ''); return s.includes(',') ? `"${s}"` : s; };
      const csv  = [
        'Region,Start Date,End Date,Deadline,MIR (%),Ticket (%),SLA (%),Progress (%),Created By,Last Updated',
        ...rows.map(r => [
          r.region, r.date_start||'', r.date_end||'', r.deadline||'',
          r.mir||'', r.ticket||'', r.sla||'', r.progress||'',
          r.created_by||'', r.date ? new Date(r.date).toLocaleDateString() : ''
        ].map(esc).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: 'reports_export.csv' });
      a.click(); URL.revokeObjectURL(url);
      showToast('Reports exported.', 'success');
    } catch { showToast('Export failed.', 'error'); }
  };

  // ── Request Center ─────────────────────────────────────────────────────────
document.getElementById('stgRequestBtn').onclick = () => openRequestSelectorModal(user);

}

function getSettingsDeptDefault(user) {
  return {
    noc: 'NOC Department',
    finance: 'Finance Department',
    executive: 'Executive',
    admin: 'Admin',
    bidder: 'Bidder'
  }[String(user?.role || '').toLowerCase()] || '';
}

function buildRequestUserBanner(user, deptDefault) {
  return `
    <div class="lv-emp-banner">
      <div class="lv-emp-avatar">${
        user.full_name
          ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          : 'U'
      }</div>
      <div class="lv-emp-info">
        <div class="lv-emp-name">${escHtml(user.full_name || '—')}</div>
        <div class="lv-emp-meta">
          <span><i class="ri-id-card-line"></i> ${escHtml(user.id_no || '—')}</span>
          <span><i class="ri-building-4-line"></i> ${escHtml(deptDefault || user.role || '—')}</span>
          <span><i class="ri-mail-line"></i> ${escHtml(user.email || '—')}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Request Type Selector Modal ─────────────────────────────────────────
function openRequestSelectorModal(user) {
  if (document.getElementById('requestTypeModal')) return;

  const m = document.createElement('div');
  m.id = 'requestTypeModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="lv-shell rq-shell">
      <div class="lv-header">
        <div class="lv-header-left">
          <div class="lv-header-icon"><i class="ri-file-list-3-line"></i></div>
          <div>
            <div class="lv-header-title">Request</div>
            <div class="lv-header-sub">Choose the request type you want to submit</div>
          </div>
        </div>
        <button class="lv-close-btn" id="requestTypeClose"><i class="ri-close-line"></i></button>
      </div>

      <div class="lv-body">
        <div class="rq-type-grid">
  <button type="button" class="rq-type-card" data-type="leave">
    <div class="rq-type-icon"><i class="ri-calendar-todo-line"></i></div>
    <div class="rq-type-title">Leave Request</div>
    <div class="rq-type-desc">Use the existing leave request form</div>
  </button>

  <button type="button" class="rq-type-card" data-type="id">
    <div class="rq-type-icon"><i class="ri-id-card-line"></i></div>
    <div class="rq-type-title">ID Request</div>
    <div class="rq-type-desc">Request company ID or access-related identification</div>
  </button>

  <button type="button" class="rq-type-card" data-type="salary">
    <div class="rq-type-icon"><i class="ri-money-dollar-circle-line"></i></div>
    <div class="rq-type-title">Salary Increase</div>
    <div class="rq-type-desc">Submit a salary increase request for review</div>
  </button>

  <button type="button" class="rq-type-card" data-type="files">
    <div class="rq-type-icon"><i class="ri-folder-transfer-line"></i></div>
    <div class="rq-type-title">Files Request</div>
    <div class="rq-type-desc">Request file pickup, return, or document copy</div>
  </button>
</div>
      </div>

      <div class="lv-footer">
        <div class="lv-footer-note">
          <i class="ri-information-line"></i>
          Forms will appear only after selecting a request type.
        </div>
        <div class="lv-footer-actions">
          <button class="lv-cancel-btn" id="requestTypeCancel">
            <i class="ri-close-line"></i> Cancel
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('requestTypeClose').onclick = close;
  document.getElementById('requestTypeCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  m.querySelectorAll('.rq-type-card').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    close();

    if (type === 'leave') {
      openLeaveModal(user);
      return;
    }
    if (type === 'id') {
      openIdRequestModal(user);
      return;
    }
    if (type === 'salary') {
      openSalaryIncreaseModal(user);
      return;
    }
    if (type === 'files') {
      openFilesRequestModal(user);
    }
  });
});
}

// ── Salary Increase Request Modal ─────────────────────────────────────────
function openIdRequestModal(user) {
  if (document.getElementById('idRequestModal')) return;

  const deptDefault = getSettingsDeptDefault(user);
  const today = new Date().toISOString().slice(0, 10);

  const m = document.createElement('div');
  m.id = 'idRequestModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="lv-shell rq-form-shell">
      <div class="lv-header">
        <div class="lv-header-left">
          <div class="lv-header-icon"><i class="ri-id-card-line"></i></div>
          <div>
            <div class="lv-header-title">ID Request Form</div>
            <div class="lv-header-sub">Complete the details below to submit your ID request</div>
          </div>
        </div>
        <button class="lv-close-btn" id="idRequestClose"><i class="ri-close-line"></i></button>
      </div>

      <div class="lv-body">
        ${buildRequestUserBanner(user, deptDefault)}

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-calendar-line"></i> Request Date</div>
            <div class="lv-input-wrap">
              <i class="ri-calendar-event-line lv-input-icon"></i>
              <input type="date" id="idReqDate" class="lv-input lv-input-icon-pad" value="${today}">
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-building-4-line"></i> Department</div>
            <div class="lv-select-wrap">
              <select id="idReqDept" class="lv-input lv-select">
                <option value="">Select department…</option>
                <option value="NOC Department" ${deptDefault==='NOC Department'?'selected':''}>NOC Department</option>
                <option value="Finance Department" ${deptDefault==='Finance Department'?'selected':''}>Finance Department</option>
                <option value="Executive" ${deptDefault==='Executive'?'selected':''}>Executive</option>
                <option value="Admin" ${deptDefault==='Admin'?'selected':''}>Admin</option>
                <option value="Bidder" ${deptDefault==='Bidder'?'selected':''}>Bidder</option>
              </select>
              <i class="ri-arrow-down-s-line lv-select-arrow"></i>
            </div>
          </div>
        </div>

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-profile-line"></i> ID Type <span class="lv-req">*</span></div>
            <div class="lv-select-wrap">
              <select id="idReqType" class="lv-input lv-select">
                <option value="">Select ID type…</option>
                <option value="company id">Company ID</option>
                <option value="access card">Access Card</option>
                <option value="visitor id">Visitor ID</option>
                <option value="temporary id">Temporary ID</option>
                <option value="other">Other</option>
              </select>
              <i class="ri-arrow-down-s-line lv-select-arrow"></i>
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-chat-quote-line"></i> Purpose <span class="lv-req">*</span></div>
            <div class="lv-input-wrap">
              <i class="ri-edit-line lv-input-icon"></i>
              <input type="text" id="idReqPurpose" class="lv-input lv-input-icon-pad" placeholder="State the purpose of the request…">
            </div>
          </div>
        </div>

        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-sticky-note-line"></i> Remarks <span class="lv-optional">(optional)</span></div>
          <div class="lv-input-wrap rq-textarea-wrap">
            <textarea id="idReqRemarks" class="lv-input rq-textarea" placeholder="Additional remarks…"></textarea>
          </div>
        </div>
      </div>

      <div class="lv-footer">
        <div class="lv-footer-note">
          <i class="ri-information-line"></i>
          Your request will be reviewed before approval and release.
        </div>
        <div class="lv-footer-actions">
          <button class="lv-cancel-btn" id="idReqCancel">
            <i class="ri-close-line"></i> Cancel
          </button>
          <button class="lv-submit-btn" id="idReqSubmit">
            <i class="ri-send-plane-fill"></i> Submit Request
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('idRequestClose').onclick = close;
  document.getElementById('idReqCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  document.getElementById('idReqSubmit').addEventListener('click', async () => {
    const request_date = document.getElementById('idReqDate').value;
    const department   = document.getElementById('idReqDept').value;
    const id_type      = document.getElementById('idReqType').value;
    const purpose      = document.getElementById('idReqPurpose').value.trim();
    const remarks      = document.getElementById('idReqRemarks').value.trim();

    if (!request_date) { showToast('Request date is required.', 'error'); return; }
    if (!id_type)      { showToast('Please select an ID type.', 'error'); return; }
    if (!purpose)      { showToast('Purpose is required.', 'error'); return; }

    const btn = document.getElementById('idReqSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Submitting…';

    try {
      const res = await fetch(`/api/users/${user.id}/id-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_date,
          department,
          id_type,
          purpose,
          remarks
        })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(result.error || 'Submission failed.', 'error');
        return;
      }

      close();
      showToast('ID request submitted successfully.', 'success');
      sendRequestNotification('id',
        `ID Type: ${id_type}\nPurpose: ${purpose}${remarks ? '\nRemarks: ' + remarks : ''}${department ? '\nDepartment: ' + department : ''}`
      );
    } catch {
      showToast('Network error.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> Submit Request';
    }
  });
}
function openSalaryIncreaseModal(user) {
  if (document.getElementById('salaryIncreaseModal')) return;

  const deptDefault = getSettingsDeptDefault(user);
  const today = new Date().toISOString().slice(0, 10);

  const m = document.createElement('div');
  m.id = 'salaryIncreaseModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="lv-shell rq-form-shell">
      <div class="lv-header">
        <div class="lv-header-left">
          <div class="lv-header-icon"><i class="ri-money-dollar-circle-line"></i></div>
          <div>
            <div class="lv-header-title">Salary Increase Request Form</div>
            <div class="lv-header-sub">Complete the details below to submit your request</div>
          </div>
        </div>
        <button class="lv-close-btn" id="salaryIncreaseClose"><i class="ri-close-line"></i></button>
      </div>

      <div class="lv-body">
        ${buildRequestUserBanner(user, deptDefault)}

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-calendar-line"></i> Request Date</div>
            <div class="lv-input-wrap">
              <i class="ri-calendar-event-line lv-input-icon"></i>
              <input type="date" id="salReqDate" class="lv-input lv-input-icon-pad" value="${today}">
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-building-4-line"></i> Department</div>
            <div class="lv-select-wrap">
              <select id="salReqDept" class="lv-input lv-select">
                <option value="">Select department…</option>
                <option value="NOC Department" ${deptDefault==='NOC Department'?'selected':''}>NOC Department</option>
                <option value="Finance Department" ${deptDefault==='Finance Department'?'selected':''}>Finance Department</option>
                <option value="Executive" ${deptDefault==='Executive'?'selected':''}>Executive</option>
                <option value="Admin" ${deptDefault==='Admin'?'selected':''}>Admin</option>
                <option value="Bidder" ${deptDefault==='Bidder'?'selected':''}>Bidder</option>
              </select>
              <i class="ri-arrow-down-s-line lv-select-arrow"></i>
            </div>
          </div>
        </div>

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-wallet-3-line"></i> Current Salary <span class="lv-optional">(optional)</span></div>
            <div class="lv-input-wrap">
              <i class="ri-money-dollar-circle-line lv-input-icon"></i>
              <input type="number" id="salCurrentSalary" class="lv-input lv-input-icon-pad" min="0" step="0.01" placeholder="Current salary">
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-hand-coin-line"></i> Requested Salary <span class="lv-req">*</span></div>
            <div class="lv-input-wrap">
              <i class="ri-money-dollar-circle-line lv-input-icon"></i>
              <input type="number" id="salRequestedSalary" class="lv-input lv-input-icon-pad" min="0" step="0.01" placeholder="Requested salary">
            </div>
          </div>
        </div>

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-calendar-check-line"></i> Effective Date <span class="lv-req">*</span></div>
            <div class="lv-input-wrap">
              <i class="ri-calendar-line lv-input-icon"></i>
              <input type="date" id="salEffectiveDate" class="lv-input lv-input-icon-pad">
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-chat-quote-line"></i> Reason / Justification <span class="lv-req">*</span></div>
            <div class="lv-input-wrap">
              <i class="ri-edit-line lv-input-icon"></i>
              <input type="text" id="salJustification" class="lv-input lv-input-icon-pad" placeholder="State your justification…">
            </div>
          </div>
        </div>

        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-sticky-note-line"></i> Remarks <span class="lv-optional">(optional)</span></div>
          <div class="lv-input-wrap rq-textarea-wrap">
            <textarea id="salReqRemarks" class="lv-input rq-textarea" placeholder="Additional remarks…"></textarea>
          </div>
        </div>
      </div>

      <div class="lv-footer">
        <div class="lv-footer-note">
          <i class="ri-information-line"></i>
          Your salary increase request will be forwarded for management review.
        </div>
        <div class="lv-footer-actions">
          <button class="lv-cancel-btn" id="salReqCancel">
            <i class="ri-close-line"></i> Cancel
          </button>
          <button class="lv-submit-btn" id="salReqSubmit">
            <i class="ri-send-plane-fill"></i> Submit Request
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('salaryIncreaseClose').onclick = close;
  document.getElementById('salReqCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  document.getElementById('salReqSubmit').addEventListener('click', async () => {
    const request_date      = document.getElementById('salReqDate').value;
    const department        = document.getElementById('salReqDept').value;
    const current_salary    = document.getElementById('salCurrentSalary').value;
    const requested_salary  = document.getElementById('salRequestedSalary').value;
    const effective_date    = document.getElementById('salEffectiveDate').value;
    const justification     = document.getElementById('salJustification').value.trim();
    const remarks           = document.getElementById('salReqRemarks').value.trim();

    if (!request_date)     { showToast('Request date is required.', 'error'); return; }
    if (!requested_salary) { showToast('Requested salary is required.', 'error'); return; }
    if (!effective_date)   { showToast('Effective date is required.', 'error'); return; }
    if (!justification)    { showToast('Justification is required.', 'error'); return; }

    const btn = document.getElementById('salReqSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Submitting…';

    try {
      const res = await fetch(`/api/users/${user.id}/salary-increase-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_date,
          department,
          current_salary,
          requested_salary,
          effective_date,
          justification,
          remarks
        })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(result.error || 'Submission failed.', 'error');
        return;
      }

      close();
      showToast('Salary increase request submitted successfully.', 'success');
      sendRequestNotification('salary',
        `Current Salary: ${current_salary || 'N/A'}\nRequested Salary: ${requested_salary}\nEffective Date: ${effective_date}\nJustification: ${justification}${remarks ? '\nRemarks: ' + remarks : ''}`
      );
    } catch {
      showToast('Network error.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> Submit Request';
    }
  });
}

function openFilesRequestModal(user) {
  if (document.getElementById('filesRequestModal')) return;

  const deptDefault = getSettingsDeptDefault(user);
  const today = new Date().toISOString().slice(0, 10);

  const m = document.createElement('div');
  m.id = 'filesRequestModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="lv-shell rq-form-shell">
      <div class="lv-header">
        <div class="lv-header-left">
          <div class="lv-header-icon"><i class="ri-folder-transfer-line"></i></div>
          <div>
            <div class="lv-header-title">Files Request Form</div>
            <div class="lv-header-sub">Borrow, return, or request a copy of a file/document</div>
          </div>
        </div>
        <button class="lv-close-btn" id="filesRequestClose"><i class="ri-close-line"></i></button>
      </div>

      <div class="lv-body">
        ${buildRequestUserBanner(user, deptDefault)}

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-calendar-line"></i> Request Date</div>
            <div class="lv-input-wrap">
              <i class="ri-calendar-event-line lv-input-icon"></i>
              <input type="date" id="filesReqDate" class="lv-input lv-input-icon-pad" value="${today}">
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-building-4-line"></i> Department</div>
            <div class="lv-select-wrap">
              <select id="filesReqDept" class="lv-input lv-select">
                <option value="">Select department…</option>
                <option value="NOC Department" ${deptDefault==='NOC Department'?'selected':''}>NOC Department</option>
                <option value="Finance Department" ${deptDefault==='Finance Department'?'selected':''}>Finance Department</option>
                <option value="Executive" ${deptDefault==='Executive'?'selected':''}>Executive</option>
                <option value="Admin" ${deptDefault==='Admin'?'selected':''}>Admin</option>
                <option value="Bidder" ${deptDefault==='Bidder'?'selected':''}>Bidder</option>
              </select>
              <i class="ri-arrow-down-s-line lv-select-arrow"></i>
            </div>
          </div>
        </div>

        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-file-text-line"></i> File Type / Document Name <span class="lv-req">*</span></div>
            <div class="lv-input-wrap">
              <i class="ri-folder-2-line lv-input-icon"></i>
              <input type="text" id="filesReqDocName" class="lv-input lv-input-icon-pad" placeholder="e.g. Contract, HR File, Original Receipt">
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-file-copy-line"></i> Copy Type <span class="lv-req">*</span></div>
            <div class="lv-select-wrap">
              <select id="filesReqCopyType" class="lv-input lv-select">
                <option value="">Select copy type…</option>
                <option value="original">Original</option>
                <option value="copy">Copy</option>
              </select>
              <i class="ri-arrow-down-s-line lv-select-arrow"></i>
            </div>
          </div>
        </div>

        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-arrow-left-right-line"></i> Request Action <span class="lv-req">*</span></div>
          <div class="rq-action-toggle" id="filesReqActionToggle">
            <button type="button" class="rq-action-pill active" data-val="pickup">
              <i class="ri-download-2-line"></i> Pickup
            </button>
            <button type="button" class="rq-action-pill" data-val="return">
              <i class="ri-upload-2-line"></i> Return
            </button>
          </div>
          <input type="hidden" id="filesReqAction" value="pickup">
        </div>

        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-chat-quote-line"></i> Purpose / Reason <span class="lv-req">*</span></div>
          <div class="lv-input-wrap rq-textarea-wrap">
            <textarea id="filesReqPurpose" class="lv-input rq-textarea" placeholder="State the purpose or reason for this file request…"></textarea>
          </div>
        </div>

        <div class="lv-section hidden" id="filesProofSection">
          <div class="lv-section-label"><i class="ri-image-line"></i> Proof of Return <span class="lv-req">*</span></div>
          <label class="lv-upload-zone rq-upload-zone" for="filesReqProofInput" id="filesReqProofZone">
            <div class="lv-upload-content" id="filesReqProofContent">
              <div class="lv-upload-icon"><i class="ri-image-add-line"></i></div>
              <div class="lv-upload-text">
                <span class="lv-upload-cta">Click to upload</span> proof of return
              </div>
              <div class="lv-upload-hint">JPG, PNG, JPEG — max 10MB</div>
            </div>
            <input type="file" id="filesReqProofInput" style="display:none;" accept=".jpg,.jpeg,.png,image/*">
          </label>

          <div class="rq-image-preview hidden" id="filesReqPreviewWrap">
            <img id="filesReqPreviewImg" alt="Proof of Return Preview">
          </div>
        </div>
      </div>

      <div class="lv-footer">
        <div class="lv-footer-note">
          <i class="ri-information-line"></i>
          Use Pickup for borrowing/releasing files. Use Return when handing them back with proof.
        </div>
        <div class="lv-footer-actions">
          <button class="lv-cancel-btn" id="filesReqCancel">
            <i class="ri-close-line"></i> Cancel
          </button>
          <button class="lv-submit-btn" id="filesReqSubmit">
            <i class="ri-send-plane-fill"></i> Submit Request
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('filesRequestClose').onclick = close;
  document.getElementById('filesReqCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  const actionHidden = document.getElementById('filesReqAction');
  const proofSection = document.getElementById('filesProofSection');
  const proofInput = document.getElementById('filesReqProofInput');
  const proofContent = document.getElementById('filesReqProofContent');
  const proofZone = document.getElementById('filesReqProofZone');
  const previewWrap = document.getElementById('filesReqPreviewWrap');
  const previewImg = document.getElementById('filesReqPreviewImg');

  function updateFilesActionUI(action) {
    actionHidden.value = action;
    document.querySelectorAll('#filesReqActionToggle .rq-action-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === action);
    });

    const isReturn = action === 'return';
    proofSection.classList.toggle('hidden', !isReturn);

    if (!isReturn) {
      proofInput.value = '';
      previewImg.removeAttribute('src');
      previewWrap.classList.add('hidden');
      proofZone.style.borderColor = '';
      proofZone.style.background = '';
      proofContent.innerHTML = `
        <div class="lv-upload-icon"><i class="ri-image-add-line"></i></div>
        <div class="lv-upload-text">
          <span class="lv-upload-cta">Click to upload</span> proof of return
        </div>
        <div class="lv-upload-hint">JPG, PNG, JPEG — max 10MB</div>
      `;
    }
  }

  document.getElementById('filesReqActionToggle').addEventListener('click', e => {
    const pill = e.target.closest('.rq-action-pill');
    if (!pill) return;
    updateFilesActionUI(pill.dataset.val);
  });

  proofInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) {
      previewImg.removeAttribute('src');
      previewWrap.classList.add('hidden');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      previewImg.src = ev.target.result;
      previewWrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    proofContent.innerHTML = `
      <div class="lv-upload-icon" style="color:#22c55e;"><i class="ri-checkbox-circle-line"></i></div>
      <div class="lv-upload-text">
        <span class="lv-upload-cta" style="color:#16a34a;">${escHtml(file.name)}</span>
      </div>
      <div class="lv-upload-hint">${(file.size / 1024).toFixed(1)} KB — click to change</div>
    `;
    proofZone.style.borderColor = '#22c55e';
    proofZone.style.background = '#f0fdf4';
  });

  updateFilesActionUI('pickup');

  document.getElementById('filesReqSubmit').addEventListener('click', async () => {
    const request_date = document.getElementById('filesReqDate').value;
    const department = document.getElementById('filesReqDept').value;
    const document_name = document.getElementById('filesReqDocName').value.trim();
    const purpose = document.getElementById('filesReqPurpose').value.trim();
    const request_action = document.getElementById('filesReqAction').value;
    const copy_type = document.getElementById('filesReqCopyType').value;
    const proof_file = proofInput.files[0];

    if (!request_date)    { showToast('Request date is required.', 'error'); return; }
    if (!document_name)   { showToast('File type / document name is required.', 'error'); return; }
    if (!purpose)         { showToast('Purpose / reason is required.', 'error'); return; }
    if (!request_action)  { showToast('Request action is required.', 'error'); return; }
    if (!copy_type)       { showToast('Copy type is required.', 'error'); return; }
    if (request_action === 'return' && !proof_file) {
      showToast('Proof of Return is required for return action.', 'error');
      return;
    }

    const btn = document.getElementById('filesReqSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Submitting…';

    try {
      const formData = new FormData();
      formData.append('request_date', request_date);
      formData.append('department', department);
      formData.append('document_name', document_name);
      formData.append('purpose', purpose);
      formData.append('request_action', request_action);
      formData.append('copy_type', copy_type);
      if (proof_file) formData.append('proof_of_return', proof_file);

      const res = await fetch(`/api/users/${user.id}/files-requests`, {
        method: 'POST',
        body: formData
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(result.error || 'Submission failed.', 'error');
        return;
      }

      close();
      showToast('Files request submitted successfully.', 'success');
      sendRequestNotification('files',
        `Document: ${document_name}\nPurpose: ${purpose}\nAction: ${request_action}\nCopy Type: ${copy_type}${department ? '\nDepartment: ' + department : ''}`
      );
    } catch {
      showToast('Network error.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> Submit Request';
    }
  });
}

 // Opens a modal to select and submit different types of requests (leave, IT support, etc.)
function openLeaveModal(user) {
  if (document.getElementById('leaveRequestModal')) return;

  const deptDefault = {
    noc: 'NOC Department', finance: 'Finance Department',
    executive: 'Executive', admin: 'Admin', bidder: 'Bidder'
  }[user.role?.toLowerCase()] || '';

  const leaveTypes = [
    { val: 'vacation',  label: 'Vacation Leave',  icon: 'ri-sun-line' },
    { val: 'sick',      label: 'Sick Leave',       icon: 'ri-heart-pulse-line' },
    { val: 'emergency', label: 'Emergency Leave',  icon: 'ri-alarm-warning-line' },
    { val: 'maternity', label: 'Maternity Leave',  icon: 'ri-mother-line' },
    { val: 'paternity', label: 'Paternity Leave',  icon: 'ri-parent-line' },
    { val: 'others',    label: 'Others',           icon: 'ri-more-line' },
  ];

  const m = document.createElement('div');
  m.id = 'leaveRequestModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="lv-shell">

      <!-- Header -->
      <div class="lv-header">
        <div class="lv-header-left">
          <div class="lv-header-icon"><i class="ri-calendar-todo-line"></i></div>
          <div>
            <div class="lv-header-title">Leave Request Form</div>
            <div class="lv-header-sub">Complete all required fields to submit your request</div>
          </div>
        </div>
        <button class="lv-close-btn" id="leaveModalClose"><i class="ri-close-line"></i></button>
      </div>

      <!-- Body -->
      <div class="lv-body">

        <!-- Employee Info Banner -->
        <div class="lv-emp-banner">
          <div class="lv-emp-avatar">${user.full_name ? user.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : 'U'}</div>
          <div class="lv-emp-info">
            <div class="lv-emp-name">${escHtml(user.full_name || '—')}</div>
            <div class="lv-emp-meta">
              <span><i class="ri-id-card-line"></i> ${escHtml(user.id_no || '—')}</span>
              <span><i class="ri-building-4-line"></i> ${escHtml(deptDefault || user.role || '—')}</span>
            </div>
          </div>
          <div class="lv-status-pill"><i class="ri-time-line"></i> Pending</div>
        </div>

        <!-- Section: Leave Type pills -->
        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-file-list-3-line"></i> Leave Type <span class="lv-req">*</span></div>
          <div class="lv-type-pills" id="lvTypePills">
            ${leaveTypes.map(t => `
              <button type="button" class="lv-type-pill" data-val="${t.val}">
                <i class="${t.icon}"></i>
                <span>${t.label}</span>
              </button>`).join('')}
          </div>
          <input type="hidden" id="lvType">
        </div>

        <!-- Section: Date Range -->
        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-calendar-range-line"></i> Leave Duration <span class="lv-req">*</span></div>
          <div class="lv-date-row">
            <div class="lv-date-box">
              <label class="lv-date-label">Start Date</label>
              <div class="lv-input-wrap">
                <i class="ri-calendar-line lv-input-icon"></i>
                <input type="date" id="lvStart" class="lv-input lv-input-icon-pad">
              </div>
            </div>
            <div class="lv-date-arrow"><i class="ri-arrow-right-line"></i></div>
            <div class="lv-date-box">
              <label class="lv-date-label">End Date</label>
              <div class="lv-input-wrap">
                <i class="ri-calendar-check-line lv-input-icon"></i>
                <input type="date" id="lvEnd" class="lv-input lv-input-icon-pad">
              </div>
            </div>
            <div class="lv-days-box" id="lvDaysBox">
              <div class="lv-days-num" id="lvDaysNum">—</div>
              <div class="lv-days-lbl">days</div>
            </div>
          </div>
        </div>

        <!-- Section: Department + Reason -->
        <div class="lv-section lv-grid-2">
          <div>
            <div class="lv-section-label"><i class="ri-building-4-line"></i> Department / Position</div>
            <div class="lv-select-wrap">
              <select id="lvDept" class="lv-input lv-select">
                <option value="">Select department…</option>
                <option value="NOC Department"      ${deptDefault==='NOC Department'?'selected':''}>NOC Department</option>
                <option value="Finance Department"  ${deptDefault==='Finance Department'?'selected':''}>Finance Department</option>
                <option value="Executive"           ${deptDefault==='Executive'?'selected':''}>Executive</option>
                <option value="Admin"               ${deptDefault==='Admin'?'selected':''}>Admin</option>
                <option value="Bidder"              ${deptDefault==='Bidder'?'selected':''}>Bidder</option>
              </select>
              <i class="ri-arrow-down-s-line lv-select-arrow"></i>
            </div>
          </div>
          <div>
            <div class="lv-section-label"><i class="ri-chat-quote-line"></i> Reason for Leave</div>
            <div class="lv-input-wrap">
              <i class="ri-edit-line lv-input-icon"></i>
              <input type="text" id="lvReason" class="lv-input lv-input-icon-pad" placeholder="Brief reason for your leave…">
            </div>
          </div>
        </div>

        <!-- Section: Attachment -->
        <div class="lv-section">
          <div class="lv-section-label"><i class="ri-attachment-line"></i> Supporting Document <span class="lv-optional">(optional)</span></div>
          <label class="lv-upload-zone" for="lvAttachment" id="lvUploadZone">
            <div class="lv-upload-content" id="lvUploadContent">
              <div class="lv-upload-icon"><i class="ri-upload-cloud-2-line"></i></div>
              <div class="lv-upload-text">
                <span class="lv-upload-cta">Click to upload</span> or drag and drop
              </div>
              <div class="lv-upload-hint">PDF, DOC, JPG, PNG — max 10MB</div>
            </div>
            <input type="file" id="lvAttachment" style="display:none;"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
          </label>
        </div>

      </div>

      <!-- Footer -->
      <div class="lv-footer">
        <div class="lv-footer-note">
          <i class="ri-information-line"></i>
          Your request will be reviewed by the admin and you will be notified of the decision.
        </div>
        <div class="lv-footer-actions">
          <button class="lv-cancel-btn" id="leaveCancelBtn">
            <i class="ri-close-line"></i> Cancel
          </button>
          <button class="lv-submit-btn" id="leaveSubmitBtn">
            <i class="ri-send-plane-fill"></i> Submit Request
          </button>
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('leaveModalClose').onclick = close;
  document.getElementById('leaveCancelBtn').onclick  = close;
  m.onclick = e => { if (e.target === m) close(); };

  // Leave type pill selection
  document.getElementById('lvTypePills').addEventListener('click', function(e) {
    const pill = e.target.closest('.lv-type-pill');
    if (!pill) return;
    document.querySelectorAll('.lv-type-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    document.getElementById('lvType').value = pill.dataset.val;
  });

  // Auto-calculate days
  function calcDays() {
    const s = document.getElementById('lvStart').value;
    const e = document.getElementById('lvEnd').value;
    const box = document.getElementById('lvDaysNum');
    if (!s || !e) { box.textContent = '—'; return; }
    const diff = Math.ceil((new Date(e) - new Date(s)) / (1000*60*60*24)) + 1;
    box.textContent = diff > 0 ? diff : '—';
    document.getElementById('lvDaysBox').style.background = diff > 0 ? '#eff6ff' : '#f1f5f9';
  }
  document.getElementById('lvStart').addEventListener('change', calcDays);
  document.getElementById('lvEnd').addEventListener('change', calcDays);

  // Attachment preview
  document.getElementById('lvAttachment').addEventListener('change', function() {
    const content = document.getElementById('lvUploadContent');
    if (this.files[0]) {
      content.innerHTML = `
        <div class="lv-upload-icon" style="color:#22c55e;"><i class="ri-checkbox-circle-line"></i></div>
        <div class="lv-upload-text"><span class="lv-upload-cta" style="color:#16a34a;">${escHtml(this.files[0].name)}</span></div>
        <div class="lv-upload-hint">${(this.files[0].size/1024).toFixed(1)} KB — click to change</div>`;
      document.getElementById('lvUploadZone').style.borderColor = '#22c55e';
      document.getElementById('lvUploadZone').style.background  = '#f0fdf4';
    }
  });

  // Submit
  document.getElementById('leaveSubmitBtn').addEventListener('click', async () => {
    const start_date = document.getElementById('lvStart').value;
    const end_date   = document.getElementById('lvEnd').value;
    const leave_type = document.getElementById('lvType').value;
    if (!leave_type)  { showToast('Please select a leave type.', 'error'); return; }
    if (!start_date || !end_date) { showToast('Please select start and end dates.', 'error'); return; }
    if (end_date < start_date)    { showToast('End date must be after start date.', 'error'); return; }

    const btn = document.getElementById('leaveSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Submitting…';

    try {
      const daysVal = document.getElementById('lvDaysNum').textContent;
      const formData = new FormData();
      formData.append('department',     document.getElementById('lvDept').value);
      formData.append('position',       document.getElementById('lvDept').value);
      formData.append('leave_type',     leave_type);
      formData.append('start_date',     start_date);
      formData.append('end_date',       end_date);
      formData.append('number_of_days', daysVal === '—' ? '' : daysVal);
      formData.append('reason',         document.getElementById('lvReason').value.trim());
      const file = document.getElementById('lvAttachment').files[0];
      if (file) formData.append('attachment', file);

      const res = await fetch(`/api/users/${user.id}/leaves`, { method: 'POST', body: formData });
      if (!res.ok) { const r = await res.json(); showToast(r.error || 'Submission failed.', 'error'); return; }
      close();
      showToast('Leave request submitted successfully.', 'success');
      sendRequestNotification('leave',
        `Leave Type: ${leave_type}\nStart Date: ${start_date}\nEnd Date: ${end_date}\nDays: ${daysVal === '—' ? 'N/A' : daysVal}\nReason: ${document.getElementById('lvReason')?.value?.trim() || 'N/A'}`
      );
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-send-plane-fill"></i> Submit Request'; }
  });

    // ── Account Deletion Request ───────────────────────────────────────────────
  document.getElementById('stgDeleteAccBtn').onclick = () =>
    showToast('Account deletion request sent to admin.', 'success');

  // ── In-App Messaging (legacy — kept for backward compat, hidden via tab merge) ─
  document.getElementById('stgMsgHeaderRefreshBtn')?.addEventListener('click', () => {
    stgSelectedMessage = null;
    stgReplyToMessage  = null;
    stgMessagingView   = 'list';
    loadStgMessagingData();
  });

  document.getElementById('stgComposeBtn')?.addEventListener('click', () => {
    stgReplyToMessage = null;
    stgMessagingView = 'compose';
    renderStgMessagingLayout();
  });

  // ── My Requests ─────────────────────────────────────────────────────────────
  // (Handled as a full-page via loadMyRequestsPage() — no panel wiring needed here)
  document.getElementById('stgNewRequestBtn')?.addEventListener('click', () => {
    // Trigger the existing Request action tile flow
    document.getElementById('stgRequestBtn')?.click();
  });

  loadStgMessagingData();

  // Apply saved display settings on load
  const fs = localStorage.getItem('fontSize');
  if (fs) document.documentElement.style.fontSize = fs + 'px';
}

/* ═══════════════════════════════════════════════════════════
   UNIFIED INBOX — 3-panel thread-based messaging + requests
═══════════════════════════════════════════════════════════ */

/* ── Update nav badge counts without re-rendering the whole shell ── */
function _updateUtNavCounts() {
  const mount = document.getElementById('utInboxMount');

  const msgThreads   = utThreads.filter(t => t.type === 'message');
  const unreadCount  = msgThreads.filter(t => !t.is_read && Number(t.recipient_id) === Number(user.id)).length;
  const sentCount    = msgThreads.filter(t => Number(t.sender_id) === Number(user.id)).length;
  const starredCount = utThreads.filter(t => utStarred.has(t.thread_id)).length;
  const pendingCount = utThreads.filter(t => t.type === 'request' && (t.status || '').toLowerCase() === 'pending').length;
  const draftsCount  = utDrafts.length;
  const inboxCount   = msgThreads.filter(t => Number(t.recipient_id) === Number(user.id)).length;
  updateStgInboxUnreadBadge(unreadCount);

  const updateBtn = (folder, count, cls) => {
    if (!mount) return;
    const btn = mount.querySelector(`.ut-nav-btn[data-folder="${folder}"]`);
    if (!btn) return;
    let badge = btn.querySelector('.ut-nav-count');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = `ut-nav-count${cls ? ' ' + cls : ''}`; btn.appendChild(badge); }
      badge.textContent = count;
      badge.className = `ut-nav-count${cls ? ' ' + cls : ''}`;
    } else {
      badge?.remove();
    }
  };

  updateBtn('inbox',    unreadCount > 0 ? unreadCount : inboxCount, unreadCount > 0 ? 'unread' : '');
  updateBtn('sent',     sentCount,    '');
  updateBtn('starred',  starredCount, '');
  updateBtn('drafts',   draftsCount,  'draft');
  updateBtn('requests', pendingCount, 'pending');
}

function updateStgInboxUnreadBadge(count) {
  const inboxBtn = document.querySelector('.stg-navitem[data-tab="inbox"]');
  if (!inboxBtn) return;
  let badge = inboxBtn.querySelector('.stg-inbox-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'stg-inbox-badge';
      inboxBtn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    inboxBtn.classList.add('has-unread');
  } else {
    badge?.remove();
    inboxBtn.classList.remove('has-unread');
  }
}

function resetUnifiedInboxSearchState() {
  utSearch = '';
  const input = document.getElementById('utSearchInput');
  if (input) {
    input.value = '';
    input.defaultValue = '';
    input.removeAttribute('value');
  }
}

async function loadUnifiedInbox() {
  const mount = document.getElementById('utInboxMount');
  if (!mount) return;
  startUtPresenceHeartbeat();

  // Always reset search on every load — prevents stale ID pre-filling the input
  // This runs before shellExists check so even partial re-renders start clean
  resetUnifiedInboxSearchState();

  // Drafts folder is purely client-side — no fetch needed
  if (utFolder === 'drafts') {
    try {
      const usersRes  = await fetch(`/api/users?exclude=${user.id}`);
      const usersData = await usersRes.json().catch(() => []);
      stgUsers = Array.isArray(usersData) ? usersData : [];
    } catch {}
    renderUnifiedInbox();
    return;
  }

  // If the shell is already rendered (ut-shell exists), only show loading in thread list
  // This prevents the entire layout from flickering/blanking on refresh
  const shellExists = !!mount.querySelector('.ut-shell');
  if (shellExists) {
    const listBody = document.getElementById('utThreadListBody');
    if (listBody) listBody.innerHTML = `<div class="ut-loading"><i class="ri-loader-4-line spin"></i> Loading…</div>`;
  } else {
    mount.innerHTML = `<div class="ut-loading"><i class="ri-loader-4-line spin"></i> Loading…</div>`;
  }

  try {
    // Determine API filter: for mail folders (inbox/sent/starred) fetch all messages
    // For requests folder fetch all requests
    const apiFilter = (utFolder === 'requests') ? 'requests' : 'messages';
    const params = new URLSearchParams({
      filter: apiFilter,
      status: utStatusFilter,
    });
    // Don't pass search to server — we filter client-side to avoid search leaking across folder switches

    const [threadsRes, usersRes] = await Promise.all([
      fetch(`/api/users/${user.id}/threads?${params}`),
      fetch(`/api/users?exclude=${user.id}`)
    ]);

    const threadsData = await threadsRes.json().catch(() => []);
    const usersData   = await usersRes.json().catch(() => []);

    if (!threadsRes.ok) throw new Error(threadsData?.error || 'Failed to load inbox');
    utThreads = Array.isArray(threadsData) ? threadsData : [];
    stgUsers  = Array.isArray(usersData)   ? usersData   : [];

    // If shell already exists, only update the thread list (no full re-render = no flicker)
    if (shellExists && mount.querySelector('.ut-shell')) {
      renderUtThreadList();
      // Update nav counts without full re-render
      _updateUtNavCounts();
      // Defense-in-depth: re-clear input after render in case anything re-filled it
      resetUnifiedInboxSearchState();
      requestAnimationFrame(resetUnifiedInboxSearchState);
    } else {
      renderUnifiedInbox();
    }
  } catch (err) {
    const listBody = document.getElementById('utThreadListBody');
    const errHtml = `<div class="ut-empty-state"><i class="ri-error-warning-line"></i><div>${escHtml(err.message)}</div></div>`;
    if (listBody) listBody.innerHTML = errHtml;
    else if (mount) mount.innerHTML = errHtml;
  }
}

function renderUnifiedInbox() {
  const mount = document.getElementById('utInboxMount');
  if (!mount) return;

  // Always show messages + requests in conversation list (no folder separation)
  // Set filter to messages by default for the list
  if (utFolder !== 'requests') utFolder = 'inbox';

  mount.innerHTML = `
    <div class="ut-shell ut-telegram-shell ${utSelectedThread || utView === 'compose' ? 'ut-mobile-thread-open' : ''}">

      <!-- LEFT: Conversation List -->
      <section class="ut-thread-list-panel" id="utThreadListPanel">
        <div class="ut-chat-list-header">
          <span class="ut-chat-list-title"><i class="ri-message-3-line"></i> Chats</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="ut-refresh-btn" id="utRefreshBtn" title="Refresh" aria-label="Refresh conversations"><i class="ri-refresh-line"></i></button>
            <button class="ut-new-chat-btn ut-group-create-btn" id="utCreateGroupBtn" title="Create Group" aria-label="Create group chat"><i class="ri-group-line"></i></button>
            <button class="ut-new-chat-btn" id="utComposeBtn" title="New Message" aria-label="Start a new message"><i class="ri-edit-line"></i></button>
          </div>
        </div>
        <div class="ut-search-row">
          <div class="ut-search-wrap">
            <i class="ri-search-line"></i>
            <input type="text" id="utSearchInput" class="ut-search-input" placeholder="Search" value="">
          </div>
        </div>
        <div id="utThreadListBody"></div>
      </section>

      <!-- RIGHT: Chat Window -->
      <section class="ut-conversation-panel" id="utConversationPanel">
        <div id="utConversationBody">
          <div class="ut-empty-state">
            <i class="ri-chat-smile-3-line" style="font-size:52px;opacity:0.25;"></i>
            <div style="font-weight:600;font-size:15px;">Select a chat to start messaging</div>
            <div style="font-size:13px;opacity:0.6;">Choose a conversation from the chat list</div>
            <button class="ut-action-btn primary" id="utEmptyComposeBtn" style="margin-top:8px;">
              <i class="ri-edit-line"></i> New Message
            </button>
          </div>
        </div>
      </section>

    </div>
  `;

  // Search — always start empty, never carry over previous value
  const searchInput = document.getElementById('utSearchInput');
  if (searchInput) {
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('autocorrect', 'off');
    searchInput.setAttribute('autocapitalize', 'off');
    searchInput.setAttribute('spellcheck', 'false');
  }
  resetUnifiedInboxSearchState();
  requestAnimationFrame(resetUnifiedInboxSearchState);
  setTimeout(resetUnifiedInboxSearchState, 0);
  setTimeout(resetUnifiedInboxSearchState, 100);
  setTimeout(resetUnifiedInboxSearchState, 300);
  let searchTimer;
  searchInput?.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      utSearch = this.value.trim();
      renderUtThreadList();
    }, 250);
  });

  document.getElementById('utRefreshBtn')?.addEventListener('click', () => {
    utSearch = '';
    if (searchInput) searchInput.value = '';
    loadUnifiedInbox();
  });

  const openCompose = () => {
    utView = 'compose';
    stgReplyToMessage = null;
    document.querySelector('.ut-shell')?.classList.add('ut-mobile-thread-open');
    renderUtConversationPane();
  };
  document.getElementById('utComposeBtn')?.addEventListener('click', openCompose);
  document.getElementById('utEmptyComposeBtn')?.addEventListener('click', openCompose);
  document.getElementById('utCreateGroupBtn')?.addEventListener('click', openUtCreateGroupModal);

  renderUtThreadList();

  // Restore previously selected thread
  if (utSelectedThreadId && utSelectedThread) {
    renderUtConversationPane();
  }
}

function parseUtRecipientIds(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return String(value).split(',').map(Number).filter(Boolean);
  }
}

function getUtGroupMembersPreview(thread) {
  const ids = parseUtRecipientIds(thread?.recipient_ids);
  const members = ids
    .map(id => Number(id) === Number(user.id)
      ? { id, full_name: 'You', email: '' }
      : stgUsers.find(u => Number(u.id) === Number(id)))
    .filter(Boolean);
  if (!members.length) return '';
  const names = members.map(u => u.full_name || u.email || 'User');
  return `${members.length} members: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
}

function getUtGroupAvatarHtml(thread, avatarBg, className = 'ut-conv-avatar') {
  const photo = thread?.group_photo || thread?.raw?.group_photo || '';
  if (photo) {
    return `<div class="${className} ut-group-avatar ut-group-photo" style="background-image:url('${escHtml(photo)}');"></div>`;
  }
  return `<div class="${className} ut-group-avatar" style="background:${avatarBg};"><i class="ri-group-line"></i></div>`;
}

function closeUtCreateGroupModal() {
  document.getElementById('utCreateGroupModal')?.remove();
  utGroupPhotoDataUrl = '';
  utPendingGroupMemberIds.clear();
}

function renderUtGroupMemberOptions(query = '') {
  const list = document.getElementById('utGroupMemberList');
  if (!list) return;
  const q = query.trim().toLowerCase();
  const users = stgUsers.filter(u => {
    const text = `${u.full_name || ''} ${u.email || ''} ${u.role || ''}`.toLowerCase();
    return !q || text.includes(q);
  });
  list.innerHTML = users.length ? users.map(u => `
    <label class="ut-group-member-option">
      <input type="checkbox" value="${u.id}" ${utPendingGroupMemberIds.has(Number(u.id)) ? 'checked' : ''}>
      <span class="ut-group-member-avatar">${escHtml((u.full_name || u.email || 'U').charAt(0).toUpperCase())}</span>
      <span class="ut-group-member-text">
        <strong>${escHtml(u.full_name || u.email || 'User')}</strong>
        <small>${escHtml(u.email || u.role || '')}</small>
      </span>
    </label>
  `).join('') : `<div class="ut-group-member-empty">No users found.</div>`;
}

function openUtCreateGroupModal() {
  closeUtCreateGroupModal();
  utGroupPhotoDataUrl = '';
  utPendingGroupMemberIds.clear();
  const modal = document.createElement('div');
  modal.id = 'utCreateGroupModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="ut-group-modal">
      <div class="ut-group-modal-header">
        <div>
          <h3><i class="ri-group-line"></i> Create Group</h3>
          <p>Add at least two members to start a group chat.</p>
        </div>
        <button type="button" class="modal-close-btn" id="utGroupCloseBtn" aria-label="Close"><i class="ri-close-line"></i></button>
      </div>
      <div class="ut-group-modal-body">
        <label class="ut-group-field">
          <span>Group name</span>
          <input type="text" id="utGroupNameInput" class="ut-group-input" placeholder="Group name" maxlength="80">
        </label>
        <label class="ut-group-field">
          <span>Group photo/icon</span>
          <input type="file" id="utGroupPhotoInput" class="ut-group-input" accept="image/*">
          <small id="utGroupPhotoLabel">Optional. Image is shown as the group avatar.</small>
        </label>
        <label class="ut-group-field">
          <span>Members</span>
          <div class="ut-group-search-wrap">
            <i class="ri-search-line"></i>
            <input type="text" id="utGroupMemberSearch" placeholder="Search people">
          </div>
        </label>
        <div class="ut-group-member-list" id="utGroupMemberList"></div>
      </div>
      <div class="ut-group-modal-footer">
        <span id="utGroupMemberCount">0 selected</span>
        <div>
          <button type="button" class="tool-btn" id="utGroupCancelBtn">Cancel</button>
          <button type="button" class="tool-btn apply-btn" id="utGroupCreateBtn"><i class="ri-check-line"></i> Create Group</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  renderUtGroupMemberOptions();

  const updateCount = () => {
    const label = document.getElementById('utGroupMemberCount');
    if (label) label.textContent = `${utPendingGroupMemberIds.size} selected`;
  };
  modal.addEventListener('change', e => {
    if (e.target?.matches('#utGroupMemberList input')) {
      if (e.target.checked) utPendingGroupMemberIds.add(Number(e.target.value));
      else utPendingGroupMemberIds.delete(Number(e.target.value));
      updateCount();
    }
  });
  document.getElementById('utGroupMemberSearch')?.addEventListener('input', e => {
    renderUtGroupMemberOptions(e.target.value);
    modal.querySelectorAll('#utGroupMemberList input').forEach(input => { input.checked = utPendingGroupMemberIds.has(Number(input.value)); });
    updateCount();
  });
  document.getElementById('utGroupPhotoInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) { utGroupPhotoDataUrl = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      utGroupPhotoDataUrl = String(reader.result || '');
      const label = document.getElementById('utGroupPhotoLabel');
      if (label) label.textContent = file.name;
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('utGroupCloseBtn')?.addEventListener('click', closeUtCreateGroupModal);
  document.getElementById('utGroupCancelBtn')?.addEventListener('click', closeUtCreateGroupModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeUtCreateGroupModal(); });
  document.getElementById('utGroupCreateBtn')?.addEventListener('click', createUtGroupChat);
  document.getElementById('utGroupNameInput')?.focus();
}

async function createUtGroupChat() {
  const name = (document.getElementById('utGroupNameInput')?.value || '').trim();
  const memberIds = Array.from(utPendingGroupMemberIds).map(Number).filter(Boolean);
  const btn = document.getElementById('utGroupCreateBtn');
  if (!name) { showToast('Group name is required.', 'error'); return; }
  if (memberIds.length < 2) { showToast('Select at least 2 members.', 'error'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Creating'; }
  try {
    let res = await fetch('/api/messages/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator_id: Number(user.id),
        group_name: name,
        member_ids: memberIds,
        group_photo: utGroupPhotoDataUrl || null
      })
    });
    let group = await res.json().catch(() => ({}));
    if (res.status === 404) {
      res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: Number(user.id),
          recipient_id: Number(memberIds[0]),
          recipient_ids: memberIds,
          group_name: name,
          group_photo: utGroupPhotoDataUrl || null,
          subject: name,
          body: '',
          parent_message_id: null
        })
      });
      group = await res.json().catch(() => ({}));
    }
    if (!res.ok) throw new Error(group.error || 'Failed to create group');
    if (!group.group_id) throw new Error('Group was created but no group id was returned.');
    const thread = {
      thread_id: `grp_${group.group_id}`,
      type: 'message',
      title: group.group_name,
      summary: '',
      sender_id: Number(user.id),
      sender_name: 'You',
      recipient_id: memberIds[0],
      recipient_name: '',
      group_id: group.group_id,
      group_name: group.group_name,
      group_photo: group.group_photo || null,
      recipient_ids: group.recipient_ids,
      is_read: true,
      created_at: group.created_at || new Date().toISOString(),
      updated_at: group.created_at || new Date().toISOString(),
      raw: group.raw || group
    };
    utThreads = [thread, ...utThreads.filter(t => String(t.thread_id) !== String(thread.thread_id))];
    utSelectedThreadId = thread.thread_id;
    utSelectedThread = {
      ...thread,
      participants: group.participants || [],
      messages: [],
      raw: group.raw || group
    };
    utView = 'thread';
    closeUtCreateGroupModal();
    document.querySelector('.ut-shell')?.classList.add('ut-mobile-thread-open');
    renderUtThreadList();
    renderUtConversationPane();
    startUtRealtimePolling();
    showToast('Group created.', 'success');
    loadUnifiedInbox();
  } catch (err) {
    showToast(err.message || 'Failed to create group.', 'error');
  } finally {
    const createBtn = document.getElementById('utGroupCreateBtn');
    if (createBtn) { createBtn.disabled = false; createBtn.innerHTML = '<i class="ri-check-line"></i> Create Group'; }
  }
}

function renderUtThreadList() {
  const body = document.getElementById('utThreadListBody');
  if (!body) return;

  const _render = () => {
    // Show ALL message threads (both sent and received) + requests — no folder separation
    let displayThreads = utThreads.filter(t => {
      // Only show messages (not requests) in the main conversation list
      if (t.type === 'request') return false;

      // Search filter
      if (utSearch) {
        const q = utSearch.toLowerCase();
        const titleMatch   = (t.title   || '').toLowerCase().includes(q);
        const summaryMatch = (t.summary || '').toLowerCase().includes(q);
        if (!titleMatch && !summaryMatch) return false;
      }
      return true;
    });

    // Deduplicate by conversation partner — show latest per person
    // A "conversation" is all messages between current user and another person
    const convMap = new Map();
    for (const t of displayThreads) {
      if (t.group_id) {
        const key = `group_${t.group_id}`;
        const existing = convMap.get(key);
        const tTime = new Date(t.updated_at || t.created_at || 0).getTime();
        const eTime = existing ? new Date(existing.updated_at || existing.created_at || 0).getTime() : 0;
        const isIncomingUnread = !t.is_read && Number(t.recipient_id) === Number(user.id);
        const groupName = t.group_name || t.title || 'Group chat';
        if (!existing || tTime > eTime) {
          convMap.set(key, {
            ...t,
            _isGroup: true,
            _partnerId: null,
            _partnerName: groupName,
            _unreadCount: (existing?._unreadCount || 0) + (isIncomingUnread ? 1 : 0)
          });
        } else if (isIncomingUnread) {
          existing._unreadCount = (existing._unreadCount || 0) + 1;
        }
        continue;
      }
      // Determine the OTHER person's id/name
      const isSender = Number(t.sender_id) === Number(user.id);
      const partnerId   = isSender ? t.recipient_id : t.sender_id;
      const partnerName = isSender ? (t.recipient_name || 'Unknown') : (t.sender_name || 'Unknown');
      const key = String(partnerId || t.thread_id);
      const existing = convMap.get(key);
      const tTime = new Date(t.updated_at || t.created_at || 0).getTime();
      const eTime = existing ? new Date(existing.updated_at || existing.created_at || 0).getTime() : 0;
      const isIncomingUnread = !t.is_read && Number(t.recipient_id) === Number(user.id);
      if (!existing || tTime > eTime) {
        convMap.set(key, {
          ...t,
          _partnerId: partnerId,
          _partnerName: partnerName,
          _unreadCount: (existing?._unreadCount || 0) + (isIncomingUnread ? 1 : 0)
        });
      } else if (isIncomingUnread) {
        existing._unreadCount = (existing._unreadCount || 0) + 1;
      }
    }
    const conversations = [...convMap.values()].sort((a, b) =>
      new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
    );

    if (!conversations.length) {
      body.innerHTML = `
        <div class="ut-empty-state">
          <i class="ri-chat-3-line"></i>
          <div>${utSearch ? 'No conversations match your search.' : 'No conversations yet.'}</div>
          ${utSearch ? `<small>Try clearing your search.</small>` : ''}
        </div>`;
      return;
    }

    body.innerHTML = conversations.map(t => {
      const unreadCnt = t._unreadCount || 0;
      const isUnread  = unreadCnt > 0;
      const isActive  = t.thread_id === utSelectedThreadId;
      const timeText  = t.updated_at || t.created_at ? relativeTime(t.updated_at || t.created_at) : '';
      const name      = t._partnerName || 'Unknown';
      const initial   = name.charAt(0).toUpperCase();
      const presence = t._isGroup ? {} : (utPresenceByUser[String(t._partnerId)] || {});
      const onlineClass = presence.isOnline ? 'online' : 'offline';
      // Deterministic avatar color from name
      const colors    = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316'];
      const colorIdx  = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
      const avatarBg  = colors[colorIdx];

      const previewText = t._isGroup && !t.summary ? 'No messages yet' : (t.summary || 'Attachment');
      const memberPreview = t._isGroup ? getUtGroupMembersPreview(t) : '';
      const isPinned = Boolean(t.pinned || t.is_pinned);

      return `
        <div class="ut-thread-row ${isUnread ? 'unread' : ''} ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''}" data-tid="${escHtml(t.thread_id)}">
          <div class="ut-conv-avatar-wrap">
            ${t._isGroup ? getUtGroupAvatarHtml(t, avatarBg) : `<div class="ut-conv-avatar" style="background:${avatarBg};">${initial}</div>`}
            ${t._isGroup ? '' : `<span class="ut-status-presence-dot ${onlineClass}"></span>`}
          </div>
          <div class="ut-thread-meta">
            <div class="ut-thread-title-row">
              <span class="ut-thread-title">${escHtml(name)}</span>
              <span class="ut-thread-time">${escHtml(timeText)}</span>
            </div>
            <div class="ut-thread-preview-row">
              <span class="ut-thread-preview">${isPinned ? '<i class="ri-pushpin-2-fill"></i> ' : ''}${memberPreview ? `${escHtml(memberPreview)} · ` : ''}${escHtml(previewText)}</span>
              ${unreadCnt > 0 ? `<span class="ut-unread-badge">${unreadCnt}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    body.querySelectorAll('.ut-thread-row').forEach(row => {
      row.addEventListener('click', async () => {
        const tid = row.dataset.tid;
        utSelectedThreadId = tid;
        utView = 'thread';
        document.querySelector('.ut-shell')?.classList.add('ut-mobile-thread-open');

        body.querySelectorAll('.ut-thread-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        row.classList.remove('unread');

        const convBody = document.getElementById('utConversationBody');
        if (convBody) convBody.innerHTML = `
          <div class="ut-chat-skeleton">
            <div class="ut-skeleton-header">
              <span></span><div><i></i><i></i></div>
            </div>
            <div class="ut-skeleton-bubble left"></div>
            <div class="ut-skeleton-bubble left short"></div>
            <div class="ut-skeleton-bubble right"></div>
            <div class="ut-skeleton-bubble right short"></div>
          </div>`;

        try {
          const res  = await fetch(`/api/users/${user.id}/threads/${encodeURIComponent(tid)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Failed to load thread');
          utSelectedThread = data;
          utSelectedThread.messages = (utSelectedThread.messages || []).map(normalizeUtRealtimeMessage);

          if (tid.startsWith('msg_')) {
            await markUtConversationSeen(utSelectedThread);
            const participantIds = new Set(
              (utSelectedThread.messages || [])
                .flatMap(msg => [String(msg.sender_id), String(msg.recipient_id)])
                .filter(Boolean)
            );
            utThreads = utThreads.map(t => {
              const sameConversation = participantIds.has(String(t.sender_id)) && participantIds.has(String(t.recipient_id));
              return sameConversation ? { ...t, is_read: true } : t;
            });
          }

          renderUtConversationPane();
          startUtRealtimePolling();
        } catch (err) {
          if (convBody) convBody.innerHTML = `<div class="ut-empty-state"><i class="ri-error-warning-line"></i><div>${escHtml(err.message)}</div></div>`;
        }
      });
    });
  }; // end _render
  requestAnimationFrame(_render);
}

function getUtMessageSenderId(message) {
  return Number(message?.senderId ?? message?.sender_id);
}

function getUtMessageCreatedAt(message) {
  return message?.createdAt || message?.created_at || new Date().toISOString();
}

function getUtAttachmentFromMessage(message) {
  const name = message?.attachment?.name || message?.attachment_name;
  const url = message?.attachment?.url || message?.attachment_path;
  if (!name || !url) return null;
  return {
    id: `att_${message.id || Date.now()}_${String(name).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    name,
    type: message?.attachment?.type || message?.attachment_type || '',
    size: message?.attachment?.size || message?.attachment_size || null,
    url
  };
}

function getUtAttachmentKind(attachment) {
  const name = String(attachment?.name || '').toLowerCase();
  const type = String(attachment?.type || '').toLowerCase();
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return 'image';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (type.startsWith('text/') || /\.txt$/i.test(name)) return 'text';
  if (/\.(doc|docx)$/i.test(name)) return 'word';
  if (/\.(xls|xlsx)$/i.test(name)) return 'excel';
  return 'file';
}

function formatUtAttachmentSize(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function registerUtAttachment(attachment) {
  if (!attachment?.url) return '';
  const id = attachment.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  utAttachmentRegistry.set(id, { ...attachment, id });
  return id;
}

function previewAttachment(attachment) {
  if (!attachment?.url) return;
  const kind = getUtAttachmentKind(attachment);
  if (!['image', 'pdf', 'text'].includes(kind)) {
    window.open(attachment.url, '_blank', 'noopener');
    return;
  }
  document.getElementById('utAttachmentPreviewModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'utAttachmentPreviewModal';
  modal.className = 'modal-overlay ut-attachment-preview-modal';
  const previewBody = kind === 'image'
    ? `<img class="ut-attachment-preview-img" src="${escHtml(attachment.url)}" alt="${escHtml(attachment.name)}">`
    : `<iframe class="ut-attachment-preview-frame" src="${escHtml(attachment.url)}" title="${escHtml(attachment.name)}"></iframe>`;
  modal.innerHTML = `
    <div class="ut-attachment-preview-box">
      <div class="ut-attachment-preview-header">
        <div class="ut-attachment-preview-title">
          <i class="${kind === 'image' ? 'ri-image-line' : 'ri-file-text-line'}"></i>
          <span>${escHtml(attachment.name)}</span>
        </div>
        <div class="ut-attachment-preview-actions">
          <button type="button" class="tool-btn" id="utAttachmentPreviewDownload"><i class="ri-download-2-line"></i> Download</button>
          <button type="button" class="modal-close-btn" id="utAttachmentPreviewClose" aria-label="Close"><i class="ri-close-line"></i></button>
        </div>
      </div>
      <div class="ut-attachment-preview-body">${previewBody}</div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('utAttachmentPreviewClose')?.addEventListener('click', () => modal.remove());
  document.getElementById('utAttachmentPreviewDownload')?.addEventListener('click', e => {
    e.stopPropagation();
    downloadAttachment(attachment);
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });
}

async function downloadAttachment(attachment) {
  if (!attachment?.url) return;
  const filename = attachment.name || 'attachment';
  try {
    const res = await fetch(attachment.url);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    const a = document.createElement('a');
    a.href = attachment.url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function getUtThreadPartner(thread) {
  if (thread?.group_id || thread?.thread_id?.startsWith?.('grp_')) {
    return {
      id: null,
      name: thread.group_name || thread.title || 'Group chat',
      isGroup: true
    };
  }
  const raw = thread?.raw || {};
  const senderId = Number(raw.sender_id ?? thread?.sender_id);
  const recipientId = Number(raw.recipient_id ?? thread?.recipient_id);
  const currentUserId = Number(user.id);

  if (senderId === currentUserId) {
    return {
      id: recipientId,
      name: raw.recipient_name || raw.recipient_email || thread?.recipient_name || thread?.title || 'Conversation'
    };
  }

  return {
    id: senderId,
    name: raw.sender_name || raw.sender_email || thread?.sender_name || thread?.title || 'Conversation'
  };
}

function scrollUtMessagesToBottom(behavior = 'smooth') {
  const area = document.getElementById('utMessagesArea');
  if (area) area.scrollTo({ top: area.scrollHeight, behavior });
}

function getUtThreadPeerId(thread) {
  if (thread?.group_id || thread?.thread_id?.startsWith?.('grp_')) return null;
  const isSender = Number(thread?.sender_id) === Number(user.id);
  return Number(isSender ? thread?.recipient_id : thread?.sender_id);
}

function buildUtGroupName(recipientIds = []) {
  const names = recipientIds
    .map(id => stgUsers.find(u => Number(u.id) === Number(id)))
    .filter(Boolean)
    .map(u => u.full_name || u.email || 'User');
  return names.length > 1 ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : (names[0] || 'Chat');
}

function isUtConversationActiveForThread(thread) {
  if (!utSelectedThread || utSelectedThread.type !== 'message') return false;
  if (thread?.group_id || thread?.thread_id?.startsWith?.('grp_')) {
    const activeGroupId = String(utSelectedThread.group_id || utSelectedThread.thread_id || '').replace(/^grp_/, '');
    const nextGroupId = String(thread.group_id || thread.thread_id || '').replace(/^grp_/, '');
    return activeGroupId === nextGroupId;
  }
  return Number(getUtThreadPartner(utSelectedThread).id) === getUtThreadPeerId(thread);
}

async function openUtConversationFromNotification(thread) {
  if (!thread?.thread_id) return;
  utSelectedThreadId = thread.thread_id;
  utView = 'thread';
  utFolder = 'inbox';
  utFilter = 'messages';

  if (!document.getElementById('utInboxMount') && typeof openPage === 'function') {
    openPage('settings');
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const inboxBtn = document.querySelector('.stg-navitem[data-tab="inbox"]');
  if (inboxBtn && !inboxBtn.classList.contains('active')) inboxBtn.click();
  await new Promise(resolve => setTimeout(resolve, 120));

  const mount = document.getElementById('utInboxMount');
  if (mount && !mount.querySelector('.ut-shell')) await loadUnifiedInbox();

  try {
    const res = await fetch(`/api/users/${user.id}/threads/${encodeURIComponent(thread.thread_id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to load thread');
    utSelectedThread = data;
    utSelectedThread.messages = (utSelectedThread.messages || []).map(normalizeUtRealtimeMessage);
    await markUtConversationSeen(utSelectedThread);
    document.querySelector('.ut-shell')?.classList.add('ut-mobile-thread-open');
    renderUtThreadList();
    renderUtConversationPane();
    startUtRealtimePolling();
  } catch (err) {
    showToast(err.message || 'Failed to open message.', 'error');
  }
}

async function startUtNotificationPolling() {
  if (utNotificationTimer || !user?.id) return;

  const poll = async (initial = false) => {
    try {
      const res = await fetch(`/api/users/${user.id}/threads?filter=messages&status=all`);
      const data = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(data)) return;

      const unreadTotal = data.filter(t => !t.is_read && Number(t.recipient_id) === Number(user.id)).length;
      updateStgInboxUnreadBadge(unreadTotal);

      if (initial && utKnownMessageIds.size === 0) {
        data.forEach(t => utKnownMessageIds.add(String(t.raw?.id || t.id || t.thread_id)));
        return;
      }

      const incoming = data
        .filter(t => Number(t.sender_id) !== Number(user.id))
        .filter(t => !t.is_read && Number(t.recipient_id) === Number(user.id))
        .filter(t => !utKnownMessageIds.has(String(t.raw?.id || t.id || t.thread_id)))
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

      data.forEach(t => utKnownMessageIds.add(String(t.raw?.id || t.id || t.thread_id)));

      if (incoming.length && Array.isArray(utThreads) && utThreads.length) {
        const knownThreadIds = new Set(utThreads.map(t => String(t.raw?.id || t.id || t.thread_id)));
        const merged = incoming.filter(t => !knownThreadIds.has(String(t.raw?.id || t.id || t.thread_id)));
        if (merged.length) {
          utThreads = [...merged, ...utThreads].sort((a, b) =>
            new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
          );
          if (document.getElementById('utThreadListBody')) renderUtThreadList();
        }
      }

      incoming.forEach(thread => {
        if (isUtConversationActiveForThread(thread)) return;
        const preview = String(thread.summary || '').replace(/\s+/g, ' ').trim().slice(0, 50);
        showMessageNotificationToast({
          senderName: thread.sender_name || 'New message',
          preview,
          createdAt: thread.created_at,
          onClick: () => openUtConversationFromNotification(thread)
        });
        playMessageNotificationSound();
      });
    } catch {}
  };

  await poll(true);
  utNotificationTimer = setInterval(() => poll(false), 3000);
}

function getUtMessageSeen(message) {
  return Boolean(message?.seen ?? message?.is_read);
}

function getUtMessageSeenAt(message) {
  return message?.seenAt || message?.seen_at || null;
}

function formatUtLastSeen(dateStr) {
  if (!dateStr) return 'Offline';
  return `Last seen ${relativeTime(dateStr)}`;
}

function normalizeUtRealtimeMessage(message) {
  return {
    ...message,
    seen: Boolean(message.seen ?? message.is_read),
    seenAt: message.seenAt || message.seen_at || null
  };
}

function getUtMessageSignature(messages = []) {
  return messages.map(msg => [
    msg.id,
    getUtMessageSenderId(msg),
    msg.body || '',
    getUtMessageCreatedAt(msg),
    getUtMessageSeen(msg) ? 1 : 0,
    getUtMessageSeenAt(msg) || ''
  ].join(':')).join('|');
}

async function markUtConversationSeen(thread = utSelectedThread) {
  if (!thread?.messages?.length) return;
  const now = new Date().toISOString();
  const unreadReceived = thread.messages.filter(msg =>
    !getUtMessageSeen(msg) && getUtMessageSenderId(msg) !== Number(user.id)
  );
  if (!unreadReceived.length) return;

  thread.messages = thread.messages.map(msg =>
    unreadReceived.some(unread => String(unread.id) === String(msg.id))
      ? { ...msg, is_read: true, seen: true, seen_at: now, seenAt: now }
      : msg
  );

  await Promise.allSettled(unreadReceived.map(msg => fetch(`/api/messages/${msg.id}/read`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id, is_read: true })
  })));
}

function startUtPresenceHeartbeat() {
  if (utPresenceTimer) return;
  const sendPresence = (isOnline = true) => {
    if (!user?.id) return;
    fetch('/api/messages/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: Number(user.id), is_online: isOnline })
    }).catch(() => {});
  };
  sendPresence(true);
  utPresenceTimer = setInterval(() => sendPresence(true), 15000);
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon?.('/api/messages/presence', new Blob([
      JSON.stringify({ user_id: Number(user.id), is_online: false })
    ], { type: 'application/json' }));
  }, { once: true });
}

async function emitUtTyping(isTyping) {
  const partner = getUtThreadPartner(utSelectedThread);
  if (!partner.id) return;
  await fetch('/api/messages/typing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender_id: Number(user.id),
      recipient_id: Number(partner.id),
      is_typing: Boolean(isTyping)
    })
  }).catch(() => {});
}

function startUtRealtimePolling() {
  if (utRealtimeTimer) clearInterval(utRealtimeTimer);
  if (!utSelectedThread || utSelectedThread.type !== 'message') return;

  utRealtimeTimer = setInterval(async () => {
    if (!utSelectedThread || utSelectedThread.type !== 'message') return;
    const partner = getUtThreadPartner(utSelectedThread);

    try {
      if (partner.id) {
        const realtimeRes = await fetch(`/api/messages/realtime?user_id=${user.id}&peer_id=${partner.id}`);
        const realtime = await realtimeRes.json().catch(() => ({}));
        if (realtimeRes.ok) {
          utPresenceByUser[String(partner.id)] = realtime.presence;
          const nextTyping = realtime.typing || { isTyping: false, typingUserId: null };
          const typingChanged = nextTyping.isTyping !== utTypingState.isTyping || nextTyping.typingUserId !== utTypingState.typingUserId;
          utTypingState = nextTyping;
          if (typingChanged) renderUtConversationPane();
        }
      }

      const input = document.getElementById('utChatInput');
      if (document.activeElement === input && input?.value.trim()) return;

      const threadRes = await fetch(`/api/users/${user.id}/threads/${encodeURIComponent(utSelectedThreadId)}`);
      const thread = await threadRes.json().catch(() => null);
      if (!threadRes.ok || !thread) return;
      thread.messages = (thread.messages || []).map(normalizeUtRealtimeMessage);
      const oldSig = getUtMessageSignature(utSelectedThread.messages || []);
      const newSig = getUtMessageSignature(thread.messages || []);
      if (oldSig !== newSig) {
        utSelectedThread = thread;
        await markUtConversationSeen(utSelectedThread);
        renderUtConversationPane(null, 'smooth');
        renderUtThreadList();
      }
    } catch {}
  }, 2500);
}

function renderUtConversationPane(draft = null, scrollBehavior = 'auto') {
  const panel = document.getElementById('utConversationBody');
  if (!panel) return;
  utAttachmentRegistry = new Map();

  if (utView === 'compose') {
    renderUtComposeView(panel, draft);
    return;
  }

  if (!utSelectedThread) {
    panel.innerHTML = `<div class="ut-empty-state">
      <i class="ri-chat-smile-3-line" style="font-size:52px;opacity:0.25;"></i>
      <div style="font-weight:600;font-size:15px;">Select a conversation to start messaging</div>
      <div style="font-size:13px;opacity:0.6;">Your messages will appear here</div>
    </div>`;
    return;
  }

  const t = utSelectedThread;
  const isReq = t.type === 'request';
  const status = isReq ? (t.status || 'Pending') : null;
  const statusLower = (status || '').toLowerCase();
  const canCancel = isReq && statusLower === 'pending';

  const partner = getUtThreadPartner(t);
  const isGroupChat = Boolean(partner.isGroup || t.group_id);
  const partnerName = partner.name || 'Conversation';
  const partnerPresence = partner.id ? (utPresenceByUser[String(partner.id)] || {}) : {};
  const partnerOnline = Boolean(partnerPresence.isOnline);
  const presenceText = isGroupChat
    ? (getUtGroupMembersPreview(t) || `${(t.participants || []).length || 'Group'} members`)
    : (partnerOnline ? 'Online' : formatUtLastSeen(partnerPresence.lastSeen));
  const partnerInitial = partnerName.charAt(0).toUpperCase();
  const colors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316'];
  const colorIdx = partnerName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const avatarBg = colors[colorIdx];

  const sortedMessages = [...(t.messages || [])].sort((a, b) =>
    new Date(getUtMessageCreatedAt(a)) - new Date(getUtMessageCreatedAt(b))
  );
  const showTyping = Boolean(utTypingState.isTyping && String(utTypingState.typingUserId) === String(partner.id));
  const formatDateDivider = dateStr => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  };

  // Build message bubbles HTML
  const bubblesHtml = sortedMessages.map((msg, idx) => {
    const isMine   = getUtMessageSenderId(msg) === Number(user.id);
    const isSystem = msg.is_system;
    const prevMsg = sortedMessages[idx - 1];
    const startsGroup = !prevMsg ||
      prevMsg.is_system ||
      getUtMessageSenderId(prevMsg) !== getUtMessageSenderId(msg) ||
      Math.abs(new Date(getUtMessageCreatedAt(msg)) - new Date(getUtMessageCreatedAt(prevMsg))) > 5 * 60 * 1000;
    const createdAt = getUtMessageCreatedAt(msg);
    const seen = getUtMessageSeen(msg);
    const seenAt = getUtMessageSeenAt(msg);
    const timeStr  = createdAt ? new Date(createdAt).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    }) : '';
    const currentDay = createdAt ? new Date(createdAt).toDateString() : '';
    const previousDay = prevMsg ? new Date(getUtMessageCreatedAt(prevMsg)).toDateString() : '';
    const dateDivider = currentDay && currentDay !== previousDay
      ? `<div class="ut-chat-date-divider"><span>${escHtml(formatDateDivider(createdAt))}</span></div>`
      : '';
    const senderInitial = (msg.sender_name || 'U').charAt(0).toUpperCase();
    const senderColors  = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316'];
    const sIdx = (msg.sender_name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % senderColors.length;
    const sBg = senderColors[sIdx];

    if (isSystem) {
      const sLower = (msg.status || '').toLowerCase();
      const sIcon  = sLower === 'approved'
        ? '<i class="ri-checkbox-circle-fill ut-email-sys-icon approved"></i>'
        : sLower === 'rejected'
          ? '<i class="ri-close-circle-fill ut-email-sys-icon rejected"></i>'
          : '<i class="ri-information-line ut-email-sys-icon"></i>';
      return `${dateDivider}<div class="ut-chat-sys-row">${sIcon}<span class="ut-email-sys-body">${escHtml(msg.body)}</span><span class="ut-email-sys-time">${escHtml(timeStr)}</span></div>`;
    }

    const attachment = getUtAttachmentFromMessage(msg);
    const attachmentId = attachment ? registerUtAttachment(attachment) : '';
    const attachmentKind = attachment ? getUtAttachmentKind(attachment) : '';
    const isFile = Boolean(attachment);
    const isImg  = attachmentKind === 'image';
    const replyText = msg.reply_preview || msg.reply_body || msg.reply_to_body || msg.quoted_body || '';
    const replyName = msg.reply_sender_name || msg.reply_to_sender_name || 'Reply';
    const forwardedFrom = msg.forwarded_from || msg.forwarded_from_name || msg.original_sender_name || '';
    const replyHtml = replyText
      ? `<div class="ut-chat-reply-preview"><strong>${escHtml(replyName)}</strong><span>${escHtml(String(replyText))}</span></div>`
      : '';
    const forwardedHtml = forwardedFrom
      ? `<div class="ut-chat-forwarded"><i class="ri-share-forward-line"></i> Forwarded from ${escHtml(String(forwardedFrom))}</div>`
      : '';
    const attachMeta = attachment ? formatUtAttachmentSize(attachment.size) : '';
    const attachIcon = attachmentKind === 'pdf' ? 'ri-file-pdf-2-line'
      : attachmentKind === 'word' ? 'ri-file-word-line'
        : attachmentKind === 'excel' ? 'ri-file-excel-line'
          : attachmentKind === 'text' ? 'ri-file-text-line'
            : isImg ? 'ri-image-line' : 'ri-file-line';
    const attachHtml = isFile ? (isImg
      ? `<div class="ut-chat-img-wrap"><button type="button" class="ut-chat-img-preview-btn" data-attachment-id="${escHtml(attachmentId)}"><img src="${escHtml(attachment.url)}" class="ut-chat-img-preview" alt="${escHtml(attachment.name)}"></button><div class="ut-chat-attachment" data-attachment-id="${escHtml(attachmentId)}"><i class="${attachIcon}"></i><span class="ut-chat-attach-name">${escHtml(attachment.name)}${attachMeta ? `<small>${escHtml(attachMeta)}</small>` : ''}</span><button type="button" class="ut-chat-attach-dl" data-attachment-download="${escHtml(attachmentId)}" title="Download"><i class="ri-download-2-line"></i></button></div></div>`
      : `<button type="button" class="ut-chat-attachment" data-attachment-id="${escHtml(attachmentId)}"><i class="${attachIcon}"></i><span class="ut-chat-attach-name">${escHtml(attachment.name)}${attachMeta ? `<small>${escHtml(attachMeta)}</small>` : ''}</span><span class="ut-chat-attach-dl" data-attachment-download="${escHtml(attachmentId)}" title="Download"><i class="ri-download-2-line"></i></span></button>`
    ) : '';

    return `
      ${dateDivider}
      <div class="ut-chat-row ${isMine ? 'ut-chat-row-mine' : 'ut-chat-row-theirs'} ${startsGroup ? 'ut-chat-group-start' : ''}">
        ${!isMine ? `<div class="ut-chat-avatar" style="background:${sBg};">${startsGroup ? senderInitial : ''}</div>` : ''}
        <div class="ut-chat-bubble-wrap">
          ${isGroupChat && !isMine && startsGroup ? `<div class="ut-chat-sender-name">${escHtml(msg.sender_name || 'Unknown')}</div>` : ''}
          <div class="ut-chat-bubble ${isMine ? 'ut-chat-bubble-mine' : 'ut-chat-bubble-theirs'}">
            ${forwardedHtml}
            ${replyHtml}
            ${msg.body ? `<div class="ut-chat-text">${escHtml(msg.body).replace(/\n/g, '<br>')}</div>` : ''}
            ${attachHtml}
            <div class="ut-chat-inline-meta">
              <span>${escHtml(timeStr)}</span>
              ${isMine ? `<span class="ut-chat-checks" title="${seenAt ? `Seen ${escHtml(new Date(seenAt).toLocaleString())}` : 'Sent'}">${seen ? '&#10003;&#10003;' : '&#10003;'}</span>` : ''}
            </div>
          </div>
          <div class="ut-chat-message-meta">
            <span>${escHtml(timeStr)}</span>
            ${isMine ? `<span title="${seenAt ? `Seen ${escHtml(new Date(seenAt).toLocaleString())}` : 'Sent'}">${seen ? '&#10003;&#10003; Seen' : '&#10003; Sent'}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="ut-conv-wrap">

      <!-- ── Messenger Chat Header ── -->
      <div class="ut-chat-header">
        <button class="ut-back-btn" id="utConvBackBtn" aria-label="Back to conversations"><i class="ri-arrow-left-line"></i></button>
        <div class="ut-chat-header-avatar-wrap">
          ${isGroupChat ? getUtGroupAvatarHtml(t, avatarBg, 'ut-chat-header-avatar') : `<div class="ut-chat-header-avatar" style="background:${avatarBg};">${partnerInitial}</div>`}
          ${isGroupChat ? '' : `<span class="ut-status-presence-dot ${partnerOnline ? 'online' : 'offline'}"></span>`}
        </div>
        <div class="ut-chat-header-info">
          <div class="ut-chat-header-name">${escHtml(partnerName)}</div>
          ${status ? `<span class="ut-badge ut-badge-${statusLower}" style="margin-top:2px;">${escHtml(status)}</span>` : `<span class="ut-chat-presence ${partnerOnline ? 'online' : 'offline'}"><span></span> ${escHtml(presenceText)}</span>`}
        </div>
        <div class="ut-chat-header-actions">
          <button class="ut-icon-btn" title="Search in chat" aria-label="Search in chat"><i class="ri-search-line"></i></button>
          ${canCancel ? `<button class="ut-icon-btn danger" id="utConvCancelBtn" title="Cancel Request" aria-label="Cancel request"><i class="ri-close-circle-line"></i></button>` : ''}
          ${!isReq ? `<button class="ut-icon-btn danger" id="utConvDeleteBtn" title="Delete Conversation" aria-label="Delete conversation"><i class="ri-delete-bin-line"></i></button>` : ''}
          <button class="ut-icon-btn" title="More" aria-label="More options"><i class="ri-more-2-fill"></i></button>
        </div>
      </div>

      <!-- ── Chat Messages Area ── -->
      <div class="ut-messages-area ut-chat-area" id="utMessagesArea">
        ${bubblesHtml || '<div class="ut-chat-no-msgs"><i class="ri-chat-3-line"></i> No messages yet.</div>'}
        ${showTyping ? `<div class="ut-typing-indicator"><span>${escHtml(partnerName)} is typing</span><i></i><i></i><i></i></div>` : ''}
        <div id="utMessagesEnd"></div>
      </div>

      <!-- ── Fixed Bottom Input Bar ── -->
      ${!isReq ? `
      <div class="ut-chat-input-bar">
        <button class="ut-emoji-btn" id="utEmojiBtn" type="button" title="Emoji" aria-label="Emoji"><i class="ri-emotion-line"></i></button>
        <label class="ut-attach-btn" id="utChatAttachLabel" title="Attach file" aria-label="Attach file">
          <i class="ri-attachment-2"></i>
          <input type="file" id="utChatFile" style="display:none;" accept="*/*">
        </label>
        <div class="ut-chat-input-wrap">
          <textarea id="utChatInput" class="ut-chat-textarea" placeholder="Write a message..." rows="1"></textarea>
          <span class="ut-file-chip" id="utFileChip" style="display:none;"></span>
        </div>
        <div class="ut-emoji-picker" id="utEmojiPicker" hidden>
          ${['😀','😁','😂','😊','😍','😎','🙂','😅','👍','👏','🙏','💪','🔥','✨','🎉','❤️','✅','📎','💬','🚀'].map(emoji => `<button type="button" class="ut-emoji-option" data-emoji="${emoji}">${emoji}</button>`).join('')}
        </div>
        <button class="ut-chat-send-btn" id="utChatSendBtn" aria-label="Send message" disabled><i class="ri-send-plane-fill"></i></button>
      </div>
      ` : ''}
    </div>
  `;

  setTimeout(() => scrollUtMessagesToBottom(scrollBehavior), 0);

  panel.querySelectorAll('[data-attachment-id]').forEach(el => {
    el.addEventListener('click', e => {
      const downloadTarget = e.target.closest('[data-attachment-download]');
      if (downloadTarget) return;
      const attachment = utAttachmentRegistry.get(el.dataset.attachmentId);
      if (attachment) previewAttachment(attachment);
    });
  });

  panel.querySelectorAll('[data-attachment-download]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const attachment = utAttachmentRegistry.get(el.dataset.attachmentDownload);
      if (attachment) downloadAttachment(attachment);
    });
  });

  document.getElementById('utConvBackBtn')?.addEventListener('click', () => {
    utSelectedThread   = null;
    utSelectedThreadId = null;
    utView = 'list';
    utTypingState = { isTyping: false, typingUserId: null };
    clearTimeout(utTypingIdleTimer);
    emitUtTyping(false);
    if (utRealtimeTimer) { clearInterval(utRealtimeTimer); utRealtimeTimer = null; }
    document.querySelector('.ut-shell')?.classList.remove('ut-mobile-thread-open');
    renderUtConversationPane();
    document.querySelectorAll('.ut-thread-row').forEach(r => r.classList.remove('active'));
  });

  document.getElementById('utConvDeleteBtn')?.addEventListener('click', async () => {
    if (!t.raw?.id) return;
    if (!confirm('Delete this conversation?')) return;
    const msgId = t.raw.id;
    const threadId = utSelectedThreadId;
    const selectedParticipantIds = new Set(
      (utSelectedThread?.messages || [])
        .flatMap(msg => [String(msg.sender_id), String(msg.recipient_id)])
        .filter(Boolean)
    );
    const isSameDeletedConversation = th => {
      if (String(th.thread_id) === String(threadId)) return true;
      if (t.group_id) return String(th.group_id || '') === String(t.group_id);
      return selectedParticipantIds.has(String(th.sender_id)) && selectedParticipantIds.has(String(th.recipient_id));
    };
    const previousThreads = [...utThreads];
    utThreads = utThreads.filter(th => !isSameDeletedConversation(th));
    utSelectedThread = null;
    utSelectedThreadId = null;
    utView = 'list';
    const convBody = document.getElementById('utConversationBody');
    if (convBody) convBody.innerHTML = `<div class="ut-empty-state"><i class="ri-chat-3-line"></i><div>Select a conversation</div></div>`;
    renderUtThreadList();
    try {
      const res = await fetch(`/api/messages/${msgId}?user_id=${user.id}`, { method: 'DELETE' });
      if (!res.ok) {
        utThreads = previousThreads;
        renderUtThreadList();
        showToast('Delete failed.', 'error');
        loadUnifiedInbox();
        return;
      }
      showToast('Conversation deleted.', 'success');
      loadUnifiedInbox();
    } catch {
      utThreads = previousThreads;
      renderUtThreadList();
      showToast('Network error.', 'error');
      loadUnifiedInbox();
    }
  });

  document.getElementById('utConvCancelBtn')?.addEventListener('click', async () => {
    if (!confirm('Cancel this request?')) return;
    const btn = document.getElementById('utConvCancelBtn');
    btn.disabled = true;
    const reqType = t.req_type;
    const reqId   = t.raw?.id;
    try {
      const res  = await fetch(`/api/users/${user.id}/my-requests/${reqType}/${reqId}/cancel`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || 'Cancel failed.', 'error'); return; }
      showToast('Request cancelled.', 'success');
      utSelectedThread = null; utSelectedThreadId = null;
      loadUnifiedInbox();
    } catch { showToast('Network error.', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── File attach
  let _pendingFile = null;
  document.getElementById('utChatAttachLabel')?.addEventListener('click', e => {
    if (e.target?.id === 'utChatFile') return;
    e.preventDefault();
    document.getElementById('utChatFile')?.click();
  });
  document.getElementById('utChatFile')?.addEventListener('change', function() {
    _pendingFile = this.files?.[0] || null;
    const chip = document.getElementById('utFileChip');
    if (chip) {
      chip.textContent = _pendingFile ? _pendingFile.name : '';
      chip.style.display = _pendingFile ? 'inline-flex' : 'none';
    }
    updateSendButton();
  });

  // ── Auto-resize textarea
  const chatInput = document.getElementById('utChatInput');
  const updateSendButton = () => {
    const sendBtn = document.getElementById('utChatSendBtn');
    if (!sendBtn) return;
    const hasText = Boolean((document.getElementById('utChatInput')?.value || '').trim());
    sendBtn.disabled = !hasText && !_pendingFile;
  };
  if (chatInput) {
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      updateSendButton();
      const now = Date.now();
      if (now - utLastTypingEmitAt > 300) {
        utLastTypingEmitAt = now;
        emitUtTyping(true);
      }
      clearTimeout(utTypingIdleTimer);
      utTypingIdleTimer = setTimeout(() => emitUtTyping(false), 1500);
    });
    // Send on Enter (Shift+Enter = newline)
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('utChatSendBtn')?.click();
      }
    });
  }

  const emojiBtn = document.getElementById('utEmojiBtn');
  const emojiPicker = document.getElementById('utEmojiPicker');
  const closeEmojiPicker = () => {
    if (emojiPicker) emojiPicker.hidden = true;
  };
  emojiBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (emojiPicker) emojiPicker.hidden = !emojiPicker.hidden;
  });
  emojiPicker?.addEventListener('click', e => {
    const option = e.target.closest('.ut-emoji-option');
    if (!option || !chatInput) return;
    const emoji = option.dataset.emoji || '';
    const start = chatInput.selectionStart ?? chatInput.value.length;
    const end = chatInput.selectionEnd ?? chatInput.value.length;
    chatInput.value = `${chatInput.value.slice(0, start)}${emoji}${chatInput.value.slice(end)}`;
    const nextPos = start + emoji.length;
    chatInput.focus();
    chatInput.setSelectionRange(nextPos, nextPos);
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    closeEmojiPicker();
  });
  document.addEventListener('click', e => {
    if (!emojiPicker || emojiPicker.hidden) return;
    if (emojiPicker.contains(e.target) || emojiBtn?.contains(e.target)) return;
    closeEmojiPicker();
  });

  // ── Send message from bottom bar
  document.getElementById('utChatSendBtn')?.addEventListener('click', async () => {
    const inputEl = document.getElementById('utChatInput');
    const text = (inputEl?.value || '').trim();
    if (!text && !_pendingFile) return;
    clearTimeout(utTypingIdleTimer);
    emitUtTyping(false);

    const threadPartner = getUtThreadPartner(t);
    const recipientIds = threadPartner.isGroup
      ? (t.participants || []).map(p => Number(p.id)).filter(id => id && id !== Number(user.id))
      : [Number(threadPartner.id)];
    const recipientId = recipientIds[0];
    if (!recipientIds.length) {
      showToast('Could not determine the recipient.', 'error');
      return;
    }

    const sendBtn = document.getElementById('utChatSendBtn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="ri-loader-4-line spin"></i>'; }

    const fileToSend = _pendingFile;
    const optimisticAttachmentUrl = fileToSend ? URL.createObjectURL(fileToSend) : null;
    const createdAt = new Date().toISOString();
    const tempId = `tmp_${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      sender_id: Number(user.id),
      senderId: Number(user.id),
      sender_name: user.full_name || user.email || 'You',
      recipient_id: Number(recipientId),
      group_id: t.group_id || null,
      group_name: t.group_name || null,
      group_photo: t.group_photo || null,
      body: text,
      attachment_name: fileToSend?.name || null,
      attachment_path: optimisticAttachmentUrl,
      attachment_type: fileToSend?.type || '',
      attachment_size: fileToSend?.size || null,
      attachment: fileToSend ? {
        name: fileToSend.name,
        type: fileToSend.type,
        size: fileToSend.size,
        url: optimisticAttachmentUrl
      } : null,
      created_at: createdAt,
      createdAt,
      seen: false,
      seenAt: null,
      is_system: false
    };

    if (utSelectedThread) {
      utSelectedThread.messages = [...(utSelectedThread.messages || []), optimisticMessage];
    }
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    _pendingFile = null;
    const chip = document.getElementById('utFileChip');
    if (chip) { chip.style.display = 'none'; chip.textContent = ''; }
    const fileInput = document.getElementById('utChatFile');
    if (fileInput) fileInput.value = '';
    renderUtConversationPane(null, 'smooth');

    try {
      let result;
      if (fileToSend) {
        const fd = new FormData();
        fd.append('sender_id', String(user.id));
        fd.append('recipient_id', String(recipientId));
        fd.append('recipient_ids', JSON.stringify(recipientIds));
        fd.append('group_id', t.group_id || '');
        fd.append('group_name', t.group_name || '');
        fd.append('group_photo', t.group_photo || '');
        fd.append('subject', t.title || 'Chat');
        fd.append('body', text || '');
        fd.append('parent_message_id', t.raw?.id ? String(t.raw.id) : '');
        fd.append('attachment', fileToSend);
        const res = await fetch('/api/messages/with-attachment', { method: 'POST', body: fd });
        result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Send failed');
      } else {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_id: Number(user.id),
            recipient_id: Number(recipientId),
            recipient_ids: recipientIds,
            group_id: t.group_id || null,
            group_name: t.group_name || null,
            group_photo: t.group_photo || null,
            subject: t.title || 'Chat',
            body: text,
            parent_message_id: t.raw?.id ? Number(t.raw.id) : null
          })
        });
        result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Send failed');
      }

      if (utSelectedThread) {
        const resultMessage = Array.isArray(result.messages) ? result.messages[0] : result;
        const savedMessage = {
          ...optimisticMessage,
          ...resultMessage,
          sender_id: Number(resultMessage.sender_id ?? user.id),
          senderId: Number(resultMessage.sender_id ?? user.id),
          sender_name: user.full_name || user.email || 'You',
          recipient_id: Number(resultMessage.recipient_id ?? recipientId),
          attachment_name: resultMessage.attachment_name || optimisticMessage.attachment_name,
          attachment_path: resultMessage.attachment_path || optimisticMessage.attachment_path,
          attachment_type: resultMessage.attachment_type || optimisticMessage.attachment_type,
          attachment_size: resultMessage.attachment_size || optimisticMessage.attachment_size,
          attachment: {
            name: resultMessage.attachment_name || optimisticMessage.attachment_name,
            type: resultMessage.attachment_type || optimisticMessage.attachment_type || '',
            size: resultMessage.attachment_size || optimisticMessage.attachment_size || null,
            url: resultMessage.attachment_path || optimisticMessage.attachment_path
          },
          created_at: resultMessage.created_at || optimisticMessage.created_at,
          createdAt: resultMessage.created_at || optimisticMessage.created_at,
          seen: Boolean(resultMessage.seen ?? resultMessage.is_read ?? false),
          seenAt: resultMessage.seenAt || resultMessage.seen_at || null,
          is_system: false
        };
        utSelectedThread.messages = (utSelectedThread.messages || []).map(msg =>
          String(msg.id) === String(tempId) ? savedMessage : msg
        );
      }

      const updatedAt = result.created_at || optimisticMessage.created_at;
      utThreads = utThreads.map(thread => String(thread.thread_id) === String(utSelectedThreadId)
        ? { ...thread, summary: text || fileToSend?.name || 'Attachment', updated_at: updatedAt }
        : thread
      ).sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
      renderUtThreadList();
    } catch (err) {
      if (utSelectedThread) {
        utSelectedThread.messages = (utSelectedThread.messages || []).filter(msg => String(msg.id) !== String(tempId));
        renderUtConversationPane();
      }
      showToast(err.message || 'Failed to send.', 'error');
    } finally {
      const btn = document.getElementById('utChatSendBtn');
      if (btn) { btn.innerHTML = '<i class="ri-send-plane-fill"></i>'; updateSendButton(); }
    }
  });
}

function renderUtComposeView(container, existingDraft = null) {
  const defaultRecipient = existingDraft?.recipient_id || (stgReplyToMessage ? stgReplyToMessage.sender_id : '');

  container.innerHTML = `
    <div class="ut-conv-wrap">
      <!-- New Chat Header -->
      <div class="ut-chat-header">
        <button class="ut-back-btn" id="utComposeBackBtn"><i class="ri-arrow-left-line"></i></button>
        <div class="ut-chat-header-info" style="flex:1;">
          <div class="ut-chat-header-name"><i class="ri-edit-line" style="margin-right:6px;font-size:14px;"></i>New Message</div>
        </div>
      </div>

      <!-- Person selector -->
      <div class="ut-new-chat-to">
        <span class="ut-new-chat-to-label">To:</span>
        <select id="utMsgRecipient" class="ut-new-chat-select" ${stgUsers.length ? '' : 'disabled'}>
          <option value="">${stgUsers.length ? 'Choose someone&hellip;' : 'No users available'}</option>
          ${stgUsers.map(u => `
            <option value="${u.id}" ${Number(defaultRecipient) === Number(u.id) ? 'selected' : ''}>
              ${escHtml(u.full_name || u.email)}${u.role ? ` · ${escHtml(u.role)}` : ''}
            </option>`).join('')}
        </select>
      </div>

      <!-- Empty message area placeholder -->
      <div class="ut-messages-area ut-chat-area" style="flex:1;justify-content:center;align-items:center;">
        <div style="text-align:center;color:#94a3b8;font-size:13px;">
          <i class="ri-chat-new-line" style="font-size:40px;opacity:0.3;display:block;margin-bottom:8px;"></i>
          Choose a recipient and type your first message below
        </div>
      </div>

      <!-- Fixed bottom input -->
      <div class="ut-chat-input-bar">
        <label class="ut-attach-btn" id="utFileAttachLabel" title="Attach file">
          <i class="ri-attachment-2"></i>
          <input type="file" id="utMsgAttachment" style="display:none;" accept="*/*">
        </label>
        <div class="ut-chat-input-wrap">
          <textarea id="utMsgBody" class="ut-chat-textarea" placeholder="Write a message…" rows="1">${escHtml(existingDraft?.body || '')}</textarea>
          <span class="ut-file-chip" id="utFileChip" style="display:none;"></span>
        </div>
        <button class="ut-chat-send-btn" id="utComposeSendBtn"><i class="ri-send-plane-fill"></i></button>
      </div>
    </div>
  `;

  document.getElementById('utComposeBackBtn')?.addEventListener('click', () => {
    stgReplyToMessage = null;
    utView = utSelectedThread ? 'thread' : 'list';
    renderUtConversationPane();
  });

  // Auto-resize
  const bodyEl = document.getElementById('utMsgBody');
  if (bodyEl) {
    bodyEl.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    bodyEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('utComposeSendBtn')?.click();
      }
    });
  }

  // File attach
  let _pendingFile = null;
  document.getElementById('utMsgAttachment')?.addEventListener('change', function() {
    _pendingFile = this.files?.[0] || null;
    const chip = document.getElementById('utFileChip');
    if (chip) { chip.textContent = _pendingFile?.name || ''; chip.style.display = _pendingFile ? 'inline-flex' : 'none'; }
  });

  document.getElementById('utComposeSendBtn')?.addEventListener('click', async () => {
    const recipientSelect = document.getElementById('utMsgRecipient');
    const recipientIds = recipientSelect?.value ? [Number(recipientSelect.value)].filter(Boolean) : [];
    const recipient_id = recipientIds[0];
    const body         = (document.getElementById('utMsgBody')?.value || '').trim();
    const btn          = document.getElementById('utComposeSendBtn');

    if (!recipientIds.length) { showToast('Please select at least one recipient.', 'error'); return; }
    if (!body && !_pendingFile) { showToast('Please write a message or attach a file.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i>';

    try {
      let result;
      if (_pendingFile) {
        const fd = new FormData();
        fd.append('sender_id', String(user.id));
        fd.append('recipient_id', String(recipient_id));
        fd.append('subject', 'Chat');
        fd.append('body', body);
        fd.append('attachment', _pendingFile);
        const res = await fetch('/api/messages/with-attachment', { method: 'POST', body: fd });
        result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Send failed');
      } else {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_id: Number(user.id),
            recipient_id: Number(recipient_id),
            recipient_ids: recipientIds,
            group_name: recipientIds.length > 1 ? buildUtGroupName(recipientIds) : null,
            subject: 'Chat',
            body,
            parent_message_id: null
          })
        });
        result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Send failed');
      }

      const recipientUser = stgUsers.find(u => Number(u.id) === Number(recipient_id));
      const groupName = recipientIds.length > 1 ? buildUtGroupName(recipientIds) : null;
      const optimisticThread = {
        thread_id: result.group_id ? `grp_${result.group_id}` : `msg_${result.id}`,
        type: 'message',
        title: groupName || 'Chat',
        summary: body.slice(0, 120),
        sender_id: Number(user.id),
        sender_name: user.full_name || 'You',
        recipient_id: Number(recipient_id),
        recipient_name: recipientUser ? (recipientUser.full_name || recipientUser.email) : 'Unknown',
        group_id: result.group_id || null,
        group_name: groupName,
        is_read: true,
        created_at: result.created_at || new Date().toISOString(),
        updated_at: result.created_at || new Date().toISOString(),
        raw: result,
      };
      utThreads = [optimisticThread, ...utThreads.filter(t => t.thread_id !== optimisticThread.thread_id)];

      stgReplyToMessage = null;
      utView = 'list';
      utFolder = 'inbox';
      utFilter = 'messages';
      showToast('Message sent!', 'success');
      renderUnifiedInbox();
      loadUnifiedInbox();
    } catch (err) {
      showToast(err.message || 'Network error.', 'error');
    } finally {
      const b = document.getElementById('utComposeSendBtn');
      if (b) { b.disabled = false; b.innerHTML = '<i class="ri-send-plane-fill"></i>'; }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   RELATIVE TIME HELPER
═══════════════════════════════════════════════════════════ */

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

async function loadStgMessagingData() {
  try {
    const [usersRes, inboxRes, sentRes] = await Promise.all([
      fetch(`/api/users?exclude=${user.id}`),
      fetch(`/api/messages?user_id=${user.id}&folder=inbox`),
      fetch(`/api/messages?user_id=${user.id}&folder=sent`)
    ]);

    const usersData = await usersRes.json().catch(() => []);
    const inboxData = await inboxRes.json().catch(() => []);
    const sentData = await sentRes.json().catch(() => []);

    if (!usersRes.ok) throw new Error(usersData?.error || 'Failed to load users');
    if (!inboxRes.ok) throw new Error(inboxData?.error || 'Failed to load inbox');
    if (!sentRes.ok) throw new Error(sentData?.error || 'Failed to load sent');

    stgUsers = Array.isArray(usersData) ? usersData : [];

    const merged = [...inboxData, ...sentData];
    stgMessages = Array.from(new Map(merged.map(m => [String(m.id), m])).values());

    stgConversations = buildStgChatConversations();

    if (!stgSelectedConversationId && stgConversations.length) {
      stgSelectedConversationId = String(stgConversations[0].user.id);
    }

    renderStgMessagingLayout();
  } catch (err) {
    const mount = document.getElementById('stgMessagingMount');
    if (mount) {
      mount.innerHTML = `
        <div class="stg-msg-empty">
          <i class="ri-error-warning-line"></i>
          <div>${escHtml(err.message || 'Failed to load messages.')}</div>
        </div>
      `;
    }
  }
}

function buildStgChatConversations() {
  const currentUserId = Number(user.id);
  const map = new Map();

  stgMessages.forEach(msg => {
    const senderId = Number(msg.sender_id);
    const recipientId = Number(msg.recipient_id);
    const isMine = senderId === currentUserId;
    const otherId = isMine ? recipientId : senderId;

    const existingUser = stgUsers.find(u => Number(u.id) === otherId);
    const fallbackName = isMine
      ? (msg.recipient_name || msg.recipient_email || 'Unknown')
      : (msg.sender_name || msg.sender_email || 'Unknown');

    if (!map.has(otherId)) {
      map.set(otherId, {
        user: existingUser || { id: otherId, full_name: fallbackName },
        messages: []
      });
    }

    map.get(otherId).messages.push({
      ...msg,
      senderId,
      receiverId: recipientId,
      text: msg.body || '',
      createdAt: msg.created_at
    });
  });

  return Array.from(map.values()).map(conv => {
    conv.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    conv.lastMessage = conv.messages[conv.messages.length - 1];
    return conv;
  }).sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
}

function getStgChatName(u) {
  return u?.full_name || u?.email || 'Unknown';
}

function getStgSelectedConversation() {
  return stgConversations.find(c => String(c.user.id) === String(stgSelectedConversationId)) || null;
}

function stgUserDisplayName(u) {
  return u?.full_name || u?.email || 'Unknown';
}

function stgUserInitials(name) {
  return String(name || 'U')
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}

function renderStgMessagingLayout() {
  const mount = document.getElementById('stgMessagingMount');
  if (!mount) return;

  const selected = stgConversations.find(c => String(c.user.id) === String(stgSelectedConversationId));

  mount.innerHTML = `
    <div class="stg-chat-shell">
      <aside class="stg-chat-left">
        <div class="stg-chat-title">
          <h3>Messages</h3>
          <button id="stgMsgRefreshBtn" title="Refresh"><i class="ri-refresh-line"></i></button>
        </div>

        <div class="stg-chat-list">
          ${stgConversations.map(conv => `
            <button class="stg-chat-user ${String(conv.user.id) === String(stgSelectedConversationId) ? 'active' : ''}"
                    data-user-id="${conv.user.id}">
              <div class="stg-chat-avatar">${escHtml(getStgChatName(conv.user).charAt(0).toUpperCase())}</div>
              <div class="stg-chat-user-info">
                <strong>${escHtml(getStgChatName(conv.user))}</strong>
                <span>${escHtml(conv.lastMessage?.text || '')}</span>
              </div>
              <small>${conv.lastMessage ? escHtml(relativeTime(conv.lastMessage.createdAt)) : ''}</small>
            </button>
          `).join('')}
        </div>
      </aside>

      <section class="stg-chat-right">
        ${selected ? `
          <div class="stg-chat-header">
            <div class="stg-chat-avatar">${escHtml(getStgChatName(selected.user).charAt(0).toUpperCase())}</div>
            <div>
              <h3>${escHtml(getStgChatName(selected.user))}</h3>
              <span>Conversation</span>
            </div>
          </div>

          <div class="stg-chat-body" id="stgChatBody">
            ${selected.messages.map(message => {
              const isMine = Number(message.senderId) === Number(user.id);
              return `
                <div class="stg-chat-msg ${isMine ? 'mine' : 'theirs'}">
                  <div class="stg-chat-bubble">
                    <div>${escHtml(message.text || '').replace(/\n/g, '<br>')}</div>
                    <small>${escHtml(new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</small>
                  </div>
                </div>
              `;
            }).join('')}
            <div id="stgMessagesEnd"></div>
          </div>

          <div class="stg-chat-input">
            <textarea id="stgChatInput" placeholder="Write a message..." rows="1"></textarea>
            <button id="stgChatSendBtn"><i class="ri-send-plane-fill"></i></button>
          </div>
        ` : `
          <div class="stg-msg-empty">
            <i class="ri-chat-3-line"></i>
            <div>No conversation selected.</div>
          </div>
        `}
      </section>
    </div>
  `;

  document.getElementById('stgMsgRefreshBtn')?.addEventListener('click', loadStgMessagingData);

  mount.querySelectorAll('.stg-chat-user').forEach(btn => {
    btn.addEventListener('click', () => {
      stgSelectedConversationId = btn.dataset.userId;
      renderStgMessagingLayout();
    });
  });

  document.getElementById('stgChatSendBtn')?.addEventListener('click', () => sendStgChatMessage());
  document.getElementById('stgChatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendStgChatMessage();
    }
  });

  setTimeout(() => {
    const area = document.getElementById('stgChatBody');
    if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  }, 50);
}

async function markConversationAsRead(conversation) {
  const unreadMessages = conversation.messages.filter(msg => {
    return !msg.isMine && !msg.is_read && Number(msg.recipient_id) === Number(user.id);
  });

  if (!unreadMessages.length) return;

  conversation.unreadCount = 0;
  conversation.messages = conversation.messages.map(msg => ({ ...msg, is_read: true }));
  stgMessages = stgMessages.map(msg => {
    const shouldMark = unreadMessages.some(unread => Number(unread.id) === Number(msg.id));
    return shouldMark ? { ...msg, is_read: true } : msg;
  });

  await Promise.allSettled(unreadMessages.map(msg => {
    return fetch(`/api/messages/${msg.id}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, is_read: true })
    });
  }));
}

function renderStgChatWindow(container, conversation) {
  const displayName = stgUserDisplayName(conversation.user);
  const messages = [...conversation.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  container.innerHTML = `
    <div class="stg-chat-window">
      <header class="stg-chat-header">
        <div class="stg-chat-header-user">
          <div class="stg-msg-avatar">${escHtml(stgUserInitials(displayName))}</div>
          <div>
            <h3>${escHtml(displayName)}</h3>
            <p>${conversation.user.role ? escHtml(conversation.user.role) : 'Available'}</p>
          </div>
        </div>
      </header>

      <div class="stg-chat-body" id="stgChatBody">
        ${messages.length ? messages.map(message => {
          const isMine = Number(message.senderId) === Number(user.id);
          return `
            <div class="stg-chat-message ${isMine ? 'mine' : 'theirs'}">
              <div class="stg-chat-bubble">
                <div class="stg-chat-text">${escHtml(message.text || '').replace(/\n/g, '<br>')}</div>
                <div class="stg-chat-msg-time">${escHtml(new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</div>
              </div>
            </div>
          `;
        }).join('') : `
          <div class="stg-chat-start">
            <i class="ri-chat-smile-2-line"></i>
            <strong>No messages yet</strong>
            <span>Send the first message to ${escHtml(displayName)}.</span>
          </div>
        `}
        <div id="stgMessagesEnd"></div>
      </div>

      <footer class="stg-chat-inputbar">
        <button type="button" class="stg-chat-icon-btn" id="stgAttachmentBtn" aria-label="Attach file">
          <i class="ri-attachment-2"></i>
        </button>
        <textarea id="stgChatInput" rows="1" placeholder="Write a message..."></textarea>
        <button type="button" class="stg-chat-send-btn" id="stgChatSendBtn" aria-label="Send message" disabled>
          <i class="ri-send-plane-fill"></i>
        </button>
      </footer>
    </div>
  `;

  const input = document.getElementById('stgChatInput');
  const sendBtn = document.getElementById('stgChatSendBtn');

  const updateSendState = () => {
    if (!sendBtn || !input) return;
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  };

  input?.addEventListener('input', updateSendState);

  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendStgChatMessage(conversation);
    }
  });

  sendBtn?.addEventListener('click', () => sendStgChatMessage(conversation));

  document.getElementById('stgAttachmentBtn')?.addEventListener('click', () => {
    showToast('Attachment UI is ready, but upload handling is not connected yet.', 'error');
  });

  updateSendState();
  scrollStgChatToBottom(false);
}

async function sendStgChatMessage(conversation) {
  const input = document.getElementById('stgChatInput');
  const sendBtn = document.getElementById('stgChatSendBtn');
  const text = input?.value.trim();

  if (!text) return;

  const receiverId = Number(conversation.user.id);

  if (receiverId === Number(user.id)) {
    showToast('You cannot reply to system notifications.', 'error');
    return;
  }

  const tempId = `temp_${Date.now()}`;
  const optimisticMessage = {
    id: tempId,
    sender_id: Number(user.id),
    recipient_id: receiverId,
    senderId: Number(user.id),
    receiverId,
    sender_name: user.full_name || user.email || 'You',
    recipient_name: stgUserDisplayName(conversation.user),
    subject: 'Chat',
    body: text,
    text,
    isMine: true,
    is_read: true,
    created_at: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  conversation.messages.push(optimisticMessage);
  conversation.lastMessage = optimisticMessage;
  stgMessages.push(optimisticMessage);

  input.value = '';
  if (sendBtn) sendBtn.disabled = true;

  renderStgMessagingLayout();
  scrollStgChatToBottom(true);

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: Number(user.id),
        recipient_id: receiverId,
        subject: 'Chat',
        body: text,
        parent_message_id: null
      })
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(result.error || 'Failed to send message.');
    }

    const savedMessage = {
      ...optimisticMessage,
      ...result,
      id: result.id,
      senderId: Number(result.sender_id || user.id),
      receiverId: Number(result.recipient_id || receiverId),
      text: result.body || text,
      createdAt: result.created_at || optimisticMessage.createdAt,
      isMine: true,
    };

    stgMessages = stgMessages.map(msg => String(msg.id) === String(tempId) ? savedMessage : msg);
    stgConversations = buildStgConversations(stgMessages);
    stgSelectedConversationId = String(receiverId);

    renderStgMessagingLayout();
    scrollStgChatToBottom(true);
  } catch (err) {
    stgMessages = stgMessages.filter(msg => String(msg.id) !== String(tempId));
    stgConversations = buildStgConversations(stgMessages);
    stgSelectedConversationId = String(receiverId);
    renderStgMessagingLayout();
    showToast(err.message || 'Network error.', 'error');
  }
}

async function sendStgChatMessage() {
  const input = document.getElementById('stgChatInput');
  const body = input?.value.trim();
  if (!body || !stgSelectedConversationId) return;

  const recipientId = Number(stgSelectedConversationId);

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: Number(user.id),
        recipient_id: recipientId,
        subject: 'Chat',
        body,
        parent_message_id: null
      })
    });

    const saved = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(saved.error || 'Failed to send message');

    stgMessages.push(saved);
    stgConversations = buildStgChatConversations();

    input.value = '';
    renderStgMessagingLayout();
  } catch (err) {
    showToast(err.message || 'Network error.', 'error');
  }
}

function scrollStgChatToBottom(smooth = true) {
  setTimeout(() => {
    const area = document.getElementById('stgChatBody');
    if (area) area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, 40);
}

/* Legacy wrappers kept so older Settings links do not break */
function renderStgMessageList(container) {
  renderStgMessagingLayout();
}

function renderStgMessageView(container, msg) {
  renderStgMessagingLayout();
}

function renderStgComposeView(container) {
  renderStgMessagingLayout();
}

function renderStgMessageList(container) {
  const items = stgMessages || [];
  const activeFilter = stgRequestFilter;
  stgRequestFilter = null; // clear after first render

  if (!items.length) {
    container.innerHTML = `
      <div class="stg-msg-empty">
        <i class="ri-mail-open-line"></i>
        <div>No messages in ${escHtml(stgMessageFolder)}.</div>
        <button class="stg-outline-btn" id="stgMsgRefreshBtn" style="margin-top:12px;">
          <i class="ri-refresh-line"></i> Refresh
        </button>
      </div>
    `;
    document.getElementById('stgMsgRefreshBtn')?.addEventListener('click', () => loadStgMessagingData());
    return;
  }

  container.innerHTML = `
    <div class="stg-msg-list">
      ${items.map(msg => {
        const counterpartName = stgMessageFolder === 'sent'
          ? (msg.recipient_name || msg.recipient_email || 'Unknown')
          : (msg.sender_name || msg.sender_email || 'Unknown');

        const preview = String(msg.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const dateText = new Date(msg.created_at).toLocaleString();
        const isRequestMsg = msg.subject && msg.subject.startsWith('[');
        const isHighlighted = activeFilter && msg.subject && msg.subject.includes(activeFilter);

        return `
          <div class="stg-msg-row ${!msg.is_read && stgMessageFolder === 'inbox' ? 'unread' : ''} ${isHighlighted ? 'stg-msg-row-highlighted' : ''}" data-id="${msg.id}">
            <div class="stg-msg-row-left">
              <div class="stg-msg-avatar ${isRequestMsg ? 'stg-msg-avatar-system' : ''}">${isRequestMsg ? '<i class="ri-file-list-3-line"></i>' : String(counterpartName).trim().charAt(0).toUpperCase()}</div>
              <div class="stg-msg-meta">
                <div class="stg-msg-topline">
                  <span class="stg-msg-sender">${escHtml(counterpartName)}</span>
                  <span class="stg-msg-date">${escHtml(dateText)}</span>
                </div>
                <div class="stg-msg-subject">${escHtml(msg.subject || '(No subject)')}${isRequestMsg ? ' <span class="stg-msg-req-tag">Request</span>' : ''}</div>
                <div class="stg-msg-preview">${escHtml(preview || 'No preview available')}</div>
              </div>
            </div>
            <div class="stg-msg-status-dot ${!msg.is_read && stgMessageFolder === 'inbox' ? 'unread' : 'read'}"></div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Auto-scroll to highlighted row if jumping from My Requests
  if (activeFilter) {
    const highlighted = container.querySelector('.stg-msg-row-highlighted');
    if (highlighted) setTimeout(() => highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  container.querySelectorAll('.stg-msg-row').forEach(row => {
    row.addEventListener('click', async () => {
      const msgId = row.dataset.id;

      try {
        const res = await fetch(`/api/messages/${msgId}?user_id=${user.id}`);
        const full = await res.json();
        if (!res.ok) {
          showToast(full.error || 'Failed to open message.', 'error');
          return;
        }

        stgSelectedMessage = full;
        stgMessagingView = 'read';

        if (stgMessageFolder === 'inbox' && !full.is_read) {
          await fetch(`/api/messages/${msgId}/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, is_read: true })
          }).catch(() => {});
          full.is_read = true;
          stgMessages = stgMessages.map(m => String(m.id) === String(msgId) ? { ...m, is_read: true } : m);
        }

        renderStgMessagingLayout();
      } catch {
        showToast('Network error.', 'error');
      }
    });
  });
}

function renderStgMessageView(container, msg) {
  const isInbox = Number(msg.recipient_id) === Number(user.id);
  const otherName = isInbox
    ? (msg.sender_name || msg.sender_email || 'Unknown')
    : (msg.recipient_name || msg.recipient_email || 'Unknown');

  container.innerHTML = `
    <div class="stg-msg-view">
      <div class="stg-msg-view-toolbar">
        <div class="stg-msg-view-actions">
          <button class="stg-outline-btn" id="stgMsgBackBtn"><i class="ri-arrow-left-line"></i> Back</button>
          ${isInbox ? `<button class="stg-outline-btn" id="stgMsgReplyBtn"><i class="ri-reply-line"></i> Reply</button>` : ''}
          <button class="stg-outline-btn" id="stgMsgToggleReadBtn">
            <i class="ri-mail-${msg.is_read ? 'unread' : 'open'}-line"></i>
            ${msg.is_read ? 'Mark unread' : 'Mark read'}
          </button>
          <button class="stg-delete-btn" id="stgMsgDeleteBtn"><i class="ri-delete-bin-line"></i> Delete</button>
        </div>
      </div>

      <div class="stg-msg-read-card">
        <div class="stg-msg-read-subject">${escHtml(msg.subject || '(No subject)')}</div>
        <div class="stg-msg-read-meta">
          <div><strong>${isInbox ? 'From' : 'To'}:</strong> ${escHtml(otherName)}</div>
          <div><strong>${isInbox ? 'To' : 'From'}:</strong> ${escHtml(isInbox ? (msg.recipient_name || msg.recipient_email || user.email) : (msg.sender_name || msg.sender_email || user.email))}</div>
          <div><strong>Date:</strong> ${escHtml(new Date(msg.created_at).toLocaleString())}</div>
        </div>
        <div class="stg-msg-read-body">${escHtml(msg.body || '').replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;

  document.getElementById('stgMsgBackBtn')?.addEventListener('click', () => {
    stgMessagingView = 'list';
    renderStgMessagingLayout();
  });

  document.getElementById('stgMsgReplyBtn')?.addEventListener('click', () => {
    stgReplyToMessage = msg;
    stgMessagingView = 'compose';
    renderStgMessagingLayout();
  });

  document.getElementById('stgMsgToggleReadBtn')?.addEventListener('click', async () => {
    if (!isInbox) return;

    try {
      const nextRead = !msg.is_read;
      const res = await fetch(`/api/messages/${msg.id}/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, is_read: nextRead })
      });

      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'Failed to update message.', 'error');
        return;
      }

      msg.is_read = nextRead;
      stgMessages = stgMessages.map(m => Number(m.id) === Number(msg.id) ? { ...m, is_read: nextRead } : m);
      renderStgMessagingLayout();
      showToast(`Message marked as ${nextRead ? 'read' : 'unread'}.`, 'success');
    } catch {
      showToast('Network error.', 'error');
    }
  });

  document.getElementById('stgMsgDeleteBtn')?.addEventListener('click', async () => {
    if (!confirm('Delete this message?')) return;
    // Immediately update state to prevent reappearance
    stgMessages = stgMessages.filter(m => Number(m.id) !== Number(msg.id));
    stgSelectedMessage = null;
    stgMessagingView = 'list';
    renderStgMessagingLayout(); // optimistic re-render
    try {
      const res = await fetch(`/api/messages/${msg.id}?user_id=${user.id}`, { method: 'DELETE' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(result.error || 'Delete failed.', 'error');
        await loadStgMessagingData(); // restore accurate state
        return;
      }
      showToast('Message deleted.', 'success');
      await loadStgMessagingData(); // sync with server
    } catch {
      showToast('Network error.', 'error');
      await loadStgMessagingData();
    }
  });
}

function renderStgComposeView(container) {
  const reply = stgReplyToMessage;
  const defaultSubject = reply
    ? ((reply.subject || '').startsWith('Re:') ? reply.subject : `Re: ${reply.subject || ''}`)
    : '';

  container.innerHTML = `
    <div class="stg-msg-compose">
      <div class="stg-msg-view-toolbar">
        <div class="stg-msg-view-actions">
          <button type="button" class="stg-outline-btn" id="stgComposeBackBtn"><i class="ri-arrow-left-line"></i> Back</button>
        </div>
      </div>

      <div class="stg-msg-compose-card">
        <div class="form-group">
          <label>Recipient</label>
          <select id="stgMsgRecipient" ${stgUsers.length ? '' : 'disabled'}>
            <option value="">${stgUsers.length ? 'Select recipient…' : 'No other users available'}</option>
            ${stgUsers.map(u => `
              <option value="${u.id}" ${reply && Number(reply.sender_id) === Number(u.id) ? 'selected' : ''}>
                ${escHtml(u.full_name || u.email)}${u.role ? ` (${escHtml(u.role)})` : ''}
              </option>
            `).join('')}
          </select>
          ${!stgUsers.length ? `
            <div style="margin-top:8px;font-size:12px;color:#94a3b8;">
              You need at least one other registered user before you can send a message.
            </div>
          ` : ''}
        </div>

        <div class="form-group">
          <label>Subject</label>
          <input type="text" id="stgMsgSubject" value="${escHtml(defaultSubject)}" placeholder="Enter subject">
        </div>

        <div class="form-group">
          <label>Message</label>
          <textarea id="stgMsgBody" class="stg-msg-textarea" placeholder="Write your message here...">${reply ? `\n\n--- Original message ---\n${reply.body || ''}` : ''}</textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="tool-btn" id="stgComposeCancelBtn">Cancel</button>
          <button type="button" class="tool-btn apply-btn" id="stgComposeSendBtn">
            <i class="ri-send-plane-fill"></i> Send
          </button>
        </div>
      </div>
    </div>
  `;

  const goBack = () => {
    stgMessagingView = stgSelectedMessage ? 'read' : 'list';
    renderStgMessagingLayout();
  };

  document.getElementById('stgComposeBackBtn')?.addEventListener('click', goBack);
  document.getElementById('stgComposeCancelBtn')?.addEventListener('click', goBack);

  document.getElementById('stgComposeSendBtn')?.addEventListener('click', async () => {
    const recipientSelect = document.getElementById('stgMsgRecipient');
    const recipient_id = recipientSelect?.value;
    const subject = document.getElementById('stgMsgSubject').value.trim();
    const body = document.getElementById('stgMsgBody').value.trim();
    const btn = document.getElementById('stgComposeSendBtn');

    if (!stgUsers.length) {
      showToast('No available recipients found.', 'error');
      return;
    }

    if (!recipient_id || !subject || !body) {
      showToast('Recipient, subject, and message are required.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Sending…';

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: Number(user.id),
          recipient_id: Number(recipient_id),
          subject,
          body,
          parent_message_id: reply ? Number(reply.id) : null
        })
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(result.error || 'Failed to send message.', 'error');
        return;
      }

      stgMessageFolder = 'sent';
      stgReplyToMessage = null;
      stgSelectedMessage = null;
      stgMessagingView = 'list';

      // Optimistically add sent message to stgMessages so Sent folder shows it immediately
      const recipientUser = stgUsers.find(u => Number(u.id) === Number(recipient_id));
      const optimisticMsg = {
        id: result.id,
        sender_id: Number(user.id),
        recipient_id: Number(recipient_id),
        subject,
        body,
        is_read: true,
        created_at: result.created_at || new Date().toISOString(),
        sender_name: user.full_name || user.email || 'You',
        sender_email: user.email || '',
        recipient_name: recipientUser ? (recipientUser.full_name || recipientUser.email) : 'Unknown',
        recipient_email: recipientUser ? (recipientUser.email || '') : '',
      };
      stgMessages = [optimisticMsg, ...stgMessages.filter(m => Number(m.id) !== Number(result.id))];

      showToast('Message sent successfully.', 'success');
      await loadStgMessagingData(); // sync with server
    } catch (err) {
      showToast('Network error.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-send-plane-fill"></i> Send';
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   REQUEST NOTIFICATION HELPER
   Fires a system self-message after any request is submitted.
   Also refreshes the My Requests table if it's visible.
═══════════════════════════════════════════════════════════ */
async function sendRequestNotification(requestType, details) {
  if (!user || !user.id) return;
  const typeLabels = {
    leave:  'Leave Request',
    id:     'ID Request',
    salary: 'Salary Increase Request',
    files:  'Files Request',
  };
  const label   = typeLabels[requestType] || 'Request';
  const subject = `[${label}] Submitted — Pending Review`;
  const body    = `Your ${label} has been submitted and is pending review.\n\n${details}\n\nStatus: Pending\nSubmitted: ${new Date().toLocaleString()}\n\nYou will receive an update here when the status changes.`;
  try {
    await fetch('/api/messages/system', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: user.id, recipient_id: user.id, subject, body }),
    });
    // Silently reload inbox so the new thread appears immediately
    if (stgMessageFolder === 'inbox') loadStgMessagingData();
    // Reload unified inbox if visible
    if (document.getElementById('utInboxMount')?.closest('.stg-panel.active')) loadUnifiedInbox();
    // Reload My Requests table if the full-page view is currently open
    const reqMount = document.getElementById('stgRequestsMount');
    if (reqMount) loadMyRequests();
  } catch { /* non-critical — don't surface to user */ }
}

/* ═══════════════════════════════════════════════════════════
   MY REQUESTS — redirects to Unified Inbox → Requests filter
   Kept for backward-compat (called from request forms, cancel, etc.)
═══════════════════════════════════════════════════════════ */
function loadMyRequestsPage() {
  // Open Settings and activate the dedicated My Requests tab.
  loadSettings();
  requestAnimationFrame(() => {
    const reqNavBtn = document.querySelector('.stg-navitem[data-tab="myrequests"]');
    const reqPanel  = document.getElementById('stg-tab-myrequests');
    if (reqNavBtn && reqPanel) {
      document.querySelectorAll('.stg-navitem').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stg-panel').forEach(p => p.classList.remove('active'));
      reqNavBtn.classList.add('active');
      reqPanel.classList.add('active');
    }
    utSearch = '';
    const si = document.getElementById('utSearchInput');
    if (si) si.value = '';
    loadMyRequests();
  });
}

/* ═══════════════════════════════════════════════════════════
   MY REQUESTS — fetch + render
═══════════════════════════════════════════════════════════ */
async function loadMyRequests() {
  const mount = document.getElementById('stgRequestsMount');
  if (!mount) return;
  if (!user || !user.id) {
    mount.innerHTML = `<div class="stg-req-empty"><i class="ri-error-warning-line"></i><span>Session error — please log in again.</span></div>`;
    return;
  }
  mount.innerHTML = `<div class="stg-req-empty"><i class="ri-loader-4-line spin"></i><span>Loading requests…</span></div>`;
  try {
    const res  = await fetch(`/api/users/${user.id}/my-requests`);
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    renderMyRequestsTable(mount, Array.isArray(data) ? data : []);
  } catch (err) {
    mount.innerHTML = `<div class="stg-req-empty"><i class="ri-error-warning-line"></i><span>${escHtml(err.message || 'Failed to load requests.')}</span></div>`;
  }
}

function renderMyRequestsTable(mount, rows) {
  const typeConfig = {
    leave:  { label: 'Leave',          icon: 'ri-calendar-check-line',   color: '#6366f1' },
    id:     { label: 'ID Request',      icon: 'ri-id-card-line',          color: '#0ea5e9' },
    salary: { label: 'Salary Increase', icon: 'ri-money-dollar-circle-line', color: '#10b981' },
    files:  { label: 'Files Request',   icon: 'ri-folder-open-line',      color: '#f59e0b' },
  };
  const statusConfig = {
    pending:   { cls: 'req-badge-pending',   label: 'Pending'   },
    approved:  { cls: 'req-badge-approved',  label: 'Approved'  },
    rejected:  { cls: 'req-badge-rejected',  label: 'Rejected'  },
    cancelled: { cls: 'req-badge-cancelled', label: 'Cancelled' },
  };

  if (!rows.length) {
    mount.innerHTML = `
      <div class="stg-req-empty">
        <i class="ri-file-list-3-line"></i>
        <span>No requests yet.</span>
        <small>Submit a Leave, ID, Salary, or Files request to see it here.</small>
      </div>`;
    return;
  }

  const rows_html = rows.map(r => {
    const tc  = typeConfig[r.type]  || { label: r.type, icon: 'ri-file-line', color: '#64748b' };
    const sc  = statusConfig[(r.status || '').toLowerCase()] || { cls: 'req-badge-pending', label: r.status || '—' };
    const sub = r.subtype ? `<small class="req-row-subtype">${escHtml(r.subtype)}</small>` : '';
    const summary = r.summary ? String(r.summary).slice(0, 80) + (r.summary.length > 80 ? '…' : '') : '—';
    const dateSubmit = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
    const dateUpdated = r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—';
    const canCancel = (r.status || '').toLowerCase() === 'pending';

    return `
      <tr class="req-row" data-id="${r.id}" data-type="${escHtml(r.type)}">
        <td>
          <div class="req-type-cell">
            <span class="req-type-icon" style="color:${tc.color};background:${tc.color}18">
              <i class="${tc.icon}"></i>
            </span>
            <div>
              <div class="req-type-label">${escHtml(tc.label)}</div>
              ${sub}
            </div>
          </div>
        </td>
        <td><div class="req-summary-cell">${escHtml(summary)}</div></td>
        <td><span class="req-badge ${sc.cls}">${escHtml(sc.label)}</span></td>
        <td class="req-date-cell">${escHtml(dateSubmit)}</td>
        <td class="req-date-cell">${escHtml(dateUpdated)}</td>
        <td>
          <div class="req-actions-cell">
            <button class="req-action-btn req-view-btn" data-id="${r.id}" data-type="${escHtml(r.type)}" title="View Request">
              <i class="ri-eye-line"></i> View
            </button>
            ${canCancel ? `<button class="req-action-btn req-cancel-btn" data-id="${r.id}" data-type="${escHtml(r.type)}" title="Cancel Request">
              <i class="ri-close-circle-line"></i> Cancel
            </button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  mount.innerHTML = `
    <div class="req-table-wrap">
      <table class="req-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Details</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows_html}</tbody>
      </table>
    </div>`;

  // View opens a dedicated request details modal, separate from Messaging.
  mount.querySelectorAll('.req-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openMyRequestDetailModal(btn.dataset.type, btn.dataset.id, typeConfig, statusConfig);
    });
  });

  // ── Cancel request ───────────────────────────────────────────────────────
  mount.querySelectorAll('.req-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reqId   = btn.dataset.id;
      const reqType = btn.dataset.type;
      if (!confirm('Cancel this request?')) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-loader-4-line spin"></i>';
      try {
        const res = await fetch(`/api/users/${user.id}/my-requests/${reqType}/${reqId}/cancel`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { showToast(data.error || 'Cancel failed.', 'error'); return; }
        showToast('Request cancelled.', 'success');
        loadMyRequests();
        // Also fire a system message about the cancellation
        sendRequestNotification('cancel_update',
          `Your request has been cancelled.\nRequest ID: ${reqId}\nType: ${reqType}`
        );
      } catch { showToast('Network error.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-close-circle-line"></i> Cancel'; }
    });
  });
}

async function openMyRequestDetailModal(reqType, reqId, typeConfig = {}, statusConfig = {}) {
  document.getElementById('myReqDetailModal')?.remove();

  const typeMeta = typeConfig[reqType] || { label: reqType || 'Request', icon: 'ri-file-list-3-line', color: '#64748b' };
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'myReqDetailModal';
  modal.innerHTML = `
    <div class="myreq-detail-modal">
      <div class="myreq-detail-header">
        <div class="myreq-detail-title">
          <span class="req-type-icon" style="color:${typeMeta.color};background:${typeMeta.color}18"><i class="${typeMeta.icon}"></i></span>
          <div>
            <h3>${escHtml(typeMeta.label)}</h3>
            <p>Request details</p>
          </div>
        </div>
        <button class="modal-close-btn myreq-detail-close" type="button"><i class="ri-close-line"></i></button>
      </div>
      <div class="myreq-detail-body" id="myReqDetailBody">
        <div class="stg-req-empty"><i class="ri-loader-4-line spin"></i><span>Loading request details...</span></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.myreq-detail-close')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  try {
    const res = await fetch(`/api/users/${user.id}/threads/${encodeURIComponent(`req_${reqType}_${reqId}`)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to load request details');
    renderMyRequestDetailModal(data, typeMeta, statusConfig);
  } catch (err) {
    const body = document.getElementById('myReqDetailBody');
    if (body) body.innerHTML = `<div class="stg-req-empty"><i class="ri-error-warning-line"></i><span>${escHtml(err.message || 'Failed to load request details.')}</span></div>`;
  }
}

function renderMyRequestDetailModal(data, typeMeta, statusConfig = {}) {
  const body = document.getElementById('myReqDetailBody');
  if (!body) return;

  const raw = data.raw || {};
  const createdAt = raw.submitted_at || raw.created_at || data.messages?.[0]?.created_at || null;
  const statusKey = String(data.status || raw.status || 'pending').toLowerCase();
  const statusMeta = statusConfig[statusKey] || { cls: 'req-badge-pending', label: data.status || raw.status || 'Pending' };
  const remarks = raw.remarks || raw.comment || raw.admin_response || '';
  const hiddenKeys = new Set(['id', 'employee_id', 'requested_by', 'owner_id', 'created_at', 'updated_at', 'submitted_at', 'status']);
  const labelMap = {
    request_date: 'Date Submitted',
    leave_type: 'Leave Type',
    id_type: 'ID Type',
    current_salary: 'Current Salary',
    requested_salary: 'Requested Salary',
    effective_date: 'Effective Date',
    document_name: 'Document Name',
    request_action: 'Request Action',
    copy_type: 'Copy Type',
    proof_of_return: 'Proof of Return',
    start_date: 'Start Date',
    end_date: 'End Date',
  };
  const formatLabel = key => labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const formatValue = (key, value) => {
    if (value == null || value === '') return '&mdash;';
    if (String(key).includes('date') || ['created_at', 'updated_at', 'submitted_at'].includes(key)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return escHtml(d.toLocaleString());
    }
    if (key === 'proof_of_return' && String(value).startsWith('/')) {
      return `<a href="${escHtml(value)}" target="_blank" rel="noopener">View attachment</a>`;
    }
    return escHtml(String(value));
  };

  const detailRows = Object.entries(raw)
    .filter(([key, value]) => !hiddenKeys.has(key) && key !== 'remarks' && key !== 'comment' && key !== 'admin_response' && value != null && value !== '')
    .map(([key, value]) => `
      <div class="myreq-detail-field">
        <dt>${escHtml(formatLabel(key))}</dt>
        <dd>${formatValue(key, value)}</dd>
      </div>`)
    .join('');

  body.innerHTML = `
    <div class="myreq-detail-summary">
      <div>
        <span>Request Type</span>
        <strong>${escHtml(typeMeta.label || data.title || 'Request')}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong><span class="req-badge ${statusMeta.cls}">${escHtml(statusMeta.label)}</span></strong>
      </div>
      <div>
        <span>Date Submitted</span>
        <strong>${createdAt ? escHtml(new Date(createdAt).toLocaleString()) : '&mdash;'}</strong>
      </div>
    </div>
    <dl class="myreq-detail-grid">
      ${detailRows || `<div class="myreq-detail-field"><dt>Details</dt><dd>No additional form data available.</dd></div>`}
    </dl>
    <div class="myreq-detail-remarks">
      <h4>Remarks / Admin Response</h4>
      <p>${remarks ? escHtml(String(remarks)) : 'No remarks yet.'}</p>
    </div>`;
}

function _stgApplyDisplaySettings() {
  const fontSize   = localStorage.getItem('fontSize');
  const theme      = localStorage.getItem('theme');
  if (theme === 'dark') document.body.classList.add('dark');
  if (theme === 'light') document.body.classList.remove('dark');
  applyDisplayVisualSettings();
  applyTypographySettings(fontSize || '14');
}

function applyDisplayVisualSettings() {
  const brightnessRaw = parseInt(localStorage.getItem('brightness') || '100', 10);
  const brightness = Number.isFinite(brightnessRaw) ? Math.min(100, Math.max(20, brightnessRaw)) : 100;
  const nightLight = localStorage.getItem('nightLight') === 'true';
  const filterParts = [`brightness(${(brightness / 100).toFixed(2)})`];

  if (nightLight) filterParts.push('sepia(0.25)');

  document.body.style.opacity = '';
  document.body.style.filter = filterParts.join(' ');
}

function applyTypographySettings(sizeValue) {
  const sizeRaw = parseInt(sizeValue || localStorage.getItem('fontSize') || '14', 10);
  const size = Number.isFinite(sizeRaw) ? Math.min(20, Math.max(12, sizeRaw)) : 14;
  const zoom = (size / 14).toFixed(2);

  document.documentElement.style.fontSize = size + 'px';
  document.body.style.zoom = zoom;
}

/* ================= ACCEPTANCE PAGE ================= */

let accAllProjects   = [];
let accAllSites      = {};
let accOpenProjects  = new Set();
let accSelectMode    = {};
let accSelectedRows  = {};
let accMediaSelectMode = {};
let accSelectedMedia   = {};

function loadAcceptance() {
  accAllProjects  = [];
  accAllSites     = {};
  accOpenProjects = new Set();

  mainContent.innerHTML = `
    <div class="acc-page" id="accPage">
      <div class="acc-topbar">
        <h2 class="acc-title"><i class="ri-checkbox-circle-line"></i> Acceptance</h2>
        <div class="acc-topbar-right">
          <div class="acc-search-box">
            <i class="ri-search-line"></i>
            <input type="text" id="accSearch" placeholder="Search here…">
          </div>
          <button class="acc-btn" id="accImportBtn">
            <i class="ri-upload-cloud-2-line"></i> Import
          </button>
          <button class="acc-btn acc-btn-primary" id="accAddProjectBtn">
            <i class="ri-add-line"></i> Add Project
          </button>
        </div>
      </div>

      <div class="acc-date-bar">
        <i class="ri-calendar-2-line"></i>
        <span id="accDateBarLabel">Loading…</span>
      </div>

      <div class="acc-projects-wrap" id="accProjectsWrap">
        <div class="acc-loading">
          <i class="ri-loader-4-line spin"></i>
          <span>Loading projects…</span>
        </div>
      </div>
    </div>
  `;

  (() => {
    const now   = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fmt   = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const el    = document.getElementById('accDateBarLabel');
    if (el) el.textContent = fmt(first) + ' – ' + fmt(last);
  })();

  document.getElementById('accSearch').addEventListener('input', function () {
    accRenderProjects(this.value.toLowerCase().trim());
  });

  document.getElementById('accImportBtn').addEventListener('click', () => accOpenProjectImportPicker());
  document.getElementById('accAddProjectBtn').addEventListener('click', () => accOpenAddProjectModal());

  accFetchProjects();
}

async function accFetchProjects() {
  try {
    const res  = await fetch('/api/acceptance/projects');
    const data = await res.json();
    accAllProjects = data;
    accRenderProjects('');
  } catch {
    const wrap = document.getElementById('accProjectsWrap');
    if (wrap) wrap.innerHTML = `<div class="acc-empty"><i class="ri-error-warning-line"></i><span>Failed to load projects. Please try again.</span></div>`;
  }
}

function accRenderProjects(query) {
  const wrap = document.getElementById('accProjectsWrap');
  if (!wrap) return;

  let projects = accAllProjects;
  if (query) {
    projects = projects.filter(p => (p.project_name||'').toLowerCase().includes(query));
  }

  if (!projects.length) {
    wrap.innerHTML = `<div class="acc-empty"><i class="ri-inbox-line"></i><span>${query ? 'No projects match your search.' : 'No projects yet. Click "Add Project" to get started.'}</span></div>`;
    return;
  }

  wrap.innerHTML = projects.map(p => accProjectCardHTML(p)).join('');

  projects.forEach(p => {
    if (accOpenProjects.has(p.project_name)) {
      const card = wrap.querySelector(`.acc-project-card[data-project="${CSS.escape(p.project_name)}"]`);
      if (card) _accExpandProject(card, p.project_name, false);
    }
  });

  wrap.querySelectorAll('.acc-project-header').forEach(header => {
    header.addEventListener('click', function () {
      const card    = this.closest('.acc-project-card');
      const pname   = card.dataset.project;
      const body    = card.querySelector('.acc-project-body');
      const chevron = card.querySelector('.acc-chevron');
      if (body.classList.contains('open')) {
        body.classList.remove('open');
        chevron.classList.remove('open');
        card.classList.remove('open');
        accOpenProjects.delete(pname);
      } else {
        _accExpandProject(card, pname, true);
      }
    });
  });
}

function accProjectCardHTML(p) {
  const pct     = parseFloat(p.progress || 0);
  const done    = parseInt(p.done_sites    || 0);
  const pending = parseInt(p.pending_sites || 0);
  const total   = parseInt(p.total_sites   || 0);
  return `
    <div class="acc-project-card" data-project="${escHtml(p.project_name)}">
      <div class="acc-project-header">
        <div class="acc-project-info">
          <div class="acc-project-name">${escHtml(p.project_name)}</div>
          <div class="acc-project-counts">
            <span class="acc-count-done"><i class="ri-checkbox-circle-fill"></i> ${done} Done</span>
            <span class="acc-count-sep">·</span>
            <span class="acc-count-pending"><i class="ri-time-line"></i> ${pending} Pending</span>
            <span class="acc-count-sep">·</span>
            <span>${total} Total</span>
          </div>
        </div>
        <div class="acc-project-right">
          ${accCircleSvg(pct)}
          <i class="ri-arrow-down-s-line acc-chevron"></i>
        </div>
      </div>
      <div class="acc-project-body">
        <div class="acc-loading" id="accSiteLoader-${CSS.escape(p.project_name)}">
          <i class="ri-loader-4-line spin"></i><span>Loading sites…</span>
        </div>
      </div>
    </div>`;
}

function accCircleSvg(pct) {
  const v    = Math.min(100, Math.max(0, pct));
  const c    = v >= 80 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#3b82f6';
  const R    = 22;
  const circ = 2 * Math.PI * R;
  const dash = v >= 100 ? circ : (v / 100) * circ;
  const gap  = v >= 100 ? 0 : circ - dash;
  return `
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="#e5e7eb" stroke-width="5"/>
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="${c}" stroke-width="5"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
        stroke-linecap="butt"/>
      <text x="28" y="33" text-anchor="middle" font-size="10.5" font-weight="700" fill="${c}">${Math.round(v)}%</text>
    </svg>`;
}

function _accExpandProject(card, projectName, fetchNow) {
  const body    = card.querySelector('.acc-project-body');
  const chevron = card.querySelector('.acc-chevron');
  body.classList.add('open');
  chevron.classList.add('open');
  card.classList.add('open');
  accOpenProjects.add(projectName);
  if (fetchNow || !accAllSites[projectName]) {
    accFetchSites(projectName, card);
  } else {
    accRenderSitesTable(projectName, card, accAllSites[projectName]);
  }
}

async function accFetchSites(projectName, card) {
  try {
    const res  = await fetch(`/api/acceptance/sites?project=${encodeURIComponent(projectName)}`);
    const data = await res.json();
    accAllSites[projectName] = data;
    accRenderSitesTable(projectName, card, data);
  } catch {
    const body = card.querySelector('.acc-project-body');
    if (body) body.innerHTML = `<div class="acc-empty"><i class="ri-error-warning-line"></i><span>Failed to load sites.</span></div>`;
  }
}


function accOpenMediaModal(siteId, siteName, tab) {
  // Remove any existing instance
  document.getElementById('accMediaModalOverlay')?.remove();

  const m = document.createElement('div');
  m.id = 'accMediaModalOverlay';
  m.className = 'modal-overlay';
    m.innerHTML = `
    <div class="acc-modal-shell acc-media-modal">
      <div class="acc-modal-header acc-media-head">
        <div class="acc-modal-title-row acc-media-head-left">
          <div class="acc-modal-icon acc-media-icon"><i class="ri-upload-cloud-2-line"></i></div>
          <div class="acc-media-title-wrap">
            <div class="acc-modal-title">${escHtml(siteName)}</div>
            <div class="acc-modal-sub">Manage uploads</div>
          </div>
        </div>

        <div class="acc-media-head-right">
          <input type="file" id="accUploadInput" style="display:none;" multiple>

          <button
            type="button"
            class="acc-modal-close-btn acc-media-close"
            id="accMediaClose"
            aria-label="Close"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </div>

      <div class="acc-modal-tabs" style="display:flex;gap:0;padding:0 20px;border-bottom:1px solid var(--border,#e5e7eb);">
        ${['files','images','videos'].map(t => `
          <button type="button" class="acc-tab-btn${t === tab ? ' active' : ''}" data-tab="${t}"
            style="padding:10px 18px;border:none;background:none;cursor:pointer;font-weight:600;
                   border-bottom:2px solid ${t === tab ? 'var(--primary,#2f4b85)' : 'transparent'};
                   color:${t === tab ? 'var(--primary,#2f4b85)' : '#64748b'};">
            <i class="ri-${t === 'files' ? 'folder-open' : t === 'images' ? 'image' : 'video'}-line"></i>
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`).join('')}
      </div>

      <div id="accMediaBody" class="acc-media-body"></div>

      <div class="acc-modal-footer acc-media-footer">
        <div id="accMediaFooterLeft" class="acc-media-footer-left"></div>

        <div class="acc-media-footer-right">
          <button
            type="button"
            class="acc-upload-btn acc-media-head-btn"
            id="accMediaUploadBtn"
            title="Upload files"
            aria-label="Upload files"
          >
            <i class="ri-upload-2-line"></i>
          </button>

          <button
            type="button"
            class="acc-upload-btn acc-media-head-btn"
            id="accMediaSelectBtn"
            title="Select items"
            aria-label="Select items"
          >
            <i class="ri-checkbox-multiple-line"></i>
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(m);

  let currentTab = tab;

  const close = () => {
    if (m._accMenuOutsideHandler) {
      document.removeEventListener('click', m._accMenuOutsideHandler);
      m._accMenuOutsideHandler = null;
    }
    m.remove();
  };

    document.getElementById('accMediaClose').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  // Tab switching
  m.querySelectorAll('.acc-tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      currentTab = this.dataset.tab;
      m.querySelectorAll('.acc-tab-btn').forEach(b => {
        const isActive = b.dataset.tab === currentTab;
        b.style.borderBottomColor = isActive ? 'var(--primary,#2f4b85)' : 'transparent';
        b.style.color = isActive ? 'var(--primary,#2f4b85)' : '#64748b';
        b.classList.toggle('active', isActive);
      });
      _accSetUploadAccept(currentTab, uploadInput);
      accLoadMediaTab(siteId, currentTab, m, false);
    });
  });

  // Upload button + hidden file input
  const uploadBtn   = document.getElementById('accMediaUploadBtn');
  const uploadInput = document.getElementById('accUploadInput');
  _accSetUploadAccept(currentTab, uploadInput);

  uploadBtn.addEventListener('click', () => uploadInput.click());

    uploadInput.addEventListener('change', async function () {
    const files = Array.from(this.files || []);
    if (!files.length) return;

    const uploadTab = currentTab;
    const invalid = files.filter(f => !accIsValidUploadFile(f, uploadTab));
    if (invalid.length) {
      showToast(`Invalid file type(s): ${invalid.map(f => f.name).join(', ')}`, 'error');
      this.value = '';
      return;
    }

        uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="ri-loader-4-line spin"></i>';

    try {
      const fd = new FormData();
      const fieldName = uploadTab === 'images' ? 'image'
                      : uploadTab === 'videos' ? 'video'
                      : 'file';

      files.forEach(f => fd.append(fieldName, f, f.name));
      fd.append('site_id', siteId);
      fd.append('uploaded_by', user?.id || '');

      const endpoint = uploadTab === 'images' ? 'images'
                     : uploadTab === 'videos' ? 'videos'
                     : 'files';

      const res = await fetch(`/api/acceptance/${endpoint}`, { method: 'POST', body: fd });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(r.error || 'Upload failed');
      }

      showToast(`${r.uploaded || files.length} file(s) uploaded.`, 'success');

      if (!m._accMediaCache) m._accMediaCache = {};
      delete m._accMediaCache[uploadTab];

      await accLoadMediaTab(siteId, uploadTab, m, true);

      const row = document.querySelector(`.acc-site-row[data-id="${siteId}"]`);
      if (row) {
        const card = row.closest('.acc-project-card');
        if (card) {
          const pn = card.dataset.project;
          delete accAllSites[pn];
          await accFetchSites(pn, card);
        }
      }
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="ri-upload-2-line"></i>';
      uploadBtn.title = 'Upload files';
      uploadBtn.setAttribute('aria-label', 'Upload files');
      this.value = '';
      _accSetUploadAccept(currentTab, uploadInput);
    }
  });

  // Select / Done toggle
  document.getElementById('accMediaSelectBtn').addEventListener('click', function () {
    const key = accMediaSelectionKey(siteId, currentTab);
    accMediaSelectMode[key] = !accMediaSelectMode[key];
    if (!accMediaSelectMode[key]) accGetSelectedMediaSet(siteId, currentTab).clear();
    accLoadMediaTab(siteId, currentTab, m, false);
  });

  // Load initial tab
  accLoadMediaTab(siteId, currentTab, m, false);
}


function accRenderSitesTable(projectName, card, sites) {
  const body = card.querySelector('.acc-project-body');
  if (!body) return;
  const isAdmin = user && ['admin','executive','noc'].includes((user.role||'').toLowerCase());
  const selectMode = !!accSelectMode[projectName];
  if (!accSelectedRows[projectName]) accSelectedRows[projectName] = new Set();

  // Store projectName directly on the DOM element — no escaping issues
  body._accProjectName = projectName;

  body.innerHTML = `
    <div class="acc-table-toolbar">
      <div class="acc-filter-row">
        <button class="acc-filter-chip active" data-filter="all">All</button>
        <button class="acc-filter-chip"        data-filter="done"><i class="ri-checkbox-circle-fill" style="color:#22c55e"></i> Done</button>
        <button class="acc-filter-chip"        data-filter="pending"><i class="ri-time-line" style="color:#f59e0b"></i> Pending</button>
      </div>
      <div class="acc-table-actions">
        ${isAdmin ? `<button class="acc-btn" data-action="import"><i class="ri-upload-cloud-2-line"></i> Import</button>` : ''}
        ${isAdmin ? `<button class="acc-btn" data-action="select"><i class="ri-checkbox-multiple-line"></i> ${selectMode ? 'Done' : 'Select'}</button>` : ''}
        ${selectMode ? `<button class="acc-btn" data-action="delete"><i class="ri-delete-bin-line"></i> Delete</button>` : ''}
        ${isAdmin ? `<button class="acc-btn acc-btn-primary acc-add-site-btn" style="font-size:12px;padding:7px 14px;border-radius:8px;"><i class="ri-add-line"></i> Add Site</button>` : ''}
      </div>
    </div>
    <div class="acc-sites-subtable">
      <table class="acc-inner-table">
        <thead>
          <tr>
            ${selectMode ? '<th style="text-align:center;width:46px;"><input type="checkbox" class="acc-bulk-chk" data-action="select-all"></th>' : ''}
            <th>Site Name</th>
            <th>Status</th>
            <th>Installer</th>
            <th>Acceptance Date</th>
            <th>By</th>
            <th style="text-align:center;">Upload</th>
            ${isAdmin ? '<th style="text-align:center;">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody id="accSiteTbody-${CSS.escape(projectName)}">
          ${accSiteRows(sites, projectName, isAdmin)}
        </tbody>
      </table>
      ${!sites.length ? `<div class="acc-empty" style="padding:28px 16px;"><i class="ri-inbox-line"></i><span>No sites yet.</span></div>` : ''}
    </div>`;

  // Re-attach projectName after innerHTML wipe
  body._accProjectName = projectName;

  // Filter chips
  body.querySelectorAll('.acc-filter-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      accFilterSites(this, body._accProjectName);
    });
  });

  // Add Site button
  const addSiteBtn = body.querySelector('.acc-add-site-btn');
  if (addSiteBtn) {
    addSiteBtn.addEventListener('click', () => accOpenAddSiteModal(body._accProjectName));
  }

  body.querySelectorAll('.acc-table-actions .acc-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'select') {
        accSelectMode[projectName] = !selectMode;
        if (!accSelectMode[projectName]) accSelectedRows[projectName].clear();
        accRenderSitesTable(projectName, card, sites);
      } else if (action === 'import') {
      accOpenAcceptanceImportModal(projectName);
      } else if (action === 'delete') {
       accDeleteSelectedSites(projectName, card);
}
    });
  });

  body.querySelector('.acc-bulk-chk[data-action="select-all"]')?.addEventListener('change', function() {
    const set = accSelectedRows[projectName];
    set.clear();
    if (this.checked) sites.forEach(site => set.add(String(site.id)));
    accRenderSitesTable(projectName, card, sites);
  });

    // Media open buttons
  body.querySelectorAll('.acc-media-open-btn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });

  body.querySelectorAll('.acc-media-open-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const siteId = parseInt(this.dataset.siteId, 10);
      const siteName = this.dataset.siteName || '';
      const tab = this.dataset.tab || 'files';

      if (!siteId) {
        showToast('Invalid site ID.', 'error');
        return;
      }

      accOpenMediaModal(siteId, siteName, tab);
    });
  });

  // Toggle status buttons
  body.querySelectorAll('.acc-toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      accToggleSiteStatus(parseInt(this.dataset.siteId), this.dataset.newStatus, body._accProjectName);
    });
  });

  // Delete site buttons
  body.querySelectorAll('.acc-delete-site-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      accDeleteSite(parseInt(this.dataset.siteId), body._accProjectName);
    });
  });

  body.querySelectorAll('.acc-site-select').forEach(chk => {
    chk.addEventListener('change', function() {
      const set = accSelectedRows[projectName];
      if (this.checked) set.add(this.value);
      else set.delete(this.value);
    });
  });
}


function accFilterSites(btn, projectName) {
  const filter = btn.dataset.filter;
  btn.closest('.acc-filter-row').querySelectorAll('.acc-filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const safeP = CSS.escape(projectName);
  const tbody = document.getElementById(`accSiteTbody-${safeP}`);
  if (!tbody) return;
  tbody.querySelectorAll('tr.acc-site-row').forEach(row => {
    row.style.display = (filter === 'all' || row.dataset.status === filter) ? '' : 'none';
  });
}

function accSiteRows(sites, projectName, isAdmin) {
  if (!sites.length) return '';
  const selectMode = !!accSelectMode[projectName];
  const selected = accSelectedRows[projectName] || new Set();
  return sites.map(s => {
    const isDone = (s.status || '').toLowerCase() === 'done';
    const fileCount = parseInt(s.file_count || 0);
    const imgCount = parseInt(s.image_count || 0);
    const vidCount = parseInt(s.video_count || 0);
    const safeP = escHtml(projectName);
    const safeName = escHtml(s.site_name);
    return `
      <tr class="acc-site-row" data-status="${isDone ? 'done' : 'pending'}" data-id="${s.id}">
        ${selectMode ? `<td style="text-align:center;"><input type="checkbox" class="acc-site-select" value="${s.id}" ${selected.has(String(s.id)) ? 'checked' : ''}></td>` : ''}
        <td class="acc-site-name">${safeName}</td>
        <td>
          <span class="acc-status-badge ${isDone ? 'done' : 'pending'}">
            ${isDone ? '<i class="ri-checkbox-circle-fill"></i> Done' : '<i class="ri-time-line"></i> Pending'}
          </span>
        </td>
        <td style="color:#64748b;font-size:13px;">${escHtml(s.installer_name || '—')}</td>
        <td style="color:#64748b;font-size:13px;">${s.acceptance_date ? new Date(s.acceptance_date).toLocaleDateString() : '—'}</td>
        <td style="color:#64748b;font-size:13px;">${escHtml(s.uploader_name || '—')}</td>
        <td class="acc-upload-cell">
            <button type="button" class="acc-upload-btn acc-media-open-btn" title="Files" data-site-id="${s.id}" data-site-name="${safeName}" data-tab="files">
            <i class="ri-folder-open-line"></i>${fileCount > 0 ? `<span class="acc-media-count">${fileCount}</span>` : ''}
          </button>
            <button type="button" class="acc-upload-btn acc-media-open-btn" title="Images" data-site-id="${s.id}" data-site-name="${safeName}" data-tab="images">
            <i class="ri-image-line"></i>${imgCount > 0 ? `<span class="acc-media-count">${imgCount}</span>` : ''}
          </button>
            <button type="button" class="acc-upload-btn acc-media-open-btn" title="Videos" data-site-id="${s.id}" data-site-name="${safeName}" data-tab="videos">
            <i class="ri-video-line"></i>${vidCount > 0 ? `<span class="acc-media-count">${vidCount}</span>` : ''}
          </button>
        </td>
        ${isAdmin ? `
        <td style="text-align:center;white-space:nowrap;">
          <button class="acc-upload-btn acc-toggle-status-btn" title="${isDone ? 'Mark Pending' : 'Mark Done'}"
            data-site-id="${s.id}" data-new-status="${isDone ? 'Pending' : 'Done'}" data-project="${safeP}">
            <i class="ri-${isDone ? 'refresh-line' : 'checkbox-circle-line'}" style="color:${isDone ? '#f59e0b' : '#22c55e'}"></i>
          </button>
          <button class="acc-upload-btn acc-delete-site-btn" title="Delete" data-site-id="${s.id}" data-project="${safeP}">
            <i class="ri-delete-bin-line" style="color:#ef4444;"></i>
          </button>
        </td>` : ''}
      </tr>
    `;
  }).join('');
}

async function accToggleSiteStatus(siteId, newStatus, projectName) {
  try {
    const res = await fetch(`/api/acceptance/sites/${siteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error();
    delete accAllSites[projectName];
    const card = document.querySelector(`.acc-project-card[data-project="${CSS.escape(projectName)}"]`);
    if (card) { await accFetchSites(projectName, card); await accRefreshProjectProgress(projectName); }
    showToast(`Site marked as ${newStatus}.`, 'success');
  } catch { showToast('Failed to update status.', 'error'); }
}

async function accDeleteSite(siteId, projectName) {
  if (!confirm('Delete this site? All uploads will also be removed.')) return;
  try {
    const res = await fetch(`/api/acceptance/sites/${siteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    delete accAllSites[projectName];
    const card = document.querySelector(`.acc-project-card[data-project="${CSS.escape(projectName)}"]`);
    if (card) { await accFetchSites(projectName, card); await accRefreshProjectProgress(projectName); }
    showToast('Site deleted.', 'success');
  } catch { showToast('Failed to delete site.', 'error'); }
}

async function accRefreshProjectProgress(projectName) {
  try {
    const res  = await fetch('/api/acceptance/projects');
    const data = await res.json();
    accAllProjects = data;
    const p    = data.find(x => x.project_name === projectName);
    if (!p) return;
    const card = document.querySelector(`.acc-project-card[data-project="${CSS.escape(projectName)}"]`);
    if (!card) return;
    const rightEl = card.querySelector('.acc-project-right');
    if (rightEl) {
      const chevron = rightEl.querySelector('.acc-chevron');
      rightEl.innerHTML = accCircleSvg(parseFloat(p.progress || 0));
      if (chevron) rightEl.appendChild(chevron);
    }
    const countsEl = card.querySelector('.acc-project-counts');
    if (countsEl) {
      countsEl.innerHTML = `
        <span class="acc-count-done"><i class="ri-checkbox-circle-fill"></i> ${parseInt(p.done_sites||0)} Done</span>
        <span class="acc-count-sep">·</span>
        <span class="acc-count-pending"><i class="ri-time-line"></i> ${parseInt(p.pending_sites||0)} Pending</span>
        <span class="acc-count-sep">·</span>
        <span>${parseInt(p.total_sites||0)} Total</span>`;
    }
  } catch {}
}

function accOpenProjectImportPicker() {
  if (!accAllProjects.length) {
    showToast('Create a project first before importing.', 'error');
    return;
  }
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="acc-modal-shell">
      <div class="acc-modal-header">
        <div class="acc-modal-title-row">
          <div class="acc-modal-icon"><i class="ri-upload-cloud-2-line"></i></div>
          <div>
            <div class="acc-modal-title">Import Acceptance Data</div>
            <div class="acc-modal-sub">Choose the project where the imported sites should go</div>
          </div>
        </div>
        <button class="acc-modal-close-btn" id="accImportPickerClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="acc-modal-body">
        <label class="acc-modal-label">Project</label>
        <select id="accImportProjectSelect" class="acc-modal-input">
          ${accAllProjects.map(project => `<option value="${escHtml(project.project_name)}">${escHtml(project.project_name)}</option>`).join('')}
        </select>
      </div>
      <div class="acc-modal-footer">
        <button class="acc-modal-cancel" id="accImportPickerCancel">Cancel</button>
        <button class="acc-modal-submit" id="accImportPickerGo"><i class="ri-arrow-right-line"></i> Continue</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  document.getElementById('accImportPickerClose').onclick = close;
  document.getElementById('accImportPickerCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  document.getElementById('accImportPickerGo').onclick = () => {
    const projectName = document.getElementById('accImportProjectSelect').value;
    close();
    accOpenAcceptanceImportModal(projectName);
  };
}

function accOpenAcceptanceImportModal(projectName) {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box add-modal-box" style="max-width:520px;">
      <div class="add-modal-header">
        <div class="add-modal-icon"><i class="ri-upload-cloud-2-line"></i></div>
        <div class="add-modal-title"><h3>Import Acceptance Sites</h3><p>${escHtml(projectName)}</p></div>
        <button class="modal-close-btn" id="accImportClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="add-modal-body">
        <div class="import-drop-zone" id="accImportDropZone">
          <i class="ri-file-upload-line" style="font-size:36px;color:#2f4b85;"></i>
          <p style="margin:8px 0 4px;font-weight:600;color:#1e293b;">Drop file here or click to browse</p>
          <p style="font-size:12px;color:#94a3b8;">CSV or XLSX. Required column: site_name. Optional: status, installer_name, acceptance_date.</p>
          <input type="file" id="accImportFileInput" accept=".csv,.xlsx,.xls" class="hidden">
        </div>
        <div id="accImportFileName" style="font-size:13px;color:#2f4b85;margin-top:10px;min-height:18px;"></div>
      </div>
      <div class="add-modal-footer">
        <span class="add-modal-hint"><i class="ri-information-line"></i> Wrong format or missing columns will show an error before import.</span>
        <div class="modal-actions">
          <button class="tool-btn" id="accImportCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="accImportConfirm" disabled><i class="ri-upload-2-line"></i> Import</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);

  let parsedRows = [];
  const close = () => m.remove();
  document.getElementById('accImportClose').onclick = close;
  document.getElementById('accImportCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  const zone = document.getElementById('accImportDropZone');
  const input = document.getElementById('accImportFileInput');
  const nameEl = document.getElementById('accImportFileName');
  const confirmBtn = document.getElementById('accImportConfirm');

  zone.onclick = () => input.click();
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drop-hover'); };
  zone.ondragleave = () => zone.classList.remove('drop-hover');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drop-hover'); handleFile(e.dataTransfer.files[0]); };
  input.onchange = () => handleFile(input.files[0]);

  async function handleFile(file) {
    if (!file) return;
    parsedRows = [];
    confirmBtn.disabled = true;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      nameEl.textContent = 'Invalid file format. Please upload a CSV or Excel file.';
      showToast('Invalid file format for acceptance import.', 'error');
      return;
    }
    try {
      const COLS = ['site_name', 'status', 'installer_name', 'acceptance_date'];
      const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (lower.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const headers = (lines[0] || '').split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        parsedRows = lines.slice(1).map(line => {
          const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,))/g) || [];
          const row = {};
          headers.forEach((header, idx) => {
            const col = COLS.find(c => norm(c) === norm(header));
            if (col) row[col] = (vals[idx] || '').replace(/^"|"$/g, '').trim();
          });
          return row;
        }).filter(row => row.site_name);
      } else {
        await new Promise((resolve, reject) => {
          if (window.XLSX) return resolve();
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
        parsedRows = raw.map(row => {
          const out = {};
          Object.entries(row).forEach(([header, value]) => {
            const col = COLS.find(c => norm(c) === norm(header));
            if (col) out[col] = String(value || '').trim();
          });
          return out;
        }).filter(row => row.site_name);
      }

      if (!parsedRows.length) {
        nameEl.textContent = 'No valid rows found. Required column: site_name.';
        showToast('No valid rows found in the uploaded file.', 'error');
        return;
      }

      nameEl.textContent = `${file.name} — ${parsedRows.length} row(s) ready to import`;
      confirmBtn.disabled = false;
    } catch (err) {
      nameEl.textContent = `Could not read file: ${err.message}`;
      showToast('Could not read the uploaded file.', 'error');
    }
  }

  confirmBtn.onclick = async () => {
    if (!parsedRows.length) return;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Importing…';
    try {
      const res = await fetch('/api/acceptance/sites/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: projectName, rows: parsedRows, uploaded_by: user?.id || null })
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'Import failed.', 'error');
        return;
      }
      close();
      showToast(`Imported ${result.inserted} site(s).`, 'success');
      delete accAllSites[projectName];
      const card = document.querySelector(`.acc-project-card[data-project="${CSS.escape(projectName)}"]`);
      if (card) {
        await accFetchSites(projectName, card);
        await accRefreshProjectProgress(projectName);
      } else {
        await accFetchProjects();
      }
    } catch {
      showToast('Network error during import.', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="ri-upload-2-line"></i> Import';
    }
  };
}

function accExportSelectedSites(projectName) {
  const ids = Array.from(accSelectedRows[projectName] || []);
  const rows = (accAllSites[projectName] || []).filter(site => ids.includes(String(site.id)));
  if (!rows.length) {
    showToast('No acceptance rows selected.', 'error');
    return;
  }
  const csv = [
    'site_name,status,installer_name,acceptance_date,uploaded_by',
    ...rows.map(row => [
      row.site_name || '',
      row.status || '',
      row.installer_name || '',
      row.acceptance_date || '',
      row.uploader_name || ''
    ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${projectName.replace(/[^\w-]+/g, '_')}_acceptance.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${rows.length} acceptance row(s) exported.`, 'success');
}

async function accDeleteSelectedSites(projectName, card) {
  const ids = Array.from(accSelectedRows[projectName] || []);
  if (!ids.length) {
    showToast('No acceptance rows selected.', 'error');
    return;
  }
  if (!confirm(`Delete ${ids.length} selected site(s)?`)) return;
  try {
    const res = await fetch('/api/acceptance/sites/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Delete failed');
    accSelectedRows[projectName].clear();
    delete accAllSites[projectName];
    if (card) {
      await accFetchSites(projectName, card);
      await accRefreshProjectProgress(projectName);
    }
    showToast(`${result.deleted || ids.length} site(s) deleted.`, 'success');
  } catch (err) {
    showToast(err.message || 'Bulk delete failed.', 'error');
  }
}

function accMediaSelectionKey(siteId, tab) {
  return `${siteId}:${tab}`;
}

function accGetSelectedMediaSet(siteId, tab) {
  const key = accMediaSelectionKey(siteId, tab);
  if (!accSelectedMedia[key]) accSelectedMedia[key] = new Set();
  return accSelectedMedia[key];
}

async function accDeleteSelectedMedia(siteId, tab, modal) {
  const selected = Array.from(accGetSelectedMediaSet(siteId, tab));
  if (!selected.length) {
    showToast('No uploaded items selected.', 'error');
    return;
  }

  if (!confirm(`Delete ${selected.length} selected item(s)?`)) return;

  try {
    const res = await fetch('/api/acceptance/media/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, ids: selected })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(result.error || 'Bulk delete failed.', 'error');
      return;
    }

    accGetSelectedMediaSet(siteId, tab).clear();

    if (modal._accMediaCache && modal._accMediaCache[tab]) {
      modal._accMediaCache[tab] = modal._accMediaCache[tab].filter(item => !selected.includes(String(item.id)));
    }

    showToast(`${result.deleted || selected.length} item(s) deleted.`, 'success');
    await accLoadMediaTab(siteId, tab, modal, true);

    const row = document.querySelector(`.acc-site-row[data-id="${siteId}"]`);
    if (row) {
      const card = row.closest('.acc-project-card');
      if (card) {
        const pn = card.dataset.project;
        delete accAllSites[pn];
        await accFetchSites(pn, card);
      }
    }
  } catch {
    showToast('Bulk delete failed.', 'error');
  }
}

function accExportSelectedMedia(siteId, tab, modal) {
  const selected = Array.from(accGetSelectedMediaSet(siteId, tab));
  if (!selected.length) {
    showToast('No uploaded items selected.', 'error');
    return;
  }

  const items = (modal?._accMediaCache?.[tab] || []).filter(item => selected.includes(String(item.id)));
  if (!items.length) {
    showToast('No uploaded items selected.', 'error');
    return;
  }

  items.forEach((item, index) => {
    const path = item.file_path || item.image_path || item.video_path || '#';
    const link = document.createElement('a');
    link.href = path;
    link.target = '_blank';
    link.rel = 'noopener';
    link.download = item.file_name || item.image_name || item.video_name || `download-${index + 1}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  showToast(`${items.length} item(s) exported.`, 'success');
}

function accOpenAddProjectModal() {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="acc-modal-shell">
      <div class="acc-modal-header">
        <div class="acc-modal-title-row">
          <div class="acc-modal-icon"><i class="ri-folder-add-line"></i></div>
          <div>
            <div class="acc-modal-title">New Project</div>
            <div class="acc-modal-sub">Create a new acceptance project</div>
          </div>
        </div>
        <button class="acc-modal-close-btn" id="accProjClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="acc-modal-body">
        <label class="acc-modal-label">Project Name <span style="color:#ef4444">*</span></label>
        <input type="text" id="accProjNameInput" class="acc-modal-input" placeholder="e.g. Satellite Internet Infrastructure">
      </div>
      <div class="acc-modal-footer">
        <button class="acc-modal-cancel" id="accProjCancel">Cancel</button>
        <button class="acc-modal-submit" id="accProjSubmit"><i class="ri-save-line"></i> Create Project</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  document.getElementById('accProjClose').onclick  = close;
  document.getElementById('accProjCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  document.getElementById('accProjSubmit').addEventListener('click', async () => {
    const name = document.getElementById('accProjNameInput').value.trim();
    if (!name) { showToast('Please enter a project name.', 'error'); return; }
    const btn = document.getElementById('accProjSubmit');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Creating…';
    try {
      const res = await fetch('/api/acceptance/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: name })
      });
      if (!res.ok) { const r = await res.json(); showToast(r.error || 'Failed.', 'error'); return; }
      close(); showToast('Project created!', 'success'); accFetchProjects();
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Create Project'; }
  });
}

function accOpenAddSiteModal(projectName) {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="acc-modal-shell">
      <div class="acc-modal-header">
        <div class="acc-modal-title-row">
          <div class="acc-modal-icon"><i class="ri-map-pin-add-line"></i></div>
          <div>
            <div class="acc-modal-title">Add Site</div>
            <div class="acc-modal-sub">${escHtml(projectName)}</div>
          </div>
        </div>
        <button class="acc-modal-close-btn" id="accSiteClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="acc-modal-body">
        <label class="acc-modal-label">Site Name <span style="color:#ef4444">*</span></label>
        <input type="text" id="accSiteNameInput" class="acc-modal-input" placeholder="e.g. VSTG2-L1-001">
        <label class="acc-modal-label" style="margin-top:14px;">Installer Name</label>
        <input type="text" id="accInstallerNameInput" class="acc-modal-input" placeholder="Installer name">
        <label class="acc-modal-label" style="margin-top:14px;">Initial Status</label>
        <div class="acc-modal-status-row">
          <label class="acc-modal-radio-label"><input type="radio" name="accSiteStatus" value="Pending" checked> Pending</label>
          <label class="acc-modal-radio-label"><input type="radio" name="accSiteStatus" value="Done"> Done</label>
        </div>
      </div>
      <div class="acc-modal-footer">
        <button class="acc-modal-cancel" id="accSiteCancel">Cancel</button>
        <button class="acc-modal-submit" id="accSiteSubmit"><i class="ri-save-line"></i> Add Site</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  document.getElementById('accSiteClose').onclick  = close;
  document.getElementById('accSiteCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  document.getElementById('accSiteSubmit').addEventListener('click', async () => {
    const name   = document.getElementById('accSiteNameInput').value.trim();
    const status = document.querySelector('input[name="accSiteStatus"]:checked')?.value || 'Pending';
    const installer_name = document.getElementById('accInstallerNameInput').value.trim();
    const acceptance_date = null;
    if (!name) { showToast('Please enter a site name.', 'error'); return; }
    const btn = document.getElementById('accSiteSubmit');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Adding…';
    try {
      const res = await fetch('/api/acceptance/sites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_name: name, status, project_name: projectName, uploaded_by: user?.id || null, installer_name })
      });
      if (!res.ok) { const r = await res.json(); showToast(r.error || 'Failed.', 'error'); return; }
      close(); showToast('Site added!', 'success');
      delete accAllSites[projectName];
      const card = document.querySelector(`.acc-project-card[data-project="${CSS.escape(projectName)}"]`);
      if (card) { await accFetchSites(projectName, card); await accRefreshProjectProgress(projectName); }
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Add Site'; }
  });
}

async function accLoadMediaTab(siteId, tab, modal, forceRefresh = false) {
  const body = modal.querySelector('#accMediaBody');
  const footerLeft = modal.querySelector('#accMediaFooterLeft');
  const selectBtn = modal.querySelector('#accMediaSelectBtn');
  if (!body) return;

  const key = accMediaSelectionKey(siteId, tab);
  const selectMode = !!accMediaSelectMode[key];
  const selected = accGetSelectedMediaSet(siteId, tab);

  if (footerLeft) footerLeft.innerHTML = '';
    if (selectBtn) {
    selectBtn.innerHTML = `<i class="${selectMode ? 'ri-check-line' : 'ri-checkbox-multiple-line'}"></i>`;
    selectBtn.title = selectMode ? 'Done selecting' : 'Select items';
    selectBtn.setAttribute('aria-label', selectMode ? 'Done selecting' : 'Select items');
    selectBtn.classList.toggle('active-tool', selectMode);
    selectBtn.classList.toggle('is-active', selectMode);
  }

  if (!modal._accMediaCache) modal._accMediaCache = {};

  let items = modal._accMediaCache[tab];

  if (forceRefresh || !items) {
    if (!body.children.length) {
      body.innerHTML = `<div class="acc-loading"><i class="ri-loader-4-line spin"></i><span>Loading…</span></div>`;
    }

    try {
      const res = await fetch(`/api/acceptance/sites/${siteId}/media`);
      const data = await res.json();
      modal._accMediaCache = data || {};
      items = modal._accMediaCache[tab] || [];
    } catch {
      if (!body.children.length) {
        body.innerHTML = `<div class="acc-media-empty"><i class="ri-error-warning-line"></i><span>Failed to load.</span></div>`;
      }
      return;
    }
  }

    if (selectMode && footerLeft) {
    footerLeft.innerHTML = `
      <div class="acc-media-bulkbar">
        <label class="bulk-select-all-wrap acc-media-select-all-wrap">
          <input type="checkbox" id="accMediaSelectAll">
          <span class="bulk-select-all-label"><i class="ri-check-double-line"></i> Select All</span>
        </label>

        <span class="bulk-count-badge acc-media-selected-badge" id="accMediaSelectedCount">
          <i class="ri-checkbox-multiple-line"></i> ${selected.size} selected
        </span>

        <button class="tool-btn" id="accMediaBulkExport" ${selected.size ? '' : 'disabled'}>
          <i class="ri-download-2-line"></i> Export
        </button>

        <button class="tool-btn danger-btn" id="accMediaBulkDelete" ${selected.size ? '' : 'disabled'}>
          <i class="ri-delete-bin-line"></i> Delete
        </button>
      </div>
    `;
  }

  if (!items.length) {
    body.innerHTML = `<div class="acc-media-empty"><i class="ri-inbox-line"></i><span>No ${tab} uploaded yet.</span></div>`;
    return;
  }

  body.innerHTML = `
    <div class="acc-media-list acc-media-grid">
      ${items.map(item => accMediaItemHTML(item, tab, selectMode, selected)).join('')}
    </div>
  `;

  if (selectMode) {
    const selectAll = modal.querySelector('#accMediaSelectAll');
    const selectedCount = modal.querySelector('#accMediaSelectedCount');
    const bulkDeleteBtn = modal.querySelector('#accMediaBulkDelete');
    const bulkExportBtn = modal.querySelector('#accMediaBulkExport');

    const syncBulkState = () => {
      const allChecked = items.length > 0 && items.every(item => selected.has(String(item.id)));
      const anyChecked = items.some(item => selected.has(String(item.id)));

      if (selectAll) {
        selectAll.checked = allChecked;
        selectAll.indeterminate = anyChecked && !allChecked;
      }

      if (selectedCount) {
        selectedCount.innerHTML = `<i class="ri-checkbox-multiple-line"></i> ${selected.size} selected`;
      }

      if (bulkDeleteBtn) bulkDeleteBtn.disabled = selected.size === 0;
      if (bulkExportBtn) bulkExportBtn.disabled = selected.size === 0;
    };

    syncBulkState();

    if (selectAll) {
      selectAll.addEventListener('change', function () {
        selected.clear();
        if (this.checked) items.forEach(item => selected.add(String(item.id)));
        accLoadMediaTab(siteId, tab, modal, false);
      });
    }

    body.querySelectorAll('.acc-media-select').forEach(chk => {
      chk.addEventListener('change', function () {
        if (this.checked) selected.add(this.value);
        else selected.delete(this.value);
        syncBulkState();
      });
    });

    bulkDeleteBtn?.addEventListener('click', () => accDeleteSelectedMedia(siteId, tab, modal));
    bulkExportBtn?.addEventListener('click', () => accExportSelectedMedia(siteId, tab, modal));
  }

      const closeAccMediaMenus = () => {
    body.querySelectorAll('.acc-media-item.menu-open').forEach(el => {
      el.classList.remove('menu-open', 'menu-drop-up');
    });
  };

  body.querySelectorAll('.acc-media-menu-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const item = this.closest('.acc-media-item');
      const menu = item?.querySelector('.acc-media-menu');
      const dropdown = item?.querySelector('.acc-media-menu-dropdown');
      if (!item || !menu || !dropdown) return;

      const willOpen = !item.classList.contains('menu-open');

      closeAccMediaMenus();
      if (!willOpen) return;

      item.classList.add('menu-open');

      requestAnimationFrame(() => {
        item.classList.remove('menu-drop-up');

        const rect = dropdown.getBoundingClientRect();
        const viewportGap = 12;
        const notEnoughBelow = rect.bottom > (window.innerHeight - viewportGap);
        const enoughAbove = rect.height < (btn.getBoundingClientRect().top - viewportGap);

        if (notEnoughBelow && enoughAbove) {
          item.classList.add('menu-drop-up');
        }
      });
    });
  });

  body.querySelectorAll('.acc-media-download-action').forEach(link => {
    link.addEventListener('click', () => {
      closeAccMediaMenus();
    });
  });

  body.querySelectorAll('.acc-media-delete-action').forEach(btn => {
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (!confirm('Delete this file?')) return;

      try {
        const r = await fetch(`/api/acceptance/${this.dataset.type}/${this.dataset.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error();

        selected.delete(String(this.dataset.id));
        closeAccMediaMenus();
        showToast('Deleted.', 'success');
        await accLoadMediaTab(siteId, tab, modal, true);

        const row = document.querySelector(`.acc-site-row[data-id="${siteId}"]`);
        if (row) {
          const card = row.closest('.acc-project-card');
          if (card) {
            const pn = card.dataset.project;
            delete accAllSites[pn];
            await accFetchSites(pn, card);
          }
        }
      } catch {
        showToast('Delete failed.', 'error');
      }
    });
  });

  if (modal._accMenuOutsideHandler) {
    document.removeEventListener('click', modal._accMenuOutsideHandler);
  }

  modal._accMenuOutsideHandler = function (e) {
    if (!modal.isConnected) {
      document.removeEventListener('click', modal._accMenuOutsideHandler);
      modal._accMenuOutsideHandler = null;
      return;
    }

    if (!e.target.closest('.acc-media-menu')) {
      closeAccMediaMenus();
    }
  };

  document.addEventListener('click', modal._accMenuOutsideHandler);
}

function accAllowedUploadConfig(tab) {
  if (tab === 'images') {
    return {
      accept: 'image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
      exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
      mimePrefix: 'image/'
    };
  }
  if (tab === 'videos') {
    return {
      accept: 'video/*,.mp4,.webm,.mov,.avi,.mkv,.m4v',
      exts: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'],
      mimePrefix: 'video/'
    };
  }
  return {
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar',
    exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar'],
    mimePrefix: null
  };
}

function accIsValidUploadFile(file, tab) {
  const cfg = accAllowedUploadConfig(tab);
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const mime = String(file.type || '').toLowerCase();

  if (cfg.mimePrefix && mime.startsWith(cfg.mimePrefix)) return true;
  return cfg.exts.includes(ext);
}

function _accSetUploadAccept(tab, inputEl = null) {
  const input = inputEl || document.getElementById('accUploadInput');
  if (!input) return;
  const cfg = accAllowedUploadConfig(tab);
  input.accept = cfg.accept;
  input.multiple = true;
  input.dataset.tab = tab;
  input.value = '';
}
function accMediaItemHTML(item, tab, selectMode = false, selected = new Set()) {
  const rawName = item.file_name || item.image_name || item.video_name || 'Unknown';
  const name    = escHtml(rawName);
  const size    = item.file_size ? `${parseFloat(item.file_size).toFixed(1)} KB` : '';
  const path    = item.file_path || item.image_path || item.video_path || '#';
  const date    = item.uploaded_at
    ? new Date(item.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const by      = item.uploader_name ? `by ${escHtml(item.uploader_name)}` : '';
  const typeKey = tab === 'images' ? 'images' : tab === 'videos' ? 'videos' : 'files';

  let thumb = '';
  if (tab === 'images') {
    thumb = `<div class="acc-media-thumb"><img src="${path}" alt="${name}" onerror="this.parentElement.innerHTML='<i class=\\'ri-image-line\\'></i>'"></div>`;
  } else if (tab === 'videos') {
    thumb = `<div class="acc-media-thumb acc-media-thumb-video"><i class="ri-film-line"></i></div>`;
  } else {
    const ext = (rawName.split('.').pop() || '').toLowerCase();
    const icon = ext === 'pdf'
      ? 'ri-file-pdf-2-line'
      : ext.match(/doc/)
        ? 'ri-file-word-line'
        : ext.match(/xls|csv/)
          ? 'ri-file-excel-line'
          : ext.match(/ppt/)
            ? 'ri-file-ppt-2-line'
            : 'ri-file-line';

    thumb = `<div class="acc-media-thumb acc-media-thumb-file"><i class="${icon}"></i></div>`;
  }

  return `
    <div class="acc-media-item ${selectMode ? 'select-mode' : ''}">
      <label class="acc-media-check ${selectMode ? 'is-visible' : ''}" aria-label="Select ${name}">
        <input
          type="checkbox"
          class="acc-media-select"
          value="${item.id}"
          ${selected.has(String(item.id)) ? 'checked' : ''}
          ${selectMode ? '' : 'tabindex="-1"'}
        >
      </label>

      ${thumb}

      <div class="acc-media-info">
        <div class="acc-media-name" title="${name}">${name}</div>
        <div class="acc-media-meta">${[size, date, by].filter(Boolean).join(' • ')}</div>
      </div>

      <div class="acc-media-actions">
        <div class="acc-media-menu">
          <button
            type="button"
            class="acc-upload-btn acc-media-menu-btn"
            title="More actions"
            aria-label="More actions"
          >
            <i class="ri-more-2-fill"></i>
          </button>

          <div class="acc-media-menu-dropdown">
            <a
              class="acc-media-menu-action acc-media-download-action"
              href="${path}"
              download
              target="_blank"
              rel="noopener"
            >
              <i class="ri-download-2-line"></i>
              <span>Download</span>
            </a>

            <button
              type="button"
              class="acc-media-menu-action acc-media-delete-action"
              data-id="${item.id}"
              data-type="${typeKey}"
            >
              <i class="ri-delete-bin-line"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}


window.NOC_PAGE_DEFS = {
  dashboard: { label: "Dashboard", icon: "ri-dashboard-line", loader: () => loadDashboard() },
  map: { label: "Map", icon: "ri-map-2-line", loader: () => loadMap() },
  terminals: { label: "Terminals", icon: "ri-terminal-line", loader: () => loadTerminals() },
  problematicSites: { label: "Problematic Sites", icon: "ri-error-warning-line", loader: () => loadProblematicSites() },
  acceptance: { label: "Acceptance", icon: "ri-checkbox-circle-line", loader: () => loadAcceptance() },
  ticket: { label: "Ticket", icon: "ri-ticket-line", loader: () => loadTickets() },
  reports: { label: "Reports", icon: "ri-bar-chart-line", loader: () => loadReports() },
  letters: { label: "Files", icon: "ri-file-line", loader: () => loadLetters() },
  inventory: { label: "Inventory", icon: "ri-archive-2-line", loader: () => loadInventory() },
  settings: { label: "Settings", icon: "ri-settings-3-line", loader: () => loadSettings() },
  logout: { label: "Log Out", icon: "ri-logout-circle-r-line", loader: () => showLogoutModal() }
};
window.NOC_SIDEBAR_SECTIONS = [
  { label: 'Main', pages: ['dashboard', 'map'] },
  { label: 'Operations', pages: ['terminals', 'problematicSites', 'acceptance'] },
  { label: 'Management', pages: ['ticket', 'reports', 'letters', 'inventory'] },
  { label: 'System', pages: ['settings', 'logout'] }
];
window.NOC_START_PAGE = 'dashboard';
