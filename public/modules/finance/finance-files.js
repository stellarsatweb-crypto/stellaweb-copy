/* ================= FINANCE FILES MODULE =================
   Finance-local copy of the existing Files module.
   Keeps UI behavior identical while using Finance-only API/data scope.
*/

(() => {
let lettersUploadQueue = [];

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
function lettersModuleScope() { return "finance"; }
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

  getFinanceMainContent().innerHTML = `
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
              <div class="chip-option chip-opt-type" data-val="image"><i class="ri-image-fill" style="color:#d97706"></i> Image</div>
              <div class="chip-option chip-opt-type" data-val="video"><i class="ri-video-fill" style="color:#64748b"></i> Video</div>
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
    fetch(lettersApiUrl('/api/finance/files/download-history'))
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
  fetch(lettersApiUrl('/api/finance/files/download-history'))
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
  fetch(lettersApiUrl('/api/finance/files/download-history'), {
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
    const res  = await fetch(lettersApiUrl("/api/finance/files/files/recent"));
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
      const res  = await fetch(lettersApiUrl("/api/finance/files/folders"));
      const data = await res.json();
      renderLettersFolders(data, null);
    } else {
      const [subfoldersRes, filesRes] = await Promise.all([
        fetch(lettersApiUrl("/api/finance/files/folders", { parent_id: fid })),
        fetch(lettersApiUrl(`/api/finance/files/folders/${fid}/files`, { q: lettersSearchQuery }))
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
  if (["png","jpg","jpeg","gif","webp","image"].includes(t) || ["png","jpg","jpeg","gif","webp"].includes(e)) return { icon: "ri-image-fill", color: "#d97706", kind: "image" };
  if (["zip","rar","archive"].includes(t) || ["zip","rar"].includes(e)) return { icon: "ri-file-zip-fill", color: "#64748b", kind: "archive" };
  if (["mp4","webm","mov","avi","mkv","video"].includes(t) || ["mp4","webm","mov","avi","mkv"].includes(e)) return { icon: "ri-video-fill", color: "#64748b", kind: "video" };
  return { icon: "ri-file-fill", color: "#6b7280", kind: "unknown" };
}

function getLettersThumbHtml(file, fi, variant = "row") {
  const cls = variant === "recent" ? "letters-file-thumb recent" : "letters-file-thumb";
  if (fi.kind === "image" && file?.id) {
    return `<span class="${cls} image"><img src="${lettersApiUrl(`/api/finance/files/files/${file.id}/preview`)}" alt=""></span>`;
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
  const previewUrl = lettersApiUrl(`/api/finance/files/files/${id}/preview`);
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
  return lettersApiUrl(`/api/finance/files/files/${id}/download`, { user: downloadedBy });
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
  const previewUrl = lettersApiUrl(`/api/finance/files/files/${id}/preview`);
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
    const res    = await fetch(lettersApiUrl(`/api/finance/files/files/${id}/copy`), {
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
    const res    = await fetch(lettersApiUrl(`/api/finance/files/folders/${id}/copy`), {
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
    const res    = await fetch(lettersApiUrl(`/api/finance/files/files/${id}/copy`), {
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
      const url    = type === "folder" ? lettersApiUrl(`/api/finance/files/folders/${id}`) : lettersApiUrl(`/api/finance/files/files/${id}`);
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
      const url = type === "folder" ? lettersApiUrl(`/api/finance/files/folders/${id}`) : lettersApiUrl(`/api/finance/files/files/${id}`);
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
      const res    = await fetch(lettersApiUrl("/api/finance/files/folders"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_name: name, parent_id, module: lettersModuleScope() }) });
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
      const res    = await fetch(lettersApiUrl("/api/finance/files/files"), { method: "POST", body: formData });
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
    xhr.open("POST", lettersApiUrl("/api/finance/files/files"));
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

window.loadFinanceFiles = loadLetters;
})();
