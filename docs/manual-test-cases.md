# Manual test register

Use this checklist on release candidates for flows that are hard to automate (email delivery, Word fidelity, legacy media).

| ID | Area | Steps | Expected result |
|----|------|-------|-----------------|
| M-01 | Email deliverability | Send a magic-link sign-in from `/login` to a real `@mjbiopharm.com` inbox | Email arrives within a few minutes; link opens the app signed in |
| M-02 | Magic link expiry | Request magic link, wait past expiry (or use an old link), open it | User sees a clear error and can request a new link |
| M-03 | Password reset | Use **Forgot password** for a user with a mailbox you control | Reset email arrives; new password works; `mustChangePassword` clears after change |
| M-04 | DOCX round-trip | Complete a report in the editor, export DOCX, open in Microsoft Word | Layout matches template: header, DMAIC sections, CAPA tables, signature block, page numbers |
| M-05 | Google Docs export | Export the same report and open in Google Docs | Images, tables, and lists remain readable; no broken numbering |
| M-06 | Legacy WMF equations | Import `docs/Draft Investigation (DEV-QC-26-001).docx` (or customer file with WMF previews) | Formulas render as inline images/math nodes, not `[unsupported WMF image]` |

## Notes

- Automated coverage lives in `pnpm test` (Vitest) and `pnpm test:e2e` (Playwright).
- E2E uses `ALLOW_TEST_SKIP_EVALUATION` / `ALLOW_TEST_SKIP_SUGGESTIONS` stubs — manual runs should spot-check live Gemini evaluation periodically.
