/* ================= SHARED SIDEBAR ================= */

function getSharedPageDefs() {
  return roleKey === "finance" ? (window.FINANCE_PAGE_DEFS || {}) : (window.NOC_PAGE_DEFS || {});
}

function getSharedSidebarSections() {
  return roleKey === "finance" ? (window.FINANCE_SIDEBAR_SECTIONS || []) : (window.NOC_SIDEBAR_SECTIONS || []);
}

function getVisiblePages() {
  return getSharedSidebarSections().flatMap(section => section.pages);
}

function getHomePageKey() {
  return (roleKey === "finance" ? window.FINANCE_START_PAGE : window.NOC_START_PAGE) || getVisiblePages()[0];
}

function activateMenu(pageKey) {
  document.querySelectorAll(".menu li[data-page]").forEach(li => {
    li.classList.toggle("active", li.dataset.page === pageKey);
  });
}

function openPage(pageKey) {
  const page = getSharedPageDefs()[pageKey];
  if (!page) return;
  if (pageKey === "logout") {
    page.loader();
    return;
  }
  activateMenu(pageKey);
  document.body.classList.toggle("map-active", pageKey === "map");
  page.loader();
}

function renderSidebarMenu() {
  if (!sidebarMenu) return;

  const pageDefs = getSharedPageDefs();
  const sections = getSharedSidebarSections();
  const visiblePages = getVisiblePages();
  const visible = new Set(visiblePages);
  const firstPage = visiblePages[0];

  let html = "";
  sections.forEach((section, sectionIndex) => {
    const pages = section.pages.filter(page => visible.has(page) && pageDefs[page]);
    if (!pages.length) return;
    if (sectionIndex > 0) html += `<li class="menu-section-divider" role="separator"></li>`;
    html += `<li class="menu-section-label">${section.label}</li>`;
    pages.forEach(pageKey => {
      const page = pageDefs[pageKey];
      html += `
        <li data-page="${pageKey}" data-tooltip="${page.label}" class="${pageKey === firstPage ? "active" : ""}">
          <i class="${page.icon}"></i><span>${page.label}</span>
        </li>
      `;
    });
  });

  sidebarMenu.innerHTML = html;
  sidebarMenu.querySelectorAll("li[data-page]").forEach(item => {
    item.addEventListener("click", () => openPage(item.dataset.page));
  });

  renderSidebarProfile();
}

function renderSidebarProfile() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.querySelector(".sb-profile")?.remove();

  const initials = user.full_name
    ? user.full_name.split(" ").filter(Boolean).map(word => word[0]).join("").slice(0, 2).toUpperCase()
    : (user.email ? user.email[0].toUpperCase() : "U");
  const displayName = user.full_name || user.email || "User";
  const displayRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : "Staff";

  const profileEl = document.createElement("div");
  profileEl.className = "sb-profile";
  profileEl.innerHTML = `
    <div class="sb-profile-inner" title="${displayName} - ${displayRole}">
      <div class="sb-avatar">
        ${user.photo ? `<img src="${user.photo}" alt="${displayName}">` : initials}
        <span class="sb-avatar-dot"></span>
      </div>
      <div class="sb-profile-text">
        <div class="sb-profile-name">${displayName}</div>
        <div class="sb-profile-role">${displayRole}</div>
      </div>
      <i class="ri-more-2-fill sb-profile-icon"></i>
    </div>
  `;
  profileEl.querySelector(".sb-profile-inner").addEventListener("click", () => {
    openPage(getSharedPageDefs().settings ? "settings" : getHomePageKey());
  });

  const toggleBtn = sidebar.querySelector("#toggleSidebar");
  sidebar.insertBefore(profileEl, toggleBtn);
}

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
            <span class="logout-user-name">${user.full_name || "Admin User"}</span>
            <span class="logout-user-role">${user.role || "Staff"}</span>
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

function syncSidebar(sidebar) {
  const isCollapsed = sidebar.classList.contains("collapsed");
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  localStorage.setItem("sidebarCollapsed", isCollapsed ? "1" : "0");
}

function bootSharedSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  if (localStorage.getItem("sidebarCollapsed") === "1") sidebar.classList.add("collapsed");
  else sidebar.classList.remove("collapsed");
  syncSidebar(sidebar);

  document.getElementById("toggleSidebar")?.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    syncSidebar(sidebar);
    if (window.leafletMap) setTimeout(() => window.leafletMap.invalidateSize(), 350);
  });

  renderSidebarMenu();
  openPage(getHomePageKey());
}

window.addEventListener("DOMContentLoaded", bootSharedSidebar);
