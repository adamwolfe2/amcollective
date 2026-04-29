"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Instagram,
  Linkedin,
  Github,
  Send,
  ArrowRight,
} from "lucide-react";
import { ParallaxHero } from "@/components/ParallaxHero";
import { ImmersiveLanding } from "@/components/immersive/ImmersiveLanding";

// ─── Ventures Data ──────────────────────────────────────────────────────────

const VENTURES = [
  {
    name: "Cursive",
    description:
      "Cursive is the full suite operating intelligence layer for B2B teams. It autonomously tracks & converts leads, turns fragmented GTM & RevOps data into a continuously learning system you can query in plain English.",
    logo: "/cursive-logo.png",
    social: "/cursive social.png",
    url: "https://meetcursive.com",
  },
  {
    name: "TaskSpace",
    description:
      "AI operational infrastructure for multi-company founders & builders. Unified dashboard across all your teams running on EOS. AI handles EOD reports, surfaces blockers, and keeps every entity accountable without you in every meeting.",
    logo: "/taskspace logo NEW.png",
    social: "/taskspace social.png",
    url: "https://trytaskspace.com",
  },
  {
    name: "WholeSail",
    description:
      "Fully custom B2B ordering portals for distribution companies. Client portal, admin panel, iMessage ordering, Stripe billing, automated invoicing \u2014 all curated to your brand. Automate your esoteric spreadsheet company & cut your costs. Fully built and shipped in under 2 weeks.",
    logo: "/wholesail logo.png",
    social: "/wholesail social.png",
    url: "https://wholesailhub.com",
  },
  {
    name: "MyVSL",
    description:
      "AI funnel builder that books calls. Build quiz-to-calendar booking funnels in minutes — three questions, smart scoring, automatic calendar routing. No code required.",
    logo: "/vsl logo.png",
    social: "/vsl social.png",
    url: "https://getmyvsl.com",
  },
  {
    name: "Trackr",
    description:
      "Research any AI tool in under 2 minutes. Track what you pay for. Stay current on top product launches and paint points custom to your company. One shared workspace for your team to go from spreadsheets to AI-Native.",
    logo: "/Trackr Logo.jpg",
    social: "/trackr social.png",
    url: "https://trytrackr.com",
  },
  {
    name: "CampusGTM",
    description:
      "Productized campus distribution infrastructure for startups. Plug & play your product into our evangelist programs, ambassador playbooks, and top-down/bottom-up distribution systems.",
    logo: "/CampusGTM Logo.png",
    social: "/campusgtm social.png",
    url: "https://www.campusgtm.com",
  },
  {
    name: "LeaseStack",
    description:
      "The full-stack managed marketing platform for real estate operators. Deploys a custom website, AI chatbot, visitor identification pixel, and managed ad campaigns across Meta, Google, and TikTok — all tied to lease-level attribution. One platform replaces five vendors, live in 14 days.",
    logo: "/logos/leasestack.png",
    social: "/leasestack social.png",
    url: "https://leasestack.co",
  },
  {
    name: "Hook",
    description:
      "GTM and viral content engine for brands that need Gen Z distribution. Built content systems for YC companies like ElevenLabs.",
    logo: "/hook logo.png",
    social: "/hook social.png",
    url: "https://hookugc.com",
  },
];

// ─── Team Data ──────────────────────────────────────────────────────────────

const TEAM = [
  {
    name: "adam wolfe",
    headshot: "/adam headshot.jpg",
    bio: "Building AI infrastructure to scale and operationalize startups. Leading teams that bring 25+ productized AI services to market, focused on enabling new revenue streams across portfolio companies.",
    instagram: "https://instagram.com/adamwolfe",
    github: "https://github.com/adamwolfe2",
    linkedin: "https://linkedin.com/in/adamwolfe2",
    telegram: "",
  },
  {
    name: "maggie byrne",
    headshot: "/maggie headshot.jpg",
    bio: "Building systems for how companies learn, fund, and launch. AI implementations for organizations ranging from local businesses to firms managing $3B+ in assets. Expertise in fundraising, strategic partnerships, and scaling early-stage ventures.",
    instagram: "https://instagram.com/maggiebyrne",
    github: "https://github.com/maggiebyrne",
    linkedin: "https://linkedin.com/in/maggiebyrne",
    telegram: "",
  },
];

const TABS = ["ventures", "team", "contact"] as const;
type Tab = (typeof TABS)[number];

// ─── Main Component ─────────────────────────────────────────────────────────

// ─── Intro Animation ────────────────────────────────────────────────────────

const INTRO_TEXT = "AM Collective";
const LETTER_STAGGER_MS = 50; // delay between each letter
const LETTER_DURATION_MS = 300; // each letter's slide-up duration
const HOLD_MS = 350; // pause after all letters land
const SLIDE_DURATION_MS = 700; // white panel slides up

