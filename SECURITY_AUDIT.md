# Security Audit Report
**Date:** 2026-03-19
**Project:** AM Collective Admin Portal
**Auditor:** Claude Code (Automated Adversarial Audit)
**Branch:** security-audit/2026-03-19

## Executive Summary
- **Total Vulnerabilities Found:** 8
  - Critical: 0
  - High: 3
  - Medium: 3
  - Low: 2
- **Total Vulnerabilities Fixed:** 7
- **Remaining (Needs Human Decision):** 1 (CSP unsafe-inline — requires framework changes)

## Attack Surface Summary
- **Total API Endpoints:** 123
- **Unprotected Endpoints Found:** 0
- **Total Frontend Routes:** 37 admin + 11 client + 4 public
- **Client-Only Protection:** 0 (all server-enforced)
- **Database Tables:** 25+
- **Sensitive Fields Identified:** passwords (vault), tokens (contracts), API keys (vault)
- **Third-Party Integrations:** 16 (Stripe, Clerk, Vercel, Neon, Resend, PostHog, Sentry, ArcJet, Inngest, Linear, Mercury, Composio, Tavily, Firecrawl, EmailBison, Bloo.io)

## Vulnerability Details

### [V-001] Bootstrap endpoint leaks super admin email list
- **Severity:** High
- **Category:** Information Disclosure
- **Location:** `app/api/admin/bootstrap/route.ts:30-37, 75-81`
- **Description:** POST 403 response included `allowedEmails: SUPER_ADMIN_EMAILS` array. GET endpoint returned `superAdminEmails` to any authenticated user (not just super admins).
- **Exploit Path:** Any authenticated user calls GET /api/admin/bootstrap → receives list of all super admin emails → targeted phishing
- **Impact:** Attacker learns which email accounts to target for account takeover
- **Fix Applied:** Removed email list from 403 response. GET endpoint now requires super admin auth and no longer returns email list.
- **Verified:** Yes

### [V-002] Hardcoded Clerk user ID as auth fallback
- **Severity:** High
- **Category:** Hardcoded Credentials
- **Location:** `lib/auth/index.ts:8-13`
- **Description:** `SUPER_ADMIN_USER_IDS` had hardcoded fallback `user_2vqM8MZ1z7MxvJRLjJolHJAGnXp` when env var was not set. If repo is public, this Clerk user ID is exposed.
- **Exploit Path:** Attacker reads source code → knows the owner's Clerk user ID → if Clerk is compromised, can impersonate
- **Impact:** Privilege escalation via credential exposure
- **Fix Applied:** Removed hardcoded fallback. Now defaults to empty string (no fallback IDs). Auth falls through to email-based super admin check.
- **Verified:** Yes

### [V-003] Dev mode auth bypass without explicit opt-in
- **Severity:** High
- **Category:** Authentication Bypass
- **Location:** `lib/auth/index.ts:22,42,58` and `lib/auth/require-admin.ts:76`
- **Description:** All auth functions returned "dev-admin" when `NODE_ENV === "development"`, with no additional guard. If NODE_ENV is accidentally set to "development" in staging/production, ALL authentication is bypassed.
- **Exploit Path:** Misconfigured deployment with NODE_ENV=development → all API routes return data without auth
- **Impact:** Complete auth bypass, full data access
- **Fix Applied:** Added requirement for explicit `BYPASS_AUTH_FOR_DEV=true` env var in addition to NODE_ENV check. Both must be true for dev bypass.
- **Verified:** Yes

### [V-004] Sentry session replays capturing PII
- **Severity:** Medium
- **Category:** Data Exposure
- **Location:** `sentry.client.config.ts:7-8`
- **Description:** Session replay was enabled at 5% sampling with no input masking. Error replays at 30%. Could capture form inputs, passwords, API keys entered in vault UI.
- **Exploit Path:** Sentry dashboard access → replay viewer → see user typing sensitive data
- **Impact:** PII and credential exposure via third-party service
- **Fix Applied:** Disabled session replays (0% sampling). Error replays reduced to 10% with `maskAllText`, `maskAllInputs`, `blockAllMedia` enabled. Added `beforeSend` hook to strip authorization headers and cookies.
- **Verified:** Yes

### [V-005] Connection verify endpoint leaks internal error messages
- **Severity:** Medium
- **Category:** Information Disclosure
- **Location:** `app/api/admin/connections/verify/route.ts:49,153`
- **Description:** Per-service ping errors returned raw `err.message` to client, which could contain internal API endpoint URLs, auth failure details, or database connection info.
- **Exploit Path:** Call POST /api/admin/connections/verify → error responses reveal internal service URLs and error details
- **Impact:** Internal architecture discovery
- **Fix Applied:** Replaced raw error messages with generic "Connection check failed" string.
- **Verified:** Yes

### [V-006] Next.js CVEs (CSRF bypass, request smuggling, DoS)
- **Severity:** Medium
- **Category:** Dependency Vulnerability
- **Location:** `package.json` (next@16.1.6)
- **Description:** Next.js 16.1.6 has 5 known vulnerabilities: null origin CSRF bypass on Server Actions (GHSA-mq59-m269-xvcx), HTTP request smuggling in rewrites, unbounded postponed resume buffering DoS, dev HMR WebSocket CSRF.
- **Exploit Path:** Attacker sends request with null Origin header → bypasses Server Actions CSRF protection
- **Impact:** CSRF attacks on server actions
- **Fix Applied:** Updated Next.js to 16.2.0 which patches all CVEs.
- **Verified:** Yes

