import { SignUp } from "@clerk/nextjs";

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
      />
    </div>
  );
}
