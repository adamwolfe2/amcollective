"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  X,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductMetric {
  label: string;
  value: string;
  alert?: boolean;
}

interface ProductAlert {
  message: string;
  severity: "critical" | "warning" | "info";
}

interface ProductTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  sprintTitle: string | null;
}

export interface Product {
  name: string;
  tag: string;
  slug: string;
  href: string;
  connected: boolean;
  metrics: ProductMetric[];
  logoUrl?: string | null;
  alerts?: ProductAlert[];
  tasks?: ProductTask[];
  mrrDisplay?: string | null;
  stageDisplay?: string | null;
}

interface Props {
  products: Product[];
}

// ─── Status helpers ──────────────────────────────────────────────────────────

function taskStatusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="w-3 h-3 text-[#0A0A0A]" />;
  if (status === "in_progress" || status === "in_review")
    return <Circle className="w-3 h-3 text-[#0A0A0A]/60 fill-[#0A0A0A]/20" />;
  return <Circle className="w-3 h-3 text-[#0A0A0A]/30" />;
}

function priorityDot(priority: string) {
  if (priority === "urgent") return "bg-[#0A0A0A]";
  if (priority === "high") return "bg-[#0A0A0A]/60";
  return "bg-[#0A0A0A]/20";
}

// ─── Detail Panel (slide-over) ───────────────────────────────────────────────

function ProductDetailPanel({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const alertCount = product.alerts?.length ?? 0;
  const tasksDone = product.tasks?.filter((t) => t.status === "done").length ?? 0;
  const tasksTotal = product.tasks?.length ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0A0A0A]/30 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 w-full sm:w-[480px] bg-[#F3F3EF] border-l border-[#0A0A0A]/10 z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#F3F3EF] border-b border-[#0A0A0A]/10 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            {product.logoUrl ? (
              <Image
                src={product.logoUrl}
                alt={product.name}
                width={28}
                height={28}
                className="w-7 h-7 object-contain rounded-sm shrink-0"
              />
            ) : (
              <span className="inline-flex items-center justify-center w-7 h-7 bg-[#0A0A0A] font-mono text-[10px] font-bold text-white shrink-0">
                {product.tag}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="font-serif font-bold text-lg text-[#0A0A0A] truncate">
                {product.name}
              </h2>
              {product.stageDisplay && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/50">
                  {product.stageDisplay}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#0A0A0A]/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-[#0A0A0A]/50" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Alerts */}
          {alertCount > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
                Alerts
              </h3>
              {product.alerts!.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-3 py-2 border ${
                    alert.severity === "critical"
                      ? "border-[#0A0A0A] bg-[#0A0A0A]/5"
                      : "border-[#0A0A0A]/15 bg-white"
                  }`}
                >
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      alert.severity === "critical"
                        ? "text-[#0A0A0A]"
                        : "text-[#0A0A0A]/50"
                    }`}
                  />
                  <span className="font-mono text-[11px] text-[#0A0A0A]/80">
                    {alert.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Key Metrics */}
          {product.metrics.length > 0 && (
            <div>
              <h3 className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mb-2">
                Metrics
              </h3>
              <div className="border border-[#0A0A0A]/10 bg-white">
                <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-[#0A0A0A]/5">
                  {product.metrics.map((m) => (
                    <div key={m.label} className="px-3 py-2.5">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">
                        {m.label}
                      </span>
                      <span
                        className={`font-mono text-sm font-bold block mt-0.5 ${
                          m.alert ? "text-[#0A0A0A]" : "text-[#0A0A0A]/80"
                        }`}
                      >
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sprint Tasks */}
          {tasksTotal > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
                  Sprint Tasks
                </h3>
                <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                  {tasksDone}/{tasksTotal} done
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-[#0A0A0A]/10 mb-3">
                <div
                  className="h-full bg-[#0A0A0A] transition-all"
                  style={{
                    width: `${tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
                {product.tasks!.map((task) => (
                  <div
                    key={task.id}
                    className="px-3 py-2 flex items-start gap-2"
                  >
                    {taskStatusIcon(task.status)}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-mono text-[11px] leading-snug ${
                          task.status === "done"
                            ? "text-[#0A0A0A]/40 line-through"
                            : "text-[#0A0A0A]/80"
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.sprintTitle && (
                        <span className="font-mono text-[9px] text-[#0A0A0A]/30">
                          {task.sprintTitle}
                        </span>
                      )}
                    </div>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${priorityDot(
                        task.priority
                      )}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!product.connected && (
            <div className="border border-dashed border-[#0A0A0A]/15 py-8 text-center">
              <p className="font-mono text-[10px] text-[#0A0A0A]/30">
                Connector not configured
              </p>
            </div>
          )}

          {/* Footer link */}
          <Link
            href={product.href}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30 transition-colors font-mono text-[11px] text-[#0A0A0A]/70"
          >
            View full details <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </>
  );
}

// ─── Product Row ─────────────────────────────────────────────────────────────

function ProductRow({
  product,
  onSelect,
}: {
  product: Product;
  onSelect: () => void;
}) {
  const alertCount = product.alerts?.filter(
    (a) => a.severity === "critical"
  ).length ?? 0;
  const tasksDone =
    product.tasks?.filter((t) => t.status === "done").length ?? 0;
  const tasksTotal = product.tasks?.length ?? 0;

  return (
    <button
      onClick={onSelect}
      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#0A0A0A]/[0.02] transition-colors text-left"
    >
      {/* Logo */}
      {product.logoUrl ? (
        <Image
          src={product.logoUrl}
          alt={product.name}
          width={24}
          height={24}
          className="w-6 h-6 object-contain rounded-sm shrink-0"
        />
      ) : (
        <span className="inline-flex items-center justify-center w-6 h-6 bg-[#0A0A0A] font-mono text-[9px] font-bold text-white shrink-0">
          {product.tag}
        </span>
      )}

      {/* Name */}
      <span className="font-serif font-bold text-[13px] sm:text-sm text-[#0A0A0A] truncate min-w-0">
        {product.name}
      </span>

      {/* Alert badge */}
      {alertCount > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#0A0A0A] text-white font-mono text-[9px] shrink-0">
          <AlertTriangle className="w-2.5 h-2.5" />
          {alertCount}
        </span>
      )}

      {/* MRR or status — right side */}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        {product.mrrDisplay && (
          <span className="font-mono text-xs font-medium text-[#0A0A0A] hidden sm:block">
            {product.mrrDisplay}
          </span>
        )}

        {/* Task progress mini */}
        {tasksTotal > 0 && (
          <span className="font-mono text-[10px] text-[#0A0A0A]/40 hidden sm:block">
            {tasksDone}/{tasksTotal}
          </span>
        )}

        {!product.connected && (
          <span className="font-mono text-[9px] text-[#0A0A0A]/30">
            --
          </span>
        )}

        <ExternalLink className="w-3 h-3 text-[#0A0A0A]/20" />
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProductsAccordion({ products }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Products
          </h2>
          <Link
            href="/products"
            className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A] shrink-0"
          >
            View all →
          </Link>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
          {products.map((product) => (
            <ProductRow
              key={product.tag}
              product={product}
              onSelect={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedProduct && (
        <ProductDetailPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}
