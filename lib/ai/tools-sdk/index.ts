/**
 * AI Tools — Vercel AI SDK format
 *
 * Re-exports all tool groups and combined tool objects.
 * Each domain has its own sub-module for maintainability.
 */

export { coreTools } from "./core";
export { vercelTools } from "./vercel";
export { posthogTools } from "./posthog";
export { mercuryTools } from "./mercury";
export { linearTools } from "./linear";
export { ceoTools } from "./ceo";

import { coreTools } from "./core";
import { vercelTools } from "./vercel";
import { posthogTools } from "./posthog";
import { mercuryTools } from "./mercury";
import { linearTools } from "./linear";
import { ceoTools } from "./ceo";

export const allTools = {
  ...coreTools,
  ...vercelTools,
  ...posthogTools,
  ...mercuryTools,
  ...linearTools,
};

export const allCeoTools = {
  ...allTools,
  ...ceoTools,
};
