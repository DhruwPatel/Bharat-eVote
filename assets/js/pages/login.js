/* Authentication page */
(async function () {
  await DB.init();
  UI.icons();

  document.querySelectorAll("#authMark, #authMarkMobile").forEach((el) => (el.innerHTML = window.BRAND_MARK_SVG));

  const redirect = () => { location.href = DB.isAdmin() ? "admin.html" : "dashboard.html"; };
  if (DB.user()) return redirect();

  const demoBox = document.getElementById("demoBox");
  if (DB.isDemo) demoBox.hidden = false;

  const forms = {
    signin: document.getElementById("signinForm"),
    register: document.getElementById("registerForm"),
    forgot: document.getElementById("forgotForm")
  };
  const titles = {
    signin: ["Welcome back", "Sign in to access your voter dashboard."],
    register: ["Create your voter account", "Register once, then vote in every election you are eligible for."],
    forgot: ["Reset your password", "Enter your account email to receive a reset link."]
  };

  function setMode(mode) {
    if (!forms[mode]) mode = "signin";
    Object.entries(forms).forEach(([k, f]) => (f.hidden = k !== mode));
    document.querySelectorAll(".auth-tabs button").forEach((b) => {
      const on = b.dataset.tab === mode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", String(on));
    });
    document.querySelector(".auth-tabs").style.display = mode === "forgot" ? "none" : "flex";
    document.getElementById("authTitle").textContent = titles[mode][0];
    document.getElementById("authSub").textContent = titles[mode][1];
    const err = forms[mode].querySelector(".field-error");
    if (err) err.hidden = true;
  }

  document.querySelectorAll("[data-tab], [data-tab-link]").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.tab || b.dataset.tabLink))
  );

  const showError = (el, msg) => { el.textContent = msg; el.hidden = false; };
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const busy = (btn, on, label) => {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Please wait…"; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  };

  /* sign in */
  forms.signin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("siError");
    err.hidden = true;
    const email = document.getElementById("siEmail").value.trim();
    const pass = document.getElementById("siPassword").value;
    if (!emailOk(email)) return showError(err, "Enter a valid email address.");
    if (!pass) return showError(err, "Enter your password.");
    const btn = document.getElementById("siSubmit");
    busy(btn, true, "Signing in…");
    try {
      await DB.login(email, pass);
      UI.toast("Signed in successfully");
      setTimeout(redirect, 300);
    } catch (ex) {
      showError(err, ex.message);
      busy(btn, false);
    }
  });

  /* register */
  forms.register.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("rgError");
    err.hidden = true;
    const name = document.getElementById("rgName").value.trim();
    const email = document.getElementById("rgEmail").value.trim();
    const pass = document.getElementById("rgPassword").value;
    const confirm = document.getElementById("rgConfirm").value;
    const phone = document.getElementById("rgPhone").value.trim();
    if (name.length < 3) return showError(err, "Enter your full name (at least 3 characters).");
    if (!emailOk(email)) return showError(err, "Enter a valid email address.");
    if (pass.length < 8) return showError(err, "Use a password of at least 8 characters.");
    if (pass !== confirm) return showError(err, "The passwords do not match.");
    if (!document.getElementById("rgConsent").checked) return showError(err, "Please acknowledge the prototype notice.");
    const btn = document.getElementById("rgSubmit");
    busy(btn, true, "Creating account…");
    try {
      await DB.register({ name, email, password: pass, phone });
      if (DB.user()) {
        if (phone) await DB.updateProfile({ name, phone });
        UI.toast("Account created. Complete verification to vote.");
        setTimeout(() => (location.href = "dashboard.html"), 400);
      } else {
        err.hidden = false;
        err.style.color = "var(--green-600)";
        err.textContent = "Check your inbox to confirm your email address, then sign in.";
        busy(btn, false);
      }
    } catch (ex) {
      showError(err, ex.message);
      busy(btn, false);
    }
  });

  /* forgot */
  forms.forgot.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("fgError");
    err.hidden = true;
    const email = document.getElementById("fgEmail").value.trim();
    if (!emailOk(email)) return showError(err, "Enter a valid email address.");
    const btn = document.getElementById("fgSubmit");
    busy(btn, true, "Sending…");
    try {
      const msg = await DB.resetPassword(email);
      err.style.color = "var(--green-600)";
      err.hidden = false;
      err.textContent = msg;
    } catch (ex) {
      showError(err, ex.message);
    }
    busy(btn, false);
  });

  setMode(location.hash === "#register" ? "register" : "signin");
  window.addEventListener("hashchange", () => setMode(location.hash === "#register" ? "register" : "signin"));
})();
