// =====================================================================
// Bharat eVote — cast-vote Edge Function
// Deployed with: supabase functions deploy cast-vote
// ---------------------------------------------------------------------
// The browser never receives a service-role key. This function validates
// the caller's JWT, applies a per-user rate limit, then delegates the
// atomic insert to the cast_ballot() database function, where the unique
// constraint guarantees one accepted ballot per voter per election.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// New API-key model: publishable/secret keys are injected as JSON dictionaries
// ({"default":"sb_publishable_…"}). Legacy SUPABASE_ANON_KEY still works.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "Server is not configured" }, 500);

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  let body: { election_id?: string; candidate_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const electionId = body.election_id;
  const candidateId = body.candidate_id;
  if (!electionId || !candidateId || !UUID.test(electionId) || !UUID.test(candidateId)) {
    return json({ error: "A valid election and candidate are required" }, 400);
  }

  // Per-user throttle: at most 8 attempts per minute.
  const { error: limitError } = await supabase.rpc("assert_rate_limit", {
    p_action: "cast-vote",
    p_max: 8,
    p_window: "1 minute"
  });
  if (limitError) return json({ error: limitError.message }, 429);

  const { data: receipt, error } = await supabase.rpc("cast_ballot", {
    p_election_id: electionId,
    p_candidate_id: candidateId
  });

  if (error) {
    // Do not leak internal details; the database messages are user-safe.
    return json({ error: error.message }, 400);
  }

  return json({ receipt, election_id: electionId });
});
