import type { Metadata } from "next";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, or, sql } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Knowledge | AM Collective",
};
import { KnowledgeList } from "./knowledge-list";

export default async function KnowledgePage() {
  const articles = await db
    .select()
    .from(schema.documents)
    .where(
      or(
        eq(schema.documents.docType, "sop"),
        eq(schema.documents.docType, "note"),
        eq(schema.documents.docType, "brief")
      )
    )
    .orderBy(desc(schema.documents.updatedAt))
    .limit(200);

  // Get all tags for these articles
  const docIds = articles.map((a) => a.id);
  const allTags =
    docIds.length > 0
      ? await db
          .select()
          .from(schema.documentTags)
          .where(
            sql`${schema.documentTags.documentId} IN (${sql.join(
              docIds.map((id) => sql`${id}`),
              sql`,`
            )})`
          )
      : [];

  const tagMap = new Map<string, string[]>();
  const uniqueTags = new Set<string>();
  for (const t of allTags) {
    if (!tagMap.has(t.documentId)) tagMap.set(t.documentId, []);
    tagMap.get(t.documentId)!.push(t.tag);
    uniqueTags.add(t.tag);
  }

  const articlesWithTags = articles.map((a) => ({
    ...a,
    tags: tagMap.get(a.id) ?? [],
  }));

  return (
    <div>
      <KnowledgeList
        initialArticles={articlesWithTags}
        allTags={Array.from(uniqueTags).sort()}
      />
    </div>
  );
}
