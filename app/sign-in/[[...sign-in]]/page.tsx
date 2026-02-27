import { SignIn } from "@clerk/nextjs";

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <SignIn afterSignInUrl="/admin" />
    </div>
  );
}
