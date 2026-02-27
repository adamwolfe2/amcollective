/**
 * AM Collective Stripe Integration — Configuration & Initialisation
 *
 * Single source of truth for Stripe client setup.
 */

import Stripe from "stripe";
import { STRIPE_API_VERSION } from "./constants";
import { StripeNotConfiguredError } from "./errors";

let _stripe: Stripe | null = null;

/** Returns true if the Stripe org key is present */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Returns a singleton Stripe client.
 * Throws StripeNotConfiguredError in dev/prod if keys are missing.
 */
export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new StripeNotConfiguredError();
  }

  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      appInfo: {
        name: "AM Collective",
        version: "0.1.0",
      },
    });
  }

  return _stripe;
}

/** Construct and verify a Stripe webhook event */
export async function parseWebhookEvent(
  rawBody: string | Buffer,
  signature: string
): Promise<Stripe.Event> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeNotConfiguredError();

  return getStripeClient().webhooks.constructEventAsync(
    rawBody,
    signature,
    secret
  );
}
