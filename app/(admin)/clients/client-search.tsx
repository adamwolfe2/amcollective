"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition, useRef } from "react";
import { Input } from "@/components/ui/input";

export function ClientSearch({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback(
    (value: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
          params.set("search", value);
        } else {
          params.delete("search");
        }
        startTransition(() => {
          router.push(`/clients?${params.toString()}`);
        });
      }, 300);
    },
    [router, searchParams]
  );

  return (
    <div className="relative">
      <Input
        type="text"
        placeholder="Search clients by name, company, or email..."
        defaultValue={defaultValue}
        onChange={(e) => handleSearch(e.target.value)}
        className="font-mono text-sm border-[#0A0A0A]/10 rounded-none bg-white h-10 placeholder:text-[#0A0A0A]/30"
      />
      {isPending && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 border-2 border-[#0A0A0A]/20 border-t-[#0A0A0A] rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
