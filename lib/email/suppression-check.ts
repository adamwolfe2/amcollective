import { db } from "@/lib/db";
import { emailSuppressions } from "@/lib/db/schema/email";
import { eq, or, isNull, gt } from "drizzle-orm";

// ---------------------------------------------------------------------------
// isEmailSuppressed
// Returns true if the email has an active suppression (bounce, complaint, or
// unsubscribe) that has not yet expired.
// ---------------------------------------------------------------------------

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const now = new Date();

  const rows = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(
      eq(emailSuppressions.email, normalized)
    )
    .limit(1);

  if (rows.length === 0) return false;

  // Re-query to check expiry — simpler than a complex OR in one query
  const active = await db
    .select({ id: emailSuppressions.id, expiresAt: emailSuppressions.expiresAt })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, normalized))
    .limit(1);

  if (active.length === 0) return false;
  const row = active[0];
  if (!row.expiresAt) return true; // permanent suppression
  return row.expiresAt > now; // temporary — still active?
}

// ---------------------------------------------------------------------------
// checkAndWarnSuppressed
// Returns { suppressed: boolean; reason?: string } for callers that need to
// log or surface the suppression reason.
// ---------------------------------------------------------------------------

export async function checkAndWarnSuppressed(
  email: string
): Promise<{ suppressed: boolean; reason?: string }> {
  const normalized = email.toLowerCase().trim();
  const now = new Date();

  const rows = await db
    .select({
      reason: emailSuppressions.reason,
      expiresAt: emailSuppressions.expiresAt,
    })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, normalized))
    .limit(1);

  if (rows.length === 0) return { suppressed: false };

  const row = rows[0];
  const isActive = !row.expiresAt || row.expiresAt > now;

  if (!isActive) return { suppressed: false };

  return { suppressed: true, reason: row.reason };
}
