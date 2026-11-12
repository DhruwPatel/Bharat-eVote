/* Election browsing */
(async function () {
  await DB.init();
  await UI.mount("elections");
  if (DB.isDemo) document.getElementById("demoBanner").hidden = false;

  const els = await DB.elections();
  let filter = "all";
  let query = "";
  let category = "";

  const counts = {
    all: els.length,
    active: els.filter((e) => e.status === "active").length,
    upcoming: els.filter((e) => e.status === "upcoming").length,
    closed: els.filter((e) => e.status === "closed").length,
    published: els.filter((e) => e.status === "published").length
  };
  document.getElementById("cAll").textContent = counts.all;
  document.getElementById("cActive").textContent = counts.active;
  document.getElementById("cUpcoming").textContent = counts.upcoming;
  document.getElementById("cClosed").textContent = counts.closed;
  document.getElementById("cPublished").textContent = counts.published;

  const cats = [...new Set(els.map((e) => e.category))].sort();
  const catSel = document.getElementById("categoryFilter");
  catSel.innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option value="${UI.esc(c)}">${UI.esc(c)}</option>`).join("");

  function render() {
    const list = els.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (category && e.category !== category) return false;
      if (query && !(e.title + " " + e.description + " " + e.category).toLowerCase().includes(query)) return false;
      return true;
    });
    const grid = document.getElementById("electionsGrid");
    grid.innerHTML = list.length ? list.map(UI.electionCard).join("")
      : UI.emptyState("No elections match", "Try a different status, category or search term.", "search-x");
    UI.icons();
  }

  document.querySelectorAll("#statusFilter button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#statusFilter button").forEach((x) => x.classList.remove("is-on"));
      b.classList.add("is-on");
      filter = b.dataset.filter;
      render();
    })
  );
  document.getElementById("searchInput").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  catSel.addEventListener("change", (e) => { category = e.target.value; render(); });

  render();
})();
