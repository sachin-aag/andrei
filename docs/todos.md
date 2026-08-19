# Auth & onboarding — temporary state & follow-ups

Scratch list for work done during MJ rollout (blocked email, manual passwords). Revisit when email deliverability is stable.

## Current state (as of 2026-06-02)

- **App URL:** `https://mj.andreihealth.com` (`AUTH_URL` on Vercel Production).
- **Custom domain** `mj.andreihealth.com` is the MJ production host (`andrei-v2` Vercel project).
- **Sign-in UI:** password is primary; magic link is a secondary option on `/login` (`password-login-form.tsx`). Resend provider in `auth.ts`.
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

## Code cleanup (magic link restored as secondary)

- [x] **Decision:** keep magic link sign-in as a secondary option; password remains primary.
- [x] Restored UI in `password-login-form.tsx` and login copy.
- [ ] Update `CLAUDE.md` / README (still mention mock users in places).
- [ ] Review `docs/email-deliverability.md` if MJ IT still blocks transactional mail.

## Auth hardening (optional, later)

- [ ] Admin-only script or audit log for `set-workspace-password` runs.
- [ ] Rate-limit `/api/auth-pw/forgot-password` and credentials sign-in.
- [x] Password reset email remains supported alongside magic link sign-in.

## Done (reference)

- [x] `must_change_password` column + `/change-password` + replace-shared-password API.
- [x] `set-workspace-password` script: create user if missing, `--role engineer|manager`, DB target logging.
- [x] Magic link restored on login as a secondary path (password remains primary).
- [x] `.gitignore` for `docs/mj-onboarding-temporary-passwords.md`.
