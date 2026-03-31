"use client";

import { useState, useEffect } from "react";
import { ImmersiveThemeProvider, useImmersiveTheme } from "@/lib/immersive/theme-context";
import { ImmersiveNav } from "./ImmersiveNav";
import { HeroSection } from "./HeroSection";
import { ClientsStrip } from "./ClientsStrip";
import { ServicesSection } from "./ServicesSection";
import { ProjectsCarousel } from "./ProjectsCarousel";
import { ProcessSection } from "./ProcessSection";
import { PricingSection } from "./PricingSection";
import { FAQSection } from "./FAQSection";
import { ImmersiveFooter } from "./ImmersiveFooter";
import OrbitalLoader from "./OrbitalLoader";

interface ImmersiveLandingProps {
  onExit: () => void;
}

export function ImmersiveLanding({ onExit }: ImmersiveLandingProps) {
  return (
    <ImmersiveThemeProvider>
      <ImmersiveLandingInner onExit={onExit} />
    </ImmersiveThemeProvider>
  );
}

function ImmersiveLandingInner({ onExit }: ImmersiveLandingProps) {
  const { theme } = useImmersiveTheme();
  const [loading, setLoading] = useState(true);

  // Scroll to top when entering immersive mode
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  if (loading) {
    return (
      <div className="immersive-mode" data-im-theme={theme}>
        <OrbitalLoader onComplete={() => setLoading(false)} />
      </div>
    );
  }

  return (
    <div className="immersive-mode bg-[var(--im-bg)] text-[var(--im-text)] min-h-screen" data-im-theme={theme}>
      <ImmersiveNav onExit={onExit} />
      <HeroSection />
      <ClientsStrip />
      <ProjectsCarousel />
      <ServicesSection />
      <ProcessSection />
      <PricingSection />
      <FAQSection />
      <ImmersiveFooter />

      {/* Persistent bottom CTA bar */}
      <div className="fixed bottom-6 left-6 z-[90]">
        <button
          onClick={() => {
            document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="group flex items-center gap-3 bg-[var(--im-surface-hover)] backdrop-blur-xl text-[var(--im-text)] font-serif text-sm px-6 py-3.5 rounded-full border border-[var(--im-border)] hover:border-[var(--im-border-hover)] hover:bg-[var(--im-surface-hover)] transition-all duration-300 shadow-2xl"
        >
          <span className="grid grid-cols-3 gap-0.5 w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity">
            {[...Array(9)].map((_, j) => (
              <span
                key={j}
                className="w-1 h-1 rounded-full bg-[var(--im-text)]"
              />
            ))}
          </span>
          Let&apos;s work together
        </button>
      </div>

      {/* Decorative dot pattern (bottom-right) */}
      <div className="fixed bottom-6 right-6 z-[90] hidden sm:block opacity-30">
        <div className="grid grid-cols-3 gap-2">
          {[...Array(9)].map((_, j) => (
            <span
              key={j}
              className={`w-1.5 h-1.5 rounded-full ${
                j === 3 ? "bg-[var(--im-text)]" : "bg-[var(--im-text-faint)]"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
