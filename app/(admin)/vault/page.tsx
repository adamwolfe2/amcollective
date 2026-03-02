import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { VaultTable } from "./vault-client";

async function getCredentials() {
  return db
    .select({
      id: schema.credentials.id,
      label: schema.credentials.label,
      service: schema.credentials.service,
      username: schema.credentials.username,
      url: schema.credentials.url,
      notes: schema.credentials.notes,
      clientId: schema.credentials.clientId,
      projectId: schema.credentials.projectId,
      hasPassword: schema.credentials.passwordEncrypted,
      createdAt: schema.credentials.createdAt,
    })
    .from(schema.credentials)
    .orderBy(desc(schema.credentials.createdAt));
}

export default async function VaultPage() {
  const rows = await getCredentials();

  const mapped = rows.map((r) => ({
    ...r,
    hasPassword: !!r.hasPassword,
  }));

  return (
    <div>
      <VaultTable rows={mapped} />
    </div>
  );
}
