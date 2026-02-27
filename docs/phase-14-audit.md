# Phase 14 Audit — ClaudeBot Streaming Chat + RAG + MCP Tools

**Date**: 2026-02-26
**Auditor**: Claude Opus 4.6 (Phase 14 Step 0)

---

## Audit Question 1: aiConversations + aiMessages Schema

**File**: `lib/db/schema/ai.ts`

### aiConversations Table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | defaultRandom |
| userId | varchar(255) | NOT NULL, indexed |
| title | varchar(500) | nullable |
| model | varchar(100) | nullable |
| createdAt | timestamp | NOT NULL, defaultNow |
| updatedAt | timestamp | NOT NULL, defaultNow, $onUpdate |

**Missing from spec**: No `companyContext` field. Not critical — the system prompt already embeds company context. Can be added later if per-company scoping is needed.

### aiMessages Table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | defaultRandom |
| conversationId | uuid FK | CASCADE delete, indexed |
| role | enum(user/assistant/system/tool) | NOT NULL |
| content | text | nullable |
| toolCalls | jsonb | nullable — currently stores `{ iterations, tools: string[] }` |
| tokenCount | integer | nullable |
| createdAt | timestamp | NOT NULL, defaultNow |

**Missing from spec**: `toolName`, `toolCallId`, `toolInput`, `toolResult`, `modelId` columns.

**Decision**: The existing `toolCalls` jsonb column can store structured tool call data (arrays of `{ id, name, input, result }`) without schema migration. The Vercel AI SDK `useChat` stores tool invocations in the message content on the client side. For DB persistence, we'll serialize tool call arrays into the existing `toolCalls` jsonb field. No schema migration needed.

### embeddings Table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | defaultRandom |
| content | text | NOT NULL |
| embedding | vector(1536) | NOT NULL |
| sourceType | enum(sop/client_note/project_doc/invoice/meeting) | NOT NULL |
| sourceId | varchar(255) | nullable |
| metadata | jsonb | nullable |
| createdAt | timestamp | NOT NULL |

**Status**: Complete and functional. Used by `lib/ai/embeddings.ts` with OpenAI text-embedding-3-small.

---

## Audit Question 2: MCP Tools Inventory

**Pattern**: All tools use `Anthropic.Tool[]` format with separate executor functions.

### Core Tools (`lib/ai/tools.ts`) — 10 tools
1. `search_clients` — Search clients by name
2. `get_client_detail` — Client + projects + invoices
3. `get_portfolio_overview` — Projects, team size
4. `get_revenue_data` — MRR + Stripe revenue trend
5. `get_deploy_status` — Recent Vercel deploys
6. `get_rocks` — Quarterly rocks/goals
7. `get_alerts` — System alerts
8. `get_costs` — Per-tool spending
9. `search_knowledge` — RAG vector search
10. `get_invoices` — Invoice summary

### Vercel Tools (`lib/mcp/vercel/index.ts`)
- `list_vercel_projects`
- `get_vercel_project_costs`
- `get_vercel_deployments`
- `check_vercel_build_health`
- `redeploy_vercel_project`

### PostHog Tools (`lib/mcp/posthog/index.ts`)
- `get_posthog_analytics`
- `get_posthog_trend`

### Mercury Tools (`lib/mcp/mercury/index.ts`)
- `get_mercury_balance`
- `get_mercury_transactions`
- `get_cash_position`
- `search_mercury_transactions`

**Total**: ~21 tools. All currently use `Anthropic.Tool[]` type with `executeTool()` dispatcher.

**Migration plan**: Convert to Vercel AI SDK `tool()` format using `zod` schemas. The executor functions remain the same — only the definition format changes.

---

## Audit Question 3: Existing /ai Route

**File**: `app/(admin)/ai/page.tsx` — 224 lines

**Current state**:
- Client component (`"use client"`)
- No streaming — fetches full JSON response
- No sidebar / conversation list
- No conversation persistence on page load (starts fresh)
- No tool call visualization
- No Markdown rendering (raw text in `<div>`)
- Has Chat/Research mode toggle
- Has "New Chat" button
- Has 5 quick-prompt buttons
- Uses Offset Brutalist design correctly (`font-mono`, `font-serif`, `#0A0A0A`, `#F3F3EF`)

**Nav**: "AI" already in admin NAV_ITEMS at position 16 with `Bot` icon, href="/ai".

**API Route**: `app/api/ai/chat/route.ts` — POST (chat/research) + GET (conversations/messages). ArcJet rate limited.

**Verdict**: Complete rewrite needed for streaming. Keep design language.

---

## Audit Question 4: SDK Status

| Package | Installed | Version | Notes |
|---------|-----------|---------|-------|
| `@anthropic-ai/sdk` | YES | ^0.78.0 | Raw SDK, used by existing chat agent |
| `ai` (Vercel AI SDK) | YES | ^6.0.101 | Core package installed |
| `@ai-sdk/anthropic` | **NO** | — | **MUST INSTALL** — Anthropic provider for Vercel AI SDK |
| `react-markdown` | **NO** | — | **MUST INSTALL** — Markdown rendering |
| `remark-gfm` | **NO** | — | **MUST INSTALL** — GFM tables, strikethrough, etc. |

---

## Audit Question 5: Embeddings

**File**: `lib/ai/embeddings.ts`

- `generateEmbedding(text)` — Uses OpenAI text-embedding-3-small (requires `OPENAI_API_KEY`)
- `storeEmbedding(content, sourceType, sourceId, metadata)` — Upserts by source
- `searchSimilar(query, limit, sourceType?)` — Cosine similarity via pgvector `<=>` operator

**Vector dimensions**: 1536 (OpenAI text-embedding-3-small standard)

**Status**: Fully functional. Used by existing chat agent for RAG context injection.

---

## Audit Question 6: embed-documents Inngest Job

**File**: `lib/inngest/jobs/embed-documents.ts`

- Runs nightly at 3 AM UTC via `"0 3 * * *"` cron
- Embeds: clients, projects, rocks, meetings, messages
- Uses `storeEmbedding()` from `lib/ai/embeddings.ts`
- Has `onFailure` handler with `captureError` (added in Phase 13)

**Status**: Complete and operational.

---

## Summary: What Needs to Happen

1. **Install**: `@ai-sdk/anthropic`, `react-markdown`, `remark-gfm`
2. **Convert tools**: From `Anthropic.Tool[]` → Vercel AI SDK `tool()` with zod schemas
3. **New streaming route**: Replace `POST /api/ai/chat` with `streamText` from `ai`
4. **New chat UI**: Full rewrite of `/ai` page with:
   - Sidebar with conversation list
   - Streaming message display via `useChat`
   - Markdown rendering
   - Tool call visualization (collapsible)
   - Company context selector (optional)
5. **Preserve**: GET endpoint for conversation list/messages, ArcJet rate limiting, research mode
6. **No schema migration needed**: Existing schema sufficient with jsonb toolCalls
