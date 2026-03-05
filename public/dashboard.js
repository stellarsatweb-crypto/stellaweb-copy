/* ================= USER SESSION ================= */

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  window.location.href = "index.html";
}

/* ================= GLOBAL ================= */

const mainContent = document.getElementById("mainContent");

let tickets = [
  { id: "TIC-001", site: "SITE-01", issue: "No Signal", priority: "High", status: "In Progress", date: "2026-02-20" },
  { id: "TIC-002", site: "SITE-07", issue: "Power Failure", priority: "Medium", status: "Pending", date: "2026-02-21" },
  { id: "TIC-003", site: "SITE-12", issue: "Battery Low", priority: "Low", status: "Completed", date: "2026-02-22" },
  { id: "TIC-004", site: "SITE-14", issue: "Router Offline", priority: "High", status: "Pending", date: "2026-02-23" },
  { id: "TIC-005", site: "SITE-22", issue: "Fiber Cut", priority: "High", status: "In Progress", date: "2026-02-24" }
];

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
  });
});

/* ================= LOGOUT ================= */

document.getElementById("logout").addEventListener("click", () => {
  localStorage.removeItem("user");
  window.location.href = "index.html";
});

/* ================= SIDEBAR TOGGLE ================= */

document.getElementById("toggleSidebar").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
});

/* ================= TERMINALS ================= */

let terminalData = [];
let terminalFiltered = [];
let terminalPage = 1;
const terminalRowsPerPage = 10;
let terminalSortCol = null;
let terminalSortDir = 1;
let terminalSelectedRows = new Set();
let terminalSelectMode = false;

