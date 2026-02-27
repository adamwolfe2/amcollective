/**
 * Shared webhook verification utilities.
 *
 * Consolidates HMAC signature verification used by Vercel and project webhooks.
 * Stripe uses its own SDK verification via `constructEventAsync`.
 */

import crypto from "crypto";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export function verifyHmacSignature({
  payload,
  signature,
  secret,
  algorithm = "sha256",
}: {
  payload: string;
  signature: string;
  secret: string;
  algorithm?: string;
}): boolean {
  const expected = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace(/^sha256=/, ""), "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

/** Raw body extraction for webhook routes. */
export async function getRawBody(req: Request): Promise<string> {
  return req.text();
}
