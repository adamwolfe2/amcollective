/**
 * Search API — Global search across clients, documents, kanban cards, and projects.
 *
 * GET /api/search?q=query
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ilike, or, sql } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${q}%`;

  const [clients, documents, cards, projects] = await Promise.all([
    db
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
      .limit(5),
    db
      .select({
        id: schema.documents.id,
        title: schema.documents.title,
        docType: schema.documents.docType,
        companyTag: schema.documents.companyTag,
      })
      .from(schema.documents)
      .where(ilike(schema.documents.title, pattern))
      .limit(5),
    db
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
      .limit(5),
    db
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
      .limit(5),
  ]);

  const results = [
    ...clients.map((c) => ({
      id: c.id,
      type: "client" as const,
      title: c.name,
      subtitle: c.companyName || c.email || undefined,
      url: `/clients/${c.id}`,
    })),
    ...documents.map((d) => ({
      id: d.id,
      type: "document" as const,
      title: d.title,
      subtitle: d.docType,
      url: `/documents`,
      companyTag: d.companyTag,
    })),
    ...cards.map((c) => ({
      id: c.id,
      type: "card" as const,
      title: c.title,
      subtitle: c.clientName ?? undefined,
      url: c.clientId ? `/clients/${c.clientId}/kanban` : `/clients`,
    })),
    ...projects.map((p) => ({
      id: p.id,
      type: "project" as const,
      title: p.name,
      subtitle: p.domain ?? undefined,
      url: `/projects/${p.id}`,
    })),
  ];

  return NextResponse.json({ results });
}
