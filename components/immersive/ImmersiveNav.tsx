"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { EASE_SMOOTH } from "@/lib/immersive/animations";
import { useImmersiveTheme } from "@/lib/immersive/theme-context";

const NAV_LINKS = [
  { label: "Work", href: "#work" },
  { label: "Services", href: "#services" },
  { label: "Process", href: "#process" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

const RESOURCES = [
  { label: "Twitter / X", href: "https://x.com/adamwolfe2" },
  { label: "LinkedIn", href: "https://linkedin.com/in/adamwolfe2" },
  { label: "GitHub", href: "https://github.com/adamwolfe2" },
];

interface ImmersiveNavProps {
  onExit?: () => void;
}

export function ImmersiveNav({ onExit }: ImmersiveNavProps) {
  const { toggle, isDark } = useImmersiveTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 60);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleNavClick(href: string) {
    setMenuOpen(false);
    const id = href.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <>
      {/* Fixed Nav Bar */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: EASE_SMOOTH }}
        className="fixed top-0 left-0 right-0 z-[100] px-5 sm:px-8 py-4 flex items-center justify-between"
        style={{
          background: scrolled
            ? "var(--im-nav-bg)"
            : "transparent",
          backdropFilter: scrolled ? "blur(20px) saturate(1.4)" : "none",
          transition: "background 0.4s ease, backdrop-filter 0.4s ease",
        }}
      >
        {/* Logo */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="text-[var(--im-text)] font-serif text-xl sm:text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity"
        >
          AM
        </button>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--im-btn-secondary-bg)] border border-[var(--im-border)] hover:bg-[var(--im-btn-secondary-bg-hover)] transition-all hidden sm:flex"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-[var(--im-text-muted)]" /> : <Moon className="w-3.5 h-3.5 text-[var(--im-text-muted)]" />}
          </button>

          {/* Menu toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-8 h-8 flex flex-col items-center justify-center gap-1 group"
            aria-label="Toggle menu"
          >
            <span
              className="block w-1.5 h-1.5 rounded-full bg-[var(--im-text-secondary)] group-hover:bg-[var(--im-text)] transition-colors"
            />
            <span className="flex gap-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-[var(--im-text-secondary)] group-hover:bg-[var(--im-text)] transition-colors" />
              <span className="block w-1.5 h-1.5 rounded-full bg-[var(--im-text-secondary)] group-hover:bg-[var(--im-text)] transition-colors" />
            </span>
            <span className="flex gap-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-[var(--im-text-muted)] group-hover:bg-[var(--im-text-secondary)] transition-colors" />
              <span className="block w-1.5 h-1.5 rounded-full bg-[var(--im-text-muted)] group-hover:bg-[var(--im-text-secondary)] transition-colors" />
            </span>
          </button>
        </div>
      </motion.nav>

      {/* Full-screen Menu Overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[200] flex items-start justify-end"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[var(--im-overlay-backdrop)]"
              onClick={() => setMenuOpen(false)}
            />

            {/* Menu panel */}
            <div className="relative w-full max-w-sm h-auto m-4 mt-16 rounded-2xl bg-[var(--im-menu-bg)] backdrop-blur-xl border border-[var(--im-border)] p-8 shadow-2xl">
              <nav className="space-y-1">
                {NAV_LINKS.map((link, i) => (
                  <motion.button
                    key={link.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.04 }}
                    onClick={() => handleNavClick(link.href)}
                    className="block w-full text-left text-2xl font-serif text-[var(--im-text-secondary)] hover:text-[var(--im-text)] py-2 transition-colors"
                  >
                    {link.label}
                  </motion.button>
                ))}
              </nav>

              <div className="mt-8 pt-6 border-t border-[var(--im-border)]">
                <p className="text-xs font-mono uppercase tracking-widest text-[var(--im-text-faint)] mb-3">
                  Resources
                </p>
                {RESOURCES.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm font-serif text-[var(--im-text-muted)] hover:text-[var(--im-text)] py-1.5 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
                {onExit && (
                  <button
                    onClick={onExit}
                    className="block text-sm font-serif text-[var(--im-text-muted)] hover:text-[var(--im-text-secondary)] py-1.5 mt-2 transition-colors"
                  >
                    Exit immersive mode
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
