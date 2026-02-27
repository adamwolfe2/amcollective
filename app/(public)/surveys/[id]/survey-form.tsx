"use client";

import { useState } from "react";

export function SurveyForm({
  surveyId,
  type,
}: {
  surveyId: string;
  type: string;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const isNps = type === "nps";
  const maxScore = isNps ? 10 : 5;
  const labels = isNps
    ? { low: "Not at all likely", high: "Extremely likely" }
    : { low: "Very unsatisfied", high: "Very satisfied" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/public/surveys/${surveyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, feedback: feedback || null }),
      });
      if (res.ok) {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <p className="font-serif text-lg font-bold mb-2">
          Thank you!
        </p>
        <p className="font-serif text-sm text-[#0A0A0A]/50">
          Your feedback has been recorded.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Score selector */}
      <div>
        <div className="flex justify-between mb-2">
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
            {labels.low}
          </span>
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
            {labels.high}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: maxScore + 1 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setScore(i)}
              className={`flex-1 py-3 border font-mono text-sm transition-colors ${
                score === i
                  ? "border-[#0A0A0A] bg-[#0A0A0A] text-white"
                  : "border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback text */}
      <div>
        <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Any additional feedback? (optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          placeholder="Tell us what's going well or what we could improve..."
          className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading || score === null}
        className="w-full border border-[#0A0A0A] bg-[#0A0A0A] text-white px-6 py-3 font-mono text-sm hover:bg-[#0A0A0A]/90 disabled:opacity-50"
      >
        {loading ? "Submitting..." : "Submit Feedback"}
      </button>
    </form>
  );
}
