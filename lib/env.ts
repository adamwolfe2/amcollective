function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env.local or Doppler config.`
    );
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    console.warn(`Warning: ${name} is not set. Some features may not work.`);
  }
  return value ?? undefined;
}

export const env = {
  // Required — app will not start without these
  DATABASE_URL: requireEnv("DATABASE_URL"),
  CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: requireEnv(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  ),

  // Optional — warn in production if missing, but do not crash
  ANTHROPIC_API_KEY: optionalEnv("ANTHROPIC_API_KEY"),
  STRIPE_SECRET_KEY: optionalEnv("STRIPE_SECRET_KEY"),
  INNGEST_SIGNING_KEY: optionalEnv("INNGEST_SIGNING_KEY"),
  INNGEST_EVENT_KEY: optionalEnv("INNGEST_EVENT_KEY"),
  SENTRY_DSN: optionalEnv("SENTRY_DSN"),
  RESEND_API_KEY: optionalEnv("RESEND_API_KEY"),
  UPSTASH_REDIS_REST_URL: optionalEnv("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: optionalEnv("UPSTASH_REDIS_REST_TOKEN"),
} as const;
