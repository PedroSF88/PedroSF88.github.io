// deno run --allow-env --allow-net
// Refines a topic's lesson outline using OpenAI and saves it as a draft.
//
// Auth: static bearer key (ACTIONS_ADMIN_KEY) in the Authorization header.
// Env (required):
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY  (or SUPABASE_SERVICE_ROLE_KEY as fallback)
//   ACTIONS_ADMIN_KEY
//   OPENAI_API_KEY       (or OPEN_API_KEY as fallback; if missing -> stub fallback)
//
// Body:
//   { "topic_id": "<uuid>", "model"?: "gpt-4o-mini", "temperature"?: 0.2 }
//
// Response:
//   { ok: true, draft: { ... } }  or { ok:false, error:"..." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ADMIN_KEY = Deno.env.get("ACTIONS_ADMIN_KEY")!;
const OPENAI_API_KEY =
  Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("OPEN_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

serve(async (req) => {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token !== ACTIONS_ADMIN_KEY) return new Response('{"error":"Unauthorized"}', { status: 401 });

    const { topic_id } = await req.json();
    if (!topic_id) return new Response('{"error":"Missing topic_id"}', { status: 400 });

    // Load topic + unit + peers (for flow)
    const { data: topic, error: tErr } = await supabase
      .from("topic_teks")
      .select("id, unit_id, topic_title, lesson_core, lesson_outline")
      .eq("id", topic_id).single();
    if (tErr || !topic) return new Response('{"error":"Topic not found"}', { status: 404 });

    const { data: unit } = await supabase
      .from("curriculum_units")
      .select("unit_title, unit_summary")
      .eq("id", topic.unit_id).maybeSingle();

    const { data: siblings } = await supabase
      .from("topic_teks")
      .select("topic_title, lesson_outline")
      .eq("unit_id", topic.unit_id)
      .neq("id", topic_id)
      .order("created_at", { ascending: true });

    // Build a compact context for the model
    const prior = (siblings ?? [])
      .slice(0, 6)
      .map(s => `- ${s.topic_title}`)
      .join("\n");

    const system = "You are a curriculum designer. Improve lesson flow and readings WITHOUT changing the schema. Return STRICT JSON.";
    const userPayload = {
      goal: "Reduce redundancy with adjacent lessons; improve reading selections/instructions.",
      unit_title: unit?.unit_title,
      unit_summary: unit?.unit_summary,
      prior_lessons: prior,
      topic_title: topic.topic_title,
      lesson_core: topic.lesson_core,
      current_outline: topic.lesson_outline ?? {}
    };

    // Call OpenAI (chat completions JSON response)
    const oai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Refine this outline. Keep keys and structure." },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });
    if (!oai.ok) return new Response(JSON.stringify({ error: await oai.text() }), { status: 502 });
    const data = await oai.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";

    let refined;
    try { refined = JSON.parse(content); } catch { return new Response('{"error":"Model returned invalid JSON"}', { status: 422 }); }

    // Save to draft
    const { error: upErr } = await supabase
      .from("topic_teks")
      .update({ re_lesson_outlines: refined })
      .eq("id", topic_id);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, draft: refined }), { headers: { "Content-Type": "application/json" }});
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }

  // Auth: Authorization: Bearer <ACTIONS_ADMIN_KEY>
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token !== ACTIONS_ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body
  let body: any = {};
  try { body = await req.json(); } catch {}
  const topic_id = (body?.topic_id ?? "").toString().trim();
  if (!topic_id) return json({ ok: false, error: "topic_id required" }, 400);

  const model = (body?.model ?? "gpt-4o-mini").toString();
  const temperature = isFinite(Number(body?.temperature)) ? Number(body?.temperature) : 0.2;

  // Fetch existing topic context
  const { data: topic, error: readErr } = await supabase
    .from("topic_teks")
    .select(
      [
        "id",
        "topic_title",
        "matched_teks",
        "lesson_core",
        "unit_id",
        "lesson_outline",
        "re_lesson_outlines",
        "lesson_outline_draft",
        "lesson_outline_version",
      ].join(", ")
    )
    .eq("id", topic_id)
    .maybeSingle();

  if (readErr) return json({ ok: false, error: readErr.message }, 500);
  if (!topic) return json({ ok: false, error: "topic not found" }, 404);

  // Build a minimal prompt/context
  const seedDraft =
    topic.lesson_outline_draft ??
    topic.re_lesson_outlines ??
    topic.lesson_outline ??
    {};

  const userInstruction = [
    "You are refining a lesson outline for a world history class.",
    "Improve clarity, sequence, and readings. Keep JSON-only output.",
    "Return a compact JSON object with keys:",
    "- lesson_title (string)",
    "- objectives (array of short strings, 3–5 items)",
    "- sections (array of { title, activities: array of short steps })",
    "- readings (array of { title, type, link? })",
    "- assessment (short string)",
    "Do not add extra keys beyond these.",
  ].join(" ");

  // If no OpenAI key, create a stub draft so the flow still works
  if (!OPENAI_API_KEY) {
    const stub = makeStubDraft(topic.topic_title, seedDraft);
    const saveErr = await saveDraft(topic_id, stub);
    if (saveErr) return json({ ok: false, error: saveErr }, 500);
    return json({ ok: true, draft: stub });
  }

  // Compose chat messages
  const messages = [
    {
      role: "system",
      content:
        "You are a precise curriculum editor. Output JSON only, no prose. Keep it teacher-friendly and actionable.",
    },
    {
      role: "user",
      content: [
        userInstruction,
        "",
        "=== CONTEXT ===",
        `Topic Title: ${topic.topic_title ?? "(unknown)"}`,
        `Matched TEKS (if any): ${safeStringify(topic.matched_teks)}`,
        `Lesson Core (if any): ${safeStringify(topic.lesson_core)}`,
        "",
        "=== CURRENT DRAFT (may be empty) ===",
        safeStringify(seedDraft),
      ].join("\n"),
    },
  ];

  // Call OpenAI Chat Completions (JSON output)
  let refined: any = null;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`OpenAI error ${resp.status}: ${text}`);
    }

    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    refined = safeParseJSON(content) ?? makeStubDraft(topic.topic_title, seedDraft, true);
  } catch (e) {
    // Fallback to stub if the API call fails or returns non-JSON
    console.warn("OpenAI call failed:", e);
    refined = makeStubDraft(topic.topic_title, seedDraft, true);
  }

  // Save the refined draft into both draft fields for compatibility
  const saveErr = await saveDraft(topic_id, refined);
  if (saveErr) return json({ ok: false, error: saveErr }, 500);

  return json({ ok: true, draft: refined });
});

