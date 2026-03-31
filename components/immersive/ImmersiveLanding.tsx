"use client";

import { useEffect } from "react";
import { ImmersiveNav } from "./ImmersiveNav";
import { HeroSection } from "./HeroSection";
import { ClientsStrip } from "./ClientsStrip";
import { ServicesSection } from "./ServicesSection";
import { ProjectsCarousel } from "./ProjectsCarousel";
import { ProcessSection } from "./ProcessSection";
import { PricingSection } from "./PricingSection";
import { FAQSection } from "./FAQSection";
import { ImmersiveFooter } from "./ImmersiveFooter";

interface ImmersiveLandingProps {
  onExit: () => void;
}

export function ImmersiveLanding({ onExit }: ImmersiveLandingProps) {
  // Scroll to top when entering immersive mode
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div className="immersive-mode bg-[#0a0a0c] text-white min-h-screen">
      <ImmersiveNav onExit={onExit} />
      <HeroSection />
      <ClientsStrip />
      <ProjectsCarousel />
      <ServicesSection />
      <ProcessSection />
      <PricingSection />
      <FAQSection />
      <ImmersiveFooter />

      {/* Persistent bottom CTA bar (like Off Menu's "Let's work together") */}
      <div className="fixed bottom-6 left-6 z-[90]">
        <button
          onClick={() => {
            document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="group flex items-center gap-3 bg-[#1a1a1e]/90 backdrop-blur-xl text-white font-serif text-sm px-6 py-3.5 rounded-full border border-white/[0.08] hover:border-white/[0.15] hover:bg-[#1a1a1e] transition-all duration-300 shadow-2xl"
        >
          <span className="grid grid-cols-3 gap-0.5 w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity">
            {[...Array(9)].map((_, j) => (
              <span
                key={j}
                className="w-1 h-1 rounded-full bg-white"
              />
            ))}
          </span>
          Let&apos;s work together
        </button>
      </div>

      {/* Decorative dot pattern (bottom-right, like Off Menu) */}
      <div className="fixed bottom-6 right-6 z-[90] hidden sm:block opacity-30">
        <div className="grid grid-cols-3 gap-2">
          {[...Array(9)].map((_, j) => (
            <span
              key={j}
              className={`w-1.5 h-1.5 rounded-full ${
                j === 3 ? "bg-white" : "bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
