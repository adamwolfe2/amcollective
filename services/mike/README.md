# services/mike

AM Collective's internal legal AI — a self-hosted fork of [willchen96/mike](https://github.com/willchen96/mike)
(open-source Legora clone, AGPL-3.0).

**Internal use only — Adam + Maggie. Never expose to portcos directly.**
(AGPL is fine as long as external users never log in.)

## Production

| Field | Value |
|---|---|
| Frontend | `https://legal.amcollectivecapital.com` (Vercel, `adamwolfe2/mike-amcollective`) |
| Backend | `https://mike-backend-amcollective.fly.dev` (Fly.io, region `iad`) |
| Auth | Supabase Auth (separate from main app's Clerk) |
| Storage | Supabase Storage S3 API (bucket: `mike-documents`) |
| Cost | ~$3-4/mo for Fly backend (shared-cpu-1x @ 512MB) |

## Architecture

```
Browser → Vercel (Next.js frontend) → Fly.io (Express + LibreOffice backend)
                                              ↓
                                    Supabase Auth + Postgres + Storage

Hermes (Slack) → MCP tool legal.review → Fly.io /review endpoint (service token auth)
```

The `/review` endpoint is a stateless synchronous endpoint for Hermes. It does not
touch Supabase — it fetches the doc URL, extracts text, runs Claude Haiku, and returns JSON.

## Source code

Dockerfile and fly.toml live in `mike-amcollective/backend/`.

```
adamwolfe2/mike-amcollective/
  frontend/          ← Vercel project (Next.js)
  backend/
    Dockerfile       ← Fly.io build
    fly.toml         ← Fly.io config
    src/
      routes/review.ts        ← /review (service-to-service, Hermes)
      middleware/serviceAuth.ts ← MIKE_SERVICE_TOKEN check
      lib/storage.ts           ← patched for Supabase S3 (R2_REGION env)
```

## Required Fly secrets

Set with `fly secrets set KEY=VALUE --app mike-backend-amcollective`.

| Secret | Source |
|---|---|
| `SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_SECRET_KEY` | Supabase project → Settings → API → service_role key |
| `R2_ENDPOINT_URL` | `https://<project-ref>.supabase.co/storage/v1/s3` |
| `R2_ACCESS_KEY_ID` | Supabase → Storage → S3 Access → access key ID |
| `R2_SECRET_ACCESS_KEY` | Supabase → Storage → S3 Access → secret access key |
| `R2_BUCKET_NAME` | `mike-documents` |
| `R2_REGION` | `us-east-1` |
| `ANTHROPIC_API_KEY` | Same as amcollective main app |
| `FRONTEND_URL` | `https://legal.amcollectivecapital.com` |
| `MIKE_SERVICE_TOKEN` | `openssl rand -hex 32` — must match Vercel env on amcollective |

## Required Vercel env vars (amcollective project)

| Var | Value |
|---|---|
| `MIKE_API_URL` | `https://mike-backend-amcollective.fly.dev` |
| `MIKE_SERVICE_TOKEN` | Same shared secret as the Fly secret above |

## Required Vercel env vars (mike-amcollective project)

| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon key |
| `SUPABASE_SECRET_KEY` | Supabase service_role key |
| `NEXT_PUBLIC_API_BASE_URL` | `https://mike-backend-amcollective.fly.dev` |

## Deploy

### Backend (Fly.io)

```bash
cd /path/to/mike-amcollective/backend
fly deploy --app mike-backend-amcollective --remote-only
```

### Frontend (Vercel)

```bash
# One-time: link project
vercel link --project mike-amcollective

# Deploy
vercel --prod
```

Or push to `main` — Vercel auto-deploys.

## Database setup (one-time)

Run the one-shot migration against the Supabase project:

```bash
# Get the connection string from Supabase → Settings → Database → Connection string
psql "postgresql://postgres:[password]@[host]:5432/postgres" \
  -f /path/to/mike-amcollective/backend/migrations/000_one_shot_schema.sql
```

## Watch logs

```bash
fly logs --app mike-backend-amcollective
```

## When something breaks

See `../../docs/HANDOFF-Mike.md` for full runbook.
