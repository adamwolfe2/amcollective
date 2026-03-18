/**
 * Service Detail — shows service info, pricing, and linked engagements.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  serviceStatusCategory,
  getStatusBadge,
} from "@/lib/ui/status-colors";

function formatPrice(cents: number | null, period: string | null): string {
  if (cents === null) return "\u2014";
  const dollars = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const suffix = period ? ` / ${period}` : "";
  return `$${dollars}${suffix}`;
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [service] = await db
    .select()
    .from(schema.services)
    .where(eq(schema.services.id, id))
    .limit(1);

  if (!service) notFound();

  // Fetch engagements to show which clients use this service
  // Engagements don't have a direct serviceId FK, so we match by title containing the service name
  const allEngagements = await db
    .select({
      id: schema.engagements.id,
      title: schema.engagements.title,
      status: schema.engagements.status,
      type: schema.engagements.type,
      clientName: schema.clients.name,
      clientId: schema.clients.id,
    })
    .from(schema.engagements)
    .innerJoin(schema.clients, eq(schema.engagements.clientId, schema.clients.id));

  // Filter engagements whose title includes the service name (case-insensitive)
  const linkedEngagements = allEngagements.filter((e) =>
    e.title.toLowerCase().includes(service.name.toLowerCase())
  );

  const statusLabel = service.isActive ? "active" : "inactive";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/services"
        className="inline-flex items-center gap-2 font-mono text-sm text-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Services
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#0A0A0A]">
            {service.name}
          </h1>
          {service.category && (
            <p className="font-mono text-sm text-[#0A0A0A]/50 mt-1">
              {service.category}
            </p>
          )}
        </div>
        <span
          className={`px-3 py-1 font-mono text-xs uppercase tracking-wider ${getStatusBadge(
            statusLabel,
            serviceStatusCategory
          )}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Details + Engagements */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          {service.description && (
            <div className="border border-[#0A0A0A]/10 bg-white p-4">
              <h2 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-2">
                Description
              </h2>
              <p className="font-mono text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {service.description}
              </p>
            </div>
          )}

          {/* Linked Engagements */}
          <div className="border border-[#0A0A0A]/10 bg-white">
            <div className="p-4 border-b border-[#0A0A0A]/10">
              <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
                Client Engagements
              </h2>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-1">
                Engagements linked to this service
              </p>
            </div>
            <div className="divide-y divide-[#0A0A0A]/5">
              {linkedEngagements.map((eng) => (
                <div key={eng.id} className="p-4 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/clients/${eng.clientId}`}
                      className="font-serif text-sm font-bold text-[#0A0A0A] hover:underline underline-offset-2"
                    >
                      {eng.clientName}
                    </Link>
                    <p className="font-mono text-xs text-[#0A0A0A]/50 mt-0.5">
                      {eng.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-[#0A0A0A]/40 bg-[#0A0A0A]/5 px-1.5 py-0.5">
                      {eng.type}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-[#0A0A0A]/40 bg-[#0A0A0A]/5 px-1.5 py-0.5">
                      {eng.status}
                    </span>
                  </div>
                </div>
              ))}
              {linkedEngagements.length === 0 && (
                <p className="p-8 text-center font-mono text-sm text-[#0A0A0A]/30">
                  No engagements linked to this service yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right — Info Panel */}
        <div className="space-y-4">
          {/* Pricing */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Pricing
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Base Price
              </p>
              <p className="font-mono text-xl font-bold text-[#0A0A0A]">
                {formatPrice(service.basePrice, service.pricePeriod)}
              </p>
            </div>
            {service.pricePeriod && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Billing Interval
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {service.pricePeriod}
                </p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Metadata
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Sort Order
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {service.sortOrder}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Created
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {service.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Last Updated
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {service.updatedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Usage
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Active Engagements
              </p>
              <p className="font-mono text-xl font-bold text-[#0A0A0A]">
                {linkedEngagements.filter((e) => e.status === "active").length}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Total Engagements
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {linkedEngagements.length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
