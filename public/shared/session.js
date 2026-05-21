/* ================= SHARED SESSION ================= */

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null") || {};
  } catch {
    localStorage.removeItem("user");
    return {};
  }
}

const user = readStoredUser();

if (!user.id && !user.role) {
  window.location.replace("/index.html");
}

const dashboardShell = String(window.__dashboardShell || "").trim().toLowerCase();
const roleKey = String(user?.role || "").trim().toLowerCase();

function getDashboardPathForRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const path = normalizedRole === "admin"
    ? "/modules/admin/admin-dashboard.html"
    : normalizedRole === "finance"
      ? "/modules/finance/finance-dashboard.html"
      : "/modules/noc/noc-dashboard.html";
  return window.location.pathname === "/settings" ? `${path}?page=settings` : path;
}

if (user && dashboardShell) {
  const allowedShellsByRole = {
    admin: ["admin", "noc", "finance"],
    finance: ["finance"],
    noc: ["noc"],
    bidder: ["noc"],
  };
  const allowedShells = allowedShellsByRole[roleKey] || ["noc"];
  if (!allowedShells.includes(dashboardShell)) {
    window.location.replace(getDashboardPathForRole(user.role));
  }
}

const mainContent = document.getElementById("mainContent");
const sidebarMenu = document.getElementById("sidebarMenu");
const activeShellKey = dashboardShell || (roleKey === "admin" ? "admin" : roleKey === "finance" ? "finance" : "noc");
let currentPage = 1;
const rowsPerPage = 7;
let leafletMap = null;

function dashboardDataChanged() {
  if (document.getElementById("dashCards") && typeof fetchDashboardStats === "function") {
    fetchDashboardStats(false);
  }
}

document.body.classList.toggle("admin-module", activeShellKey === "admin");
document.body.classList.toggle("finance-role", activeShellKey === "finance");
document.body.classList.toggle("noc-module", activeShellKey === "noc");
document.body.classList.toggle("finance-module", activeShellKey === "finance");

function sendUserActivity() {
  if (!user?.id) return;
  const currentPage = `${activeShellKey || "dashboard"}:${window.location.pathname}${window.location.search}`;
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": user.id, "X-User-Role": user.role || "" },
    body: JSON.stringify({ user_id: user.id, current_page: currentPage })
  }).catch(() => {});
}

sendUserActivity();
window.addEventListener("focus", sendUserActivity);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sendUserActivity();
});
setInterval(sendUserActivity, 60000);
