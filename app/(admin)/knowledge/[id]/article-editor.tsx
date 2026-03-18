"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Props = {
  articleId: string;
  initialTitle: string;
  initialContent: string;
  initialDocType: string;
  initialTags: string[];
};

export function ArticleEditor({
  articleId,
  initialTitle,
  initialContent,
  initialDocType,
  initialTags,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [docType, setDocType] = useState(initialDocType);
  const [tagInput, setTagInput] = useState(initialTags.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/knowledge/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, docType, tags }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [articleId, title, content, docType, tagInput, router]);

  async function handleDelete() {
    if (!window.confirm("Delete this article? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/knowledge/${articleId}`, { method: "DELETE" });
      router.push("/knowledge");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Title + Meta */}
      <div className="border border-[#0A0A0A] bg-white p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm focus:border-[#0A0A0A] focus:outline-none"
            >
              <option value="sop">SOP</option>
              <option value="note">Note</option>
              <option value="brief">Brief</option>
            </select>
          </div>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
            Tags (comma separated)
          </label>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="e.g. onboarding, sales, dev"
            className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm focus:border-[#0A0A0A] focus:outline-none"
          />
        </div>
      </div>

      {/* Content Editor */}
      <div className="border border-[#0A0A0A] bg-white p-6">
        <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-2">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          placeholder="Write your article content here... (supports plain text and basic HTML)"
          className="w-full border border-[#0A0A0A]/20 bg-white px-4 py-3 font-serif text-sm leading-relaxed focus:border-[#0A0A0A] focus:outline-none resize-y min-h-[300px]"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-4 py-2 border border-[#0A0A0A]/30 text-[#0A0A0A]/70 font-mono text-sm hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Delete Article"}
        </button>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="font-mono text-xs text-[#0A0A0A]">Saved</span>
          )}
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="px-6 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
