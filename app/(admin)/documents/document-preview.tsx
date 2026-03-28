"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Download } from "lucide-react";

interface DocumentPreviewProps {
  title: string;
  fileUrl: string;
  mimeType: string | null;
  fileName: string | null;
}

function isPdf(mimeType: string | null, fileName: string | null): boolean {
  if (mimeType === "application/pdf") return true;
  if (fileName?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function isImage(mimeType: string | null, fileName: string | null): boolean {
  if (mimeType?.startsWith("image/")) return true;
  const ext = fileName?.split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext ?? "");
}

export function DocumentPreviewTrigger(props: DocumentPreviewProps) {
  const [open, setOpen] = useState(false);

  const showPreview = isPdf(props.mimeType, props.fileName) || isImage(props.mimeType, props.fileName);

  if (!showPreview) {
    return (
      <a
        href={props.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-serif font-medium text-[#0A0A0A] hover:underline underline-offset-2 cursor-pointer"
      >
        {props.title}
      </a>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-serif font-medium text-[#0A0A0A] hover:underline underline-offset-2 text-left"
      >
        {props.title}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#0A0A0A] max-w-4xl w-full max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b border-[#0A0A0A]/10 flex flex-row items-center justify-between shrink-0">
            <DialogTitle className="font-serif text-base tracking-tight">
              {props.title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <a
                href={props.fileUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto min-h-0">
            {isPdf(props.mimeType, props.fileName) ? (
              <object
                data={props.fileUrl}
                type="application/pdf"
                className="w-full h-full min-h-[70vh]"
              >
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <p className="font-mono text-sm text-[#0A0A0A]/50">
                    PDF preview not available in this browser.
                  </p>
                  <a
                    href={props.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs uppercase tracking-wider border border-[#0A0A0A] px-4 py-2 hover:bg-[#0A0A0A]/5"
                  >
                    Open PDF
                  </a>
                </div>
              </object>
            ) : (
              // Image lightbox
              <div className="flex items-center justify-center p-4 bg-[#F3F3EF] min-h-[60vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={props.fileUrl}
                  alt={props.title}
                  className="max-w-full max-h-[75vh] object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
