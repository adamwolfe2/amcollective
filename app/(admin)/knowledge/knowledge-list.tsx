"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";

type Article = {
  id: string;
  title: string;
  content: string | null;
  docType: string;
  tags: string[];
  updatedAt: Date;
  createdAt: Date;
};

type Props = {
  initialArticles: Article[];
  allTags: string[];
};

const TYPE_STYLES: Record<string, string> = {
  sop: "border-[#0A0A0A] bg-[#0A0A0A] text-white",
  note: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  brief: "border-[#0A0A0A]/30 bg-transparent text-[#0A0A0A]/70",
};

export function KnowledgeList({ initialArticles, allTags }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTag, setFilterTag] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("sop");
  const [loading, setLoading] = useState(false);

  const filtered = initialArticles.filter((a) => {
    if (filterType !== "all" && a.docType !== filterType) return false;
    if (filterTag && !a.tags.includes(filterTag)) return false;
    if (
      search &&
      !a.title.toLowerCase().includes(search.toLowerCase()) &&
      !(a.content ?? "").toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          docType: newType,
          content: "",
        }),
      });
      if (res.ok) {
        const doc = await res.json();
        setShowNew(false);
        setNewTitle("");
        router.push(`/knowledge/${doc.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Knowledge Base
        </h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors"
        >
          New Article
        </button>
      </div>

      {/* Quick Create */}
      {showNew && (
        <div className="border border-[#0A0A0A] bg-white p-4 mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Title
            </label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Article title..."
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Type
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm focus:border-[#0A0A0A] focus:outline-none"
            >
              <option value="sop">SOP</option>
              <option value="note">Note</option>
              <option value="brief">Brief</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim() || loading}
            className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles..."
          className="flex-1 border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-xs focus:border-[#0A0A0A] focus:outline-none"
        >
          <option value="all">All Types</option>
          <option value="sop">SOPs</option>
          <option value="note">Notes</option>
          <option value="brief">Briefs</option>
        </select>
        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-xs focus:border-[#0A0A0A] focus:outline-none"
          >
            <option value="">All Tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="border border-[#0A0A0A] bg-white p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Total
          </p>
          <p className="font-mono text-lg font-bold">{initialArticles.length}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            SOPs
          </p>
          <p className="font-mono text-lg font-bold text-[#0A0A0A]">
            {initialArticles.filter((a) => a.docType === "sop").length}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Notes
          </p>
          <p className="font-mono text-lg font-bold">
            {initialArticles.filter((a) => a.docType === "note").length}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Tags
          </p>
          <p className="font-mono text-lg font-bold">{allTags.length}</p>
        </div>
      </div>

      {/* Article List */}
      <div className="border border-[#0A0A0A] bg-white divide-y divide-[#0A0A0A]/10">
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="font-serif text-sm text-[#0A0A0A]/40">
              {search || filterType !== "all" || filterTag
                ? "No articles match your filters."
                : "No knowledge articles yet. Upload SOPs, briefs, and notes from the Documents page, or ask AM Agent to create a knowledge article."}
            </p>
          </div>
        )}
        {filtered.map((article) => (
          <Link
            key={article.id}
            href={`/knowledge/${article.id}`}
            className="block px-6 py-4 hover:bg-[#0A0A0A]/[0.02] transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex px-1.5 py-0.5 text-[10px] font-mono border rounded-none ${
                      TYPE_STYLES[article.docType] || TYPE_STYLES.note
                    }`}
                  >
                    {article.docType.toUpperCase()}
                  </span>
                  <h3 className="font-serif text-sm font-medium text-[#0A0A0A]">
                    {article.title}
                  </h3>
                </div>
                {article.content && (
                  <p className="font-serif text-xs text-[#0A0A0A]/40 line-clamp-1">
                    {article.content.replace(/<[^>]*>/g, "").slice(0, 120)}
                  </p>
                )}
                {article.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-[10px] border border-[#0A0A0A]/10 px-1 py-0.5 text-[#0A0A0A]/40"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="font-mono text-[10px] text-[#0A0A0A]/30 shrink-0 ml-4">
                {format(article.updatedAt, "MMM d, yyyy")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
