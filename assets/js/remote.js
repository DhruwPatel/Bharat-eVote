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
      // An election stays "active" in the table after its window passes; the
      // ballot function rejects late votes, but the status has to catch up or
      // results review stays locked. Administrators close expired ones here.
      if (profile && profile.role === "admin") {
        try {
          await client().from("elections")
            .update({ status: "closed" })
            .eq("status", "active")
            .lt("ends_at", new Date().toISOString());
        } catch (_) { /* non-fatal: the RPC also treats an expired window as closed */ }
      }
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
      // Status alone is not enough: the database also enforces the voting window,
      // so mirror that check here or the ballot looks open while every submit fails.
      const now = Date.now();
      const startsAt = new Date(election.startsAt).getTime();
      const endsAt = new Date(election.endsAt).getTime();
      if (Number.isFinite(startsAt) && now < startsAt) return { ok: false, reason: "scheduled" };
      if (Number.isFinite(endsAt) && now > endsAt) return { ok: false, reason: "window-closed" };
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

      if (!error && !(data && data.error)) return { receipt: data.receipt, electionId };

      // The Edge Function is a convenience wrapper: JWT check + rate limit around
      // cast_ballot(). The database function is the real enforcement point (row
      // lock, window, eligibility, unique constraint), and it is granted to
      // authenticated users, so call it directly when the function is missing.
      if (!functionMissing(error)) {
        throw new Error((data && data.error) || (error && error.message) || "Could not submit your ballot.");
      }

      console.warn("[Bharat eVote] cast-vote is not deployed; submitting through cast_ballot() directly.");
      const limited = await client().rpc("assert_rate_limit", { p_action: "vote", p_max: 5 });
      if (limited.error) throw new Error(limited.error.message);

      const { data: receipt, error: castError } = await client().rpc("cast_ballot", {
        p_election_id: electionId, p_candidate_id: candidateId
      });
      if (castError) throw new Error(castError.message || "Could not submit your ballot.");
      return { receipt, electionId };
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
      // Participation receipts record that an account voted, never what it
      // chose, so counting them is safe for administrators and is the only
      // honest source for this column. RLS exposes them to admins only.
      const { data: parts } = await client().from("voter_participation").select("user_id");
      const voted = {};
      (parts || []).forEach((p) => { voted[p.user_id] = (voted[p.user_id] || 0) + 1; });
      return (data || []).map((p) => ({
        id: p.id, name: p.full_name, email: p.email, phone: p.phone, role: p.role,
        verified: p.verified, status: p.status, registeredAt: p.created_at,
        electionsVoted: voted[p.id] || 0
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

  const STATUSES = ["draft", "upcoming", "active", "closed", "published"];

  // Actions the browser can perform safely on its own: RLS already restricts
  // every one of these tables to administrators, so this does not widen access.
  // The Edge Function adds server-side validation and audit entries; keep it
  // deployed in production. This path exists so the app also works before the
  // function is deployed.
  const VOTER_STATUSES = ["pending", "verified", "rejected", "suspended"];

  const FALLBACK_ACTIONS = new Set([
    "election.create", "election.update", "election.delete", "election.status",
    "candidate.create", "candidate.update", "candidate.delete",
    "voter.status", "settings.update"
  ]);

  async function categoryId(name) {
    if (!name) return null;
    const clean = String(name).trim();
    if (!clean) return null;
    const { data } = await client().from("election_categories").select("id").eq("name", clean).maybeSingle();
    if (data) return data.id;
    const { data: created } = await client().from("election_categories").insert({ name: clean }).select("id").single();
    return created ? created.id : null;
  }

  async function directAdmin(action, p) {
    const c = client();
    const fail = (msg) => { throw new Error(msg); };

    if (action === "election.create" || action === "election.update") {
      const title = String(p.title ?? "").trim();
      const description = String(p.description ?? "").trim();
      if (title.length < 4 || description.length < 10) fail("Title and description are required");
      if (!p.startsAt || !p.endsAt || new Date(String(p.endsAt)) <= new Date(String(p.startsAt))) {
        fail("Closing date must be after the opening date");
      }
      const row = {
        title, description,
        category_id: await categoryId(p.category),
        eligible_count: Number(p.eligible) || 0,
        starts_at: p.startsAt, ends_at: p.endsAt
      };
      if (action === "election.create") {
        const { data, error } = await c.from("elections").insert(row).select("id").single();
        if (error) fail(error.message);
        return { ok: true, id: data.id };
      }
      const { error } = await c.from("elections").update(row).eq("id", String(p.id ?? ""));
      if (error) fail(error.message);
      return { ok: true };
    }

    if (action === "election.delete") {
      const { error } = await c.from("elections").delete()
        .eq("id", String(p.id ?? "")).eq("status", "draft");
      if (error) fail(error.message);
      return { ok: true };
    }

    if (action === "election.status") {
      const status = String(p.status ?? "");
      if (!STATUSES.includes(status)) fail("Unknown election status");
      const id = String(p.id ?? "");
      if (["active", "upcoming"].includes(status)) {
        const { count } = await c.from("candidates")
          .select("id", { count: "exact", head: true }).eq("election_id", id);
        if ((count ?? 0) < 2) fail("Add at least two candidates before opening the election");
      }
      const patch = { status };
      if (status === "published") patch.published_at = new Date().toISOString();
      const { error } = await c.from("elections").update(patch).eq("id", id);
      if (error) fail(error.message);
      return { ok: true };
    }

    if (action === "candidate.create" || action === "candidate.update") {
      const name = String(p.name ?? "").trim();
      const manifesto = String(p.manifesto ?? "").trim();
      if (name.length < 2 || manifesto.length < 10) {
        fail("Name and manifesto are required (manifesto needs 10+ characters)");
      }
      if (!p.electionId) fail("Choose an election");
      const row = {
        election_id: String(p.electionId), name,
        affiliation: String(p.party ?? "Independent").trim() || "Independent",
        manifesto, photo_url: p.photoUrl ? String(p.photoUrl) : null
      };
      const { error } = action === "candidate.create"
        ? await c.from("candidates").insert(row)
        : await c.from("candidates").update(row).eq("id", String(p.id ?? ""));
      if (error) fail(error.message);
      return { ok: true };
    }

    if (action === "candidate.delete") {
      const { error } = await c.from("candidates").delete().eq("id", String(p.id ?? ""));
      if (error) fail(error.message);
      return { ok: true };
    }

    if (action === "voter.status") {
      const status = String(p.status ?? "");
      if (!VOTER_STATUSES.includes(status)) fail("Unknown voter status");
      const userId = String(p.user_id ?? "");
      if (!userId) fail("Voter not found");
      const { data: voter, error: readError } = await c.from("profiles")
        .select("id, full_name").eq("id", userId).maybeSingle();
      if (readError) fail(readError.message);
      if (!voter) fail("Voter not found");
      const { error } = await c.from("profiles")
        .update({ status, verified: status === "verified" }).eq("id", userId);
      if (error) fail(error.message);
      // The profiles_status_change trigger in schema.sql writes the voter's
      // notification and activity entry — clients cannot insert into
      // public.notifications, so the database owns that side of the flow.
      return { ok: true };
    }

    if (action === "settings.update") {
      const { error } = await c.from("platform_settings").upsert({
        id: true,
        org_name: p.orgName ?? "Bharat eVote",
        support_email: p.supportEmail ?? null,
        require_verification: !!p.requireVerification,
        allow_self_registration: !!p.allowSelfRegistration,
        public_results_only_when_published: !!p.publicResultsOnlyWhenPublished,
        updated_at: new Date().toISOString()
      });
      if (error) fail(error.message);
      return { ok: true };
    }

    fail("This action needs the admin-action Edge Function. Deploy it from the Supabase dashboard.");
  }

  function functionMissing(error) {
    if (!error) return false;
    if (error.context && error.context.status === 404) return true;
    return /not found|failed to send|edge function/i.test(error.message || "");
  }

  async function admin(action, payload) {
    const body = payload || {};
    const { data, error } = await client().functions.invoke("admin-action", { body: { action, payload: body } });

    if (!error && !(data && data.error)) return data;

    if (functionMissing(error) && FALLBACK_ACTIONS.has(action)) {
      console.warn("[Bharat eVote] admin-action is not deployed; applying " + action +
        " directly. Row Level Security still restricts this to administrators.");
      return directAdmin(action, body);
    }

    if (functionMissing(error)) {
      throw new Error("The admin-action function is not deployed yet, so this action is unavailable.");
    }
    if (error) throw new Error(error.message || "Administrator action failed.");
    throw new Error((data && data.error) || "Administrator action failed.");
  }

  return api;
})();
