/**
 * One-shot: cancel engagements belonging to churned (non-master-list) clients.
 */

import { db } from "../lib/db";
import { clients, engagements } from "../lib/db/schema/crm";
import { eq, and, inArray } from "drizzle-orm";

async function main() {
  const churned = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.paymentStatus, "churned"));

  if (!churned.length) {
    console.log("No churned clients.");
    return;
  }

  const churnedIds = churned.map((c) => c.id);
  console.log(`Cancelling engagements for ${churned.length} churned clients:`);
  churned.forEach((c) => console.log(`  - ${c.name} (${c.id})`));

  const result = await db
    .update(engagements)
    .set({ status: "cancelled", endDate: new Date(), updatedAt: new Date() })
    .where(
      and(
        inArray(engagements.clientId, churnedIds),
        eq(engagements.status, "active")
      )
    )
    .returning({ id: engagements.id, title: engagements.title });

  console.log(`\nCancelled ${result.length} engagements:`);
  result.forEach((e) => console.log(`  - ${e.title} (${e.id})`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
