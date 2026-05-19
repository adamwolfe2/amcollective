"use client";

import Image from "next/image";

// Trusted-by logo strip. To add a partner, drop the asset into
// `public/partners/` and append to this array.
const LOGOS = [
  { src: "/partners/anthropic-logo.svg", alt: "Anthropic" },
  { src: "/partners/perplexity-logo.png", alt: "Perplexity AI" },
  { src: "/partners/ycombinator-logo.png", alt: "Y Combinator" },
  { src: "/partners/airtable-logo.png", alt: "Airtable" },
  { src: "/partners/elevenlabs-logo.png", alt: "ElevenLabs" },
  { src: "/partners/deepsky-logo.png", alt: "Deepsky" },
  { src: "/partners/polymarket-logo.png", alt: "Polymarket" },
  { src: "/partners/herostuff-logo.png", alt: "Hero Stuff" },
];

export function LogoStrip() {
  return (
    <div
      className="max-w-4xl mx-auto px-5 sm:px-6 pt-2 pb-8 sm:pb-12 opacity-0"
      data-animate
      style={{ animationDelay: "0.15s" }}
    >
      <p className="text-center font-serif text-[11px] sm:text-xs tracking-[0.18em] uppercase text-[#0A0A0A]/35 mb-6 sm:mb-8">
        Trusted by teams backed by
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 sm:gap-x-12 md:gap-x-14">
        {LOGOS.map((logo) => (
          <div
            key={logo.alt}
            className="grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300 flex items-center justify-center"
            style={{ width: 110, height: 28 }}
          >
            <Image
              src={logo.src}
              alt={logo.alt}
              width={110}
              height={28}
              unoptimized
              className="max-h-[24px] max-w-[110px] w-auto h-auto object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
