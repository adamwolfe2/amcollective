import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { WebhookActions } from "./webhook-actions";
import { NewWebhookForm } from "./new-webhook-form";

export default async function WebhooksPage() {
  const [registrations, deliveryStats] = await Promise.all([
    db
      .select()
      .from(schema.webhookRegistrations)
      .orderBy(desc(schema.webhookRegistrations.createdAt))
      .limit(100),
    db
      .select({
        total: sql<number>`COUNT(*)`,
        succeeded: sql<number>`COUNT(*) FILTER (WHERE ${schema.webhookDeliveries.succeededAt} IS NOT NULL)`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${schema.webhookDeliveries.failedAt} IS NOT NULL)`,
      })
      .from(schema.webhookDeliveries),
  ]);

  const activeCount = registrations.filter((r) => r.isActive).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Webhooks
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Manage outbound webhook endpoints for Zapier, Make, and custom
          integrations
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
            {registrations.length}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Endpoints
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-green-700">
            {activeCount}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Active</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
            {Number(deliveryStats[0]?.succeeded ?? 0)}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Delivered
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-red-700">
            {Number(deliveryStats[0]?.failed ?? 0)}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Failed</p>
        </div>
      </div>

      {/* New Webhook Form */}
      <div className="mb-8">
        <NewWebhookForm />
      </div>

      {/* Registrations Table */}
      {registrations.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No webhook endpoints registered.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Create an endpoint above to start receiving events.
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
          {registrations.map((reg) => {
            const events = (reg.events as string[] | null) ?? [];
            return (
              <div
                key={reg.id}
                className="px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-mono text-sm text-[#0A0A0A] truncate">
                        {reg.endpointUrl}
                      </p>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 shrink-0 ${
                          reg.isActive
                            ? "text-green-700 border-green-400 bg-transparent"
                            : "text-[#0A0A0A]/40 border-[#0A0A0A]/15 bg-transparent"
                        }`}
                      >
                        {reg.isActive ? "active" : "disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {events.length > 0 ? (
                        <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                          Events: {events.join(", ")}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                          All events
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className="font-mono text-[10px] text-[#0A0A0A]/25">
                        Created{" "}
                        {format(new Date(reg.createdAt), "MMM d, yyyy")}
                      </span>
                      {reg.lastPingAt && (
                        <span className="font-mono text-[10px] text-green-600">
                          Last ping{" "}
                          {format(new Date(reg.lastPingAt), "MMM d HH:mm")}
                        </span>
                      )}
                      {reg.lastFailureAt && (
                        <span className="font-mono text-[10px] text-red-600">
                          Last failure{" "}
                          {format(new Date(reg.lastFailureAt), "MMM d HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>
                  <WebhookActions
                    id={reg.id}
                    isActive={reg.isActive}
                    secret={reg.secret}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Supported Events Reference */}
      <div className="mt-8 border border-[#0A0A0A]/10 bg-[#F3F3EF] p-5">
        <h3 className="font-serif text-sm font-bold text-[#0A0A0A] mb-2">
          Supported Events
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
          {[
            "invoice.created",
            "invoice.sent",
            "invoice.paid",
            "invoice.overdue",
            "proposal.sent",
            "proposal.viewed",
            "proposal.approved",
            "proposal.rejected",
            "client.created",
            "client.updated",
            "payment.succeeded",
            "payment.failed",
            "project.created",
            "project.status_changed",
            "survey.completed",
            "time.logged",
            "test.ping",
          ].map((evt) => (
            <code
              key={evt}
              className="font-mono text-[11px] text-[#0A0A0A]/50"
            >
              {evt}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}
