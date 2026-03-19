import type { Metadata } from "next";
import { ForecastDashboard } from "./forecast-dashboard";

export const metadata: Metadata = {
  title: "Forecast | AM Collective",
};

export default function ForecastPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Revenue Forecast
        </h1>
      </div>
      <ForecastDashboard />
    </div>
  );
}
