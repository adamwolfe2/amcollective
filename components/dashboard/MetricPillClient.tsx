"use client"

import Link from "next/link"
import { TrendingUp, TrendingDown } from "lucide-react"
import { useCountUp } from "@/lib/hooks/use-count-up"

interface MetricPillClientProps {
  label: string
  /** The numeric target for count-up animation */
  numericValue: number
  sub?: string
  href: string
  alert?: boolean
  trend?: number | null
  /** If true, display the count-up as a currency string */
  isCurrency?: boolean
}

export function MetricPillClient({
  label,
  numericValue,
  sub,
  href,
  alert = false,
  trend,
  isCurrency = false,
}: MetricPillClientProps) {
  const animatedValue = useCountUp(numericValue)

  const trendPositive = trend !== null && trend !== undefined && trend > 0
  const trendNegative = trend !== null && trend !== undefined && trend < 0

  // Format the animated count value to match display style
  const formattedAnimated = isCurrency
    ? `$${animatedValue >= 1000
        ? animatedValue >= 1_000_000
          ? `${(animatedValue / 1_000_000).toFixed(1)}M`
          : `${(animatedValue / 1000).toFixed(0)}k`
        : animatedValue.toLocaleString()}`
    : String(animatedValue)

  return (
    <Link
      href={href}
      className={`block border bg-white px-3 py-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors ${
        alert
          ? "border-[#0A0A0A]/30 border-l-2 border-l-[#0A0A0A]"
          : "border-[#0A0A0A]/10"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
          {label}
        </span>
        {trend !== null && trend !== undefined && (
          <span
            className={`flex items-center gap-0.5 font-mono text-[9px] shrink-0 ${
              trendPositive
                ? "text-[#0A0A0A]/60"
                : trendNegative
                  ? "text-[#0A0A0A]/40"
                  : "text-[#0A0A0A]/30"
            }`}
          >
            {trendPositive ? (
              <TrendingUp size={8} />
            ) : trendNegative ? (
              <TrendingDown size={8} />
            ) : null}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <span className="font-mono text-base sm:text-lg font-bold block leading-tight truncate">
        {formattedAnimated}
      </span>
      {sub && (
        <span className="font-mono text-[9px] text-[#0A0A0A]/40 block mt-0.5">
          {sub}
        </span>
      )}
    </Link>
  )
}
