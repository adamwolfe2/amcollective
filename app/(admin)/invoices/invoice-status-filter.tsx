"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export function InvoiceStatusFilter({
  currentStatus,
}: {
  currentStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (value !== "all") {
      params.set("status", value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={currentStatus} onValueChange={handleChange}>
      <SelectTrigger className="w-48 border-[#0A0A0A] rounded-none bg-white font-mono text-xs">
        <SelectValue placeholder="Filter by status" />
      </SelectTrigger>
      <SelectContent className="border-[#0A0A0A] rounded-none bg-white">
        {STATUSES.map((s) => (
          <SelectItem
            key={s.value}
            value={s.value}
            className="font-mono text-xs"
          >
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
