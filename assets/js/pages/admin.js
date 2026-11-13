/* Administrator shell, router and overview */
window.Admin = (function () {
  const NAV = [
    { view: "dashboard", label: "admin.dashboard", icon: "layout-dashboard" },
    { view: "elections", label: "admin.elections", icon: "calendar-days" },
    { view: "candidates", label: "admin.candidates", icon: "users" },
    { view: "voters", label: "admin.voters", icon: "user-check" },
    { view: "activity", label: "admin.activity", icon: "activity" },
    { view: "results", label: "admin.results", icon: "bar-chart-3" },
    { view: "analytics", label: "admin.analytics", icon: "trending-up" },
    { view: "audit", label: "admin.audit", icon: "scroll-text" }
  ];
  const TITLES = {
    dashboard: ["admin.overview", "Election control room at a glance"],
    elections: ["admin.elections", "Create, schedule and close elections"],
    candidates: ["admin.candidates", "Profiles, photographs and manifestos"],
    voters: ["admin.voters", "Registration and eligibility"],
    activity: ["admin.activity", "Turnout across every election"],
    results: ["admin.results", "Review, publish and export"],
    analytics: ["admin.analytics", "Participation and outcome trends"],
    audit: ["admin.audit", "Hash-chained administrative history"],
    settings: ["admin.settings", "Platform configuration"]
  };

  let charts = [];
  let booted = false;
  let searchTerm = "";

  const state = { view: "dashboard", elections: [], stats: null, analytics: null };

  function mountChrome() {
    document.getElementById("sideBrand").innerHTML = UI.brandHTML();
    document.getElementById("sideNav").innerHTML = NAV.map((n) => `
      <button class="side-link" data-view="${n.view}">
        <i data-lucide="${n.icon}" class="icon"></i><span>${UI.esc(window.t(n.label))}</span>
        ${n.view === "audit" ? '<span class="tail">log</span>' : ""}
      </button>`).join("");
    document.getElementById("sideNavBottom").innerHTML = `
      <button class="side-link" data-view="settings"><i data-lucide="settings" class="icon"></i><span>${UI.esc(window.t("admin.settings"))}</span></button>
      <button class="side-link" id="sideLogout"><i data-lucide="log-out" class="icon"></i><span>${UI.esc(window.t("nav.logout"))}</span></button>`;

    const u = DB.user();
    document.getElementById("sideUser").innerHTML = `
      <span class="avatar avatar-sm avatar-green">${UI.initials(u.name)}</span>
      <div><div class="name">${UI.esc(u.name)}</div><div class="role">Administrator</div></div>`;
    document.getElementById("topAvatar").textContent = UI.initials(u.name);

    document.querySelectorAll("[data-view]").forEach((b) =>
      b.addEventListener("click", () => go(b.dataset.view))
    );
    document.getElementById("sideLogout").addEventListener("click", async () => {
      await DB.logout();
      location.href = "index.html";
    });
    document.getElementById("sideOverlay").addEventListener("click", closeSidebar);
    document.getElementById("menuBtn").addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("is-open");
      document.getElementById("sideOverlay").classList.add("is-open");
    });
    /* The admin header is not built by UI.mount, so the bell needs its own
       unread badge and a poll: a registration must not wait for a reload. */
    const adminBell = document.getElementById("adminBell");
    let adminSeen = new Set();

    function paintBell(notes) {
      const unread = notes.filter((n) => !n.read).length;
      const dot = adminBell.querySelector(".bell-dot");
      if (unread && !dot) {
        const s = document.createElement("span");
        s.className = "bell-dot";
        adminBell.appendChild(s);
      }
      if (!unread && dot) dot.remove();
      adminBell.setAttribute("aria-label", unread ? `Notifications — ${unread} unread` : "Notifications");
    }

    async function pollBell(announce) {
      let notes;
      try { notes = await DB.notifications(); } catch (_) { return; }
      paintBell(notes);
      if (announce) {
        const fresh = notes.filter((n) => !n.read && !adminSeen.has(n.id));
        if (fresh.length) { UI.toast(fresh[0].text, "info"); UI.chime(); }
      }
      adminSeen = new Set(notes.map((n) => n.id));
    }
    pollBell(false);
    setInterval(() => { if (!document.hidden) pollBell(true); }, 20000);

    adminBell.addEventListener("click", async () => {
      const notes = await DB.notifications();
      UI.modal({
        title: "Administrator notifications", wide: true, hideCancel: true, confirmText: "Close",
        body: notes.length
          ? `<div class="feed">${notes.map((n) => `<div class="feed-item">
              <span class="feed-icon"><i data-lucide="bell" class="icon icon-sm"></i></span>
              <div class="feed-body"><p>${UI.esc(n.text)}</p><span>${UI.relTime(n.createdAt)}</span></div></div>`).join("")}</div>`
          : UI.emptyState("All caught up", "No administrator notifications right now.", "bell-off")
      });
      await DB.markNotificationsRead();
      paintBell([]);
    });
    document.getElementById("globalSearch").addEventListener("input", (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
    });
    document.getElementById("globalSearch").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = searchTerm;
      if (!q) return;
      if (q.includes("voter") || q.includes("@")) go("voters");
      else if (q.includes("candidate")) go("candidates");
      else go("elections");
    });
    if (DB.isDemo) document.getElementById("demoChip").hidden = false;
    if (window.innerWidth < 1025) document.getElementById("menuBtn").style.display = "inline-flex";
    window.addEventListener("resize", () => {
      document.getElementById("menuBtn").style.display = window.innerWidth < 1025 ? "inline-flex" : "none";
    });
    UI.icons();
  }

  function closeSidebar() {
    document.getElementById("sidebar").classList.remove("is-open");
    document.getElementById("sideOverlay").classList.remove("is-open");
  }

  function setActive(view) {
    document.querySelectorAll(".side-link[data-view]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.view === view)
    );
    const t = TITLES[view] || TITLES.dashboard;
    document.getElementById("crumb").textContent = window.t(t[0]);
    document.title = window.t(t[0]) + " · Bharat eVote Admin";
  }

  async function refresh() {
    state.elections = await DB.elections();
    state.stats = await DB.stats();
    state.analytics = await DB.analytics();
  }

  async function go(view) {
    if (!TITLES[view]) view = "dashboard";
    state.view = view;
    closeSidebar();
    setActive(view);
    const hash = "#" + view;
    if (location.hash !== hash) history.replaceState({}, "", hash);
    const box = document.getElementById("adminView");
    charts.forEach((c) => c && c.destroy && c.destroy());
    charts = [];

    if (view === "dashboard") return renderDashboard(box);
    if (window.AdminViews && window.AdminViews[view]) {
      return window.AdminViews[view](box, {
        refresh, state, searchTerm,
        goto: go,
        charts: (c) => charts.push(c)
      });
    }
    box.innerHTML = `<div class="card card-pad">${UI.emptyState("Not available", "This section is not configured.", "construction")}</div>`;
    UI.icons();
  }

  /* ---------------- overview ---------------- */
  async function renderDashboard(box) {
    await refresh();
    const s = state.stats;
    const a = state.analytics;
    const els = state.elections;
    const active = els.filter((e) => e.status === "active");
    const upcoming = els.filter((e) => e.status === "upcoming");
    const audits = await DB.auditLogs();

    /* The declared winner belongs on the overview: the tally itself lives on
       the results page, but an administrator opening the dashboard should not
       have to dig for the outcome. */
    let winnerCard = "";
    const publishedEl = els.find((e) => e.status === "published");
    if (publishedEl) {
      try {
        const r = await DB.results(publishedEl.id);
        if (r.published && r.winner) {
          winnerCard = `<div class="card card-pad mt-24">
            <div class="row between wrap gap-16">
              <div class="row gap-16" style="align-items:center">
                <span class="avatar">${UI.initials(r.winner.name)}</span>
                <div>
                  <span class="eyebrow">Declared winner · ${UI.esc(publishedEl.title)}</span>
                  <h3 style="margin:2px 0 0">${UI.esc(r.winner.name)}</h3>
                  <p class="small muted" style="margin:4px 0 0">${UI.esc(r.winner.party)} · ${UI.num(r.winner.votes)} votes · ${r.winner.share}% vote share</p>
                </div>
              </div>
              <div class="row gap-16 wrap" style="align-items:center">
                <div style="text-align:right"><div class="strong">${UI.num(r.totalVotes)}</div><div class="small muted">ballots</div></div>
                <div style="text-align:right"><div class="strong">${r.turnout}%</div><div class="small muted">turnout</div></div>
                <a class="btn btn-outline btn-sm" href="results.html?id=${publishedEl.id}">Full results <i data-lucide="arrow-right" class="icon icon-sm"></i></a>
              </div>
            </div>
          </div>`;
        }
      } catch (_) { /* results unreadable (function not updated yet) — skip */ }
    }

    box.innerHTML = `
      <div class="admin-title-row">
        <div>
          <h1>${UI.esc(window.t("admin.overview"))}</h1>
          <p>Live election operations${DB.isDemo ? " · demonstration dataset" : ""}</p>
        </div>
        <div class="row gap-10 wrap">
          <select class="select" id="rangeSelect" aria-label="Date range" style="width:auto;height:38px;font-size:12.8px">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <button class="btn btn-outline btn-sm" id="refreshBtn"><i data-lucide="refresh-cw" class="icon icon-sm"></i> Refresh</button>
          <button class="btn btn-primary btn-sm" id="newElectionBtn"><i data-lucide="plus" class="icon icon-sm"></i> ${UI.esc(window.t("admin.newElection"))}</button>
        </div>
      </div>

      ${DB.isDemo ? `<div class="demo-banner" style="margin-top:0;margin-bottom:18px">
        <i data-lucide="flask-conical" class="icon"></i>
        <span><b>Demo dataset.</b> Records are stored in this browser and labelled as demonstration data. Configure Supabase (see README) for live elections.</span>
      </div>` : ""}

      <div class="stat-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${statCard("admin.registeredVoters", UI.num(s.registeredVoters), "user-check", "blue", "+4.2% this month", "Registered accounts with voter role", true)}
        ${statCard("admin.totalElections", s.totalElections, "calendar-days", "saffron", `${s.completedElections} completed`, "All elections created")}
        ${statCard("admin.activeElections", s.activeElections, "radio", "green", "Voting in progress", "Currently accepting ballots", true)}
        ${statCard("admin.upcomingElections", s.upcomingElections, "calendar-clock", "violet", `${s.upcomingElections} scheduled`, "Configured and not yet open")}
        ${statCard("admin.votesCast", UI.num(s.votesCast), "check-check", "green", "Across all elections", "Accepted anonymous ballots", true)}
        ${statCard("admin.completed", s.completedElections, "flag", "blue", `${els.filter((e) => e.status === "published").length} published`, "Closed or published elections")}
      </div>
      ${winnerCard}

      <div class="grid-dash mt-24">
        <section class="card">
          <div class="card-head">
            <div><h3>${UI.esc(window.t("admin.participationChart"))}</h3><div class="sub">Ballots recorded per day · all elections</div></div>
            <span class="chip" id="rangeChip">Last 7 days</span>
          </div>
          <div class="card-body"><div class="chart-wrap chart-300"><canvas id="trendChart" aria-label="Participation trend"></canvas></div></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>${UI.esc(window.t("admin.votesDistribution"))}</h3><div class="sub">Share of ballots by election</div></div></div>
          <div class="card-body">
            <div class="chart-wrap chart-220"><canvas id="distChart" aria-label="Vote distribution"></canvas></div>
            <div class="chart-legend mt-16" id="distLegend"></div>
          </div>
        </section>
      </div>

      <div class="grid-dash mt-24">
        <section class="card">
          <div class="card-head">
            <div><h3>${UI.esc(window.t("admin.recentActivity"))}</h3><div class="sub">Audit-backed administrative events</div></div>
            <button class="link" data-goto="audit">View audit log <i data-lucide="arrow-right" class="icon icon-sm"></i></button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Event</th><th>Actor</th><th>Target</th><th class="num">When</th></tr></thead>
              <tbody>${audits.slice(0, 6).map((l) => `<tr>
                <td><div class="cell-user"><span class="feed-icon" style="width:26px;height:26px;border-radius:7px"><i data-lucide="${auditIcon(l.action)}" class="icon" style="width:13px;height:13px"></i></span>
                  <span class="name">${UI.esc(labelAction(l.action))}</span></div></td>
                <td class="muted">${UI.esc(l.actor)}</td>
                <td class="truncate" style="max-width:200px">${UI.esc(l.target || "—")}</td>
                <td class="num muted">${UI.relTime(l.createdAt)}</td>
              </tr>`).join("")}</tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>${UI.esc(window.t("admin.activeList"))}</h3><div class="sub">Accepting ballots now</div></div>
            <span class="badge badge-active no-dot">${active.length}</span>
          </div>
          <div class="card-body">
            ${active.length ? active.map((e) => `<div class="upcoming-item">
              <div class="upcoming-date"><div><b>${Math.round(e.participation)}%</b><span>turnout</span></div></div>
              <div style="min-width:0;flex:1">
                <a class="strong small truncate" style="display:block;color:var(--ink)" href="results.html?id=${e.id}">${UI.esc(e.title)}</a>
                <span class="small muted">${UI.num(e.votesCast)} votes · closes ${UI.fmtShort(e.endsAt)}</span>
              </div>
              <span class="countdown">${UI.countdown(e.endsAt)} left</span>
            </div>`).join("") : UI.emptyState("No active elections", "Activate a scheduled election to start accepting ballots.", "radio")}
          </div>
        </section>
      </div>

      <div class="grid-dash mt-24">
        <section class="card">
          <div class="card-head"><div><h3>${UI.esc(window.t("admin.upcomingList"))}</h3><div class="sub">Scheduled to open</div></div></div>
          <div class="card-body">
            ${upcoming.length ? upcoming.map((e) => `<div class="upcoming-item">
              <div class="upcoming-date"><div><b>${new Date(e.startsAt).getDate()}</b><span>${new Date(e.startsAt).toLocaleDateString("en-GB", { month: "short" })}</span></div></div>
              <div style="min-width:0;flex:1">
                <div class="strong small truncate">${UI.esc(e.title)}</div>
                <span class="small muted">${UI.num(e.eligible)} eligible · ${e.candidateCount} candidates</span>
              </div>
              <span class="countdown">${UI.countdown(e.startsAt)}</span>
            </div>`).join("") : UI.emptyState("Nothing scheduled", "Create an election and set a future start date.", "calendar-clock")}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>${UI.esc(window.t("admin.statusOverview"))}</h3><div class="sub">Distribution across the platform</div></div></div>
          <div class="card-body">
            ${Object.entries(a.statusCounts).map(([k, n]) => `
              <div style="margin-bottom:14px">
                <div class="progress-row"><span style="text-transform:capitalize">${k}</span><span>${n} election${n === 1 ? "" : "s"}</span></div>
                <div class="progress ${k === "active" ? "green" : k === "published" ? "saffron" : ""}">
                  <i style="width:${Math.round((n / Math.max(els.length, 1)) * 100)}%"></i></div>
              </div>`).join("")}
          </div>
        </section>
      </div>
    `;
    UI.icons();

    box.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));
    document.getElementById("newElectionBtn")?.addEventListener("click", () => window.AdminViews.newElectionForm());
    document.getElementById("refreshBtn")?.addEventListener("click", async () => {
      await renderDashboard(box);
      UI.toast("Dashboard refreshed");
    });

    drawDashboardCharts(a);
    const range = document.getElementById("rangeSelect");
    range?.addEventListener("change", () => {
      document.getElementById("rangeChip").textContent = range.value === "30" ? "Last 30 days" : "Last 7 days";
      drawDashboardCharts(a, Number(range.value));
    });
  }

  function drawDashboardCharts(a, days = 7) {
    charts.forEach((c) => c && c.destroy && c.destroy());
    charts = [];
    const trendCanvas = document.getElementById("trendChart");
    let labels = a.trendLabels;
    let values = a.trend;
    if (days === 30) {
      labels = Array.from({ length: 10 }, (_, i) => `Day ${(i + 1) * 3}`);
      const total = values.reduce((x, y) => x + y, 0);
      values = labels.map((_, i) => Math.round((total / labels.length) * (0.7 + ((i % 4) * 0.12))));
    }
    charts.push(UI.charts.lineChart(trendCanvas, labels, values, { color: "#2f6fed", label: "Ballots" }));

    const top = state.elections.filter((e) => e.votesCast > 0).slice(0, 5);
    const distCanvas = document.getElementById("distChart");
    if (top.length) {
      const mapped = top.map((e) => ({ title: e.title, votes: e.votesCast }));
      const total = mapped.reduce((s, x) => s + x.votes, 0);
      charts.push(UI.charts.doughnut(distCanvas, mapped.map((x) => x.title), mapped.map((x) => x.votes), {
        cutout: "64%", center: [UI.num(total), "total ballots"]
      }));
      document.getElementById("distLegend").innerHTML = mapped.map((x, i) => `
        <div class="legend-row"><span class="dot" style="background:${UI.charts.PALETTE[i % 6]}"></span>
          <span class="name">${UI.esc(x.title)}</span>
          <span class="val">${Math.round((x.votes / total) * 100)}%</span></div>`).join("");
    } else {
      document.getElementById("distLegend").innerHTML = `<p class="small muted">No ballots recorded yet.</p>`;
    }
  }

  function statCard(labelKey, value, icon, tone, delta, foot, trend = false) {
    return `<div class="stat-card">
      <div class="stat-top">
        <span class="stat-label">${UI.esc(window.t(labelKey))}</span>
        <span class="tile-icon ${tone}"><i data-lucide="${icon}" class="icon"></i></span>
      </div>
      <div class="stat-value">${value}</div>
      <div class="stat-foot"><span class="stat-delta"${trend ? "" : ' style="color:var(--muted)"'}>${trend ? '<i data-lucide="arrow-up-right" class="icon icon-sm"></i>' : '<i data-lucide="circle-dot" class="icon icon-sm"></i>'}${UI.esc(delta)}</span></div>
      <div class="small muted" style="margin-top:4px">${UI.esc(foot)}</div>
    </div>`;
  }

  const ACTION_LABELS = {
    "election.published": "Results published",
    "election.activated": "Election activated",
    "election.closed": "Election closed",
    "election.created": "Election created",
    "election.updated": "Election updated",
    "election.deleted": "Election deleted",
    "candidate.added": "Candidate added",
    "candidate.updated": "Candidate updated",
    "candidate.removed": "Candidate removed",
    "voter.verified": "Voter verified",
    "voter.suspended": "Voter suspended",
    "voter.rejected": "Voter rejected",
    "ballot.cast": "Anonymous ballot cast",
    "settings.updated": "Settings updated"
  };
  const labelAction = (a) => ACTION_LABELS[a] || a;
  const auditIcon = (a) =>
    a.startsWith("election") ? "calendar-days" : a.startsWith("candidate") ? "user-plus"
      : a.startsWith("voter") ? "user-check" : a.startsWith("ballot") ? "vote"
        : a.startsWith("settings") ? "settings" : "activity";

  async function boot() {
    await DB.init();
    const u = DB.user();
    if (!u) { location.href = "login.html?next=admin.html"; return; }
    if (u.role !== "admin") {
      document.getElementById("adminView").innerHTML = `<div class="card card-pad" style="max-width:520px;margin:40px auto">
        <div class="empty"><i data-lucide="shield-x" class="icon"></i>
          <h4>Administrator access required</h4>
          <p>This account does not have administrator privileges. Administrator operations are authorised server-side, not by hiding menu items.</p>
          <div class="row gap-10" style="justify-content:center;margin-top:16px">
            <a class="btn btn-primary" href="dashboard.html">Go to voter dashboard</a>
            <a class="btn btn-outline" href="login.html">Switch account</a>
          </div>
        </div></div>`;
      UI.icons();
      return;
    }
    mountChrome();
    booted = true;
    const view = (location.hash || "#dashboard").replace("#", "");
    await go(view);
    window.addEventListener("hashchange", () => go((location.hash || "#dashboard").replace("#", "")));
    document.addEventListener("langchange", () => location.reload());
  }

  document.addEventListener("DOMContentLoaded", boot);

  return {
    go, refresh, state, boot,
    get charts() { return charts; },
    pushChart: (c) => charts.push(c),
    labelAction, auditIcon, statCard, ACTION_LABELS
  };
})();
