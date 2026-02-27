import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { NewProposalForm } from "./new-proposal-form";

export default async function NewProposalPage() {
  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients);

  return (
    <div>
      <h1 className="text-2xl font-bold font-serif tracking-tight mb-6">
        New Proposal
      </h1>
      <NewProposalForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
