/**
 * Bison Experiments — all A/B tests grouped by workspace then campaign.
 * Reviewers approve or dismiss pending_approval proposals from this view.
 */

import type { Metadata } from "next";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { ExperimentList, type ExperimentRow } from "./experiment-list";

export const metadata: Metadata = {
  title: "Bison Experiments | AM Collective",
};

export const dynamic = "force-dynamic";

interface ExperimentGroup {
  workspace: string;
  campaigns: Array<{
    campaignKey: string;
    campaignName: string;
    rows: ExperimentRow[];
  }>;
}

async function getExperiments(): Promise<ExperimentGroup[]> {
  const rows = await db
    .select()
    .from(schema.coldEmailExperiments)
    .orderBy(desc(schema.coldEmailExperiments.createdAt));

  const grouped = new Map<string, Map<string, ExperimentRow[]>>();

  for (const r of rows) {
    const workspace = r.workspace ?? "unassigned";
    const campaignKey = `${r.campaignExternalId}`;
    const campaignName = r.campaignName ?? `Campaign #${r.campaignExternalId}`;

    if (!grouped.has(workspace)) grouped.set(workspace, new Map());
    const wsMap = grouped.get(workspace)!;
    if (!wsMap.has(campaignKey)) wsMap.set(campaignKey, []);

    wsMap.get(campaignKey)!.push({
      id: r.id,
      campaignName,
      sequenceStep: r.sequenceStep,
      lever: r.lever,
      status: r.status,
      hypothesis: r.hypothesis,
      baselineSubject: r.baselineSubject,
      baselineBody: r.baselineBody,
      baselineReplyRate: r.baselineReplyRate,
      challengerSubject: r.challengerSubject,
      challengerBody: r.challengerBody,
      challengerReplyRate: r.challengerReplyRate,
      reasoning: r.reasoning,
      decisionNotes: r.decisionNotes,
      createdAt: r.createdAt.toISOString(),
    });
  }

  const result: ExperimentGroup[] = [];
  for (const [workspace, wsMap] of grouped) {
    const campaigns = Array.from(wsMap.entries()).map(([campaignKey, rows]) => ({
      campaignKey,
      campaignName: rows[0]?.campaignName ?? campaignKey,
      rows,
    }));
    result.push({ workspace, campaigns });
  }

  result.sort((a, b) => a.workspace.localeCompare(b.workspace));
  return result;
}

export default async function ExperimentsPage() {
  const groups = await getExperiments();
  const totalCount = groups.reduce(
    (sum, g) => sum + g.campaigns.reduce((s, c) => s + c.rows.length, 0),
    0
  );
  const pendingCount = groups.reduce(
    (sum, g) =>
      sum +
      g.campaigns.reduce(
        (s, c) => s + c.rows.filter((r) => r.status === "pending_approval").length,
        0
      ),
    0
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Bison Experiments
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Cold email A/B tests · {totalCount} total ·{" "}
          <span className="text-[#0A0A0A]/60">
            {pendingCount} awaiting approval
          </span>
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="border border-dashed border-[#0A0A0A]/15 py-12 text-center">
          <p className="font-serif italic text-[#0A0A0A]/40">
            No experiments yet. Bison hasn&apos;t proposed any tests.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.workspace}>
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
                {group.workspace}
              </h2>
              <div className="space-y-6">
                {group.campaigns.map((campaign) => (
                  <div
                    key={campaign.campaignKey}
                    className="border border-[#0A0A0A] bg-white"
                  >
                    <div className="border-b border-[#0A0A0A]/20 px-4 py-3 flex items-center justify-between">
                      <h3 className="font-serif text-base font-bold tracking-tight">
                        {campaign.campaignName}
                      </h3>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50">
                        {campaign.rows.length} experiment
                        {campaign.rows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ExperimentList rows={campaign.rows} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
