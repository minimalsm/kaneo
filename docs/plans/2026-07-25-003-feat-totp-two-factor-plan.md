---
title: TOTP Two-Factor Authentication - Plan
type: feat
date: 2026-07-25
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# TOTP Two-Factor Authentication - Plan

## Goal Capsule

- **Objective:** TOTP 2FA in the free core (roadmap Phase 3, item 4a): enroll with QR + backup codes in account settings; password sign-ins challenge for a code. First Phase 3 differentiator.
- **Authority hierarchy:** codebase conventions > this plan; `CLAUDE.md` anti-over-engineering governs.
- **Stop conditions:** stop and surface if better-auth 1.6.23's twoFactor plugin proves incompatible with the customized organization plugin (research found no conflict, one hook gotcha handled in U1), or if the hand-written schema diverges from what the plugin's adapter expects at runtime.
- **Tail ownership:** pipeline owns simplify/review/ship; commit + push to fork, **no PR** (standing user instruction).

## Product Contract

### Summary

A signed-in (non-guest) user enables 2FA from a new Security settings page: confirm password, scan a QR code, verify a TOTP code, and save one-time backup codes. From then on, password sign-in requires a TOTP code (or a backup code); magic-link/OTP flows follow better-auth's semantics. Users can disable 2FA or regenerate backup codes with password confirmation.

### Requirements

- R1. A user can enable TOTP 2FA: password confirmation → QR (and copyable secret) → verify a code → backup codes shown exactly once with copy/download.
- R2. Password sign-in for a 2FA-enabled user requires a TOTP code before a session is created; a backup code works as fallback (single-use).
- R3. The 2FA verification page preserves the sign-in flow's `redirect`/`invitationId` params, exactly like the email-OTP page.
- R4. A user can disable 2FA and regenerate backup codes (both password-confirmed).
- R5. Guests (anonymous users) never see enrollment UI.
- R6. After a 2FA-verified sign-in, the session is fully equivalent to a normal sign-in — including the active-organization stamping the after-hook performs today (known gotcha: the hook keys on sign-in paths and must also cover `/two-factor/verify-*`).
- R7. Sign-in UX: a 2FA-required response must never toast "signed in" — it routes to the verification page (the current form would false-toast; fix in U1).

### Scope Boundaries

- **Known accepted risk:** a user who loses both their authenticator and backup codes is locked out; interim support remediation is a manual DB operation (`UPDATE "user" SET two_factor_enabled = false` + `DELETE FROM two_factor WHERE user_id = …`), documented here as the runbook until admin reset tooling ships.
- **Deploy ordering:** non-issue by construction in this repo — migrations auto-run at API boot before serving (`runStartupTasks`), so schema and code land atomically in a single-process self-host deploy; noted for multi-replica operators: run `db:migrate` before rolling new code.
- **Deferred to follow-up work:** workspace-level "enforce 2FA" setting (roadmap names it; deferred deliberately — it needs product decisions on grace periods and blocking surface, touches `require-workspace-permission` + workspace settings UI, and nothing in this plan constrains it); trusted-device "remember me" duration tuning; SMS/passkey second factors; admin 2FA-reset tooling.

## Planning Contract

### Key Technical Decisions

- KTD1. **better-auth's `twoFactor` plugin (server + client), version-matched at 1.6.23** — already installed, exports verified in node_modules. Chosen over hand-rolling TOTP: the plugin owns secret storage, verification, lockout (1.6.23 includes `failedVerificationCount`/`lockedUntil`), and backup codes.
- KTD2. **Hand-written drizzle schema, repo convention** (no better-auth CLI generation): `twoFactorTable` (secret, backupCodes, userId FK, verified, failedVerificationCount, lockedUntil — exact 1.6.23 shape) + `user.two_factor_enabled` boolean; drizzle-kit migration; adapter alias `twoFactor: schema.twoFactorTable` in auth.ts.
- KTD3. **Set the TOTP issuer** via `appName: "Kaneo"` (or plugin `totpOptions.issuer`) — currently unset, which would brand authenticator entries "Better Auth".
- KTD4. **Widen the after-hook path condition** so `activeOrganizationId` stamping also matches `/two-factor/verify-*` (R6), **stamping only when `newSession.session.activeOrganizationId` is null**. Verified: sign-in-completion sessions arrive unstamped (get stamped), but ENROLLMENT-time verify-totp replaces the session carrying the existing active org — an unconditional stamp would silently switch a multi-workspace user to their first workspace. The half-auth leg is safe either way: the plugin nulls `newSession` until verification succeeds.
- KTD5. **The verify page does NOT send `trustDevice` in v1** — every password sign-in re-challenges; the trusted-device checkbox/duration is wholly deferred (the plugin default would otherwise mint a self-renewing 30-day bypass cookie). Terminal states are specified: `INVALID_TWO_FACTOR_COOKIE` / `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` → challenge-expired message + route back to `/auth/sign-in` preserving `redirect`/`invitationId`; `ACCOUNT_TEMPORARILY_LOCKED` → locked message, no retry loop. **Verification page clones the email-OTP page** (`verify-otp.tsx`: AuthLayout + InputOTP + react-hook-form, `input-otp` already installed) at `/auth/two-factor`, with a backup-code mode toggle; client redirect via `twoFactorClient({ onTwoFactorRedirect })` + an explicit `twoFactorRedirect` branch in `sign-in-form.tsx` (R7).
- KTD6. **QR via new dependency `qrcode.react`** (no QR lib exists) rendering the `totpURI` from `authClient.twoFactor.enable()`; backup codes surfaced once via the `api-key-created-modal` pattern.

### Assumptions

