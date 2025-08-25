// deno run --allow-env --allow-net
// Lists units for a given content_area with paging + search.
//
// Auth: static bearer key (ACTIONS_ADMIN_KEY) in the Authorization header.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), ACTIONS_ADMIN_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ADMIN_KEY = Deno.env.get("ACTIONS_ADMIN_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders() });
  }

  // Auth: Authorization: Bearer <ACTIONS_ADMIN_KEY>
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token !== ACTIONS_ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body
  let body: any = {};
  try { body = await req.json(); } catch {}
  const content_area = (body?.content_area ?? "").toString().trim();
  if (!content_area) return json({ ok: false, error: "content_area required" }, 400);

  const limit = clamp(Number(body?.limit ?? 50), 1, 200);
  const offset = Math.max(0, Number(body?.offset ?? 0));
  const search = (body?.search ?? "").toString().trim();

  // Query curriculum_units by content_area
  let q = supabase
    .from("curriculum_units")
    .select("id, unit_title, unit_number, unit_question, content_area")
    .eq("content_area", content_area)
    .order("unit_number", { ascending: true, nullsFirst: true });

  if (search) q = q.ilike("unit_title", `%${search}%`);
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const items = (data ?? []).map((u: any) => ({
    id: u.id,
    title: u.unit_title,
    unit_number: u.unit_number ?? null,
    question: u.unit_question ?? null,
    content_area: u.content_area,
  }));

  return json({ ok: true, count: items.length, items });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  } as const;
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
