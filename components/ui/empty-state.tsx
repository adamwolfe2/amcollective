import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center border border-[#0A0A0A]/10 ${className}`}
    >
      <div className="w-12 h-12 border border-[#0A0A0A]/20 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-[#0A0A0A]/30" strokeWidth={1.5} />
      </div>
      <p className="font-serif text-lg font-bold text-[#0A0A0A] mb-1">{title}</p>
      <p className="font-mono text-xs text-[#0A0A0A]/40 max-w-sm">{description}</p>
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/80 transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/80 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