### [V-007] Missing robots.txt exposing admin routes to crawlers
- **Severity:** Low
- **Category:** Information Disclosure
- **Location:** `public/` (missing file)
- **Description:** No robots.txt existed, allowing search engines to crawl and index admin routes, API endpoints, and authentication pages.
- **Exploit Path:** Google dorking for site:amcollective.vercel.app → discover admin routes
- **Impact:** Attack surface discovery via search engines
- **Fix Applied:** Added robots.txt blocking /api/, /dashboard, /clients, /settings, etc.
- **Verified:** Yes

### [V-008] CSP uses unsafe-inline and unsafe-eval
- **Severity:** Low
- **Category:** Misconfiguration
- **Location:** `next.config.mjs:28-39`
- **Description:** Content-Security-Policy allows `'unsafe-inline'` and `'unsafe-eval'` in script-src, which weakens XSS protection. This is common in React/Next.js apps due to inline script requirements.
- **Impact:** Reduced effectiveness of CSP against XSS attacks
- **Fix Applied:** Not fixed — requires nonce-based CSP implementation which is a significant architectural change. Mitigated by: no dangerouslySetInnerHTML on user content, React's built-in XSS escaping, strict input validation.
- **Verified:** N/A (accepted risk)

## Exploitation Scenario Results

### Scenario 1: Unauthorized Data Dump
- **Result:** Failed
- **Details:** All 123 API routes enforce server-side auth. Clerk middleware blocks unauthenticated requests at the edge. No data accessible without valid session.

### Scenario 2: Account Takeover
- **Result:** Failed
- **Details:** Auth managed by Clerk (no custom password handling). No password reset manipulation possible. IDOR checks pass — admin routes use role checks, not resource ownership.

### Scenario 3: API Abuse
- **Result:** Failed
- **Details:** ArcJet rate limiting on all mutation endpoints (100/min general, 20/min AI chat, 200/min webhooks). Bot detection enabled. IP-based via Vercel edge network (not spoofable via X-Forwarded-For).

### Scenario 4: Injection Attacks
- **Result:** Failed
- **Details:** All database queries use Drizzle ORM parameterized queries. No raw SQL string interpolation. Zod validation on all write endpoints. No dangerouslySetInnerHTML on user content.

### Scenario 5: Insider Threat
- **Result:** Partially mitigated
- **Details:** Before fix: any authenticated user could enumerate admin emails via bootstrap endpoint. After fix: bootstrap GET requires super admin auth, emails no longer returned. Vault reveal endpoint properly audited. Dev mode bypass now requires explicit opt-in.

## Dependency Audit

### pnpm audit results:
- **High:** 6 (serialize-javascript RCE in build pipeline, undici WebSocket issues in @vercel/blob, flatted DoS in eslint)
- **Moderate:** 9 (dompurify XSS in posthog-js, esbuild CORS in drizzle-kit, Next.js issues)

### Fixed:
- Next.js updated to 16.2.0 (patches 5 CVEs)

### Accepted risks:
- serialize-javascript: Build-time only, not runtime. Risk: None in production.
- undici in @vercel/blob: WebSocket issues only, blob operations use HTTP. Risk: Minimal.
- flatted in eslint: Dev-time only linter dependency. Risk: None in production.
- dompurify in posthog-js: PostHog handles sanitization internally. Risk: Low.
- esbuild in drizzle-kit: Dev-time only for migrations. Risk: None in production.

## Security Headers Status
| Header | Before | After |
|--------|--------|-------|
| HSTS | Present | Present |
| CSP | Present (weak) | Present (weak — accepted) |
| X-Frame-Options | DENY | DENY |
| X-Content-Type-Options | nosniff | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin | strict-origin-when-cross-origin |
| Permissions-Policy | Present | Present |

## Positive Security Findings
- 0 SQL injection vectors (Drizzle ORM throughout)
- 0 XSS vectors (React escaping, no unsafe HTML rendering)
- 0 mass assignment vulnerabilities (explicit field picking)
- 0 IDOR vulnerabilities (role-based auth, not resource-ownership dependent)
- 0 unprotected API routes
- All 7 webhook handlers verify signatures with timing-safe comparison
- All write endpoints validated with Zod schemas
- Comprehensive audit logging on sensitive operations
- ArcJet rate limiting + bot detection on all public endpoints
- Clerk manages session cookies (HttpOnly, Secure, SameSite)
- Prompt injection filtering on AI chat inputs
- Vault credentials encrypted at rest

## Credentials That May Need Rotation
- `SUPER_ADMIN_USER_IDS` env var should be set in Vercel to replace removed hardcoded fallback
- Consider rotating Clerk user ID awareness (now removed from source)

## Remaining Risks & Recommendations
1. **CSP hardening** — Move to nonce-based CSP for script-src (requires Next.js middleware changes)
2. **Session replay** — Currently disabled; re-enable only with strict input masking if needed for debugging
3. **Source maps** — Consider setting `widenClientFileUpload: false` in next.config.mjs for production
4. **Rate limiting on reads** — Add ArcJet to expensive endpoints: /api/forecast, /api/intelligence, /api/dashboard/snapshot
5. **Audit log retention** — Implement retention policy to prevent unbounded table growth
