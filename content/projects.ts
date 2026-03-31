export interface Project {
  name: string;
  tagline: string;
  description: string;
  longDescription: string;
  tags: string[];
  image: string;
  url: string;
  metrics?: { label: string; value: string }[];
}

export const PROJECTS: Project[] = [
  {
    name: "Cursive",
    tagline: "Full-suite operating intelligence for B2B teams",
    description:
      "Autonomously tracks & converts leads, turns fragmented GTM & RevOps data into a continuously learning system you can query in plain English.",
    longDescription:
      "Cursive is the full suite operating intelligence layer for B2B teams. It autonomously tracks & converts leads, turns fragmented GTM & RevOps data into a continuously learning system you can query in plain English. Built for revenue teams that need to move fast without losing signal.",
    tags: ["AI Agents", "RevOps", "B2B SaaS"],
    image: "/cursive social.png",
    url: "https://meetcursive.com",
    metrics: [
      { label: "Pipeline tracked", value: "$12M+" },
      { label: "Time saved weekly", value: "15hrs" },
      { label: "Conversion lift", value: "34%" },
    ],
  },
  {
    name: "TaskSpace",
    tagline: "AI operational infrastructure for multi-company founders",
    description:
      "Unified dashboard across all your teams running on EOS. AI handles EOD reports, surfaces blockers, and keeps every entity accountable.",
    longDescription:
      "AI operational infrastructure for multi-company founders & builders. Unified dashboard across all your teams running on EOS. AI handles EOD reports, surfaces blockers, and keeps every entity accountable without you in every meeting.",
    tags: ["Operations", "EOS", "Multi-Entity"],
    image: "/taskspace social.png",
    url: "https://trytaskspace.com",
    metrics: [
      { label: "Entities managed", value: "7+" },
      { label: "Daily reports", value: "Auto" },
      { label: "Meeting reduction", value: "60%" },
    ],
  },
  {
    name: "WholeSail",
    tagline: "Custom B2B ordering portals for distribution",
    description:
      "Client portal, admin panel, iMessage ordering, Stripe billing, automated invoicing — all curated to your brand. Shipped in under 2 weeks.",
    longDescription:
      "Fully custom B2B ordering portals for distribution companies. Client portal, admin panel, iMessage ordering, Stripe billing, automated invoicing — all curated to your brand. Automate your esoteric spreadsheet company & cut your costs. Fully built and shipped in under 2 weeks.",
    tags: ["B2B Portals", "Payments", "Distribution"],
    image: "/wholesail social.png",
    url: "https://wholesailhub.com",
    metrics: [
      { label: "Delivery time", value: "<2 wks" },
      { label: "Order accuracy", value: "99.8%" },
      { label: "Cost reduction", value: "40%" },
    ],
  },
  {
    name: "MyVSL",
    tagline: "AI funnel builder that books calls",
    description:
      "Build quiz-to-calendar booking funnels in minutes — three questions, smart scoring, automatic calendar routing. No code required.",
    longDescription:
      "AI funnel builder that books calls. Build quiz-to-calendar booking funnels in minutes — three questions, smart scoring, automatic calendar routing. No code required. Convert more traffic into qualified conversations.",
    tags: ["Funnels", "AI Builder", "No-Code"],
    image: "/vsl social.png",
    url: "https://getmyvsl.com",
    metrics: [
      { label: "Setup time", value: "5 min" },
      { label: "Booking rate", value: "3.2x" },
      { label: "Funnels built", value: "500+" },
    ],
  },
  {
    name: "Trackr",
    tagline: "Research any AI tool in under 2 minutes",
    description:
      "Track what you pay for. Stay current on top product launches custom to your company. One shared workspace to go from spreadsheets to AI-Native.",
    longDescription:
      "Research any AI tool in under 2 minutes. Track what you pay for. Stay current on top product launches and pain points custom to your company. One shared workspace for your team to go from spreadsheets to AI-Native.",
    tags: ["Research", "AI Tools", "Team Intelligence"],
    image: "/trackr social.png",
    url: "https://trytrackr.com",
    metrics: [
      { label: "Research time", value: "<2 min" },
      { label: "Tools tracked", value: "1,200+" },
      { label: "Teams using", value: "80+" },
    ],
  },
  {
    name: "CampusGTM",
    tagline: "Campus distribution infrastructure for startups",
    description:
      "Plug & play your product into our evangelist programs, ambassador playbooks, and distribution systems.",
    longDescription:
      "Productized campus distribution infrastructure for startups. Plug & play your product into our evangelist programs, ambassador playbooks, and top-down/bottom-up distribution systems. Built for companies that want Gen Z adoption at scale.",
    tags: ["Distribution", "Campus", "GTM"],
    image: "/campusgtm social.png",
    url: "https://www.campusgtm.com",
    metrics: [
      { label: "Campuses", value: "50+" },
      { label: "Ambassadors", value: "200+" },
      { label: "Activations", value: "1,000+" },
    ],
  },
  {
    name: "Hook",
    tagline: "GTM and viral content engine for brands",
    description:
      "Built content systems for YC companies like ElevenLabs. Gen Z distribution that actually converts.",
    longDescription:
      "GTM and viral content engine for brands that need Gen Z distribution. Built content systems for YC companies like ElevenLabs. From strategy to production to distribution — content that converts.",
    tags: ["Content", "Gen Z", "Viral Growth"],
    image: "/hook social.png",
    url: "https://hookugc.com",
    metrics: [
      { label: "Views generated", value: "10M+" },
      { label: "Brands served", value: "25+" },
      { label: "Avg engagement", value: "8.4%" },
    ],
  },
];
