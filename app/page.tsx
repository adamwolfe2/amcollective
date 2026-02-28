import { MarketingPage } from "./marketing-page";

export const metadata = {
  title: "AM Collective — Building AI Infrastructure",
  description:
    "AM Collective is an operational holding company building AI infrastructure through ventures we launch and partners we scale alongside.",
  openGraph: {
    title: "AM Collective",
    description:
      "Technical AI execution with strategic business development to launch companies from 0 to 1.",
  },
};

export default function Home() {
  return <MarketingPage />;
}
