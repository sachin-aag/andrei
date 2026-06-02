# Email deliverability (magic links & password reset)

Andrei sends auth email through **Resend** (`AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`). Sign-in links use **`AUTH_URL`** (production: `https://andrei-v2.vercel.app`), not the custom app domain.

## If MJ IT blocks email

**Immediate workaround (no email required):**

1. An admin sets a password directly in the database:

   ```bash
   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!'
   pnpm run set-workspace-password -- user@mjbiopharm.com 'TemporaryPass123!' --role manager
   ```

2. The user signs in at https://andrei-v2.vercel.app/login with **email + temporary password**.

3. On first login they are prompted to **choose a new password** (cannot reuse the temporary one). Share the temp password over a secure channel (phone, in person), not email.

Users can also use **Set up a password** on the login flow, but that still sends a reset email — use the script when mail is blocked.

**Requirements:** `DATABASE_URL` must point at the same database as production (Neon `main` for real users). The script logs the target host/database on startup — there is no separate branch flag; control it by setting `DATABASE_URL` in `.env.local` (see [database-environments.md](./database-environments.md)). Optional `--role engineer|manager` (default `engineer` for new users; updates role when flag is passed for existing users). New users get a display name derived from the email address.

## Fixing delivery (longer term)

### 1. Resend domain verification

In [Resend → Domains](https://resend.com/domains), add the sending domain and publish **SPF**, **DKIM**, and (recommended) **DMARC** DNS records at your registrar.

| Sender domain | When to use |
|---------------|-------------|
| `andreihealth.com` | You control DNS; IT must not block this domain |
| `mjbiopharm.com` | Often better for corporate inboxes — verify in Resend and set `AUTH_EMAIL_FROM=noreply@mjbiopharm.com` on Vercel |

A mailbox like `you@andreihealth.com` does **not** by itself fix Resend delivery — DNS for the domain in Resend does.

#### DMARC policy (`_dmarc` TXT)

DMARC is a single TXT record at `_dmarc` (e.g. `_dmarc.andreihealth.com`). It does not live in Resend — edit it at your DNS host.

| Policy | Meaning | When to use |
|--------|---------|-------------|
| `p=none` | Monitor only; failing mail is not blocked by DMARC | First 3–7 days after SPF/DKIM verify |
| `p=quarantine` | Failing mail should go to spam/junk | After Resend shows **verified** and test magic links deliver |
| `p=reject` | Failing mail rejected outright | Only after weeks of clean reports at `p=quarantine` |

**Example — monitoring (start here):**

```text
v=DMARC1; p=none; rua=mailto:dmarc-reports@andreihealth.com
```

**Example — quarantine (reasonable after a few days of verified sending):**

```text
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@andreihealth.com; adkim=s; aspf=s
```

Replace the `rua` address with a mailbox you read (or omit `rua` if you do not want aggregate reports).

Before `p=quarantine`, confirm in Resend → **Domains** that SPF and DKIM are **verified**, send a production magic link, and check **Emails** for delivered (not bounce). If you use **Google Workspace** for `@andreihealth.com`, enable DKIM in Google Admin too — DMARC applies to all mail using your domain, not only Resend.

`p=quarantine` does not break legitimate Resend or Gmail mail when SPF/DKIM align; it mainly affects spoofed or misconfigured senders.

### 2. Vercel environment (Production)

| Variable | Example |
|----------|---------|
| `AUTH_URL` | `https://andrei-v2.vercel.app` |
| `AUTH_EMAIL_FROM` | `noreply@mjbiopharm.com` (must match verified Resend domain) |
| `AUTH_RESEND_KEY` | Resend API key |

Redeploy after changing env vars.

### 3. Ask MJ IT to allowlist

- **App URL:** `https://andrei-v2.vercel.app` (and optionally `*.vercel.app`)
- **Mail:** Resend sending infrastructure + your verified sender domain (share DNS / Resend domain status from the dashboard)

### 4. Resend sandbox (testing only)

`onboarding@resend.dev` only delivers to the Resend account owner’s inbox — not for production users.

## Debugging

1. Resend dashboard → **Emails** — delivered, bounced, or suppressed?
2. Vercel → Production → **Environment** — confirm `AUTH_URL` and `AUTH_EMAIL_FROM`
3. Try password login after `set-workspace-password` to confirm the app works independent of mail
