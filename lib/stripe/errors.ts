/**
 * TBGC Stripe Integration — Custom Error Types
 */

/** Base class for all Stripe integration errors */
export class StripeIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "StripeIntegrationError";
  }
}

/** Stripe is not configured (missing env vars) */
export class StripeNotConfiguredError extends StripeIntegrationError {
  constructor() {
    super(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
      "STRIPE_NOT_CONFIGURED",
      503
    );
    this.name = "StripeNotConfiguredError";
  }
}

/** Webhook signature verification failed */
export class WebhookSignatureError extends StripeIntegrationError {
  constructor(detail?: string) {
    super(
      `Webhook signature verification failed${detail ? `: ${detail}` : ""}`,
      "WEBHOOK_SIGNATURE_INVALID",
      400
    );
    this.name = "WebhookSignatureError";
  }
}

/** Order or entity not found when processing a webhook */
export class WebhookEntityNotFoundError extends StripeIntegrationError {
  constructor(entityType: string, id: string) {
    super(
      `${entityType} not found for Stripe event: ${id}`,
      "WEBHOOK_ENTITY_NOT_FOUND",
      404
    );
    this.name = "WebhookEntityNotFoundError";
  }
}

/** Tried to create a Stripe resource for an org with no customer ID */
export class MissingStripeCustomerError extends StripeIntegrationError {
  constructor(orgId: string) {
    super(
      `Organization ${orgId} has no Stripe customer ID. Call ensureStripeCustomer() first.`,
      "MISSING_STRIPE_CUSTOMER",
      400
    );
    this.name = "MissingStripeCustomerError";
  }
}

/** Payment amount mismatch between our DB and Stripe */
export class PaymentAmountMismatchError extends StripeIntegrationError {
  constructor(expected: number, received: number) {
    super(
      `Payment amount mismatch: expected ${expected} cents, received ${received} cents`,
      "PAYMENT_AMOUNT_MISMATCH",
      400
    );
    this.name = "PaymentAmountMismatchError";
  }
}
