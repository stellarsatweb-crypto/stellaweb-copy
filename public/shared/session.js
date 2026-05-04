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

function getDashboardPathForRole(role) {
  return String(role || "").trim().toLowerCase() === "finance"
    ? "/modules/finance/finance-dashboard.html"
    : "/modules/noc/noc-dashboard.html";
}

if (user && dashboardShell) {
  const expectedShell = String(user.role || "").trim().toLowerCase() === "finance" ? "finance" : "noc";
  if (dashboardShell !== expectedShell) {
    window.location.replace(getDashboardPathForRole(user.role));
  }
}

const mainContent = document.getElementById("mainContent");
const sidebarMenu = document.getElementById("sidebarMenu");
const roleKey = String(user?.role || "").trim().toLowerCase();
let currentPage = 1;
const rowsPerPage = 7;
let leafletMap = null;

function dashboardDataChanged() {
  if (document.getElementById("dashCards") && typeof fetchDashboardStats === "function") {
    fetchDashboardStats(false);
  }
}

document.body.classList.toggle("finance-role", roleKey === "finance");
document.body.classList.toggle("noc-module", roleKey !== "finance");
document.body.classList.toggle("finance-module", roleKey === "finance");
