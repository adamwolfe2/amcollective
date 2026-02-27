/**
 * Default contract section templates and proposal-to-contract builder.
 */

import type { ContractSection } from "@/lib/db/schema/contracts";

export const DEFAULT_CONTRACT_SECTIONS: ContractSection[] = [
  {
    title: "Scope of Work",
    content: "{{SCOPE_FROM_PROPOSAL}}",
    isRequired: true,
  },
  {
    title: "Payment Terms",
    content:
      "Client agrees to pay the total amount specified in the pricing section. Invoices are due within 30 days of receipt. Late payments accrue interest at 1.5% per month.",
    isRequired: true,
  },
  {
    title: "Intellectual Property",
    content:
      "Upon receipt of full payment, all deliverables are assigned to Client. The service provider retains rights to general methodologies and tools developed.",
    isRequired: true,
  },
  {
    title: "Confidentiality",
    content:
      "Both parties agree to keep confidential information of the other party strictly confidential for a period of 2 years following contract termination.",
    isRequired: true,
  },
  {
    title: "Termination",
    content:
      "Either party may terminate with 14 days written notice. Client is responsible for payment of work completed through the termination date.",
    isRequired: true,
  },
  {
    title: "Limitation of Liability",
    content:
      "Total liability shall not exceed the fees paid in the 3 months preceding the claim.",
    isRequired: true,
  },
];

export function buildSectionsFromProposal(proposal: {
  summary: string | null;
  scope: Array<{ title: string; content: string }> | null;
  deliverables: string[] | null;
  timeline: string | null;
}): ContractSection[] {
  const scopeContent = [
    proposal.summary,
    proposal.scope
      ?.map((s) => `${s.title}: ${s.content}`)
      .join("\n\n"),
    proposal.deliverables
      ? "Deliverables:\n" + proposal.deliverables.map((d) => `- ${d}`).join("\n")
      : "",
    proposal.timeline ? `Timeline: ${proposal.timeline}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return DEFAULT_CONTRACT_SECTIONS.map((s) => ({
    ...s,
    content: s.content.replace("{{SCOPE_FROM_PROPOSAL}}", scopeContent || "To be defined."),
  }));
}
