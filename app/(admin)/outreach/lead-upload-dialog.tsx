"use client";

import { useState, useRef } from "react";

type Campaign = {
  id: string;
  externalId: number;
  name: string;
};

type ParsedLead = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  school?: string;
  phone?: string;
};

type ParseError = {
  row: number;
  message: string;
};

function parseCSV(text: string): { leads: ParsedLead[]; errors: ParseError[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { leads: [], errors: [] };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

  const idx = {
    email: header.indexOf("email"),
    first_name: header.indexOf("first_name"),
    firstName: header.indexOf("firstname"),
    last_name: header.indexOf("last_name"),
    lastName: header.indexOf("lastname"),
    company: header.indexOf("company"),
    school: header.indexOf("school"),
    phone: header.indexOf("phone"),
  };

  const emailIdx = idx.email;
  const firstNameIdx = idx.first_name !== -1 ? idx.first_name : idx.firstName;
  const lastNameIdx = idx.last_name !== -1 ? idx.last_name : idx.lastName;

  if (emailIdx === -1) {
    return { leads: [], errors: [{ row: 0, message: 'No "email" column found in header' }] };
  }

  const leads: ParsedLead[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = cols[emailIdx]?.trim();
    if (!email) {
      errors.push({ row: i + 1, message: "Missing email" });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: i + 1, message: `Invalid email: ${email}` });
      continue;
    }
    leads.push({
      email,
      firstName: firstNameIdx !== -1 ? cols[firstNameIdx]?.trim() || undefined : undefined,
      lastName: lastNameIdx !== -1 ? cols[lastNameIdx]?.trim() || undefined : undefined,
      company: idx.company !== -1 ? cols[idx.company]?.trim() || undefined : undefined,
      school: idx.school !== -1 ? cols[idx.school]?.trim() || undefined : undefined,
      phone: idx.phone !== -1 ? cols[idx.phone]?.trim() || undefined : undefined,
    });
  }

  return { leads, errors };
}

type UploadStatus =
  | { state: "idle" }
  | { state: "uploading" }
  | { state: "success"; added: number; duplicates: number; errors: string[] }
  | { state: "error"; message: string };

type Props = {
  campaigns: Campaign[];
  onClose: () => void;
};

export function LeadUploadDialog({ campaigns, onClose }: Props) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | "">("");
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<{ leads: ParsedLead[]; errors: ParseError[] } | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ state: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setParsed(parseCSV(text));
    };
    reader.readAsText(file);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setCsvText(text);
    if (text.trim()) {
      setParsed(parseCSV(text));
    } else {
      setParsed(null);
    }
  }

  async function handleUpload() {
    if (!selectedCampaignId) return;
    if (!parsed || parsed.leads.length === 0) return;

    setStatus({ state: "uploading" });

    try {
      const res = await fetch("/api/outreach/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          leads: parsed.leads,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus({ state: "error", message: body?.error ?? "Upload failed" });
        return;
      }

      setStatus({
        state: "success",
        added: body.added ?? 0,
        duplicates: body.duplicates ?? 0,
        errors: body.errors ?? [],
      });
    } catch {
      setStatus({ state: "error", message: "Network error" });
    }
  }

  const canUpload =
    selectedCampaignId !== "" &&
    parsed !== null &&
    parsed.leads.length > 0 &&
    status.state !== "uploading";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-[#0A0A0A] w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#0A0A0A]">
          <h2 className="font-mono text-sm uppercase tracking-widest font-bold">
            Upload Leads
          </h2>
          <button
            onClick={onClose}
            className="p-2 font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Campaign selector */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              Campaign
            </label>
            <select
              value={selectedCampaignId}
              onChange={(e) =>
                setSelectedCampaignId(e.target.value ? Number(e.target.value) : "")
              }
              className="w-full border border-[#0A0A0A] bg-white font-mono text-xs px-3 py-2 focus:outline-none"
            >
              <option value="">Select a campaign...</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.externalId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              CSV File
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 font-mono text-xs uppercase tracking-wider border border-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors"
              >
                Choose File
              </button>
              <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                or paste CSV below
              </span>
            </div>
          </div>

          {/* CSV textarea */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              CSV Data
            </label>
            <textarea
              value={csvText}
              onChange={handleTextChange}
              rows={6}
              placeholder={"email,first_name,last_name,company,school\njohn@example.com,John,Doe,Acme,MIT"}
              className="w-full border border-[#0A0A0A] font-mono text-xs px-3 py-2 focus:outline-none resize-none placeholder:text-[#0A0A0A]/20"
            />
            <p className="font-mono text-[10px] text-[#0A0A0A]/40">
              Required column: email. Optional: first_name, last_name, company, school
            </p>
          </div>

          {/* Parse errors */}
          {parsed && parsed.errors.length > 0 && (
            <div className="border border-[#0A0A0A] p-3 space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                Parse Warnings ({parsed.errors.length})
              </p>
              {parsed.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="font-mono text-[10px] text-[#0A0A0A]/70">
                  Row {e.row}: {e.message}
                </p>
              ))}
              {parsed.errors.length > 5 && (
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  ...and {parsed.errors.length - 5} more
                </p>
              )}
            </div>
          )}

          {/* Preview table */}
          {parsed && parsed.leads.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                Preview — {parsed.leads.length} valid lead{parsed.leads.length !== 1 ? "s" : ""}
              </p>
              <div className="border border-[#0A0A0A] overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#0A0A0A]/10">
                      <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                        Email
                      </th>
                      <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                        Name
                      </th>
                      <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 hidden md:table-cell">
                        Company
                      </th>
                      <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 hidden md:table-cell">
                        School
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0A0A0A]/5">
                    {parsed.leads.slice(0, 10).map((lead, i) => (
                      <tr key={i} className="hover:bg-[#0A0A0A]/[0.02]">
                        <td className="px-3 py-1.5 font-mono text-[11px]">
                          {lead.email}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-[#0A0A0A]/70">
                          {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "--"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-[#0A0A0A]/60 hidden md:table-cell">
                          {lead.company ?? "--"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-[#0A0A0A]/60 hidden md:table-cell">
                          {lead.school ?? "--"}
                        </td>
                      </tr>
                    ))}
                    {parsed.leads.length > 10 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-2 font-mono text-[10px] text-[#0A0A0A]/40 text-center"
                        >
                          ...and {parsed.leads.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload result */}
          {status.state === "success" && (
            <div className="border border-[#0A0A0A] p-4 space-y-1">
              <p className="font-mono text-xs font-bold">Upload complete</p>
              <p className="font-mono text-[11px] text-[#0A0A0A]/70">
                {status.added} added &middot; {status.duplicates} duplicates skipped
              </p>
              {status.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Errors ({status.errors.length})
                  </p>
                  {status.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="font-mono text-[10px] text-[#0A0A0A]/70">
                      {e}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {status.state === "error" && (
            <div className="border border-[#0A0A0A] p-4">
              <p className="font-mono text-xs text-[#0A0A0A]">
                Error: {status.message}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 font-mono text-xs uppercase tracking-wider border border-[#0A0A0A]/30 hover:bg-[#0A0A0A]/5 transition-colors"
            >
              {status.state === "success" ? "Done" : "Cancel"}
            </button>
            {status.state !== "success" && (
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="px-4 py-2 font-mono text-xs uppercase tracking-wider border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-40 transition-colors"
              >
                {status.state === "uploading"
                  ? "Uploading..."
                  : `Upload ${parsed?.leads.length ?? 0} Lead${parsed?.leads.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
