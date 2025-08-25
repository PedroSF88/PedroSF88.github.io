import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ADMIN_KEY = Deno.env.get("ACTIONS_ADMIN_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
});
