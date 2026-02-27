"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At Risk" },
  { value: "churned", label: "Churned" },
];

export function ClientFilter({ currentFilter }: { currentFilter: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        params.delete("filter");
      } else {
        params.set("filter", value);
      }
      const qs = params.toString();
      router.push(qs ? `/clients?${qs}` : "/clients");
    },
    [router, searchParams]
  );

  return (
    <div className="flex gap-0 border border-[#0A0A0A]">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => handleFilter(f.value)}
          className={`px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
            currentFilter === f.value
              ? "bg-[#0A0A0A] text-white"
              : "bg-white text-[#0A0A0A]/60 hover:bg-[#0A0A0A]/5"
          } ${f.value !== "all" ? "border-l border-[#0A0A0A]" : ""}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
