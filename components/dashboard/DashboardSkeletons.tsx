/**
 * Loading skeleton components for the CEO dashboard.
 */

export function MetricsStripSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-16 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
        />
      ))}
    </div>
  );
}

export function PlatformCardSkeleton() {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white">
      <div className="px-4 py-2.5 border-b border-[#0A0A0A]/5">
        <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-40 bg-[#0A0A0A]/5 animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      ))}
    </div>
  );
}

export function ActionsPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      <div className="h-48 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      <div className="h-40 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
    </div>
  );
}
