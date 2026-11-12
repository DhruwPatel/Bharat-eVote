/* ============================================================
   Bharat eVote — data layer
   ------------------------------------------------------------
   Two interchangeable adapters behind one API:
     • demo   → localStorage, seeded sample data (default)
     • supabase → PostgreSQL + Auth + Edge Functions (remote.js)

   Security notes for the demo adapter: it is a local prototype
   store, not a security boundary. Real enforcement (RLS, one
   vote per voter, anonymity) lives in supabase/schema.sql and the
   Edge Functions. Ballots never carry a voter id in either adapter.
   ============================================================ */
window.DB = (function () {
  const CFG = window.APP_CONFIG || {};
  const REMOTE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.REMOTE_DB);
  const KEY = "bhvote.demo.v" + (window.DEMO_DATA ? window.DEMO_DATA.version : 1);
  const SESSION = "bhvote.session";
  const DAY = 86400000;

  let S = null;
  let me = null;
  const Local = {};

  /* ---------------- helpers ---------------- */
  const iso = (d) => new Date(d).toISOString();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, phone: u.phone || "", role: u.role, verified: !!u.verified, status: u.status, registeredAt: u.registeredAt } : null);

  function hashChain(entry, prev) {
    const s = JSON.stringify({ ...entry, prevHash: prev });
    let h1 = 0x811c9dc5, h2 = 0xc2b2ae35;
    for (let i = 0; i < s.length; i++) {
      h1 = (h1 ^ s.charCodeAt(i)) * 16777619 >>> 0;
      h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
  }

  function persist() { localStorage.setItem(KEY, JSON.stringify(S)); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === (window.DEMO_DATA ? window.DEMO_DATA.version : 1)) return parsed;
      }
    } catch (_) { /* corrupt store → reseed */ }
    const fresh = clone(window.DEMO_DATA);
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  }

  function requireAdmin() {
    if (!me || me.role !== "admin") throw new Error("Administrator access required.");
  }
  function findElection(id) {
    const e = S.elections.find((x) => x.id === id);
    if (!e) throw new Error("Election not found.");
    return e;
  }
  const candsFor = (id) => S.candidates.filter((c) => c.electionId === id);

  function effectiveStatus(e) {
    const t = Date.now();
    if (e.status === "active" && new Date(e.endsAt).getTime() < t) return "closed";
    if (e.status === "upcoming" && new Date(e.startsAt).getTime() <= t) return "active";
    return e.status;
  }

  function seedCounts(e) {
    const cands = candsFor(e.id);
    const total = (e.demo && e.demo.total) || 0;
    if (!cands.length || !total) return cands.map((c) => ({ candidateId: c.id, votes: 0 }));
    const base = [0.37, 0.27, 0.21, 0.15];
    const rot = Math.abs(Number(e.id.replace(/\D/g, "")) || 0) % cands.length;
    const weights = cands.map((_, i) => base[(i + rot) % base.length]);
    const sum = weights.reduce((a, b) => a + b, 0);
    let left = total;
    return cands.map((c, i) => {
      const n = i === cands.length - 1 ? left : Math.round((total * weights[i]) / sum);
      left -= n;
      return { candidateId: c.id, votes: Math.max(0, n) };
    });
  }

  function tally(electionId) {
    const map = {};
    candsFor(electionId).forEach((c) => (map[c.id] = 0));
    const e = S.elections.find((x) => x.id === electionId);
    if (e) seedCounts(e).forEach((r) => (map[r.candidateId] = (map[r.candidateId] || 0) + r.votes));
    S.ballots.filter((b) => b.electionId === electionId).forEach((b) => {
      if (map[b.candidateId] !== undefined) map[b.candidateId] += 1;
    });
    return map;
  }

  function votesCast(electionId) {
    return Object.values(tally(electionId)).reduce((a, b) => a + b, 0);
  }

  function viewElection(e) {
    const status = effectiveStatus(e);
    const votes = votesCast(e.id);
    const cands = candsFor(e.id);
    return {
      id: e.id, title: e.title, description: e.description, category: e.category,
      status, startsAt: e.startsAt, endsAt: e.endsAt, publishedAt: e.publishedAt,
      eligible: e.eligible, createdAt: e.createdAt, demo: !!e.demo,
      candidateCount: cands.length, votesCast: votes, participation: pct(votes, e.eligible),
      hasVoted: !!myParticipation().find((p) => p.electionId === e.id)
    };
  }

  function myParticipation() {
    if (!me) return [];
    return S.participation.filter((p) => p.userId === me.id).map((p) => ({
      electionId: p.electionId, votedAt: p.votedAt, receipt: p.receipt
    }));
  }

  function audit(entry) {
    const prev = S.audit.length ? S.audit[S.audit.length - 1].hash : "GENESIS";
    const row = {
      id: "al_" + (S.audit.length + 1), actor: entry.actor || (me ? me.name : "system"),
      action: entry.action, target: entry.target || "", detail: entry.detail || "",
      createdAt: iso(new Date()), prevHash: prev
    };
    row.hash = hashChain(row, prev);
    S.audit.push(row);
  }

  function notify(userId, text) {
    if (!S.notifications[userId]) S.notifications[userId] = [];
    S.notifications[userId].unshift({ id: uid("n"), text, read: false, createdAt: iso(new Date()) });
  }

  function requireAuth() {
    if (!me) throw new Error("Please sign in to continue.");
  }

  /* ============================================================
     LOCAL (demo) adapter
     ============================================================ */
  Local.init = async () => {
    S = load();
    const sess = JSON.parse(localStorage.getItem(SESSION) || "null");
    if (sess && sess.userId) {
      const found = S.voters.find((v) => v.id === sess.userId);
      if (found) me = publicUser(found);
    }
  };

  Local.currentUser = () => me;

  Local.login = async (email, password) => {
    const u = S.voters.find((v) => v.email.toLowerCase() === String(email).toLowerCase());
    if (!u || u.password !== password) throw new Error("Incorrect email or password.");
    if (u.status === "suspended") throw new Error("This account is suspended. Contact the election administrator.");
    me = publicUser(u);
    localStorage.setItem(SESSION, JSON.stringify({ userId: u.id }));
    return me;
  };

  Local.register = async ({ name, email, password }) => {
    const exists = S.voters.some((v) => v.email.toLowerCase() === String(email).toLowerCase());
    if (exists) throw new Error("An account with this email already exists.");
    if (!S.settings.allowSelfRegistration) throw new Error("Self-registration is currently disabled.");
    const u = {
      id: uid("u"), name, email, password, phone: "", role: "voter",
      verified: false, status: "pending", registeredAt: iso(new Date())
    };
    S.voters.unshift(u);
    (S.activity[u.id] = S.activity[u.id] || []).push({ id: uid("a"), type: "registration", text: "Account registration completed", at: iso(new Date()) });
    if (!S.notifications[u.id]) S.notifications[u.id] = [];
    notify(u.id, "Welcome to Bharat eVote. Complete identity verification to become eligible to vote.");
    if (S.directoryTotal) S.directoryTotal += 1;
    persist();
    me = publicUser(u);
    localStorage.setItem(SESSION, JSON.stringify({ userId: u.id }));
    return me;
  };

  Local.logout = async () => {
    me = null;
    localStorage.removeItem(SESSION);
  };

  Local.resetPassword = async (email) => {
    const exists = S.voters.some((v) => v.email.toLowerCase() === String(email).toLowerCase());
    if (!exists) throw new Error("No account found for that email.");
    return "Password reset instructions have been sent (demo mode: no email is actually sent).";
  };

  Local.updateProfile = async (patch) => {
    requireAuth();
    const u = S.voters.find((v) => v.id === me.id);
    if (patch.name) u.name = patch.name;
    if (patch.phone !== undefined) u.phone = patch.phone;
    me = publicUser(u);
    persist();
    return me;
  };

  Local.verifySelf = async () => {
    requireAuth();
    const u = S.voters.find((v) => v.id === me.id);
    u.verified = true;
    u.status = "verified";
    me = publicUser(u);
    (S.activity[u.id] = S.activity[u.id] || []).push({ id: uid("a"), type: "verification", text: "Identity verification completed", at: iso(new Date()) });
    audit({ action: "voter.verified", target: u.name, detail: "Eligibility approved after verification" });
    notify(u.id, "Your identity verification was completed successfully.");
    persist();
    return me;
  };

  Local.notifications = async () => (me && S.notifications[me.id]) ? S.notifications[me.id] : [];
  Local.markNotificationsRead = async () => {
    if (!me) return;
    (S.notifications[me.id] || []).forEach((n) => (n.read = true));
    persist();
  };

  Local.elections = async () => {
    const admin = me && me.role === "admin";
    return S.elections
      .filter((e) => admin || e.status !== "draft")
      .map(viewElection)
      .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  };

  Local.election = async (id) => {
    const e = findElection(id);
    if (e.status === "draft" && (!me || me.role !== "admin")) throw new Error("This election is not published yet.");
    return { ...viewElection(e), candidates: clone(candsFor(id)) };
  };

  Local.categories = async () => S.categories.slice();

  Local.myParticipation = async () => myParticipation();
  Local.hasVoted = async (id) => !!myParticipation().find((p) => p.electionId === id);

  Local.canVote = async (election) => {
    if (!me) return { ok: false, reason: "signin" };
    if (me.role === "admin") return { ok: false, reason: "admin" };
    if (me.status === "suspended") return { ok: false, reason: "suspended" };
    if (!me.verified) return { ok: false, reason: "unverified" };
    if (election.status !== "active") return { ok: false, reason: "not-open" };
    if (await Local.hasVoted(election.id)) return { ok: false, reason: "voted" };
    return { ok: true };
  };

  Local.castVote = async (electionId, candidateId) => {
    requireAuth();
    const e = findElection(electionId);
    const status = effectiveStatus(e);
    if (status !== "active") throw new Error("Voting is not open for this election.");
    if (!me.verified) throw new Error("Your eligibility is not verified yet.");
    if (S.participation.some((p) => p.electionId === electionId && p.userId === me.id))
      throw new Error("Our records show you have already voted in this election.");
    const cand = S.candidates.find((c) => c.id === candidateId && c.electionId === electionId);
    if (!cand) throw new Error("Please select a valid candidate.");

    const receipt = "BVT-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    S.participation.push({ id: uid("p"), electionId, userId: me.id, votedAt: iso(new Date()), receipt });
    // Anonymous ballot: no voter id, no email — only election + candidate + timestamp.
    S.ballots.push({ id: uid("b"), electionId, candidateId, castAt: iso(new Date()) });
    (S.activity[me.id] = S.activity[me.id] || []).push({
      id: uid("a"), type: "vote", text: `Vote successfully submitted — ${e.title}`, at: iso(new Date())
    });
    audit({ action: "ballot.cast", target: e.title, detail: "Anonymous ballot recorded; no voter identifier attached", actor: "Voting booth" });
    notify(me.id, `Your ballot for ${e.title} was recorded. Receipt ${receipt}.`);
    persist();
    return { receipt, electionId };
  };

  Local.results = async (electionId) => {
    const e = findElection(electionId);
    const status = effectiveStatus(e);
    const map = tally(electionId);
    const rows = candsFor(electionId)
      .map((c) => ({ candidateId: c.id, name: c.name, party: c.party, color: c.color, photoUrl: c.photoUrl, votes: map[c.id] || 0 }))
      .sort((a, b) => b.votes - a.votes);
    const totalVotes = rows.reduce((a, b) => a + b.votes, 0);
    rows.forEach((r) => (r.share = pct(r.votes, totalVotes)));
    const published = status === "published";
    const adminPreview = me && me.role === "admin" && status === "closed";
    const visible = published || adminPreview;
    const tie = rows.length > 1 && rows[0].votes === rows[1].votes;
    return {
      election: viewElection(e), published, adminPreview,
      totalEligible: e.eligible, totalVotes, turnout: pct(totalVotes, e.eligible),
      rows: visible ? rows : null,
      winner: published && rows.length && !tie ? rows[0] : null,
      tie: published && tie
    };
  };

  Local.activity = async () => {
    if (!me) return [];
    const base = (S.activity[me.id] || []).slice();
    const votes = myParticipation().map((p) => {
      const e = S.elections.find((x) => x.id === p.electionId);
      return { id: "v_" + p.id, type: "vote", text: `Vote successfully submitted — ${e ? e.title : "Election"}`, at: p.votedAt };
    });
    const seen = new Set(base.map((b) => b.text + b.at));
    votes.forEach((v) => { if (!seen.has(v.text + v.at)) base.push(v); });
    return base.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);
  };

  /* ---------------- admin ---------------- */
  Local.stats = async () => {
    requireAdmin();
    const active = S.elections.filter((e) => effectiveStatus(e) === "active").length;
    const upcoming = S.elections.filter((e) => effectiveStatus(e) === "upcoming").length;
    const completed = S.elections.filter((e) => ["closed", "published"].includes(effectiveStatus(e))).length;
    const votes = S.elections.reduce((sum, e) => sum + votesCast(e.id), 0);
    return {
      registeredVoters: S.directoryTotal || S.voters.filter((v) => v.role === "voter").length,
      totalElections: S.elections.length,
      activeElections: active,
      upcomingElections: upcoming,
      completedElections: completed,
      votesCast: votes
    };
  };

  Local.voters = async () => {
    requireAdmin();
    return S.voters.map((v) => {
      const voted = S.participation.filter((p) => p.userId === v.id).length;
      return { ...publicUser(v), electionsVoted: voted };
    }).sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
  };

  Local.setVoterStatus = async (id, status) => {
    requireAdmin();
    const u = S.voters.find((v) => v.id === id);
    if (!u) throw new Error("Voter not found.");
    u.status = status;
    u.verified = status === "verified";
    audit({
      action: status === "suspended" ? "voter.suspended" : status === "rejected" ? "voter.rejected" : "voter.verified",
      target: u.name, detail: `Voter status set to ${status}`
    });
    notify(u.id, status === "verified" ? "Your eligibility has been approved. You can now vote in open elections."
      : status === "suspended" ? "Your account has been suspended pending review."
      : `Your eligibility status changed to ${status}.`);
    persist();
  };

  Local.saveElection = async (data) => {
    requireAdmin();
    if (!data.title || !data.description) throw new Error("Title and description are required.");
    if (!data.startsAt || !data.endsAt) throw new Error("Start and end dates are required.");
    if (new Date(data.endsAt) <= new Date(data.startsAt)) throw new Error("Closing date must be after the opening date.");
    if (data.id) {
      const e = findElection(data.id);
      Object.assign(e, {
        title: data.title, description: data.description, category: data.category,
        startsAt: iso(data.startsAt), endsAt: iso(data.endsAt), eligible: Number(data.eligible) || e.eligible
      });
      audit({ action: "election.updated", target: e.title, detail: "Election details updated" });
    } else {
      const e = {
        id: uid("e"), title: data.title, description: data.description, category: data.category || "General",
        status: "draft", startsAt: iso(data.startsAt), endsAt: iso(data.endsAt),
        eligible: Number(data.eligible) || 0, createdAt: iso(new Date()), publishedAt: null,
        demo: { total: 0, series: [0, 0, 0, 0, 0, 0, 0] }
      };
      S.elections.unshift(e);
      audit({ action: "election.created", target: e.title, detail: "Draft election created" });
    }
    persist();
    return { ok: true };
  };

  Local.deleteElection = async (id) => {
    requireAdmin();
    const e = findElection(id);
    if (effectiveStatus(e) !== "draft") throw new Error("Only draft elections can be deleted.");
    S.elections = S.elections.filter((x) => x.id !== id);
    S.candidates = S.candidates.filter((c) => c.electionId !== id);
    audit({ action: "election.deleted", target: e.title, detail: "Draft election deleted" });
    persist();
  };

  Local.setElectionStatus = async (id, status) => {
    requireAdmin();
    const e = findElection(id);
    const cands = candsFor(id);
    if ((status === "active" || status === "upcoming") && cands.length < 2)
      throw new Error("Add at least two candidates before opening an election.");
    if (status === "active") {
      e.status = "active";
      if (new Date(e.startsAt).getTime() > Date.now()) e.startsAt = iso(new Date());
      if (new Date(e.endsAt).getTime() <= Date.now()) e.endsAt = iso(new Date(Date.now() + 7 * DAY));
      audit({ action: "election.activated", target: e.title, detail: "Election opened for voting" });
    } else if (status === "closed") {
      e.status = "closed";
      if (new Date(e.endsAt).getTime() > Date.now()) e.endsAt = iso(new Date());
      audit({ action: "election.closed", target: e.title, detail: "Voting closed" });
    } else if (status === "published") {
      if (effectiveStatus(e) === "active") throw new Error("Close the election before publishing results.");
      e.status = "published";
      e.publishedAt = iso(new Date());
      audit({ action: "election.published", target: e.title, detail: "Results published after voting closed" });
      S.voters.forEach((v) => {
        if (S.participation.some((p) => p.electionId === id && p.userId === v.id))
          notify(v.id, `Results published: ${e.title}.`);
      });
    } else if (status === "draft") {
      e.status = "draft";
    }
    persist();
    return { ok: true };
  };

  Local.saveCandidate = async (data) => {
    requireAdmin();
    if (!data.electionId) throw new Error("Choose an election for this candidate.");
    if (!data.name || !data.manifesto) throw new Error("Candidate name and manifesto are required.");
    const e = findElection(data.electionId);
    if (["published"].includes(effectiveStatus(e))) throw new Error("Candidates cannot be edited after results are published.");
    if (data.id) {
      const c = S.candidates.find((x) => x.id === data.id);
      if (!c) throw new Error("Candidate not found.");
      Object.assign(c, {
        name: data.name, party: data.party || "Independent", role: data.party || "Independent",
        manifesto: data.manifesto, photoUrl: data.photoUrl || c.photoUrl, electionId: data.electionId
      });
      audit({ action: "candidate.updated", target: e.title, detail: `Candidate updated: ${data.name}` });
    } else {
      S.candidates.push({
        id: uid("c"), electionId: data.electionId, name: data.name,
        party: data.party || "Independent", role: data.party || "Independent",
        manifesto: data.manifesto, photoUrl: data.photoUrl || null,
        color: ["#2f6fed", "#0d8a4f", "#ef7a1a", "#7c5cd6", "#14a3b8"][S.candidates.length % 5]
      });
      audit({ action: "candidate.added", target: e.title, detail: `Candidate profile added: ${data.name}` });
    }
    persist();
    return { ok: true };
  };

  Local.deleteCandidate = async (id) => {
    requireAdmin();
    const c = S.candidates.find((x) => x.id === id);
    if (!c) throw new Error("Candidate not found.");
    const e = findElection(c.electionId);
    if (effectiveStatus(e) === "active") throw new Error("Candidates cannot be removed while voting is open.");
    S.candidates = S.candidates.filter((x) => x.id !== id);
    audit({ action: "candidate.removed", target: e.title, detail: `Candidate removed: ${c.name}` });
    persist();
  };

  Local.auditLogs = async () => {
    requireAdmin();
    return S.audit.slice().reverse();
  };

  Local.analytics = async () => {
    requireAdmin();
    const visible = S.elections.filter((e) => e.status !== "draft");
    const turnoutByElection = visible.map((e) => ({
      title: e.title, turnout: pct(votesCast(e.id), e.eligible), votes: votesCast(e.id), eligible: e.eligible
    }));
    const statusCounts = { active: 0, upcoming: 0, closed: 0, published: 0, draft: 0 };
    S.elections.forEach((e) => (statusCounts[effectiveStatus(e)] = (statusCounts[effectiveStatus(e)] || 0) + 1));
    const catMap = {};
    visible.forEach((e) => (catMap[e.category] = (catMap[e.category] || 0) + votesCast(e.id)));
    const labels = ["6d", "5d", "4d", "3d", "2d", "1d", "Today"];
    const trend = labels.map((_, i) => S.elections.reduce((sum, e) => sum + ((e.demo && e.demo.series[i]) || 0), 0));
    return { turnoutByElection, statusCounts, categories: catMap, trendLabels: labels, trend };
  };

  Local.settings = async () => {
    requireAdmin();
    return clone(S.settings);
  };
  Local.saveSettings = async (patch) => {
    requireAdmin();
    Object.assign(S.settings, patch);
    audit({ action: "settings.updated", target: "Platform settings", detail: "Configuration updated: " + Object.keys(patch).join(", ") });
    persist();
    return clone(S.settings);
  };

  Local.uploadCandidatePhoto = async (file) => {
    requireAdmin();
    if (!file) throw new Error("Choose an image file.");
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Image must be smaller than 2 MB.");
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error("Could not read that image."));
      fr.readAsDataURL(file);
    });
  };

  Local.exportResultsCSV = async (electionId) => {
    requireAdmin();
    const r = await Local.results(electionId);
    if (!r.rows) throw new Error("Results are not available yet.");
    const head = ["Candidate", "Affiliation", "Votes", "Share %"];
    const lines = [head.join(",")].concat(
      r.rows.map((x) => [`"${x.name.replace(/"/g, '""')}"`, `"${x.party.replace(/"/g, '""')}"`, x.votes, x.share].join(","))
    );
    lines.push(["", "", "", ""].join(","));
    lines.push(["Total votes", r.totalVotes, "Turnout %", r.turnout].join(","));
    lines.push(["Eligible voters", r.totalEligible, "Election", `"${r.election.title.replace(/"/g, '""')}"`].join(","));
    return lines.join("\n");
  };

  /* ============================================================
     Facade
     ============================================================ */
  const api = REMOTE ? window.REMOTE_DB : Local;

  const facade = {
    mode: REMOTE ? "supabase" : "demo",
    isDemo: !REMOTE,
    async init() {
      await api.init();
      if (REMOTE) me = await api.currentUser();
      return facade;
    },
    user: () => me,
    async refresh() { me = REMOTE ? await api.currentUser() : api.currentUser(); return me; },
    login: async (e, p) => { me = await api.login(e, p); return me; },
    register: async (d) => { me = await api.register(d); return me; },
    logout: async () => { await api.logout(); me = null; },
    resetPassword: (e) => api.resetPassword(e),
    updateProfile: async (p) => { me = await api.updateProfile(p); return me; },
    verifySelf: async () => { me = await api.verifySelf(); return me; },
    notifications: () => api.notifications(),
    markNotificationsRead: () => api.markNotificationsRead(),
    elections: () => api.elections(),
    election: (id) => api.election(id),
    categories: () => api.categories(),
    myParticipation: () => api.myParticipation(),
    hasVoted: (id) => api.hasVoted(id),
    canVote: (election) => api.canVote(election),
    castVote: (electionId, candidateId) => api.castVote(electionId, candidateId),
    results: (id) => api.results(id),
    activity: () => api.activity(),
    stats: () => api.stats(),
    voters: () => api.voters(),
    setVoterStatus: (id, s) => api.setVoterStatus(id, s),
    saveElection: (d) => api.saveElection(d),
    deleteElection: (id) => api.deleteElection(id),
    setElectionStatus: (id, s) => api.setElectionStatus(id, s),
    saveCandidate: (d) => api.saveCandidate(d),
    deleteCandidate: (id) => api.deleteCandidate(id),
    auditLogs: () => api.auditLogs(),
    analytics: () => api.analytics(),
    settings: () => api.settings(),
    saveSettings: (p) => api.saveSettings(p),
    uploadCandidatePhoto: (f) => api.uploadCandidatePhoto(f),
    exportResultsCSV: (id) => api.exportResultsCSV(id),
    categoriesList: () => api.categories(),
    isAdmin: () => !!me && me.role === "admin",
    isVerified: () => !!me && me.verified && me.status === "verified",
    effectiveStatus,
    pct
  };

  return facade;
})();
