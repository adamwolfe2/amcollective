"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, X } from "lucide-react";

const DOC_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "proposal", label: "Proposal" },
  { value: "note", label: "Note" },
  { value: "sop", label: "SOP" },
  { value: "invoice", label: "Invoice" },
  { value: "brief", label: "Brief" },
  { value: "other", label: "Other" },
];

const COMPANY_TAGS = [
  { value: "am_collective", label: "AM Collective" },
  { value: "trackr", label: "Trackr" },
  { value: "wholesail", label: "Wholesail" },
  { value: "taskspace", label: "TaskSpace" },
  { value: "cursive", label: "Cursive" },
  { value: "tbgc", label: "TBGC" },
  { value: "hook", label: "Hook" },
  { value: "personal", label: "Personal" },
];

interface Client {
  id: string;
  name: string;
}

const ALLOWED_EXTENSIONS = ".pdf, .docx, .xlsx, .png, .jpg";
const ACCEPT = ".pdf,.docx,.xlsx,.doc,.xls,.png,.jpg,.jpeg,.webp,.mp4,.txt,.md";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDocumentDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFileSelect(file: File) {
    setSelectedFile(file);
    setError(null);
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setProgress(0);

    const form = new FormData(e.currentTarget);
    if (selectedFile) {
      form.set("file", selectedFile);
    }

    try {
      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setProgress((p) => (p < 85 ? p + 5 : p));
      }, 200);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setPending(false);
        setProgress(0);
        return;
      }

      setTimeout(() => {
        setOpen(false);
        setSelectedFile(null);
        setProgress(0);
        router.refresh();
      }, 300);
    } catch {
      setError("Upload failed. Please try again.");
      setProgress(0);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) { setSelectedFile(null); setProgress(0); setError(null); }
    }}>
      <DialogTrigger asChild>
        <Button className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 h-9 px-4">
          <Upload className="h-3.5 w-3.5 mr-2" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-none border-[#0A0A0A] sm:max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg tracking-tight">
            Upload Document
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Title *
            </Label>
            <Input
              name="title"
              required
              placeholder="Document title"
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              File
            </Label>
            {/* Drag-and-drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              className={`border border-dashed p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-[#0A0A0A]/60 bg-[#0A0A0A]/5"
                  : "border-[#0A0A0A]/20 hover:border-[#0A0A0A]/40"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                name="file"
                className="hidden"
                accept={ACCEPT}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="font-mono text-sm text-[#0A0A0A]">{selectedFile.name}</span>
                  <span className="font-mono text-xs text-[#0A0A0A]/40">({formatFileSize(selectedFile.size)})</span>
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); setSelectedFile(null); }}
                    className="text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div>
                  <p className="font-mono text-xs text-[#0A0A0A]/40">
                    Drag and drop or click to select (max 25MB)
                  </p>
                  <p className="font-mono text-[10px] text-[#0A0A0A]/25 mt-1">
                    Allowed: {ALLOWED_EXTENSIONS}
                  </p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {pending && (
              <div className="h-1 bg-[#0A0A0A]/10 w-full">
                <div
                  className="h-1 bg-[#0A0A0A] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
                Type
              </Label>
              <Select name="docType" defaultValue="note">
                <SelectTrigger className="font-mono text-sm rounded-none border-[#0A0A0A]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="font-mono text-sm">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
                Company
              </Label>
              <Select name="companyTag" defaultValue="am_collective">
                <SelectTrigger className="font-mono text-sm rounded-none border-[#0A0A0A]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {COMPANY_TAGS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="font-mono text-sm">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Client (optional)
            </Label>
            <Select name="clientId">
              <SelectTrigger className="font-mono text-sm rounded-none border-[#0A0A0A]/20">
                <SelectValue placeholder="No client" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="font-mono text-sm">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isClientVisible"
              value="true"
              id="isClientVisible"
              className="h-4 w-4 border-[#0A0A0A]/20"
            />
            <Label
              htmlFor="isClientVisible"
              className="font-mono text-xs text-[#0A0A0A]/60 cursor-pointer"
            >
              Visible to client
            </Label>
          </div>

          {error && (
            <p className="text-sm font-mono text-[#0A0A0A]/70">{error}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="font-mono text-xs uppercase tracking-wider rounded-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
            >
              {pending ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
