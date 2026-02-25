/* Sidebar Toggle */
document.getElementById("toggleSidebar")
  .addEventListener("click", () => {
    document.getElementById("sidebar")
      .classList.toggle("collapsed");
});

/* Dark Mode */
document.getElementById("darkToggle")
  .addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

/* Logout */
document.getElementById("logout")
  .addEventListener("click", () => {
    localStorage.removeItem("user");
    window.location.href = "index.html";
});