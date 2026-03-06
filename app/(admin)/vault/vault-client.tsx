"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Check, Trash2, Plus, X, Pencil, Sparkles } from "lucide-react";
import { createCredential, updateCredential, deleteCredential } from "@/lib/actions/vault";

// ─── Types ────────────────────────────────────────────────────────────────────

type Credential = {
  id: string;
  label: string;
  service: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  clientId: string | null;
  projectId: string | null;
  hasPassword: boolean;
  createdAt: Date;
};

// ─── Reveal Button ────────────────────────────────────────────────────────────

export function RevealButton({ id }: { id: string }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleReveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/vault/${id}/reveal`);
      const data = await res.json();
      setRevealed(data.password ?? "");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="flex items-center gap-1">
      <button
        onClick={handleReveal}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 border border-[#0A0A0A]/20 bg-white hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors font-mono text-[10px] uppercase tracking-wider disabled:opacity-40"
      >
        {loading ? (
          "..."
        ) : revealed !== null ? (
          <>
            <EyeOff size={10} /> Hide
          </>
        ) : (
          <>
            <Eye size={10} /> Reveal
          </>
        )}
      </button>
      {revealed !== null && (
        <>
          <span className="font-mono text-[11px] px-2 py-1 bg-[#0A0A0A]/5 border border-[#0A0A0A]/10 max-w-[160px] truncate">
            {revealed || "(empty)"}
          </span>
          <button
            onClick={handleCopy}
            className="p-1 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A] hover:text-white transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
        </>
      )}
    </span>
  );
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────

type FormState = {
  label: string;
  service: string;
  username: string;
  password: string;
  url: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  label: "",
  service: "",
  username: "",
  password: "",
  url: "",
  notes: "",
};

export function CredentialForm({
  editing,
  prefill,
  onClose,
}: {
  editing?: Credential | null;
  prefill?: ParsedFields | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          label: editing.label,
          service: editing.service,
          username: editing.username ?? "",
          password: "",
          url: editing.url ?? "",
          notes: editing.notes ?? "",
        }
      : prefill
      ? {
          label: prefill.label,
          service: prefill.service,
          username: prefill.username,
          password: prefill.password,
          url: prefill.url,
          notes: prefill.notes,
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        label: form.label,
        service: form.service,
        username: form.username || undefined,
        password: form.password || undefined,
        url: form.url || undefined,
        notes: form.notes || undefined,
      };
      const result = editing
        ? await updateCredential(editing.id, payload)
        : await createCredential(payload);

      if (!result.success) {
        setError(result.error ?? "Unknown error");
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[#F3F3EF] border-2 border-[#0A0A0A] w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif font-bold text-lg">
            {editing ? "Edit Credential" : "Add Credential"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#0A0A0A]/10">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {(
            [
              { field: "label", label: "Label *", placeholder: "e.g. Stripe Production" },
              { field: "service", label: "Service *", placeholder: "e.g. stripe" },
              { field: "username", label: "Username / Email", placeholder: "" },
              {
                field: "password",
                label: editing ? "Password (leave blank to keep existing)" : "Password",
                placeholder: "",
                type: "password",
              },
              { field: "url", label: "URL", placeholder: "https://dashboard.stripe.com" },
            ] as Array<{
              field: keyof FormState;
              label: string;
              placeholder: string;
              type?: string;
            }>
          ).map(({ field, label, placeholder, type }) => (
            <div key={field}>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
                {label}
              </label>
              <input
                type={type ?? "text"}
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
                placeholder={placeholder}
                className="w-full border border-[#0A0A0A]/30 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#0A0A0A]"
              />
            </div>
          ))}

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full border border-[#0A0A0A]/30 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#0A0A0A] resize-none"
            />
          </div>

          {error && (
            <p className="font-mono text-[11px] text-red-600">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider py-2.5 hover:bg-[#0A0A0A]/80 disabled:opacity-40"
            >
              {isPending ? "Saving..." : editing ? "Update" : "Add Credential"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 border border-[#0A0A0A]/30 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Button ────────────────────────────────────────────────────────────

export function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={() =>
            startTransition(async () => {
              await deleteCredential(id);
            })
          }
          disabled={isPending}
          className="px-2 py-1 border border-red-500 text-red-600 font-mono text-[10px] uppercase tracking-wider hover:bg-red-50 disabled:opacity-40"
        >
          {isPending ? "..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="px-2 py-1 border border-[#0A0A0A]/20 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/5"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="p-1.5 border border-[#0A0A0A]/20 hover:border-red-400 hover:text-red-600 transition-colors"
      title="Delete credential"
    >
      <Trash2 size={12} />
    </button>
  );
}

// ─── AI Parse Modal ───────────────────────────────────────────────────────────

type ParsedFields = {
  label: string;
  service: string;
  username: string;
  password: string;
  url: string;
  notes: string;
};

function AiParseModal({
  onClose,
  onParsed,
}: {
  onClose: () => void;
  onParsed: (fields: ParsedFields) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vault/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Parse failed");
        return;
      }
      onParsed(data as ParsedFields);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[#F3F3EF] border-2 border-[#0A0A0A] w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={15} />
            <h2 className="font-serif font-bold text-lg">AI Parse Credential</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#0A0A0A]/10">
            <X size={16} />
          </button>
        </div>

        <p className="font-mono text-[11px] text-[#0A0A0A]/50 mb-3">
          Paste any raw text (email, doc, notes) and Claude will extract the
          credential fields automatically.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="e.g. Mercury login: admin@amcollective.com / Password: abc123!&#10;URL: https://app.mercury.com"
          className="w-full border border-[#0A0A0A]/30 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#0A0A0A] resize-none mb-3"
        />

        {error && (
          <p className="font-mono text-[11px] text-red-600 mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleParse}
            disabled={loading || !text.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider py-2.5 hover:bg-[#0A0A0A]/80 disabled:opacity-40"
          >
            <Sparkles size={12} />
            {loading ? "Parsing..." : "Parse with AI"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 border border-[#0A0A0A]/30 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vault Table (client wrapper with add/edit controls) ──────────────────────

export function VaultTable({ rows }: { rows: Credential[] }) {
  const [showForm, setShowForm] = useState(false);
  const [showAiParse, setShowAiParse] = useState(false);
  const [editTarget, setEditTarget] = useState<Credential | null>(null);
  const [prefill, setPrefill] = useState<ParsedFields | null>(null);

  function handleParsed(fields: ParsedFields) {
    setPrefill(fields);
    setShowAiParse(false);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditTarget(null);
    setPrefill(null);
  }

  return (
    <>
      {showAiParse && (
        <AiParseModal
          onClose={() => setShowAiParse(false)}
          onParsed={handleParsed}
        />
      )}

      {(showForm || editTarget) && (
        <CredentialForm
          editing={editTarget}
          prefill={prefill}
          onClose={handleFormClose}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Credentials Vault
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Encrypted shared credentials — passwords revealed on demand
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiParse(true)}
            className="flex items-center gap-2 border border-[#0A0A0A] font-mono text-xs uppercase tracking-wider px-4 py-2.5 hover:bg-[#0A0A0A] hover:text-white transition-colors"
          >
            <Sparkles size={13} />
            AI Parse
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider px-4 py-2.5 hover:bg-[#0A0A0A]/80"
          >
            <Plus size={13} />
            Add Credential
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 p-12 text-center">
          <p className="font-mono text-sm text-[#0A0A0A]/40">
            No credentials stored yet. Add your first one above.
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.03]">
                <th className="text-left font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-4 py-3">
                  Label
                </th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-4 py-3">
                  Service
                </th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-4 py-3">
                  Username
                </th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-4 py-3">
                  Password
                </th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-4 py-3">
                  URL
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-[#0A0A0A]/[0.02]">
                  <td className="px-4 py-3 font-medium">{row.label}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-[#0A0A0A]/5 border border-[#0A0A0A]/10 px-2 py-0.5">
                      {row.service}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#0A0A0A]/60">
                    {row.username ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.hasPassword ? (
                      <RevealButton id={row.id} />
                    ) : (
                      <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                        none
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#0A0A0A]/50 max-w-[180px] truncate">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#0A0A0A] underline"
                      >
                        {row.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => setEditTarget(row)}
                        className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A] hover:text-white transition-colors"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <DeleteButton id={row.id} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
