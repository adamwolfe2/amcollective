/**
 * Shared skeleton loading components.
 * Use animate-pulse shimmer. Each variant matches the approximate shape of real content.
 */

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export function TableSkeleton({ rows = 5, cols = 4 }: TableSkeletonProps) {
  return (
    <div className="border border-[#0A0A0A]/10 overflow-hidden">
      {/* Header row */}
      <div className="border-b border-[#0A0A0A]/10 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-[#0A0A0A]/8 animate-pulse"
            style={{ flex: i === 0 ? 2 : 1 }}
          />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="border-b border-[#0A0A0A]/5 px-4 py-3 flex gap-4 items-center"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div
              key={colIdx}
              className="h-4 bg-[#0A0A0A]/5 animate-pulse"
              style={{ flex: colIdx === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface CardGridSkeletonProps {
  count?: number;
}

export function CardGridSkeleton({ count = 6 }: CardGridSkeletonProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-[#0A0A0A]/10 bg-white p-5 space-y-3">
          <div className="h-5 w-2/3 bg-[#0A0A0A]/8 animate-pulse" />
          <div className="h-3 w-1/3 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-px bg-[#0A0A0A]/5" />
          <div className="h-3 w-full bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-3 w-4/5 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

interface MetricsSkeletonProps {
  count?: number;
}

export function MetricsSkeleton({ count = 4 }: MetricsSkeletonProps) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-[#0A0A0A]/10 bg-white p-4 space-y-2">
          <div className="h-2 w-16 bg-[#0A0A0A]/8 animate-pulse" />
          <div className="h-7 w-24 bg-[#0A0A0A]/8 animate-pulse" />
          <div className="h-2 w-12 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

interface ListSkeletonProps {
  count?: number;
}

export function ListSkeleton({ count = 8 }: ListSkeletonProps) {
  return (
    <div className="border border-[#0A0A0A]/10 divide-y divide-[#0A0A0A]/5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-3 w-3 bg-[#0A0A0A]/8 animate-pulse shrink-0" />
            <div className="h-4 bg-[#0A0A0A]/5 animate-pulse flex-1 max-w-xs" />
          </div>
          <div className="h-3 w-16 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
