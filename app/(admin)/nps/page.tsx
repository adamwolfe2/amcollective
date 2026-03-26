import type { Metadata } from "next";
import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const metadata: Metadata = {
  title: "NPS | AM Collective",
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SurveyActions } from "./survey-actions";

function classifyNps(score: number): { label: string; style: string } {
  if (score >= 9)
    return {
      label: "Promoter",
      style: "bg-[#0A0A0A] text-white border border-[#0A0A0A]",
    };
  if (score >= 7)
    return {
      label: "Passive",
      style: "bg-transparent text-[#0A0A0A]/40 border border-[#0A0A0A]/15",
    };
  return {
    label: "Detractor",
    style: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border border-[#0A0A0A]/20",
  };
}

export default async function NpsPage() {
  const [surveys, npsData, clients] = await Promise.all([
    db
      .select({
        survey: schema.surveys,
        clientName: schema.clients.name,
      })
      .from(schema.surveys)
      .leftJoin(schema.clients, eq(schema.surveys.clientId, schema.clients.id))
      .orderBy(desc(schema.surveys.createdAt))
      .limit(50),
    // NPS score calculation (only completed NPS surveys)
    db
      .select({
        avgScore: sql<string>`AVG(${schema.surveys.score})`,
        totalResponses: sql<number>`COUNT(*)::int`,
        promoters: sql<number>`COUNT(CASE WHEN ${schema.surveys.score} >= 9 THEN 1 END)::int`,
        passives: sql<number>`COUNT(CASE WHEN ${schema.surveys.score} >= 7 AND ${schema.surveys.score} < 9 THEN 1 END)::int`,
        detractors: sql<number>`COUNT(CASE WHEN ${schema.surveys.score} < 7 THEN 1 END)::int`,
      })
      .from(schema.surveys)
      .where(eq(schema.surveys.status, "completed")),
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients),
  ]);

  const totalResponses = npsData[0]?.totalResponses ?? 0;
  const promoters = npsData[0]?.promoters ?? 0;
  const detractors = npsData[0]?.detractors ?? 0;
  const npsScore =
    totalResponses > 0
      ? Math.round(
          ((promoters - detractors) / totalResponses) * 100
        )
      : null;
  const avgScore = npsData[0]?.avgScore
    ? parseFloat(npsData[0].avgScore).toFixed(1)
    : "--";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Client Satisfaction
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Track NPS scores, send surveys, and monitor client sentiment.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            NPS Score
          </p>
          <p
            className={`font-mono text-xl font-bold ${npsScore !== null ? (npsScore >= 50 ? "text-[#0A0A0A]" : npsScore >= 0 ? "text-[#0A0A0A]/60" : "text-[#0A0A0A]/70") : ""}`}
          >
            {npsScore !== null ? npsScore : "--"}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Avg Score
          </p>
          <p className="font-mono text-xl font-bold">{avgScore}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Responses
          </p>
          <p className="font-mono text-xl font-bold">{totalResponses}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Breakdown
          </p>
          <p className="font-mono text-sm">
            <span className="text-[#0A0A0A]">{promoters}P</span>{" "}
            <span className="text-[#0A0A0A]/40">{npsData[0]?.passives ?? 0}N</span>{" "}
            <span className="text-[#0A0A0A]/70">{detractors}D</span>
          </p>
        </div>
      </div>

      {/* Send Survey */}
      <SurveyActions clients={clients.map((c) => ({ id: c.id, name: c.name }))} />

      {/* Surveys Table */}
      <div className="border border-[#0A0A0A] bg-white overflow-x-auto mt-6">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Client
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Type
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Score
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Category
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Feedback
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Date
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No surveys yet. Use the Send Survey form above to send your first NPS survey — select a client and it will go out immediately via email.
                </TableCell>
              </TableRow>
            )}
            {surveys.map(({ survey, clientName }) => {
              const nps =
                survey.score !== null ? classifyNps(survey.score) : null;
              return (
                <TableRow
                  key={survey.id}
                  className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                >
                  <TableCell className="font-serif text-sm">
                    {clientName ?? "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase">
                    {survey.type}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-bold">
                    {survey.score ?? "\u2014"}
                  </TableCell>
                  <TableCell>
                    {nps && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${nps.style}`}
                      >
                        {nps.label}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-serif text-sm text-[#0A0A0A]/60 max-w-[200px] truncate">
                    {survey.feedback || "\u2014"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${
                        survey.status === "completed"
                          ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                          : survey.status === "sent"
                            ? "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/25"
                            : "bg-transparent text-[#0A0A0A]/40 border-[#0A0A0A]/15"
                      }`}
                    >
                      {survey.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                    {format(survey.createdAt, "MMM d")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