async function loadTerminals() {
  mainContent.innerHTML = `
    <div class="terminals-header">
      <h2><i class="ri-computer-line"></i> Terminals</h2>
      <div class="terminals-actions">
        <div class="search-box">
          <i class="ri-search-line"></i>
          <input type="text" id="terminalSearch" placeholder="Search here…">
        </div>
        <div class="dropdown-wrapper">
          <button class="dropdown-btn"><i class="ri-map-pin-2-line"></i> <span id="regionLabel">Benguet</span> <i class="ri-arrow-down-s-line"></i></button>
          <select id="regionSelect" class="hidden-select">
            <option value="benguet">Benguet</option>
            <option value="ifugao">Ifugao</option>
            <option value="ilocos">Ilocos</option>
            <option value="kalinga">Kalinga</option>
            <option value="pangasinan">Pangasinan</option>
            <option value="quezon">Quezon</option>
          </select>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-card-header">
        <span id="regionTitle">Benguet Records</span>
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
        <button class="tool-btn" id="toggleSortDir"><i class="ri-arrow-up-line"></i> ASC</button>
        <button class="tool-btn apply-btn" id="applyFilterSort"><i class="ri-check-line"></i> Apply</button>
        <button class="tool-btn" id="clearFilterSort"><i class="ri-close-line"></i> Clear</button>
      </div>

      <div id="bulkActions" class="bulk-actions hidden">
        <span id="selectedCount">0 rows selected</span>
        <button class="tool-btn danger-btn" id="deleteSelected"><i class="ri-delete-bin-line"></i> Delete Selected</button>
        <button class="tool-btn" id="exportSelected"><i class="ri-download-line"></i> Export CSV</button>
      </div>

      <div class="table-wrapper terminals-table-wrapper">
        <table class="data-grid terminals-grid" id="terminalTable">
          <thead id="terminalThead"></thead>
          <tbody id="terminalTbody"></tbody>
        </table>
      </div>

      <div class="pagination-bar" id="terminalPagination"></div>
    </div>

    <!-- Confirm Delete Modal -->
    <div id="confirmDeleteModal" class="modal-overlay hidden">
      <div class="modal-box confirm-modal-box">
        <div class="confirm-modal-icon danger-icon">
          <i class="ri-delete-bin-2-line"></i>
        </div>
        <h3 class="confirm-modal-title">Delete Records</h3>
        <p class="confirm-modal-msg" id="confirmDeleteMsg">Are you sure you want to delete the selected records?</p>
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
          <div class="add-modal-title">
            <h3>Edit Terminal</h3>
            <p>Update the details for this terminal entry.</p>
          </div>
          <button class="modal-close-btn" id="cancelEditRow"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div id="editRowFields" class="add-fields-grid"></div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Changes will be saved to the database</span>
          <div class="modal-actions">
            <button class="tool-btn" id="cancelEditRowFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="confirmEditRow"><i class="ri-save-line"></i> Save Changes</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Row Modal -->
    <div id="addRowModal" class="modal-overlay hidden">
      <div class="modal-box add-modal-box">
        <div class="add-modal-header">
          <div class="add-modal-icon"><i class="ri-router-line"></i></div>
          <div class="add-modal-title">
            <h3>Add New Terminal</h3>
            <p>Fill in the details to register a new terminal entry.</p>
          </div>
          <button class="modal-close-btn" id="cancelAddRow"><i class="ri-close-line"></i></button>
        </div>
        <div class="add-modal-body">
          <div id="addRowFields" class="add-fields-grid"></div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> All fields are optional unless marked</span>
          <div class="modal-actions">
            <button class="tool-btn" id="cancelAddRowFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="confirmAddRow"><i class="ri-save-line"></i> Save Terminal</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("regionSelect").addEventListener("change", function () {
    const val = this.value;
    document.getElementById("regionLabel").innerText = capitalize(val);
    document.getElementById("regionTitle").innerText = capitalize(val) + " Records";
    fetchTerminals(val);
  });

  document.getElementById("terminalSearch").addEventListener("input", () => {
    applyTerminalSearch();
    terminalPage = 1;
    renderTerminalTable();
    renderTerminalPagination();
  });

  document.getElementById("btnSortFilter").addEventListener("click", () => {
    document.getElementById("sortFilterBar").classList.toggle("hidden");
    document.getElementById("btnSortFilter").classList.toggle("active-tool",
      !document.getElementById("sortFilterBar").classList.contains("hidden"));
  });

  document.getElementById("btnSelect").addEventListener("click", () => {
    terminalSelectMode = !terminalSelectMode;
    terminalSelectedRows.clear();
    document.getElementById("btnSelect").classList.toggle("active-tool", terminalSelectMode);
    document.getElementById("bulkActions").classList.toggle("hidden", !terminalSelectMode);
    renderTerminalTable();
  });

  document.getElementById("deleteSelected").addEventListener("click", async () => {
    if (terminalSelectedRows.size === 0) { showToast("No rows selected.", "error"); return; }
    const toDeleteRows = Array.from(terminalSelectedRows).map(idx => terminalFiltered[idx]);
    showConfirmDeleteModal(toDeleteRows.length, async () => {
      const deleteBtn = document.getElementById("deleteSelected");
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Deleting…';
      const region = document.getElementById("regionSelect").value;
      const firstCol = Object.keys(toDeleteRows[0])[0];
      const ids = toDeleteRows.map(row => row[firstCol]);
      try {
        const res = await fetch(`/api/terminals/${region}`, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column: firstCol, ids })
        });
        const result = await res.json();
        if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown error"), "error"); return; }
        const toDeleteSet = new Set(toDeleteRows);
        terminalFiltered = terminalFiltered.filter(r => !toDeleteSet.has(r));
        terminalData = terminalData.filter(r => !toDeleteSet.has(r));
        terminalSelectedRows.clear();
        updateSelectedCount();
        const maxPage = Math.max(1, Math.ceil(terminalFiltered.length / terminalRowsPerPage));
        if (terminalPage > maxPage) terminalPage = maxPage;
        renderTerminalTable(); renderTerminalPagination();
        showToast(`${result.deleted} record(s) deleted successfully.`, "success");
      } catch (err) { showToast("Network error — could not delete records.", "error"); }
      finally { deleteBtn.disabled = false; deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete Selected'; }
    });
  });

  document.getElementById("exportSelected").addEventListener("click", () => {
    if (terminalSelectedRows.size === 0) { alert("No rows selected."); return; }
    const selectedRows = Array.from(terminalSelectedRows).sort((a, b) => a - b).map(idx => terminalFiltered[idx]);
    const columns = Object.keys(selectedRows[0]);
    const escape = val => { const str = String(val ?? ""); return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str; };
    const csvContent = [columns.map(escape).join(","), ...selectedRows.map(row => columns.map(col => escape(row[col])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
    a.download = `terminals_export_${Date.now()}.csv`; a.click();
  });

  document.getElementById("btnAdd").addEventListener("click", () => openAddModal());

  document.getElementById("toggleSortDir").addEventListener("click", function () {
    terminalSortDir *= -1;
    this.innerHTML = terminalSortDir === 1 ? '<i class="ri-arrow-up-line"></i> ASC' : '<i class="ri-arrow-down-line"></i> DESC';
  });

  document.getElementById("applyFilterSort").addEventListener("click", () => {
    const prov = document.getElementById("filterProvince").value.trim().toUpperCase();
    const muni = document.getElementById("filterMuni").value.trim().toUpperCase();
    const reg = document.getElementById("filterRegion").value.trim().toUpperCase();
    const col = document.getElementById("sortColSelect").value;
    terminalFiltered = terminalData.filter(row =>
      (!prov || String(row["PROVINCE"] ?? "").toUpperCase().includes(prov)) &&
      (!muni || String(row["MUNICIPALITY"] ?? "").toUpperCase().includes(muni)) &&
      (!reg || String(row["REGION"] ?? "").toUpperCase().includes(reg))
    );
    if (col) {
      terminalSortCol = col;
      terminalFiltered.sort((a, b) =>
        String(a[col] ?? "").localeCompare(String(b[col] ?? ""), undefined, { numeric: true }) * terminalSortDir
      );
    }
    terminalPage = 1; renderTerminalTable(); renderTerminalPagination();
    document.getElementById("sortFilterBar").classList.add("hidden");
    document.getElementById("btnSortFilter").classList.remove("active-tool");
  });

  document.getElementById("clearFilterSort").addEventListener("click", () => {
    terminalFiltered = [...terminalData];
    terminalSortCol = null; terminalSortDir = 1;
    ["filterProvince","filterMuni","filterRegion"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("toggleSortDir").innerHTML = '<i class="ri-arrow-up-line"></i> ASC';
    terminalPage = 1; renderTerminalTable(); renderTerminalPagination();
  });

  fetchTerminals("benguet");
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
    const res = await fetch(`/api/terminals/${region}`);
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
  const start = (terminalPage - 1) * terminalRowsPerPage;
  const pageData = terminalFiltered.slice(start, start + terminalRowsPerPage);
  thead.innerHTML = `
    <tr>
      ${terminalSelectMode ? '<th class="select-col"><input type="checkbox" id="selectAll"></th>' : ''}
      ${columns.map(col => `<th>${col}</th>`).join("")}
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
        ${columns.map(col => `<td>${row[col] ?? ''}</td>`).join("")}
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
            body: JSON.stringify({ column: firstCol, ids: [row[firstCol]] })
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
  document.getElementById("editRowFields").innerHTML = cols.map(col => `
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
      const res = await fetch(`/api/terminals/${region}/${encodeURIComponent(row[firstCol])}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: firstCol, data: updatedRow })
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
  document.getElementById("addRowFields").innerHTML = cols.map(col => `
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

function updateSelectedCount() { document.getElementById("selectedCount").innerText = `${terminalSelectedRows.size} rows selected`; }

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
      </div>
    </div>
    <h3 class="section-title">Overview</h3>
    <div class="cards">
      <div class="card">
        <div class="card-top">
          <div class="icon-box blue"><i class="ri-map-pin-2-line"></i></div>
          <div class="stat"><h1 class="counter" data-target="438">0</h1><span class="trend up">↑ +3%</span></div>
        </div>
        <p>Total Sites</p>
      </div>
      <div class="card">
        <div class="card-top">
          <div class="icon-box green"><i class="ri-shield-check-line"></i></div>
          <div class="stat"><h1 class="counter" data-target="420">0</h1><span class="trend up">↑ +5%</span></div>
        </div>
        <p>Active Sites</p>
      </div>
      <div class="card alert-card">
        <div class="card-top">
          <div class="icon-box orange pulse"><i class="ri-error-warning-line"></i></div>
          <div class="stat"><h1 class="counter" data-target="18">0</h1><span class="trend down">↓ -2%</span></div>
        </div>
        <p>Problematic Sites</p>
      </div>
      <div class="card">
        <div class="card-top">
          <div class="icon-box red"><i class="ri-alarm-warning-line"></i></div>
          <div class="stat"><h1 class="counter" data-target="6">0</h1><span class="trend down">↓ -1%</span></div>
        </div>
        <p>Open Incidents</p>
      </div>
    </div>
    <div class="table-container">
      <div class="table-title"><i class="ri-file-list-3-line"></i> Recent Incident Reports</div>
      <table>
        <thead><tr><th>Ticket ID</th><th>Province</th><th>Issue</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>INC-1023</td><td>Province 1</td><td>No Signal</td><td><span class="badge high">High</span></td><td><span class="badge completed">Completed</span></td></tr>
          <tr><td>INC-1024</td><td>Province 2</td><td>Power Failure</td><td><span class="badge medium">Medium</span></td><td><span class="badge progress">In Progress</span></td></tr>
          <tr><td>INC-1025</td><td>Province 3</td><td>Battery Low</td><td><span class="badge low">Low</span></td><td><span class="badge pending">Pending</span></td></tr>
        </tbody>
      </table>
    </div>
  `;
  document.getElementById("darkToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const icon = document.querySelector("#darkToggle i");
    icon.className = document.body.classList.contains("dark") ? "ri-sun-line" : "ri-moon-line";
  });
  runCounters();
}

