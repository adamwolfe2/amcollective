import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Newsreader, Geist_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    template: "AM Collective | %s",
    default: "AM Collective",
  },
  description:
    "AM Collective Capital — Internal operations dashboard",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://app.amcollectivecapital.com"
  ),
  openGraph: {
    title: "AM Collective",
    description:
      "AM Collective Capital — Internal operations dashboard",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AM Collective Capital",
      },
    ],
  },
  icons: {
    icon: "/icon.svg",
  },
};

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerkAppearance = {
  variables: {
    colorPrimary: "#2A52BE",
    colorDanger: "#DC2626",
    colorTextOnPrimaryBackground: "#FFFFFF",
    colorBackground: "#FFFFFF",
    colorText: "#0F1523",
    colorTextSecondary: "#3D4556",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#0F1523",
    colorNeutral: "#0F1523",
    borderRadius: "0",
    spacingUnit: "1rem",
    fontFamily: "Newsreader, Georgia, Times New Roman, serif",
    fontFamilyButtons: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "shadow-none",
    card: "border border-[#E2DDD6] rounded-none",
    headerTitle: "font-serif font-semibold text-[#0F1523]",
    headerSubtitle:
      "font-mono text-[#8B92A5] text-xs uppercase tracking-wider",
    formButtonPrimary:
      "bg-[#2A52BE] hover:bg-[#1B3A6B] font-mono text-sm uppercase tracking-wider rounded-none",
    formFieldInput:
      "border-[#E2DDD6] rounded-none focus:border-[#2A52BE] focus:ring-2 focus:ring-[#2A52BE]/15",
    formFieldLabel: "text-[#0F1523] font-serif",
    footerActionLink: "text-[#2A52BE] hover:text-[#1B3A6B]",
    socialButtonsBlockButton:
      "border-[#E2DDD6] rounded-none hover:border-[#C8C3BB] hover:bg-[#F5F3EE]",
    dividerLine: "bg-[#E2DDD6]",
    dividerText: "text-[#8B92A5] font-mono text-xs uppercase",
    formFieldInputShowPasswordButton: "text-[#8B92A5] hover:text-[#0F1523]",
    identityPreviewEditButton: "text-[#2A52BE] hover:text-[#1B3A6B]",
    userButtonPopoverCard: "border border-[#E2DDD6] rounded-none",
    userButtonPopoverActionButton: "hover:bg-[#EEF2FB]",
    userPreviewMainIdentifier: "font-serif",
    userPreviewSecondaryIdentifier: "font-mono text-xs text-[#8B92A5]",
    badge: "font-mono text-xs rounded-none",
    footer: "hidden",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = (
    <html lang="en" className={`scroll-smooth ${newsreader.variable} ${geistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.clerk.com" />
        <link rel="preconnect" href="https://app.posthog.com" />
        <link rel="dns-prefetch" href="https://api.stripe.com" />
        <link rel="dns-prefetch" href="https://api.openai.com" />
      </head>
      <body
        className="antialiased font-serif"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-body)",
        }}
      >
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <SpeedInsights />
      </body>
    </html>
  );

  if (hasClerk) {
    return (
      <ClerkProvider
        appearance={clerkAppearance}
        signInForceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
      >
        {content}
      </ClerkProvider>
    );
  }

  return content;
}
