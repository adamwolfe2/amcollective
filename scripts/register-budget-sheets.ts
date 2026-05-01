/**
 * Register Adam's two private budget tracking sheets in budget_sheet_sources.
 *
 * Sets:
 *   - sheet_id (parsed from URL)
 *   - source_url (full link for click-through)
 *   - owner_clerk_id (set via OWNER_CLERK_ID env or first param)
 *   - is_active = true
 *
 * Composio link is left null — connect via /settings/integrations after
 * running this. Once a googlesheets connection exists, fill composioUserId
 * and composioAccountId via:
 *   UPDATE budget_sheet_sources SET composio_user_id = ..., composio_account_id = ... WHERE label = ...;
 *
 * Run: npx tsx --env-file=.env.local scripts/register-budget-sheets.ts <ownerClerkId>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { budgetSheetSources } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const SHEETS = [
  {
    label: "Budget Sheet A",
    sheetId: "16F5hkLa5HzndofyTT8zRjjOk3XpBL6KUH731kUw6YQ0",
    sourceUrl:
      "https://docs.google.com/spreadsheets/d/16F5hkLa5HzndofyTT8zRjjOk3XpBL6KUH731kUw6YQ0/edit?gid=1164308626#gid=1164308626",
  },
  {
    label: "Budget Sheet B",
    sheetId: "15Mw6HdEUao1_jTRaPrJc68r6u8sttazNI8ne6hQQR3U",
    sourceUrl:
      "https://docs.google.com/spreadsheets/d/15Mw6HdEUao1_jTRaPrJc68r6u8sttazNI8ne6hQQR3U/edit?gid=1779036574#gid=1779036574",
  },
];

async function main() {
  const ownerClerkId = process.argv[2] ?? process.env.OWNER_CLERK_ID;
  if (!ownerClerkId) {
    console.error(
      "[register-budget-sheets] Missing ownerClerkId. Pass as arg or set OWNER_CLERK_ID."
    );
    console.error(
      "  Find your Clerk user id at https://dashboard.clerk.com → Users → click your user."
    );
    console.error("  Run: npx tsx --env-file=.env.local scripts/register-budget-sheets.ts user_xxx");
    process.exit(1);
  }

  console.log(
    `[register-budget-sheets] Registering ${SHEETS.length} budget sheets for owner ${ownerClerkId}`
  );

  for (const s of SHEETS) {
    const existing = await db
      .select({ id: budgetSheetSources.id })
      .from(budgetSheetSources)
      .where(eq(budgetSheetSources.sheetId, s.sheetId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(budgetSheetSources)
        .set({
          label: s.label,
          sourceUrl: s.sourceUrl,
          ownerClerkId,
          isActive: true,
        })
        .where(eq(budgetSheetSources.sheetId, s.sheetId));
      console.log(`  · updated existing: ${s.label}`);
    } else {
      await db.insert(budgetSheetSources).values({
        label: s.label,
        sheetId: s.sheetId,
        sourceUrl: s.sourceUrl,
        ownerClerkId,
        isActive: true,
      });
      console.log(`  · inserted new:    ${s.label}`);
    }
  }

  console.log(
    `[register-budget-sheets] Done. Next: connect Google Sheets via Composio at /settings/integrations, then UPDATE composio_user_id + composio_account_id on each row.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[register-budget-sheets] Failed:", err);
  process.exit(1);
});
