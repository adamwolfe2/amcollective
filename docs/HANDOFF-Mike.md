# Mike — Legal AI Handoff (2026-04-30)

Internal legal AI at `legal.amcollectivecapital.com`. AGPL-3.0, internal-only (Adam + Maggie).
Do not expose to portcos — AGPL clock starts the moment external users can log in.

---

## TL;DR

| What | Where | Status |
|---|---|---|
| Frontend repo | `adamwolfe2/mike-amcollective` (fork of `willchen96/mike`) | ✅ Forked |
| Backend Fly app | `mike-backend-amcollective` | ⏳ Not yet deployed |
| Vercel project | `mike-amcollective` | ⏳ Not yet created |
| Supabase project | `mike-amcollective` | ⏳ Needs Adam to create |
| Supabase Storage bucket | `mike-documents` | ⏳ After Supabase created |
| MCP tool `legal.review` | `amcollective/lib/mcp/tools.ts` | ✅ Written, not yet live |
| Domain | `legal.amcollectivecapital.com` | ⏳ Needs Namecheap CNAME |

---

## Architecture

```
Browser
  └─▶ Vercel: mike-amcollective (Next.js 16 frontend)
        └─▶ Fly.io: mike-backend-amcollective (Express + LibreOffice, 512MB)
              ├─▶ Supabase Auth (user sessions)
              ├─▶ Supabase Postgres (projects, documents, chats)
              └─▶ Supabase Storage S3 API (PDF/DOCX blobs, bucket: mike-documents)

Hermes (Slack bot)
  └─▶ MCP tool: legal.review(doc_url, question?)
        └─▶ Fly.io: /review endpoint (MIKE_SERVICE_TOKEN auth, stateless)
              └─▶ Anthropic Claude Haiku → structured JSON analysis
```

---

## What's done

### Code changes in `adamwolfe2/mike-amcollective`

1. **`backend/Dockerfile`** — Node 22-slim + LibreOffice apt package. Builds TypeScript, prunes devDeps. Image is ~600MB.
2. **`backend/fly.toml`** — `shared-cpu-1x @ 512MB`, region `iad`, port 3001.
3. **`backend/src/middleware/serviceAuth.ts`** — timing-safe Bearer token check using `MIKE_SERVICE_TOKEN`. Separate from Supabase Auth (for Hermes calls).
4. **`backend/src/routes/review.ts`** — `POST /review`. Fetches doc from URL, extracts text (PDF via pdfjs-dist, DOCX via mammoth, matching chatTools.ts patterns), calls Claude Haiku, returns `{ summary, key_clauses, risks, recommendation }` JSON.
5. **`backend/src/index.ts`** — registered `/review` route.
6. **`backend/src/lib/storage.ts`** — patched `region: "auto"` → `process.env.R2_REGION ?? "auto"`. Set `R2_REGION=us-east-1` for Supabase Storage; omit for Cloudflare R2.

### Code changes in `adamwolfe2/amcollective`

