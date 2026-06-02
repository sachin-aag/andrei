# Andrei — Security Overview

**For MJ Biopharm IT Review | June 2026**

---

## Slide 1: Access Control & Authentication

| Layer | What We Do |
|---|---|
| **Closed User Directory** | No self-signup. Only users manually registered by MJ Biopharm administrators can access the system. |
| **Password Security** | Passwords hashed with scrypt (64-byte key + 32-byte random salt). Timing-safe comparison prevents timing attacks. Passwords are never stored in plain text. |
| **Session Management** | JWT-based sessions via NextAuth. Every request is validated by a proxy layer — unauthenticated requests are blocked (401) or redirected to login. No API endpoint is accessible without a valid session. |
| **Role-Based Access** | Two roles: Engineer and Manager. Engineers can only edit their own reports. Managers review, comment, and approve. Enforced at the API level. |

---

## Slide 2: Infrastructure & Data Protection

| Layer | What's in Place |
|---|---|
| **Hosting — Vercel** | Automatic HTTPS/TLS on all traffic. DDoS protection always on. SOC 2 Type II and ISO 27001 certified. Fully managed — no SSH, no exposed ports. |
| **Database — Neon Postgres** | Data encrypted at rest (AES-256). Encrypted in transit (TLS required). SOC 2 Type II certified. Isolated compute — MJ data is not co-located with other customers. Automatic daily backups with point-in-time restore. |
| **AI Processing** | Routed through Vercel AI Gateway — zero data retention policy. Prompts/responses are not stored by the AI provider. Only report section text is sent for quality evaluation — no PII. |
| **Secrets Management** | All credentials stored as encrypted environment variables on Vercel (never in code). Database connection strings, API keys, auth secrets are server-side only — never exposed to the browser. |
