"use client";

import { useCompany } from "./company-context";
import { Building2 } from "lucide-react";

export function CompanySwitcher() {
  const { companies, activeCompany, setActiveCompany, loading } = useCompany();

  if (loading || companies.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-3.5 w-3.5 text-[#0A0A0A]/40" />
      <select
        value={activeCompany ?? "all"}
        onChange={(e) =>
          setActiveCompany(e.target.value === "all" ? null : e.target.value)
        }
        className="border border-[#0A0A0A]/10 bg-white/60 px-2 py-1 font-mono text-[10px] text-[#0A0A0A]/60 focus:border-[#0A0A0A]/30 focus:outline-none appearance-none cursor-pointer hover:bg-white"
      >
        <option value="all">All Companies</option>
        {companies
          .filter((c) => c.isActive)
          .map((c) => (
            <option key={c.companyTag} value={c.companyTag}>
              {c.name}
            </option>
          ))}
      </select>
    </div>
  );
}
