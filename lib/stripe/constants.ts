/**
 * AM Collective Stripe Integration — Constants
 */

/** Stripe API version used across the platform */
export const STRIPE_API_VERSION = "2026-02-25.clover" as const;

/** Default currency for all transactions */
export const STRIPE_CURRENCY = "usd" as const;

/** Statement descriptor shown on card statements (max 22 chars) */
export const STATEMENT_DESCRIPTOR = "AM COLLECTIVE" as const;

/** All Stripe connected accounts under the AM Collective organization key */
export const STRIPE_ACCOUNTS: Array<{
  accountId: string;
  name: string;
  companyTag: string;
}> = [
  { accountId: "acct_1SaRcNAE3L44wTdt", name: "CampusGTM", companyTag: "am_collective" },
  { accountId: "acct_1QkC1gEmhKaqBpAE", name: "Cursive", companyTag: "cursive" },
  { accountId: "acct_1SrmimEy1dBa5hjw", name: "Hook", companyTag: "hook" },
  { accountId: "acct_1SXAa57FVJjwnaNb", name: "TaskSpace", companyTag: "taskspace" },
  { accountId: "acct_1T47wVEbVKsEnOXQ", name: "TBGC", companyTag: "tbgc" },
  { accountId: "acct_1T2c4fExwpuzI9Oq", name: "Trackr", companyTag: "trackr" },
];
