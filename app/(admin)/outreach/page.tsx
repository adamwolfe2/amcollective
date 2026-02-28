import { OutreachDashboard } from "./outreach-dashboard";

export default function OutreachPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Outreach
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          EmailBison campaigns, delivery stats, and engagement tracking
        </p>
      </div>
      <OutreachDashboard />
    </div>
  );
}
