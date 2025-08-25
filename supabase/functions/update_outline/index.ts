// supabase/functions/update_outline/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ADMIN_KEY = Deno.env.get("ACTIONS_ADMIN_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

serve(async (req) => {
  try {
    // Auth: Bearer <ACTIONS_ADMIN_KEY>
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token !== ACTIONS_ADMIN_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { topic_id, draft, publish } = await req.json();
    if (!topic_id) {
      return new Response(JSON.stringify({ error: "Missing topic_id" }), { status: 400 });
    }

    // Save draft (writes to re_lesson_outlines)
    if (draft) {
      const { error } = await supabase
        .from("topic_teks")
        .update({ re_lesson_outlines: draft })
        .eq("id", topic_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, mode: "draft" }), { status: 200 });
    }

    // Publish: copy draft -> lesson_outline
    if (publish) {
      const { data, error: fetchErr } = await supabase
        .from("topic_teks")
        .select("re_lesson_outlines")
        .eq("id", topic_id)
        .single();
      if (fetchErr) throw fetchErr;

      const outline = data?.re_lesson_outlines;
      if (!outline) {
        return new Response(JSON.stringify({ error: "No draft to publish" }), { status: 400 });
      }

      const { error } = await supabase
        .from("topic_teks")
        .update({ lesson_outline: outline })
        .eq("id", topic_id);
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, mode: "published" }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Must provide draft or publish" }), { status: 400 });
  } catch (err: any) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500 });
  }
});
