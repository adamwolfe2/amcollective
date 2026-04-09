/**
 * Connector Freshness Config
 *
 * Defines the expected sync interval for each connector.
 * Used by the freshness alert job and the system health dashboard
 * to determine whether a connector's last sync is stale.
 */

/** Expected maximum sync interval in hours per connector. */
export const CONNECTOR_FRESHNESS: Record<string, number> = {
  mercury:          6,
  stripe:           12,
  vercel:           24,
  neon:             24,
  posthog:          24,
  gmail:            2,
  emailbison:       1,
  trackr:           1,
  taskspace:        1,
  wholesail:        1,
  tbgc:             1,
  hook:             1,
  cursive:          1,
  linear:           24,
  clerk:            24,
  composio:         24,
};

/** Default interval (hours) for connectors not listed above. */
const DEFAULT_INTERVAL_HOURS = 24;

/**
 * Returns true if the connector has not synced within its expected interval.
 * A null lastSyncAt is always considered stale.
 */
export function isStale(connectorName: string, lastSyncAt: Date | null): boolean {
  if (!lastSyncAt) return true;
  const intervalHours = CONNECTOR_FRESHNESS[connectorName] ?? DEFAULT_INTERVAL_HOURS;
  const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000);
  return lastSyncAt < cutoff;
}

/**
 * Returns the expected interval in hours for a connector.
 */
export function getExpectedIntervalHours(connectorName: string): number {
  return CONNECTOR_FRESHNESS[connectorName] ?? DEFAULT_INTERVAL_HOURS;
}
