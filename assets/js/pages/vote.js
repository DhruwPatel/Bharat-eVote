/* Voting interface — distraction-free ballot */
(async function () {
  await DB.init();
  await UI.mount("vote");

  const shell = document.getElementById("ballotShell");
  const bar = document.getElementById("voteBar");
  const params = new URLSearchParams(location.search);
  const electionId = params.get("id");
  const user = DB.user();

  if (!user) {
    shell.innerHTML = `<div class="card success-card">
      <div class="success-mark"><i data-lucide="lock" class="icon"></i></div>
      <h1>Sign in to vote</h1>
      <p>Your ballot must be tied to a verified account — while keeping your choice completely anonymous.</p>
      <div class="row gap-12" style="justify-content:center;margin-top:22px">
        <a class="btn btn-primary" href="login.html">Sign in</a>
        <a class="btn btn-outline" href="login.html#register">Create account</a>
      </div></div>`;
    UI.icons();
    return;
  }

  const els = await DB.elections();
  const activeEls = els.filter((e) => e.status === "active");

  /* Election chooser when no id supplied */
  if (!electionId) {
    shell.innerHTML = `<div class="page-head" style="margin-bottom:20px">
        <div><span class="eyebrow">Voting booth</span><h1 style="margin-top:8px">Choose an election to vote in</h1>
        <p class="lede">Only elections inside their voting window accept ballots.</p></div>
        <a class="btn btn-outline" href="elections.html">All elections</a>
      </div>
      <div class="election-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        ${activeEls.length ? activeEls.map(UI.electionCard).join("") : UI.emptyState("No elections are open", "Check back when an election opens, or browse upcoming elections.", "calendar-clock")}
      </div>`;
    UI.icons();
    return;
  }

  let election;
  try {
    election = await DB.election(electionId);
  } catch (err) {
    shell.innerHTML = `<div class="card success-card"><h1>Election unavailable</h1><p>${UI.esc(err.message)}</p>
      <a class="btn btn-primary mt-24" href="elections.html">Browse elections</a></div>`;
    return;
  }

  const already = await DB.hasVoted(election.id);
  const receipt = (await DB.myParticipation()).find((p) => p.electionId === election.id);
  const canVote = await DB.canVote(election);
  const open = election.status === "active";

  const statusLine = `<div class="row gap-12 wrap">
      <span class="badge badge-${election.status === "active" ? "active" : election.status === "upcoming" ? "upcoming" : election.status === "published" ? "published" : "closed"}">${UI.esc(
        election.status === "active" ? "Voting open" : election.status === "upcoming" ? "Opens " + UI.fmtDate(election.startsAt) : election.status === "published" ? "Results published" : "Voting closed"
      )}</span>
      <span class="small muted">${election.category}</span>
    </div>`;

  /* Already voted → confirmation screen */
  if (already) {
    shell.innerHTML = `<div class="card success-card">
      <div class="success-mark"><i data-lucide="check-circle-2" class="icon"></i></div>
      <h1>Your vote is already recorded</h1>
      <p>You have voted in <b>${UI.esc(election.title)}</b>. Only one ballot is accepted per voter, and your selection is never shown to administrators or on your activity feed.</p>
      ${receipt ? `<div class="receipt"><i data-lucide="ticket" class="icon icon-sm"></i>${UI.esc(receipt.receipt)}</div>` : ""}
      <div class="row gap-12" style="justify-content:center;margin-top:26px;flex-wrap:wrap">
        <a class="btn btn-outline" href="dashboard.html">Back to dashboard</a>
        <a class="btn btn-primary" href="${election.status === "published" ? `results.html?id=${election.id}` : "results.html"}">
          ${election.status === "published" ? "View results" : "Explore results"}</a>
      </div>
      ${open ? `<p class="small muted mt-24">Voting remains open until ${UI.fmtDT(election.endsAt)}. Results appear after publication.</p>` : ""}
    </div>`;
    UI.icons();
    return;
  }

  /* Ballot */
  shell.innerHTML = `
    <div class="card ballot-head-card">
      <div class="row between wrap gap-12">${statusLine}
        <span class="chip"><i data-lucide="clock" class="icon icon-sm"></i>
          ${open ? `Closes in ${UI.countdown(election.endsAt)}` : election.status === "upcoming" ? `Opens in ${UI.countdown(election.startsAt)}` : `Closed ${UI.fmtShort(election.endsAt)}`}</span>
      </div>
      <h1>${UI.esc(election.title)}</h1>
      <p>${UI.esc(election.description)}</p>
      <div class="ec-meta mt-16">
        <span><i data-lucide="calendar-days"></i>${UI.fmtDate(election.startsAt)} – ${UI.fmtDate(election.endsAt)}</span>
        <span><i data-lucide="users"></i>${election.candidateCount} candidates</span>
        <span><i data-lucide="shield-check"></i>${UI.num(election.eligible)} eligible voters</span>
      </div>
      <div class="instruction-box">
        <i data-lucide="${open ? "info" : "lock"}" class="icon"></i>
        <div>${open
          ? `${UI.esc(window.t("vote.instructions"))}`
          : `<b>This election is not accepting ballots.</b> ${election.status === "upcoming"
              ? `Voting opens ${UI.fmtDT(election.startsAt)}. You can review candidates now.`
              : election.status === "published"
                ? "Voting has closed and results are published."
                : "Voting has closed. Results will be available once the administrator publishes them."}`}</div>
      </div>
      ${!canVote.ok && canVote.reason === "unverified" ? `<div class="demo-banner" style="margin-top:14px">
          <i data-lucide="shield-alert" class="icon"></i>
          <span><b>Verification required.</b> Your account must be verified before a ballot is accepted. <a href="dashboard.html#profile" style="text-decoration:underline">Manage verification</a></span>
        </div>` : ""}
      ${!canVote.ok && canVote.reason === "suspended" ? `<div class="demo-banner" style="margin-top:14px">
          <i data-lucide="ban" class="icon"></i><span><b>Account suspended.</b> Contact the election administrator to restore voting access.</span>
        </div>` : ""}
    </div>

    <div class="row between mt-24" style="margin-bottom:4px">
      <h2 style="font-size:16px">${UI.esc(window.t("vote.choose"))}</h2>
      <span class="small muted">${election.candidateCount} candidates</span>
    </div>
    <div class="ballot-list" id="ballotList" role="radiogroup" aria-label="Candidates">
      ${election.candidates.map((c) => `
        <label class="ballot-card ${open && canVote.ok ? "" : "is-disabled"}" data-cand="${c.id}" style="${open && canVote.ok ? "" : "cursor:default"}">
          <input type="radio" name="candidate" value="${c.id}" ${open && canVote.ok ? "" : "disabled"}>
          <span class="ballot-photo" style="background:linear-gradient(140deg, ${c.color}, #1d3557)">
            ${c.photoUrl ? `<img src="${UI.esc(c.photoUrl)}" alt="">` : UI.initials(c.name)}
          </span>
          <div class="ballot-info">
            <div class="role">${UI.esc(c.party)}</div>
            <h3>${UI.esc(c.name)}</h3>
            <p class="manifesto is-clamped" id="m_${c.id}">${UI.esc(c.manifesto)}</p>
            <button type="button" class="link-btn" data-expand="${c.id}">${UI.esc(window.t("vote.readManifesto"))}</button>
          </div>
          <span class="radio-mark" aria-hidden="true"></span>
        </label>`).join("")}
    </div>
    <p class="small muted mt-16" style="max-width:620px">Your ballot is stored with the election and candidate only. A separate participation record confirms you voted, without storing your choice.</p>
  `;
  UI.icons();

  const list = document.getElementById("ballotList");
  list.querySelectorAll("[data-expand]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = document.getElementById("m_" + btn.dataset.expand);
      const clamped = p.classList.toggle("is-clamped");
      btn.textContent = clamped ? window.t("vote.readManifesto") : window.t("vote.hideManifesto");
    });
  });

  if (open && canVote.ok) {
    bar.hidden = false;
    let selected = null;
    const reviewBtn = document.getElementById("reviewBtn");
    list.querySelectorAll(".ballot-card").forEach((card) => {
      card.addEventListener("click", () => {
        list.querySelectorAll(".ballot-card").forEach((c) => c.classList.remove("is-selected"));
        card.classList.add("is-selected");
        card.querySelector("input").checked = true;
        selected = election.candidates.find((c) => c.id === card.dataset.cand);
        document.getElementById("selectedName").textContent = selected.name;
        reviewBtn.disabled = false;
      });
    });

    reviewBtn.addEventListener("click", async () => {
      if (!selected) return;
      const ok = await UI.modal({
        title: window.t("vote.confirmTitle"),
        desc: window.t("vote.confirmBody"),
        body: `<div class="row gap-16" style="align-items:center;padding:6px 0 14px">
            <span class="ballot-photo" style="width:56px;height:56px;border-radius:12px;font-size:17px;background:linear-gradient(140deg, ${selected.color}, #1d3557)">
              ${selected.photoUrl ? `<img src="${UI.esc(selected.photoUrl)}" alt="">` : UI.initials(selected.name)}</span>
            <div><div class="strong" style="font-size:15px">${UI.esc(selected.name)}</div>
              <div class="small muted">${UI.esc(selected.party)}</div></div>
          </div>
          <div class="locked-note"><i data-lucide="alert-triangle" class="icon"></i><div>${UI.esc(window.t("vote.confirmNote"))}</div></div>`,
        confirmText: window.t("vote.confirm"),
        cancelText: "Go back"
      });
      if (!ok) return;
      try {
        const res = await DB.castVote(election.id, selected.id);
        shell.innerHTML = `<div class="card success-card">
          <div class="success-mark"><i data-lucide="check-circle-2" class="icon"></i></div>
          <h1>${UI.esc(window.t("vote.successTitle"))}</h1>
          <p>${UI.esc(window.t("vote.successBody"))}</p>
          <div class="receipt"><i data-lucide="ticket" class="icon icon-sm"></i>${UI.esc(res.receipt)}</div>
          <p class="small muted mt-16">Keep this receipt for your records. It proves participation without revealing your selection.</p>
          <div class="row gap-12" style="justify-content:center;margin-top:26px;flex-wrap:wrap">
            <a class="btn btn-primary" href="dashboard.html">Back to dashboard</a>
            <a class="btn btn-outline" href="results.html">Results</a>
          </div>
        </div>`;
        bar.hidden = true;
        UI.icons();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        UI.toast(err.message, "error");
      }
    });
  }
})();
