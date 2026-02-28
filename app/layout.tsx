import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const dynamic = "force-dynamic";

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
  },
  icons: {
    icon: "/icon.svg",
  },
};

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerkAppearance = {
  variables: {
    colorPrimary: "#2A52BE",
    colorTextOnPrimaryBackground: "#FFFFFF",
    colorBackground: "#FFFFFF",
    colorText: "#0F1523",
    colorTextSecondary: "#3D4556",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#0F1523",
    borderRadius: "0px",
    fontFamily: '"Newsreader", Georgia, "Times New Roman", serif',
    fontFamilyButtons:
      '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
  },
  elements: {
    card: {
      border: "1px solid #E2DDD6",
      boxShadow: "0 4px 24px rgba(15, 21, 35, 0.08)",
    },
    headerTitle: {
      fontFamily: '"Newsreader", Georgia, serif',
      fontWeight: "600",
      color: "#0F1523",
    },
    headerSubtitle: {
      fontFamily: '"Geist Mono", monospace',
      color: "#8B92A5",
      fontSize: "0.8rem",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
    },
    formButtonPrimary: {
      backgroundColor: "#2A52BE",
      fontFamily: '"Geist Mono", monospace',
      fontSize: "0.85rem",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      borderRadius: "0px",
      "&:hover": {
        backgroundColor: "#1B3A6B",
      },
    },
    formFieldInput: {
      borderColor: "#E2DDD6",
      borderRadius: "0px",
      "&:focus": {
        borderColor: "#2A52BE",
        boxShadow: "0 0 0 2px rgba(42, 82, 190, 0.15)",
      },
    },
    footerActionLink: {
      color: "#2A52BE",
      "&:hover": {
        color: "#1B3A6B",
      },
    },
    socialButtonsBlockButton: {
      borderColor: "#E2DDD6",
      borderRadius: "0px",
      "&:hover": {
        borderColor: "#C8C3BB",
        backgroundColor: "#F5F3EE",
      },
    },
    dividerLine: {
      backgroundColor: "#E2DDD6",
    },
    dividerText: {
      color: "#8B92A5",
      fontFamily: '"Geist Mono", monospace',
      fontSize: "0.75rem",
      textTransform: "uppercase" as const,
    },
    userButtonPopoverCard: {
      border: "1px solid #E2DDD6",
      borderRadius: "0px",
    },
    userButtonPopoverActionButton: {
      "&:hover": {
        backgroundColor: "#EEF2FB",
      },
    },
  },
};

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
    return (
      <ClerkProvider
        appearance={clerkAppearance}
        signInForceRedirectUrl="/admin"
        signUpForceRedirectUrl="/admin"
      >
        {content}
      </ClerkProvider>
    );
  }

  return content;
}
