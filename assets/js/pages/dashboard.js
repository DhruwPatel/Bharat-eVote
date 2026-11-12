/* Voter dashboard */
(async function () {
  await DB.init();
  if (!DB.user()) { location.href = "login.html?next=dashboard.html"; return; }
  await UI.mount("dashboard");

  const user = DB.user();
  const els = await DB.elections();
  const activity = await DB.activity();
  const participation = await DB.myParticipation();

  document.getElementById("todayLabel").textContent = UI.fmtLongDate(new Date());
  document.getElementById("welcomeTitle").textContent = `Welcome back, ${user.name.split(" ")[0]}`;
  document.getElementById("welcomeLede").textContent = user.role === "admin"
    ? "You are signed in as an administrator. Open the admin panel to manage elections."
    : "Your voice shapes the outcome. Here is what is happening across your elections today.";
  if (DB.isDemo) document.getElementById("demoBanner").hidden = false;

  const active = els.filter((e) => e.status === "active");
  const upcoming = els.filter((e) => e.status === "upcoming");
  const published = els.filter((e) => e.status === "published");
  const available = active.filter((e) => !e.hasVoted);

  document.getElementById("statAvailable").textContent = available.length;
  document.getElementById("statActive").textContent = active.length;
  document.getElementById("statParticipated").textContent = participation.length;
  document.getElementById("statPublished").textContent = published.length;
  document.getElementById("statAvailableFoot").textContent = available.length
    ? `${UI.num(available.reduce((s, e) => s + e.eligible, 0))} eligible voters across open elections`
    : "No open election needs your vote";

  /* verification */
  if (!user.verified) {
    const banner = document.getElementById("verifyBanner");
    banner.hidden = false;
    document.getElementById("verifyBtn").addEventListener("click", async () => {
      try {
        await DB.verifySelf();
        UI.toast("Verification completed");
        setTimeout(() => location.reload(), 500);
      } catch (e) { UI.toast(e.message, "error"); }
    });
  }

  /* available elections */
  const availBox = document.getElementById("availableElections");
  availBox.innerHTML = available.length
    ? available.slice(0, 2).map(UI.electionCard).join("")
    : UI.emptyState("You are all caught up", active.length ? "You have voted in every open election." : "No elections are open for you right now.", "check-circle-2");
  UI.icons();

  /* participation doughnut */
  const eligibleCount = els.filter((e) => ["active", "closed", "published"].includes(e.status)).length;
  const votedCount = participation.length;
  const canvas = document.getElementById("participationChart");
  if (UI.charts.hasChart()) {
    UI.charts.doughnut(canvas, ["Votes cast", "Yet to vote"], [votedCount, Math.max(eligibleCount - votedCount, 0)], {
      colors: ["#0d8a4f", "#eef1f5"],
      center: [String(votedCount), "ballots cast"]
    });
    const total = Math.max(eligibleCount, 1);
    document.getElementById("participationLegend").innerHTML = `
      <div class="legend-row"><span class="dot" style="background:#0d8a4f"></span><span class="name">Elections you voted in</span><span class="val">${votedCount}</span></div>
      <div class="legend-row"><span class="dot" style="background:#eef1f5"></span><span class="name">Elections awaiting your vote</span><span class="val">${Math.max(eligibleCount - votedCount, 0)}</span></div>
      <div class="legend-row" style="border-top:1px solid var(--line);padding-top:11px"><span class="name">Overall participation</span><span class="val">${Math.round((votedCount / total) * 100)}%</span></div>`;
  }

  const list = document.getElementById("participationList");
  const recent = els.filter((e) => ["published", "active", "closed"].includes(e.status)).slice(0, 3);
  list.innerHTML = recent.length
    ? `<div class="progress-row"><span class="strong" style="color:var(--ink)">Platform turnout overview</span></div>` +
      recent.map((e) => `<div style="margin-bottom:14px">
        <div class="progress-row"><span class="truncate">${UI.esc(e.title)}</span><span>${e.participation}%</span></div>
        <div class="progress"><i style="width:${Math.min(e.participation, 100)}%"></i></div>
      </div>`).join("")
    : `<p class="small muted">Participation appears once elections begin.</p>`;

  /* activity */
  const icons = { registration: "user-plus", verification: "shield-check", vote: "check-circle-2", results: "bar-chart-3" };
  document.getElementById("activityFeed").innerHTML = activity.length
    ? activity.slice(0, 6).map((a) => `<div class="feed-item">
        <span class="feed-icon"><i data-lucide="${icons[a.type] || "activity"}" class="icon icon-sm"></i></span>
        <div class="feed-body"><p>${UI.esc(a.text)}</p><span>${UI.fmtDT(a.at)}</span></div>
        <span class="feed-time">${UI.relTime(a.at)}</span>
      </div>`).join("")
    : UI.emptyState("No activity yet", "Registration, verification and ballot events appear here.", "activity");

  /* upcoming */
  document.getElementById("upcomingList").innerHTML = upcoming.length
    ? upcoming.slice(0, 3).map((e) => {
        const d = new Date(e.startsAt);
        return `<div class="upcoming-item">
          <div class="upcoming-date"><div><b>${d.getDate()}</b><span>${d.toLocaleDateString("en-GB", { month: "short" })}</span></div></div>
          <div style="min-width:0">
            <a href="vote.html?id=${e.id}" class="strong small truncate" style="display:block;color:var(--ink)">${UI.esc(e.title)}</a>
            <span class="small muted">${UI.num(e.eligible)} eligible · ${e.candidateCount} candidates</span>
          </div>
          <span class="countdown">${UI.countdown(e.startsAt)}</span>
        </div>`;
      }).join("")
    : UI.emptyState("Nothing scheduled", "New elections will appear here with a countdown.", "calendar-clock");

  /* profile */
  document.getElementById("profileAvatar").textContent = UI.initials(user.name);
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("profileBadges").innerHTML =
    `<span class="badge ${user.verified ? "badge-active" : "badge-warn"}">${user.verified ? "Eligibility verified" : "Verification pending"}</span>
     <span class="badge badge-closed no-dot" style="text-transform:capitalize">${UI.esc(user.role)}</span>
     ${user.status === "suspended" ? '<span class="badge badge-danger">Suspended</span>' : ""}`;
  document.getElementById("profileMeta").innerHTML = `
    <div><span class="muted" style="display:block;font-size:11px">Contact number</span><span class="strong">${UI.esc(user.phone || "Not provided")}</span></div>
    <div><span class="muted" style="display:block;font-size:11px">Member since</span><span class="strong">${UI.fmtDate(user.registeredAt)}</span></div>
    <div><span class="muted" style="display:block;font-size:11px">Ballots accepted</span><span class="strong">${participation.length}</span></div>`;
  UI.icons();

  document.getElementById("editProfileBtn").addEventListener("click", () => {
    UI.modal({
      title: "Edit profile",
      desc: "Your name and contact number are used for eligibility checks only.",
      body: `<div class="stack gap-16">
        <div class="field"><label class="label" for="epName">Full name</label>
          <input class="input" id="epName" value="${UI.esc(user.name)}"></div>
        <div class="field"><label class="label" for="epPhone">Contact number</label>
          <input class="input" id="epPhone" value="${UI.esc(user.phone || "")}" placeholder="+91 98765 43210"></div>
      </div>`,
      confirmText: "Save changes",
      onConfirm: async (root) => {
        const name = root.querySelector("#epName").value.trim();
        if (name.length < 3) { UI.toast("Enter a valid name", "error"); return false; }
        await DB.updateProfile({ name, phone: root.querySelector("#epPhone").value.trim() });
        UI.toast("Profile updated");
        setTimeout(() => location.reload(), 400);
      }
    });
  });
})();
