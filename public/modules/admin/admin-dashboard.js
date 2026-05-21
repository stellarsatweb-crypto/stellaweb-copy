/* ================= ADMIN MODULE ================= */

const adminUser = (() => {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
})();
let adminStaffIds = [];
let adminStaffSearch = "";
let adminStaffStatus = "all";

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "X-User-Id": adminUser?.id || "",
    "X-User-Role": adminUser?.role || ""
  };
}

function adminNumber(value) {
  return Number(value || 0).toLocaleString();
}

function adminMoney(value) {
  return "\u20b1" + Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function adminEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function ensureAdminStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function ensureAdminScript(id, src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing?.dataset.loaded === "1") return resolve();
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureAdminNocModule() {
  if (window.__adminNocLoaders) return window.__adminNocLoaders;
  ensureAdminStylesheet("admin-noc-dashboard-css", "/modules/noc/noc-dashboard.css");
  await ensureAdminScript("admin-noc-dashboard-js", "/modules/noc/noc-dashboard.js");
  window.__adminNocLoaders = {
    dashboard: window.loadDashboard,
    map: window.loadMap,
    terminals: window.loadTerminals,
    problematicSites: window.loadProblematicSites,
    acceptance: window.loadAcceptance,
    ticket: window.loadTickets,
    reports: window.loadReports,
    files: window.loadLetters,
    inventory: window.loadInventory
  };
  return window.__adminNocLoaders;
}

async function ensureAdminFinanceModule() {
  if (window.__adminFinanceLoaders) return window.__adminFinanceLoaders;
  ensureAdminStylesheet("admin-finance-dashboard-css", "/modules/finance/finance-dashboard.css");
  await ensureAdminScript("admin-finance-files-js", "/modules/finance/finance-files.js");
  await ensureAdminScript("admin-finance-dashboard-js", "/modules/finance/finance-dashboard.js");
  window.__adminFinanceLoaders = {
    dashboard: window.loadFinanceDashboard,
    companyIncome: window.loadFinanceCompanyIncome,
    companyExpenses: window.loadFinanceCompanyExpenses,
    projectExpenses: () => window.loadFinanceLedger("project_expenses"),
    collections: () => window.loadFinanceLedger("collections"),
    inventory: window.loadFinanceInventory,
    files: window.loadFinanceFiles,
    employee: window.loadFinanceEmployeeCenter,
    financialReport: window.loadFinanceReportV2
  };
  return window.__adminFinanceLoaders;
}

function renderAdminViewLoading(label) {
  mainContent.innerHTML = `
    <div class="admin-page">
      <div class="admin-empty"><i class="ri-loader-4-line spin"></i> Loading ${adminEsc(label)}...</div>
    </div>
  `;
}

async function loadAdminNocView(viewName, label) {
  renderAdminViewLoading(`NOC ${label}`);
  try {
    const loaders = await ensureAdminNocModule();
    const loader = loaders[viewName];
    if (typeof loader !== "function") throw new Error("NOC view is unavailable.");
    await loader();
  } catch (err) {
    mainContent.innerHTML = `<div class="admin-page"><div class="admin-empty"><i class="ri-error-warning-line"></i> ${adminEsc(err.message || "Unable to load NOC view.")}</div></div>`;
  }
}

async function loadAdminFinanceView(viewName, label) {
  renderAdminViewLoading(`Finance ${label}`);
  try {
    const loaders = await ensureAdminFinanceModule();
    const loader = loaders[viewName];
    if (typeof loader !== "function") throw new Error("Finance view is unavailable.");
    await loader();
  } catch (err) {
    mainContent.innerHTML = `<div class="admin-page"><div class="admin-empty"><i class="ri-error-warning-line"></i> ${adminEsc(err.message || "Unable to load Finance view.")}</div></div>`;
  }
}

function loadAdminDashboard() {
  mainContent.innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <div class="admin-header-title">
          <div class="admin-header-icon"><i class="ri-shield-user-line"></i></div>
          <div>
            <h2>Admin Dashboard</h2>
            <p>System-wide overview for ${adminUser?.full_name || adminUser?.email || "Admin"}</p>
          </div>
        </div>
        <div class="admin-actions">
          <button class="admin-action-btn primary" onclick="openAdminPage('nocDashboard')">
            <i class="ri-base-station-line"></i> NOC
          </button>
          <button class="admin-action-btn" onclick="openAdminPage('financeDashboard')">
            <i class="ri-bank-card-line"></i> Finance
          </button>
        </div>
      </div>

      <div id="adminOverview">
        <div class="admin-empty"><i class="ri-loader-4-line spin"></i> Loading admin overview...</div>
      </div>
    </div>
  `;

  fetchAdminOverview();
}

function loadAdminSettings() {
  const initials = adminUser.full_name
    ? adminUser.full_name.split(" ").filter(Boolean).map(word => word[0]).join("").slice(0, 2).toUpperCase()
    : "A";
  mainContent.innerHTML = `
    <div class="stg-page">
      <div class="stg-layout">
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
              ${adminUser.photo ? `<img src="${adminEsc(adminUser.photo)}" class="stg-nav-avatar-img" alt="avatar">` : `<span>${adminEsc(initials)}</span>`}
            </div>
            <div class="stg-nav-userinfo">
              <div class="stg-nav-username">${adminEsc(adminUser.full_name || "-")}</div>
              <div class="stg-nav-userrole">${adminEsc(adminUser.role || "Admin")}</div>
            </div>
          </div>
        </nav>

        <div class="stg-panels">
          <div class="stg-panel active" id="stg-tab-account">
            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-user-3-line"></i> Profile Information</div>
                <button class="stg-outline-btn" id="stgEditBtn"><i class="ri-edit-line"></i> Edit Profile</button>
              </div>

              <div class="stg-profile-hero">
                <div class="stg-avatar-wrap">
                  ${adminUser.photo ? `<img src="${adminEsc(adminUser.photo)}" class="stg-avatar-img" id="stgAvatarImg" alt="Profile">` : `<div class="stg-avatar" id="stgAvatar">${adminEsc(initials)}</div>`}
                  <label class="stg-avatar-upload-btn" for="stgPhotoInput" title="Change photo">
                    <i class="ri-camera-line"></i>
                  </label>
                  <input type="file" id="stgPhotoInput" accept="image/*" style="display:none;">
                </div>
                <div class="stg-profile-hero-info">
                  <div class="stg-profile-name">${adminEsc(adminUser.full_name || "-")}</div>
                  <span class="stg-role-badge">${adminEsc(adminUser.role || "Admin")}</span>
                  <div class="stg-photo-hint"><i class="ri-information-line"></i> Click the camera icon to update your photo</div>
                </div>
              </div>

              <div class="stg-info-grid">
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-user-line"></i> Full Name</div>
                  <div class="stg-info-value">${adminEsc(adminUser.full_name || "-")}</div>
                </div>
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-id-card-line"></i> ID Number</div>
                  <div class="stg-info-value">${adminEsc(adminUser.id_no || "-")}</div>
                </div>
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-mail-line"></i> Email Address</div>
                  <div class="stg-info-value">${adminEsc(adminUser.email || "-")}</div>
                </div>
                <div class="stg-info-cell">
                  <div class="stg-info-label"><i class="ri-shield-user-line"></i> Role</div>
                  <div class="stg-info-value" style="text-transform:capitalize;">${adminEsc(adminUser.role || "Admin")}</div>
                </div>
              </div>
            </div>

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
            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-inbox-2-line"></i> Inbox</div>
              </div>
              <div class="admin-empty">Messages and requests are available inside the NOC module.</div>
            </div>
          </div>

          <div class="stg-panel" id="stg-tab-myrequests">
            <div class="stg-card2">
              <div class="stg-card2-header">
                <div class="stg-card2-title"><i class="ri-file-list-3-line"></i> My Requests</div>
                <button class="stg-outline-btn" id="stgNewRequestBtn"><i class="ri-add-line"></i> New Request</button>
              </div>
              <div class="admin-empty">No requests to show.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll(".stg-navitem").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".stg-navitem").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".stg-panel").forEach(panel => panel.classList.remove("active"));
      this.classList.add("active");
      document.getElementById(`stg-tab-${this.dataset.tab}`)?.classList.add("active");
    });
  });

  document.getElementById("stgBrightness")?.addEventListener("input", event => {
    const value = event.target.value;
    const badge = document.getElementById("stgBrightnessVal");
    if (badge) badge.textContent = `${value}%`;
    document.body.style.filter = `brightness(${value}%)`;
  });

  document.getElementById("stgFontSize")?.addEventListener("input", event => {
    const badge = document.getElementById("stgFontVal");
    if (badge) badge.textContent = `${event.target.value}px`;
  });

  document.querySelectorAll(".stg-theme-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".stg-theme-pill").forEach(item => item.classList.remove("active"));
      btn.classList.add("active");
      document.body.classList.toggle("dark", btn.dataset.theme === "dark");
    });
  });
}

