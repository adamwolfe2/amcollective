"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface OrbitalLoaderProps {
  onComplete: () => void;
}

const TOTAL_DURATION = 3.3; // seconds

const rings = [
  {
    radius: 100,
    duration: 8,
    direction: 1, // clockwise
    logos: ["/cursive-logo.png", "/taskspace logo NEW.png", "/wholesail logo.png"],
  },
  {
    radius: 160,
    duration: 11,
    direction: -1, // counter-clockwise
    logos: ["/vsl logo.png", "/Trackr Logo.jpg"],
  },
  {
    radius: 220,
    duration: 15,
    direction: 1, // clockwise
    logos: ["/CampusGTM Logo.png", "/hook logo.png"],
  },
];

export default function OrbitalLoader({ onComplete }: OrbitalLoaderProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, (TOTAL_DURATION - 0.5) * 1000); // start fade-out at 2.8s

    const completeTimer = setTimeout(() => {
      onComplete();
    }, TOTAL_DURATION * 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--im-bg)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* Central AM text */}
          <motion.div
            className="absolute z-10 select-none font-serif text-6xl font-bold tracking-tight text-[var(--im-text)]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 1, 1, 0.7, 1],
              scale: 1,
            }}
            transition={{
              opacity: { duration: 2.4, times: [0, 0.15, 0.5, 0.75, 1], ease: "easeInOut" },
              scale: { duration: 0.4, ease: "easeOut" },
            }}
          >
            AM
          </motion.div>

          {/* Orbit rings */}
          {rings.map((ring, ringIndex) => (
            <div
              key={ringIndex}
              className="absolute"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Orbit ring visual (subtle border circle) */}
              <motion.div
                className="absolute rounded-full border border-[var(--im-border)]"
                style={{
                  width: ring.radius * 2,
                  height: ring.radius * 2,
                  left: -ring.radius,
                  top: -ring.radius,
                  scaleY: 0.55,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ duration: 0.6, delay: 0.1 * ringIndex }}
              />

              {/* Rotating orbit container */}
              <motion.div
                style={{
                  transformStyle: "preserve-3d",
                  scaleY: 0.55,
                }}
                animate={{ rotate: 360 * ring.direction }}
                transition={{
                  repeat: Infinity,
                  ease: "linear",
                  duration: ring.duration,
                }}
              >
                {ring.logos.map((logo, logoIndex) => {
                  const angle = (360 / ring.logos.length) * logoIndex;

                  return (
                    <motion.div
                      key={logoIndex}
                      className="absolute"
                      style={{
                        left: -18,
                        top: -18,
                        transform: `rotate(${angle}deg) translateX(${ring.radius}px)`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.35,
                        delay: 0.1 + ringIndex * 0.08 + logoIndex * 0.06,
                        ease: "easeOut",
                      }}
                    >
                      {/* Counter-rotate to keep logo upright, and compensate for scaleY */}
                      <motion.div
                        style={{ scaleY: 1.82 }}
                        animate={{ rotate: -360 * ring.direction }}
                        transition={{
                          repeat: Infinity,
                          ease: "linear",
                          duration: ring.duration,
                        }}
                      >
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--im-surface)] shadow-lg ring-1 ring-[var(--im-border)]">
                          <Image
                            src={logo}
                            alt=""
                            width={36}
                            height={36}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
