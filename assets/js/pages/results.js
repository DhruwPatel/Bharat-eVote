/* Election results & analytics */
(async function () {
  await DB.init();
  await UI.mount("results");

  const els = await DB.elections();
  const list = els.filter((e) => ["active", "closed", "published"].includes(e.status));
  const select = document.getElementById("electionSelect");
  const body = document.getElementById("resultsBody");
  const params = new URLSearchParams(location.search);
  let currentId = params.get("id");

  if (!list.length) {
    body.innerHTML = `<div class="card card-pad">${UI.emptyState("No results to show yet", "Results appear here once an election has closed.", "bar-chart-3")}</div>`;
    UI.icons();
    return;
  }
  if (!currentId || !list.some((e) => e.id === currentId)) {
    const preferred = list.find((e) => e.status === "published") || list[0];
    currentId = preferred.id;
  }

  select.innerHTML = els
    .filter((e) => ["active", "closed", "published"].includes(e.status))
    .map((e) => `<option value="${e.id}" ${e.id === currentId ? "selected" : ""}>
      ${UI.esc(e.title)}${e.status === "published" ? " · published" : e.status === "active" ? " · voting open" : " · awaiting publication"}
    </option>`).join("");

  let chartInstances = [];

  async function render(id) {
    currentId = id;
    chartInstances.forEach((c) => c && c.destroy && c.destroy());
    chartInstances = [];
    body.innerHTML = `<div class="card card-pad"><p class="small muted">Loading results…</p></div>`;

    let r;
    try { r = await DB.results(id); }
    catch (err) {
      body.innerHTML = `<div class="card card-pad">${UI.emptyState("Results unavailable", err.message, "alert-triangle")}</div>`;
      UI.icons();
      return;
    }
    const e = r.election;
    const statusBadge = UI.statusBadge(UI.effectiveStatus(e));
    const published = r.published;

    body.innerHTML = `
      <div class="card result-hero">
        <div>
          <div class="row gap-12 wrap">${statusBadge}<span class="small muted">${UI.esc(e.category)}</span>
            ${e.demo ? `<span class="chip chip-demo"><i data-lucide="flask-conical" class="icon icon-sm"></i>${UI.esc(window.t("common.demoData"))}</span>` : ""}</div>
          <h1>${UI.esc(e.title)}</h1>
          <p>${UI.esc(e.description)}</p>
          <div class="ec-meta mt-16">
            <span><i data-lucide="calendar-days"></i>${UI.fmtDate(e.startsAt)} – ${UI.fmtDate(e.endsAt)}</span>
            <span><i data-lucide="users"></i>${e.candidateCount} candidates</span>
            ${e.publishedAt ? `<span><i data-lucide="badge-check"></i>${UI.esc(window.t("results.publishedOn"))} ${UI.fmtDate(e.publishedAt)}</span>` : ""}
          </div>
        </div>
        <a class="btn btn-outline" href="elections.html"><i data-lucide="arrow-left" class="icon"></i> All elections</a>
      </div>

      ${published && r.winner ? `<div class="winner-card mt-16">
        <span class="avatar">${UI.initials(r.winner.name)}</span>
        <div>
          <div class="wc-label">${UI.esc(window.t("results.winner"))}</div>
          <h3>${UI.esc(r.winner.name)}</h3>
          <p>${UI.esc(r.winner.party)} · ${UI.num(r.winner.votes)} votes</p>
        </div>
        <div class="wc-share"><b>${r.winner.share}%</b><span>vote share</span></div>
      </div>` : ""}

      ${published && !r.winner && r.tie ? `<div class="locked-note mt-16"><i data-lucide="scale" class="icon"></i>
        <div><b>Result tied.</b> The top two candidates received an equal number of votes. The administrator should review the outcome before announcing a winner.</div></div>` : ""}

      <div class="result-stats mt-16">
        <div class="result-stat"><span>${UI.esc(window.t("results.totalEligible"))}</span><b>${UI.num(r.totalEligible)}</b></div>
        <div class="result-stat"><span>${UI.esc(window.t("results.cast"))}</span><b>${UI.num(r.totalVotes)}</b></div>
        <div class="result-stat"><span>${UI.esc(window.t("results.participation"))}</span><b>${r.turnout}<small>%</small></b></div>
        <div class="result-stat"><span>Candidates</span><b>${e.candidateCount}</b></div>
      </div>

      ${!published ? `<div class="locked-note mt-24">
          <i data-lucide="lock" class="icon"></i>
          <div><b>${UI.esc(window.t("results.pending"))}.</b> ${UI.esc(window.t("results.pendingBody"))}
          ${r.adminPreview ? "<br><span class='small'>Administrator preview: you can see the provisional tally below, but results are not public until you publish them.</span>" : ""}</div>
        </div>` : ""}

      <div class="grid-dash mt-24">
        <section class="card">
          <div class="card-head">
            <div><h3>${UI.esc(window.t("results.byCandidate"))}</h3><div class="sub">${published ? "Official vote count per candidate" : "Hidden while this election is not published"}</div></div>
            ${published ? `<button class="btn btn-outline btn-sm" id="exportBtn"><i data-lucide="download" class="icon icon-sm"></i> CSV</button>` : ""}
          </div>
          <div class="card-body">
            ${r.rows ? `<div class="chart-wrap chart-260"><canvas id="barChart" aria-label="Votes per candidate"></canvas></div>` :
              `<div class="empty" style="padding:56px 20px">
                <i data-lucide="eye-off" class="icon"></i>
                <h4>Candidate totals are sealed</h4>
                <p>Publishing results is a deliberate administrator action taken after voting closes.</p>
              </div>`}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>${UI.esc(window.t("results.distribution"))}</h3><div class="sub">${published ? "Share of valid votes" : "Aggregate turnout only"}</div></div></div>
          <div class="card-body">
            ${r.rows ? `
              <div class="chart-wrap chart-220"><canvas id="donutChart" aria-label="Vote distribution"></canvas></div>
              <div class="chart-legend mt-16" id="resultLegend"></div>` : `
              <div class="chart-wrap chart-220"><canvas id="turnoutChart" aria-label="Turnout"></canvas></div>
              <div class="chart-legend mt-16">
                <div class="legend-row"><span class="dot" style="background:#0d8a4f"></span><span class="name">Ballots cast</span><span class="val">${UI.num(r.totalVotes)}</span></div>
                <div class="legend-row"><span class="dot" style="background:#eef1f5"></span><span class="name">Eligible non-voters</span><span class="val">${UI.num(Math.max(r.totalEligible - r.totalVotes, 0))}</span></div>
              </div>`}
          </div>
        </section>
      </div>

      ${r.rows ? `<section class="card mt-24">
        <div class="card-head"><div><h3>Detailed breakdown</h3><div class="sub">Candidate-wise counts, shares and ranking</div></div></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>#</th><th>Candidate</th><th>Affiliation</th><th class="num">Votes</th><th class="num">Share</th><th style="width:26%">Progress</th></tr></thead>
            <tbody>${r.rows.map((c, i) => `<tr>
              <td class="muted">${i + 1}</td>
              <td><div class="cell-user"><span class="avatar avatar-sm" style="background:${c.color || "#33507a"}">${UI.initials(c.name)}</span>
                <div><div class="name">${UI.esc(c.name)}</div>${published && i === 0 && r.winner ? `<div class="small" style="color:var(--green-600);font-weight:600">Winner</div>` : ""}</div></div></td>
              <td class="muted">${UI.esc(c.party)}</td>
              <td class="num">${UI.num(c.votes)}</td>
              <td class="num">${c.share}%</td>
              <td><div class="progress ${i === 0 ? "green" : ""}"><i style="width:${Math.min(c.share, 100)}%;${i === 0 ? "" : "background:" + (c.color || "#98a1b0")}"></i></div></td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>` : ""}
    `;
    UI.icons();

    if (r.rows) {
      const labels = r.rows.map((c) => c.name);
      const values = r.rows.map((c) => c.votes);
      const colors = r.rows.map((c) => c.color || "#2f6fed");
      chartInstances.push(UI.charts.barChart(document.getElementById("barChart"), labels, values, { colors }));
      const donut = UI.charts.doughnut(document.getElementById("donutChart"), labels, values, { colors });
      chartInstances.push(donut);
      document.getElementById("resultLegend").innerHTML = r.rows.map((c) => `
        <div class="legend-row"><span class="dot" style="background:${c.color || "#2f6fed"}"></span>
          <span class="name">${UI.esc(c.name)}</span><span class="val">${c.share}%</span></div>`).join("");

    } else {
      chartInstances.push(UI.charts.doughnut(document.getElementById("turnoutChart"),
        ["Ballots cast", "Eligible non-voters"],
        [r.totalVotes, Math.max(r.totalEligible - r.totalVotes, 0)],
        { colors: ["#0d8a4f", "#eef1f5"] }));
    }

    select.value = id;
  }

  // CSV export for the results table (available to anyone viewing published results)
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("#exportBtn");
    if (!btn) return;
    try {
      const csv = await DB.exportResultsCSV(currentId).catch(() => null);
      if (!csv) {
        const r = await DB.results(currentId);
        if (!r.rows) return;
        const lines = [["Candidate", "Affiliation", "Votes", "Share %"].join(",")]
          .concat(r.rows.map((x) => [`"${x.name}"`, `"${x.party}"`, x.votes, x.share].join(",")));
        download(lines.join("\n"), currentId);
      } else download(csv, currentId);
    } catch (err) { UI.toast(err.message, "error"); }
  });

  function download(csv, id) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bharat-evote-results-${id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.toast("Results exported");
  }

  select.addEventListener("change", (e) => {
    const url = new URL(location.href);
    url.searchParams.set("id", e.target.value);
    history.replaceState({}, "", url);
    render(e.target.value);
  });

  await render(currentId);
})();