/* ================= PROBLEMATIC SITES ================= */

let probData = [];
let probFiltered = [];
let probPage = 1;
const probRowsPerPage = 10;
let probSortDir = 1;
let probSelectedRows = new Set();
let probSelectMode = false;
let probCurrentRegion = "all";

const PROB_COLUMNS = [
  { key: "Sitename",                         icon: "ri-map-pin-line",         type: "text" },
  { key: "Province",                          icon: "ri-earth-line",           type: "text" },
  { key: "Municipality",                      icon: "ri-building-line",        type: "text" },
  { key: "Region",                            icon: "ri-map-2-line",           type: "select",
    options: ["Benguet", "Ifugao", "Ilocos", "Kalinga", "Pangasinan", "Quezon"] },
  { key: "Status",                            icon: "ri-checkbox-circle-line", type: "text" },
  { key: "Cause (Assume)",                    icon: "ri-question-line",        type: "text" },
  { key: "Remarks",                           icon: "ri-chat-3-line",          type: "textarea" },
  { key: "KAD Name",                          icon: "ri-user-line",            type: "text" },
  { key: "KAD Visit Date",                    icon: "ri-calendar-line",        type: "date" },
  { key: "Site Online Date",                  icon: "ri-calendar-check-line",  type: "date" },
  { key: "Found Problem / Cause in the Site", icon: "ri-bug-line",             type: "textarea" },
  { key: "Solution",                          icon: "ri-tools-line",           type: "textarea" },
];

