// deno run --allow-env --allow-net
// List topics (published by default) with simple paging + search.
//
// Auth: static bearer key in header (ACTIONS_ADMIN_KEY).
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
    return new Response("", {
      headers: corsHeaders(),
    });
  }

  // Auth: Bearer <ACTIONS_ADMIN_KEY>
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token !== ACTIONS_ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body (all optional)
  let body: any = {};
  try { body = await req.json(); } catch {}
  const limit = clamp(Number(body?.limit ?? 50), 1, 200);
  const offset = Math.max(0, Number(body?.offset ?? 0));
  const includeDrafts = Boolean(body?.include_drafts ?? false);
  const search = (body?.search ?? "").toString().trim();


  // Adjust SELECT columns to your schema (topic_teks used in your repo)
  // If you later make a published view, you can switch to: supabase.from("topics_published")
  let q = supabase
    .from("topic_teks")
    .select("id, topic_title, topic, lesson_outline, updated_at, unit_id")
    .order("updated_at", { ascending: false });

  // Filter by unit_id if provided
  const unit_id = body?.unit_id;
  if (unit_id) q = q.eq("unit_id", unit_id);

  if (!includeDrafts) q = q.not("lesson_outline", "is", null);
  if (search) {
    // Change "topic_title" if your column is named differently
    q = q.ilike("topic_title", `%${search}%`);
  }

  // Pagination
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const items = (data ?? []).map((r: any) => ({
    id: r.id,
    topic: r.topic_title ?? r.topic ?? null,
    published: r.lesson_outline != null,
    unit_id: r.unit_id ?? null,
    updated_at: r.updated_at ?? null,
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
  };
}

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
