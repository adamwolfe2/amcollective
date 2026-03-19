import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, count, type SQL } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Documents | AM Collective",
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Paperclip, Eye } from "lucide-react";
import { UploadDocumentDialog } from "./upload-dialog";
import { DocumentFilters } from "./document-filters";
import { DocumentActions } from "./document-actions";
import { getStatusBadge, docTypeCategory } from "@/lib/ui/status-colors";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    docType?: string;
    companyTag?: string;
    clientId?: string;
  }>;
}) {
  const params = await searchParams;

  // Build filters
  const conditions: SQL[] = [];
  if (params.docType) {
    conditions.push(
      eq(
        schema.documents.docType,
        params.docType as (typeof schema.docTypeEnum.enumValues)[number]
      )
    );
  }
  if (params.companyTag) {
    conditions.push(
      eq(
        schema.documents.companyTag,
        params.companyTag as (typeof schema.companyTagEnum.enumValues)[number]
      )
    );
  }
  if (params.clientId) {
    conditions.push(eq(schema.documents.clientId, params.clientId));
  }

  const [docs, [totalResult], clients] = await Promise.all([
    db
      .select({
        id: schema.documents.id,
        companyTag: schema.documents.companyTag,
        clientId: schema.documents.clientId,
        title: schema.documents.title,
        fileUrl: schema.documents.fileUrl,
        fileName: schema.documents.fileName,
        fileSizeBytes: schema.documents.fileSizeBytes,
        docType: schema.documents.docType,
        isClientVisible: schema.documents.isClientVisible,
        createdAt: schema.documents.createdAt,
        clientName: schema.clients.name,
      })
      .from(schema.documents)
      .leftJoin(schema.clients, eq(schema.documents.clientId, schema.clients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.documents.createdAt))
      .limit(100),
    db.select({ total: count() }).from(schema.documents),
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients)
      .orderBy(schema.clients.name),
  ]);

  const totalCount = totalResult?.total ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Documents
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
            {totalCount}
          </span>
        </div>
        <UploadDocumentDialog clients={clients} />
      </div>

      {/* Filters */}
      <div className="mb-4">
        <DocumentFilters />
      </div>

      {/* Table */}
      {docs.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <FileText className="h-8 w-8 mx-auto text-[#0A0A0A]/20 mb-3" />
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            {conditions.length > 0
              ? "No documents match your filters."
              : "No documents yet."}
          </p>
          <p className="text-[#0A0A0A]/30 font-mono text-xs mt-2">
            {conditions.length > 0
              ? "Try different filters."
              : "Upload your first document to get started."}
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Title
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Type
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Company
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Client
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  File
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Visible
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Created
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="border-[#0A0A0A]/10 group"
                >
                  <TableCell>
                    <span className="font-serif font-medium text-[#0A0A0A]">
                      {doc.title}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
                        getStatusBadge(doc.docType, docTypeCategory)
                      }`}
                    >
                      {doc.docType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/50">
                    {doc.companyTag.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    {doc.clientName ? (
                      <Link
                        href={`/clients/${doc.clientId}`}
                        className="font-mono text-xs text-[#0A0A0A]/60 hover:underline underline-offset-2"
                      >
                        {doc.clientName}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-[#0A0A0A]/30">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.fileName ? (
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="h-3 w-3 text-[#0A0A0A]/30" />
                        <span className="font-mono text-xs text-[#0A0A0A]/50 truncate max-w-[120px]">
                          {doc.fileName}
                        </span>
                        {doc.fileSizeBytes && (
                          <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                            {formatFileSize(doc.fileSizeBytes)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-[#0A0A0A]/30">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.isClientVisible && (
                      <Eye className="h-3.5 w-3.5 text-[#0A0A0A]/30" />
                    )}
                  </TableCell>
                  <TableCell className="text-[#0A0A0A]/40 font-mono text-xs">
                    {format(new Date(doc.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <DocumentActions id={doc.id} fileUrl={doc.fileUrl} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
