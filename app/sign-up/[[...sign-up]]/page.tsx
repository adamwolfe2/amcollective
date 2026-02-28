import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#F5F3EE" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              fontFamily: '"Newsreader", Georgia, serif',
              color: "#0F1523",
            }}
          >
            AM Collective
          </h1>
          <p
            className="mt-1"
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: "0.75rem",
              color: "#8B92A5",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Create Account
          </p>
        </div>
        <SignUp />
      </div>
    </div>
  );
}
