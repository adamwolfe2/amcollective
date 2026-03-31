export interface PricingPlan {
  name: string;
  priceLabel: string;
  description: string;
  bullets: string[];
  ctaLabel: string;
  featured?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Project Build",
    priceLabel: "Scoped & quoted",
    description:
      "Focused AI product builds with clear scope, timeline, and deliverables. Ideal for teams that know what they need built.",
    bullets: [
      "Full product scoping & architecture",
      "2-4 week delivery cycles",
      "Dedicated build team",
      "Post-launch support included",
    ],
    ctaLabel: "Start a project",
  },
  {
    name: "Strategic Partner",
    priceLabel: "Equity-aligned",
    description:
      "Long-term operational partnership with skin in the game. We co-build, co-invest, and scale alongside you.",
    bullets: [
      "Ongoing product & ops support",
      "AI infrastructure buildout",
      "Access to AM Collective portfolio",
      "Monthly strategy sessions",
      "Priority on all builds",
    ],
    ctaLabel: "Explore partnership",
    featured: true,
  },
];