function applyProbRegionFilter() {
  if (probCurrentRegion === "all") {
    probFiltered = [...probData];
  } else {
    probFiltered = probData.filter(row =>
      String(row["Region"] ?? "").toLowerCase() === probCurrentRegion.toLowerCase() ||
      String(row["Province"] ?? "").toLowerCase().includes(probCurrentRegion.toLowerCase()) ||
      String(row["Municipality"] ?? "").toLowerCase().includes(probCurrentRegion.toLowerCase())
    );
  }
}

async function loadProblematicSites() {
  // Reset state each time the page loads
  probData = []; probFiltered = []; probPage = 1;
  probSelectedRows = new Set(); probSelectMode = false;
  probCurrentRegion = "all";

  mainContent.innerHTML = `
    <div class="terminals-header">
      <h2><i class="ri-error-warning-line"></i> Problematic Sites</h2>
      <div class="terminals-actions">
        <div class="dropdown-wrapper">
          <button class="dropdown-btn"><i class="ri-map-pin-2-line"></i> <span id="probRegionLabel">All Regions</span> <i class="ri-arrow-down-s-line"></i></button>
          <select id="probRegionSelect" class="hidden-select">
            <option value="all">All Regions</option>
            <option value="benguet">Benguet</option>
            <option value="ifugao">Ifugao</option>
            <option value="ilocos">Ilocos</option>
            <option value="kalinga">Kalinga</option>
            <option value="pangasinan">Pangasinan</option>
            <option value="quezon">Quezon</option>
          </select>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-card-header">
        <span>Problematic Sites Records</span>
        <div class="table-tools">
          <button class="tool-btn" id="probBtnAdd"><i class="ri-add-line"></i> Add</button>
          <button class="tool-btn" id="probBtnSortFilter"><i class="ri-sliders-h-line"></i> Filter & Sort</button>
          <button class="tool-btn" id="probBtnSelect"><i class="ri-checkbox-multiple-line"></i> Select</button>
          <button class="tool-btn apply-btn" id="probExportExcel"><i class="ri-file-excel-line"></i> Export Excel</button>
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
        <span id="probSelectedCount">0 rows selected</span>
        <button class="tool-btn danger-btn" id="probDeleteSelected"><i class="ri-delete-bin-line"></i> Delete Selected</button>
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

    <!-- Add Modal -->
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
        <div class="add-modal-body">
          <div id="probAddFields" class="add-fields-grid"></div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Sitename is required</span>
          <div class="modal-actions">
            <button class="tool-btn" id="probCancelAddFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="probConfirmAdd"><i class="ri-save-line"></i> Save</button>
          </div>
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
        <div class="add-modal-body">
          <div id="probEditFields" class="add-fields-grid"></div>
        </div>
        <div class="add-modal-footer">
          <span class="add-modal-hint"><i class="ri-information-line"></i> Changes are saved to the database</span>
          <div class="modal-actions">
            <button class="tool-btn" id="probCancelEditFooter">Cancel</button>
            <button class="tool-btn apply-btn" id="probConfirmEdit"><i class="ri-save-line"></i> Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Region filter
  document.getElementById("probRegionSelect").addEventListener("change", function () {
    const val = this.value;
    document.getElementById("probRegionLabel").innerText = val === "all" ? "All Regions" : val.charAt(0).toUpperCase() + val.slice(1);
    probCurrentRegion = val;
    applyProbRegionFilter();
    probPage = 1; renderProbTable(); renderProbPagination();
  });

  // Combined Sort & Filter panel
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
    applyProbRegionFilter();
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
    applyProbRegionFilter();
    probPage = 1; renderProbTable(); renderProbPagination();
  });

  // Select
  document.getElementById("probBtnSelect").addEventListener("click", () => {
    probSelectMode = !probSelectMode;
    probSelectedRows.clear();
    document.getElementById("probBtnSelect").classList.toggle("active-tool", probSelectMode);
    document.getElementById("probBulkActions").classList.toggle("hidden", !probSelectMode);
    renderProbTable();
  });

  // Bulk Delete
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
        document.getElementById("probSelectedCount").innerText = "0 rows selected";
        const maxPage = Math.max(1, Math.ceil(probFiltered.length / probRowsPerPage));
        if (probPage > maxPage) probPage = maxPage;
        renderProbTable(); renderProbPagination();
        showToast(`${result.deleted} record(s) deleted.`, "success");
      } catch (err) { showToast("Network error — could not delete.", "error"); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete Selected'; }
    });
  });

  // Export Excel (all records, split by region)
  document.getElementById("probExportExcel").addEventListener("click", async () => {
    const btn = document.getElementById("probExportExcel");
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Generating…';
    try {
      const res = await fetch("/api/problematic-sites/export-excel");
      if (!res.ok) { showToast("Export failed.", "error"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `problematic_sites_${Date.now()}.xlsx`;
      a.click();
      showToast("Excel file downloaded.", "success");
    } catch (err) {
      showToast("Export error: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-file-excel-line"></i> Export Excel';
    }
  });

  // Add button
  document.getElementById("probBtnAdd").addEventListener("click", () => openProbAddModal());

  // Fetch data
  await fetchProbData();
}

async function fetchProbData() {
  try {
    const res = await fetch("/api/problematic-sites");
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
    applyProbRegionFilter();
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
  const columns = Object.keys(probFiltered[0]);
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
  const cancelBtn = document.getElementById("probCancelDeleteBtn");
  const newConfirm = confirmBtn.cloneNode(true); confirmBtn.replaceWith(newConfirm);
  const newCancel = cancelBtn.cloneNode(true); cancelBtn.replaceWith(newCancel);
  const close = () => modal.classList.add("hidden");
  document.getElementById("probCancelDeleteBtn").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("probConfirmDeleteBtn").onclick = async () => { close(); await onConfirm(); };
}

function buildProbFields(containerId, rowData = {}) {
  const container = document.getElementById(containerId);
  container.innerHTML = PROB_COLUMNS.map(col => {
    const raw = rowData[col.key];
    const val = String(raw ?? "").replace(/"/g, "&quot;");
    let input = "";
    if (col.type === "textarea") {
      input = `<textarea data-col="${col.key}" class="add-field-input prob-textarea" rows="2">${raw ?? ""}</textarea>`;
    } else if (col.type === "select") {
      input = `<select data-col="${col.key}" class="add-field-input">
        <option value="">— Select Status —</option>
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow)
      });
      let result;
      try { result = await res.json(); } catch(e) { result = {}; }
      if (!res.ok) { showToast("Save failed: " + (result.error || res.statusText || "Unknown error"), "error"); return; }
      const saved = result.row || newRow;
      probData.unshift(saved);
      applyProbRegionFilter();
      probPage = 1; renderProbTable(); renderProbPagination();
      close(); showToast("Record added successfully.", "success");
    } catch (err) {
      console.error("Save error:", err);
      showToast("Network error: " + err.message, "error");
    }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Save'; }
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

