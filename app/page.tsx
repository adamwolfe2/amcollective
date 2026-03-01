import type { Metadata } from "next";
import { MarketingPage } from "./marketing-page";

export const metadata: Metadata = {
  title: "AM Collective — Building AI Infrastructure",
  description:
    "AM Collective is an operational holding company building AI infrastructure through ventures we launch and partners we scale alongside.",
  alternates: {
    canonical: "https://amcollectivecapital.com",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "AM Collective — Building AI Infrastructure",
    description:
      "Technical AI execution with strategic business development to launch companies from 0 to 1.",
    url: "https://amcollectivecapital.com",
    siteName: "AM Collective Capital",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AM Collective — Building AI Infrastructure",
    description:
      "Technical AI execution with strategic business development to launch companies from 0 to 1.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "AM Collective Capital",
  url: "https://amcollectivecapital.com",
  description:
    "Operational holding company building AI infrastructure through ventures and strategic partnerships.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Portland",
    addressRegion: "OR",
    addressCountry: "US",
  },
  founder: [
    { "@type": "Person", name: "Adam Wolfe" },
    { "@type": "Person", name: "Maggie Byrne" },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingPage />
    </>
  );
}
