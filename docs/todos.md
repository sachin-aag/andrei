# Auth & onboarding — temporary state & follow-ups

Scratch list for work done during MJ rollout (blocked email, manual passwords). Revisit when email deliverability is stable.

## Current state (as of 2026-06-02)

- **App URL:** `https://andrei-v2.vercel.app` (`AUTH_URL` on Vercel Production).
- **Custom domain** `andreihealth.com` removed from Vercel; app served on `*.vercel.app`.
- **Sign-in UI:** password only — magic link buttons removed from login (`password-login-form.tsx`). Resend provider still registered in `auth.ts` (not removed from backend).
- **Onboarding:** admins use `pnpm run set-workspace-password` with production `DATABASE_URL` in `.env.local`. Temporary creds live in `docs/mj-onboarding-temporary-passwords.md` (gitignored).
- **First login:** `must_change_password` forces `/change-password` after admin-set temp password.

## Ops / onboarding

- [ ] Confirm production Neon `main` is the `DATABASE_URL` used for `set-workspace-password` (script prints target host on run).
- [ ] Share `docs/mj-onboarding-temporary-passwords.md` securely; delete file after all users have signed in and changed passwords.
- [ ] Smoke-test one engineer + one manager: login → forced password change → full app access.
- [ ] Ask MJ IT to allowlist app URL + Resend sender domain if transactional mail is still needed for password reset.

## Email deliverability

See [email-deliverability.md](./email-deliverability.md).

- [ ] Resend domain verified (SPF + DKIM green).
- [ ] DMARC: started with `p=none`, move to `p=quarantine` after verified sending.
- [ ] Test production magic link / forgot-password in Resend dashboard (delivered vs bounced).
- [ ] Consider `AUTH_EMAIL_FROM` on `@mjbiopharm.com` if `@andreihealth.com` mail is filtered.
- [ ] Google Workspace MX restored for `@andreihealth.com` mailbox; DKIM enabled in Google Admin if sending from that domain.

## Code cleanup (when re-enabling or dropping magic link)

- [ ] **Decision:** keep magic link sign-in or remove Resend provider entirely.
- [ ] If removing: delete `src/components/auth/magic-link-form.tsx`, Resend provider in `auth.ts`, and magic-link paths in `signIn` callback / docs.
- [ ] If re-enabling: restore UI in `password-login-form.tsx` (or wire `MagicLinkForm` on login page) and update login copy.
- [ ] Remove or gate `EmailDeliveryHint` if magic link stays off and reset email is rare.
- [ ] Update `CLAUDE.md` / README (still mention mock users / magic link in places).
- [ ] Review `docs/email-deliverability.md` magic-link-first wording vs password-first rollout.

## Auth hardening (optional, later)

- [ ] Admin-only script or audit log for `set-workspace-password` runs.
- [ ] Rate-limit `/api/auth-pw/forgot-password` and credentials sign-in.
- [ ] Document whether password reset email remains supported while magic link UI is hidden.

## Done (reference)

- [x] `must_change_password` column + `/change-password` + replace-shared-password API.
- [x] `set-workspace-password` script: create user if missing, `--role engineer|manager`, DB target logging.
- [x] Magic link removed from login UI (backend Resend unchanged).
- [x] `.gitignore` for `docs/mj-onboarding-temporary-passwords.md`.