function loadTickets() {
  mainContent.innerHTML = `
    <h3 class="section-title">Ticket Management</h3>
    <div class="tickets-toolbar">
      <button id="openModal" class="tool-btn apply-btn"><i class="ri-add-line"></i> Create Ticket</button>
      <div class="search-box">
        <i class="ri-search-line"></i>
        <input type="text" id="ticketSearch" placeholder="Search tickets…">
      </div>
    </div>
    <div class="table-container">
      <div class="table-title"><i class="ri-ticket-2-line"></i> Tickets</div>
      <table>
        <thead><tr><th>ID</th><th>Site</th><th>Issue</th><th>Priority</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
        <tbody id="ticketTable"></tbody>
      </table>
    </div>
    <div class="pagination-bar" id="pagination"></div>
    <div id="ticketModal" class="modal-overlay hidden">
      <div class="modal-box">
        <h3><i class="ri-ticket-2-line"></i> Create Ticket</h3>
        <div class="form-group"><label>Site ID</label><input id="siteInput" placeholder="e.g. SITE-10"></div>
        <div class="form-group"><label>Issue</label><input id="issueInput" placeholder="Describe the issue"></div>
        <div class="form-group"><label>Priority</label>
          <select id="priorityInput"><option>High</option><option>Medium</option><option>Low</option></select>
        </div>
        <div class="modal-actions">
          <button id="closeModal" class="tool-btn">Cancel</button>
          <button id="saveTicket" class="tool-btn apply-btn">Save Ticket</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById("ticketSearch").addEventListener("input", () => { currentPage = 1; renderTable(); renderPagination(); });
  renderTable(); renderPagination(); setupModal();
}

function getFilteredTickets() {
  const q = (document.getElementById("ticketSearch")?.value || "").toLowerCase();
  if (!q) return tickets;
  return tickets.filter(t => Object.values(t).some(v => String(v).toLowerCase().includes(q)));
}

function renderTable() {
  const table = document.getElementById("ticketTable");
  if (!table) return;
  table.innerHTML = "";
  const filtered = getFilteredTickets();
  const start = (currentPage - 1) * rowsPerPage;
  const paginated = filtered.slice(start, start + rowsPerPage);
  if (!paginated.length) { table.innerHTML = `<tr><td colspan="7" class="empty-cell">No tickets found</td></tr>`; return; }
  paginated.forEach(ticket => {
    table.innerHTML += `
      <tr>
        <td><strong>${ticket.id}</strong></td><td>${ticket.site}</td><td>${ticket.issue}</td>
        <td><span class="badge ${getPriorityClass(ticket.priority)}">${ticket.priority}</span></td>
        <td><select onchange="updateStatus('${ticket.id}', this.value)" class="status-select">${renderStatusOptions(ticket.status)}</select></td>
        <td>${ticket.date}</td>
        <td><button class="tool-btn danger-btn small-btn" onclick="deleteTicket('${ticket.id}')"><i class="ri-delete-bin-line"></i></button></td>
      </tr>
    `;
  });
}

function deleteTicket(id) { tickets = tickets.filter(t => t.id !== id); renderTable(); renderPagination(); }
function renderStatusOptions(current) { return ["Pending", "In Progress", "Completed"].map(s => `<option value="${s}" ${s === current ? "selected" : ""}>${s}</option>`).join(""); }
function updateStatus(id, newStatus) { tickets = tickets.map(t => t.id === id ? { ...t, status: newStatus } : t); }
function getPriorityClass(priority) { return priority === "High" ? "high" : priority === "Medium" ? "medium" : "low"; }

function renderPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;
  const filtered = getFilteredTickets();
  const total = Math.ceil(filtered.length / rowsPerPage);
  if (total <= 1) { container.innerHTML = ""; return; }
  const start = (currentPage - 1) * rowsPerPage + 1;
  const end = Math.min(currentPage * rowsPerPage, filtered.length);
  const range = getPageRange(currentPage, total);
  container.innerHTML = `
    <span class="page-info">Showing ${start}–${end} of ${filtered.length}</span>
    <div class="page-buttons">
      <button class="page-btn ${currentPage===1?'disabled':''}" onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''}><i class="ri-arrow-left-s-line"></i></button>
      ${range.map(p => p==='...' ? `<button class="page-btn dots" disabled>…</button>` : `<button class="page-btn ${p===currentPage?'active':''}" onclick="changePage(${p})">${p}</button>`).join("")}
      <button class="page-btn ${currentPage===total?'disabled':''}" onclick="changePage(${currentPage+1})" ${currentPage===total?'disabled':''}><i class="ri-arrow-right-s-line"></i></button>
    </div>
  `;
}

function changePage(page) {
  const total = Math.ceil(getFilteredTickets().length / rowsPerPage);
  if (page < 1 || page > total) return;
  currentPage = page; renderTable(); renderPagination();
}

function setupModal() {
  const modal = document.getElementById("ticketModal");
  document.getElementById("openModal").onclick = () => modal.classList.remove("hidden");
  document.getElementById("closeModal").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  document.getElementById("saveTicket").onclick = () => {
    const site = document.getElementById("siteInput").value.trim();
    const issue = document.getElementById("issueInput").value.trim();
    const priority = document.getElementById("priorityInput").value;
    if (!site || !issue) { alert("Please fill in all fields."); return; }
    tickets.unshift({ id: "TIC-" + String(Math.floor(Math.random() * 900) + 100), site, issue, priority, status: "Pending", date: new Date().toISOString().split("T")[0] });
    modal.classList.add("hidden");
    document.getElementById("siteInput").value = ""; document.getElementById("issueInput").value = "";
    currentPage = 1; renderTable(); renderPagination();
  };
}


/* ================= LETTERS ================= */

let lettersFolderStack    = []; // stack of { id, name } — empty = root
let lettersSearchQuery    = "";
let lettersFilterType     = "all";
let lettersFilterUploader = "";
let lettersFilterModified = "all";
let lettersClipboard      = null; // { type: "file"|"folder", id, name, folderId } 

// helpers
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

      <!-- Recent Files sidebar -->
      <div class="letters-sidebar-card">
        <div class="letters-sidebar-header">Recent Files</div>
        <div class="letters-recent-list" id="lettersRecentList">
          <div class="letters-empty-recent"><i class="ri-loader-4-line spin"></i></div>
        </div>
      </div>

      <!-- Main area -->
      <div class="letters-main-card">
        <div class="letters-main-toolbar">
          <div class="letters-breadcrumb" id="lettersBreadcrumb"></div>
          <div class="letters-main-actions">
            <button class="tool-btn letters-paste-btn hidden" id="lettersPasteBtn"><i class="ri-clipboard-line"></i> Paste</button>
            <button class="tool-btn apply-btn" id="lettersNewBtn"><i class="ri-add-line"></i> New</button>
          </div>
        </div>

        <!-- Filter bar -->
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
    lettersFilterType     = document.getElementById("lettersFilterType")?.value || "all";
    lettersFilterUploader = document.getElementById("lettersFilterUploader")?.value.trim() || "";
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

/* ── API helpers ── */

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

  // Type
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

  // Uploader
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

  // Modified
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

  // Clear
  document.getElementById("lettersClearFilters")?.addEventListener("click", () => {
    lettersFilterType = "all"; lettersFilterUploader = ""; lettersFilterModified = "all"; lettersSearchQuery = "";
    const si = document.getElementById("lettersSearch"); if (si) si.value = "";
    // Reset chip labels
    document.getElementById("chipType").querySelector(".chip-label").textContent = "Type";
    document.getElementById("chipUploader").querySelector(".chip-label").textContent = "Uploader";
    document.getElementById("chipModified").querySelector(".chip-label").textContent = "Modified";
    // Remove active state from chips
    ["chipType","chipUploader","chipModified"].forEach(id => document.getElementById(id)?.classList.remove("chip-active"));
    // Reset active option highlights
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
  const names    = [...new Set(files.map(f => f.uploader_name).filter(Boolean))];
  const current  = lettersFilterUploader;
  const anyActive = current === "" ? " active" : "";
  drop.innerHTML  = `<div class="chip-option chip-opt-uploader${anyActive}" data-val="">Anyone</div>`;
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
      // Root: only folders (no files at root level)
      const res  = await fetch("/api/letters/folders");
      const data = await res.json();
      renderLettersFolders(data, null);
    } else {
      // Inside folder: fetch subfolders + files in parallel
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

/* ── Render helpers ── */

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
      if (depth === -1) {
        lettersFolderStack = [];
      } else {
        lettersFolderStack = lettersFolderStack.slice(0, depth + 1);
      }
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
  if (!files.length) {
    list.innerHTML = `<div class="letters-empty-recent">No files yet</div>`;
    return;
  }
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
      // Prevent pushing the same folder that's already current
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
  // Hide folders when a specific file type is selected
  if (lettersFilterType !== "all") filteredFolders = [];

  let html = "";

  if (filteredFolders.length) {
    html += `<div class="letters-section-label"><i class="ri-folder-line"></i> Folders</div>`;
    html += `<div class="letters-folders-grid">${buildFolderCardsHTML(filteredFolders)}</div>`;
  }

  // Apply all active filters
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

function renderLettersFiles(files) {
  const content = document.getElementById("lettersContent");
  if (!files.length) {
    content.innerHTML = `<div class="letters-empty"><i class="ri-file-add-line"></i><p>${lettersSearchQuery ? "No files match your search" : "No files yet — click <strong>New</strong> to upload one."}</p></div>`;
    return;
  }
  content.innerHTML = `<div class="letters-files-list">${files.map(f => {
    const fi   = getLettersFileIcon(f.file_type);
    const size = f.file_size ? formatFileSize(f.file_size) : "";
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
  if (bytes < 1024)       return bytes + " B";
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/* ── Kebab menu ── */

// Dynamically load a script once
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
          ).join("")}</div>`
        : "";

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


function openLettersNewChoiceMenu(anchor) {
  // Close any existing
  document.querySelectorAll(".letters-new-choice-menu").forEach(m => m.remove());

  const menu = document.createElement("div");
  menu.className = "letters-new-choice-menu letters-kebab-menu";
  menu.style.cssText = "position:absolute;z-index:200;min-width:170px;";
  menu.innerHTML = `
    <div class="kebab-item choice-subfolder"><i class="ri-folder-add-line"></i> New Subfolder</div>
    <div class="kebab-item choice-file"><i class="ri-file-upload-line"></i> Upload File</div>
  `;
  menu.querySelector(".choice-subfolder").onclick = () => { menu.remove(); openLettersFolderModal(); };
  menu.querySelector(".choice-file").onclick      = () => { menu.remove(); openLettersFileModal(); };

  anchor.style.position = "relative";
  anchor.appendChild(menu);

  // Position it below the anchor
  const rect = anchor.getBoundingClientRect();
  menu.style.top   = anchor.offsetHeight + 4 + "px";
  menu.style.right = "0";

  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}

// ── Copy / Paste / Duplicate ──

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

      // ── Attach to body so it's never clipped by overflow:hidden parents ──
      document.body.appendChild(menu);

      // Position relative to the button
      const rect = btn.getBoundingClientRect();
      const menuW = 160;
      let left = rect.right - menuW;
      let top  = rect.bottom + 4;

      // Flip up if it would go off screen bottom
      if (top + 200 > window.innerHeight) top = rect.top - 200;
      // Keep within left edge
      if (left < 8) left = 8;

      menu.style.cssText = `position:fixed;top:${top}px;left:${left}px;min-width:${menuW}px;z-index:9999;`;

      setTimeout(() => document.addEventListener("click", closeAllLettersKebabs, { once: true }), 0);
    });
  });
}

function closeAllLettersKebabs() {
  document.querySelectorAll(".letters-kebab-menu").forEach(m => m.remove());
}

/* ── Rename ── */

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
      fetchLettersContent();
      fetchLettersRecent();
      showToast("Renamed successfully.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-save-line"></i> Rename'; }
  };
}

/* ── Delete ── */

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
      fetchLettersContent();
      fetchLettersRecent();
      showToast("Deleted.", "success");
    } catch { showToast("Network error.", "error"); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete'; }
  };
}

/* ── Create folder ── */

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

  menu.querySelector("#newChoiceFolder").onclick = (e) => {
    e.stopPropagation();
    menu.remove();
    openLettersFolderModal();
  };
  if (insideFolder) {
    menu.querySelector("#newChoiceFile").onclick = (e) => {
      e.stopPropagation();
      menu.remove();
      openLettersFileModal();
    };
  }

  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
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

/* ── Upload file ── */

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
loadDashboard();