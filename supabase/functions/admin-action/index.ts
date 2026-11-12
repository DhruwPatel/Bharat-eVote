// =====================================================================
// Bharat eVote — admin-action Edge Function
// Deployed with: supabase functions deploy admin-action
// ---------------------------------------------------------------------
// Every privileged write goes through here. The caller's JWT is verified,
// their profile role is checked server-side, payloads are validated, and
// the operation is written to the hash-chained audit log. The service-role
// key exists only in the function environment.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

// New API-key model: publishable/secret keys are injected as JSON dictionaries
// ({"default":"sb_secret_…"}). Legacy keys still work as a fallback, but they are
// deprecated, so the new names are preferred.
function readKey(dictName: string, legacyName: string): string | undefined {
  const raw = Deno.env.get(dictName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.default ?? parsed[Object.keys(parsed)[0]];
    } catch { /* fall through to legacy */ }
  }
  return Deno.env.get(legacyName);
}

const STATUSES = ["draft", "upcoming", "active", "closed", "published"];
const VOTER_STATUSES = ["pending", "verified", "rejected", "suspended"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const serviceKey = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server is not configured" }, 500);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) return json({ error: "Could not verify administrator profile" }, 500);
  if (!profile || profile.role !== "admin" || profile.status === "suspended") {
    return json({ error: "Administrator access required" }, 403);
  }

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = body.action ?? "";
  const p = body.payload ?? {};
  const audit = async (act: string, target: string, detail: string) => {
    await admin.rpc("append_audit", {
      p_action: act, p_target: target, p_detail: detail, p_actor_label: profile.full_name
    });
  };

  try {
    switch (action) {
      case "election.create":
      case "election.update": {
        const title = String(p.title ?? "").trim();
        const description = String(p.description ?? "").trim();
        if (title.length < 4 || description.length < 10) {
          return json({ error: "Title and description are required" }, 400);
        }
        if (!p.startsAt || !p.endsAt || new Date(String(p.endsAt)) <= new Date(String(p.startsAt))) {
          return json({ error: "Closing date must be after the opening date" }, 400);
        }
        let categoryId: string | null = null;
        if (p.category) {
          const { data: cat } = await admin.from("election_categories")
            .select("id").eq("name", String(p.category)).maybeSingle();
          if (cat) categoryId = cat.id;
          else {
            const { data: created } = await admin.from("election_categories")
              .insert({ name: String(p.category) }).select("id").single();
            categoryId = created?.id ?? null;
          }
        }
        const row = {
          title, description, category_id: categoryId,
          eligible_count: Number(p.eligible) || 0,
          starts_at: p.startsAt, ends_at: p.endsAt
        };
        if (action === "election.create") {
          const { data, error } = await admin.from("elections").insert({ ...row, created_by: profile.id }).select("id").single();
          if (error) return json({ error: error.message }, 400);
          await audit("election.created", title, "Draft election created");
          return json({ ok: true, id: data.id });
        }
        const id = String(p.id ?? "");
        const { error } = await admin.from("elections").update(row).eq("id", id);
        if (error) return json({ error: error.message }, 400);
        await audit("election.updated", title, "Election details updated");
        return json({ ok: true });
      }

      case "election.delete": {
        const { data: election } = await admin.from("elections")
          .select("id, title, status").eq("id", String(p.id ?? "")).maybeSingle();
        if (!election) return json({ error: "Election not found" }, 404);
        if (election.status !== "draft") return json({ error: "Only draft elections can be deleted" }, 400);
        const { error } = await admin.from("elections").delete().eq("id", election.id);
        if (error) return json({ error: error.message }, 400);
        await audit("election.deleted", election.title, "Draft election deleted");
        return json({ ok: true });
      }

      case "election.status": {
        const status = String(p.status ?? "");
        if (!STATUSES.includes(status)) return json({ error: "Unknown election status" }, 400);
        const { data: election } = await admin.from("elections")
          .select("id, title, status, starts_at, ends_at").eq("id", String(p.id ?? "")).maybeSingle();
        if (!election) return json({ error: "Election not found" }, 404);

        const { count } = await admin.from("candidates")
          .select("id", { count: "exact", head: true }).eq("election_id", election.id);
        if (["active", "upcoming"].includes(status) && (count ?? 0) < 2) {
          return json({ error: "Add at least two candidates before opening the election" }, 400);
        }
        if (status === "published" && election.status === "active") {
          return json({ error: "Close the election before publishing results" }, 400);
        }

        const patch: Record<string, unknown> = { status };
        if (status === "active" && new Date(election.starts_at) > new Date()) patch.starts_at = new Date().toISOString();
        if (status === "closed" && new Date(election.ends_at) > new Date()) patch.ends_at = new Date().toISOString();
        if (status === "published") patch.published_at = new Date().toISOString();

        const { error } = await admin.from("elections").update(patch).eq("id", election.id);
        if (error) return json({ error: error.message }, 400);
        await audit(
          status === "active" ? "election.activated" : status === "closed" ? "election.closed"
            : status === "published" ? "election.published" : "election.updated",
          election.title,
          status === "published" ? "Results published after voting closed" : `Election status set to ${status}`
        );
        return json({ ok: true });
      }

      case "candidate.create":
      case "candidate.update": {
        const name = String(p.name ?? "").trim();
        const manifesto = String(p.manifesto ?? "").trim();
        if (name.length < 2 || manifesto.length < 10) return json({ error: "Name and manifesto are required" }, 400);
        const electionId = String(p.electionId ?? "");
        if (!electionId) return json({ error: "Choose an election" }, 400);

        const row = {
          election_id: electionId, name,
          affiliation: String(p.party ?? "Independent").trim() || "Independent",
          manifesto, photo_url: p.photoUrl ? String(p.photoUrl) : null
        };

        if (action === "candidate.create") {
          const { error } = await admin.from("candidates").insert(row);
          if (error) return json({ error: error.message }, 400);
          const { data: e } = await admin.from("elections").select("title").eq("id", electionId).maybeSingle();
          await audit("candidate.added", e?.title ?? "", `Candidate profile added: ${name}`);
          return json({ ok: true });
        }
        const { error } = await admin.from("candidates").update(row).eq("id", String(p.id ?? ""));
        if (error) return json({ error: error.message }, 400);
        const { data: e } = await admin.from("elections").select("title").eq("id", electionId).maybeSingle();
        await audit("candidate.updated", e?.title ?? "", `Candidate updated: ${name}`);
        return json({ ok: true });
      }

      case "candidate.delete": {
        const { data: cand } = await admin.from("candidates")
          .select("id, name, election_id, elections(title, status)").eq("id", String(p.id ?? "")).maybeSingle();
        if (!cand) return json({ error: "Candidate not found" }, 404);
        // @ts-ignore nested select
        if (cand.elections?.status === "active") return json({ error: "Candidates cannot be removed while voting is open" }, 400);
        const { error } = await admin.from("candidates").delete().eq("id", cand.id);
        if (error) return json({ error: "This candidate has recorded ballots and cannot be removed" }, 400);
        // @ts-ignore nested select
        await audit("candidate.removed", cand.elections?.title ?? "", `Candidate removed: ${cand.name}`);
        return json({ ok: true });
      }

      case "voter.status": {
        const status = String(p.status ?? "");
        if (!VOTER_STATUSES.includes(status)) return json({ error: "Unknown voter status" }, 400);
        const userId = String(p.user_id ?? "");
        const { data: voter } = await admin.from("profiles")
          .select("id, full_name, email").eq("id", userId).maybeSingle();
        if (!voter) return json({ error: "Voter not found" }, 404);
        const { error } = await admin.from("profiles")
          .update({ status, verified: status === "verified" }).eq("id", userId);
        if (error) return json({ error: error.message }, 400);
        await admin.from("notifications").insert({
          user_id: userId,
          body: status === "verified" ? "Your eligibility has been approved. You can now vote in open elections."
            : status === "suspended" ? "Your account has been suspended pending review."
            : `Your eligibility status changed to ${status}.`
        });
        await audit(
          status === "suspended" ? "voter.suspended" : status === "rejected" ? "voter.rejected" : "voter.verified",
          voter.full_name, `Voter status set to ${status}`
        );
        return json({ ok: true });
      }

      case "settings.update": {
        const patch = {
          org_name: p.orgName ?? "Bharat eVote",
          support_email: p.supportEmail ?? null,
          require_verification: !!p.requireVerification,
          allow_self_registration: !!p.allowSelfRegistration,
          public_results_only_when_published: !!p.publicResultsOnlyWhenPublished,
          updated_at: new Date().toISOString()
        };
        const { error } = await admin.from("platform_settings").upsert({ id: true, ...patch });
        if (error) return json({ error: error.message }, 400);
        await audit("settings.updated", "Platform settings", "Configuration updated");
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown administrator action" }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Administrator action failed" }, 500);
  }
});
