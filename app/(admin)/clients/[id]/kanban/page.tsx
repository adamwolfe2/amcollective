import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { KanbanBoard } from "./kanban-board";

export default async function ClientKanbanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch client
  const [client] = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!client) notFound();

  // Fetch columns, cards, and team members in parallel
  const [columns, cards, members] = await Promise.all([
    db
      .select()
      .from(schema.kanbanColumns)
      .where(eq(schema.kanbanColumns.clientId, id))
      .orderBy(asc(schema.kanbanColumns.position)),
    db
      .select({
        id: schema.kanbanCards.id,
        columnId: schema.kanbanCards.columnId,
        title: schema.kanbanCards.title,
        description: schema.kanbanCards.description,
        dueDate: schema.kanbanCards.dueDate,
        assigneeId: schema.kanbanCards.assigneeId,
        priority: schema.kanbanCards.priority,
        position: schema.kanbanCards.position,
        labels: schema.kanbanCards.labels,
        completedAt: schema.kanbanCards.completedAt,
        assigneeName: schema.teamMembers.name,
      })
      .from(schema.kanbanCards)
      .leftJoin(
        schema.teamMembers,
        eq(schema.kanbanCards.assigneeId, schema.teamMembers.id)
      )
      .where(eq(schema.kanbanCards.clientId, id))
      .orderBy(asc(schema.kanbanCards.position)),
    db
      .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.isActive, true)),
  ]);

  // If no columns exist yet, seed default ones
  if (columns.length === 0) {
    const defaultCols = schema.DEFAULT_KANBAN_COLUMNS;
    const seeded = await db
      .insert(schema.kanbanColumns)
      .values(
        defaultCols.map((col) => ({
          clientId: id,
          name: col.name,
          position: col.position,
          color: col.color,
          isDefault: true,
        }))
      )
      .returning();
    columns.push(...seeded);
  }

  // Serialize dates for client component
  const serializedCards = cards.map((c) => ({
    ...c,
    dueDate: c.dueDate ? c.dueDate.toISOString().split("T")[0] : null,
    completedAt: c.completedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors mb-6"
      >
        <span>&larr;</span> Back to {client.name}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {client.name} — Board
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            {cards.length} card{cards.length !== 1 ? "s" : ""} across{" "}
            {columns.length} columns
          </p>
        </div>
      </div>

      {/* Board */}
      <KanbanBoard
        clientId={id}
        clientName={client.name}
        initialColumns={columns}
        initialCards={serializedCards}
        teamMembers={members}
      />
    </div>
  );
}
