/**
 * AM Collective — Cursive Connector (READ-ONLY)
 *
 * Primary: Supabase REST API via cursive_am_stats() RPC function (IPv4-compatible, works on Vercel)
 * Fallback: Direct DB via postgres package (IPv6 only — local dev only)
 *
 * Requires: CURSIVE_ANON_KEY (Supabase anon key — use for RPC)
 *        or CURSIVE_DATABASE_URL (direct DB, IPv6 environments only)
 *
 * 5-minute cache, graceful degradation on error.
 */

import { safeCall, cached, type ConnectorResult } from "./base";

const SUPABASE_URL = "https://lrbftjspiiakfnydxbgk.supabase.co";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CursiveOpsStage {
  new: number;
  booked: number;
  trial: number;
  active: number;
  at_risk: number;
  churned: number;
}

export interface CursiveBookingStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  completedThisMonth: number;
  noShowThisMonth: number;
}

export interface CursivePixelStats {
  totalInstalls: number;
  activeTrials: number;
  trialsExpiringWeek: number;
  trialsExpired: number;
}

export interface CursiveLeadStats {
  total: number;
  byStatus: Record<string, number>;
  createdThisWeek: number;
}

export interface CursiveAffiliateStats {
  activeAffiliates: number;
  pendingApplications: number;
  totalEarningsCents: number;
  pendingCommissionsCents: number;
  referralsThisWeek: number;
}

export interface CursiveSnapshot {
  totalWorkspaces: number;
  managedByOps: number;
  pipeline: CursiveOpsStage;
  bookings: CursiveBookingStats;
  pixels: CursivePixelStats;
  leads: CursiveLeadStats;
  affiliates: CursiveAffiliateStats;
  source: "rest" | "db";
}

// ─── Raw RPC response ─────────────────────────────────────────────────────────

interface AmStatsRpc {
  totalWorkspaces: number;
  pipelineStages: Record<string, number> | null;
  bookingsToday: number;
  bookingsThisWeek: number;
  bookingsThisMonth: number;
  bookingsCompleted: number;
  bookingsNoShow: number;
  pixelTotal: number;
  pixelActiveTrial: number;
  pixelExpiringWeek: number;
  pixelExpired: number;
  leadTotal: number;
  leadByStatus: Record<string, number> | null;
  leadThisWeek: number;
  affiliateActive: number;
  affiliatePending: number;
  affiliateEarnings: number;
  affiliateCommPending: number;
  affiliateReferrals: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(process.env.CURSIVE_ANON_KEY || process.env.CURSIVE_DATABASE_URL);
}

function sp(val: unknown): number {
  return parseInt(String(val ?? "0"), 10) || 0;
}

function buildPipeline(stages: Record<string, number> | null): CursiveOpsStage {
  const p: CursiveOpsStage = { new: 0, booked: 0, trial: 0, active: 0, at_risk: 0, churned: 0 };
  if (!stages) return p;
  for (const [key, val] of Object.entries(stages)) {
    const k = key as keyof CursiveOpsStage;
    if (k in p) p[k] = sp(val);
  }
  return p;
}

// ─── REST API (preferred — IPv4 compatible, anon key) ────────────────────────

async function fetchFromRest(): Promise<CursiveSnapshot> {
  const anonKey = process.env.CURSIVE_ANON_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cursive_am_stats`, {
    method: "POST",
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Cursive REST API ${res.status}: ${await res.text()}`);
  const d = await res.json() as AmStatsRpc;

  const pipeline = buildPipeline(d.pipelineStages);
  return {
    totalWorkspaces: sp(d.totalWorkspaces),
    managedByOps: Object.values(pipeline).reduce((s, v) => s + v, 0),
    pipeline,
    bookings: {
      today: sp(d.bookingsToday),
      thisWeek: sp(d.bookingsThisWeek),
      thisMonth: sp(d.bookingsThisMonth),
      completedThisMonth: sp(d.bookingsCompleted),
      noShowThisMonth: sp(d.bookingsNoShow),
    },
    pixels: {
      totalInstalls: sp(d.pixelTotal),
      activeTrials: sp(d.pixelActiveTrial),
      trialsExpiringWeek: sp(d.pixelExpiringWeek),
      trialsExpired: sp(d.pixelExpired),
    },
    leads: {
      total: sp(d.leadTotal),
      byStatus: Object.fromEntries(
        Object.entries(d.leadByStatus ?? {}).map(([k, v]) => [k, sp(v)])
      ),
      createdThisWeek: sp(d.leadThisWeek),
    },
    affiliates: {
      activeAffiliates: sp(d.affiliateActive),
      pendingApplications: sp(d.affiliatePending),
      totalEarningsCents: sp(d.affiliateEarnings),
      pendingCommissionsCents: sp(d.affiliateCommPending),
      referralsThisWeek: sp(d.affiliateReferrals),
    },
    source: "rest",
  };
}

// ─── Direct DB (IPv6 only — local dev) ───────────────────────────────────────

async function fetchFromDb(): Promise<CursiveSnapshot> {
  const { default: postgres } = await import("postgres");
  const url = process.env.CURSIVE_DATABASE_URL!;
  const passwordMatch = url.match(/:([^@]+)@/);
  const sql = postgres({
    host: "db.lrbftjspiiakfnydxbgk.supabase.co",
    port: 6543,
    database: "postgres",
    username: "postgres",
    password: passwordMatch?.[1] ?? "",
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    const [d] = await sql<[AmStatsRpc]>`SELECT cursive_am_stats() as r`;
    // cursive_am_stats() returns a jsonb — postgres driver returns it as an object
    const stats = (d as unknown as { r: AmStatsRpc }).r;
    const pipeline = buildPipeline(stats.pipelineStages);
    return {
      totalWorkspaces: sp(stats.totalWorkspaces),
      managedByOps: Object.values(pipeline).reduce((s, v) => s + v, 0),
      pipeline,
      bookings: {
        today: sp(stats.bookingsToday),
        thisWeek: sp(stats.bookingsThisWeek),
        thisMonth: sp(stats.bookingsThisMonth),
        completedThisMonth: sp(stats.bookingsCompleted),
        noShowThisMonth: sp(stats.bookingsNoShow),
      },
      pixels: {
        totalInstalls: sp(stats.pixelTotal),
        activeTrials: sp(stats.pixelActiveTrial),
        trialsExpiringWeek: sp(stats.pixelExpiringWeek),
        trialsExpired: sp(stats.pixelExpired),
      },
      leads: {
        total: sp(stats.leadTotal),
        byStatus: Object.fromEntries(
          Object.entries(stats.leadByStatus ?? {}).map(([k, v]) => [k, sp(v)])
        ),
        createdThisWeek: sp(stats.leadThisWeek),
      },
      affiliates: {
        activeAffiliates: sp(stats.affiliateActive),
        pendingApplications: sp(stats.affiliatePending),
        totalEarningsCents: sp(stats.affiliateEarnings),
        pendingCommissionsCents: sp(stats.affiliateCommPending),
        referralsThisWeek: sp(stats.affiliateReferrals),
      },
      source: "db",
    };
  } finally {
    await sql.end();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSnapshot(): Promise<ConnectorResult<CursiveSnapshot>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "Set CURSIVE_ANON_KEY (Supabase anon key) or CURSIVE_DATABASE_URL",
      fetchedAt: new Date(),
    };
  }

  return cached("cursive:snapshot", () =>
    safeCall(async () => {
      if (process.env.CURSIVE_ANON_KEY) return fetchFromRest();
      return fetchFromDb();
    })
  );
}
