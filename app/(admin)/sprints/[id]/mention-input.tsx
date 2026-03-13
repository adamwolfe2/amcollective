"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Check } from "lucide-react";

export type MentionOption = { id: string; name: string; meta?: string };

/**
 * A text input that shows a filtered dropdown as you type.
 * On selecting an option, returns both the display name and the FK id.
 * Styled to match the offset-brutalist design system.
 */
export function MentionInput({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  className,
  label,
  emptyText = "No matches",
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (option: MentionOption | null) => void;
  options: MentionOption[];
  placeholder?: string;
  className?: string;
  label?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered =
    value.trim().length === 0
      ? options
      : options.filter((o) =>
          o.name.toLowerCase().includes(value.toLowerCase())
        );

  useEffect(() => {
    setHighlighted(0);
  }, [value]);

  function handleSelect(opt: MentionOption) {
    onChange(opt.name);
    onSelect(opt);
    setOpen(false);
  }

  function _handleClear() {
    onChange("");
    onSelect(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  return (
    <div className="relative">
      {label && (
        <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${className} w-full border-b border-[#0A0A0A]/20 py-1 font-mono text-sm bg-transparent focus:outline-none focus:border-[#0A0A0A]/50 placeholder:text-[#0A0A0A]/30`}
      />

      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 top-full left-0 mt-1 w-full min-w-[220px] bg-white border border-[#0A0A0A]/15 shadow-lg max-h-52 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 font-mono text-xs text-[#0A0A0A]/30 italic">
              {emptyText}
            </li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.id}
                onMouseDown={() => handleSelect(opt)}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                  i === highlighted
                    ? "bg-[#0A0A0A] text-white"
                    : "hover:bg-[#0A0A0A]/5 text-[#0A0A0A]"
                }`}
              >
                <span className="flex-1 font-mono text-xs">{opt.name}</span>
                {opt.meta && (
                  <span
                    className={`font-mono text-[10px] ${
                      i === highlighted ? "text-white/50" : "text-[#0A0A0A]/30"
                    }`}
                  >
                    {opt.meta}
                  </span>
                )}
                {opt.name.toLowerCase() === value.toLowerCase() && (
                  <Check
                    size={10}
                    className={i === highlighted ? "text-white" : "text-[#0A0A0A]/50"}
                  />
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