// ---------- helpers ----------

async function saveDraft(topic_id: string, draft: unknown): Promise<string | null> {
  const { error } = await supabase
    .from("topic_teks")
    .update({
      re_lesson_outlines: draft,
      lesson_outline_draft: draft,
    })
    .eq("id", topic_id);
  return error ? error.message : null;
}

function makeStubDraft(title: string | null, seed: unknown, fromAI = false) {
  const baseTitle = title ?? "Draft Lesson";
  const ts = new Date().toISOString();
  return {
    lesson_title: `${baseTitle} (refined${fromAI ? "" : " stub"})`,
    objectives: [
      "Identify key ideas and vocabulary",
      "Explain cause and effect using evidence",
      "Connect the topic to broader historical themes",
    ],
    sections: [
      { title: "Hook", activities: ["Activate prior knowledge", "Preview guiding question"] },
      { title: "Investigation", activities: ["Read core text", "Analyze source", "Discuss findings"] },
      { title: "Synthesis", activities: ["Write brief response", "Share out"] },
    ],
    readings: [],
    assessment: "Exit ticket aligned to objectives.",
    _meta: { generated_at: ts, source: fromAI ? "openai" : "stub", seed_present: !!seed },
  };
}

function safeParseJSON(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    // try to recover a JSON object substring
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch {}
    }
    return null;
  }
}

function safeStringify(v: unknown) {
  try { return JSON.stringify(v); } catch { return String(v ?? ""); }
}

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
