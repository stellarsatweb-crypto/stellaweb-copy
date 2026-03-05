/* ================= USER SESSION ================= */

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  window.location.href = "index.html";
}

/* ================= GLOBAL ================= */

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

  document.getElementById("probRegionSelect").addEventListener("change", function () {
    const val = this.value;
    document.getElementById("probRegionLabel").innerText = val === "all" ? "All Regions" : val.charAt(0).toUpperCase() + val.slice(1);
    probCurrentRegion = val;
    applyProbRegionFilter();
    probPage = 1; renderProbTable(); renderProbPagination();
  });

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

  document.getElementById("probBtnSelect").addEventListener("click", () => {
    probSelectMode = !probSelectMode;
    probSelectedRows.clear();
    document.getElementById("probBtnSelect").classList.toggle("active-tool", probSelectMode);
    document.getElementById("probBulkActions").classList.toggle("hidden", !probSelectMode);
    renderProbTable();
  });

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

  document.getElementById("probBtnAdd").addEventListener("click", () => openProbAddModal());

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
              ${["All Department","NOC Department","Finance Department","Executive"].map(d =>
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
      <div class="tk-form-box">
        <h2 class="tk-form-title">Submit a Ticket</h2>

        <div class="tk-form-section-label">Ticket Information</div>
        <div class="tk-form-group">
          <label class="tk-form-label">Subject <span class="tk-required">*</span></label>
          <input type="text" id="tkSubjectInput" class="tk-form-input">
        </div>
        <div class="tk-form-group">
          <label class="tk-form-label">Description <span class="tk-required">*</span></label>
          <textarea id="tkDescInput" class="tk-form-textarea" rows="6"></textarea>
        </div>

        <div class="tk-form-section-label">Additional Information</div>
        <div class="tk-form-group">
          <label class="tk-form-label">Airmac / ESN</label>
          <input type="text" id="tkEsnInput" class="tk-form-input">
        </div>
        <div class="tk-form-group">
          <label class="tk-form-label">Status</label>
          <select id="tkStatusInput" class="tk-form-input">
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
            <option value="On hold">On hold</option>
          </select>
        </div>

        <div class="tk-form-actions">
          <button class="tool-btn apply-btn" id="tkSubmitBtn" style="padding:11px 28px;font-size:14px;">Submit</button>
          <button class="tool-btn" id="tkDiscardBtn" style="padding:11px 22px;font-size:14px;">Discard</button>
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
      <div class="tk-view-modal" style="max-width:700px;max-height:85vh;overflow-y:auto;">
        <div class="tk-view-header">
          <div class="tk-view-title">
            <i class="ri-ticket-2-line tk-view-icon"></i>
            <span>Ticket Details</span>
          </div>
          <button class="modal-close-btn" id="tkViewCloseBtn" style="background:transparent;border:none;color:#64748b;font-size:24px;cursor:pointer;padding:8px;">
            <i class="ri-close-line"></i>
          </button>
        </div>

        <div class="tk-view-body">
          <div class="tk-view-section">
            <div class="tk-view-section-title">
              <i class="ri-information-line"></i>
              <span>Ticket Information</span>
            </div>
            <div class="tk-view-grid">
              <div class="tk-view-field">
                <div class="tk-view-label">
                  <i class="ri-hashtag"></i>
                  Ticket ID
                </div>
                <div class="tk-view-value" id="tkViewId" style="font-weight:600;color:#3b82f6;"></div>
              </div>
              <div class="tk-view-field">
                <div class="tk-view-label">
                  <i class="ri-bookmark-line"></i>
                  Subject
                </div>
                <div class="tk-view-value" id="tkViewSubject" style="font-weight:500;font-size:16px;"></div>
              </div>
              <div class="tk-view-field full-width">
                <div class="tk-view-label">
                  <i class="ri-file-text-line"></i>
                  Description
                </div>
                <div class="tk-view-value" id="tkViewDesc" style="white-space: pre-wrap;line-height:1.6;background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #3b82f6;"></div>
              </div>
            </div>
          </div>

          <div class="tk-view-section">
            <div class="tk-view-section-title">
              <i class="ri-settings-3-line"></i>
              <span>Additional Information</span>
            </div>
            <div class="tk-view-grid">
              <div class="tk-view-field">
                <div class="tk-view-label">
                  <i class="ri-router-line"></i>
                  Airmac / ESN
                </div>
                <div class="tk-view-value" id="tkViewEsn"></div>
              </div>
              <div class="tk-view-field">
                <div class="tk-view-label">
                  <i class="ri-flag-line"></i>
                  Status
                </div>
                <div class="tk-view-value" id="tkViewStatus"></div>
              </div>
              <div class="tk-view-field">
                <div class="tk-view-label">
                  <i class="ri-calendar-line"></i>
                  Created Date
                </div>
                <div class="tk-view-value" id="tkViewCreated"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="tk-view-footer">
          <button class="tool-btn" id="tkViewCloseBtnFooter" style="padding:12px 32px;font-size:15px;">
            <i class="ri-close-line"></i> Close
          </button>
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
    if (!subject)     { showToast("Subject is required.", "error"); return; }
    if (!description) { showToast("Description is required.", "error"); return; }

    const btn = document.getElementById("tkSubmitBtn");
    btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Submitting…';
    try {
      const res    = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, airmac_esn, status })
      });
      const result = await res.json();
      if (!res.ok) { showToast("Failed: " + (result.error || "Unknown error"), "error"); return; }
      document.getElementById("tkSubmitModal").classList.add("hidden");
      document.getElementById("tkSubjectInput").value = "";
      document.getElementById("tkDescInput").value    = "";
      document.getElementById("tkEsnInput").value     = "";
      await fetchTickets();
      showToast("Ticket submitted successfully.", "success");
    } catch (err) {
      showToast("Network error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.innerHTML = "Submit";
    }
  });

  // Discard
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
  document.getElementById("tkViewCloseBtnFooter").addEventListener("click", () => {
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
  // Add CSS styles if not already added
  if (!document.getElementById('tkViewModalStyles')) {
    const style = document.createElement('style');
    style.id = 'tkViewModalStyles';
    style.textContent = `
      .tk-view-modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        overflow: visible;
        animation: modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        border: 1px solid rgba(0, 0, 0, 0.06);
        backdrop-filter: blur(10px);
        max-height: 90vh;
        max-width: 90vw;
      }
      
      @keyframes modalSlideIn {
        from {
          opacity: 0;
          transform: translateY(-30px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .tk-view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 28px 32px 24px;
        background: linear-gradient(135deg, #2f4b85 0%, #1e3a8a 100%);
        color: white;
        position: relative;
        overflow: hidden;
      }
      
      .tk-view-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
      }
      
      .tk-view-title {
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      
      .tk-view-icon {
        font-size: 28px;
        opacity: 0.9;
      }
      
      .tk-view-body {
        padding: 32px;
        background: #fafbfc;
      }
      
      .tk-view-section {
        margin-bottom: 36px;
        background: white;
        border-radius: 12px;
        padding: 24px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        transition: all 0.2s ease;
      }
      
      .tk-view-section:hover {
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
        transform: translateY(-1px);
      }
      
      .tk-view-section:last-child {
        margin-bottom: 0;
      }
      
      .tk-view-section-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 15px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 2px solid #e2e8f0;
        position: relative;
      }
      
      .tk-view-section-title i {
        color: #3b82f6;
        font-size: 18px;
        background: rgba(59, 130, 246, 0.1);
        padding: 6px;
        border-radius: 6px;
      }
      
      .tk-view-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 24px;
      }
      
      .tk-view-field {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .tk-view-field.full-width {
        grid-column: 1 / -1;
      }
      
      .tk-view-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.75px;
      }
      
      .tk-view-label i {
        font-size: 14px;
        color: #94a3b8;
      }
      
      .tk-view-value {
        font-size: 15px;
        color: #1e293b;
        line-height: 1.6;
        padding: 16px 20px;
        background: #f8fafc;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        min-height: 52px;
        display: flex;
        align-items: center;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .tk-view-value:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
      }
      
      .tk-view-footer {
        padding: 24px 32px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      
      .modal-overlay.hidden .tk-view-modal {
        animation: modalSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      @keyframes modalSlideOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-30px) scale(0.96);
        }
      }
      
      .tk-status-badge-view {
        display: inline-flex;
        align-items: center;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .tk-status-open-view {
        background: rgba(34, 197, 94, 0.1);
        color: #16a34a;
        border: 1px solid rgba(34, 197, 94, 0.2);
      }
      
      .tk-status-closed-view {
        background: rgba(239, 68, 68, 0.1);
        color: #dc2626;
        border: 1px solid rgba(239, 68, 68, 0.2);
      }
      
      .tk-status-hold-view {
        background: rgba(251, 146, 60, 0.1);
        color: #ea580c;
        border: 1px solid rgba(251, 146, 60, 0.2);
      }
    `;
    document.head.appendChild(style);
  }

  // Enhanced data display with proper formatting
  const ticketId = document.getElementById("tkViewId");
  const subject = document.getElementById("tkViewSubject");
  const description = document.getElementById("tkViewDesc");
  const airmacEsn = document.getElementById("tkViewEsn");
  const status = document.getElementById("tkViewStatus");
  const created = document.getElementById("tkViewCreated");
  
  // Format data with professional styling
  ticketId.innerHTML = `<span style="font-size: 18px; font-weight: 700; color: #3b82f6;">#${t.id}</span>`;
  subject.innerHTML = `<span style="font-size: 16px; font-weight: 600; color: #1e293b;">${t.subject || 'No subject'}</span>`;
  description.innerHTML = `<div style="line-height: 1.7; color: #374151; padding: 20px; border-radius: 8px; border-left: 4px solid #2f4b85; white-space: pre-wrap;">${t.description || 'No description provided'}</div>`;
  airmacEsn.innerHTML = `<span style="font-family: 'Courier New', monospace; color: #059669;">${t.airmac_esn || 'Not specified'}</span>`;
  
  // Enhanced status display
  let statusClass = 'tk-status-open-view';
  let statusText = t.status || 'Open';
  if (t.status === 'Closed') { statusClass = 'tk-status-closed-view'; }
  else if (t.status === 'On hold') { statusClass = 'tk-status-hold-view'; statusText = 'On Hold'; }
  status.innerHTML = `<span class="tk-status-badge-view ${statusClass}">${statusText}</span>`;
  
  // Fix date formatting - handle different date formats properly
  let formattedDate = 'Unknown';
  if (t.created_at) {
    try {
      const date = new Date(t.created_at);
      if (!isNaN(date.getTime())) {
        formattedDate = date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      }
    } catch (e) {
      console.warn('Date formatting error:', e);
    }
  }
  created.innerHTML = `<span style="color: #6b7280; font-size: 14px;">${formattedDate}</span>`;
  
  document.getElementById("tkViewModal").classList.remove("hidden");
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
loadDashboard();