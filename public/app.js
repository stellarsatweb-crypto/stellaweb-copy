const form = document.getElementById("auth-form");
const title = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const toggleBtn = document.getElementById("toggle-btn");
const switchText = document.getElementById("switch-text");
const message = document.getElementById("message");
const roleField = document.getElementById("role-field");
const extraOptions = document.getElementById("extra-options");
const formContainer = document.getElementById("form-container");

const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");
const confirmPasswordField = document.getElementById("confirm-password-field");

const togglePassword = document.getElementById("togglePassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

let mode = "signin";

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

/* ================= SVG ICONS ================= */
const eyeIcon = `
<svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none"
stroke="currentColor" stroke-width="2" stroke-linecap="round"
stroke-linejoin="round">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
  <circle cx="12" cy="12" r="3"></circle>
</svg>
`;

const eyeOffIcon = `
<svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none"
stroke="currentColor" stroke-width="2" stroke-linecap="round"
stroke-linejoin="round">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 
  18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 
  11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 
  1 1-4.24-4.24"></path>
  <line x1="1" y1="1" x2="23" y2="23"></line>
</svg>
`;

/* ================= PASSWORD TOGGLE ================= */
togglePassword.addEventListener("click", () => {
  const type = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = type;
  togglePassword.innerHTML = type === "password" ? eyeIcon : eyeOffIcon;
});

toggleConfirmPassword.addEventListener("click", () => {
  const type = confirmPasswordInput.type === "password" ? "text" : "password";
  confirmPasswordInput.type = type;
  toggleConfirmPassword.innerHTML =
    type === "password" ? eyeIcon : eyeOffIcon;
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

  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const role = document.getElementById("role").value;

  message.textContent = "";

  if (mode === "signup") {
    /* ---------- SIGN UP ---------- */

    if (!validatePassword(password)) {
      message.style.color = "red";
      message.textContent =
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
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
        email,
        password,
        role,
      });

      message.style.color = "green";
      message.textContent =
        "Account created successfully! You can now sign in.";

      form.reset();
      toggleBtn.click(); // Switch back to Sign In
    } catch (err) {
      message.style.color = "red";
      message.textContent = err.message || "Sign up failed.";
    } finally {
      submitBtn.disabled = false;
    }

  } else {
    /* ---------- SIGN IN ---------- */

    try {
      submitBtn.disabled = true;

      const data = await callAuthApi({
        action: "signin",
        email,
        password,
      });

      // Save user in localStorage
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect to dashboard
      window.location.href = "dashboard.html";

    } catch (err) {
      message.style.color = "red";
      message.textContent = err.message || "Sign in failed.";
    } finally {
      submitBtn.disabled = false;
    }
  }
});