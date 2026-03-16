/* ================= USER SESSION ================= */

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  window.location.href = "index.html";
}

/* ================= GLOBAL ================= */

/* ── Dashboard event bus ─────────────────────────────────
   Call dashboardDataChanged() from any page that mutates data
   (add/edit/delete terminals, tickets, problematic sites).
   If the dashboard is currently visible it will silently
   re-fetch stats; otherwise the next visit picks up fresh data.
──────────────────────────────────────────────────────────── */
function dashboardDataChanged() {
  if (document.getElementById('dashCards')) {
    fetchDashboardStats(false);
  }
}


const mainContent = document.getElementById("mainContent");

let currentPage = 1;
const rowsPerPage = 7;

/* ================= SIDEBAR ================= */

document.querySelectorAll(".menu li").forEach(item => {
  item.addEventListener("click", function () {
    if (this.id === "logout") return;
    document.querySelectorAll(".menu li").forEach(li => li.classList.remove("active"));
    this.classList.add("active");
    const text = this.innerText.trim();
    if (text === "Dashboard") loadDashboard();
    if (text === "Problematic Sites") loadProblematicSites();
    if (text === "Ticket") loadTickets();
    if (text === "Terminals") loadTerminals();
    if (text === "Letters") loadLetters();
    if (text === "Reports") loadReports();
    if (text === "Map") loadMap();
    if (text === "Settings") loadSettings();
  });
});

/* ================= REPORTS ================= */

let expandedReportId = null;
let allReportData    = [];

function loadReports() {
  expandedReportId = null;
  allReportData    = [];

  mainContent.innerHTML = `
    <div class="rpt-page">
      <div class="rpt-topbar">
        <h2 class="rpt-title"><i class="ri-bar-chart-2-line"></i> Reports</h2>
        <div class="rpt-topbar-right">
          <div class="rpt-search-box">
            <i class="ri-search-line"></i>
            <input type="text" id="rptSearch" placeholder="Search region…">
          </div>
          <button class="rpt-center-btn">
            <i class="ri-file-chart-line"></i> Regional Progress Report
          </button>
          <button class="rpt-add-btn" id="rptAddBtn">
            <i class="ri-add-line"></i> Add Region
          </button>
        </div>
      </div>

      <div class="rpt-date-bar">
        <i class="ri-calendar-2-line"></i>
        <span>January 25 &ndash; February 23, 2026</span>
      </div>

      <div class="rpt-card">
        <table class="rpt-table" id="rptTable">
          <thead>
            <tr class="rpt-thead-row">
              <th>Region</th>
              <th>MIR</th>
              <th>Deadline</th>
              <th>Ticket</th>
              <th>SLA</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody id="rptTbody">
            <tr><td colspan="6" class="rpt-empty-cell">
              <i class="ri-loader-4-line spin"></i> Loading…
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  fetchReports();

  document.getElementById('rptSearch').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderReportRows(allReportData.filter(r =>
      (r.region||'').toLowerCase().includes(q)
    ));
  });

  document.getElementById('rptAddBtn').addEventListener('click', () => openReportModal());
}

async function fetchReports() {
  try {
    const res  = await fetch('/api/reports');
    const data = await res.json();
    allReportData = data;
    renderReportRows(data);
  } catch {
    const tb = document.getElementById('rptTbody');
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="rpt-empty-cell"><i class="ri-error-warning-line"></i> Failed to load reports</td></tr>`;
  }
}

function rptBar(pct) {
  const v = parseFloat(pct) || 0;
  const c = v >= 80 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
  return `
    <div class="rpt-bar-wrap">
      <div class="rpt-bar-track">
        <div class="rpt-bar-fill" style="width:${v}%;background:${c};"></div>
      </div>
      <span class="rpt-bar-pct" style="color:${c};">${v}%</span>
    </div>`;
}

function rptCircle(pct) {
  const v    = Math.min(100, parseFloat(pct) || 0);
  const c    = v >= 80 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
  const R    = 22;
  const circ = 2 * Math.PI * R;
  // At 100% use full circumference with 0 gap so circle is solid
  const dash = v >= 100 ? circ : (v / 100) * circ;
  const gap  = v >= 100 ? 0    : circ - dash;
  return `
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="#e5e7eb" stroke-width="5"/>
      <circle cx="28" cy="28" r="${R}" fill="none" stroke="${c}" stroke-width="5"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
        stroke-linecap="butt"/>
      <text x="28" y="33" text-anchor="middle" font-size="10.5" font-weight="700" fill="${c}">${v}%</text>
    </svg>`;
}

