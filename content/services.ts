export interface Service {
  name: string;
  description: string;
  bullets: string[];
  tags: string[];
  icon: string;
}

export const SERVICES: Service[] = [
  {
    name: "AI Product Development",
    description:
      "From concept to shipped product. We build AI-native SaaS tools, agent systems, and internal infrastructure — fast.",
    bullets: [
      "Full-stack AI product builds",
      "Agent & workflow automation",
      "Custom LLM integrations",
    ],
    tags: ["Product", "AI-Native", "Ship Fast"],
    icon: "cpu",
  },
  {
    name: "GTM & Distribution",
    description:
      "Launch strategies that actually work. Campus programs, content engines, and growth systems built for velocity.",
    bullets: [
      "Campus ambassador infrastructure",
      "Viral content production",
      "Launch playbooks & activation",
    ],
    tags: ["Growth", "Distribution", "Launch"],
    icon: "rocket",
  },
  {
    name: "Operations & Infrastructure",
    description:
      "EOS-powered operational systems, multi-entity dashboards, and AI-assisted reporting that keeps you out of meetings.",
    bullets: [
      "Multi-entity EOS implementation",
      "AI-powered reporting & EODs",
      "Process automation & workflows",
    ],
    tags: ["Ops", "EOS", "Automation"],
    icon: "layers",
  },
  {
    name: "Strategic Partnerships",
    description:
      "We don't just build — we co-invest, co-build, and scale alongside. From fundraising support to hands-on operational partnership.",
    bullets: [
      "Co-building & equity partnerships",
      "Fundraising & investor intros",
      "Operational scaling support",
    ],
    tags: ["Partnership", "Capital", "Scale"],
    icon: "handshake",
  },
];
