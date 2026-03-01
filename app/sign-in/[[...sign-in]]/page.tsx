import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "#F5F3EE" }}
    >
      <div className="mb-8 text-center">
        <h1
          style={{
            fontFamily: "Newsreader, Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "#0F1523",
            letterSpacing: "-0.02em",
          }}
        >
          AM Collective
        </h1>
        <p
          style={{
            fontFamily: "Geist Mono, monospace",
            fontSize: "0.7rem",
            color: "#8B92A5",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginTop: "0.25rem",
          }}
        >
          Internal Operations
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            card: "border border-[#E2DDD6] rounded-none shadow-[0_4px_24px_rgba(15,21,35,0.08)]",
            formButtonPrimary:
              "bg-[#2A52BE] hover:bg-[#1B3A6B] font-mono text-sm uppercase tracking-wider rounded-none",
            formFieldInput:
              "border-[#E2DDD6] rounded-none focus:border-[#2A52BE]",
            footerActionLink: "text-[#2A52BE] hover:text-[#1B3A6B]",
            footer: "hidden",
          },
        }}
      />
      <p
        className="mt-6 text-center"
        style={{
          fontFamily: "Newsreader, Georgia, serif",
          fontSize: "0.875rem",
          color: "#8B92A5",
        }}
      >
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          style={{ color: "#2A52BE", textDecoration: "underline" }}
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
