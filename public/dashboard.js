/* ================= USER SESSION ================= */

const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  window.location.href = "index.html";
}

document.getElementById("welcome").textContent =
  `Welcome back, ${user.email}`;

/* ================= LOGOUT ================= */

document.getElementById("logout").addEventListener("click", () => {
  localStorage.removeItem("user");
  window.location.href = "index.html";
});

/* ================= SIDEBAR TOGGLE ================= */

document.getElementById("toggleSidebar")
  .addEventListener("click", () => {
    document.getElementById("sidebar")
      .classList.toggle("collapsed");
});

/* ================= DARK MODE ================= */

document.getElementById("darkToggle")
  .addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

/* ================= PAGE SWITCHING ================= */

const mainContent = document.getElementById("mainContent");

document.querySelectorAll(".menu li").forEach(item => {
  item.addEventListener("click", function () {

    if (this.id === "logout") return;

    document.querySelectorAll(".menu li")
      .forEach(li => li.classList.remove("active"));

    this.classList.add("active");

    const text = this.innerText.trim();

   if (text === "Dashboard") {
  loadDashboard();
}

if (text === "Problematic Sites") {
  loadProblematicSites();
}

if (text === "Ticket") {
  loadTickets();
}

  });
});

/* ================= DASHBOARD VIEW ================= */

