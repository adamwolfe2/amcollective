"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { fadeInUp } from "@/lib/immersive/animations";

const VENTURE_LOGOS = [
  { name: "Cursive", logo: "/cursive-logo.png" },
  { name: "TaskSpace", logo: "/taskspace logo NEW.png" },
  { name: "WholeSail", logo: "/wholesail logo.png" },
  { name: "MyVSL", logo: "/vsl logo.png" },
  { name: "Trackr", logo: "/Trackr Logo.jpg" },
  { name: "CampusGTM", logo: "/CampusGTM Logo.png" },
  { name: "Hook", logo: "/hook logo.png" },
];

// Double the array for seamless marquee loop
const MARQUEE_LOGOS = [...VENTURE_LOGOS, ...VENTURE_LOGOS];

export function ClientsStrip() {
  return (
    <section className="relative py-16 sm:py-20 overflow-hidden bg-[#0a0a0c]">
      {/* Section label */}
      <motion.p
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        className="text-center font-mono text-xs uppercase tracking-[0.2em] text-white/25 mb-10"
      >
        Portfolio Ventures
      </motion.p>

      {/* Marquee */}
      <div className="relative">
        {/* Edge fade gradients */}
        <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-[#0a0a0c] to-transparent" />
        <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-[#0a0a0c] to-transparent" />

        {/* Scrolling track */}
        <div className="flex animate-marquee-immersive">
          {MARQUEE_LOGOS.map((logo, i) => (
            <div
              key={`${logo.name}-${i}`}
              className="flex-shrink-0 mx-8 sm:mx-12 group"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 relative grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-80 transition-all duration-500">
                <Image
                  src={logo.logo}
                  alt={logo.name}
                  fill
                  className="object-contain"
                  sizes="48px"
                  unoptimized
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
