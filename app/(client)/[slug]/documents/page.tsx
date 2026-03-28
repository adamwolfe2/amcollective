import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { FileText, Paperclip, Download } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DOC_TYPE_STYLES: Record<string, string> = {
  contract: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
  proposal: "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/25",
  note: "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/10",
  sop: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
  invoice: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
  brief: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/15",
  other: "bg-[#0A0A0A]/5 text-[#0A0A0A]/40 border-[#0A0A0A]/10",
};

export default async function ClientDocumentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);

  if (!client) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-[#0A0A0A]/60">
          No client account linked
        </p>
        <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
          Your user account is not associated with a client record.
        </p>
      </div>
    );
  }

  const docs = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      fileUrl: schema.documents.fileUrl,
      fileName: schema.documents.fileName,
      fileSizeBytes: schema.documents.fileSizeBytes,
      docType: schema.documents.docType,
      createdAt: schema.documents.createdAt,
    })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.clientId, client.id),
        eq(schema.documents.isClientVisible, true)
      )
    )
    .orderBy(desc(schema.documents.createdAt));

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Documents
        </h1>
        <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
          Shared files and documents from your AM Collective team
        </p>
      </div>

      {/* Document List */}
      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents shared with you yet"
          description="Files and documents shared by your AM Collective team will appear here."
        />
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="border border-[#0A0A0A]/10 bg-white p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 border border-[#0A0A0A]/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-[#0A0A0A]/30" />
                </div>
                <div className="min-w-0">
                  <p className="font-serif font-medium text-[#0A0A0A] truncate">
                    {doc.title}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[8px] uppercase tracking-wider rounded-none px-1.5 py-0 ${
                        DOC_TYPE_STYLES[doc.docType] || DOC_TYPE_STYLES.other
                      }`}
                    >
                      {doc.docType}
                    </Badge>
                    {doc.fileName && (
                      <span className="flex items-center gap-1 font-mono text-[10px] text-[#0A0A0A]/40">
                        <Paperclip className="h-2.5 w-2.5" />
                        {doc.fileName}
                        {doc.fileSizeBytes && (
                          <span className="text-[#0A0A0A]/25">
                            ({formatFileSize(doc.fileSizeBytes)})
                          </span>
                        )}
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                      {format(new Date(doc.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
              </div>

              {doc.fileUrl && (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2 border border-[#0A0A0A]/10 hover:border-[#0A0A0A]/30 transition-colors"
                  title="Download file"
                >
                  <Download className="h-4 w-4 text-[#0A0A0A]/40" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
