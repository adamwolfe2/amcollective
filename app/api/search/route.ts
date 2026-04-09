/**
 * Search API — Global full-text + fuzzy search across clients, documents,
 * kanban cards, projects, invoices, leads, sprints, contracts, and companies.
 *
 * GET /api/search?q=query&semantic=true
 * Auth: owner or admin only.
 *
 * Search strategy (in priority order):
 *  1. tsvector full-text search with ts_rank scoring (when columns exist post-migration-0010)
 *  2. pg_trgm similarity matching (typo tolerance / before migration)
 *  3. ilike fallback (if neither extension is available)
 *
 * Combined score: ts_rank * 2 + trgm_similarity
 * Results: grouped by entity type, 5 per type, 25 total max.
 * ts_headline: hit highlighting returned so the UI can bold matched terms.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ilike, or, sql, eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";
import { after } from "next/server";

const TRGM_THRESHOLD = 0.15;
const PER_TYPE_LIMIT = 5;
const TOTAL_LIMIT = 25;

export interface SearchResult {
  id: string;
  type:
    | "client"
    | "document"
    | "card"
    | "project"
    | "invoice"
    | "lead"
    | "sprint"
    | "contract"
    | "company"
    | "semantic";
  title: string;
  subtitle?: string;
  headline?: string; // ts_headline HTML snippet with <b> tags around matches
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

    // Capability detection (cached per cold start)
    const [useTrgm, useVector] = await Promise.all([hasTrgm(), hasTsvector()]);

    // Run all entity searches in parallel
    const searchPromises: Promise<SearchResult[]>[] = [
      searchClients(q, pattern, useTrgm),
      searchDocuments(q, pattern, useTrgm, useVector),
      searchCards(q, pattern, useTrgm),
      searchProjects(q, pattern, useTrgm),
      searchInvoices(q, pattern, useTrgm),
      searchLeads(q, pattern, useTrgm, useVector),
      searchSprints(q, pattern, useTrgm),
      searchContracts(q, pattern, useTrgm, useVector),
      searchCompanies(q, pattern, useTrgm, useVector),
    ];

    if (semantic && process.env.OPENAI_API_KEY) {
      searchPromises.push(searchSemantic(q));
    }

    const allResults = (await Promise.all(searchPromises)).flat();

    // Group by type, keep top PER_TYPE_LIMIT each
    const grouped: Record<string, SearchResult[]> = {};
    for (const r of allResults) {
      if (!grouped[r.type]) grouped[r.type] = [];
      grouped[r.type].push(r);
    }

    const results: SearchResult[] = [];
    for (const type of Object.keys(grouped)) {
      const sorted = grouped[type].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      results.push(...sorted.slice(0, PER_TYPE_LIMIT));
    }

    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const finalResults = results.slice(0, TOTAL_LIMIT);

    // Fire-and-forget: record this search in recent_searches
    after(async () => {
      try {
        await db.insert(schema.recentSearches).values({
          userId,
          query: q,
          resultCount: finalResults.length,
        });
      } catch {
        // Non-critical — never block the response
      }
    });

    return NextResponse.json(
      { success: true, data: { results: finalResults } },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "search" },
      level: "error",
    });
    return apiError("Search failed", 500);
  }
}

// ─── Capability detection (cached per cold start) ─────────────────────────────

let _trgmAvailable: boolean | null = null;
let _tsvectorAvailable: boolean | null = null;

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

async function hasTsvector(): Promise<boolean> {
  if (_tsvectorAvailable !== null) return _tsvectorAvailable;
  try {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'search_vector' LIMIT 1`
    );
    _tsvectorAvailable = (result.rows?.length ?? 0) > 0;
  } catch {
    _tsvectorAvailable = false;
  }
  return _tsvectorAvailable;
}

// ─── Score combiner ───────────────────────────────────────────────────────────

function combineScore(tsRank: number, trgmSim: number): number {
  return tsRank * 2 + trgmSim;
}

// ─── Individual search functions ──────────────────────────────────────────────

async function searchClients(
  q: string,
  pattern: string,
  useTrgm: boolean
): Promise<SearchResult[]> {
  if (useTrgm) {
    const rows = await db
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
      .limit(PER_TYPE_LIMIT);

    return rows.map((c) => ({
      id: c.id,
      type: "client",
      title: c.name,
      subtitle: c.companyName || c.email || undefined,
      url: `/clients/${c.id}`,
      score: c.score,
    }));
  }

  const rows = await db
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
    .limit(PER_TYPE_LIMIT);

  return rows.map((c) => ({
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
  useTrgm: boolean,
  useVector: boolean
): Promise<SearchResult[]> {
  if (useVector) {
    const tsQuery = q.trim().split(/\s+/).join(" & ");
    const rows = await db.execute(
      sql`SELECT
            id,
            title,
            doc_type AS "docType",
            company_tag AS "companyTag",
            ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS ts_rank,
            ${useTrgm ? sql`similarity(title, ${q})` : sql`0`} AS trgm_sim,
            ts_headline('english', COALESCE(content, title), to_tsquery('english', ${tsQuery}),
              'MaxWords=10, MinWords=5, StartSel=<b>, StopSel=</b>') AS headline
          FROM documents
          WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY ts_rank DESC
          LIMIT ${PER_TYPE_LIMIT}`
    );

    return (rows.rows as Array<Record<string, unknown>>).map((d) => ({
      id: d.id as string,
      type: "document" as const,
      title: d.title as string,
      subtitle: d.docType as string | undefined,
      headline: d.headline as string | undefined,
      url: `/documents`,
      companyTag: d.companyTag as string | null,
      score: combineScore(
        Number(d.ts_rank ?? 0),
        Number(d.trgm_sim ?? 0)
      ),
    }));
  }

  if (useTrgm) {
    const rows = await db
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
      .limit(PER_TYPE_LIMIT);

    return rows.map((d) => ({
      id: d.id,
      type: "document",
      title: d.title,
      subtitle: d.docType,
      url: `/documents`,
      companyTag: d.companyTag,
      score: d.score,
    }));
  }

  const rows = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      docType: schema.documents.docType,
      companyTag: schema.documents.companyTag,
    })
    .from(schema.documents)
    .where(ilike(schema.documents.title, pattern))
    .limit(PER_TYPE_LIMIT);

  return rows.map((d) => ({
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
    const rows = await db
      .select({
        id: schema.kanbanCards.id,
        title: schema.kanbanCards.title,
        clientId: schema.kanbanCards.clientId,
        clientName: schema.clients.name,
        score: sql<number>`similarity(${schema.kanbanCards.title}, ${q})`.as("score"),
      })
      .from(schema.kanbanCards)
      .leftJoin(schema.clients, eq(schema.kanbanCards.clientId, schema.clients.id))
      .where(sql`similarity(${schema.kanbanCards.title}, ${q}) > ${TRGM_THRESHOLD}`)
      .orderBy(sql`score DESC`)
      .limit(PER_TYPE_LIMIT);

    return rows.map((c) => ({
      id: c.id,
      type: "card",
      title: c.title,
      subtitle: c.clientName ?? undefined,
      url: c.clientId ? `/clients/${c.clientId}/kanban` : `/clients`,
      score: c.score,
    }));
  }

  const rows = await db
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
    .limit(PER_TYPE_LIMIT);

  return rows.map((c) => ({
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
    const rows = await db
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
      .limit(PER_TYPE_LIMIT);

    return rows.map((p) => ({
      id: p.id,
      type: "project",
      title: p.name,
      subtitle: p.domain ?? undefined,
      url: `/projects/${p.id}`,
      score: p.score,
    }));
  }

  const rows = await db
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
    .limit(PER_TYPE_LIMIT);

  return rows.map((p) => ({
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
  if (useTrgm) {
    const rows = await db
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
      .limit(PER_TYPE_LIMIT);

    return rows.map((i) => ({
      id: i.id,
      type: "invoice",
      title: i.number ?? `INV-${i.id.slice(0, 8)}`,
      subtitle: `${i.clientName ?? "Unknown"} — $${(i.amount / 100).toFixed(0)} (${i.status})`,
      url: `/invoices/${i.id}`,
      score: i.score,
    }));
  }

  const rows = await db
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
    .limit(PER_TYPE_LIMIT);

  return rows.map((i) => ({
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
  useTrgm: boolean,
  useVector: boolean
): Promise<SearchResult[]> {
  if (useVector) {
    const tsQuery = q.trim().split(/\s+/).join(" & ");
    const rows = await db.execute(
      sql`SELECT
            id,
            contact_name AS "contactName",
            company_name AS "companyName",
            stage,
            ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS ts_rank,
            ${useTrgm ? sql`GREATEST(similarity(contact_name, ${q}), similarity(COALESCE(company_name, ''), ${q}))` : sql`0`} AS trgm_sim,
            ts_headline('english', COALESCE(notes, contact_name), to_tsquery('english', ${tsQuery}),
              'MaxWords=10, MinWords=5, StartSel=<b>, StopSel=</b>') AS headline
          FROM leads
          WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY ts_rank DESC
          LIMIT ${PER_TYPE_LIMIT}`
    );

    return (rows.rows as Array<Record<string, unknown>>).map((l) => ({
      id: l.id as string,
      type: "lead" as const,
      title: l.contactName as string,
      subtitle: l.companyName
        ? `${l.companyName} — ${l.stage}`
        : (l.stage as string),
      headline: l.headline as string | undefined,
      url: `/leads/${l.id}`,
      score: combineScore(Number(l.ts_rank ?? 0), Number(l.trgm_sim ?? 0)),
    }));
  }

  if (useTrgm) {
    const rows = await db
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
      .limit(PER_TYPE_LIMIT);

    return rows.map((l) => ({
      id: l.id,
      type: "lead",
      title: l.contactName,
      subtitle: l.companyName ? `${l.companyName} — ${l.stage}` : l.stage,
      url: `/leads/${l.id}`,
      score: l.score,
    }));
  }

  const rows = await db
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
    .limit(PER_TYPE_LIMIT);

  return rows.map((l) => ({
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
    const rows = await db
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
      .limit(PER_TYPE_LIMIT);

    return rows.map((s) => ({
      id: s.id,
      type: "sprint",
      title: s.title,
      subtitle: s.weeklyFocus ?? undefined,
      url: `/sprints/${s.id}`,
      score: s.score,
    }));
  }

  const rows = await db
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
    .limit(PER_TYPE_LIMIT);

  return rows.map((s) => ({
    id: s.id,
    type: "sprint",
    title: s.title,
    subtitle: s.weeklyFocus ?? undefined,
    url: `/sprints/${s.id}`,
    score: 0.5,
  }));
}

async function searchContracts(
  q: string,
  pattern: string,
  useTrgm: boolean,
  useVector: boolean
): Promise<SearchResult[]> {
  if (useVector) {
    const tsQuery = q.trim().split(/\s+/).join(" & ");
    const rows = await db.execute(
      sql`SELECT
            c.id,
            c.title,
            c.contract_number AS "contractNumber",
            c.status,
            cl.name AS "clientName",
            ts_rank(c.search_vector, to_tsquery('english', ${tsQuery})) AS ts_rank,
            ${useTrgm ? sql`GREATEST(similarity(c.title, ${q}), similarity(COALESCE(c.contract_number, ''), ${q}))` : sql`0`} AS trgm_sim,
            ts_headline('english', COALESCE(c.terms, c.title), to_tsquery('english', ${tsQuery}),
              'MaxWords=10, MinWords=5, StartSel=<b>, StopSel=</b>') AS headline
          FROM contracts c
          LEFT JOIN clients cl ON cl.id = c.client_id
          WHERE c.search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY ts_rank DESC
          LIMIT ${PER_TYPE_LIMIT}`
    );

    return (rows.rows as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      type: "contract" as const,
      title: c.title as string,
      subtitle: `${c.clientName ?? "Unknown"} — ${c.contractNumber ?? ""} (${c.status})`,
      headline: c.headline as string | undefined,
      url: `/contracts/${c.id}`,
      score: combineScore(Number(c.ts_rank ?? 0), Number(c.trgm_sim ?? 0)),
    }));
  }

  if (useTrgm) {
    const rows = await db
      .select({
        id: schema.contracts.id,
        title: schema.contracts.title,
        contractNumber: schema.contracts.contractNumber,
        status: schema.contracts.status,
        clientName: schema.clients.name,
        score: sql<number>`GREATEST(
          similarity(${schema.contracts.title}, ${q}),
          similarity(COALESCE(${schema.contracts.contractNumber}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
      .where(
        sql`GREATEST(
          similarity(${schema.contracts.title}, ${q}),
          similarity(COALESCE(${schema.contracts.contractNumber}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(PER_TYPE_LIMIT);

    return rows.map((c) => ({
      id: c.id,
      type: "contract",
      title: c.title,
      subtitle: `${c.clientName ?? "Unknown"} — ${c.contractNumber} (${c.status})`,
      url: `/contracts/${c.id}`,
      score: c.score,
    }));
  }

  const rows = await db
    .select({
      id: schema.contracts.id,
      title: schema.contracts.title,
      contractNumber: schema.contracts.contractNumber,
      status: schema.contracts.status,
      clientName: schema.clients.name,
    })
    .from(schema.contracts)
    .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
    .where(
      or(
        ilike(schema.contracts.title, pattern),
        ilike(schema.contracts.contractNumber, pattern)
      )
    )
    .limit(PER_TYPE_LIMIT);

  return rows.map((c) => ({
    id: c.id,
    type: "contract",
    title: c.title,
    subtitle: `${c.clientName ?? "Unknown"} — ${c.contractNumber} (${c.status})`,
    url: `/contracts/${c.id}`,
    score: 0.5,
  }));
}

async function searchCompanies(
  q: string,
  pattern: string,
  useTrgm: boolean,
  useVector: boolean
): Promise<SearchResult[]> {
  if (useVector) {
    const tsQuery = q.trim().split(/\s+/).join(" & ");
    const rows = await db.execute(
      sql`SELECT
            id,
            name,
            domain,
            slug,
            ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS ts_rank,
            ${useTrgm ? sql`GREATEST(similarity(name, ${q}), similarity(COALESCE(domain, ''), ${q}))` : sql`0`} AS trgm_sim,
            ts_headline('english', COALESCE(description, name), to_tsquery('english', ${tsQuery}),
              'MaxWords=10, MinWords=5, StartSel=<b>, StopSel=</b>') AS headline
          FROM companies
          WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY ts_rank DESC
          LIMIT ${PER_TYPE_LIMIT}`
    );

    return (rows.rows as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      type: "company" as const,
      title: c.name as string,
      subtitle: c.domain as string | undefined,
      headline: c.headline as string | undefined,
      url: `/companies/${c.slug}`,
      score: combineScore(Number(c.ts_rank ?? 0), Number(c.trgm_sim ?? 0)),
    }));
  }

  if (useTrgm) {
    const rows = await db
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        domain: schema.companies.domain,
        slug: schema.companies.slug,
        score: sql<number>`GREATEST(
          similarity(${schema.companies.name}, ${q}),
          similarity(COALESCE(${schema.companies.domain}, ''), ${q})
        )`.as("score"),
      })
      .from(schema.companies)
      .where(
        sql`GREATEST(
          similarity(${schema.companies.name}, ${q}),
          similarity(COALESCE(${schema.companies.domain}, ''), ${q})
        ) > ${TRGM_THRESHOLD}`
      )
      .orderBy(sql`score DESC`)
      .limit(PER_TYPE_LIMIT);

    return rows.map((c) => ({
      id: c.id,
      type: "company",
      title: c.name,
      subtitle: c.domain ?? undefined,
      url: `/companies/${c.slug}`,
      score: c.score,
    }));
  }

  const rows = await db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      domain: schema.companies.domain,
      slug: schema.companies.slug,
    })
    .from(schema.companies)
    .where(
      or(
        ilike(schema.companies.name, pattern),
        ilike(schema.companies.domain, pattern)
      )
    )
    .limit(PER_TYPE_LIMIT);

  return rows.map((c) => ({
    id: c.id,
    type: "company",
    title: c.name,
    subtitle: c.domain ?? undefined,
    url: `/companies/${c.slug}`,
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