async function fetchAdminOverview() {
  const root = document.getElementById("adminOverview");
  if (!root) return;

  try {
    const res = await fetch("/api/admin/overview", { headers: adminHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load admin overview");
    renderAdminOverview(data);
  } catch (err) {
    root.innerHTML = `<div class="admin-empty"><i class="ri-error-warning-line"></i> ${err.message || "Admin overview failed to load."}</div>`;
  }
}

function renderAdminOverview(data) {
  const cards = [
    { label: "NOC Tickets", value: adminNumber(data.noc?.tickets || 0), icon: "ri-ticket-line" },
    { label: "Finance Income", value: adminMoney(data.finance?.total_income || 0), icon: "ri-line-chart-line" },
    { label: "Inventory Items", value: adminNumber(data.inventory?.total_items || 0), icon: "ri-archive-2-line" },
    { label: "Files", value: adminNumber(data.files?.total_files || 0), icon: "ri-file-line" },
    { label: "Employees", value: adminNumber(data.employees?.total || 0), icon: "ri-team-line" },
    { label: "Requests", value: adminNumber(data.requests?.pending || 0), icon: "ri-inbox-line" }
  ];

  document.getElementById("adminOverview").innerHTML = `
    <div class="admin-summary-grid">
      ${cards.map(card => `
        <div class="admin-card">
          <div class="admin-card-head">
            <div class="admin-card-icon"><i class="${card.icon}"></i></div>
            <div>
              <strong>${card.value}</strong>
              <span>${card.label}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="admin-detail-grid">
      <div class="admin-panel">
        <h3>NOC Summary</h3>
        <div class="admin-list">
          <div class="admin-list-row"><span>Regions</span><b>${adminNumber(data.noc?.regions)}</b></div>
          <div class="admin-list-row"><span>Problematic Sites</span><b>${adminNumber(data.noc?.problematic_sites)}</b></div>
          <div class="admin-list-row"><span>Acceptance Sites</span><b>${adminNumber(data.noc?.acceptance_sites)}</b></div>
        </div>
      </div>

      <div class="admin-panel">
        <h3>Finance Summary</h3>
        <div class="admin-list">
          <div class="admin-list-row"><span>Total Income</span><b>${adminMoney(data.finance?.total_income)}</b></div>
          <div class="admin-list-row"><span>Total Expenses</span><b>${adminMoney(data.finance?.total_expenses)}</b></div>
          <div class="admin-list-row"><span>Collections</span><b>${adminMoney(data.finance?.total_collections)}</b></div>
        </div>
      </div>

      <div class="admin-panel">
        <h3>Inventory and Files</h3>
        <div class="admin-list">
          <div class="admin-list-row"><span>NOC Inventory</span><b>${adminNumber(data.inventory?.noc_items)}</b></div>
          <div class="admin-list-row"><span>Finance Inventory</span><b>${adminNumber(data.inventory?.finance_items)}</b></div>
          <div class="admin-list-row"><span>Uploaded Files</span><b>${adminNumber(data.files?.total_files)}</b></div>
        </div>
      </div>
    </div>
  `;
}

function adminRoleLabel(role) {
  const key = String(role || "").toLowerCase();
  if (key === "noc") return "NOC";
  if (key === "finance") return "Finance";
  if (key === "admin") return "Admin";
  return role || "-";
}

function adminStatusClass(status) {
  return String(status || "unused").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function loadAdminStaffIds() {
  mainContent.innerHTML = `
    <div class="admin-page admin-staff-page">
      <div class="admin-header">
        <div class="admin-header-title">
          <div class="admin-header-icon"><i class="ri-id-card-line"></i></div>
          <div>
            <h2>Staff ID Management</h2>
            <p>Create Staff IDs before staff can register accounts.</p>
          </div>
        </div>
      </div>

      <div class="admin-staff-grid">
        <form class="admin-staff-form admin-panel" id="adminStaffForm">
          <h3>Add Staff ID</h3>
          <label><span>Staff ID</span><input name="staff_id" type="text" required placeholder="e.g. ST-1001"></label>
          <label><span>Department / Module</span><input name="department" type="text" placeholder="NOC Department"></label>
          <label>
            <span>Assigned System Role</span>
            <select name="assigned_role" required>
              <option value="noc">NOC</option>
              <option value="finance">Finance</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button class="admin-action-btn primary" type="submit"><i class="ri-add-line"></i> Create Staff ID</button>
          <div class="admin-staff-message" id="adminStaffMessage"></div>
        </form>

        <div class="admin-panel admin-staff-list-panel">
          <div class="admin-staff-toolbar">
            <h3>Staff IDs</h3>
            <div class="admin-staff-filters">
              <input id="adminStaffSearch" type="search" placeholder="Search Staff IDs..." value="${adminEsc(adminStaffSearch)}">
              <select id="adminStaffStatus">
                <option value="all" ${adminStaffStatus === "all" ? "selected" : ""}>All</option>
                <option value="unused" ${adminStaffStatus === "unused" ? "selected" : ""}>Unused</option>
                <option value="used" ${adminStaffStatus === "used" ? "selected" : ""}>Used</option>
                <option value="disabled" ${adminStaffStatus === "disabled" ? "selected" : ""}>Disabled</option>
              </select>
            </div>
          </div>
          <div id="adminStaffTableHost" class="admin-staff-table-host">
            <div class="admin-empty"><i class="ri-loader-4-line spin"></i> Loading Staff IDs...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("adminStaffForm")?.addEventListener("submit", createAdminStaffId);
  document.getElementById("adminStaffSearch")?.addEventListener("input", event => {
    adminStaffSearch = event.target.value.trim();
    clearTimeout(window.__adminStaffSearchTimer);
    window.__adminStaffSearchTimer = setTimeout(fetchAdminStaffIds, 220);
  });
  document.getElementById("adminStaffStatus")?.addEventListener("change", event => {
    adminStaffStatus = event.target.value;
    fetchAdminStaffIds();
  });

  fetchAdminStaffIds();
}

async function fetchAdminStaffIds() {
  const host = document.getElementById("adminStaffTableHost");
  if (!host) return;
  const params = new URLSearchParams();
  if (adminStaffSearch) params.set("search", adminStaffSearch);
  if (adminStaffStatus && adminStaffStatus !== "all") params.set("status", adminStaffStatus);
  try {
    const res = await fetch(`/api/admin/staff-ids?${params.toString()}`, { headers: adminHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(adminStaffIdApiError(res, data, "Unable to load Staff IDs"));
    adminStaffIds = Array.isArray(data) ? data : [];
    renderAdminStaffIds();
  } catch (err) {
    host.innerHTML = `<div class="admin-empty"><i class="ri-error-warning-line"></i> ${adminEsc(err.message || "Failed to load Staff IDs.")}</div>`;
  }
}

function adminStaffIdApiError(res, data, fallback) {
  if (res.status === 404) {
    return "Staff ID API route is not available. Restart the server to load the latest backend changes.";
  }
  return data.error || fallback;
}

function renderAdminStaffIds() {
  const host = document.getElementById("adminStaffTableHost");
  if (!host) return;
  if (!adminStaffIds.length) {
    host.innerHTML = `<div class="admin-empty"><i class="ri-id-card-line"></i> No Staff IDs found.</div>`;
    return;
  }
  host.innerHTML = `
    <div class="admin-staff-table-wrap">
      <table class="admin-staff-table">
        <thead>
          <tr>
            <th>Staff ID</th>
            <th>Department</th>
            <th>Role</th>
            <th>Status</th>
            <th>Linked Account</th>
            <th>Date Created</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${adminStaffIds.map(row => `
            <tr>
              <td><strong>${adminEsc(row.staff_id)}</strong></td>
              <td>${adminEsc(row.department || "-")}</td>
              <td>${adminEsc(adminRoleLabel(row.assigned_role))}</td>
              <td><span class="admin-staff-status ${adminStatusClass(row.status)}">${adminEsc(row.status || "unused")}</span></td>
              <td>${row.linked_user_email ? `${adminEsc(row.linked_user_name || "")}<small>${adminEsc(row.linked_user_email)}</small>` : "-"}</td>
              <td>${row.created_at ? adminEsc(new Date(row.created_at).toLocaleDateString()) : "-"}</td>
              <td>
                ${String(row.status).toLowerCase() === "unused"
                  ? `<button class="admin-staff-disable" data-id="${row.id}"><i class="ri-forbid-line"></i> Disable</button>`
                  : `<span class="admin-muted">-</span>`}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  host.querySelectorAll(".admin-staff-disable").forEach(btn => {
    btn.addEventListener("click", () => disableAdminStaffId(btn.dataset.id));
  });
}

async function createAdminStaffId(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("adminStaffMessage");
  const btn = form.querySelector("button[type='submit']");
  const body = Object.fromEntries(new FormData(form).entries());
  if (message) message.textContent = "";
  btn.disabled = true;
  try {
    const res = await fetch("/api/admin/staff-ids", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(adminStaffIdApiError(res, data, "Unable to create Staff ID"));
    form.reset();
    if (message) {
      message.className = "admin-staff-message success";
      message.textContent = "Staff ID created.";
    }
    fetchAdminStaffIds();
  } catch (err) {
    if (message) {
      message.className = "admin-staff-message error";
      message.textContent = err.message || "Failed to create Staff ID.";
    }
  } finally {
    btn.disabled = false;
  }
}

async function disableAdminStaffId(id) {
  if (!confirm("Disable this Staff ID? Disabled IDs cannot be used for registration.")) return;
  try {
    const res = await fetch(`/api/admin/staff-ids/${id}/disable`, {
      method: "PATCH",
      headers: adminHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(adminStaffIdApiError(res, data, "Unable to disable Staff ID"));
    fetchAdminStaffIds();
  } catch (err) {
    alert(err.message || "Failed to disable Staff ID.");
  }
}

window.ADMIN_PAGE_DEFS = {
  adminDashboard: { label: "Admin Dashboard", icon: "ri-shield-user-line", loader: () => loadAdminDashboard() },
  staffIds: { label: "Staff ID Management", icon: "ri-id-card-line", loader: () => loadAdminStaffIds() },
  nocDashboard: { label: "NOC Dashboard", icon: "ri-dashboard-line", loader: () => loadAdminNocView("dashboard", "Dashboard") },
  nocMap: { label: "Map", icon: "ri-map-2-line", loader: () => loadAdminNocView("map", "Map") },
  nocTerminals: { label: "Terminals", icon: "ri-terminal-line", loader: () => loadAdminNocView("terminals", "Terminals") },
  nocProblematicSites: { label: "Problematic Sites", icon: "ri-error-warning-line", loader: () => loadAdminNocView("problematicSites", "Problematic Sites") },
  nocAcceptance: { label: "Acceptance", icon: "ri-checkbox-circle-line", loader: () => loadAdminNocView("acceptance", "Acceptance") },
  nocTicket: { label: "Ticket", icon: "ri-ticket-line", loader: () => loadAdminNocView("ticket", "Ticket") },
  nocReports: { label: "Reports", icon: "ri-bar-chart-line", loader: () => loadAdminNocView("reports", "Reports") },
  nocFiles: { label: "Files", icon: "ri-file-line", loader: () => loadAdminNocView("files", "Files") },
  nocInventory: { label: "Inventory", icon: "ri-archive-2-line", loader: () => loadAdminNocView("inventory", "Inventory") },
  financeDashboard: { label: "Finance Dashboard", icon: "ri-dashboard-line", loader: () => loadAdminFinanceView("dashboard", "Dashboard") },
  companyIncome: { label: "Company Income", icon: "ri-line-chart-line", loader: () => loadAdminFinanceView("companyIncome", "Company Income") },
  companyExpenses: { label: "Company Expenses", icon: "ri-shopping-cart-line", loader: () => loadAdminFinanceView("companyExpenses", "Company Expenses") },
  projectExpenses: { label: "Project Expenses", icon: "ri-file-list-3-line", loader: () => loadAdminFinanceView("projectExpenses", "Project Expenses") },
  collections: { label: "Collections", icon: "ri-hand-coin-line", loader: () => loadAdminFinanceView("collections", "Collections") },
  financeInventory: { label: "Inventory", icon: "ri-archive-2-line", loader: () => loadAdminFinanceView("inventory", "Inventory") },
  financeFiles: { label: "Files", icon: "ri-file-line", loader: () => loadAdminFinanceView("files", "Files") },
  employee: { label: "Employee", icon: "ri-user-line", loader: () => loadAdminFinanceView("employee", "Employee") },
  financialReport: { label: "Financial Report", icon: "ri-bar-chart-2-line", loader: () => loadAdminFinanceView("financialReport", "Financial Report") },
  settings: { label: "Settings", icon: "ri-settings-3-line", loader: () => loadAdminSettings() },
  logout: { label: "Log Out", icon: "ri-logout-circle-r-line", loader: () => showAdminLogoutModal() }
};

window.ADMIN_SIDEBAR_SECTIONS = [
  { label: "Main", pages: ["adminDashboard", "staffIds"] },
  {
    label: "Modules",
    groups: [
      { key: "noc", label: "NOC", icon: "ri-base-station-line", pages: ["nocDashboard", "nocMap", "nocTerminals", "nocProblematicSites", "nocAcceptance", "nocTicket", "nocReports", "nocFiles", "nocInventory"] },
      { key: "finance", label: "Finance", icon: "ri-bank-card-line", pages: ["financeDashboard", "companyIncome", "companyExpenses", "projectExpenses", "collections", "financeInventory", "financeFiles", "employee", "financialReport"] }
    ]
  },
  { label: "System", pages: ["settings", "logout"] }
];

window.ADMIN_START_PAGE = "adminDashboard";

const ADMIN_VIEW_BY_PAGE = {
  adminDashboard: "admin-dashboard",
  staffIds: "staff-ids",
  nocDashboard: "noc-dashboard",
  nocMap: "noc-map",
  nocTerminals: "noc-terminals",
  nocProblematicSites: "noc-problematic-sites",
  nocAcceptance: "noc-acceptance",
  nocTicket: "noc-ticket",
  nocReports: "noc-reports",
  nocFiles: "noc-files",
  nocInventory: "noc-inventory",
  financeDashboard: "finance-dashboard",
  companyIncome: "finance-company-income",
  companyExpenses: "finance-company-expenses",
  projectExpenses: "finance-project-expenses",
  collections: "finance-collections",
  financeInventory: "finance-inventory",
  financeFiles: "finance-files",
  employee: "finance-employee",
  financialReport: "finance-financial-report",
  settings: "settings",
  logout: "logout"
};
const ADMIN_PAGE_BY_VIEW = Object.fromEntries(Object.entries(ADMIN_VIEW_BY_PAGE).map(([page, view]) => [view, page]));

function getAdminVisiblePages() {
  return window.ADMIN_SIDEBAR_SECTIONS.flatMap(section => [
    ...(section.pages || []),
    ...(section.groups || []).flatMap(group => group.pages || [])
  ]);
}

function getAdminHomePageKey() {
  const requestedPage = new URLSearchParams(window.location.search).get("page");
  if (requestedPage && window.ADMIN_PAGE_DEFS[requestedPage]) return requestedPage;
  if (requestedPage && ADMIN_PAGE_BY_VIEW[requestedPage]) return ADMIN_PAGE_BY_VIEW[requestedPage];
  return window.ADMIN_START_PAGE || getAdminVisiblePages()[0];
}

function setAdminActivePage(pageKey) {
  const viewName = ADMIN_VIEW_BY_PAGE[pageKey] || pageKey;
  document.querySelectorAll(".admin-menu-item[data-admin-view]").forEach(item => {
    item.classList.toggle("active", item.dataset.adminView === viewName);
  });
  document.querySelectorAll(".admin-dropdown").forEach(dropdown => {
    const hasActivePage = !!dropdown.querySelector(`.admin-menu-item[data-admin-view="${viewName}"]`);
    dropdown.classList.toggle("contains-active", hasActivePage);
    if (hasActivePage) dropdown.classList.add("expanded");
    dropdown.querySelector(".admin-dropdown-toggle")?.setAttribute(
      "aria-expanded",
      dropdown.classList.contains("expanded") ? "true" : "false"
    );
  });
}

function openAdminPage(pageKey) {
  const page = window.ADMIN_PAGE_DEFS[pageKey];
  if (!page) return;
  if (pageKey !== "logout") setAdminActivePage(pageKey);
  page.loader();
  if (pageKey !== "logout") {
    const url = new URL(window.location.href);
    url.searchParams.set("page", ADMIN_VIEW_BY_PAGE[pageKey] || pageKey);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function openAdminView(viewName) {
  openAdminPage(ADMIN_PAGE_BY_VIEW[viewName] || viewName);
}

function toggleAdminDropdown(key) {
  const dropdown = document.querySelector(`.admin-dropdown[data-dropdown="${key}"]`);
  if (!dropdown) return;
  dropdown.classList.toggle("expanded");
  dropdown.querySelector(".admin-dropdown-toggle")?.setAttribute(
    "aria-expanded",
    dropdown.classList.contains("expanded") ? "true" : "false"
  );
}

function renderAdminSidebar() {
  const nav = document.getElementById("adminSidebarNav");
  if (!nav) return;
  const pageDefs = window.ADMIN_PAGE_DEFS;
  const visible = new Set(getAdminVisiblePages());
  const firstPage = getAdminHomePageKey();

  let html = "";
  window.ADMIN_SIDEBAR_SECTIONS.forEach((section, sectionIndex) => {
    const pages = (section.pages || []).filter(pageKey => visible.has(pageKey) && pageDefs[pageKey]);
    const groups = (section.groups || [])
      .map(group => ({
        ...group,
        pages: (group.pages || []).filter(pageKey => visible.has(pageKey) && pageDefs[pageKey])
      }))
      .filter(group => group.pages.length);

    if (!pages.length && !groups.length) return;
    if (sectionIndex > 0) html += `<div class="admin-menu-section-divider" role="separator"></div>`;
    html += `<div class="admin-menu-section-label">${adminEsc(section.label)}</div>`;

    pages.forEach(pageKey => {
      const page = pageDefs[pageKey];
      const viewName = ADMIN_VIEW_BY_PAGE[pageKey] || pageKey;
      html += `
        <button type="button" class="admin-menu-item ${pageKey === firstPage ? "active" : ""}" data-admin-view="${viewName}">
          <i class="${page.icon}"></i><span>${adminEsc(page.label)}</span>
        </button>
      `;
    });

    groups.forEach(group => {
      const expanded = group.pages.includes(firstPage);
      html += `
        <div class="admin-dropdown ${expanded ? "expanded" : ""}" data-dropdown="${adminEsc(group.key)}">
          <button type="button" class="admin-dropdown-toggle" data-dropdown-toggle="${adminEsc(group.key)}" aria-expanded="${expanded ? "true" : "false"}">
            <i class="${group.icon || "ri-folder-line"}"></i><span>${adminEsc(group.label)}</span><i class="ri-arrow-down-s-line admin-dropdown-arrow"></i>
          </button>
          <div class="admin-dropdown-list">
            ${group.pages.map(pageKey => {
              const page = pageDefs[pageKey];
              const viewName = ADMIN_VIEW_BY_PAGE[pageKey] || pageKey;
              return `
                <button type="button" class="admin-menu-item ${pageKey === firstPage ? "active" : ""}" data-admin-view="${viewName}">
                  <i class="${page.icon}"></i><span>${adminEsc(page.label)}</span>
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `;
    });
  });

  nav.innerHTML = html;
  nav.querySelectorAll("[data-dropdown-toggle]").forEach(toggle => {
    toggle.addEventListener("click", () => toggleAdminDropdown(toggle.dataset.dropdownToggle));
  });
  nav.querySelectorAll(".admin-menu-item[data-admin-view]").forEach(item => {
    item.addEventListener("click", () => openAdminView(item.dataset.adminView));
  });
}

function renderAdminProfile() {
  const profile = document.getElementById("adminSidebarProfile");
  if (!profile) return;
  const displayName = adminUser.full_name || adminUser.email || "Admin";
  const displayRole = adminUser.role || "Admin";
  const initials = displayName.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "A";

  profile.innerHTML = `
    <div class="admin-profile-inner" title="${adminEsc(displayName)} - ${adminEsc(displayRole)}">
      <div class="admin-avatar">
        ${adminUser.photo ? `<img src="${adminEsc(adminUser.photo)}" alt="${adminEsc(displayName)}">` : adminEsc(initials)}
      </div>
      <div class="admin-profile-text">
        <div class="admin-profile-name">${adminEsc(displayName)}</div>
        <div class="admin-profile-role">${adminEsc(displayRole)}</div>
      </div>
      <i class="ri-more-2-fill admin-profile-icon"></i>
    </div>
  `;
  profile.querySelector(".admin-profile-inner")?.addEventListener("click", () => openAdminPage("settings"));
}

function showAdminLogoutModal() {
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
            <span class="logout-user-name">${adminEsc(adminUser.full_name || "Admin User")}</span>
            <span class="logout-user-role">${adminEsc(adminUser.role || "Admin")}</span>
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
  requestAnimationFrame(() => modal.classList.add("open"));

  const close = () => {
    modal.classList.remove("open");
    modal.classList.add("closing");
    setTimeout(() => modal.remove(), 300);
  };

  document.getElementById("logoutCancel").onclick = close;
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  document.getElementById("logoutConfirm").onclick = () => {
    const btn = document.getElementById("logoutConfirm");
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Signing out...';
    setTimeout(() => {
      localStorage.removeItem("user");
      window.location.href = "/index.html";
    }, 900);
  };
}

function syncAdminSidebar() {
  const sidebar = document.getElementById("adminSidebar");
  const isCollapsed = sidebar?.classList.contains("collapsed");
  document.body.classList.toggle("admin-sidebar-collapsed", !!isCollapsed);
  localStorage.setItem("adminSidebarCollapsed", isCollapsed ? "1" : "0");
}

function bootAdminDashboard() {
  const sidebar = document.getElementById("adminSidebar");
  if (sidebar && localStorage.getItem("adminSidebarCollapsed") === "1") sidebar.classList.add("collapsed");
  syncAdminSidebar();
  document.getElementById("adminToggleSidebar")?.addEventListener("click", () => {
    sidebar?.classList.toggle("collapsed");
    syncAdminSidebar();
  });
  renderAdminSidebar();
  renderAdminProfile();
  openAdminPage(getAdminHomePageKey());
}

window.addEventListener("DOMContentLoaded", bootAdminDashboard);
