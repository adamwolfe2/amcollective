"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function ExportCard({
  title,
  description,
  endpoint,
  filename,
}: {
  title: string;
  description: string;
  endpoint: string;
  filename: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent fail — user will see no download
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-5">
      <h3 className="font-serif text-base font-bold text-[#0A0A0A] mb-1">
        {title}
      </h3>
      <p className="font-mono text-xs text-[#0A0A0A]/40 mb-4">
        {description}
      </p>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 border border-[#0A0A0A] bg-[#0A0A0A] text-white px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90 disabled:opacity-50 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? "Exporting..." : "Download CSV"}
      </button>
    </div>
  );
}
