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

// Terminal state
let terminalData = [];
let terminalFiltered = [];
let terminalPage = 1;
const terminalRowsPerPage = 10; // 10 rows per page
let terminalSortCol = null;
let terminalSortDir = 1;
let terminalSelectedRows = new Set();
let terminalSelectMode = false;


//Load Terminals
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
          <button class="tool-btn" id="btnSort"><i class="ri-sort-asc"></i> Sort By</button>
          <button class="tool-btn" id="btnFilter"><i class="ri-filter-3-line"></i> Filter</button>
          <button class="tool-btn" id="btnSelect"><i class="ri-checkbox-multiple-line"></i> Select</button>
        </div>
      </div>

      <!-- Filter Bar (hidden by default) -->
      <div id="filterBar" class="filter-bar hidden">
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
        <button class="tool-btn apply-btn" id="applyFilter"><i class="ri-check-line"></i> Apply</button>
        <button class="tool-btn clear-btn" id="clearFilter"><i class="ri-close-line"></i> Clear</button>
      </div>

      <!-- Sort Bar (hidden by default) -->
      <div id="sortBar" class="sort-bar hidden">
        <label>Sort by column:</label>
        <select id="sortColSelect"></select>
        <button class="tool-btn" id="toggleSortDir"><i class="ri-arrow-up-line"></i> ASC</button>
        <button class="tool-btn apply-btn" id="applySort"><i class="ri-check-line"></i> Apply</button>
      </div>

      <!-- Bulk Actions (shown in select mode) -->
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

      <!-- Pagination -->
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
  // Region Selector
  document.getElementById("regionSelect").addEventListener("change", function () {
    const val = this.value;
    document.getElementById("regionLabel").innerText = capitalize(val);
    document.getElementById("regionTitle").innerText = capitalize(val) + " Records";
    fetchTerminals(val);
  });
  // Search Input
  document.getElementById("terminalSearch").addEventListener("input", () => {
    applyTerminalSearch();
    terminalPage = 1;
    renderTerminalTable();
    renderTerminalPagination();
  });

  // Sort Button
  document.getElementById("btnSort").addEventListener("click", () => {
    toggleBar("sortBar");
    hideBar("filterBar");
  });

  // Filter Button
  document.getElementById("btnFilter").addEventListener("click", () => {
    toggleBar("filterBar");
    hideBar("sortBar");
  });

  // Select Button
  document.getElementById("btnSelect").addEventListener("click", () => {
    terminalSelectMode = !terminalSelectMode;
    terminalSelectedRows.clear();
    document.getElementById("btnSelect").classList.toggle("active-tool", terminalSelectMode);
    document.getElementById("bulkActions").classList.toggle("hidden", !terminalSelectMode);
    renderTerminalTable();
  });

  // Delete Selected — remove from DB first, then update UI
  document.getElementById("deleteSelected").addEventListener("click", async () => {
    if (terminalSelectedRows.size === 0) {
      alert("No rows selected.");
      return;
    }

    const toDeleteRows = Array.from(terminalSelectedRows).map(idx => terminalFiltered[idx]);
    const count = toDeleteRows.length;

    // Show custom confirm modal
    showConfirmDeleteModal(count, async () => {
      const deleteBtn = document.getElementById("deleteSelected");
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Deleting…';

      const region = document.getElementById("regionSelect").value;
      const firstCol = Object.keys(toDeleteRows[0])[0];
      const ids = toDeleteRows.map(row => row[firstCol]);

      try {
        const res = await fetch(`/api/terminals/${region}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column: firstCol, ids })
        });

        const result = await res.json();

        if (!res.ok) {
          showToast("Delete failed: " + (result.error || "Unknown error"), "error");
          return;
        }

        const toDeleteSet = new Set(toDeleteRows);
        terminalFiltered = terminalFiltered.filter(row => !toDeleteSet.has(row));
        terminalData = terminalData.filter(row => !toDeleteSet.has(row));

        terminalSelectedRows.clear();
        updateSelectedCount();

        const maxPage = Math.max(1, Math.ceil(terminalFiltered.length / terminalRowsPerPage));
        if (terminalPage > maxPage) terminalPage = maxPage;

        renderTerminalTable();
        renderTerminalPagination();
        showToast(`${result.deleted} record(s) deleted successfully.`, "success");

      } catch (err) {
        console.error("Delete error:", err);
        showToast("Network error — could not delete records.", "error");
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i> Delete Selected';
      }
    });
  });

  // Export Selected — build CSV from selected rows and trigger download
  document.getElementById("exportSelected").addEventListener("click", () => {
    if (terminalSelectedRows.size === 0) {
      alert("No rows selected.");
      return;
    }
    const selectedRows = Array.from(terminalSelectedRows).sort((a, b) => a - b).map(idx => terminalFiltered[idx]);
    const columns = Object.keys(selectedRows[0]);

    const escape = val => {
      const str = String(val ?? "");
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const csvHeader = columns.map(escape).join(",");
    const csvRows = selectedRows.map(row => columns.map(col => escape(row[col])).join(","));
    const csvContent = [csvHeader, ...csvRows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminals_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Add Button
  document.getElementById("btnAdd").addEventListener("click", () => {
    openAddModal();
  });

  // Apply Sort
  document.getElementById("applySort").addEventListener("click", () => {
    const col = document.getElementById("sortColSelect").value;
    if (!col) return;
    terminalSortCol = col;
    terminalFiltered.sort((a, b) => {
      const av = a[col] ?? ""; const bv = b[col] ?? "";
      return av.toString().localeCompare(bv.toString(), undefined, { numeric: true }) * terminalSortDir;
    });
    terminalPage = 1;
    renderTerminalTable();
    renderTerminalPagination();
    hideBar("sortBar");
  });

  document.getElementById("toggleSortDir").addEventListener("click", function () {
    terminalSortDir *= -1;
    this.innerHTML = terminalSortDir === 1
      ? '<i class="ri-arrow-up-line"></i> ASC'
      : '<i class="ri-arrow-down-line"></i> DESC';
  });

  // Apply Filter
  document.getElementById("applyFilter").addEventListener("click", () => {
    const prov = document.getElementById("filterProvince").value.trim().toUpperCase();
    const muni = document.getElementById("filterMuni").value.trim().toUpperCase();
    const reg = document.getElementById("filterRegion").value.trim().toUpperCase();
    terminalFiltered = terminalData.filter(row => {
      return (!prov || String(row["PROVINCE"] ?? "").toUpperCase().includes(prov))
        && (!muni || String(row["MUNICIPALITY"] ?? "").toUpperCase().includes(muni))
        && (!reg || String(row["REGION"] ?? "").toUpperCase().includes(reg));
    });
    terminalPage = 1;
    renderTerminalTable();
    renderTerminalPagination();
    hideBar("filterBar");
  });

  document.getElementById("clearFilter").addEventListener("click", () => {
    terminalFiltered = [...terminalData];
    document.getElementById("filterProvince").value = "";
    document.getElementById("filterMuni").value = "";
    document.getElementById("filterRegion").value = "";
    terminalPage = 1;
    renderTerminalTable();
    renderTerminalPagination();
  });

  fetchTerminals("benguet");
}


// Utility functions
function toggleBar(id) {
  document.getElementById(id).classList.toggle("hidden");
}
// Hide the other bar when one is toggled
function hideBar(id) {
  document.getElementById(id).classList.add("hidden");
}
// Update the count of selected rows in the bulk action bar
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}


// Terminal state
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

    // Remove rows where all values (ignoring the first key which may be a row number) are empty
    const allCols = Object.keys(data[0]);
    const cleaned = data.filter(row => {
      const valueCols = allCols.slice(1); // skip first column (often a row index)
      return valueCols.some(col => {
        const v = row[col];
        return v !== null && v !== undefined && String(v).trim() !== "";
      });
    });

    terminalData = cleaned;
    terminalFiltered = [...cleaned];
    terminalPage = 1;

    // Populate sort column selector
    const cols = Object.keys(data[0]);
    const sortSel = document.getElementById("sortColSelect");
    sortSel.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join("");

    renderTerminalTable();
    renderTerminalPagination();

  } catch (err) {
    console.error("Fetch error:", err);
    tbody.innerHTML = `<tr><td colspan="20" class="error-cell"><i class="ri-error-warning-line"></i> Error loading data</td></tr>`;
  }
}

// Render the terminal table based on current filters, sorting, and pagination
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

  // Header
  thead.innerHTML = `
    <tr>
      ${terminalSelectMode ? '<th class="select-col"><input type="checkbox" id="selectAll"></th>' : ''}

      ${columns.map(col => `<th>${col}</th>`).join("")}
      <th class="actions-col">Actions</th>
    </tr>
  `;

  // Select All checkbox
  if (terminalSelectMode) {
    document.getElementById("selectAll").addEventListener("change", function () {
      pageData.forEach((_, i) => {
        const idx = start + i;
        if (this.checked) terminalSelectedRows.add(idx);
        else terminalSelectedRows.delete(idx);
      });
      updateSelectedCount();
      renderTerminalTable();
    });
  }

  // Rows
  tbody.innerHTML = pageData.map((row, i) => {
    const globalIdx = start + i;
    const isChecked = terminalSelectedRows.has(globalIdx);
    return `
      <tr class="${isChecked ? 'selected-row' : ''}" data-idx="${globalIdx}">
        ${terminalSelectMode ? `<td class="select-col"><input type="checkbox" class="row-check" ${isChecked ? 'checked' : ''}></td>` : ''}

        ${columns.map(col => `<td>${row[col] ?? ''}</td>`).join("")}
        <td class="actions-col">
          <button class="row-action-btn edit-btn" data-idx="${globalIdx}" title="Edit">
            <i class="ri-edit-line"></i>
          </button>
          <button class="row-action-btn delete-single-btn" data-idx="${globalIdx}" title="Delete">
            <i class="ri-delete-bin-line"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Row checkboxes
  if (terminalSelectMode) {
    document.querySelectorAll(".row-check").forEach((cb, i) => {
      cb.addEventListener("change", function () {
        const idx = start + i;
        if (this.checked) terminalSelectedRows.add(idx);
        else terminalSelectedRows.delete(idx);
        updateSelectedCount();
        this.closest("tr").classList.toggle("selected-row", this.checked);
      });
    });
  }

  // Edit buttons
  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"));
      openEditModal(idx);
    });
  });

  // Single row delete buttons
  document.querySelectorAll(".delete-single-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"));
      const row = terminalFiltered[idx];
      showConfirmDeleteModal(1, async () => {
        const region = document.getElementById("regionSelect").value;
        const firstCol = Object.keys(row)[0];
        const ids = [row[firstCol]];
        try {
          const res = await fetch(`/api/terminals/${region}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ column: firstCol, ids })
          });
          const result = await res.json();
          if (!res.ok) { showToast("Delete failed: " + (result.error || "Unknown error"), "error"); return; }
          terminalFiltered = terminalFiltered.filter(r => r !== row);
          terminalData = terminalData.filter(r => r !== row);
          const maxPage = Math.max(1, Math.ceil(terminalFiltered.length / terminalRowsPerPage));
          if (terminalPage > maxPage) terminalPage = maxPage;
          renderTerminalTable();
          renderTerminalPagination();
          showToast("Record deleted successfully.", "success");
        } catch (err) {
          showToast("Network error — could not delete record.", "error");
        }
      });
    });
  });
}

/* ================= CONFIRM DELETE MODAL ================= */

function showConfirmDeleteModal(count, onConfirm) {
  const modal = document.getElementById("confirmDeleteModal");
  document.getElementById("confirmDeleteMsg").innerHTML =
    `You are about to permanently delete <strong>${count} record${count > 1 ? 's' : ''}</strong>.<br>This action <strong>cannot be undone</strong>.`;

  modal.classList.remove("hidden");

  const confirmBtn = document.getElementById("confirmDeleteBtn");
  const cancelBtn = document.getElementById("cancelDeleteBtn");

  // Clone to remove old listeners
  const newConfirm = confirmBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirm);
  cancelBtn.replaceWith(newCancel);

  const close = () => modal.classList.add("hidden");

  document.getElementById("cancelDeleteBtn").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  document.getElementById("confirmDeleteBtn").onclick = async () => {
    close();
    await onConfirm();
  };
}

/* ================= EDIT MODAL ================= */

function openEditModal(idx) {
  const row = terminalFiltered[idx];
  if (!row) return;

  const cols = Object.keys(row);
  const fields = document.getElementById("editRowFields");
  // Determine icon based on column name
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
  // Build form fields with current values
  fields.innerHTML = cols.map(col => `
    <div class="add-field-item">
      <label class="add-field-label">
        <i class="${getIcon(col)}"></i> ${col}
      </label>
      <input
        type="text"
        data-col="${col}"
        class="add-field-input edit-field-input"
        value="${String(row[col] ?? '').replace(/"/g, '&quot;')}"
        autocomplete="off"
      >
    </div>
  `).join("");
    // Show modal
  const modal = document.getElementById("editRowModal");
  modal.classList.remove("hidden");
    // Set up buttons
  const close = () => modal.classList.add("hidden");
  document.getElementById("cancelEditRow").onclick = close;
  document.getElementById("cancelEditRowFooter").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
    // Confirm edit
  document.getElementById("confirmEditRow").onclick = async () => {
    const updatedRow = {};
    cols.forEach(col => {
      const input = modal.querySelector(`[data-col="${col}"]`);
      updatedRow[col] = input ? input.value.trim() : row[col];
    });

    const saveBtn = document.getElementById("confirmEditRow");
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';

    const region = document.getElementById("regionSelect").value;
    const firstCol = cols[0];
    const idValue = row[firstCol];

    try {
      const res = await fetch(`/api/terminals/${region}/${encodeURIComponent(idValue)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: firstCol, data: updatedRow })
      });

      const result = await res.json();

      if (!res.ok) {
        showToast("Update failed: " + (result.error || "Unknown error"), "error");
        return;
      }

      // Update in-memory arrays
      const saved = result.row || updatedRow;
      const fIdx = terminalFiltered.indexOf(row);
      const dIdx = terminalData.indexOf(row);
      if (fIdx !== -1) terminalFiltered[fIdx] = saved;
      if (dIdx !== -1) terminalData[dIdx] = saved;

      renderTerminalTable();
      close();
      showToast("Record updated successfully.", "success");

    } catch (err) {
      showToast("Network error — could not update record.", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ri-save-line"></i> Save Changes';
    }
  };
}

