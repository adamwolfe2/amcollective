import type { Metadata } from "next";
import { ComplianceDashboard } from "./compliance-dashboard";

export const metadata: Metadata = {
  title: "Compliance | AM Collective",
};

export default function CompliancePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Compliance + Audit
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Audit trail, compliance stats, and log export
        </p>
      </div>
      <ComplianceDashboard />
    </div>
  );
}
