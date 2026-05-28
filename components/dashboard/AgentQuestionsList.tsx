"use client";

/**
 * Agent Questions client list — handles answer-chip selection and dismiss.
 * Calls POST /api/cold-email/questions/{id}/answer and
 *       POST /api/cold-email/questions/{id}/dismiss.
 */

import { useState, useTransition } from "react";
import { X } from "lucide-react";

export interface AgentQuestionItem {
  id: string;
  agent: "Bison";
  question: string;
  reasoning: string | null;
  category: string;
  priority: number;
  suggestedAnswers: string[];
  context: string;
}

function priorityClasses(priority: number): string {
  if (priority >= 2) return "bg-[#0A0A0A] text-white";
  if (priority >= 1) return "bg-white text-[#0A0A0A] border border-[#0A0A0A]";
  return "bg-[#0A0A0A]/5 text-[#0A0A0A]/60";
}

function priorityLabel(priority: number): string {
  if (priority >= 2) return "BLOCKING";
  if (priority >= 1) return "SHOULD";
  return "NICE";
}

export function AgentQuestionsList({
  initialQuestions,
}: {
  initialQuestions: AgentQuestionItem[];
}) {
  const [questions, setQuestions] =
    useState<AgentQuestionItem[]>(initialQuestions);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const answer = async (id: string, answerText: string) => {
    setPendingId(id);
    try {
      await fetch(`/api/cold-email/questions/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answerText }),
      });
      startTransition(() => removeQuestion(id));
    } catch {
      // Leave the question in place if the call fails
    } finally {
      setPendingId(null);
    }
  };

  const dismiss = async (id: string) => {
    setPendingId(id);
    try {
      await fetch(`/api/cold-email/questions/${id}/dismiss`, {
        method: "POST",
      });
      startTransition(() => removeQuestion(id));
    } catch {
      // ignore
    } finally {
      setPendingId(null);
    }
  };

  if (questions.length === 0) {
    return (
      <div className="border border-dashed border-[#0A0A0A]/10 py-3 text-center">
        <p className="font-mono text-[10px] text-[#0A0A0A]/30">
          All caught up.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
      {questions.map((q) => {
        const isPending = pendingId === q.id;
        return (
          <div
            key={q.id}
            className={`px-3 py-3 ${isPending ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-2 mb-2">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider shrink-0 ${priorityClasses(q.priority)}`}
              >
                {priorityLabel(q.priority)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-[12px] text-[#0A0A0A] leading-snug">
                  {q.question}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
                    {q.agent}
                  </span>
                  {q.context && (
                    <>
                      <span className="font-mono text-[9px] text-[#0A0A0A]/30">
                        ·
                      </span>
                      <span className="font-mono text-[9px] text-[#0A0A0A]/40 truncate">
                        {q.context}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(q.id)}
                disabled={isPending}
                aria-label="Dismiss question"
                className="text-[#0A0A0A]/30 hover:text-[#0A0A0A] transition-colors p-0.5 shrink-0"
              >
                <X size={12} />
              </button>
            </div>

            {q.suggestedAnswers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {q.suggestedAnswers.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => answer(q.id, suggestion)}
                    disabled={isPending}
                    className="inline-flex items-center px-2 py-1 font-mono text-[10px] border border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-colors disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
