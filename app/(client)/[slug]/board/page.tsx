import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "text-red-600 border-red-300 bg-red-50",
  high: "text-amber-600 border-amber-300 bg-amber-50",
  medium: "text-[#0A0A0A]/60 border-[#0A0A0A]/20",
  low: "text-[#0A0A0A]/40 border-[#0A0A0A]/10",
};

export default async function ClientBoardPage() {
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

  // Fetch columns and cards
  const [columns, cards, comments] = await Promise.all([
    db
      .select()
      .from(schema.kanbanColumns)
      .where(eq(schema.kanbanColumns.clientId, client.id))
      .orderBy(asc(schema.kanbanColumns.position)),
    db
      .select({
        id: schema.kanbanCards.id,
        columnId: schema.kanbanCards.columnId,
        title: schema.kanbanCards.title,
        description: schema.kanbanCards.description,
        dueDate: schema.kanbanCards.dueDate,
        priority: schema.kanbanCards.priority,
        position: schema.kanbanCards.position,
        assigneeName: schema.teamMembers.name,
      })
      .from(schema.kanbanCards)
      .leftJoin(
        schema.teamMembers,
        eq(schema.kanbanCards.assigneeId, schema.teamMembers.id)
      )
      .where(eq(schema.kanbanCards.clientId, client.id))
      .orderBy(asc(schema.kanbanCards.position)),
    // Get client-visible comment counts per card
    db
      .select({
        cardId: schema.kanbanComments.cardId,
      })
      .from(schema.kanbanComments)
      .where(eq(schema.kanbanComments.isClientVisible, true)),
  ]);

  // Build comment count map
  const commentCounts = new Map<string, number>();
  for (const c of comments) {
    commentCounts.set(c.cardId, (commentCounts.get(c.cardId) ?? 0) + 1);
  }

  const colCards = (colId: string) =>
    cards
      .filter((c) => c.columnId === colId)
      .sort((a, b) => a.position - b.position);

  if (columns.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-serif tracking-tight mb-2">
          Project Board
        </h1>
        <div className="py-20 text-center border border-[#0A0A0A]/10">
          <p className="font-serif text-lg text-[#0A0A0A]/40">
            No board configured yet
          </p>
          <p className="font-mono text-xs text-[#0A0A0A]/25 mt-1">
            Your AM Collective team will set up the project board for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Project Board
        </h1>
        <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
          Track the progress of your deliverables
        </p>
      </div>

      {/* Board (read-only) */}
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col w-72 shrink-0">
            {/* Column Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              {col.color && (
                <span
                  className="w-2.5 h-2.5 shrink-0"
                  style={{ backgroundColor: col.color }}
                />
              )}
              <span className="font-mono text-xs uppercase tracking-wider font-medium">
                {col.name}
              </span>
              <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                {colCards(col.id).length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1 bg-[#0A0A0A]/[0.02] p-2 min-h-[80px]">
              {colCards(col.id).map((card) => (
                <div
                  key={card.id}
                  className="border border-[#0A0A0A]/10 bg-white p-3"
                >
                  <p className="font-serif text-sm font-medium leading-snug">
                    {card.title}
                  </p>
                  {card.description && (
                    <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1 line-clamp-2">
                      {card.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className={`rounded-none text-[8px] uppercase font-mono tracking-wider px-1.5 py-0 ${PRIORITY_STYLES[card.priority]}`}
                    >
                      {card.priority}
                    </Badge>
                    {card.dueDate && (
                      <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                        {format(card.dueDate, "MMM d")}
                      </span>
                    )}
                    {card.assigneeName && (
                      <span className="font-mono text-[10px] text-[#0A0A0A]/40 truncate">
                        {card.assigneeName}
                      </span>
                    )}
                    {(commentCounts.get(card.id) ?? 0) > 0 && (
                      <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                        {commentCounts.get(card.id)} comment
                        {commentCounts.get(card.id)! > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {colCards(col.id).length === 0 && (
                <div className="text-center py-4">
                  <span className="font-mono text-[10px] text-[#0A0A0A]/20">
                    Empty
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
