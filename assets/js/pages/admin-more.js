/* Admin — activity, results, analytics, audit log, settings */
(function () {
  const V = window.AdminViews;
  const esc = (s) => UI.esc(s);

  /* ---------------- voting activity ---------------- */
  V.activity = async function (box, ctx) {
    await ctx.refresh();
    const a = Admin.state.analytics;
    const els = Admin.state.elections;
    const totalVotes = els.reduce((s, e) => s + e.votesCast, 0);
    const avgTurnout = els.length ? Math.round(els.reduce((s, e) => s + e.participation, 0) / els.length) : 0;

    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.activity"))}</h1><p>Aggregate turnout and ballot volume. Individual ballots are not accessible.</p></div>
        <span class="chip"><i data-lucide="lock" class="icon icon-sm"></i> Anonymous ballots</span>
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${Admin.statCard("admin.votesCast", UI.num(totalVotes), "check-check", "green", "Accepted ballots", "Across every election")}
        ${Admin.statCard("common.turnout", avgTurnout + "%", "percent", "saffron", "Average", "Platform-wide participation")}
        ${Admin.statCard("admin.activeElections", Admin.state.stats.activeElections, "radio", "blue", "Live now", "Elections accepting votes")}
      </div>

      <section class="card mt-24">
        <div class="card-head">
          <div><h3>Voting activity overview</h3><div class="sub">Ballots recorded over the last seven days</div></div>
          <span class="chip">All elections</span>
        </div>
        <div class="card-body"><div class="chart-wrap chart-260"><canvas id="actTrend" aria-label="Voting activity"></canvas></div></div>
      </section>

      <section class="card mt-24">
        <div class="card-head"><div><h3>Election-wise activity</h3><div class="sub">Turnout per election, most recent first</div></div></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Election</th><th>Status</th><th class="num">Votes cast</th><th class="num">Eligible</th><th style="width:24%">Turnout</th><th class="num">Window</th></tr></thead>
            <tbody>${els.map((e) => `<tr>
              <td><div class="name" style="font-weight:600;color:var(--ink)">${esc(e.title)}</div>
                <div class="small muted">${esc(e.category)}</div></td>
              <td>${UI.statusBadge(e.status)}</td>
              <td class="num">${UI.num(e.votesCast)}</td>
              <td class="num muted">${UI.num(e.eligible)}</td>
              <td><div class="progress-row" style="margin-bottom:5px"><span>${e.participation}%</span></div>
                <div class="progress"><i style="width:${Math.min(e.participation, 100)}%"></i></div></td>
              <td class="num small muted">${UI.fmtShort(e.startsAt)} – ${UI.fmtShort(e.endsAt)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>

      <div class="locked-note mt-24">
        <i data-lucide="shield" class="icon"></i>
        <div><b>Anonymity guarantee.</b> This workspace reads only participation counts and anonymous ballot totals. No view in the administrator panel can link an account to a candidate selection.</div>
      </div>`;
    UI.icons();
    ctx.charts(UI.charts.lineChart(document.getElementById("actTrend"), a.trendLabels, a.trend, { color: "#0d8a4f" }));
  };

  /* ---------------- results management ---------------- */
  V.results = async function (box, ctx) {
    await ctx.refresh();
    const els = Admin.state.elections.filter((e) => ["active", "closed", "published"].includes(e.status));
    if (!els.length) {
      box.innerHTML = `<div class="admin-title-row"><div><h1>${esc(window.t("admin.results"))}</h1><p>Review and publish election outcomes.</p></div></div>
        <div class="card card-pad">${UI.emptyState("No results yet", "Close an election to review its outcome.", "bar-chart-3")}</div>`;
      UI.icons();
      return;
    }
    let currentId = els.find((e) => e.status === "closed")?.id || els.find((e) => e.status === "published")?.id || els[0].id;

    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.results"))}</h1><p>Review provisional totals, publish official results and export reports.</p></div>
        <div class="row gap-10 wrap">
          <select class="select" id="resSelect" style="min-width:280px" aria-label="Select election">
            ${els.map((e) => `<option value="${e.id}" ${e.id === currentId ? "selected" : ""}>${esc(e.title)} — ${e.status}</option>`).join("")}
          </select>
          <button class="btn btn-outline btn-sm" id="resExport"><i data-lucide="download" class="icon icon-sm"></i> ${esc(window.t("admin.export"))}</button>
          <button class="btn btn-accent btn-sm" id="resPublish" hidden><i data-lucide="badge-check" class="icon icon-sm"></i> ${esc(window.t("admin.publish"))}</button>
        </div>
      </div>
      <div id="resBody"></div>`;
    UI.icons();

    async function render(id) {
      currentId = id;
      const r = await DB.results(id);
      const e = r.election;
      const publishBtn = document.getElementById("resPublish");
      publishBtn.hidden = !(e.status === "closed" || r.adminPreview);
      const body = document.getElementById("resBody");
      body.innerHTML = `
        <section class="card">
          <div class="card-head">
            <div><h3>${esc(e.title)}</h3><div class="sub">${esc(e.category)} · ${UI.fmtDate(e.startsAt)} – ${UI.fmtDate(e.endsAt)}</div></div>
            ${UI.statusBadge(UI.effectiveStatus(e))}
          </div>
          <div class="card-body">
            <div class="result-stats">
              <div class="result-stat"><span>Eligible voters</span><b>${UI.num(r.totalEligible)}</b></div>
              <div class="result-stat"><span>Votes cast</span><b>${UI.num(r.totalVotes)}</b></div>
              <div class="result-stat"><span>Turnout</span><b>${r.turnout}<small>%</small></b></div>
              <div class="result-stat"><span>${r.published ? "Winner" : "Status"}</span><b style="font-size:${r.published && r.winner ? "15px" : "22px"}">${r.published ? esc(r.winner ? r.winner.name : "Tie") : "Unpublished"}</b></div>
            </div>
            ${!r.rows ? `<div class="locked-note mt-24"><i data-lucide="lock" class="icon"></i>
              <div><b>Results are sealed while voting is open.</b> Close the election to review candidate-wise totals, then publish them.</div></div>` : `
              <div class="table-wrap mt-16">
                <table class="data">
                  <thead><tr><th>#</th><th>Candidate</th><th>Affiliation</th><th class="num">Votes</th><th class="num">Share</th><th style="width:26%">Share bar</th></tr></thead>
                  <tbody>${r.rows.map((c, i) => `<tr>
                    <td class="muted">${i + 1}</td>
                    <td><div class="cell-user"><span class="avatar avatar-sm" style="background:${c.color || "#33507a"}">${UI.initials(c.name)}</span>
                      <div><div class="name">${esc(c.name)}</div>${i === 0 && r.published ? `<div class="small" style="color:var(--green-600);font-weight:600">Winner</div>` : ""}</div></div></td>
                    <td class="muted">${esc(c.party)}</td>
                    <td class="num">${UI.num(c.votes)}</td>
                    <td class="num">${c.share}%</td>
                    <td><div class="progress ${i === 0 ? "green" : ""}"><i style="width:${Math.min(c.share, 100)}%;${i === 0 ? "" : "background:#cdd4df"}"></i></div></td>
                  </tr>`).join("")}</tbody>
                </table>
              </div>
              ${!r.published ? `<div class="locked-note mt-16" style="background:#f8f9fb;border-color:var(--line);color:var(--body)">
                <i data-lucide="info" class="icon"></i><div>Provisional tally — visible to administrators only. Publish to make these numbers public.</div></div>` : ""}`}
          </div>
        </section>`;
      UI.icons();

      publishBtn.onclick = async () => {
        const ok = await UI.confirm({
          title: "Publish results?", confirmText: "Publish now",
          desc: e.title,
          body: `<p class="small muted">Candidate-wise totals, turnout and the winner will become public immediately. The action is written to the audit log and cannot be undone.</p>`,
          onConfirm: async () => { await DB.setElectionStatus(e.id, "published"); }
        });
        if (ok) { UI.toast("Results published"); await Admin.refresh(); Admin.go("results"); }
      };
    }

    document.getElementById("resSelect").addEventListener("change", (ev) => render(ev.target.value));
    document.getElementById("resExport").addEventListener("click", async () => {
      try {
        const csv = await DB.exportResultsCSV(currentId);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a2 = document.createElement("a");
        a2.href = url; a2.download = `bharat-evote-results-${currentId}.csv`; a2.click();
        URL.revokeObjectURL(url);
        UI.toast("Results exported");
      } catch (err) { UI.toast(err.message, "error"); }
    });

    await render(currentId);
  };

  /* ---------------- analytics ---------------- */
  V.analytics = async function (box, ctx) {
    await ctx.refresh();
    const a = Admin.state.analytics;
    const els = Admin.state.elections;
    const top = a.turnoutByElection.slice().sort((x, y) => y.turnout - x.turnout).slice(0, 6);
    const cats = Object.entries(a.categories).sort((x, y) => y[1] - x[1]);

    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.analyticsTitle"))}</h1><p>Participation, distribution and outcome intelligence across the platform.</p></div>
        <span class="chip"><i data-lucide="sparkles" class="icon icon-sm"></i> Chart.js</span>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><div><h3>Turnout by election</h3><div class="sub">Top elections by participation percentage</div></div></div>
          <div class="card-body"><div class="chart-wrap chart-300"><canvas id="anTurnout" aria-label="Turnout by election"></canvas></div></div>
        </section>
        <section class="card">
          <div class="card-head"><div><h3>Election status</h3><div class="sub">Portfolio composition</div></div></div>
          <div class="card-body">
            <div class="chart-wrap chart-220"><canvas id="anStatus" aria-label="Election status"></canvas></div>
            <div class="chart-legend mt-16" id="anStatusLegend"></div>
          </div>
        </section>
      </div>

      <section class="card mt-24">
        <div class="card-head"><div><h3>Ballots by category</h3><div class="sub">Where participation is concentrated</div></div></div>
        <div class="card-body"><div class="chart-wrap chart-260"><canvas id="anCats" aria-label="Ballots by category"></canvas></div></div>
      </section>

      <section class="card mt-24">
        <div class="card-head"><div><h3>Participation detail</h3><div class="sub">Votes, eligibility and turnout per election</div></div></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Election</th><th class="num">Eligible</th><th class="num">Votes</th><th class="num">Turnout</th><th class="num">Candidates</th><th class="num">Status</th></tr></thead>
            <tbody>${els.map((e) => `<tr>
              <td class="name">${esc(e.title)}</td>
              <td class="num muted">${UI.num(e.eligible)}</td>
              <td class="num">${UI.num(e.votesCast)}</td>
              <td class="num">${e.participation}%</td>
              <td class="num">${e.candidateCount}</td>
              <td class="num">${UI.statusBadge(e.status)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>`;
    UI.icons();

    if (top.length) {
      ctx.charts(UI.charts.barChart(
        document.getElementById("anTurnout"),
        top.map((t) => t.title.length > 22 ? t.title.slice(0, 21) + "…" : t.title),
        top.map((t) => t.turnout),
        { horizontal: true, colors: top.map(() => "#2f6fed") }
      ));
    }
    const statusEntries = Object.entries(a.statusCounts).filter(([, n]) => n > 0);
    ctx.charts(UI.charts.doughnut(
      document.getElementById("anStatus"),
      statusEntries.map(([k]) => k),
      statusEntries.map(([, n]) => n),
      { cutout: "62%" }
    ));
    document.getElementById("anStatusLegend").innerHTML = statusEntries.map(([k, n], i) => `
      <div class="legend-row"><span class="dot" style="background:${UI.charts.PALETTE[i % 6]}"></span>
        <span class="name" style="text-transform:capitalize">${k}</span><span class="val">${n}</span></div>`).join("");

    if (cats.length) {
      ctx.charts(UI.charts.barChart(
        document.getElementById("anCats"),
        cats.map(([k]) => k),
        cats.map(([, v]) => v),
        { horizontal: true, colors: cats.map((_, i) => UI.charts.PALETTE[i % 6]) }
      ));
    }
  };

  /* ---------------- audit log ---------------- */
  V.audit = async function (box, ctx) {
    const logs = await DB.auditLogs();
    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.auditTitle"))}</h1><p>Append-only record of sensitive operations, chained by hash.</p></div>
        <button class="btn btn-outline btn-sm" id="verifyChain"><i data-lucide="shield-check" class="icon icon-sm"></i> Verify chain</button>
      </div>
      <div class="locked-note mb-16" style="margin-bottom:18px">
        <i data-lucide="link-2" class="icon"></i>
        <div><b>How to read this log.</b> Each entry stores the hash of the previous entry. Changing a historical record would break the chain, which the verification check detects. Ballot submissions are logged without any voter or candidate identifier.</div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>#</th><th>Action</th><th>Actor</th><th>Target</th><th>Detail</th><th class="num">When</th><th>Hash</th></tr></thead>
            <tbody>${logs.map((l, i) => `<tr>
              <td class="muted">${logs.length - i}</td>
              <td><div class="row gap-8"><span class="feed-icon" style="width:26px;height:26px;border-radius:7px">
                <i data-lucide="${Admin.auditIcon(l.action)}" class="icon" style="width:13px;height:13px"></i></span>
                <span class="name">${esc(Admin.labelAction(l.action))}</span></div></td>
              <td class="muted small">${esc(l.actor)}</td>
              <td class="small" style="max-width:180px">${esc(l.target || "—")}</td>
              <td class="small muted" style="max-width:260px">${esc(l.detail || "—")}</td>
              <td class="num small muted">${UI.fmtDT(l.createdAt)}</td>
              <td><code style="font-size:10.5px;background:#f5f7fa;padding:3px 6px;border-radius:5px;color:#475467">${esc((l.hash || "").slice(0, 10))}…</code></td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
    UI.icons();

    document.getElementById("verifyChain").addEventListener("click", () => {
      // Chronological order is required: logs are newest-first.
      const ordered = logs.slice().reverse();
      let broken = 0;
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].prevHash !== ordered[i - 1].hash) broken++;
      }
      if (broken) UI.toast(`Chain check failed: ${broken} broken link(s)`, "error");
      else UI.toast(`Chain verified: ${ordered.length} entries linked`);
    });
  };

  /* ---------------- settings ---------------- */
  V.settings = async function (box, ctx) {
    const s = await DB.settings();
    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.settingsTitle"))}</h1><p>Eligibility rules, publication policy and platform identity.</p></div>
        <span class="chip ${DB.isDemo ? "chip-demo" : ""}"><i data-lucide="${DB.isDemo ? "flask-conical" : "cloud"}" class="icon icon-sm"></i>${DB.isDemo ? "Demo mode" : "Supabase connected"}</span>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><div><h3>Election policy</h3><div class="sub">Applies to every election on this deployment</div></div></div>
          <div class="card-body">
            <div class="setting-row">
              <div><h4>Require eligibility verification</h4><p>Voters must be verified by an administrator before a ballot is accepted.</p></div>
              <label class="switch"><input type="checkbox" id="setVerify" ${s.requireVerification ? "checked" : ""}><span></span></label>
            </div>
            <div class="setting-row">
              <div><h4>Allow self-registration</h4><p>New voters can create an account without an invitation.</p></div>
              <label class="switch"><input type="checkbox" id="setRegister" ${s.allowSelfRegistration ? "checked" : ""}><span></span></label>
            </div>
            <div class="setting-row">
              <div><h4>Publish results only after closure</h4><p>Candidate-wise totals stay sealed until an administrator publishes the outcome.</p></div>
              <label class="switch"><input type="checkbox" id="setPublish" ${s.publicResultsOnlyWhenPublished ? "checked" : ""}><span></span></label>
            </div>
            <div class="setting-row">
              <div><h4>Anonymous ballots</h4><p>Structural separation of participation and ballot records. Disabling is not permitted.</p></div>
              <label class="switch"><input type="checkbox" checked disabled><span></span></label>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>Platform identity</h3><div class="sub">Shown across the public site and emails</div></div></div>
          <div class="card-body stack gap-16">
            <div class="field"><label class="label" for="setOrg">Organisation name</label>
              <input class="input" id="setOrg" value="${esc(s.orgName || "Bharat eVote")}"></div>
            <div class="field"><label class="label" for="setSupport">Support email</label>
              <input class="input" id="setSupport" type="email" value="${esc(s.supportEmail || "")}"></div>
            <div class="field"><label class="label">Backend</label>
              <div class="verify-box"><i data-lucide="${DB.isDemo ? "database-zap" : "cloud-check"}" class="icon"></i>
                <div><h4>${DB.isDemo ? "Local demonstration store" : "Supabase PostgreSQL"}</h4>
                  <p>${DB.isDemo
                    ? "Sample data is stored in this browser. Configure supabaseUrl and supabaseAnonKey in assets/js/config.js, apply supabase/schema.sql and deploy the Edge Functions to go live."
                    : "Row Level Security, Auth and Edge Functions are active. Secret keys never reach the browser."}</p></div>
              </div>
            </div>
            <button class="btn btn-primary" id="saveSettings">Save settings</button>
          </div>
        </section>
      </div>

      <section class="card mt-24">
        <div class="card-head"><div><h3>Security posture</h3><div class="sub">What this prototype does and does not claim</div></div></div>
        <div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <div class="security-item"><span class="tile-icon green"><i data-lucide="check" class="icon"></i></span>
            <div><h4>Implemented</h4><p>Supabase Auth, RLS policies, atomic single-vote enforcement, anonymous ballot separation, hash-chained audit log, server-side validation in Edge Functions.</p></div></div>
          <div class="security-item"><span class="tile-icon saffron"><i data-lucide="x" class="icon"></i></span>
            <div><h4>Not implemented</h4><p>No Aadhaar or government identity integration, no blockchain ledger, no Election Commission certification, and no claim of official election compliance.</p></div></div>
        </div>
      </section>`;
    UI.icons();

    document.getElementById("saveSettings").addEventListener("click", async () => {
      try {
        await DB.saveSettings({
          requireVerification: document.getElementById("setVerify").checked,
          allowSelfRegistration: document.getElementById("setRegister").checked,
          publicResultsOnlyWhenPublished: document.getElementById("setPublish").checked,
          orgName: document.getElementById("setOrg").value.trim() || "Bharat eVote",
          supportEmail: document.getElementById("setSupport").value.trim()
        });
        UI.toast("Settings saved");
      } catch (err) { UI.toast(err.message, "error"); }
    });
  };
})();
