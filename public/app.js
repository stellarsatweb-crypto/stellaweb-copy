const form = document.getElementById("auth-form");
const title = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const toggleBtn = document.getElementById("toggle-btn");
const switchText = document.getElementById("switch-text");
const message = document.getElementById("message");
const roleField = document.getElementById("role-field");
const extraOptions = document.getElementById("extra-options");
const formContainer = document.getElementById("form-container");

const idNoInput = document.getElementById("id_no");
const fullNameInput = document.getElementById("full_name");
const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");

const confirmPasswordField = document.getElementById("confirm-password-field");

const togglePassword = document.getElementById("togglePassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

let mode = "signin";

const DASHBOARD_BY_ROLE = {
  finance: "finance-dashboard.html",
  noc: "noc-dashboard.html",
};

function getDashboardPathForRole(role) {
  const key = String(role || "").trim().toLowerCase();
  return DASHBOARD_BY_ROLE[key] || "noc-dashboard.html";
}

/* ================= API CALL ================= */
async function callAuthApi(body) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

/* ================= PASSWORD TOGGLE ================= */
togglePassword.addEventListener("click", () => {
  passwordInput.type =
    passwordInput.type === "password" ? "text" : "password";
});

toggleConfirmPassword.addEventListener("click", () => {
  confirmPasswordInput.type =
    confirmPasswordInput.type === "password" ? "text" : "password";
});

/* ================= SWITCH MODE ================= */
toggleBtn.addEventListener("click", () => {
  formContainer.classList.remove("slide-left", "slide-right");

  if (mode === "signin") {
    mode = "signup";
    title.textContent = "Sign Up";
    submitBtn.textContent = "Create Account";
    toggleBtn.textContent = "Sign In";
    switchText.textContent = "Already have an account?";

    fullNameInput.parentElement.style.display = "block";
    emailInput.parentElement.style.display = "block";
    roleField.style.display = "block";
    confirmPasswordField.style.display = "block";
    extraOptions.style.display = "none";

    formContainer.classList.add("slide-left");
  } else {
    mode = "signin";
    title.textContent = "Sign In";
    submitBtn.textContent = "Sign In";
    toggleBtn.textContent = "Sign Up";
    switchText.textContent = "Don't have an account?";

    fullNameInput.parentElement.style.display = "none";
    emailInput.parentElement.style.display = "none";
    roleField.style.display = "none";
    confirmPasswordField.style.display = "none";
    extraOptions.style.display = "flex";

    formContainer.classList.add("slide-right");
  }

  message.textContent = "";
});

/* ================= PASSWORD VALIDATION ================= */
function validatePassword(password) {
  const regex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(password);
}

/* ================= FORM SUBMIT ================= */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id_no = idNoInput.value.trim();
  const full_name = fullNameInput?.value.trim();
  const email = emailInput?.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const role = document.getElementById("role").value;

  message.textContent = "";

  /* ================= SIGN UP ================= */
  if (mode === "signup") {

    // 🔥 FIX: validate id_no too
    if (!id_no || !full_name || !email || !password || !confirmPassword) {
      message.style.color = "red";
      message.textContent = "All fields are required.";
      return;
    }

    if (!validatePassword(password)) {
      message.style.color = "red";
      message.textContent =
        "Password must be 8+ characters with uppercase, lowercase, number and special character.";
      return;
    }

    if (password !== confirmPassword) {
      message.style.color = "red";
      message.textContent = "Passwords do not match!";
      return;
    }

    if (!role) {
      message.style.color = "red";
      message.textContent = "Please select a role.";
      return;
    }

    try {
      submitBtn.disabled = true;

      await callAuthApi({
        action: "signup",
        id_no,
        full_name,
        email,
        password,
        role,
      });

      message.style.color = "green";
      message.textContent =
        "Account created successfully! You can now sign in.";

      form.reset();
      toggleBtn.click();

    } catch (err) {
      message.style.color = "red";
      message.textContent = err.message || "Sign up failed.";
    } finally {
      submitBtn.disabled = false;
    }

  }

  /* ================= SIGN IN ================= */
  else {

    if (!id_no || !password) {
      message.style.color = "red";
      message.textContent = "ID Number and password are required.";
      return;
    }

    try {
      submitBtn.disabled = true;

      const data = await callAuthApi({
        action: "signin",
        id_no,
        password,
      });

      localStorage.setItem("user", JSON.stringify(data.user));
      window.location.href = getDashboardPathForRole(data.user?.role);

    } catch (err) {
      message.style.color = "red";
      message.textContent = err.message || "Sign in failed.";
    } finally {
      submitBtn.disabled = false;
    }
  }
});