function loadDashboard() {

  mainContent.innerHTML = `
    <h3 class="section-title">Overview</h3>

    <div class="cards">

      <div class="card">
        <div class="card-top">
          <div class="icon-box blue">
            <i class="ri-map-pin-2-line"></i>
          </div>
          <div class="stat">
            <h1 class="counter" data-target="438">0</h1>
            <span class="trend up">↑ +3%</span>
          </div>
        </div>
        <p>Total Sites</p>
      </div>

      <div class="card">
        <div class="card-top">
          <div class="icon-box green">
            <i class="ri-shield-check-line"></i>
          </div>
          <div class="stat">
            <h1 class="counter" data-target="420">0</h1>
            <span class="trend up">↑ +5%</span>
          </div>
        </div>
        <p>Active Sites</p>
      </div>

      <div class="card alert-card">
        <div class="card-top">
          <div class="icon-box orange pulse">
            <i class="ri-error-warning-line"></i>
          </div>
          <div class="stat">
            <h1 class="counter" data-target="18">0</h1>
            <span class="trend down">↓ -2%</span>
          </div>
        </div>
        <p>Problematic Sites</p>
      </div>

      <div class="card">
        <div class="card-top">
          <div class="icon-box red">
            <i class="ri-alarm-warning-line"></i>
          </div>
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
            <td>INC-1023</td>
            <td>Province 1</td>
            <td>No Signal</td>
            <td><span class="badge high">High</span></td>
            <td><span class="badge completed">Completed</span></td>
          </tr>
          <tr>
            <td>INC-1024</td>
            <td>Province 2</td>
            <td>No Signal</td>
            <td><span class="badge medium">Medium</span></td>
            <td><span class="badge progress">In Progress</span></td>
          </tr>
          <tr>
            <td>INC-1025</td>
            <td>Province 3</td>
            <td>No Signal</td>
            <td><span class="badge low">Low</span></td>
            <td><span class="badge pending">Pending</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  runCounters();
}

/* ================= PROBLEMATIC SITES VIEW ================= */

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
            <th>Site ID</th>
            <th>Province</th>
            <th>Issue</th>
            <th>Last Reported</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SITE-001</td>
            <td>Province 1</td>
            <td>No Signal</td>
            <td>2026-02-24</td>
            <td><span class="badge high">Critical</span></td>
            <td></td>
          </tr>
          <tr>
            <td>SITE-002</td>
            <td>Province 2</td>
            <td>Power Failure</td>
            <td>2026-02-23</td>
            <td><span class="badge medium">Warning</span></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function loadTickets() {

  mainContent.innerHTML = `
    <h3 class="section-title">Ticket Management</h3>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">

      <button id="sortToggle"
        style="padding:8px 16px; border:none; border-radius:20px;
               background:#e5e7eb; cursor:pointer;">
        Sort: Newest First
      </button>

      <button id="openModal"
        style="padding:10px 18px; border:none; border-radius:25px;
               background:#3b82f6; color:white; cursor:pointer;">
        + Create Ticket
      </button>

    </div>

    <div class="table-container">
      <div class="table-title">
        <i class="ri-ticket-2-line"></i>
        Tickets
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Site</th>
            <th>Issue</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="ticketTable"></tbody>
      </table>
    </div>

    <div id="pagination"
      style="margin-top:20px; display:flex; justify-content:center; gap:10px;">
    </div>

    <!-- MODAL -->
    <div id="ticketModal"
      style="position:fixed; inset:0; background:rgba(0,0,0,0.4);
             display:none; align-items:center; justify-content:center;">

      <div style="background:white; padding:25px; width:400px;
                  border-radius:15px; box-shadow:0 15px 40px rgba(0,0,0,0.2);">

        <h3 style="margin-bottom:15px;">Create Ticket</h3>

        <input id="siteInput" placeholder="Site ID"
          style="width:100%; padding:10px; margin-bottom:10px;
                 border-radius:8px; border:1px solid #ddd;" />

        <input id="issueInput" placeholder="Issue"
          style="width:100%; padding:10px; margin-bottom:10px;
                 border-radius:8px; border:1px solid #ddd;" />

        <select id="priorityInput"
          style="width:100%; padding:10px; margin-bottom:15px;
                 border-radius:8px; border:1px solid #ddd;">
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="closeModal"
            style="padding:8px 14px; border:none; border-radius:8px; background:#ccc;">
            Cancel
          </button>

          <button id="saveTicket"
            style="padding:8px 14px; border:none; border-radius:8px;
                   background:#16a34a; color:white;">
            Save
          </button>
        </div>

      </div>
    </div>
  `;

  initTickets();
}

/* ================= TICKET SYSTEM ================= */

let tickets = [
  { id: "TIC-001", site: "SITE-01", issue: "No Signal", priority: "High", status: "In Progress", date: "2026-02-20" },
  { id: "TIC-002", site: "SITE-07", issue: "Power Failure", priority: "Medium", status: "Pending", date: "2026-02-21" },
  { id: "TIC-003", site: "SITE-12", issue: "Battery Low", priority: "Low", status: "Completed", date: "2026-02-22" },
  { id: "TIC-004", site: "SITE-14", issue: "Router Offline", priority: "High", status: "Pending", date: "2026-02-23" },
  { id: "TIC-005", site: "SITE-22", issue: "Fiber Cut", priority: "High", status: "In Progress", date: "2026-02-24" }
];

let currentPage = 1;
const rowsPerPage = 4;

function initTickets() {
  renderTable();
  renderPagination();
  setupModal();
}

function renderTable() {
  const table = document.getElementById("ticketTable");
  table.innerHTML = "";

  const start = (currentPage - 1) * rowsPerPage;
  const paginated = tickets.slice(start, start + rowsPerPage);

  paginated.forEach(ticket => {
    table.innerHTML += `
      <tr>
        <td>${ticket.id}</td>
        <td>${ticket.site}</td>
        <td>${ticket.issue}</td>
        <td><span class="badge ${getPriorityClass(ticket.priority)}">${ticket.priority}</span></td>
        <td>
          <select onchange="updateStatus('${ticket.id}', this.value)"
            style="padding:6px 14px; border-radius:20px; border:none;
                   background:#e5e7eb; cursor:pointer; outline:none;">
            ${renderStatusOptions(ticket.status)}
          </select>
        </td>
        <td>${ticket.date}</td>
      </tr>
    `;
  });
}

function renderPagination() {
  const container = document.getElementById("pagination");
  container.innerHTML = "";

  const pages = Math.ceil(tickets.length / rowsPerPage);

  for (let i = 1; i <= pages; i++) {
    container.innerHTML += `
      <button onclick="changePage(${i})"
        style="padding:6px 12px; border:none; border-radius:8px;
               background:${i === currentPage ? '#3b82f6' : '#ddd'};
               color:${i === currentPage ? 'white' : 'black'};
               cursor:pointer;">
        ${i}
      </button>
    `;
  }
}

function changePage(page) {
  currentPage = page;
  renderTable();
  renderPagination();
}

function updateStatus(id, value) {
  tickets = tickets.map(t =>
    t.id === id ? { ...t, status: value } : t
  );
  renderTable();
}

function renderStatusOptions(current) {
  const statuses = ["Pending", "In Progress", "Completed"];
  return statuses.map(s =>
    `<option ${s === current ? "selected" : ""}>${s}</option>`
  ).join("");
}

function getPriorityClass(priority) {
  if (priority === "High") return "high";
  if (priority === "Medium") return "medium";
  return "low";
}

function setupModal() {
  const modal = document.getElementById("ticketModal");

  document.getElementById("openModal").onclick = () => {
    modal.style.display = "flex";
  };

  document.getElementById("closeModal").onclick = () => {
    modal.style.display = "none";
  };

  document.getElementById("saveTicket").onclick = () => {

    const site = document.getElementById("siteInput").value;
    const issue = document.getElementById("issueInput").value;
    const priority = document.getElementById("priorityInput").value;

    if (!site || !issue) return;

    const today = new Date().toISOString().split("T")[0];

    tickets.unshift({
      id: "TIC-" + Math.floor(Math.random() * 1000),
      site,
      issue,
      priority,
      status: "Pending",
      date: today
    });

    modal.style.display = "none";
    currentPage = 1;
    renderTable();
    renderPagination();
  };
}

/* STATUS UPDATE */
function setupStatusUpdate() {
  document.querySelectorAll(".statusDropdown")
    .forEach(select => {
      select.addEventListener("change", function () {
        const id = this.dataset.id;
        const ticket = tickets.find(t => t.id === id);
        ticket.status = this.value;
      });
    });
}

/* SEARCH */
function setupSearch() {
  document.getElementById("ticketSearch")
    .addEventListener("input", () => {
      currentPage = 1;
      renderTickets();
    });
}

/* PAGINATION */
function renderPagination(totalRows) {

  const pagination = document.getElementById("pagination");
  pagination.innerHTML = "";

  const pageCount = Math.ceil(totalRows / rowsPerPage);

  for (let i = 1; i <= pageCount; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "collapse-btn";
    if (i === currentPage) btn.style.background = "#3b82f6";

    btn.addEventListener("click", () => {
      currentPage = i;
      renderTickets();
    });

    pagination.appendChild(btn);
  }
}

/* MODAL */
function setupModal() {

  const modal = document.getElementById("ticketModal");

  document.getElementById("createTicketBtn")
    .addEventListener("click", () => {
      modal.style.display = "flex";
    });

  document.getElementById("closeModal")
    .addEventListener("click", () => {
      modal.style.display = "none";
    });

  document.getElementById("saveTicket")
    .addEventListener("click", () => {

      const site = document.getElementById("newSite").value;
      const issue = document.getElementById("newIssue").value;
      const priority = document.getElementById("newPriority").value;

      if (!site || !issue) return;

      tickets.unshift({
        id: "TIC-" + Math.floor(Math.random() * 1000),
        site,
        issue,
        priority,
        status: "Pending"
      });

      modal.style.display = "none";

      document.getElementById("newSite").value = "";
      document.getElementById("newIssue").value = "";

      renderTickets();
    });
}

/* ================= COUNTER ANIMATION ================= */

function runCounters() {
  const counters = document.querySelectorAll(".counter");

  counters.forEach(counter => {
    const updateCount = () => {
      const target = +counter.getAttribute("data-target");
      const count = +counter.innerText;
      const increment = target / 100;

      if (count < target) {
        counter.innerText = Math.ceil(count + increment);
        setTimeout(updateCount, 15);
      } else {
        counter.innerText = target;
      }
    };
    updateCount();
  });
}

/* ================= INITIAL LOAD ================= */

loadDashboard();
