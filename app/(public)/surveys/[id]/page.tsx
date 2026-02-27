import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SurveyForm } from "./survey-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function SurveyPage({ params }: PageProps) {
  const { id } = await params;

  const [row] = await db
    .select({
      id: schema.surveys.id,
      type: schema.surveys.type,
      status: schema.surveys.status,
      score: schema.surveys.score,
      expiresAt: schema.surveys.expiresAt,
      clientName: schema.clients.name,
    })
    .from(schema.surveys)
    .leftJoin(schema.clients, eq(schema.surveys.clientId, schema.clients.id))
    .where(eq(schema.surveys.id, id))
    .limit(1);

  if (!row) notFound();

  const isExpired = row.expiresAt && new Date() > row.expiresAt;
  const isCompleted = row.status === "completed";

  return (
    <div className="min-h-screen bg-[#F3F3EF] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="border border-[#0A0A0A] bg-white p-8">
          {/* Header */}
          <div className="mb-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40 mb-2">
              AM Collective
            </p>
            <h1 className="text-xl font-bold font-serif tracking-tight">
              {row.type === "nps"
                ? "How likely are you to recommend us?"
                : row.type === "csat"
                  ? "How satisfied are you?"
                  : "Share your feedback"}
            </h1>
            {row.clientName && (
              <p className="font-serif text-sm text-[#0A0A0A]/50 mt-1">
                For: {row.clientName}
              </p>
            )}
          </div>

          {/* States */}
          {isExpired && !isCompleted ? (
            <div className="text-center py-8">
              <p className="font-serif text-[#0A0A0A]/50">
                This survey has expired. Please contact us if you&apos;d still like
                to share your feedback.
              </p>
            </div>
          ) : isCompleted ? (
            <div className="text-center py-8">
              <p className="font-serif text-lg font-bold mb-2">
                Thank you for your feedback!
              </p>
              <p className="font-serif text-sm text-[#0A0A0A]/50">
                We appreciate you taking the time to share your thoughts. Your
                feedback helps us improve.
              </p>
            </div>
          ) : (
            <SurveyForm
              surveyId={id}
              type={row.type}
            />
          )}
        </div>
      </div>
    </div>
  );
}
