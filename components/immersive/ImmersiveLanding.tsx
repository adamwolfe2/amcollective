"use client";

import { useEffect } from "react";
import { ImmersiveThemeProvider, useImmersiveTheme } from "@/lib/immersive/theme-context";
import { ImmersiveNav } from "./ImmersiveNav";
import { HeroSection } from "./HeroSection";

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

  // Scroll to top when entering immersive mode
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div
      className="immersive-mode bg-[var(--im-bg)] text-[var(--im-text)]"
      data-im-theme={theme}
    >
      <ImmersiveNav onExit={onExit} />
      <HeroSection />
    </div>
  );
}
