import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ContractActions } from "./contract-actions";

type PageProps = { params: Promise<{ id: string }> };

function formatCents(cents: number | null): string {
  if (!cents) return "-";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  sent: "border-blue-700 bg-blue-50 text-blue-700",
  viewed: "border-amber-700 bg-amber-50 text-amber-700",
  signed: "border-green-700 bg-green-50 text-green-700",
  countersigned: "border-green-800 bg-green-50 text-green-800",
  active: "border-green-900 bg-green-100 text-green-900",
  expired: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30",
  terminated: "border-red-700 bg-red-50 text-red-700",
};

export default async function ContractDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [row] = await db
    .select({
      contract: schema.contracts,
      clientName: schema.clients.name,
      clientCompany: schema.clients.companyName,
      clientEmail: schema.clients.email,
    })
    .from(schema.contracts)
    .leftJoin(
      schema.clients,
      eq(schema.contracts.clientId, schema.clients.id)
    )
    .where(eq(schema.contracts.id, id))
    .limit(1);

  if (!row) notFound();

  const { contract } = row;
  const sections = (contract.sections ?? []) as Array<{
    title: string;
    content: string;
    isRequired: boolean;
  }>;

  const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/contracts/sign/${contract.token}`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-xs text-[#0A0A0A]/40 mb-1">
            {contract.contractNumber}
          </p>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {contract.title}
          </h1>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-1">
            {row.clientName}
            {row.clientCompany ? ` / ${row.clientCompany}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 text-sm font-mono border rounded-none ${
            STATUS_STYLES[contract.status] || STATUS_STYLES.draft
          }`}
        >
          {contract.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column -- Contract Body */}
        <div className="lg:col-span-2 space-y-4">
          {/* Sections */}
          <div className="border border-[#0A0A0A] bg-white">
            <div className="border-b border-[#0A0A0A]/10 px-6 py-4">
              <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
                Contract Sections
              </h2>
            </div>
            <div className="divide-y divide-[#0A0A0A]/10">
              {sections.map((section, i) => (
                <div key={i} className="px-6 py-4">
                  <h3 className="font-serif font-bold text-sm mb-2">
                    {section.title}
                    {section.isRequired && (
                      <span className="ml-2 font-mono text-[10px] text-red-600">
                        REQUIRED
                      </span>
                    )}
                  </h3>
                  <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                    {section.content}
                  </p>
                </div>
              ))}
              {sections.length === 0 && (
                <div className="px-6 py-8 text-center">
                  <p className="font-serif text-sm text-[#0A0A0A]/40">
                    No sections defined. Edit this contract to add content.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Terms */}
          {contract.terms && (
            <div className="border border-[#0A0A0A] bg-white p-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
                Additional Terms
              </h2>
              <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {contract.terms}
              </p>
            </div>
          )}

          {/* Signature Info */}
          {contract.signedAt && (
            <div className="border border-[#0A0A0A] bg-white p-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
                Client Signature
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                    Signed By
                  </p>
                  <p className="font-serif text-sm">
                    {contract.clientSignatoryName || "Unknown"}
                  </p>
                  {contract.clientSignatoryTitle && (
                    <p className="font-serif text-xs text-[#0A0A0A]/50">
                      {contract.clientSignatoryTitle}
                    </p>
                  )}
                </div>
                <div>
                  <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                    Signed At
                  </p>
                  <p className="font-mono text-sm">
                    {format(contract.signedAt, "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                {contract.signerIp && (
                  <div>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                      IP Address
                    </p>
                    <p className="font-mono text-xs">{contract.signerIp}</p>
                  </div>
                )}
              </div>
              {contract.signatureData && (
                <div className="mt-4 border-t border-[#0A0A0A]/10 pt-4">
                  <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-2">
                    Signature
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contract.signatureData}
                    alt="Client signature"
                    className="max-h-20 border border-[#0A0A0A]/10 p-2 bg-white"
                  />
                </div>
              )}
            </div>
          )}

          {/* Countersign Info */}
          {contract.countersignedAt && (
            <div className="border border-green-700 bg-green-50 p-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-green-800 mb-2">
                Countersigned
              </h2>
              <p className="font-mono text-sm text-green-800">
                {format(contract.countersignedAt, "MMM d, yyyy h:mm a")}
              </p>
            </div>
          )}
        </div>

        {/* Right Column -- Details + Actions */}
        <div className="space-y-4">
          {/* Details Card */}
          <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
              Details
            </h2>

            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                Value
              </p>
              <p className="font-mono text-lg font-bold">
                {formatCents(contract.totalValue)}
              </p>
            </div>

            {contract.startDate && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  Start Date
                </p>
                <p className="font-mono text-sm">
                  {format(new Date(contract.startDate), "MMM d, yyyy")}
                </p>
              </div>
            )}

            {contract.endDate && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  End Date
                </p>
                <p className="font-mono text-sm">
                  {format(new Date(contract.endDate), "MMM d, yyyy")}
                </p>
              </div>
            )}

            {contract.expiresAt && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                  Signing Link Expires
                </p>
                <p className="font-mono text-sm">
                  {format(contract.expiresAt, "MMM d, yyyy")}
                </p>
              </div>
            )}

            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                Auto-Invoice on Sign
              </p>
              <p className="font-mono text-sm">
                {contract.autoInvoiceOnSign ? "Yes" : "No"}
              </p>
            </div>

            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-0.5">
                Created
              </p>
              <p className="font-mono text-sm">
                {format(contract.createdAt, "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* Signing URL */}
          {contract.status !== "draft" && (
            <div className="border border-[#0A0A0A] bg-white p-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
                Signing Link
              </h2>
              <p className="font-mono text-xs text-[#0A0A0A]/60 break-all">
                {signingUrl}
              </p>
            </div>
          )}

          {/* Actions */}
          <ContractActions
            contractId={contract.id}
            status={contract.status}
          />
        </div>
      </div>
    </div>
  );
}
