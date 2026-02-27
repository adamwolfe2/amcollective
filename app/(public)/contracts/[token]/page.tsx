import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ContractSigningForm } from "./signing-form";

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicContractPage({ params }: PageProps) {
  const { token } = await params;

  const [row] = await db
    .select({
      contract: schema.contracts,
      clientName: schema.clients.name,
      clientCompany: schema.clients.companyName,
    })
    .from(schema.contracts)
    .leftJoin(
      schema.clients,
      eq(schema.contracts.clientId, schema.clients.id)
    )
    .where(eq(schema.contracts.token, token))
    .limit(1);

  if (!row) notFound();

  const { contract } = row;
  const sections = (contract.sections ?? []) as Array<{
    title: string;
    content: string;
    isRequired: boolean;
  }>;

  const isExpired = contract.expiresAt && new Date() > contract.expiresAt;
  const isSigned = ["signed", "countersigned", "active"].includes(
    contract.status
  );
  const isTerminated = contract.status === "terminated";
  const isExpiredStatus = contract.status === "expired";
  const canSign = ["sent", "viewed"].includes(contract.status) && !isExpired;

  return (
    <div className="min-h-screen bg-[#F3F3EF] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="border border-[#0A0A0A] bg-white p-6 mb-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40 mb-2">
            AM Collective
          </p>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {contract.title}
          </h1>
          <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
            {contract.contractNumber}
          </p>
          {row.clientName && (
            <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
              Prepared for: {row.clientName}
              {row.clientCompany ? ` / ${row.clientCompany}` : ""}
            </p>
          )}
        </div>

        {/* Status Messages */}
        {isSigned && (
          <div className="border border-green-700 bg-green-50 p-6 mb-4">
            <h2 className="font-serif font-bold text-green-800 mb-1">
              Contract Signed
            </h2>
            <p className="font-serif text-sm text-green-700">
              This contract has been signed. Thank you for your agreement.
            </p>
          </div>
        )}

        {(isExpiredStatus || (isExpired && !isSigned)) && (
          <div className="border border-[#0A0A0A]/30 bg-[#0A0A0A]/5 p-6 mb-4">
            <h2 className="font-serif font-bold text-[#0A0A0A]/50 mb-1">
              Signing Link Expired
            </h2>
            <p className="font-serif text-sm text-[#0A0A0A]/40">
              This contract signing link has expired. Please contact us
              for a new link.
            </p>
          </div>
        )}

        {isTerminated && (
          <div className="border border-red-700 bg-red-50 p-6 mb-4">
            <h2 className="font-serif font-bold text-red-800 mb-1">
              Contract Terminated
            </h2>
            <p className="font-serif text-sm text-red-700">
              This contract has been terminated and is no longer active.
            </p>
          </div>
        )}

        {/* Contract Body */}
        <div className="border border-[#0A0A0A] bg-white divide-y divide-[#0A0A0A]/10">
          {sections.map((section, i) => (
            <div key={i} className="px-6 py-5">
              <h3 className="font-serif font-bold text-sm mb-2">
                {i + 1}. {section.title}
              </h3>
              <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        {/* Terms */}
        {contract.terms && (
          <div className="border border-[#0A0A0A] bg-white p-6 mt-4">
            <h2 className="font-serif font-bold text-sm mb-2">
              Additional Terms
            </h2>
            <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap leading-relaxed">
              {contract.terms}
            </p>
          </div>
        )}

        {/* Signing Form */}
        {canSign && (
          <div className="border border-[#0A0A0A] bg-white p-6 mt-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
              Sign This Contract
            </h2>
            <ContractSigningForm token={token} />
          </div>
        )}
      </div>
    </div>
  );
}