// Total: ~55*13 + 350 + 700 ≈ 1.76s

function IntroOverlay({
  onSlideStart,
  onComplete,
}: {
  onSlideStart: () => void;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"letters" | "slide" | "done">("letters");

  useEffect(() => {
    const lettersTotal = INTRO_TEXT.length * LETTER_STAGGER_MS + LETTER_DURATION_MS;
    const slideTimer = setTimeout(() => {
      setPhase("slide");
      onSlideStart();
    }, lettersTotal + HOLD_MS);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, lettersTotal + HOLD_MS + SLIDE_DURATION_MS);

    return () => {
      clearTimeout(slideTimer);
      clearTimeout(doneTimer);
    };
  }, [onSlideStart, onComplete]);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex items-center justify-center pointer-events-none"
      style={{
        transform: phase === "slide" ? "translateY(-100%)" : "translateY(0)",
        transition:
          phase === "slide"
            ? `transform ${SLIDE_DURATION_MS}ms cubic-bezier(0.76, 0, 0.24, 1)`
            : "none",
      }}
    >
      <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light text-[#0A0A0A] flex overflow-hidden">
        {INTRO_TEXT.split("").map((char, i) => (
          <span
            key={i}
            className="inline-block"
            style={{
              animation: `intro-letter-in ${LETTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${i * LETTER_STAGGER_MS}ms both`,
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </h1>
    </div>
  );
}

export function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("ventures");
  const [introComplete, setIntroComplete] = useState(false);
  const [heroAnimateIn, setHeroAnimateIn] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const welcomeRef = useRef<HTMLDivElement>(null);

  // Panel slides up → forest hero rises in → page auto-scrolls to Welcome.
  const handleSlideStart = useCallback(() => {
    document.body.style.overflow = "";
    setHeroAnimateIn(true); // trigger parallax layer rise
    setTimeout(() => {
      if (welcomeRef.current) {
        welcomeRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, 800);
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  // Prevent scroll during intro
  useEffect(() => {
    if (!introComplete) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [introComplete]);

  // Fade-in on scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-fade-up");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll("[data-animate]").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeTab]);

  // Immersive mode — completely separate rendering
  if (immersiveMode) {
    return <ImmersiveLanding onExit={() => setImmersiveMode(false)} />;
  }

  return (
    <div className="bg-white min-h-screen">
      {/* ─── Intro Animation Overlay ─────────────────────────────────── */}
      {!introComplete && (
        <IntroOverlay
          onSlideStart={handleSlideStart}
          onComplete={handleIntroComplete}
        />
      )}
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <ParallaxHero
        animateIn={heroAnimateIn}
        overlay={
          <div className="absolute top-6 right-6 md:top-8 md:right-10">
            <a
              href="https://app.amcollectivecapital.com/sign-in"
              className="font-serif text-sm text-[#0A0A0A]/70 hover:text-[#0A0A0A] transition-colors"
            >
              login
            </a>
          </div>
        }
      />

      {/* ─── Welcome ───────────────────────────────────────────────────── */}
      <section ref={welcomeRef} className="relative z-20 bg-white">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 pt-10 sm:pt-16 pb-8 sm:pb-12 text-center">
          <h2
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-[#0A0A0A] mb-6 sm:mb-8 opacity-0"
            data-animate
          >
            Welcome.
          </h2>
          <p
            className="font-serif text-sm sm:text-base md:text-lg leading-relaxed text-[#0A0A0A]/70 opacity-0"
            data-animate
            style={{ animationDelay: "0.1s" }}
          >
            AM Collective is an operational holding company building AI
            infrastructure through ventures we launch and partners we scale
            alongside. We combine technical AI execution with strategic business
            development to launch companies from 0 to 1 and scale the ones
            already in motion. Each venture starts as proven consulting, then
            becomes product, and those products deepen the value we deliver to
            every company we partner with.
          </p>
        </div>

        {/* ─── Tab Navigation ────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto px-5 sm:px-6 pb-2">
          <div
            role="tablist"
            aria-label="Page sections"
            className="flex items-center justify-center gap-5 sm:gap-6 opacity-0"
            data-animate
            style={{ animationDelay: "0.2s" }}
          >
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`tabpanel-${tab}`}
                id={`tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`font-serif text-sm py-3 pb-1 transition-all duration-300 ${
                  activeTab === tab
                    ? "text-[#0A0A0A] border-b border-[#0A0A0A]"
                    : "text-[#0A0A0A]/35 hover:text-[#0A0A0A]/60"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tab Content ───────────────────────────────────────────────── */}
      <section className="relative z-20 bg-white pb-16 sm:pb-32">
        <div
          className="max-w-5xl mx-auto px-5 sm:px-6"
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === "ventures" && <VenturesTab />}
          {activeTab === "team" && <TeamTab />}
          {activeTab === "contact" && <ContactTab />}
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-[#0A0A0A]/5 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 text-center relative">
          <p className="font-serif text-xs text-[#0A0A0A]/25">
            AM Collective Capital &middot; Portland, OR
          </p>
          {/* Secret toggle — triple-click the dot to enter immersive mode */}
          <button
            onClick={() => setImmersiveMode(true)}
            className="absolute right-5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#0A0A0A]/[0.03] hover:bg-[#0A0A0A]/[0.08] transition-colors cursor-default"
            aria-label="Toggle immersive view"
            title=""
          />
        </div>
      </footer>
    </div>
  );
}

// ─── Ventures Tab ───────────────────────────────────────────────────────────

function VenturesTab() {
  return (
    <div className="pt-8">
      {VENTURES.map((venture, i) => (
        <div
          key={venture.name}
          className="border-t border-[#0A0A0A]/5 py-8 sm:py-12 md:py-16 opacity-0"
          data-animate
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-start">
            {/* Left: Info */}
            <div className="flex flex-col justify-between min-h-0 md:min-h-[200px]">
              <div>
                <div className="mb-4">
                  <Image
                    src={venture.logo}
                    alt={`${venture.name} logo`}
                    width={36}
                    height={36}
                    className="object-contain rounded-none"
                    unoptimized
                  />
                </div>
                <h3 className="font-serif text-xl font-medium text-[#0A0A0A] mb-3">
                  {venture.name}
                </h3>
                <p className="font-serif text-sm leading-relaxed text-[#0A0A0A]/55">
                  {venture.description}
                </p>
              </div>
              <div className="mt-6">
                <a
                  href={venture.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-serif text-sm text-[#0A0A0A] border border-[#0A0A0A]/15 rounded-none px-5 py-3 hover:border-[#0A0A0A]/40 transition-colors group"
                >
                  Visit site
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            </div>

            {/* Right: Screenshot */}
            <div className="relative overflow-hidden rounded-none border border-[#0A0A0A]/5">
              <Image
                src={venture.social}
                alt={`${venture.name} screenshot`}
                width={600}
                height={400}
                className="w-full h-auto object-cover"
                unoptimized
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Team Tab ───────────────────────────────────────────────────────────────

function TeamTab() {
  return (
    <div className="pt-8 sm:pt-10 max-w-2xl mx-auto text-center">
      {/* Narrative */}
      <div className="space-y-5 sm:space-y-6 mb-10 sm:mb-16">
        <p
          className="font-serif text-sm leading-relaxed text-[#0A0A0A]/70 opacity-0"
          data-animate
        >
          Adam and Maggie started working together in 2023 building community
          founding the{" "}
          <strong className="text-[#0A0A0A]">AI Student Association</strong> at
          UO and growing it to 300+ members with workshop programming, speaker
          series, and a consulting pipeline placing students with real clients.
        </p>
        <p
          className="font-serif text-sm leading-relaxed text-[#0A0A0A]/70 opacity-0"
          data-animate
          style={{ animationDelay: "0.05s" }}
        >
          Bonding over a shared desire to bring more tech to Oregon, a mutual
          entrepreneurial itch, and the same obsessive need to make things
          better and connect people, they started taking on projects together.
        </p>
        <p
          className="font-serif text-sm leading-relaxed text-[#0A0A0A]/70 opacity-0"
          data-animate
          style={{ animationDelay: "0.1s" }}
        >
          They built nationwide campus ambassador program infrastructure for
          unicorn companies and helped build and grow AI-powered products to
          thousands of users.
        </p>
        <p
          className="font-serif text-sm leading-relaxed text-[#0A0A0A]/70 opacity-0"
          data-animate
          style={{ animationDelay: "0.15s" }}
        >
          They became an unstoppable force as they started building their own
          things. Founding UO&apos;s flagship hackathon, co-creating an applied
          AI lab bridging students to real projects, and supporting fundraising
          and operations for the largest college incubator challenge.
        </p>
        <p
          className="font-serif text-sm leading-relaxed text-[#0A0A0A]/70 opacity-0"
          data-animate
          style={{ animationDelay: "0.2s" }}
        >
          Three years, dozens of ventures, and a partnership that&apos;s been
          pressure-tested since they were teenagers. AM Collective is the
          natural result of everything they&apos;ve already built. And
          they&apos;re just getting started.
        </p>
      </div>

      {/* Bios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
      {TEAM.map((person, i) => (
        <div
          key={person.name}
          className="opacity-0"
          data-animate
          style={{ animationDelay: `${0.25 + i * 0.1}s` }}
        >
          <div className="mb-3 flex justify-center">
            <Image
              src={person.headshot}
              alt={person.name}
              width={56}
              height={56}
              className="rounded-none object-cover w-14 h-14"
              unoptimized
            />
          </div>
          <h3 className="font-serif text-lg font-medium text-[#0A0A0A] mb-2">
            {person.name}
          </h3>
          <p className="font-serif text-sm leading-relaxed text-[#0A0A0A]/55 mb-4">
            {person.bio}
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href={person.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-[#0A0A0A]/30 hover:text-[#0A0A0A] transition-colors"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={person.github}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-[#0A0A0A]/30 hover:text-[#0A0A0A] transition-colors"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              href={person.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-[#0A0A0A]/30 hover:text-[#0A0A0A] transition-colors"
            >
              <Linkedin className="h-4 w-4" />
            </a>
            {person.telegram && (
              <a
                href={person.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-[#0A0A0A]/30 hover:text-[#0A0A0A] transition-colors"
              >
                <Send className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// ─── Contact Tab ────────────────────────────────────────────────────────────

function ContactTab() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });

      if (res.ok) {
        setSent(true);
        setFormState({ name: "", email: "", message: "" });
      }
    } catch {
      // Silently handle
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pt-8 sm:pt-10 max-w-lg mx-auto">
      <h2
        className="font-serif text-lg sm:text-xl text-center text-[#0A0A0A]/80 mb-8 sm:mb-10 opacity-0"
        data-animate
      >
        Explore How We Can Work Together
      </h2>

      {sent ? (
        <div
          className="text-center py-16 opacity-0"
          data-animate
        >
          <p className="font-serif text-lg text-[#0A0A0A]">
            Thanks for reaching out.
          </p>
          <p className="font-serif text-sm text-[#0A0A0A]/40 mt-2">
            We&apos;ll get back to you soon.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-5 opacity-0"
          data-animate
          style={{ animationDelay: "0.05s" }}
        >
          <div>
            <label htmlFor="contact-name" className="block font-serif text-sm text-[#0A0A0A]/70 mb-1.5">
              Name
            </label>
            <input
              id="contact-name"
              type="text"
              required
              value={formState.name}
              onChange={(e) =>
                setFormState((s) => ({ ...s, name: e.target.value }))
              }
              className="w-full px-4 py-3 border border-[#0A0A0A]/10 bg-white font-serif text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/20 focus:outline-none focus:border-[#0A0A0A]/30 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="block font-serif text-sm text-[#0A0A0A]/70 mb-1.5">
              Email
            </label>
            <input
              id="contact-email"
              type="email"
              required
              value={formState.email}
              onChange={(e) =>
                setFormState((s) => ({ ...s, email: e.target.value }))
              }
              className="w-full px-4 py-3 border border-[#0A0A0A]/10 bg-white font-serif text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/20 focus:outline-none focus:border-[#0A0A0A]/30 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="contact-message" className="block font-serif text-sm text-[#0A0A0A]/70 mb-1.5">
              Message
            </label>
            <textarea
              id="contact-message"
              required
              rows={5}
              value={formState.message}
              onChange={(e) =>
                setFormState((s) => ({ ...s, message: e.target.value }))
              }
              className="w-full px-4 py-3 border border-[#0A0A0A]/10 bg-white font-serif text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/20 focus:outline-none focus:border-[#0A0A0A]/30 transition-colors resize-y"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="w-full py-3 bg-[#0A0A0A] text-white font-serif text-sm hover:bg-[#0A0A0A]/85 transition-colors disabled:opacity-50"
          >
            {sending ? "Sending..." : "Submit"}
          </button>
        </form>
      )}

      {/* Cal.com Embed */}
      <div
        className="mt-10 sm:mt-16 opacity-0"
        data-animate
        style={{ animationDelay: "0.15s" }}
      >
        <CalEmbed />
      </div>
    </div>
  );
}

// ─── Cal.com Embed ──────────────────────────────────────────────────────────

function CalEmbed() {
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Cal.com embed script
    const script = document.createElement("script");
    script.src = "https://app.cal.com/embed/embed.js";
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Cal) {
        const Cal = (window as unknown as Record<string, { (cmd: string, opts: Record<string, unknown>): void }>).Cal;
        Cal("init", { origin: "https://app.cal.com" });
        Cal("inline", {
          elementOrSelector: "#cal-embed",
          calLink: "adamwolfe/wholesail",
          config: {
            theme: "light",
            hideEventTypeDetails: false,
          },
        });
        Cal("ui", {
          theme: "light",
          styles: { branding: { brandColor: "#0A0A0A" } },
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return (
    <div
      id="cal-embed"
      ref={calRef}
      className="w-full max-w-full overflow-x-auto min-h-[400px] border border-[#0A0A0A]/5"
      style={{ overflow: "auto" }}
    />
  );
}