7. **`lib/mcp/tools.ts`** — added `legal.review` tool (tool #17). Reads `MIKE_API_URL` + `MIKE_SERVICE_TOKEN` from env. POSTs to Mike's `/review` endpoint, returns formatted summary to Hermes.
8. **`services/mike/README.md`** — deploy runbook (mirrors services/hermes/README.md structure).
9. **`docs/HANDOFF-Mike.md`** — this file.

---

## What Adam needs to do next (in order)

### Step 1 — Create Supabase project (5 min, browser only)

1. Go to [supabase.com](https://supabase.com) → New project
2. Name: `mike-amcollective`
3. Region: `us-east-1` (N. Virginia — closest to Fly `iad`)
4. Save the DB password somewhere safe
5. After creation, go to **Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
   - `service_role` secret key → `SUPABASE_SECRET_KEY`

### Step 2 — Run the database migration (5 min, terminal)

```bash
# Get connection string from Supabase → Settings → Database → URI (use "Transaction" mode)
psql "postgresql://postgres:[your-password]@[host]:5432/postgres" \
  -f /tmp/mike-amcollective/backend/migrations/000_one_shot_schema.sql
```

### Step 3 — Create Supabase Storage bucket + S3 credentials (5 min, browser)

1. Supabase → Storage → Create bucket: `mike-documents` (private)
2. Supabase → Storage → **S3 Access** → Generate new access key
3. Copy **Access Key ID** → `R2_ACCESS_KEY_ID`
4. Copy **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
5. Endpoint is: `https://<your-project-ref>.supabase.co/storage/v1/s3`

### Step 4 — Create two Supabase Auth users (2 min, browser)

1. Supabase → Authentication → Users → Invite user
2. Send invite to `adamwolfe102@gmail.com`
3. Send invite to Maggie's email
4. Both accept email invites and set passwords

### Step 5 — Deploy the Fly backend (5 min, terminal)

```bash
# Make sure you're in the backend dir
cd /tmp/mike-amcollective/backend

# Create the Fly app (one-time)
fly apps create mike-backend-amcollective

# Set all secrets (fill in values from Steps 1–3)
fly secrets set \
  SUPABASE_URL="https://YOUR_REF.supabase.co" \
  SUPABASE_SECRET_KEY="your-service-role-key" \
  R2_ENDPOINT_URL="https://YOUR_REF.supabase.co/storage/v1/s3" \
  R2_ACCESS_KEY_ID="your-storage-access-key-id" \
  R2_SECRET_ACCESS_KEY="your-storage-secret-access-key" \
  R2_BUCKET_NAME="mike-documents" \
  R2_REGION="us-east-1" \
  ANTHROPIC_API_KEY="same-key-as-amcollective" \
  FRONTEND_URL="https://legal.amcollectivecapital.com" \
  MIKE_SERVICE_TOKEN="$(openssl rand -hex 32)" \
  --app mike-backend-amcollective

# Note the MIKE_SERVICE_TOKEN value — you need it for Step 6
fly secrets list --app mike-backend-amcollective

# Deploy (first deploy takes ~5 min — LibreOffice build is large)
fly deploy --app mike-backend-amcollective --remote-only

# Verify
curl https://mike-backend-amcollective.fly.dev/health
# → {"ok":true}
```

### Step 6 — Create Vercel project for the frontend (5 min)

```bash
cd /tmp/mike-amcollective/frontend

# Link to Vercel (creates the project)
vercel link --project mike-amcollective

# Set env vars
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY production
vercel env add SUPABASE_SECRET_KEY production
vercel env add NEXT_PUBLIC_API_BASE_URL production
# Value for NEXT_PUBLIC_API_BASE_URL: https://mike-backend-amcollective.fly.dev

# Deploy
vercel --prod
```

Note the Vercel deployment URL (e.g. `mike-amcollective-xyz.vercel.app`).

### Step 7 — Add Namecheap CNAME (2 min, browser)

1. Namecheap → amcollectivecapital.com → Advanced DNS → Add Record
2. Type: `CNAME`
3. Host: `legal`
4. Value: `cname.vercel-dns.com` (standard Vercel CNAME)
5. TTL: Automatic

Then in Vercel → mike-amcollective project → Domains → Add `legal.amcollectivecapital.com`.

### Step 8 — Wire MIKE_SERVICE_TOKEN into amcollective (2 min)

The `legal.review` MCP tool in the amcollective Next.js app reads two env vars:

```bash
# In amcollective Vercel project, add:
vercel env add MIKE_API_URL production
# Value: https://mike-backend-amcollective.fly.dev

vercel env add MIKE_SERVICE_TOKEN production
# Value: same token you set in fly secrets (Step 5)

# Redeploy amcollective to pick up new vars
vercel --prod
# (or push to main — Vercel auto-deploys)
```

### Step 9 — Push all code changes

```bash
# Push mike-amcollective changes
cd /tmp/mike-amcollective
git add backend/Dockerfile backend/fly.toml \
        backend/src/middleware/serviceAuth.ts \
        backend/src/routes/review.ts \
        backend/src/index.ts \
        backend/src/lib/storage.ts
git commit -m "feat: add Fly deploy config, /review endpoint, Supabase S3 support"
git push origin main

# Push amcollective changes
cd /Users/adamwolfe/amcollective
git add lib/mcp/tools.ts services/mike/ docs/HANDOFF-Mike.md
git commit -m "feat: add legal.review MCP tool and Mike service docs"
git push origin main
```

### Step 10 — Smoke test end to end

```bash
# 1. Test the backend /review endpoint directly
MIKE_TOKEN=$(fly secrets list --app mike-backend-amcollective | grep MIKE_SERVICE_TOKEN)
# (get the value from fly secrets or your notes)

curl -X POST https://mike-backend-amcollective.fly.dev/review \
  -H "Authorization: Bearer YOUR_MIKE_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"doc_url": "https://www.w3.org/WAI/WCAG21/wcag21-letter.pdf", "question": "What is this document about?"}'
# → {"summary":"...","key_clauses":[...],"risks":[...],"recommendation":"..."}

# 2. Test via Hermes in Slack
# DM @Hermes: "review this contract: https://example.com/contract.pdf"
# Hermes should call legal.review and return the analysis
```

---

## Ongoing operations

### Fly backend

```bash
fly logs --app mike-backend-amcollective        # tail logs
fly status --app mike-backend-amcollective      # health + machine state
fly ssh console --app mike-backend-amcollective # ssh in if needed
```

### Cost

- Fly: ~$3-4/mo (shared-cpu-1x @ 512MB, always-on)
- Supabase: $0/mo (free tier: 500MB DB, 1GB storage, 50K auth users)
- Anthropic: ~$0.01-0.10 per document review (Claude Haiku)

### Adding a new user

Supabase → Authentication → Users → Invite user. That's it.
No code changes needed — Mike's RLS is per `user_id` from Supabase Auth.

---

## Known issues / future work

| Item | Priority |
|---|---|
| Clerk SSO bridge (skip Supabase login, use existing Clerk session) | Low — nice-to-have, not a blocker |
| Persist `/review` calls to Supabase for audit trail | Low |
| Add Mike to amcollective Vercel team for shared billing | Low |
| Hermes skill: "review contract and send summary to #legal" | Medium |

---

## If Mike breaks

1. Check Fly logs: `fly logs --app mike-backend-amcollective`
2. Check Supabase status: https://status.supabase.com
3. If LibreOffice OOM: bump Fly VM to 1GB — `fly scale memory 1024 --app mike-backend-amcollective`
4. If Vercel build fails: check that `NEXT_PUBLIC_API_BASE_URL` is set correctly

End of handoff.
