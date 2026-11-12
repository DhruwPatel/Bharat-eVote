/* ============================================================
   Bharat eVote — Supabase adapter
   Active only when APP_CONFIG has a project URL + anon key.
   Public anon key only; all privileged work happens in the
   `cast-vote` / `admin-action` Edge Functions and RLS policies.
   ============================================================ */
window.REMOTE_DB = (function () {
  const CFG = window.APP_CONFIG;
  let sb = null;
  let profile = null;

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  function client() {
    if (!sb) sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return sb;
  }

  async function loadProfile() {
    const { data: { session } } = await client().auth.getSession();
    if (!session) { profile = null; return null; }
    const { data, error } = await client().from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (error) throw error;
    if (!data) { profile = null; return null; }
    profile = {
      id: data.id, name: data.full_name, email: data.email, phone: data.phone || "",
      role: data.role, verified: data.verified, status: data.status, registeredAt: data.created_at
    };
    return profile;
  }

  const mapElection = (r) => ({
    id: r.id, title: r.title, description: r.description,
    category: r.category || (r.election_categories && r.election_categories.name) || "General",
    status: r.status, startsAt: r.starts_at, endsAt: r.ends_at,
    eligible: r.eligible_count, createdAt: r.created_at, publishedAt: r.published_at,
    candidateCount: r.candidate_count || (r.candidates ? r.candidates.length : 0),
    votesCast: r.votes_cast || 0, participation: pct(r.votes_cast || 0, r.eligible_count),
    demo: !!r.is_demo, hasVoted: false
  });

  const mapCandidate = (c) => ({
    id: c.id, electionId: c.election_id, name: c.name,
    party: c.affiliation, role: c.affiliation, manifesto: c.manifesto,
    photoUrl: c.photo_url, color: c.color || "#2f6fed"
  });

  const api = {
    async init() { await client(); await loadProfile(); },
    currentUser: () => profile,

    async login(email, password) {
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      const p = await loadProfile();
      if (!p) throw new Error("Your profile is not set up yet. Contact the administrator.");
      if (p.status === "suspended") throw new Error("This account is suspended.");
      return p;
    },

    async register({ name, email, password }) {
      const { data, error } = await client().auth.signUp({
        email, password, options: { data: { full_name: name } }
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Registration did not complete. Try again.");
      if (!data.session) throw new Error("Check your inbox to confirm your email address, then sign in.");
      return await loadProfile();
    },

    async logout() { await client().auth.signOut(); profile = null; },

    async resetPassword(email) {
      const { error } = await client().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/login.html"
      });
      if (error) throw new Error(error.message);
      return "If that address has an account, a reset link is on its way.";
    },

    async updateProfile(patch) {
      const { error } = await client().from("profiles")
        .update({ full_name: patch.name, phone: patch.phone }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      return await loadProfile();
    },

    // Verification is a configurable administrator step in this prototype.
    async verifySelf() {
      throw new Error("Verification is completed by an election administrator in this deployment.");
    },

    async notifications() {
      const { data, error } = await client().from("notifications").select("*")
        .order("created_at", { ascending: false }).limit(20);
      if (error) return [];
      return data.map((n) => ({ id: n.id, text: n.body, read: n.read, createdAt: n.created_at }));
    },

    async markNotificationsRead() {
      await client().from("notifications").update({ read: true }).eq("read", false);
    },

    async elections() {
      let q = client().from("elections")
        .select("*, election_categories(name), candidates(count)")
        .order("starts_at", { ascending: false });
      if (!profile || profile.role !== "admin") q = q.neq("status", "draft");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data.map((r) => {
        const mapped = mapElection({ ...r, candidate_count: r.candidates && r.candidates[0] ? r.candidates[0].count : 0 });
        return mapped;
      });
      if (profile) {
        const { data: votes } = await client().from("voter_participation").select("election_id");
        const voted = new Set((votes || []).map((v) => v.election_id));
        rows.forEach((r) => (r.hasVoted = voted.has(r.id)));
      }
      return rows;
    },

    async election(id) {
      const { data, error } = await client().from("elections")
        .select("*, election_categories(name), candidates(*)").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Election not found.");
      return { ...mapElection({ ...data, candidate_count: data.candidates.length }), candidates: data.candidates.map(mapCandidate) };
    },

    async categories() {
      const { data } = await client().from("election_categories").select("*");
      return data || [];
    },

    async myParticipation() {
      const { data } = await client().from("voter_participation").select("election_id, voted_at, receipt");
      return (data || []).map((p) => ({ electionId: p.election_id, votedAt: p.voted_at, receipt: p.receipt }));
    },

    async hasVoted(id) {
      const { data } = await client().from("voter_participation").select("id").eq("election_id", id).maybeSingle();
      return !!data;
    },

    async canVote(election) {
      if (!profile) return { ok: false, reason: "signin" };
      if (profile.role === "admin") return { ok: false, reason: "admin" };
      if (profile.status === "suspended") return { ok: false, reason: "suspended" };
      if (!profile.verified) return { ok: false, reason: "unverified" };
      if (election.status !== "active") return { ok: false, reason: "not-open" };
      if (await api.hasVoted(election.id)) return { ok: false, reason: "voted" };
      const { data } = await client().from("voter_eligibility")
        .select("approved").eq("election_id", election.id).maybeSingle();
      if (data && data.approved === false) return { ok: false, reason: "ineligible" };
      return { ok: true };
    },

    async castVote(electionId, candidateId) {
      const { data, error } = await client().functions.invoke("cast-vote", {
        body: { election_id: electionId, candidate_id: candidateId }
      });
      if (error) throw new Error(error.message || "Could not submit your ballot.");
      if (data && data.error) throw new Error(data.error);
      return { receipt: data.receipt, electionId };
    },

    async results(id) {
      const { data, error } = await client().rpc("get_election_results", { p_election_id: id });
      if (error) throw new Error(error.message);
      const election = await api.election(id);
      const visible = data && data.published;
      return {
        election, published: !!(data && data.published), adminPreview: !!(data && data.admin_preview),
        totalEligible: data ? data.total_eligible : election.eligible,
        totalVotes: data ? data.total_votes : 0,
        turnout: data ? data.turnout : 0,
        rows: visible ? (data.rows || []).map((r) => ({
          candidateId: r.candidate_id, name: r.name, party: r.affiliation,
          votes: r.votes, share: r.share, color: r.color
        })) : null,
        winner: data && data.winner ? { name: data.winner.name, party: data.winner.affiliation, votes: data.winner.votes, share: data.winner.share } : null
      };
    },

    async activity() {
      const { data } = await client().from("activity_log").select("*")
        .order("created_at", { ascending: false }).limit(12);
      return (data || []).map((a) => ({ id: a.id, type: a.type, text: a.body, at: a.created_at }));
    },

    async stats() {
      const count = async (table, fn) => {
        let q = client().from(table).select("*", { count: "exact", head: true });
        if (fn) q = fn(q);
        const { count: c } = await q;
        return c || 0;
      };
      const elections = await api.elections();
      return {
        registeredVoters: await count("profiles", (q) => q.eq("role", "voter")),
        totalElections: elections.length,
        activeElections: elections.filter((e) => e.status === "active").length,
        upcomingElections: elections.filter((e) => e.status === "upcoming").length,
        completedElections: elections.filter((e) => ["closed", "published"].includes(e.status)).length,
        votesCast: elections.reduce((s, e) => s + e.votesCast, 0)
      };
    },

    async voters() {
      const { data, error } = await client().from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []).map((p) => ({
        id: p.id, name: p.full_name, email: p.email, phone: p.phone, role: p.role,
        verified: p.verified, status: p.status, registeredAt: p.created_at, electionsVoted: 0
      }));
    },

    async setVoterStatus(id, status) { return admin("voter.status", { user_id: id, status }); },
    async saveElection(data) { return admin(data.id ? "election.update" : "election.create", data); },
    async deleteElection(id) { return admin("election.delete", { id }); },
    async setElectionStatus(id, status) { return admin("election.status", { id, status }); },
    async saveCandidate(data) { return admin(data.id ? "candidate.update" : "candidate.create", data); },
    async deleteCandidate(id) { return admin("candidate.delete", { id }); },

    async auditLogs() {
      const { data, error } = await client().from("audit_logs").select("*").order("id", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data || []).map((a) => ({
        id: a.id, actor: a.actor_label, action: a.action, target: a.target,
        detail: a.detail, createdAt: a.created_at, prevHash: a.prev_hash, hash: a.hash
      }));
    },

    async analytics() {
      const elections = await api.elections();
      const statusCounts = { active: 0, upcoming: 0, closed: 0, published: 0, draft: 0 };
      elections.forEach((e) => (statusCounts[e.status] = (statusCounts[e.status] || 0) + 1));
      const categories = {};
      elections.forEach((e) => (categories[e.category] = (categories[e.category] || 0) + e.votesCast));
      return {
        turnoutByElection: elections.map((e) => ({ title: e.title, turnout: e.participation, votes: e.votesCast, eligible: e.eligible })),
        statusCounts, categories,
        trendLabels: elections.slice(0, 7).map((e) => e.title.split(" ").slice(0, 2).join(" ")).reverse(),
        trend: elections.slice(0, 7).map((e) => e.votesCast).reverse()
      };
    },

    async settings() { const { data } = await client().from("platform_settings").select("*").maybeSingle(); return data || {}; },
    async saveSettings(patch) { return admin("settings.update", patch); },

    async uploadCandidatePhoto(file) {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
      if (file.size > 2 * 1024 * 1024) throw new Error("Image must be smaller than 2 MB.");
      const path = `candidates/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "")}`;
      const { error } = await client().storage.from("candidate-photos").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = client().storage.from("candidate-photos").getPublicUrl(path);
      return data.publicUrl;
    },

    async exportResultsCSV(id) {
      const r = await api.results(id);
      if (!r.rows) throw new Error("Results are not available yet.");
      const lines = [["Candidate", "Affiliation", "Votes", "Share %"].join(",")]
        .concat(r.rows.map((x) => [`"${x.name.replace(/"/g, '""')}"`, `"${x.party.replace(/"/g, '""')}"`, x.votes, x.share].join(",")));
      return lines.join("\n");
    }
  };

  async function admin(action, payload) {
    const { data, error } = await client().functions.invoke("admin-action", { body: { action, payload } });
    if (error) throw new Error(error.message || "Administrator action failed.");
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  return api;
})();
