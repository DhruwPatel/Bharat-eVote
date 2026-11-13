/* Admin — election, candidate and voter management */
window.AdminViews = window.AdminViews || {};

(function () {
  const V = window.AdminViews;
  const esc = (s) => UI.esc(s);
  const dtLocal = (iso) => {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const inp = (d) => new Date(d).toISOString();
  const fmtAction = (a) => Admin.labelAction(a);

  async function actionButtons(el) {
    el.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const election = Admin.state.elections.find((e) => e.id === id);
      try {
        if (act === "edit") return V.electionForm(election);
        if (act === "delete") {
          const ok = await UI.modal({
            title: "Delete draft election", danger: true, confirmText: "Delete draft",
            desc: "This permanently removes the draft and its candidates.",
            body: `<p class="small muted">Only draft elections can be deleted. Elections with recorded ballots are never removed.</p>`,
            onConfirm: async () => { await DB.deleteElection(id); }
          });
          if (ok) { UI.toast("Draft deleted"); await Admin.refresh(); Admin.go("elections"); }
          return;
        }
        if (act === "activate") {
          const ok = await UI.modal({
            title: "Open this election for voting?", confirmText: "Activate election",
            desc: election.title,
            body: `<p class="small muted">Voters will be able to cast a ballot immediately. You can close voting at any time.</p>`,
            onConfirm: async () => { await DB.setElectionStatus(id, "active"); }
          });
          if (ok) { UI.toast("Election activated"); await Admin.refresh(); Admin.go("elections"); }
          return;
        }
        if (act === "close") {
          const ok = await UI.modal({
            title: "Close voting?", danger: true, confirmText: "Close election",
            desc: election.title,
            body: `<p class="small muted">No further ballots will be accepted once voting is closed. Results can then be published.</p>`,
            onConfirm: async () => { await DB.setElectionStatus(id, "closed"); }
          });
          if (ok) { UI.toast("Voting closed"); await Admin.refresh(); Admin.go("elections"); }
          return;
        }
        if (act === "publish") {
          const ok = await UI.modal({
            title: "Publish official results?", confirmText: "Publish results",
            desc: election.title,
            body: `<p class="small muted">Candidate-wise results, turnout and the winner will become publicly visible on the results page. This action is recorded in the audit log.</p>`,
            onConfirm: async () => { await DB.setElectionStatus(id, "published"); }
          });
          if (ok) { UI.toast("Results published"); await Admin.refresh(); Admin.go("elections"); }
          return;
        }
        if (act === "view") return (location.href = `results.html?id=${id}`);
      } catch (err) { UI.toast(err.message, "error"); }
    });
  }

  /* ---------------- elections ---------------- */
  V.elections = async function (box, ctx) {
    await ctx.refresh();
    const cats = await DB.categories();
    let filter = "all";
    let query = "";

    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.manageTitle"))}</h1><p>Create elections, configure eligibility and control the voting window.</p></div>
        <div class="row gap-10 wrap">
          <button class="btn btn-outline btn-sm" id="exportAll"><i data-lucide="download" class="icon icon-sm"></i> Export list</button>
          <button class="btn btn-primary btn-sm" id="newEl"><i data-lucide="plus" class="icon icon-sm"></i> ${esc(window.t("admin.newElection"))}</button>
        </div>
      </div>
      <div class="card">
        <div class="table-tools">
          <div class="input-icon"><i data-lucide="search" class="icon"></i>
            <input class="input" id="elSearch" placeholder="Search elections" aria-label="Search elections"></div>
          <select class="select" id="elStatus" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option><option value="upcoming">Upcoming</option>
            <option value="active">Active</option><option value="closed">Closed</option><option value="published">Published</option>
          </select>
          <select class="select" id="elCat" aria-label="Filter by category">
            <option value="">All categories</option>
            ${cats.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}
          </select>
          <span class="small muted" id="elCount" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap" id="elTable"></div>
      </div>`;
    UI.icons();

    function rows() {
      const list = Admin.state.elections.filter((e) => {
        if (filter !== "all" && e.status !== filter) return false;
        if (document.getElementById("elCat").value && e.category !== document.getElementById("elCat").value) return false;
        if (query && !(e.title + e.category).toLowerCase().includes(query)) return false;
        return true;
      });
      document.getElementById("elCount").textContent = `${list.length} of ${Admin.state.elections.length} elections`;
      document.getElementById("elTable").innerHTML = list.length ? `
        <table class="data">
          <thead><tr><th>Election</th><th>Status</th><th>Voting window</th><th class="num">Candidates</th><th class="num">Votes</th><th>Turnout</th><th class="num">Actions</th></tr></thead>
          <tbody>${list.map((e) => `<tr>
            <td><div class="name" style="font-weight:600;color:var(--ink)">${esc(e.title)}</div>
              <div class="small muted">${esc(e.category)} · ${UI.num(e.eligible)} eligible</div></td>
            <td>${UI.statusBadge(UI.effectiveStatus(e))}</td>
            <td class="small muted">${UI.fmtShort(e.startsAt)} – ${UI.fmtShort(e.endsAt)}<br>${new Date(e.startsAt).getFullYear()}</td>
            <td class="num">${e.candidateCount}</td>
            <td class="num">${UI.num(e.votesCast)}</td>
            <td style="min-width:110px"><div class="progress-row" style="margin-bottom:4px"><span>${e.participation}%</span></div>
              <div class="progress"><i style="width:${Math.min(e.participation, 100)}%"></i></div></td>
            <td class="num"><div class="row gap-6" style="justify-content:flex-end;flex-wrap:wrap">
              ${["draft", "upcoming", "active"].includes(e.status) ? `<button class="btn btn-ghost btn-sm" data-act="edit" data-id="${e.id}">Edit</button>` : ""}
              ${["draft", "upcoming"].includes(e.status) ? `<button class="btn btn-outline btn-sm" data-act="activate" data-id="${e.id}">Activate</button>` : ""}
              ${e.status === "active" ? `<button class="btn btn-outline btn-sm" data-act="close" data-id="${e.id}">Close</button>` : ""}
              ${e.status === "closed" ? `<button class="btn btn-accent btn-sm" data-act="publish" data-id="${e.id}">Publish</button>` : ""}
              ${e.status === "published" ? `<button class="btn btn-ghost btn-sm" data-act="view" data-id="${e.id}">Results</button>` : ""}
              ${e.status === "draft" ? `<button class="btn btn-ghost btn-sm" data-act="delete" data-id="${e.id}" style="color:#b42318">Delete</button>` : ""}
            </div></td>
          </tr>`).join("")}</tbody>
        </table>` : UI.emptyState("No elections match", "Adjust the filters or create a new election.", "calendar-x");
      UI.icons();
      actionButtons(document.getElementById("elTable"));
    }

    document.getElementById("newEl").addEventListener("click", () => V.electionForm());
    document.getElementById("elSearch").addEventListener("input", (e) => { query = e.target.value.toLowerCase(); rows(); });
    document.getElementById("elStatus").addEventListener("change", (e) => { filter = e.target.value; rows(); });
    document.getElementById("elCat").addEventListener("change", rows);
    document.getElementById("exportAll").addEventListener("click", () => {
      const lines = [["Election", "Category", "Status", "Starts", "Ends", "Candidates", "Votes", "Turnout %"].join(",")]
        .concat(Admin.state.elections.map((e) => [
          `"${e.title.replace(/"/g, '""')}"`, `"${e.category}"`, e.status,
          UI.fmtDate(e.startsAt), UI.fmtDate(e.endsAt), e.candidateCount, e.votesCast, e.participation
        ].join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bharat-evote-elections.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast("Election list exported");
    });

    rows();
  };

  V.newElectionForm = () => V.electionForm();

  V.electionForm = async function (election) {
    const cats = await DB.categories();
    const e = election || null;
    const start = e ? dtLocal(e.startsAt) : dtLocal(new Date(Date.now() + 86400000));
    const end = e ? dtLocal(e.endsAt) : dtLocal(new Date(Date.now() + 7 * 86400000));
    UI.modal({
      title: e ? "Edit election" : "Create election",
      desc: "Configure the schedule and eligibility. New elections start as drafts.",
      wide: true,
      confirmText: e ? "Save changes" : "Create draft",
      body: `<div class="stack gap-16">
        <div class="field"><label class="label" for="fTitle">Election title</label>
          <input class="input" id="fTitle" maxlength="120" value="${e ? esc(e.title) : ""}" placeholder="e.g. Residents Welfare Association 2026"></div>
        <div class="field"><label class="label" for="fDesc">Description</label>
          <textarea class="textarea" id="fDesc" maxlength="600" placeholder="What this election decides">${e ? esc(e.description) : ""}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label class="label" for="fCat">Category</label>
            <select class="select" id="fCat">${cats.map((c) => `<option ${e && e.category === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
          <div class="field"><label class="label" for="fEligible">Eligible voters</label>
            <input class="input" id="fEligible" type="number" min="1" value="${e ? e.eligible : 500}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label class="label" for="fStart">Voting opens</label>
            <input class="input" id="fStart" type="datetime-local" value="${start}"></div>
          <div class="field"><label class="label" for="fEnd">Voting closes</label>
            <input class="input" id="fEnd" type="datetime-local" value="${end}"></div>
        </div>
        <div class="locked-note"><i data-lucide="info" class="icon"></i>
          <div>Eligibility is enforced per election. Adding candidates is required before an election can be activated.</div></div>
      </div>`,
      onConfirm: async (root) => {
        const title = root.querySelector("#fTitle").value.trim();
        const description = root.querySelector("#fDesc").value.trim();
        const startsAt = root.querySelector("#fStart").value;
        const endsAt = root.querySelector("#fEnd").value;
        if (title.length < 4) { UI.toast("Enter an election title", "error"); return false; }
        if (description.length < 10) { UI.toast("Add a short description", "error"); return false; }
        if (!startsAt || !endsAt) { UI.toast("Set both dates", "error"); return false; }
        if (new Date(endsAt) <= new Date(startsAt)) { UI.toast("Closing date must be after the opening date", "error"); return false; }
        await DB.saveElection({
          id: e ? e.id : undefined, title, description,
          category: root.querySelector("#fCat").value,
          eligible: Number(root.querySelector("#fEligible").value),
          startsAt: inp(startsAt), endsAt: inp(endsAt)
        });
        UI.toast(e ? "Election updated" : "Draft election created");
        await Admin.refresh();
        Admin.go("elections");
      }
    });
  };

  /* ---------------- candidates ---------------- */
  V.candidates = async function (box, ctx) {
    await ctx.refresh();
    const elections = Admin.state.elections.filter((e) => e.status !== "archived");
    const preset = elections.find((e) => e.id === ctx.state.candidateFilter)
      || elections.find((e) => e.status === "active")
      || elections.find((e) => e.candidateCount > 0)
      || elections[0];
    let filter = preset ? preset.id : "";

    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.candidatesTitle"))}</h1><p>Photographs, affiliations and manifestos for every candidate.</p></div>
        <div class="row gap-16 wrap" style="gap:20px">
          <select class="select" id="candElection" style="min-width:200px;max-width:320px;flex:1 1 auto" aria-label="Filter by election">
            ${elections.map((e) => `<option value="${e.id}" ${e.id === filter ? "selected" : ""}>${esc(e.title)}</option>`).join("")}
          </select>
          <button class="btn btn-primary btn-sm" id="addCand"><i data-lucide="user-plus" class="icon icon-sm"></i> Add candidate</button>
        </div>
      </div>
      <div class="grid-3" id="candGrid"></div>`;
    UI.icons();

    async function render() {
      const grid = document.getElementById("candGrid");
      if (!filter) { grid.innerHTML = `<div class="card card-pad">${UI.emptyState("No elections yet", "Create an election first, then add candidates.", "calendar-plus")}</div>`; UI.icons(); return; }
      const candidates = await DB.election(filter).then((e) => e.candidates).catch(() => []);
      grid.innerHTML = candidates.length ? candidates.map((c) => `
        <article class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
          <div class="row between">
            <span class="ballot-photo" style="width:52px;height:52px;border-radius:13px;font-size:16px;background:linear-gradient(140deg, ${c.color || "#33507a"}, #1d3557)">
              ${c.photoUrl ? `<img src="${esc(c.photoUrl)}" alt="">` : UI.initials(c.name)}</span>
            <div class="row gap-6">
              <button class="btn-icon" data-edit="${c.id}" aria-label="Edit ${esc(c.name)}"><i data-lucide="pencil" class="icon icon-sm"></i></button>
              <button class="btn-icon" data-del="${c.id}" aria-label="Remove ${esc(c.name)}" style="color:#b42318"><i data-lucide="trash-2" class="icon icon-sm"></i></button>
            </div>
          </div>
          <div><h4 style="font-size:14.5px">${esc(c.name)}</h4><span class="small muted">${esc(c.party)}</span></div>
          <p class="small muted clamp-3" style="min-height:54px">${esc(c.manifesto)}</p>
        </article>`).join("")
        : `<div class="card card-pad" style="grid-column:1/-1">${UI.emptyState("No candidates yet", "Add at least two candidates before activating this election.", "users")}</div>`;
      UI.icons();

      grid.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
        const el = await DB.election(filter);
        V.candidateForm(el.candidates.find((c) => c.id === b.dataset.edit), filter);
      }));
      grid.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        const ok = await UI.confirm({
          title: "Remove candidate", danger: true, confirmText: "Remove",
          desc: "Candidate profiles can be removed only while voting is not open.",
          body: `<p class="small muted">Existing ballots referencing this candidate remain part of the recorded tally.</p>`,
          onConfirm: async () => { await DB.deleteCandidate(b.dataset.del); }
        });
        if (ok) { UI.toast("Candidate removed"); Admin.go("candidates"); }
      }));
    }

    document.getElementById("candElection").addEventListener("change", (e) => {
      filter = e.target.value;
      Admin.state.candidateFilter = filter;
      render();
    });
    document.getElementById("addCand").addEventListener("click", () => V.candidateForm(null, filter));
    render();
  };

  V.candidateForm = async function (candidate, electionId) {
    const elections = Admin.state.elections;
    let photo = candidate ? candidate.photoUrl : null;
    UI.modal({
      title: candidate ? "Edit candidate" : "Add candidate",
      desc: "Candidate photos and manifestos are shown on the ballot.",
      wide: true,
      confirmText: candidate ? "Save candidate" : "Add candidate",
      body: `<div class="stack gap-16">
        <div class="field"><label class="label" for="cEl">Election</label>
          <select class="select" id="cEl">${elections.map((e) => `<option value="${e.id}" ${(candidate ? candidate.electionId : electionId) === e.id ? "selected" : ""}>${esc(e.title)}</option>`).join("")}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label class="label" for="cName">Candidate name</label>
            <input class="input" id="cName" value="${candidate ? esc(candidate.name) : ""}" placeholder="Full name"></div>
          <div class="field"><label class="label" for="cParty">Affiliation / panel</label>
            <input class="input" id="cParty" value="${candidate ? esc(candidate.party) : ""}" placeholder="Independent"></div>
        </div>
        <div class="field"><label class="label" for="cManifesto">Manifesto</label>
          <textarea class="textarea" id="cManifesto" rows="5" placeholder="Key commitments and priorities">${candidate ? esc(candidate.manifesto) : ""}</textarea></div>
        <div class="field"><label class="label">Photograph <span class="muted" style="font-weight:500">(optional · PNG, JPG or WebP up to 2 MB)</span></label>
          <div class="row gap-12">
            <span class="avatar avatar-lg" id="cPreview" style="border-radius:12px">${candidate ? UI.initials(candidate.name) : "?"}</span>
            <input class="input" id="cPhoto" type="file" accept="image/png,image/jpeg,image/webp" style="padding-top:9px">
          </div>
        </div>
        <p class="hint">Photos are stored in Supabase Storage with public read access; uploads are validated for type and size.</p>
      </div>`,
      onConfirm: async (root) => {
        const name = root.querySelector("#cName").value.trim();
        const manifesto = root.querySelector("#cManifesto").value.trim();
        if (name.length < 3) { UI.toast("Enter the candidate name", "error"); return false; }
        if (manifesto.length < 20) { UI.toast("Add a manifesto of at least 20 characters", "error"); return false; }
        const file = root.querySelector("#cPhoto").files[0];
        if (file) photo = await DB.uploadCandidatePhoto(file);
        await DB.saveCandidate({
          id: candidate ? candidate.id : undefined,
          electionId: root.querySelector("#cEl").value,
          name, party: root.querySelector("#cParty").value.trim() || "Independent",
          manifesto, photoUrl: photo
        });
        UI.toast(candidate ? "Candidate updated" : "Candidate added");
        Admin.state.candidateFilter = root.querySelector("#cEl").value;
        Admin.go("candidates");
      }
    });
    const fileInput = document.getElementById("cPhoto");
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      document.getElementById("cPreview").innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
    });
  };

  /* ---------------- voters ---------------- */
  V.voters = async function (box, ctx) {
    await ctx.refresh();
    const voters = await DB.voters();
    let query = Admin.state.voterQuery || "";
    let status = Admin.state.voterStatus || "all";

    box.innerHTML = `
      <div class="admin-title-row">
        <div><h1>${esc(window.t("admin.votersTitle"))}</h1><p>Approve eligibility, review registrations and suspend accounts when necessary.</p></div>
        <div class="row gap-10">
          <span class="chip"><i data-lucide="users" class="icon icon-sm"></i>${UI.num(Admin.state.stats.registeredVoters)} registered</span>
        </div>
      </div>
      <div class="card">
        <div class="table-tools">
          <div class="input-icon"><i data-lucide="search" class="icon"></i>
            <input class="input" id="vSearch" placeholder="Search name or email" aria-label="Search voters"></div>
          <select class="select" id="vStatus" aria-label="Filter by status">
            <option value="all">All statuses</option><option value="verified">Verified</option>
            <option value="pending">Pending</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option>
          </select>
          <span class="small muted" id="vCount" style="margin-left:auto"></span>
        </div>
        <div class="table-wrap" id="vTable"></div>
      </div>
      <p class="small muted mt-16">Showing the most recent accounts. Eligible voter counts per election are configured separately. Ballot choices are never available in this view.</p>`;
    UI.icons();

    function rows() {
      const list = voters.filter((v) => {
        if (status !== "all" && v.status !== status) return false;
        if (query && !(v.name + " " + v.email).toLowerCase().includes(query)) return false;
        return true;
      });
      document.getElementById("vCount").textContent = `${list.length} shown`;
      document.getElementById("vTable").innerHTML = list.length ? `
        <table class="data">
          <thead><tr><th>Voter</th><th>Contact</th><th>Registered</th><th class="num">Ballots</th><th>Status</th><th class="num">Actions</th></tr></thead>
          <tbody>${list.map((v) => `<tr>
            <td><div class="cell-user"><span class="avatar avatar-sm ${v.role === "admin" ? "avatar-green" : ""}">${UI.initials(v.name)}</span>
              <div><div class="name">${esc(v.name)}${v.role === "admin" ? ' <span class="badge badge-published no-dot" style="padding:1px 6px;font-size:9.5px">Admin</span>' : ""}</div>
              <div class="mail">${esc(v.email)}</div></div></div></td>
            <td class="muted small">${esc(v.phone || "—")}</td>
            <td class="muted small">${UI.fmtDate(v.registeredAt)}</td>
            <td class="num">${v.electionsVoted || 0}</td>
            <td><span class="badge ${v.status === "verified" ? "badge-active" : v.status === "pending" ? "badge-warn" : v.status === "suspended" ? "badge-danger" : "badge-closed"}">${esc(v.status)}</span></td>
            <td class="num"><div class="row gap-6" style="justify-content:flex-end;flex-wrap:wrap">
              ${v.status !== "verified" ? `<button class="btn btn-outline btn-sm" data-vact="verified" data-id="${v.id}">Approve</button>` : ""}
              ${v.status !== "suspended" ? `<button class="btn btn-ghost btn-sm" data-vact="suspended" data-id="${v.id}" style="color:#b42318">Suspend</button>` : `<button class="btn btn-outline btn-sm" data-vact="verified" data-id="${v.id}">Restore</button>`}
              ${v.status === "pending" ? `<button class="btn btn-ghost btn-sm" data-vact="rejected" data-id="${v.id}">Reject</button>` : ""}
            </div></td>
          </tr>`).join("")}</tbody>
        </table>` : UI.emptyState("No voters match", "Try a different search or status filter.", "user-x");
      UI.icons();

      document.getElementById("vTable").querySelectorAll("[data-vact]").forEach((b) =>
        b.addEventListener("click", async () => {
          const next = b.dataset.vact;
          const v = voters.find((x) => x.id === b.dataset.id);
          const ok = await UI.confirm({
            title: next === "verified" ? "Approve eligibility" : next === "suspended" ? "Suspend account" : "Reject registration",
            desc: v.name,
            danger: next !== "verified",
            confirmText: next === "verified" ? "Approve voter" : next === "suspended" ? "Suspend" : "Reject",
            body: `<p class="small muted">${next === "verified"
              ? "This voter will be able to cast ballots in open elections."
              : next === "suspended" ? "Voting access is revoked immediately. Existing ballots remain anonymous and counted."
                : "The registration is marked ineligible. The account is retained for the audit trail."}</p>`,
            onConfirm: async () => { await DB.setVoterStatus(v.id, next); }
          });
          if (ok) { UI.toast("Voter status updated"); Admin.go("voters"); }
        })
      );
    }

    // Restore filters after an action re-renders the view.
    document.getElementById("vSearch").value = Admin.state.voterQueryRaw || "";
    document.getElementById("vStatus").value = status;

    document.getElementById("vSearch").addEventListener("input", (e) => {
      Admin.state.voterQueryRaw = e.target.value;
      Admin.state.voterQuery = e.target.value.toLowerCase();
      query = Admin.state.voterQuery;
      rows();
    });
    document.getElementById("vStatus").addEventListener("change", (e) => {
      Admin.state.voterStatus = e.target.value;
      status = e.target.value;
      rows();
    });
    rows();
  };
})();