/* ================= TOAST NOTIFICATION ================= */

function showToast(message, type = "success") {
  const existing = document.getElementById("toastNotif");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toastNotif";
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="${type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add("toast-show"), 10);
  // Animate out
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}
// Update the count of selected rows in the bulk action bar
function updateSelectedCount() {
  document.getElementById("selectedCount").innerText = `${terminalSelectedRows.size} rows selected`;
}

// Render pagination controls based on current page and total filtered records
function renderTerminalPagination() {
  const container = document.getElementById("terminalPagination");
  const total = Math.ceil(terminalFiltered.length / terminalRowsPerPage);
  if (total <= 1) { container.innerHTML = ""; return; }

  const start = (terminalPage - 1) * terminalRowsPerPage + 1;
  const end = Math.min(terminalPage * terminalRowsPerPage, terminalFiltered.length);

  let pages = [];
  pages.push({ label: '<i class="ri-arrow-left-s-line"></i>', page: terminalPage - 1, disabled: terminalPage === 1 });

  const range = getPageRange(terminalPage, total);
  range.forEach(p => {
    if (p === '...') pages.push({ label: '…', page: null, dots: true });
    else pages.push({ label: p, page: p, active: p === terminalPage });
  });

  pages.push({ label: '<i class="ri-arrow-right-s-line"></i>', page: terminalPage + 1, disabled: terminalPage === total });

  container.innerHTML = `
    <span class="page-info">Showing ${start}–${end} of ${terminalFiltered.length}</span>
    <div class="page-buttons">
      ${pages.map(p => `
        <button 
          class="page-btn ${p.active ? 'active' : ''} ${p.disabled ? 'disabled' : ''} ${p.dots ? 'dots' : ''}"
          ${p.page && !p.disabled && !p.dots ? `onclick="goTerminalPage(${p.page})"` : ''}
          ${p.disabled ? 'disabled' : ''}
        >${p.label}</button>
      `).join("")}
    </div>
  `;
}
// Get page range for pagination controls, showing first 5, last 5, and 2 around current page
function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}
// Navigate to a specific page in the terminal table
function goTerminalPage(page) {
  terminalPage = page;
  renderTerminalTable();
  renderTerminalPagination();
  document.querySelector(".terminals-table-wrapper").scrollTop = 0;
}
//  Apply search filter to terminal data based on search input value
function applyTerminalSearch() {
  const q = document.getElementById("terminalSearch").value.toLowerCase();
  terminalFiltered = terminalData.filter(row =>
    Object.values(row).some(v => String(v ?? "").toLowerCase().includes(q))
  );
}
// Open the Add Terminal modal and dynamically generate input fields based on terminal data structure
function openAddModal() {
  if (!terminalData.length) return;
  const cols = Object.keys(terminalData[0]);
  const fields = document.getElementById("addRowFields");

  // Pick a simple icon per field based on keyword hints
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

  fields.innerHTML = cols.map(col => `
    <div class="add-field-item">
      <label class="add-field-label">
        <i class="${getIcon(col)}"></i>
        ${col}
      </label>
      <input
        type="text"
        id="field_${col.replace(/\s+/g, '_')}"
        data-col="${col}"
        class="add-field-input"
        placeholder="Enter ${col.toLowerCase()}…"
        autocomplete="off"
      >
    </div>
  `).join("");

  const modal = document.getElementById("addRowModal");
  modal.classList.remove("hidden");

  const closeModal = () => modal.classList.add("hidden");

  document.getElementById("cancelAddRow").onclick = closeModal;
  document.getElementById("cancelAddRowFooter").onclick = closeModal;

  // Close on overlay click
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };

  document.getElementById("confirmAddRow").onclick = async () => {
    const newRow = {};
    cols.forEach(col => {
      const input = document.querySelector(`[data-col="${col}"]`);
      newRow[col] = input ? input.value.trim() : "";
    });

    const saveBtn = document.getElementById("confirmAddRow");
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Saving…';

    try {
      const region = document.getElementById("regionSelect").value;
      const res = await fetch(`/api/terminals/${region}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow)
      });

      const result = await res.json();

      if (!res.ok) {
        alert("Failed to save: " + (result.error || "Unknown error"));
        return;
      }

      // Insert returned row (with any DB-generated values) at the top
      const saved = result.row || newRow;
      terminalData.unshift(saved);
      terminalFiltered = [...terminalData];
      terminalPage = 1;
      renderTerminalTable();
      renderTerminalPagination();
      closeModal();

    } catch (err) {
      console.error("Save error:", err);
      alert("Network error — could not save the terminal.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ri-save-line"></i> Save Terminal';
    }
  };
}

/* ================= DASHBOARD VIEW ================= */
// Load the dashboard overview with summary cards and recent incident reports
function loadDashboard() {
  mainContent.innerHTML = `
    <div class="topbar">
      <div class="left">
        <h2>Welcome back, ${user.email}</h2>
      </div>
      <div class="right">
        <div class="search-box">
          <i class="ri-search-line"></i>
          <input type="text" placeholder="Search here">
        </div>
        <button id="darkToggle" class="icon-btn" title="Toggle Dark Mode">
          <i class="ri-moon-line"></i>
        </button>
      </div>
    </div>

    <h3 class="section-title">Overview</h3>

    <div class="cards">
      <div class="card">
        <div class="card-top">
          <div class="icon-box blue"><i class="ri-map-pin-2-line"></i></div>
          <div class="stat">
            <h1 class="counter" data-target="438">0</h1>
            <span class="trend up">↑ +3%</span>
          </div>
        </div>
        <p>Total Sites</p>
      </div>
      <div class="card">
        <div class="card-top">
          <div class="icon-box green"><i class="ri-shield-check-line"></i></div>
          <div class="stat">
            <h1 class="counter" data-target="420">0</h1>
            <span class="trend up">↑ +5%</span>
          </div>
        </div>
        <p>Active Sites</p>
      </div>
      <div class="card alert-card">
        <div class="card-top">
          <div class="icon-box orange pulse"><i class="ri-error-warning-line"></i></div>
          <div class="stat">
            <h1 class="counter" data-target="18">0</h1>
            <span class="trend down">↓ -2%</span>
          </div>
        </div>
        <p>Problematic Sites</p>
      </div>
      <div class="card">
        <div class="card-top">
          <div class="icon-box red"><i class="ri-alarm-warning-line"></i></div>
          <div class="stat">
            <h1 class="counter" data-target="6">0</h1>
            <span class="trend down">↓ -1%</span>
          </div>
        </div>
        <p>Open Incidents</p>
      </div>
    </div>

    <div class="table-container">
      <div class="table-title">
        <i class="ri-file-list-3-line"></i>
        Recent Incident Reports
      </div>
      <table>
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>Province</th>
            <th>Issue</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>INC-1023</td><td>Province 1</td><td>No Signal</td>
            <td><span class="badge high">High</span></td>
            <td><span class="badge completed">Completed</span></td>
          </tr>
          <tr>
            <td>INC-1024</td><td>Province 2</td><td>Power Failure</td>
            <td><span class="badge medium">Medium</span></td>
            <td><span class="badge progress">In Progress</span></td>
          </tr>
          <tr>
            <td>INC-1025</td><td>Province 3</td><td>Battery Low</td>
            <td><span class="badge low">Low</span></td>
            <td><span class="badge pending">Pending</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  // Dark mode toggle
  document.getElementById("darkToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const icon = document.querySelector("#darkToggle i");
    icon.className = document.body.classList.contains("dark") ? "ri-sun-line" : "ri-moon-line";
  });

  runCounters();
}

/* ================= PROBLEMATIC SITES ================= */

// Load the problematic sites view with a table of active issues and their details
function loadProblematicSites() {
  mainContent.innerHTML = `
    <h3 class="section-title">Problematic Sites</h3>
    <div class="table-container">
      <div class="table-title">
        <i class="ri-error-warning-line"></i>
        Active Problematic Sites
      </div>
      <table>
        <thead>
          <tr>
            <th>Site ID</th><th>Province</th><th>Issue</th><th>Last Reported</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SITE-001</td><td>Province 1</td><td>No Signal</td><td>2026-02-24</td>
            <td><span class="badge high">Critical</span></td>
          </tr>
          <tr>
            <td>SITE-002</td><td>Province 2</td><td>Power Failure</td><td>2026-02-23</td>
            <td><span class="badge medium">Warning</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

/* ================= TICKETS ================= */
// Load the ticket management view with a searchable, paginated table of tickets and a modal for creating new tickets
function loadTickets() {
  mainContent.innerHTML = `
    <h3 class="section-title">Ticket Management</h3>

    <div class="tickets-toolbar">
      <button id="openModal" class="tool-btn apply-btn">
        <i class="ri-add-line"></i> Create Ticket
      </button>
      <div class="search-box">
        <i class="ri-search-line"></i>
        <input type="text" id="ticketSearch" placeholder="Search tickets…">
      </div>
    </div>

    <div class="table-container">
      <div class="table-title">
        <i class="ri-ticket-2-line"></i> Tickets
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Site</th><th>Issue</th><th>Priority</th><th>Status</th><th>Date</th><th>Action</th>
          </tr>
        </thead>
        <tbody id="ticketTable"></tbody>
      </table>
    </div>

    <div class="pagination-bar" id="pagination"></div>

    <!-- MODAL -->
    <div id="ticketModal" class="modal-overlay hidden">
      <div class="modal-box">
        <h3><i class="ri-ticket-2-line"></i> Create Ticket</h3>
        <div class="form-group">
          <label>Site ID</label>
          <input id="siteInput" placeholder="e.g. SITE-10">
        </div>
        <div class="form-group">
          <label>Issue</label>
          <input id="issueInput" placeholder="Describe the issue">
        </div>
        <div class="form-group">
          <label>Priority</label>
          <select id="priorityInput">
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
        <div class="modal-actions">
          <button id="closeModal" class="tool-btn">Cancel</button>
          <button id="saveTicket" class="tool-btn apply-btn">Save Ticket</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("ticketSearch").addEventListener("input", () => {
    currentPage = 1;
    renderTable();
    renderPagination();
  });

  renderTable();
  renderPagination();
  setupModal();
}

/* ================= TABLE RENDER ================= */
// Get the current list of tickets filtered by the search query
function getFilteredTickets() {
  const q = (document.getElementById("ticketSearch")?.value || "").toLowerCase();
  if (!q) return tickets;
  return tickets.filter(t =>
    Object.values(t).some(v => String(v).toLowerCase().includes(q))
  );
}
// Render the ticket table based on current filters and pagination
function renderTable() {
  const table = document.getElementById("ticketTable");
  if (!table) return;
  table.innerHTML = "";

  const filtered = getFilteredTickets();
  const start = (currentPage - 1) * rowsPerPage;
  const paginated = filtered.slice(start, start + rowsPerPage);

  if (!paginated.length) {
    table.innerHTML = `<tr><td colspan="7" class="empty-cell">No tickets found</td></tr>`;
    return;
  }

  paginated.forEach(ticket => {
    table.innerHTML += `
      <tr>
        <td><strong>${ticket.id}</strong></td>
        <td>${ticket.site}</td>
        <td>${ticket.issue}</td>
        <td><span class="badge ${getPriorityClass(ticket.priority)}">${ticket.priority}</span></td>
        <td>
          <select onchange="updateStatus('${ticket.id}', this.value, this)" class="status-select">
            ${renderStatusOptions(ticket.status)}
          </select>
        </td>
        <td>${ticket.date}</td>
        <td>
          <button class="tool-btn danger-btn small-btn" onclick="deleteTicket('${ticket.id}')">
            <i class="ri-delete-bin-line"></i>
          </button>
        </td>
      </tr>
    `;
  });
}
// Delete a ticket by ID and re-render the table and pagination
function deleteTicket(id) {
  tickets = tickets.filter(t => t.id !== id);
  renderTable();
  renderPagination();
}
// Render the options for the status select dropdown, marking the current status as selected
function renderStatusOptions(current) {
  return ["Pending", "In Progress", "Completed"].map(status =>
    `<option value="${status}" ${status === current ? "selected" : ""}>${status}</option>`
  ).join("");
}
// Update the status of a ticket by ID and re-render the table
function updateStatus(id, newStatus, element) {
  tickets = tickets.map(t => t.id === id ? { ...t, status: newStatus } : t);
}

// Get the CSS class for a given priority level to style the badge accordingly
function getPriorityClass(priority) {
  if (priority === "High") return "high";
  if (priority === "Medium") return "medium";
  return "low";
}

// Render pagination controls based on current page, total filtered tickets, and rows per page
function renderPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;

  const filtered = getFilteredTickets();
  const total = Math.ceil(filtered.length / rowsPerPage);
  const start = (currentPage - 1) * rowsPerPage + 1;
  const end = Math.min(currentPage * rowsPerPage, filtered.length);

  if (total <= 1) { container.innerHTML = ""; return; }

  const range = getPageRange(currentPage, total);
  let pagesHtml = range.map(p => {
    if (p === '...') return `<button class="page-btn dots" disabled>…</button>`;
    return `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="changePage(${p})">${p}</button>`;
  }).join("");

  container.innerHTML = `
    <span class="page-info">Showing ${start}–${end} of ${filtered.length}</span>
    <div class="page-buttons">
      <button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="ri-arrow-left-s-line"></i></button>
      ${pagesHtml}
      <button class="page-btn ${currentPage === total ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})" ${currentPage === total ? 'disabled' : ''}><i class="ri-arrow-right-s-line"></i></button>
    </div>
  `;
}

