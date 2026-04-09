/**
 * Search API — Global fuzzy search across clients, documents, kanban cards, projects, and invoices.
 *
 * GET /api/search?q=query&semantic=true
 * Auth: owner or admin only.
 *
 * Uses pg_trgm similarity for fuzzy matching + optional semantic vector search.
 * Falls back to ilike if pg_trgm is not available.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ilike, or, sql, eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

const TRGM_THRESHOLD = 0.15; // Minimum trigram similarity score

interface SearchResult {
  id: string;
  type: "client" | "document" | "card" | "project" | "invoice" | "lead" | "sprint" | "semantic";
  title: string;
  subtitle?: string;
  url: string;
  companyTag?: string | null;
  score?: number;
}

export async function GET(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return apiError("Rate limited", 429);
    }
  }

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return apiError("Unauthorized", 401);
    }

    const q = req.nextUrl.searchParams.get("q")?.trim();
    const semantic = req.nextUrl.searchParams.get("semantic") === "true";

    if (!q || q.length < 2) {
      return apiSuccess({ results: [] });
    }

    const pattern = `%${q}%`;

    // Check if pg_trgm is available (cached on first call)
    const useTrgm = await hasTrgm();

    // Run all searches in parallel
    const searchPromises: Promise<SearchResult[]>[] = [
      searchClients(q, pattern, useTrgm),
      searchDocuments(q, pattern, useTrgm),
      searchCards(q, pattern, useTrgm),
      searchProjects(q, pattern, useTrgm),
      searchInvoices(q, pattern, useTrgm),
      searchLeads(q, pattern, useTrgm),
      searchSprints(q, pattern, useTrgm),
    ];

    // Optional semantic search
    if (semantic && process.env.OPENAI_API_KEY) {
      searchPromises.push(searchSemantic(q));
    }

    const allResults = await Promise.all(searchPromises);
    const results = allResults.flat();

    // Sort by score (highest first), then group by type
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return NextResponse.json({ success: true, data: { results } }, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "search" },
      level: "error",
    });
    return apiError("Search failed", 500);
  }
}

// ─── pg_trgm check (cached) ─────────────────────────────────────────────────

let _trgmAvailable: boolean | null = null;

async function hasTrgm(): Promise<boolean> {
  if (_trgmAvailable !== null) return _trgmAvailable;
  try {
    await db.execute(sql`SELECT 'test' % 'test'`);
    _trgmAvailable = true;
  } catch {
    _trgmAvailable = false;
  }
  return _trgmAvailable;
}

// ─── Individual search functions ─────────────────────────────────────────────

async function searchClients(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        companyName: schema.clients.companyName,
        email: schema.clients.email,
        score: sql<number>`GREATEST(
          similarity(${schema.clients.name}, ${q}),
          similarity(COALESCE(${schema.clients.companyName}, ''), ${q}),
          similarity(COALESCE(${schema.clients.email}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.clients)
      .where(
        sql`GREATEST(
          similarity(${schema.clients.name}, ${q}),
          similarity(COALESCE(${schema.clients.companyName}, ''), ${q}),
          similarity(COALESCE(${schema.clients.email}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((c) => ({
      id: c.id,
      type: "client",
      title: c.name,
      subtitle: c.companyName || c.email || undefined,
      url: `/clients/${c.id}`,
      score: c.score,
    }));
  }

  // Fallback: ilike
  const results = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      companyName: schema.clients.companyName,
      email: schema.clients.email,
    })
    .from(schema.clients)
    .where(
      or(
        ilike(schema.clients.name, pattern),
        ilike(schema.clients.companyName, pattern),
        ilike(schema.clients.email, pattern)
      )
    )
    .limit(5);

  return results.map((c) => ({
    id: c.id,
    type: "client",
    title: c.name,
    subtitle: c.companyName || c.email || undefined,
    url: `/clients/${c.id}`,
    score: 0.5,
  }));
}

async function searchDocuments(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.documents.id,
        title: schema.documents.title,
        docType: schema.documents.docType,
        companyTag: schema.documents.companyTag,
        score: sql<number>`similarity(${schema.documents.title}, ${q})`.as("score"),
      })
      .from(schema.documents)
      .where(sql`similarity(${schema.documents.title}, ${q}) > ${TRGM_THRESHOLD}`)
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((d) => ({
      id: d.id,
      type: "document",
      title: d.title,
      subtitle: d.docType,
      url: `/documents`,
      companyTag: d.companyTag,
      score: d.score,
    }));
  }

  const results = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      docType: schema.documents.docType,
      companyTag: schema.documents.companyTag,
    })
    .from(schema.documents)
    .where(ilike(schema.documents.title, pattern))
    .limit(5);

  return results.map((d) => ({
    id: d.id,
    type: "document",
    title: d.title,
    subtitle: d.docType,
    url: `/documents`,
    companyTag: d.companyTag,
    score: 0.5,
  }));
}

async function searchCards(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.kanbanCards.id,
        title: schema.kanbanCards.title,
        clientId: schema.kanbanCards.clientId,
        clientName: schema.clients.name,
        score: sql<number>`similarity(${schema.kanbanCards.title}, ${q})`.as("score"),
      })
      .from(schema.kanbanCards)
      .leftJoin(
        schema.clients,
        eq(schema.kanbanCards.clientId, schema.clients.id)
      )
      .where(sql`similarity(${schema.kanbanCards.title}, ${q}) > ${TRGM_THRESHOLD}`)
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((c) => ({
      id: c.id,
      type: "card",
      title: c.title,
      subtitle: c.clientName ?? undefined,
      url: c.clientId ? `/clients/${c.clientId}/kanban` : `/clients`,
      score: c.score,
    }));
  }

  const results = await db
    .select({
      id: schema.kanbanCards.id,
      title: schema.kanbanCards.title,
      clientId: schema.kanbanCards.clientId,
      clientName: schema.clients.name,
    })
    .from(schema.kanbanCards)
    .leftJoin(
      schema.clients,
      sql`${schema.kanbanCards.clientId} = ${schema.clients.id}`
    )
    .where(ilike(schema.kanbanCards.title, pattern))
    .limit(5);

  return results.map((c) => ({
    id: c.id,
    type: "card",
    title: c.title,
    subtitle: c.clientName ?? undefined,
    url: c.clientId ? `/clients/${c.clientId}/kanban` : `/clients`,
    score: 0.5,
  }));
}

async function searchProjects(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.portfolioProjects.id,
        name: schema.portfolioProjects.name,
        domain: schema.portfolioProjects.domain,
        score: sql<number>`GREATEST(
          similarity(${schema.portfolioProjects.name}, ${q}),
          similarity(COALESCE(${schema.portfolioProjects.domain}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.portfolioProjects)
      .where(
        sql`GREATEST(
          similarity(${schema.portfolioProjects.name}, ${q}),
          similarity(COALESCE(${schema.portfolioProjects.domain}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((p) => ({
      id: p.id,
      type: "project",
      title: p.name,
      subtitle: p.domain ?? undefined,
      url: `/projects/${p.id}`,
      score: p.score,
    }));
  }

  const results = await db
    .select({
      id: schema.portfolioProjects.id,
      name: schema.portfolioProjects.name,
      domain: schema.portfolioProjects.domain,
    })
    .from(schema.portfolioProjects)
    .where(
      or(
        ilike(schema.portfolioProjects.name, pattern),
        ilike(schema.portfolioProjects.domain, pattern)
      )
    )
    .limit(5);

  return results.map((p) => ({
    id: p.id,
    type: "project",
    title: p.name,
    subtitle: p.domain ?? undefined,
    url: `/projects/${p.id}`,
    score: 0.5,
  }));
}

async function searchInvoices(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  // Invoice search by number or client name
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.invoices.id,
        number: schema.invoices.number,
        amount: schema.invoices.amount,
        status: schema.invoices.status,
        clientName: schema.clients.name,
        score: sql<number>`GREATEST(
          similarity(COALESCE(${schema.invoices.number}, ''), ${q}),
          similarity(COALESCE(${schema.clients.name}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.invoices)
      .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
      .where(
        sql`GREATEST(
          similarity(COALESCE(${schema.invoices.number}, ''), ${q}),
          similarity(COALESCE(${schema.clients.name}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((i) => ({
      id: i.id,
      type: "invoice",
      title: i.number ?? `INV-${i.id.slice(0, 8)}`,
      subtitle: `${i.clientName ?? "Unknown"} — $${(i.amount / 100).toFixed(0)} (${i.status})`,
      url: `/invoices/${i.id}`,
      score: i.score,
    }));
  }

  const results = await db
    .select({
      id: schema.invoices.id,
      number: schema.invoices.number,
      amount: schema.invoices.amount,
      status: schema.invoices.status,
      clientName: schema.clients.name,
    })
    .from(schema.invoices)
    .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
    .where(
      or(
        ilike(schema.invoices.number, pattern),
        ilike(schema.clients.name, pattern)
      )
    )
    .limit(5);

  return results.map((i) => ({
    id: i.id,
    type: "invoice",
    title: i.number ?? `INV-${i.id.slice(0, 8)}`,
    subtitle: `${i.clientName ?? "Unknown"} — $${(i.amount / 100).toFixed(0)} (${i.status})`,
    url: `/invoices/${i.id}`,
    score: 0.5,
  }));
}

async function searchLeads(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.leads.id,
        contactName: schema.leads.contactName,
        companyName: schema.leads.companyName,
        stage: schema.leads.stage,
        score: sql<number>`GREATEST(
          similarity(${schema.leads.contactName}, ${q}),
          similarity(COALESCE(${schema.leads.companyName}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.leads)
      .where(
        sql`GREATEST(
          similarity(${schema.leads.contactName}, ${q}),
          similarity(COALESCE(${schema.leads.companyName}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((l) => ({
      id: l.id,
      type: "lead",
      title: l.contactName,
      subtitle: l.companyName ? `${l.companyName} — ${l.stage}` : l.stage,
      url: `/leads/${l.id}`,
      score: l.score,
    }));
  }

  const results = await db
    .select({
      id: schema.leads.id,
      contactName: schema.leads.contactName,
      companyName: schema.leads.companyName,
      stage: schema.leads.stage,
    })
    .from(schema.leads)
    .where(
      or(
        ilike(schema.leads.contactName, pattern),
        ilike(schema.leads.companyName, pattern)
      )
    )
    .limit(5);

  return results.map((l) => ({
    id: l.id,
    type: "lead",
    title: l.contactName,
    subtitle: l.companyName ? `${l.companyName} — ${l.stage}` : l.stage,
    url: `/leads/${l.id}`,
    score: 0.5,
  }));
}

async function searchSprints(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const results = await db
      .select({
        id: schema.weeklySprints.id,
        title: schema.weeklySprints.title,
        weeklyFocus: schema.weeklySprints.weeklyFocus,
        score: sql<number>`GREATEST(
          similarity(${schema.weeklySprints.title}, ${q}),
          similarity(COALESCE(${schema.weeklySprints.weeklyFocus}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.weeklySprints)
      .where(
        sql`GREATEST(
          similarity(${schema.weeklySprints.title}, ${q}),
          similarity(COALESCE(${schema.weeklySprints.weeklyFocus}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(5);

    return results.map((s) => ({
      id: s.id,
      type: "sprint",
      title: s.title,
      subtitle: s.weeklyFocus ?? undefined,
      url: `/sprints/${s.id}`,
      score: s.score,
    }));
  }

  const results = await db
    .select({
      id: schema.weeklySprints.id,
      title: schema.weeklySprints.title,
      weeklyFocus: schema.weeklySprints.weeklyFocus,
    })
    .from(schema.weeklySprints)
    .where(
      or(
        ilike(schema.weeklySprints.title, pattern),
        ilike(schema.weeklySprints.weeklyFocus, pattern)
      )
    )
    .limit(5);

  return results.map((s) => ({
    id: s.id,
    type: "sprint",
    title: s.title,
    subtitle: s.weeklyFocus ?? undefined,
    url: `/sprints/${s.id}`,
    score: 0.5,
  }));
}

async function searchSemantic(q: string): Promise<SearchResult[]> {
  try {
    const { searchSimilar } = await import("@/lib/ai/embeddings");
    const results = await searchSimilar(q, 3);

    return results
      .filter((r) => r.similarity > 0.5)
      .map((r) => ({
        id: r.sourceId ?? "unknown",
        type: "semantic" as const,
        title: r.content.slice(0, 80) + (r.content.length > 80 ? "..." : ""),
        subtitle: `${r.sourceType} — ${Math.round(r.similarity * 100)}% match`,
        url: getSemanticUrl(r.sourceType, r.sourceId),
        score: r.similarity,
      }));
  } catch {
    return [];
  }
}

function getSemanticUrl(sourceType: string, sourceId: string | null): string {
  if (!sourceId) return "/dashboard";
  switch (sourceType) {
    case "client_note":
      return `/clients/${sourceId}`;
    case "project_doc":
      return `/documents`;
    case "invoice":
      return `/invoices/${sourceId}`;
    case "meeting":
      return `/meetings`;
    case "sop":
      return `/documents`;
    default:
      return "/dashboard";
  }
}
