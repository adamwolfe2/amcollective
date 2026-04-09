import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import dynamic from "next/dynamic";

const ArticleEditor = dynamic(() => import("./article-editor").then((m) => m.ArticleEditor), {
  loading: () => <div className="h-96 bg-[#0A0A0A]/5 animate-pulse" />,
});

type PageProps = { params: Promise<{ id: string }> };

export default async function KnowledgeArticlePage({ params }: PageProps) {
  const { id } = await params;

  const [[doc], tags] = await Promise.all([
    db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1),
    db
      .select({ tag: schema.documentTags.tag })
      .from(schema.documentTags)
      .where(eq(schema.documentTags.documentId, id)),
  ]);

  if (!doc) notFound();

  const TYPE_STYLES: Record<string, string> = {
    sop: "border-[#0A0A0A] bg-[#0A0A0A] text-white",
    note: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
    brief: "border-[#0A0A0A]/30 bg-transparent text-[#0A0A0A]/70",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex px-1.5 py-0.5 text-[10px] font-mono border rounded-none ${
                TYPE_STYLES[doc.docType] || TYPE_STYLES.note
              }`}
            >
              {doc.docType.toUpperCase()}
            </span>
            {tags.map((t) => (
              <span
                key={t.tag}
                className="font-mono text-[10px] border border-[#0A0A0A]/10 px-1 py-0.5 text-[#0A0A0A]/40"
              >
                {t.tag}
              </span>
            ))}
          </div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {doc.title}
          </h1>
          <p className="font-mono text-xs text-[#0A0A0A]/30 mt-1">
            Last updated: {format(doc.updatedAt, "MMM d, yyyy h:mm a")}
          </p>
        </div>
      </div>

      <ArticleEditor
        articleId={id}
        initialTitle={doc.title}
        initialContent={doc.content ?? ""}
        initialDocType={doc.docType}
        initialTags={tags.map((t) => t.tag)}
      />
    </div>
  );
}
