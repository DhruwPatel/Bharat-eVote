/* ============================================================
   Bharat eVote — shared UI: chrome, formatting, modal, charts
   ============================================================ */
window.UI = (function () {
  const MARK = window.BRAND_MARK_SVG || "";

  const STATUS = {
    active: { label: "status.live", cls: "badge-active" },
    upcoming: { label: "status.startsSoon", cls: "badge-upcoming" },
    closed: { label: "status.ended", cls: "badge-closed" },
    published: { label: "common.published", cls: "badge-published" },
    draft: { label: "common.draft", cls: "badge-draft" },
    live: { label: "status.live", cls: "badge-active" }
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (name) =>
    String(name || "Voter").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const fmtShort = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const fmtDT = (d) =>
    new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  const fmtLongDate = (d) =>
    new Date(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function relTime(d) {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    const days = Math.round(h / 24);
    if (days < 30) return days + "d ago";
    return fmtShort(d);
  }

  function countdown(target) {
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return "Started";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const num = (n) => Number(n || 0).toLocaleString("en-IN");

  function statusBadge(status) {
    const s = STATUS[status] || { label: "common.draft", cls: "badge-draft" };
    return `<span class="badge ${s.cls}">${esc(window.t(s.label))}</span>`;
  }

  /* An election is only really open inside its voting window; status alone can
     say "active" while the clock is still before starts_at. */
  function effectiveStatus(e) {
    if (!e) return "draft";
    if (e.status === "active") {
      const now = Date.now();
      const start = e.startsAt ? new Date(e.startsAt).getTime() : NaN;
      const end = e.endsAt ? new Date(e.endsAt).getTime() : NaN;
      if (Number.isFinite(start) && now < start) return "upcoming";
      if (Number.isFinite(end) && now > end) return "closed";
    }
    return e.status;
  }

  /* ---------------- chrome ---------------- */
  function brandHTML() {
    return `<a class="brand" href="index.html" aria-label="Bharat eVote home">
      <span class="brand-mark">${MARK}</span>
      <span class="brand-word">
        <span class="brand-name">Bharat <em>eVote</em></span>
        <span class="brand-tag">Your Voice. Your Vote.</span>
      </span>
    </a>`;
  }

  function headerHTML(active, user, notes) {
    const links = [
      ["home", "index.html", "nav.home"],
      ["elections", "elections.html", "nav.elections"],
      ["vote", "vote.html", "nav.vote"],
      ["results", "results.html", "nav.results"]
    ];
    const nav = links
      .map(([key, href, tkey]) => {
        const cls = key === active || (active === "dashboard" && key === "home") ? ' class="is-active"' : "";
        return `<a href="${href}"${cls}>${esc(window.t(tkey))}</a>`;
      })
      .join("");
    const mobileNav = links
      .map(([key, href, tkey]) => {
        const cls = key === active ? ' class="is-active"' : "";
        return `<a href="${href}"${cls}>${esc(window.t(tkey))}</a>`;
      })
      .join("");

    const langBtns = Object.entries(window.I18N.LANGS)
      .map(([code, l]) => `<button data-lang="${code}" class="${code === window.I18N.lang ? "is-on" : ""}" aria-pressed="${code === window.I18N.lang}">${l.label}</button>`)
      .join("");

    let right = `<a class="btn btn-outline btn-sm" href="login.html">${esc(window.t("nav.login"))}</a>
      <a class="btn btn-primary btn-sm" href="login.html#register">${esc(window.t("nav.register"))}</a>`;
    let notifHTML = "";

    if (user) {
      const unread = (notes || []).filter((n) => !n.read).length;
      notifHTML = `<div class="bell-wrap">
        <button class="btn-icon" id="bellBtn" aria-label="${esc(window.t("nav.notifications"))}" aria-expanded="false">
          <i data-lucide="bell" class="icon"></i>${unread ? '<span class="bell-dot"></span>' : ""}
        </button>
        <div class="dropdown notif-drop" id="notifDrop" style="min-width:300px">
          <div class="dropdown-head row between">
            <span class="strong small">${esc(window.t("nav.notifications"))}</span>
            ${unread ? `<span class="badge badge-published no-dot">${unread} new</span>` : ""}
          </div>
          <div class="notif-list">
            ${(notes || []).length
              ? notes.slice(0, 6).map((n) => `<div class="notif-item ${n.read ? "read" : ""}">
                  <span class="dot"></span>
                  <div><p>${esc(n.text)}</p><span>${relTime(n.createdAt)}</span></div></div>`).join("")
              : `<div class="empty" style="padding:22px"><p class="small">You are all caught up.</p></div>`}
          </div>
        </div>
      </div>`;
      right = `${notifHTML}
        <div class="profile-wrap">
          <button class="profile-btn" id="profileBtn" aria-expanded="false" aria-haspopup="true">
            <span class="avatar ${user.role === "admin" ? "avatar-green" : ""}">${initials(user.name)}</span>
            <span class="profile-meta">
              <span class="email truncate">${esc(user.email)}</span>
              <span class="role">${esc(user.role === "admin" ? "Administrator" : "Voter")}</span>
            </span>
            <i data-lucide="chevron-down" class="icon icon-sm" style="color:#98a1b0"></i>
          </button>
          <div class="dropdown" id="profileDrop">
            <div class="dropdown-head">
              <div class="strong small truncate">${esc(user.name)}</div>
              <div class="small muted truncate">${esc(user.email)}</div>
            </div>
            <a class="dropdown-item" href="${user.role === "admin" ? "admin.html" : "dashboard.html"}">
              <i data-lucide="layout-dashboard" class="icon"></i>${esc(window.t(user.role === "admin" ? "nav.admin" : "nav.dashboard"))}</a>
            <a class="dropdown-item" href="dashboard.html#profile"><i data-lucide="user" class="icon"></i>${esc(window.t("nav.profile"))}</a>
            <a class="dropdown-item" href="results.html"><i data-lucide="bar-chart-3" class="icon"></i>${esc(window.t("nav.results"))}</a>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item danger" id="logoutBtn"><i data-lucide="log-out" class="icon"></i>${esc(window.t("nav.logout"))}</button>
          </div>
        </div>`;
    }

    return `<header class="topbar">
      <div class="topbar-inner">
        ${brandHTML()}
        <nav class="mainnav" aria-label="Main">${nav}</nav>
        <div class="topbar-actions">
          <div class="lang-toggle" role="group" aria-label="Language">${langBtns}</div>
          ${right}
        </div>
      </div>
      <div class="mobile-nav" aria-label="Mobile navigation">${mobileNav}</div>
    </header>`;
  }

  function footerHTML() {
    return `<footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-col">
            ${brandHTML()}
            <p class="footer-note mt-16">A general-purpose digital voting platform for organizations, communities and associations. Built as an educational prototype.</p>
          </div>
          <div class="footer-col">
            <h5>Platform</h5>
            <a href="elections.html">Elections</a>
            <a href="vote.html">Cast a vote</a>
            <a href="results.html">Results</a>
            <a href="dashboard.html">Voter dashboard</a>
          </div>
          <div class="footer-col">
            <h5>Resources</h5>
            <a href="index.html#how">How it works</a>
            <a href="index.html#security">Security</a>
            <a href="index.html#faq">FAQ</a>
            <a href="login.html">Sign in</a>
          </div>
          <div class="footer-col">
            <h5>Transparency</h5>
            <p class="small">Ballots are stored separately from voter identity. Administrators see aggregate totals only.</p>
            <p class="small">Not affiliated with the Government of India or the Election Commission. No government certification is claimed.</p>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Bharat eVote. Educational prototype — not for official public elections.</span>
          <span class="footer-credit">
            Designed &amp; developed by <a href="https://github.com/DhruwPatel" target="_blank" rel="noopener noreferrer">Dhruw Patel</a>
            · <a href="mailto:workwithdhruw@gmail.com">workwithdhruw@gmail.com</a>
            · <a href="https://github.com/DhruwPatel/Bharat-eVote" target="_blank" rel="noopener noreferrer">Source code</a>
          </span>
          <span>Your Voice. Your Vote. Your Future.</span>
        </div>
      </div>
    </footer>`;
  }

  function icons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeDropdowns() {
    document.querySelectorAll(".dropdown.is-open").forEach((d) => d.classList.remove("is-open"));
    document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  async function mount(active, opts = {}) {
    const user = window.DB ? window.DB.user() : null;
    let notes = [];
    if (user) {
      try { notes = await window.DB.notifications(); } catch (_) { notes = []; }
    }
    const head = document.getElementById("site-header");
    if (head) head.innerHTML = headerHTML(active, user, notes);
    if (opts.footer !== false) {
      const foot = document.getElementById("site-footer");
      if (foot) foot.innerHTML = footerHTML();
    }
    icons();
    window.I18N.apply();

    document.querySelectorAll("[data-lang]").forEach((b) =>
      b.addEventListener("click", () => window.I18N.setLang(b.dataset.lang))
    );

    const bell = document.getElementById("bellBtn");
    const notifDrop = document.getElementById("notifDrop");
    if (bell && notifDrop) {
      bell.addEventListener("click", async (e) => {
        e.stopPropagation();
        const open = notifDrop.classList.toggle("is-open");
        bell.setAttribute("aria-expanded", String(open));
        if (open) {
          try { await window.DB.markNotificationsRead(); } catch (_) {}
        }
      });
    }

    const pBtn = document.getElementById("profileBtn");
    const pDrop = document.getElementById("profileDrop");
    if (pBtn && pDrop) {
      pBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = pDrop.classList.toggle("is-open");
        pBtn.setAttribute("aria-expanded", String(open));
      });
    }
    const out = document.getElementById("logoutBtn");
    if (out) out.addEventListener("click", async () => {
      await window.DB.logout();
      location.href = "index.html";
    });

    document.addEventListener("click", closeDropdowns);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDropdowns(); });
    document.addEventListener("langchange", () => location.reload());
  }

  /* ---------------- toast / modal ---------------- */
  function toast(message, type = "success") {
    let root = document.querySelector(".toast-root");
    if (!root) {
      root = document.createElement("div");
      root.className = "toast-root";
      document.body.appendChild(root);
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", "status");
    el.innerHTML = `<i data-lucide="${type === "error" ? "alert-triangle" : type === "info" ? "info" : "check-circle-2"}" class="icon"></i><div>${esc(message)}</div>`;
    root.appendChild(el);
    icons();
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; }, 3400);
    setTimeout(() => el.remove(), 3800);
  }

  function modal({ title, desc = "", body = "", confirmText = "Confirm", cancelText = "Cancel", danger = false, wide = false, hideCancel = false, onConfirm }) {
    return new Promise((resolve) => {
      const root = document.createElement("div");
      root.className = "modal-root";
      root.innerHTML = `<div class="modal-backdrop" data-close></div>
        <div class="modal-card ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal-head">
            <div><h3>${esc(title)}</h3>${desc ? `<p>${esc(desc)}</p>` : ""}</div>
            <button class="btn-icon" data-close aria-label="Close"><i data-lucide="x" class="icon"></i></button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-foot">
            ${hideCancel ? "" : `<button class="btn btn-outline" data-close>${esc(cancelText)}</button>`}
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${esc(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(root);
      document.body.style.overflow = "hidden";
      icons();
      const first = root.querySelector("input, select, textarea");
      if (first) setTimeout(() => first.focus(), 60);

      const close = (val) => {
        document.body.style.overflow = "";
        root.remove();
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      document.addEventListener("keydown", onKey);
      root.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => close(null)));
      root.querySelector("[data-confirm]").addEventListener("click", async () => {
        const btn = root.querySelector("[data-confirm]");
        if (!onConfirm) return close(true);
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = "Working…";
        try {
          const result = await onConfirm(root);
          if (result === false) { btn.disabled = false; btn.innerHTML = original; return; }
          close(result === undefined ? true : result);
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = original;
          toast(err.message || "Something went wrong", "error");
        }
      });
    });
  }

  const confirm = (opts) => modal({ confirmText: "Confirm", ...opts, hideCancel: false });

  /* ---------------- charts ---------------- */
  const PALETTE = ["#2f6fed", "#0d8a4f", "#ef7a1a", "#7c5cd6", "#14a3b8", "#c1c8d4"];
  const gridColor = "#eef1f5";

  function hasChart() { return typeof window.Chart !== "undefined"; }
  function baseOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#101a2c", padding: 10, cornerRadius: 8, titleFont: { family: "Inter", size: 12 }, bodyFont: { family: "Inter", size: 12 } } },
      animation: { duration: 600 }
    };
  }
  function fallback(canvas) {
    if (!canvas || !canvas.parentElement) return;
    canvas.parentElement.innerHTML = `<div class="empty"><i data-lucide="bar-chart-3" class="icon"></i><p class="small">Chart library unavailable offline.</p></div>`;
  }

  function sparkline(canvas, values, color = "#2f6fed") {
    if (!canvas) return null;
    if (!hasChart()) return fallback(canvas);
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 40);
    grad.addColorStop(0, color + "33");
    grad.addColorStop(1, color + "00");
    return new Chart(ctx, {
      type: "line",
      data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: color, borderWidth: 1.8, fill: true, backgroundColor: grad, tension: .38, pointRadius: 0 }] },
      options: { ...baseOpts(), scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 500 } }
    });
  }

  function lineChart(canvas, labels, values, { color = "#2f6fed", fill = true, label = "" } = {}) {
    if (!canvas) return null;
    if (!hasChart()) return fallback(canvas);
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
    grad.addColorStop(0, color + "2e");
    grad.addColorStop(1, color + "00");
    return new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label, data: values, borderColor: color, borderWidth: 2.2,
          fill, backgroundColor: grad, tension: .35,
          pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: "#fff",
          pointBorderColor: color, pointBorderWidth: 2
        }]
      },
      options: {
        ...baseOpts(),
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: "#8b95a5", font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { color: "#8b95a5", font: { size: 11 }, precision: 0 } }
        }
      }
    });
  }

  function barChart(canvas, labels, values, { colors = null, horizontal = false, label = "Votes" } = {}) {
    if (!canvas) return null;
    if (!hasChart()) return fallback(canvas);
    return new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label, data: values,
          backgroundColor: colors || labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 6, maxBarThickness: 34
        }]
      },
      options: {
        ...baseOpts(),
        indexAxis: horizontal ? "y" : "x",
        scales: {
          x: horizontal
            ? { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { color: "#8b95a5", font: { size: 11 }, precision: 0 } }
            : { grid: { display: false }, border: { display: false }, ticks: { color: "#697586", font: { size: 11 } } },
          y: horizontal
            ? { grid: { display: false }, border: { display: false }, ticks: { color: "#697586", font: { size: 11.5 } } }
            : { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { color: "#8b95a5", font: { size: 11 }, precision: 0 } }
        }
      }
    });
  }

  function doughnut(canvas, labels, values, { colors = null, cutout = "68%", center = null } = {}) {
    if (!canvas) return null;
    if (!hasChart()) return fallback(canvas);
    const centerPlugin = {
      id: "centerLabel",
      afterDraw(chart) {
        if (!center) return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = "#0e1729";
        ctx.font = '700 22px "Plus Jakarta Sans", Inter, sans-serif';
        ctx.fillText(String(center[0]), cx, cy + 3);
        ctx.fillStyle = "#8b95a5";
        ctx.font = '500 10.5px Inter, sans-serif';
        ctx.fillText(String(center[1]), cx, cy + 21);
        ctx.restore();
      }
    };
    return new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors || labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 3, borderColor: "#fff", hoverOffset: 4
        }]
      },
      options: {
        ...baseOpts(), cutout,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#101a2c", padding: 10, cornerRadius: 8,
            callbacks: { label: (c) => ` ${c.label}: ${num(c.parsed)}` }
          }
        }
      },
      plugins: center ? [centerPlugin] : []
    });
  }

  function centerText(canvas, main, sub) {
    if (!hasChart() || !canvas) return;
    const chart = window.Chart.getChart(canvas);
    if (!chart) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#0e1729";
    ctx.font = '700 22px "Plus Jakarta Sans", Inter, sans-serif';
    ctx.fillText(main, cx, cy + 2);
    ctx.fillStyle = "#8b95a5";
    ctx.font = '500 10.5px Inter, sans-serif';
    ctx.fillText(sub, cx, cy + 20);
    ctx.restore();
  }

  /* ---------------- reusable election card ---------------- */
  function electionCard(e) {
    const open = e.status === "active";
    const viewHref = ["active", "upcoming"].includes(e.status) ? `vote.html?id=${e.id}` : `results.html?id=${e.id}`;
    const voteBtn = open && !e.hasVoted
      ? `<a class="btn btn-accent btn-sm" href="vote.html?id=${e.id}">${esc(window.t("dash.voteNow"))}</a>`
      : open && e.hasVoted
        ? `<span class="badge badge-active no-dot">Voted</span>`
        : e.status === "published"
          ? `<a class="btn btn-outline btn-sm" href="results.html?id=${e.id}">${esc(window.t("nav.results"))}</a>`
          : `<span class="badge badge-${e.status === "upcoming" ? "upcoming" : "closed"}">${esc(window.t(e.status === "upcoming" ? "status.startsSoon" : "status.ended"))}</span>`;
    return `<article class="election-card" data-election="${e.id}">
      <div class="ec-top">
        <span class="ec-cat">${esc(e.category)}</span>
        ${statusBadge(effectiveStatus(e))}
      </div>
      <h4>${esc(e.title)}</h4>
      <p class="ec-desc clamp-2">${esc(e.description)}</p>
      <div class="ec-meta">
        <span><i data-lucide="calendar-days"></i>${fmtShort(e.startsAt)} – ${fmtShort(e.endsAt)}</span>
        <span><i data-lucide="users"></i>${e.candidateCount} ${esc(window.t("common.candidates"))}</span>
        <span><i data-lucide="shield-check"></i>${num(e.eligible)} ${esc(window.t("common.eligible"))}</span>
      </div>
      <div>
        <div class="progress-row"><span>${esc(window.t("common.turnout"))} ${e.participation}%</span><span>${num(e.votesCast)} ${esc(window.t("common.votes"))}</span></div>
        <div class="progress"><i style="width:${Math.min(e.participation, 100)}%"></i></div>
      </div>
      <div class="ec-foot">
        <a class="btn btn-outline btn-sm" href="${viewHref}">${esc(window.t("dash.viewElection"))}</a>
        ${voteBtn}
      </div>
    </article>`;
  }

  function emptyState(title, body, icon = "inbox") {
    return `<div class="empty"><i data-lucide="${icon}" class="icon"></i><h4>${esc(title)}</h4><p>${esc(body || "")}</p></div>`;
  }

  return {
    esc, initials, fmtDate, fmtShort, fmtDT, fmtLongDate, relTime, countdown, pct, num,
    electionCard, emptyState,
    statusBadge, effectiveStatus, mount, icons, toast, modal, confirm, brandHTML, closeDropdowns,
    charts: { sparkline, lineChart, barChart, doughnut, centerText, PALETTE, hasChart }
  };
})();
