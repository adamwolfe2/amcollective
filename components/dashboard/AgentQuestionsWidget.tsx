/**
 * Agent Questions Widget — surfaces open questions from named agents
 * (currently Bison; future Tara/Alex/Carl).
 *
 * Server component wrapper that fetches open questions and passes them
 * to a client list that handles answer-chip selection and dismiss.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { HelpCircle } from "lucide-react";
import { AgentQuestionsList, type AgentQuestionItem } from "./AgentQuestionsList";

async function getOpenQuestions(): Promise<AgentQuestionItem[]> {
  try {
    const rows = await db
      .select({
        id: schema.coldEmailQuestions.id,
        agent: schema.coldEmailQuestions.workspace,
        question: schema.coldEmailQuestions.question,
        reasoning: schema.coldEmailQuestions.reasoning,
        category: schema.coldEmailQuestions.category,
        priority: schema.coldEmailQuestions.priority,
        suggestedAnswers: schema.coldEmailQuestions.suggestedAnswers,
        campaignName: schema.coldEmailQuestions.campaignName,
        workspace: schema.coldEmailQuestions.workspace,
      })
      .from(schema.coldEmailQuestions)
      .where(eq(schema.coldEmailQuestions.status, "open"))
      .orderBy(
        desc(schema.coldEmailQuestions.priority),
        desc(schema.coldEmailQuestions.createdAt)
      )
      .limit(8);

    return rows.map((r) => ({
      id: r.id,
      agent: "Bison" as const,
      question: r.question,
      reasoning: r.reasoning,
      category: r.category,
      priority: r.priority,
      suggestedAnswers: r.suggestedAnswers ?? [],
      context: [r.workspace, r.campaignName].filter(Boolean).join(" · "),
    }));
  } catch {
    return [];
  }
}

export async function AgentQuestionsWidget() {
  const questions = await getOpenQuestions();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
          <HelpCircle size={10} />
          Agent Questions
        </h3>
        {questions.length === 0 && (
          <span className="font-mono text-[9px] text-[#0A0A0A]/40">
            None pending
          </span>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="border border-dashed border-[#0A0A0A]/10 py-3 text-center">
          <p className="font-mono text-[10px] text-[#0A0A0A]/30">
            No questions from your agents.
          </p>
        </div>
      ) : (
        <AgentQuestionsList initialQuestions={questions} />
      )}
    </div>
  );
}
