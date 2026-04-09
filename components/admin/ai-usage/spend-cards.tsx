/**
 * AI Usage — Spend Summary Cards
 *
 * 4 cards: today, this month, projected month-end, % vs last month.
 * Offset Brutalist style — no rounded corners.
 */

interface SpendCardsProps {
  spendToday: number;
  spendMonth: number;
  projectedMonth: number;
  pctVsLastMonth: number | null;
}

function formatUsd(n: number): string {
  if (n < 0.01) return `$${(n * 1000).toFixed(2)}m`;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SpendCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "red" | "neutral";
}) {
  const borderColor =
    highlight === "red"
      ? "border-l-4 border-l-red-600"
      : highlight === "green"
        ? "border-l-4 border-l-emerald-600"
        : "border-l-4 border-l-[#0A0A0A]";

  return (
    <div
      className={`bg-white border border-[#0A0A0A]/20 p-4 ${borderColor}`}
    >
      <p className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold font-mono text-[#0A0A0A]">{value}</p>
      {sub && (
        <p className="text-xs text-[#0A0A0A]/40 mt-0.5 font-mono">{sub}</p>
      )}
    </div>
  );
}

export function SpendCards({
  spendToday,
  spendMonth,
  projectedMonth,
  pctVsLastMonth,
}: SpendCardsProps) {
  const pctFormatted =
    pctVsLastMonth !== null
      ? `${pctVsLastMonth >= 0 ? "+" : ""}${pctVsLastMonth.toFixed(1)}%`
      : "N/A (no prior data)";

  const pctHighlight =
    pctVsLastMonth === null
      ? "neutral"
      : pctVsLastMonth > 20
        ? "red"
        : pctVsLastMonth < -10
          ? "green"
          : "neutral";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SpendCard
        label="Spend Today"
        value={formatUsd(spendToday)}
        sub="UTC day"
      />
      <SpendCard
        label="Spend This Month"
        value={formatUsd(spendMonth)}
        sub={`${new Date().toLocaleString("en-US", { month: "long" })} MTD`}
      />
      <SpendCard
        label="Projected Month-End"
        value={formatUsd(projectedMonth)}
        sub="Linear projection"
      />
      <SpendCard
        label="vs Last Month (prorated)"
        value={pctFormatted}
        highlight={pctHighlight}
        sub={pctVsLastMonth !== null ? "same days elapsed" : undefined}
      />
    </div>
  );
}
