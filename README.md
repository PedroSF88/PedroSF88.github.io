# PedroSF88.github.io

📚 Curriculum Platform — Developer Guide
Overview

This repo is a JSON-driven curriculum platform for Social Studies / World History.
It combines:

Supabase → Database, RLS policies, and secure APIs

Supabase Edge Functions → Draft / refine / publish lesson outlines

GitHub Pages frontend → Browse content → units → topics → lessons

MyGPT Actions → Chat-driven API calls to update lessons

Features

🔍 Frontend browser client uses publishable key only (safe to expose)

🔐 Edge Functions use secret key + ACTIONS_ADMIN_KEY for writes

✅ Database tables protected by row-level security and read-only views

✏️ AI-assisted workflows: refine_outline improves lesson flow/readings

Project Structure
.
├── index.html               # GitHub Pages frontend
├── js/index.js              # Renders lessons
├── css/index.css            # Styling
├── supabase/
│   └── functions/
│       ├── update_outline/
│       │   ├── index.ts     # Draft/publish lessons
│       │   └── config.toml  # verify_jwt = false
│       └── refine_outline/
│           ├── index.ts     # AI refinement via OpenAI
│           └── config.toml
├── openapi/
│   ├── mygpt-actions.json             # OpenAPI spec for MyGPT Actions
│   └── legacy/                        # Archived specs
│       └── mygpt-actions.yaml         # Legacy spec (do not upload)
├── .env.example             # Environment template (do not commit .env)
└── README.md                # This file

API Keys (new 2025 model)

When adding Actions in MyGPT, upload openapi/mygpt-actions.json.

Publishable Key (sb_publishable_…) → safe for browser (replaces anon)

Secret Key (sb_secret_…) → backend only (replaces service_role)

ACTIONS_ADMIN_KEY → custom long string for Edge Function auth

OPENAI_API_KEY → used by refine_outline

.env.example
SUPABASE_URL=https://<YOUR_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxx
ACTIONS_ADMIN_KEY=long_random_string
OPENAI_API_KEY=sk-xxxx (optional for refine_outline)

Setup
1. Frontend

In js/index.js:

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  "sb_publishable_xxxxx"
);


Commit/push → GitHub Pages will serve updated frontend.

2. Functions

Deploy with Supabase CLI:

# Link local project
npx supabase link --project-ref <YOUR_REF>

# Push secrets
npx supabase functions secrets set --env-file .env

# Deploy functions
npx supabase functions deploy update_outline
npx supabase functions deploy refine_outline

3. MyGPT Actions

Upload openapi/mygpt-actions.json in MyGPT → Actions → Add
Note: the legacy spec is archived at openapi/legacy/mygpt-actions.yaml and should not be uploaded.

Set auth header: Authorization: Bearer <ACTIONS_ADMIN_KEY>

Available operations:

update_outline → draft or publish

refine_outline → AI refinement

Testing Functions
Draft
$headers = @{ Authorization = "Bearer <ACTIONS_ADMIN_KEY>" }
$body = @{ topic_id = "<UUID>"; draft = @{ lesson_title = "Draft via API" } } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri "https://<REF>.functions.supabase.co/update_outline" -Headers $headers -ContentType "application/json" -Body $body

Publish
$body = @{ topic_id = "<UUID>"; publish = $true } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri "https://<REF>.functions.supabase.co/update_outline" -Headers $headers -ContentType "application/json" -Body $body

Refine
$body = @{ topic_id = "<UUID>" } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri "https://<REF>.functions.supabase.co/refine_outline" -Headers $headers -ContentType "application/json" -Body $body

Security Checklist

✅ Frontend → publishable key only

✅ Anon role → read-only via views

✅ No UPDATE policies for anon/public

✅ Writes → Edge Functions only (require ACTIONS_ADMIN_KEY)

✅ Secret key never leaves backend

Roadmap

 GitHub Action CI/CD to auto-deploy functions on push

 Lesson editor UI (instead of JSON input)

 Schema validation for outlines (Zod/TypeBox)
