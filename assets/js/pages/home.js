/* Landing page */
(async function () {
  await DB.init();
  await UI.mount("home");

  window.I18N.apply();
  const u = DB.user();
  if (u) {
    const heroCta = document.querySelector(".hero-cta");
    if (heroCta) heroCta.innerHTML = `
      <a class="btn btn-accent btn-lg" href="${u.role === "admin" ? "admin.html" : "dashboard.html"}">
        ${u.role === "admin" ? "Open admin dashboard" : "Go to my dashboard"} <i data-lucide="arrow-right" class="icon"></i></a>
      <a class="btn btn-outline btn-lg" href="elections.html">Browse elections</a>`;
    UI.icons();
  }

  const els = await DB.elections();
  const open = els.filter((e) => e.status === "active");
  const totalVotes = els.reduce((s, e) => s + e.votesCast, 0);
  document.getElementById("heroOpen").textContent = open.length;
  document.getElementById("heroVotes").textContent = UI.num(totalVotes);

  // Hero preview: most-voted active election, aggregate shares only.
  const featured = open.slice().sort((a, b) => b.votesCast - a.votesCast)[0] || els.find((e) => e.status === "published");
  if (featured) {
    document.getElementById("mockTitle").textContent = featured.title;
    document.getElementById("mockSub").textContent = `${featured.candidateCount} candidates · closes ${UI.fmtShort(featured.endsAt)}`;
    document.getElementById("mockTurnout").textContent = featured.participation + "%";
    document.getElementById("mockVotes").textContent = UI.num(featured.votesCast);
    document.getElementById("floatEligible").textContent = UI.num(featured.eligible);

    const detail = await DB.election(featured.id);
    const share = 100 / Math.max(detail.candidates.length, 1);
    document.getElementById("mockRows").innerHTML = detail.candidates.slice(0, 4).map((c, i) => {
      const width = 78 - i * 13;
      return `<div class="mock-row">
        <span class="nm truncate">${UI.esc(c.name.split(" ")[0])} ${UI.esc((c.name.split(" ")[1] || "").charAt(0))}.</span>
        <span class="bar"><i style="width:${width}%;background:${c.color}"></i></span>
        <span class="pc">${Math.round(share)}%</span>
      </div>`;
    }).join("") + `<p class="small muted" style="padding-top:10px">Illustrative breakdown — official candidate totals appear after publication.</p>`;
  }

  const grid = document.getElementById("landingElections");
  const pick = els.filter((e) => ["active", "upcoming", "published"].includes(e.status)).slice(0, 4);
  grid.innerHTML = pick.length ? pick.map(UI.electionCard).join("") : UI.emptyState("No elections yet", "Elections created by an administrator will appear here.", "calendar-x");
  UI.icons();

  // FAQ accordion
  document.querySelectorAll(".faq-q").forEach((q) => {
    q.addEventListener("click", () => {
      const item = q.parentElement;
      const wasOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach((i) => i.classList.remove("open"));
      if (!wasOpen) item.classList.add("open");
    });
  });
  const first = document.querySelector(".faq-item");
  if (first) first.classList.add("open");
})();
