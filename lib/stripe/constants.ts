/**
 * AM Collective Stripe Integration — Constants
 */

/** Stripe API version used across the platform */
export const STRIPE_API_VERSION = "2026-02-25.clover" as const;

/** Default currency for all transactions */
export const STRIPE_CURRENCY = "usd" as const;

/** Statement descriptor shown on card statements (max 22 chars) */
export const STATEMENT_DESCRIPTOR = "AM COLLECTIVE" as const;