function renderReportRows(data) {
  const tbody = document.getElementById('rptTbody');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="rpt-empty-cell"><i class="ri-inbox-line"></i> No reports found</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  data.forEach(row => {
    // Schema: mir, ticket, sla come from latest linked other_data via JOIN
    const mirPct    = parseFloat(row.mir      ?? 0);
    const ticketPct = parseFloat(row.ticket   ?? 0);
    const slaPct    = parseFloat(row.sla      ?? 0);
    const progress = parseFloat(row.progress ?? ((parseFloat(row.mir||0) + parseFloat(row.ticket||0) + parseFloat(row.sla||0)) / 3));
    const isExpanded = expandedReportId === row.id;

    const tr = document.createElement('tr');
    tr.className = 'rpt-row' + (isExpanded ? ' rpt-row-open' : '');
    tr.dataset.id = row.id;
    tr.innerHTML = `
      <td><span class="rpt-region-badge">${row.region || '—'}</span></td>
      <td>${rptBar(mirPct)}</td>
      <td>${(() => {
        if (!row.date_start && !row.date_end) return '<span class="rpt-no-val">—</span>';
        const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '?';
        const dEnd  = row.date_end ? new Date(row.date_end) : null;
        const today = new Date(); today.setHours(0,0,0,0);
        if (dEnd) dEnd.setHours(0,0,0,0);
        const range = fmt(row.date_start) + ' – ' + fmt(row.date_end);
        if (dEnd && dEnd < today)
          return '<span class="rpt-deadline-overdue"><i class="ri-error-warning-line"></i> ' + range + '</span>';
        if (dEnd && dEnd.getTime() === today.getTime())
          return '<span class="rpt-deadline-today"><i class="ri-alarm-line"></i> ' + range + '</span>';
        return '<span class="rpt-deadline-ok"><i class="ri-calendar-check-line"></i> ' + range + '</span>';
      })()}</td>
      <td>${rptBar(ticketPct)}</td>
      <td>${rptBar(slaPct)}</td>
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
      <td colspan="6" class="rpt-expand-cell">
        <div class="rpt-panel ${isExpanded ? 'open' : ''}" id="rpt-panel-${row.id}">
          <div class="rpt-panel-header">
            <div class="rpt-panel-title">
              <i class="ri-history-line"></i>
              Reminder &mdash; <strong>${row.region || ''}</strong>
            </div>
            <div class="rpt-panel-actions">
              <button class="rpt-panel-add-btn" data-report-id="${row.id}" data-region="${row.region || ''}">
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
                  <th>MIR</th>
                  <th>Ticket</th>
                  <th>SLA</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody id="rpt-rem-tbody-${row.id}">
                <tr><td colspan="5" class="rpt-empty-cell">
                  <i class="ri-loader-4-line spin"></i> Loading…
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(expandTr);

    if (isExpanded) fetchReminders(row.id);
  });

  // Expand / collapse
  tbody.querySelectorAll('.rpt-expand-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const id = parseInt(this.dataset.id);
      expandedReportId = (expandedReportId === id) ? null : id;
      const q = document.getElementById('rptSearch')?.value.toLowerCase() || '';
      renderReportRows(allReportData.filter(r =>
        !q || (r.region||'').toLowerCase().includes(q)
      ));
      if (expandedReportId) {
        setTimeout(() => {
          document.querySelector('.rpt-expand-row.open')
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }
    });
  });

  // Edit region
  tbody.querySelectorAll('.rpt-edit-report-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = allReportData.find(r => r.id === parseInt(btn.dataset.id));
      if (row) openReportModal(row);
    });
  });

  // Delete region
  tbody.querySelectorAll('.rpt-del-report-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirmDeleteModal(1, async () => {
        await fetch(`/api/reports/${btn.dataset.id}`, { method: 'DELETE' });
        expandedReportId = null;
        await fetchReports();
        showToast('Region deleted.', 'success');
      });
    });
  });

  // Add update
  tbody.querySelectorAll('.rpt-panel-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openReminderModal(parseInt(btn.dataset.reportId), btn.dataset.region);
    });
  });
}

async function fetchReminders(regionId) {
  const tbody = document.getElementById(`rpt-rem-tbody-${regionId}`);
  if (!tbody) return;
  try {
    const res  = await fetch(`/api/reports/${regionId}/history`);
    const data = await res.json();
    renderReminderRows(regionId, data);
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" class="rpt-empty-cell"><i class="ri-error-warning-line"></i> Failed to load</td></tr>`;
  }
}

function renderReminderRows(regionId, data) {
  const tbody = document.getElementById(`rpt-rem-tbody-${regionId}`);
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="rpt-empty-cell"><i class="ri-inbox-line"></i> No updates yet — click <strong>Add Update</strong> to log progress.</td></tr>`;
    return;
  }

  // Already sorted newest first from server (ORDER BY o.date DESC)
  tbody.innerHTML = data.map((r, idx) => {
    const isLatest  = idx === 0;
    const mirVal    = r.mir    != null ? parseFloat(r.mir).toFixed(1)    + '%' : '—';
    const ticketVal = r.ticket != null ? parseFloat(r.ticket).toFixed(1) + '%' : '—';
    const slaVal    = r.sla    != null ? parseFloat(r.sla).toFixed(1)    + '%' : '—';
    const dateStr   = r.date
      ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const byName = r.created_by_name || r.created_by || '<span class="rpt-no-val">—</span>';
    return `
      <tr class="rpt-rem-row ${isLatest ? 'rpt-rem-latest' : ''}">
        <td class="rpt-rem-date">
          ${isLatest ? '<span class="rpt-latest-badge">Latest</span>' : ''}
          ${dateStr}
        </td>
        <td><span class="rpt-rem-val">${mirVal}</span></td>
        <td><span class="rpt-rem-val">${ticketVal}</span></td>
        <td><span class="rpt-rem-val">${slaVal}</span></td>
        <td class="rpt-rem-by">${byName}</td>
      </tr>
    `;
  }).join('');
}

// ── Add/Edit Region Modal ──────────────────────────────────────────────────────
function openReportModal(existing = null) {
  const isEdit = !!existing;
  const m = document.createElement('div');
  m.id = 'rptReportModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box add-modal-box" style="max-width:440px;">
      <div class="add-modal-header">
        <div class="add-modal-icon"><i class="ri-bar-chart-2-line"></i></div>
        <div class="add-modal-title">
          <h3>${isEdit ? 'Edit Region' : 'Add Region'}</h3>
          <p>${isEdit ? 'Update the regional entry.' : 'Create a new regional progress entry.'}</p>
        </div>
        <button class="modal-close-btn" id="rptModalClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="add-modal-body">
        <div class="add-fields-grid" style="grid-template-columns:1fr;">
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-map-pin-line"></i> Region *</label>
            <input type="text" id="rpt-f-region" class="add-field-input" placeholder="e.g. BENGUET" value="${existing?.region || ''}">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-calendar-line"></i> Start Date</label>
            <input type="date" id="rpt-f-date-start" class="add-field-input" value="${existing?.date_start ? existing.date_start.split('T')[0] : ''}">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-calendar-check-line"></i> End Date</label>
            <input type="date" id="rpt-f-date-end" class="add-field-input" value="${existing?.date_end ? existing.date_end.split('T')[0] : ''}">
          </div>

        </div>
      </div>
      <div class="add-modal-footer">
        <span class="add-modal-hint"><i class="ri-information-line"></i> Fields marked * are required</span>
        <div class="modal-actions">
          <button class="tool-btn" id="rptModalCancel">Cancel</button>
          <button class="tool-btn apply-btn" id="rptModalSave">
            <i class="ri-save-line"></i> ${isEdit ? 'Save Changes' : 'Add Region'}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);

  const close = () => m.remove();
  document.getElementById('rptModalClose').onclick  = close;
  document.getElementById('rptModalCancel').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };

  document.getElementById('rptModalSave').onclick = async () => {
    const region = document.getElementById('rpt-f-region').value.trim();
    if (!region) { showToast('Region is required.', 'error'); return; }
    const payload = {
      region,
      date_start: document.getElementById('rpt-f-date-start').value || null,
      date_end:   document.getElementById('rpt-f-date-end').value   || null,
    };
    const btn = document.getElementById('rptModalSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const url    = isEdit ? `/api/reports/${existing.id}` : '/api/reports';
      const method = isEdit ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!res.ok) { showToast('Save failed: ' + (result.error || 'Unknown'), 'error'); return; }
      close();
      await fetchReports();
      showToast(isEdit ? 'Region updated.' : 'Region added.', 'success');
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = `<i class="ri-save-line"></i> ${isEdit ? 'Save Changes' : 'Add Region'}`; }
  };
}

// ── Add Update Modal ───────────────────────────────────────────────────────────
function openReminderModal(regionId, region) {
  // Get logged-in user id and name from session
  const loggedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const fullName   = loggedUser.full_name || loggedUser.name || loggedUser.username || 'Unknown';
  const userId     = loggedUser.id || null;

  const m = document.createElement('div');
  m.id = 'rptReminderModal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box add-modal-box" style="max-width:440px;">
      <div class="add-modal-header">
        <div class="add-modal-icon" style="background:rgba(255,255,255,0.15)"><i class="ri-history-line"></i></div>
        <div class="add-modal-title">
          <h3>Add Update</h3>
          <p>Region: <strong>${region || ''}</strong></p>
        </div>
        <button class="modal-close-btn" id="remModalClose"><i class="ri-close-line"></i></button>
      </div>
      <div class="add-modal-body">
        <div class="add-fields-grid" style="grid-template-columns:1fr;">
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-signal-wifi-line"></i> MIR (%)</label>
            <input type="number" id="rem-f-mir" class="add-field-input" placeholder="0–100" min="0" max="100" step="0.01">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-ticket-2-line"></i> Ticket (%)</label>
            <input type="number" id="rem-f-ticket" class="add-field-input" placeholder="0–100" min="0" max="100" step="0.01">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-shield-check-line"></i> SLA (%)</label>
            <input type="number" id="rem-f-sla" class="add-field-input" placeholder="0–100" min="0" max="100" step="0.01">
          </div>
          <div class="add-field-item">
            <label class="add-field-label"><i class="ri-user-line"></i> Updated By</label>
            <input type="text" class="add-field-input" value="${fullName}" readonly
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
    const payload = {
      report_id:  regionId,
      mir:        document.getElementById('rem-f-mir').value    || null,
      ticket:     document.getElementById('rem-f-ticket').value || null,
      sla:        document.getElementById('rem-f-sla').value    || null,
      created_by: userId,
    };
    const btn = document.getElementById('remModalSave');
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
    try {
      const res    = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!res.ok) { showToast('Save failed: ' + (result.error || 'Unknown'), 'error'); return; }
      close();
      fetchReminders(regionId);
      await fetchReports();
      showToast('Update saved — main table refreshed.', 'success');
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save Update'; }
  };
}


/* ================= MAP ================= */

function loadMap() {
  mainContent.innerHTML = `
    <div class="map-page-wrap">

      <!-- TOP ROW: filters -->
      <div class="map-filters-bar">
        <div class="map-search-box">
          <i class="ri-search-line"></i>
          <input type="text" id="mapSearch" placeholder="Search site, municipality…">
        </div>
        <select id="mapProjectFilter"  class="map-filter-select"><option value="">All Projects</option></select>
        <select id="mapProvinceFilter" class="map-filter-select"><option value="">All Provinces</option></select>
        <select id="mapStatusFilter"   class="map-filter-select">
          <option value="">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <div class="map-stats-chips">
          <span class="map-stat-chip" id="mapStatTotal"><i class="ri-map-pin-2-line"></i> — Total</span>
          <span class="map-stat-chip active-chip" id="mapStatActive"><i class="ri-radio-button-fill"></i> — Active</span>
          <span class="map-stat-chip inactive-chip" id="mapStatInactive"><i class="ri-radio-button-line"></i> — Inactive</span>
        </div>
      </div>

      <!-- BOTTOM ROW: sidebar | map | details -->
      <div class="map-main-row">

        <!-- LEFT: site list -->
        <div class="map-sidebar" id="mapSidebar">
          <div class="map-sidebar-title"><i class="ri-list-check-3"></i> Sites</div>
          <div class="map-sidebar-list" id="mapSiteList">
            <div class="map-list-loading"><i class="ri-loader-4-line spin"></i> Loading sites…</div>
          </div>
        </div>

        <!-- CENTER: map card with overlay panel -->
        <div class="map-card-wrap">
          <div id="mapContainer" class="map-container"></div>

          <!-- Overlay details panel -->
          <div class="map-details-panel hidden" id="mapDetailsPanel">
            <div class="map-details-header" id="mapDetailsHeader">
              <div class="map-details-title-wrap">
                <div class="map-details-name" id="mapDetailsName">—</div>
                <div class="map-details-sub"  id="mapDetailsSub">—</div>
              </div>
              <div class="map-details-header-actions">
                <button class="map-details-edit-btn" id="mapDetailsEditBtn">
                  <i class="ri-edit-line"></i> Edit
                </button>
                <button class="map-details-close-btn" id="mapDetailsPanelClose">
                  <i class="ri-close-line"></i>
                </button>
              </div>
            </div>
            <div class="map-details-body" id="mapDetailsBody"></div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Load Leaflet
  if (!document.getElementById('leafletCss')) {
    const l = document.createElement('link');
    l.id = 'leafletCss'; l.rel = 'stylesheet';
    l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(l);
  }
  if (typeof L === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => initMap();
    document.head.appendChild(s);
  } else {
    initMap();
  }
}

function initMap() {
  const container = document.getElementById('mapContainer');
  if (!container) return;

  const map = L.map('mapContainer', { zoomControl: false }).setView([16.5, 121.0], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  // ── Icons ─────────────────────────────────────────────────────────────────
  function makeIcon(color, size = 32) {
    return L.divIcon({
      className: '',
      html: `<div class="map-pin" style="--pin-color:${color};">
               <i class="ri-map-pin-2-fill"></i>
             </div>`,
      iconSize: [size, size], iconAnchor: [size/2, size], popupAnchor: [0, -(size+4)]
    });
  }
  const iconActive   = makeIcon('#c0392b');      // red  — active
  const iconInactive = makeIcon('#c0392b', 28);  // same red, slightly smaller
  const iconSelected = makeIcon('#f59e0b', 36);  // amber — selected

  // ── State ─────────────────────────────────────────────────────────────────
  let allSites     = [];
  let allMarkers   = {};     // site_name → L.marker
  let selectedSite = null;

  function isActive(site) {
    return site.is_active === true || site.is_active === 't' || site.is_active === 'true' || site.is_active === 1;
  }

  // ── Plot markers ──────────────────────────────────────────────────────────
  function plotMarkers(sites) {
    Object.values(allMarkers).forEach(m => map.removeLayer(m));
    allMarkers = {};

    sites.forEach(site => {
      const lat = parseFloat(site.lat);
      const lng = parseFloat(site.long);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const active = isActive(site);
      const marker = L.marker([lat, lng], { icon: active ? iconActive : iconInactive }).addTo(map);

      marker.on('click', () => selectSite(site, marker));
      allMarkers[site.site_name] = marker;
    });
  }

  // ── Sidebar list ──────────────────────────────────────────────────────────
  function renderSiteList(sites) {
    const el = document.getElementById('mapSiteList');
    if (!el) return;
    if (!sites.length) { el.innerHTML = '<div class="map-list-empty">No sites match filters.</div>'; return; }

    el.innerHTML = sites.map(s => {
      const active = isActive(s);
      const hasPt  = s.lat && s.long;
      return `
        <div class="map-list-item ${selectedSite?.site_name === s.site_name ? 'selected' : ''}"
             data-name="${escHtml(s.site_name)}">
          <div class="map-list-dot" style="background:${active ? '#c0392b' : '#94a3b8'};
            ${active ? 'box-shadow:0 0 0 3px rgba(192,57,43,0.2)' : ''}"></div>
          <div class="map-list-text">
            <div class="map-list-name">${escHtml(s.site_name.replace(/^VSTG2-/, ''))}</div>
            <div class="map-list-meta">${escHtml(s.project_name || 'DICT438')} | ${escHtml(s.municipality || '—')}</div>
          </div>
          ${!hasPt ? '<span class="map-list-nocoord" title="No coordinates"><i class="ri-map-pin-off-line"></i></span>' : ''}
        </div>`;
    }).join('');

    el.querySelectorAll('.map-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const site   = allSites.find(s => s.site_name === item.dataset.name);
        const marker = allMarkers[item.dataset.name];
        if (site) selectSite(site, marker);
      });
    });
  }

  // ── Select site ───────────────────────────────────────────────────────────
  function selectSite(site, marker) {
    // Reset previous selected icon
    if (selectedSite) {
      const prev = allMarkers[selectedSite.site_name];
      if (prev) prev.setIcon(isActive(selectedSite) ? iconActive : iconInactive);
    }

    selectedSite = site;

    // Highlight marker
    if (marker) {
      marker.setIcon(iconSelected);
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 13), { duration: 0.7 });
    }

    // Sync sidebar
    document.querySelectorAll('.map-list-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.name === site.site_name);
    });
    const listEl = document.querySelector(`.map-list-item[data-name="${site.site_name}"]`);
    listEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Show details panel
    showDetailsPanel(site);
  }

  // ── Details panel ─────────────────────────────────────────────────────────
  function showDetailsPanel(site) {
    const panel = document.getElementById('mapDetailsPanel');
    panel.classList.remove('hidden');

    const active = isActive(site);

    document.getElementById('mapDetailsName').textContent =
      site.site_name.replace(/^VSTG2-/, '') || '—';
    document.getElementById('mapDetailsSub').textContent =
      `${site.project_name || 'DICT438'} | ${site.province || '—'}`;

    // Devices list (for expanded view)
    const devices = Array.isArray(site.devices) ? site.devices : [];
    const devHtml = devices.length
      ? devices.map(d => {
          // Extract device type suffix: AP1, AP2, ER
          const nameRaw = d.device_name || '—';
          const typeMatch = nameRaw.match(/\b(AP\s*1|AP\s*2|ER)\b/i);
          const typeLabel = typeMatch ? typeMatch[0].replace(/\s+/,'').toUpperCase() : nameRaw.split('-').pop();
          return `
          <div class="map-dev-row">
            <span class="map-dev-tag">${escHtml(typeLabel)}</span>
            <div class="map-dev-info">
              <span class="map-dev-model">${escHtml(d.model || '—')}</span>
              <span class="map-dev-sn">${escHtml(d.serial || '—')}</span>
            </div>
          </div>`;
        }).join('')
      : '<div class="map-dev-empty">No devices linked.</div>';

    document.getElementById('mapDetailsBody').innerHTML = `
      <!-- Status + Activate -->
      <div class="map-details-status-row">
        <span class="map-details-status-badge ${active ? 'active' : 'inactive'}">
          <i class="ri-radio-button-${active ? 'fill' : 'line'}"></i>
          ${active ? 'Active' : 'Inactive'}
        </span>
        <button class="map-activate-btn ${active ? 'deactivate' : 'activate'}" id="mapActivateBtn">
          <i class="ri-${active ? 'close' : 'check'}-circle-line"></i>
          ${active ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <!-- Overview: quick-glance info -->
      <div class="map-details-section">
        <div class="map-details-row"><span class="map-details-label">IP:</span><span>${escHtml(site.ip || '—')}</span></div>
        <div class="map-details-row"><span class="map-details-label">MAC:</span><span>${escHtml(site.mac || '—')}</span></div>
        <div class="map-details-row"><span class="map-details-label">Municipality:</span><span>${escHtml(site.municipality || '—')}</span></div>
        <div class="map-details-row"><span class="map-details-label">Coords:</span>
          <span>${site.lat ? parseFloat(site.lat).toFixed(5) : '—'}, ${site.long ? parseFloat(site.long).toFixed(5) : '—'}</span>
        </div>
      </div>

      <!-- See More expandable -->
      <button class="map-see-more-btn" id="mapSeeMoreBtn">
        <i class="ri-arrow-down-s-line"></i> See More
      </button>

      <!-- Expanded details (hidden by default) -->
      <div class="map-expanded-details hidden" id="mapExpandedDetails">
        <div class="map-details-section">
          <div class="map-details-section-title">EQUIPMENT SPECIFICATIONS</div>
          <div class="map-details-row"><span class="map-details-label">Modem:</span><span>${escHtml(site.modem || 'MDM2010')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Trans:</span><span>${escHtml(site.transceiver || 'ILB3210 Single Coax')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Dish:</span><span>${escHtml(site.dish || '1.2m Jonsa Satellite Dish')}</span></div>
        </div>
        <div class="map-details-section">
          <div class="map-details-section-title">CONTACTS</div>
          <div class="map-details-row"><span class="map-details-label">Personnel:</span><span>${escHtml(site.contacts || '—')}</span></div>
          <div class="map-details-row"><span class="map-details-label">Email:</span><span>${escHtml(site.email || '—')}</span></div>
        </div>
        <div class="map-details-section">
          <div class="map-details-section-title">NETWORK DEVICES</div>
          <div class="map-devices-list">${devHtml}</div>
        </div>
      </div>
    `;

    // Wire See More toggle
    document.getElementById('mapSeeMoreBtn').addEventListener('click', function() {
      const expanded = document.getElementById('mapExpandedDetails');
      const isOpen   = !expanded.classList.contains('hidden');
      expanded.classList.toggle('hidden', isOpen);
      this.innerHTML = isOpen
        ? '<i class="ri-arrow-down-s-line"></i> See More'
        : '<i class="ri-arrow-up-s-line"></i> See Less';
    });

    // Wire activate/deactivate
    document.getElementById('mapActivateBtn').addEventListener('click', () => {
      const newStatus = !active;
      if (!confirm(`${newStatus ? 'Activate' : 'Deactivate'} site "${site.site_name}"?`)) return;
      activateSite(site, newStatus);
    });

    // Wire close button
    document.getElementById('mapDetailsPanelClose').onclick = () => {
      document.getElementById('mapDetailsPanel').classList.add('hidden');
      if (selectedSite) {
        const m = allMarkers[selectedSite.site_name];
        if (m) m.setIcon(isActive(selectedSite) ? iconActive : iconInactive);
      }
      document.querySelectorAll('.map-list-item').forEach(el => el.classList.remove('selected'));
      selectedSite = null;
    };

    // Wire edit button
    document.getElementById('mapDetailsEditBtn').onclick = () => openMapEditModal(site);
  }

  // ── Activate / Deactivate ─────────────────────────────────────────────────
  async function activateSite(site, newStatus) {
    try {
      const res = await fetch(`/api/map/sites/${encodeURIComponent(site.site_name)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus })
      });
      if (!res.ok) throw new Error((await res.json()).error);

      // Update local data
      const idx = allSites.findIndex(s => s.site_name === site.site_name);
      if (idx !== -1) allSites[idx].is_active = newStatus;
      site.is_active = newStatus;

      // Update marker icon
      const marker = allMarkers[site.site_name];
      if (marker) marker.setIcon(iconSelected); // keep selected highlight

      // Refresh sidebar dot + details panel
      const filtered = getFiltered();
      renderSiteList(filtered);
      showDetailsPanel(site);

      showToast(`Site ${newStatus ? 'activated' : 'deactivated'} successfully.`, 'success');
    } catch(e) {
      showToast('Status update failed: ' + e.message, 'error');
    }
  }

  // ── Edit modal ────────────────────────────────────────────────────────────
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
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-router-line"></i> IP Address</label>
              <input type="text" id="mapEditIp" class="add-field-input" value="${escHtml(site.ip || '')}">
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-mac-line"></i> MAC Address</label>
              <input type="text" id="mapEditMac" class="add-field-input" value="${escHtml(site.mac || '')}">
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-focus-3-line"></i> Latitude</label>
              <input type="number" id="mapEditLat" class="add-field-input" step="0.0000001" value="${site.lat || ''}">
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-focus-3-line"></i> Longitude</label>
              <input type="number" id="mapEditLng" class="add-field-input" step="0.0000001" value="${site.long || ''}">
            </div>
            <div class="add-field-item" style="grid-column:1/-1;">
              <label class="add-field-label"><i class="ri-phone-line"></i> Contacts</label>
              <textarea id="mapEditContacts" class="add-field-input" style="resize:vertical;min-height:60px;">${escHtml(site.contacts || '')}</textarea>
            </div>
            <div class="add-field-item" style="grid-column:1/-1;">
              <label class="add-field-label"><i class="ri-mail-line"></i> Email / Social</label>
              <input type="text" id="mapEditEmail" class="add-field-input" value="${escHtml(site.email || '')}">
            </div>
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
    m.onclick = e => { if (e.target === m) close(); };

    document.getElementById('mapEditSave').onclick = async () => {
      const payload = {
        ip:       document.getElementById('mapEditIp').value.trim(),
        mac:      document.getElementById('mapEditMac').value.trim(),
        lat:      parseFloat(document.getElementById('mapEditLat').value) || null,
        long:     parseFloat(document.getElementById('mapEditLng').value) || null,
        contacts: document.getElementById('mapEditContacts').value.trim(),
        email:    document.getElementById('mapEditEmail').value.trim(),
      };
      const btn = document.getElementById('mapEditSave');
      btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';
      try {
        const res = await fetch(`/api/map/sites/${encodeURIComponent(site.site_name)}/edit`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).error);
        // Update local
        Object.assign(site, payload);
        const idx = allSites.findIndex(s => s.site_name === site.site_name);
        if (idx !== -1) Object.assign(allSites[idx], payload);
        // Update marker coords if changed
        if (payload.lat && payload.long) {
          const marker = allMarkers[site.site_name];
          if (marker) marker.setLatLng([payload.lat, payload.long]);
        }
        close();
        showDetailsPanel(site);
        showToast('Site updated.', 'success');
      } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save'; }
    };
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  function getFiltered() {
    const q      = (document.getElementById('mapSearch')?.value || '').toLowerCase();
    const proj   = document.getElementById('mapProjectFilter')?.value  || '';
    const prov   = document.getElementById('mapProvinceFilter')?.value || '';
    const status = document.getElementById('mapStatusFilter')?.value   || '';
    return allSites.filter(s => {
      if (q && !(
        (s.site_name    || '').toLowerCase().includes(q) ||
        (s.municipality || '').toLowerCase().includes(q) ||
        (s.province     || '').toLowerCase().includes(q)
      )) return false;
      if (proj   && s.project_name !== proj)   return false;
      if (prov   && s.province     !== prov)   return false;
      if (status === 'active'   && !isActive(s))  return false;
      if (status === 'inactive' && isActive(s))   return false;
      return true;
    });
  }

  function applyFilters() {
    const filtered = getFiltered();
    renderSiteList(filtered);
    updateMapStats(filtered);

    // Show/hide markers based on filters
    Object.entries(allMarkers).forEach(([name, marker]) => {
      const inFilter = filtered.some(s => s.site_name === name);
      if (inFilter) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });
  }

  ['mapSearch','mapProjectFilter','mapProvinceFilter','mapStatusFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener(id === 'mapSearch' ? 'input' : 'change', applyFilters);
  });

  // ── Load sites ────────────────────────────────────────────────────────────
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

  async function loadSites() {
    try {
      const res   = await fetch('/api/map/sites');
      allSites    = await res.json();

      // Populate dropdowns
      const projects  = [...new Set(allSites.map(s => s.project_name).filter(Boolean))].sort();
      const provinces = [...new Set(allSites.map(s => s.province).filter(Boolean))].sort();
      const pjSel = document.getElementById('mapProjectFilter');
      const pvSel = document.getElementById('mapProvinceFilter');
      projects.forEach(p  => { const o = document.createElement('option'); o.value = o.textContent = p;  pjSel.appendChild(o); });
      provinces.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p;  pvSel.appendChild(o); });

      renderSiteList(allSites);
      plotMarkers(allSites);
      updateMapStats(allSites);
      showToast(`${allSites.length} sites loaded.`, 'success');
    } catch(e) {
      document.getElementById('mapSiteList').innerHTML =
        '<div class="map-list-empty"><i class="ri-error-warning-line"></i> Failed to load sites.</div>';
    }
  }

  loadSites();
}


/* ================= LOGOUT ================= */

document.getElementById("logout").addEventListener("click", () => {
  showLogoutModal();
});

function showLogoutModal() {
  if (document.getElementById("logoutModal")) return;

  const modal = document.createElement("div");
  modal.id = "logoutModal";
  modal.className = "logout-modal-overlay";
  modal.innerHTML = `
    <div class="logout-modal-box">
      <div class="logout-modal-icon-wrap">
        <div class="logout-modal-icon-ring">
          <i class="ri-logout-circle-r-line"></i>
        </div>
      </div>

      <div class="logout-modal-body">
        <h2 class="logout-modal-title">Leaving so soon?</h2>
        <p class="logout-modal-sub">You're about to sign out of your session.<br>Any unsaved changes will be lost.</p>

        <div class="logout-user-card">
          <div class="logout-user-avatar"><i class="ri-user-3-line"></i></div>
          <div class="logout-user-info">
            <span class="logout-user-name">${JSON.parse(localStorage.getItem("user") || "{}").name || "Admin User"}</span>
            <span class="logout-user-role">Dashboard Administrator</span>
          </div>
          <span class="logout-user-badge"><i class="ri-checkbox-circle-fill"></i> Active</span>
        </div>

        <div class="logout-actions">
          <button class="logout-cancel-btn" id="logoutCancel">
            <i class="ri-arrow-left-line"></i> Stay Logged In
          </button>
          <button class="logout-confirm-btn" id="logoutConfirm">
            <i class="ri-logout-circle-r-line"></i> Yes, Log Out
          </button>
        </div>

        <p class="logout-hint"><i class="ri-shield-keyhole-line"></i> Your session data will be cleared for security.</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => modal.classList.add("open"));

  const close = () => {
    modal.classList.remove("open");
    modal.classList.add("closing");
    setTimeout(() => modal.remove(), 300);
  };

  document.getElementById("logoutCancel").onclick = close;
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  document.getElementById("logoutConfirm").onclick = () => {
    const btn = document.getElementById("logoutConfirm");
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Signing out…';
    setTimeout(() => {
      localStorage.removeItem("user");
      window.location.href = "index.html";
    }, 900);
  };
}

/* ================= SIDEBAR TOGGLE ================= */

// Sync body class and persist collapsed state
function syncSidebar(sidebar) {
  const isCollapsed = sidebar.classList.contains("collapsed");
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  localStorage.setItem("sidebarCollapsed", isCollapsed ? "1" : "0");
}

// Restore sidebar state on page load (before first paint)
(function () {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  if (localStorage.getItem("sidebarCollapsed") === "1") {
    sidebar.classList.add("collapsed");
  } else {
    sidebar.classList.remove("collapsed");
  }
  syncSidebar(sidebar);
})();

document.getElementById("toggleSidebar").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("collapsed");
  syncSidebar(sidebar);
});

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
    document.getElementById('btnSelect').classList.remove('active-tool');
    document.getElementById('bulkActions').classList.add('hidden');
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
        } catch (err) { showToast("Network error — could not delete record.", "error"); }
      });
    });
  });
}

