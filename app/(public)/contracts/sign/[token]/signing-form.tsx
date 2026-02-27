"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export function ContractSigningForm({ token }: { token: string }) {
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState("");

  // Simple signature pad using canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasDrawn = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0A0A0A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPosition = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      hasDrawn.current = true;
      const pos = getPosition(e);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    },
    [getPosition]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const pos = getPosition(e);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    },
    [getPosition]
  );

  const stopDrawing = useCallback(() => {
    isDrawing.current = false;
  }, []);

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasDrawn.current = false;
  }

  async function handleSign() {
    if (!signatoryName || !agreed) return;
    setLoading(true);
    setError("");

    try {
      const signatureData = hasDrawn.current
        ? canvasRef.current?.toDataURL("image/png") ?? null
        : null;

      const res = await fetch(`/api/public/contracts/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatoryName,
          signatoryTitle: signatoryTitle || null,
          signatureData,
        }),
      });

      if (res.ok) {
        setSigned(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to sign contract");
      }
    } catch {
      setError("Failed to sign contract. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (signed) {
    return (
      <div className="text-center py-8">
        <h3 className="font-serif text-lg font-bold text-green-800 mb-2">
          Contract Signed Successfully
        </h3>
        <p className="font-serif text-sm text-[#0A0A0A]/50">
          Thank you for signing. You will receive a copy of the executed
          contract once it has been countersigned.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Full Name
        </label>
        <input
          value={signatoryName}
          onChange={(e) => setSignatoryName(e.target.value)}
          placeholder="Your full legal name"
          className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
        />
      </div>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Title (optional)
        </label>
        <input
          value={signatoryTitle}
          onChange={(e) => setSignatoryTitle(e.target.value)}
          placeholder="e.g. CEO, Director"
          className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
        />
      </div>

      {/* Signature Pad */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Signature (optional)
          </label>
          <button
            type="button"
            onClick={clearSignature}
            className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A] underline"
          >
            Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full border border-[#0A0A0A]/20 bg-white cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      {/* Agreement Checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 border-[#0A0A0A]/30 accent-[#0A0A0A]"
        />
        <span className="font-serif text-sm text-[#0A0A0A]/70">
          I have read and agree to all terms and conditions outlined in this
          contract. I understand this constitutes a legally binding agreement.
        </span>
      </label>

      {error && (
        <p className="font-mono text-sm text-red-700">{error}</p>
      )}

      <button
        onClick={handleSign}
        disabled={!signatoryName || !agreed || loading}
        className="w-full px-4 py-3 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
      >
        {loading ? "Signing..." : "Sign Contract"}
      </button>
    </div>
  );
}