- Enrollment lives at a new `settings/account/security.tsx` route (cleaner than stuffing `information.tsx`), nav entry in the settings layout.
- Anonymous users self-block on the password-confirmation step anyway; UI additionally hides enrollment for `user.isAnonymous` (R5).
- **Accepted 2FA boundary (verified in 1.6.23 source):** the TOTP challenge hook matches ONLY `/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number`. Magic link, email OTP, social OAuth, and device authorization create sessions WITHOUT a TOTP challenge. Accepted for v1: email-based flows are equivalent to email-account recovery, OAuth delegates to the provider's own 2FA. A U1 test pins the bypass (magic-link or email-OTP sign-in for an enrolled user creates a session directly) so a future better-auth upgrade changing semantics is caught. The deferred workspace-enforce feature must revisit this boundary.
- The half-authenticated window is carried solely by better-auth's signed `two_factor` cookie (default 600s TTL); no session exists until verification succeeds.

## Implementation Units

### U1. Server plugin, schema, sign-in challenge flow

- **Goal:** R2, R3, R6, R7 — 2FA is enforceable end-to-end for password sign-ins.
- **Dependencies:** none.
- **Files:** `apps/api/src/database/schema.ts` (+ generated migration), `apps/api/src/auth.ts` (plugin, adapter alias, appName/issuer, after-hook widen), `apps/web/src/lib/auth-client.ts` (twoFactorClient), `apps/web/src/components/auth/sign-in-form.tsx` (twoFactorRedirect branch), `apps/web/src/routes/auth/two-factor.tsx` (verify page, TOTP + backup-code modes, param preservation), i18n keys, `tests/api-integration/two-factor.test.ts` (new), root `package.json` devDependency `@better-auth/utils` (version-matched to the installed transitive 0.4.2 — tests generate codes via `createOTP(secret, {digits: 6}).totp()` with the secret parsed from the enable response's `totpURI`; `otplib` is NOT installed).
- **Approach:** per KTD1-KTD5. Integration tests exercise the better-auth endpoints directly (enable with password → verify TOTP setup → sign-in returns twoFactorRedirect instead of session → verify-totp creates session → after-hook stamped activeOrganizationId → backup code single-use → disable).
- **Test scenarios:**
  - Enable requires the correct password; the twoFactor row is created and `user.twoFactorEnabled` flips after TOTP verification.
  - Password sign-in for an enrolled user returns the 2FA-redirect shape and no session cookie; `verify-totp` with a valid code (generate via otplib or better-auth's own totp util in-test) creates the session.
  - The created session has `activeOrganizationId` stamped (R6 — regression-pins the hook widen).
  - A backup code signs in once and is consumed (second use fails).
  - Wrong codes increment lockout state per plugin semantics (assert failure response; full lockout window optional).
  - Disable with password removes the requirement (subsequent sign-in gets a direct session).
  - Web: sign-in form with a mocked twoFactorRedirect response does NOT toast success and navigates to `/auth/two-factor` preserving `redirect` AND `invitationId` params (component test).
  - Magic-link (or email-OTP) sign-in for an enrolled user creates a session directly — pins the accepted bypass boundary.
  - Enrolling in 2FA while a non-first workspace is active does not change the active workspace (KTD4 null-guard regression).
  - After regenerate-backup-codes, a code from the prior set is rejected; a code from the new set works once.
  - `verify-totp` without the `two_factor` cookie returns an auth error and creates no session.
- **Verification:** full integration suite green locally (Postgres available); web tests green; builds + tsc + biome + i18n gates.

### U2. Enrollment settings UI

- **Goal:** R1, R4, R5 — Security settings page.
- **Dependencies:** U1 (plugin + client active).
- **Files:** `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/security.tsx`, `apps/web/src/components/account/two-factor-settings.tsx` (+ colocated test), settings nav entry, `apps/web/package.json` (`qrcode.react`), i18n keys (12+ locales, targeted).
- **Approach:** the secret/totpURI live only in local component state and are cleared when the machine leaves the QR step — never logged, query-cached, or included in error reports. State machine: disabled → (password dialog) → QR + secret + TOTP verify input → backup-codes-once modal (copy + download .txt, api-key-created-modal pattern) → enabled state showing disable + regenerate-codes actions (each password-confirmed). Hidden entirely for `user.isAnonymous`. Status sourced from the session user's `twoFactorEnabled`.
- **Test scenarios:**
  - Enable flow calls `authClient.twoFactor.enable` with the password and renders the QR/URI; verify submits the code; backup codes render exactly once with copy/download.
  - Wrong password error surfaces inline; dialog stays open.
  - Enabled state shows disable/regenerate; disable calls the client with password; UI returns to disabled state.
  - Anonymous user: the security section renders nothing (or an upgrade prompt — pick the repo's existing anonymous-gating pattern).
- **Verification:** web tests green; tsc 0; build; i18n no new failures; manual dev-instance enrollment with a real authenticator (issuer shows "Kaneo").

## Verification Contract

| Gate | Command |
|---|---|
| API integration (real Postgres, available locally) | `npx vitest run --config vitest.integration.config.ts` from `apps/api` — all suites incl. new two-factor |
| API unit + build | `pnpm --filter @kaneo/api test:unit`; `pnpm --filter @kaneo/api build` |
| Web tests / types / build | `pnpm --filter @kaneo/web test`; `npx tsc -p apps/web/tsconfig.json --noEmit` (0); `pnpm --filter @kaneo/web build` |
| Lint / i18n | `pnpm exec biome check` on touched files; `pnpm i18n:check` no new failures |
| Smoke | dev instance: enroll with a real TOTP app, sign out, sign in with code; backup code path; disable |

## Definition of Done

- Both units implemented with scenarios covered, all gates green; a full enroll→challenge→verify→disable cycle proven in integration tests AND the dev-instance smoke; no regression to guest/magic-link/OTP sign-in flows; no dead code.
