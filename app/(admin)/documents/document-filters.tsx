"use client";

import { useRouter, useSearchParams } from "next/navigation";

const DOC_TYPES = [
  { value: "", label: "All Types" },
  { value: "contract", label: "Contract" },
  { value: "proposal", label: "Proposal" },
  { value: "note", label: "Note" },
  { value: "sop", label: "SOP" },
  { value: "invoice", label: "Invoice" },
  { value: "brief", label: "Brief" },
  { value: "other", label: "Other" },
];

const COMPANY_TAGS = [
  { value: "", label: "All Companies" },
  { value: "am_collective", label: "AM Collective" },
  { value: "trackr", label: "Trackr" },
  { value: "wholesail", label: "Wholesail" },
  { value: "taskspace", label: "TaskSpace" },
  { value: "cursive", label: "Cursive" },
  { value: "tbgc", label: "TBGC" },
  { value: "hook", label: "Hook" },
  { value: "personal", label: "Personal" },
];

export function DocumentFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDocType = searchParams.get("docType") || "";
  const currentCompanyTag = searchParams.get("companyTag") || "";

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/documents?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={currentDocType}
        onChange={(e) => updateFilter("docType", e.target.value)}
        className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-3 py-2 text-[#0A0A0A]/60 focus:outline-none focus:border-[#0A0A0A]/40"
      >
        {DOC_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        value={currentCompanyTag}
        onChange={(e) => updateFilter("companyTag", e.target.value)}
        className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-3 py-2 text-[#0A0A0A]/60 focus:outline-none focus:border-[#0A0A0A]/40"
      >
        {COMPANY_TAGS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