function showConfirmDeleteModal(count, onConfirm) {
  const modal = document.getElementById("confirmDeleteModal");
  document.getElementById("confirmDeleteMsg").innerHTML =
    `You are about to permanently delete <strong>${count} record${count > 1 ? 's' : ''}</strong>.<br>This action <strong>cannot be undone</strong>.`;
  modal.classList.remove("hidden");
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const cancelBtn = document.getElementById("cancelDeleteBtn");
  const newConfirm = confirmBtn.cloneNode(true); confirmBtn.replaceWith(newConfirm);
  const newCancel = cancelBtn.cloneNode(true); cancelBtn.replaceWith(newCancel);
  const close = () => modal.classList.add("hidden");
  document.getElementById("cancelDeleteBtn").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.getElementById("confirmDeleteBtn").onclick = async () => { close(); await onConfirm(); };
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

/* ================= DASHBOARD ================= */

// Dashboard state — declared before loadDashboard so they exist on first call
let _dashPrev        = {};
let _chartProbStatus = null;
let _chartTickets    = null;

function loadDashboard() {
  mainContent.innerHTML = `
    <div class="topbar">
      <div class="left"><h2>Welcome back, ${user.full_name || user.email}</h2></div>
      <div class="right">
        <div class="search-box">
          <i class="ri-search-line"></i>
          <input type="text" placeholder="Search here">
        </div>
        <button id="darkToggle" class="icon-btn" title="Toggle Dark Mode"><i class="ri-moon-line"></i></button>
        <button id="dashRefreshBtn" class="icon-btn" title="Refresh dashboard"><i class="ri-refresh-line"></i></button>
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

  // Dark toggle
  document.getElementById('darkToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const icon = document.querySelector('#darkToggle i');
    icon.className = document.body.classList.contains('dark') ? 'ri-sun-line' : 'ri-moon-line';
  });

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
  document.getElementById('dashViewAllTickets').addEventListener('click', () => {
    document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
    document.querySelector('.menu li:nth-child(4)')?.classList.add('active');
    loadTickets();
  });

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

    // Muted professional palette
    const statusColors = {
      'offline':       '#64748b',
      'in progress':   '#94a3b8',
      'for monitoring':'#2f4b85',
      'online':        '#475569',
      'unknown':       '#cbd5e1',
      'low signal':    '#334155',
      'intermittent':  '#1e3a6e',
    };
    const fallback = ['#2f4b85','#475569','#64748b','#94a3b8','#cbd5e1','#1e3a6e'];
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
      <span class="dcl-item"><span class="dcl-dot" style="background:#2f4b85"></span>Total</span>
      <span class="dcl-item"><span class="dcl-dot" style="background:#64748b"></span>Open <strong>${open}</strong></span>
      <span class="dcl-item"><span class="dcl-dot" style="background:#475569"></span>Closed <strong>${closed}</strong></span>
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
            mkGrad(tkCanvas, '#2f4b85', 'rgba(47,75,133,0.4)'),
            mkGrad(tkCanvas, '#64748b', 'rgba(100,116,139,0.35)'),
            mkGrad(tkCanvas, '#475569', 'rgba(71,85,105,0.35)'),
          ],
          borderColor: ['#2f4b85','#64748b','#475569'],
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
          <label class="bulk-select-all-wrap">
            <input type="checkbox" id="probBulkSelectAllChk">
            <span class="bulk-select-all-label">Select All</span>
          </label>
          <span class="bulk-divider"></span>
          <span class="bulk-count-badge" id="probSelectedCount"><i class="ri-checkbox-multiple-line"></i> 0 selected</span>
          <div class="bulk-spacer"></div>
          <button class="tool-btn danger-btn" id="probDeleteSelected"><i class="ri-delete-bin-line"></i> Delete</button>
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
    document.getElementById("probRegionTitle").textContent = val + " — Problematic Sites";
    document.getElementById("probRegionView").classList.add("hidden");
    document.getElementById("probTableView").classList.remove("hidden");
    fetchProbData(val);
  });



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
      } catch (err) { showToast("Network error — could not delete.", "error"); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete Selected'; }
    });
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
        <div class="tk-row-main">
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
          <button class="row-action-btn view-btn tk-action-btn" data-id="${t.id}" title="View Details"><i class="ri-eye-line"></i></button>
          <div class="tk-avatar">${assignee}</div>
          <span class="tk-status-badge ${statusClass}">${escHtml(t.status)}</span>
        </div>
      </div>
    `;
  }).join("");
  list.querySelectorAll(".tk-action-btn.view-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const t = ticketData.find(x => String(x.id) === btn.dataset.id);
      if (t) openTkViewModal(t);
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

function lettersCurrentFolder() { return lettersFolderStack.length ? lettersFolderStack[lettersFolderStack.length - 1] : null; }
function lettersCurrentFolderId() { const f = lettersCurrentFolder(); return f ? f.id : null; }

function loadLetters() {
  lettersFolderStack    = [];
  lettersSearchQuery    = "";
  lettersFilterType     = "all";
  lettersFilterUploader = "";
  lettersFilterModified = "all";

  mainContent.innerHTML = `
    <div class="letters-topbar">
      <h2 class="letters-title"><i class="ri-mail-line"></i> Letters</h2>
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
          <div class="add-modal-title"><h3>New Folder</h3><p>Create a new folder to organise your letters.</p></div>
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
              <input id="newFileInput" type="file" class="add-field-input" accept=".pdf,.docx,.xlsx,.doc,.xls,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov,.avi,.mkv">
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

    <!-- Preview Modal -->
    <div id="lettersPreviewModal" class="modal-overlay hidden">
      <div class="letters-preview-box">
        <div class="letters-preview-header">
          <div class="letters-preview-title">
            <i class="ri-file-line" id="lettersPreviewIcon"></i>
            <span id="lettersPreviewName">Document</span>
          </div>
          <div class="letters-preview-header-actions">
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
  `;

  document.getElementById("lettersSearch").addEventListener("input", function () {
    lettersSearchQuery = this.value.trim();
    fetchLettersContent();
  });

  document.getElementById("lettersNewBtn").addEventListener("click", () => {
    openLettersNewChoiceMenu(document.getElementById("lettersNewBtn"));
  });

  fetchLettersRecent();
  fetchLettersContent();
  bindLettersFilterChips();
  updateLettersClearBtn();
  bindLettersPasteBtn();
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
    const res  = await fetch("/api/letters/files/recent");
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
      const res  = await fetch("/api/letters/folders");
      const data = await res.json();
      renderLettersFolders(data, null);
    } else {
      const q = lettersSearchQuery ? `?q=${encodeURIComponent(lettersSearchQuery)}` : "";
      const [subfoldersRes, filesRes] = await Promise.all([
        fetch(`/api/letters/folders?parent_id=${fid}`),
        fetch(`/api/letters/folders/${fid}/files${q}`)
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
    const fi = getLettersFileIcon(f.file_type);
    return `
      <div class="letters-recent-item" title="${f.file_name}">
        <i class="${fi.icon}" style="color:${fi.color};font-size:18px;flex-shrink:0;"></i>
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
  populateUploaderChip(files);
  if (filteredFiles.length) {
    html += `<div class="letters-section-label" style="margin-top:${filteredFolders.length ? "24px" : "0"}"><i class="ri-file-line"></i> Files</div>`;
    html += `<div class="letters-files-list">${filteredFiles.map(f => {
      const fi   = getLettersFileIcon(f.file_type);
      const size = formatFileSize(f.file_size);
      const date = f.created_at ? new Date(f.created_at).toLocaleDateString() : "";
      return `
        <div class="letters-file-row" data-id="${f.id}">
          <i class="${fi.icon}" style="color:${fi.color};font-size:24px;flex-shrink:0;"></i>
          <div class="letters-file-info">
            <div class="letters-file-name">${f.file_name}</div>
            <div class="letters-file-meta">${[f.uploader_name, size, date].filter(Boolean).join(" · ")}</div>
          </div>
          <button class="letters-kebab" data-type="file" data-id="${f.id}" data-name="${f.file_name}" data-filetype="${f.file_type}"><i class="ri-more-2-fill"></i></button>
        </div>
      `;
    }).join("")}</div>`;
  }
  if (!filteredFolders.length && !filteredFiles.length) {
    html = `<div class="letters-empty"><i class="ri-folder-open-line"></i><p>This folder is empty.<br>Click <strong>New</strong> to add a subfolder or file.</p></div>`;
  }
  content.innerHTML = html;
  bindFolderCardClicks(content);
  bindLettersKebabs(content);
}

function getLettersFileIcon(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("pdf"))                              return { icon: "ri-file-pdf-2-fill",   color: "#e74c3c" };
  if (t.includes("sheet") || t.includes("xls"))      return { icon: "ri-file-excel-2-fill", color: "#27ae60" };
  if (t.includes("word") || t.includes("doc"))       return { icon: "ri-file-word-2-fill",  color: "#2f4b85" };
  if (["mp4","webm","mov","avi","mkv","video"].includes(t)) return { icon: "ri-video-fill", color: "#8b5cf6" };
  return { icon: "ri-file-fill", color: "#6b7280" };
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
  dl.href = `/api/letters/files/${id}/download`;
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
  const previewUrl = `/api/letters/files/${id}/preview`;
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
      <a class="tool-btn apply-btn" href="/api/letters/files/${id}/download" target="_blank">
        <i class="ri-download-line"></i> Download to view
      </a>
    </div>
  `;
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
    const res    = await fetch(`/api/letters/files/${id}/copy`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_folder_id: targetFolderId })
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
    const res    = await fetch(`/api/letters/folders/${id}/copy`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_parent_id: targetParentId })
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
    const res    = await fetch(`/api/letters/files/${id}/copy`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_folder_id: folderId })
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
          <div class="kebab-item km-preview"><i class="ri-eye-line"></i> Preview</div>
          <div class="kebab-item km-download"><i class="ri-download-line"></i> Download</div>
          <div class="kebab-divider"></div>
          <div class="kebab-item km-copy"><i class="ri-file-copy-line"></i> Copy</div>
          <div class="kebab-item km-duplicate"><i class="ri-file-add-line"></i> Duplicate</div>
          <div class="kebab-divider"></div>
          <div class="kebab-item km-rename"><i class="ri-edit-line"></i> Rename</div>
          <div class="kebab-item kebab-danger km-delete"><i class="ri-delete-bin-line"></i> Delete</div>
        `;
        menu.querySelector(".km-preview").onclick   = () => { closeAllLettersKebabs(); openLettersPreview(id, name, ftype); };
        menu.querySelector(".km-download").onclick  = () => { closeAllLettersKebabs(); window.location.href = `/api/letters/files/${id}/download`; };
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
      const url    = type === "folder" ? `/api/letters/folders/${id}` : `/api/letters/files/${id}`;
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
      const url = type === "folder" ? `/api/letters/folders/${id}` : `/api/letters/files/${id}`;
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
      const res    = await fetch("/api/letters/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_name: name, parent_id }) });
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
      const res    = await fetch("/api/letters/files", { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) { showToast("Upload failed: " + (result.error || "Unknown"), "error"); return; }
      close(); fetchLettersContent(); fetchLettersRecent(); showToast("File uploaded.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-upload-line"></i> Upload'; }
  };
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

/* ================= INITIAL LOAD ================= */

// Apply saved display settings on startup
(function() {
  const brightness = localStorage.getItem('brightness');
  const fontSize   = localStorage.getItem('fontSize');
  const theme      = localStorage.getItem('theme');
  const nightLight = localStorage.getItem('nightLight') === 'true';
  if (brightness) document.body.style.opacity = (parseInt(brightness) / 100).toFixed(2);
  if (fontSize)   document.documentElement.style.fontSize = fontSize + 'px';
  if (theme === 'dark') document.body.classList.add('dark');
  if (nightLight) document.body.style.filter = 'sepia(0.3) brightness(0.96)';
})();

loadDashboard();

/* ================= SETTINGS ================= */

function loadSettings() {
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();

  mainContent.innerHTML = `
    <div class="stg-page">

      <div class="stg-topbar">
        <h2 class="stg-title">Settings</h2>
        <div class="stg-search-box">
          <i class="ri-search-line"></i>
          <input type="text" placeholder="Search here" id="stgSearch">
        </div>
      </div>

      <!-- Tabs -->
      <div class="stg-tabs">
        <button class="stg-tab active" data-tab="account">Account</button>
        <button class="stg-tab" data-tab="display">Display</button>
        <button class="stg-tab" data-tab="privacy">Privacy &amp; Data</button>
      </div>

      <!-- Account Tab -->
      <div class="stg-panel active" id="stg-tab-account">
        <div class="stg-card">

          <!-- Profile header -->
          <div class="stg-profile-header">
            <!-- Avatar with upload button -->
            <div class="stg-avatar-wrap">
              ${user.photo
                ? `<img src="${user.photo}" class="stg-avatar-img" id="stgAvatarImg" alt="Profile">`
                : `<div class="stg-avatar" id="stgAvatar">${user.full_name ? user.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : 'U'}</div>`
              }
              <label class="stg-avatar-upload-btn" for="stgPhotoInput" title="Change photo">
                <i class="ri-camera-line"></i>
              </label>
              <input type="file" id="stgPhotoInput" accept="image/*" style="display:none;">
            </div>
            <div class="stg-profile-info">
              <div class="stg-profile-name">${escHtml(user.full_name || '—')}</div>
              <span class="stg-role-badge">${escHtml(user.role || '—')}</span>
            </div>
            <button class="stg-edit-btn" id="stgEditBtn">
              <i class="ri-edit-line"></i> Edit
            </button>
          </div>

          <div class="stg-divider"></div>

          <!-- Profile fields -->
          <div class="stg-section-title">Profile</div>
          <div class="stg-fields-grid">
            <div class="stg-field-group">
              <label class="stg-field-label">Full Name</label>
              <input type="text" class="stg-field-input" id="stgFullName" value="${user.full_name || ''}" readonly>
            </div>
            <div class="stg-field-group">
              <label class="stg-field-label">ID Number</label>
              <input type="text" class="stg-field-input" id="stgIdNo" value="${user.id_no || ''}" readonly>
            </div>
            <div class="stg-field-group">
              <label class="stg-field-label">Email</label>
              <input type="text" class="stg-field-input" id="stgEmail" value="${user.email || ''}" readonly>
            </div>
            <div class="stg-field-group">
              <label class="stg-field-label">Role</label>
              <input type="text" class="stg-field-input" value="${user.role || ''}" readonly>
            </div>
          </div>

          <div class="stg-divider"></div>

          <!-- Actions -->
          <div class="stg-actions-row">
            <button class="stg-action-btn stg-primary-btn" id="stgChangePwBtn">
              <i class="ri-lock-password-line"></i> Change Password
            </button>
            <button class="stg-action-btn stg-secondary-btn" id="stgLeaveBtn">
              <i class="ri-calendar-todo-line"></i> Request for Leave
            </button>
          </div>
        </div>
      </div>

      <!-- Display Tab -->
      <div class="stg-panel" id="stg-tab-display">
        <div class="stg-card">

          <div class="stg-section-title">Brightness &amp; Color</div>
          <div class="stg-setting-card">
            <div class="stg-setting-row" style="border-bottom:1px solid #f1f5f9;">
              <div class="stg-setting-left">
                <div class="stg-setting-icon"><i class="ri-sun-line"></i></div>
                <div>
                  <div class="stg-setting-name">Brightness</div>
                  <div class="stg-setting-desc">Change the brightness for the built-in display</div>
                </div>
              </div>
              <input type="range" class="stg-slider" id="stgBrightness" min="20" max="100" value="100">
            </div>
            <div class="stg-setting-row">
              <div class="stg-setting-left">
                <div class="stg-setting-icon"><i class="ri-moon-line"></i></div>
                <div>
                  <div class="stg-setting-name">Night Light</div>
                  <div class="stg-setting-desc">Use warmer colors to help to block blue light</div>
                </div>
              </div>
              <label class="stg-toggle">
                <input type="checkbox" id="stgNightLight">
                <span class="stg-toggle-track"><span class="stg-toggle-thumb"></span></span>
              </label>
            </div>
          </div>

          <div class="stg-section-title" style="margin-top:24px;">Theme</div>
          <div class="stg-setting-card">
            <div class="stg-setting-row">
              <div class="stg-setting-left">
                <div class="stg-setting-icon"><i class="ri-contrast-2-line"></i></div>
                <div>
                  <div class="stg-setting-name">Choose Mode</div>
                  <div class="stg-setting-desc">Change the color that appear in your Windows and apps</div>
                </div>
              </div>
              <select class="stg-mode-select" id="stgThemeMode">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>

          <div class="stg-section-title" style="margin-top:24px;">Font</div>
          <div class="stg-setting-card">
            <div class="stg-setting-row">
              <div class="stg-setting-left">
                <div class="stg-setting-icon" style="font-weight:700;font-size:14px;gap:2px;display:flex;">
                  <span style="font-size:12px;">A</span><span style="font-size:18px;">A</span>
                </div>
                <div>
                  <div class="stg-setting-name">Text Size</div>
                  <div class="stg-setting-desc">Text size that appears throughout Windows and your apps</div>
                </div>
              </div>
              <div class="stg-font-row">
                <span class="stg-font-a small">A</span>
                <input type="range" class="stg-slider" id="stgFontSize" min="12" max="20" value="14" style="width:120px;">
                <span class="stg-font-a large">A</span>
                <button class="stg-apply-btn" id="stgFontApply">Apply</button>
              </div>
            </div>
          </div>

          <div class="stg-save-row">
            <button class="stg-save-btn" id="stgDisplaySave">
              <i class="ri-save-line"></i> Save Changes
            </button>
          </div>
        </div>
      </div>

      <!-- Privacy & Data Tab -->
      <div class="stg-panel" id="stg-tab-privacy">
        <div class="stg-card">

          <div class="stg-setting-card">
            <div class="stg-setting-name" style="padding:14px 18px 8px;font-weight:700;font-size:15px;">File Upload Privacy</div>
            <div class="stg-setting-row stg-checkbox-row" style="border-bottom:1px solid #f1f5f9;">
              <span class="stg-setting-desc" style="padding-left:18px;">Restrict evidence files to authorized users only</span>
              <label class="stg-checkbox-wrap">
                <input type="checkbox" id="stgPrivRestrict" checked>
                <span class="stg-checkbox-box"></span>
              </label>
            </div>
            <div class="stg-setting-row stg-checkbox-row">
              <span class="stg-setting-desc" style="padding-left:18px;">Allow public access to evidence files</span>
              <label class="stg-checkbox-wrap">
                <input type="checkbox" id="stgPrivPublic">
                <span class="stg-checkbox-box"></span>
              </label>
            </div>
          </div>

          <div class="stg-setting-card" style="margin-top:12px;">
            <div class="stg-setting-row stg-checkbox-row">
              <div>
                <div class="stg-setting-name">Backup</div>
                <div class="stg-setting-desc">Enable automatic system backup</div>
              </div>
              <label class="stg-checkbox-wrap">
                <input type="checkbox" id="stgBackup" checked>
                <span class="stg-checkbox-box"></span>
              </label>
            </div>
          </div>

          <div class="stg-setting-card" style="margin-top:12px;">
            <div class="stg-setting-row">
              <div>
                <div class="stg-setting-name">Data Management</div>
              </div>
              <button class="stg-export-btn" id="stgExportBtn">
                <i class="ri-download-2-line"></i> Export Reports
              </button>
            </div>
          </div>

          <div class="stg-setting-card stg-danger-card" style="margin-top:12px;">
            <div class="stg-setting-row">
              <div>
                <div class="stg-setting-name">Account Deletion Request</div>
                <div class="stg-setting-desc">If you wish to delete your account, a request will be sent to the admin for approval.</div>
              </div>
              <button class="stg-delete-btn" id="stgDeleteAccBtn">
                Request Account Deletion
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>

    <!-- Change Password Modal -->
    <div class="modal-overlay hidden" id="stgPwModal">
      <div class="modal-box add-modal-box" style="max-width:420px;">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-lock-password-line"></i></div>
          <div class="add-modal-title"><h3>Change Password</h3><p>Enter your current and new password.</p></div>
          <button class="modal-close-btn" id="stgPwClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid" style="grid-template-columns:1fr;">
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-lock-line"></i> Current Password</label>
              <input type="password" id="stgPwCurrent" class="add-field-input" placeholder="Current password">
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-lock-2-line"></i> New Password</label>
              <input type="password" id="stgPwNew" class="add-field-input" placeholder="New password">
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-lock-2-line"></i> Confirm New Password</label>
              <input type="password" id="stgPwConfirm" class="add-field-input" placeholder="Confirm new password">
            </div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"></span>
          <div class="modal-actions">
            <button class="tool-btn" id="stgPwCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="stgPwSave"><i class="ri-save-line"></i> Update Password</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Profile Modal -->
    <div class="modal-overlay hidden" id="stgEditModal">
      <div class="modal-box add-modal-box" style="max-width:420px;">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-user-settings-line"></i></div>
          <div class="add-modal-title"><h3>Edit Profile</h3><p>Update your display name and email.</p></div>
          <button class="modal-close-btn" id="stgEditClose"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div class="add-fields-grid" style="grid-template-columns:1fr;">
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-user-line"></i> Full Name</label>
              <input type="text" id="stgEditName" class="add-field-input" value="${user.full_name || ''}">
            </div>
            <div class="add-field-item">
              <label class="add-field-label"><i class="ri-mail-line"></i> Email</label>
              <input type="email" id="stgEditEmail" class="add-field-input" value="${user.email || ''}">
            </div>
          </div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"></span>
          <div class="modal-actions">
            <button class="tool-btn" id="stgEditCancel">Cancel</button>
            <button class="tool-btn apply-btn" id="stgEditSave"><i class="ri-save-line"></i> Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.stg-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.stg-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.stg-panel').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(`stg-tab-${this.dataset.tab}`).classList.add('active');
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
  document.getElementById('stgThemeMode').value = savedTheme;
  if (savedTheme === 'dark') document.body.classList.add('dark');

  document.getElementById('stgThemeMode').addEventListener('change', function() {
    if (this.value === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
    localStorage.setItem('theme', this.value);
  });

  // ── Display: Night Light ───────────────────────────────────────────────────
  const nightLight = localStorage.getItem('nightLight') === 'true';
  document.getElementById('stgNightLight').checked = nightLight;
  if (nightLight) document.body.style.filter = 'sepia(0.25) brightness(0.97)';

  document.getElementById('stgNightLight').addEventListener('change', function() {
    document.body.style.filter = this.checked ? 'sepia(0.25) brightness(0.97)' : '';
    localStorage.setItem('nightLight', this.checked);
  });

  // ── Display: Brightness ────────────────────────────────────────────────────
  const savedBright = localStorage.getItem('brightness') || '100';
  document.getElementById('stgBrightness').value = savedBright;
  document.body.style.opacity = (parseInt(savedBright) / 100).toFixed(2);

  document.getElementById('stgBrightness').addEventListener('input', function() {
    document.body.style.opacity = (parseInt(this.value) / 100).toFixed(2);
  });

  // ── Display: Font size ─────────────────────────────────────────────────────
  const savedFont = localStorage.getItem('fontSize') || '14';
  document.getElementById('stgFontSize').value = savedFont;

  document.getElementById('stgFontApply').onclick = () => {
    const size = document.getElementById('stgFontSize').value;
    document.documentElement.style.fontSize = size + 'px';
    localStorage.setItem('fontSize', size);
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
      const csv  = ['Region,Deadline,MIR,Ticket,SLA,Progress,Last Updated',
        ...data.map(r => [r.region, r.deadline||'', r.mir||'', r.ticket||'', r.sla||'', r.progress||'', r.last_updated||''].join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: 'reports_export.csv' });
      a.click(); URL.revokeObjectURL(url);
      showToast('Reports exported.', 'success');
    } catch { showToast('Export failed.', 'error'); }
  };

  // ── Request Leave ──────────────────────────────────────────────────────────
  document.getElementById('stgLeaveBtn').onclick = () => openLeaveModal(user);

}

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
    } catch { showToast('Network error.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-send-plane-fill"></i> Submit Request'; }
  });

  // ── Account Deletion Request ───────────────────────────────────────────────
  document.getElementById('stgDeleteAccBtn').onclick = () =>
    showToast('Account deletion request sent to admin.', 'success');

  // Apply saved display settings on load
  const fs = localStorage.getItem('fontSize');
  if (fs) document.documentElement.style.fontSize = fs + 'px';
}

function _stgApplyDisplaySettings() {
  const brightness = localStorage.getItem('brightness');
  const fontSize   = localStorage.getItem('fontSize');
  const theme      = localStorage.getItem('theme');
  const nightLight = localStorage.getItem('nightLight') === 'true';
  if (brightness) document.body.style.opacity = (parseInt(brightness) / 100).toFixed(2);
  if (fontSize)   document.documentElement.style.fontSize = fontSize + 'px';
  if (theme === 'dark') document.body.classList.add('dark');
  if (nightLight) document.body.style.filter = 'sepia(0.3) brightness(0.96)';
}