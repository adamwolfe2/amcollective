"use client";

import { useState, useRef, useEffect } from "react";
import { recordValue } from "@/lib/actions/scorecard";

interface ScorecardCellProps {
  metricId: string;
  weekStart: string;
  value: string | null;
  colorClass: string;
}

export function ScorecardCell({
  metricId,
  weekStart,
  value,
  colorClass,
}: ScorecardCellProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = async () => {
    if (inputValue === (value ?? "")) {
      setEditing(false);
      return;
    }

    if (!inputValue.trim()) {
      setEditing(false);
      setInputValue(value ?? "");
      return;
    }

    setSaving(true);
    await recordValue({
      metricId,
      weekStart,
      value: inputValue.trim(),
    });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <td className="px-1 py-1 border-b border-[#0A0A0A]/5 text-center">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setInputValue(value ?? "");
              setEditing(false);
            }
          }}
          disabled={saving}
          className="w-full max-w-[56px] mx-auto text-center font-mono text-sm border border-[#0A0A0A] px-1 py-1 bg-white focus:outline-none"
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => {
        setInputValue(value ?? "");
        setEditing(true);
      }}
      className={`font-mono text-sm px-3 py-3 border-b border-[#0A0A0A]/5 text-center cursor-pointer hover:bg-[#0A0A0A]/[0.03] transition-colors ${colorClass}`}
      title="Click to edit"
    >
      {value ?? <span className="text-[#0A0A0A]/15">&mdash;</span>}
    </td>
  );
}