// Get page range for pagination controls, showing first 5, last 5, and 2 around current page
function changePage(page) {
  const filtered = getFilteredTickets();
  const total = Math.ceil(filtered.length / rowsPerPage);
  if (page < 1 || page > total) return;
  currentPage = page;
  renderTable();
  renderPagination();
}

/* ================= MODAL ================= */
// Set up event listeners for opening and closing the ticket creation modal, as well as saving a new ticket
function setupModal() {
  const modal = document.getElementById("ticketModal");

  document.getElementById("openModal").onclick = () => {
    modal.classList.remove("hidden");
  };

  document.getElementById("closeModal").onclick = () => {
    modal.classList.add("hidden");
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  document.getElementById("saveTicket").onclick = () => {
    const site = document.getElementById("siteInput").value.trim();
    const issue = document.getElementById("issueInput").value.trim();
    const priority = document.getElementById("priorityInput").value;
    if (!site || !issue) {
      alert("Please fill in all fields.");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    tickets.unshift({
      id: "TIC-" + String(Math.floor(Math.random() * 900) + 100),
      site, issue, priority, status: "Pending", date: today
    });
    modal.classList.add("hidden");
    document.getElementById("siteInput").value = "";
    document.getElementById("issueInput").value = "";
    currentPage = 1;
    renderTable();
    renderPagination();
  };
}

/* ================= COUNTERS ================= */
// Animate the counters in the dashboard overview cards from 0 to their target values for a dynamic effect
function runCounters() {
  document.querySelectorAll(".counter").forEach(counter => {
    const target = +counter.getAttribute("data-target");
    let count = 0;
    const update = () => {
      if (count < target) {
        count += Math.ceil(target / 80);
        counter.innerText = Math.min(count, target);
        setTimeout(update, 12);
      } else {
        counter.innerText = target;
      }
    };
    update();
  });
}

/* ================= INITIAL LOAD ================= */

loadDashboard();