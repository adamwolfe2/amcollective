import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AM Collective — Operations Dashboard",
  description:
    "Internal operations platform for AM Collective Capital. CRM, project management, financial tracking, and AI-powered intelligence.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://portal.amcollectivecapital.com"
  ),
  icons: {
    icon: "/icon.svg",
  },
};

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased font-serif"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-body)",
        }}
      >
        {children}
      </body>
    </html>
  );

  if (hasClerk) {
    return <ClerkProvider>{content}</ClerkProvider>;
  }

  return content;
}
