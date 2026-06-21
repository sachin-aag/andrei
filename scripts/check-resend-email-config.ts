/**
 * Validates Resend domain + AUTH_EMAIL_FROM alignment (fixes 403 on password reset).
 *
 * Usage (production secrets injected by Vercel CLI, not printed):
 *   vercel env run --environment production -- pnpm exec tsx scripts/check-resend-email-config.ts
 *
 * Local:
 *   AUTH_RESEND_KEY=re_... AUTH_EMAIL_FROM=noreply@example.com pnpm exec tsx scripts/check-resend-email-config.ts
 */

const apiKey = process.env.AUTH_RESEND_KEY;
const from = process.env.AUTH_EMAIL_FROM ?? "noreply@andreihealth.com";
const authUrl = process.env.AUTH_URL;

function fromDomain(address: string): string | null {
  const match = address.match(/@([^>\s]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

async function main() {
  if (!apiKey) {
    console.error("FAIL: AUTH_RESEND_KEY is not set");
    process.exit(1);
  }

  const domain = fromDomain(from);
  if (!domain) {
    console.error(`FAIL: Could not parse domain from AUTH_EMAIL_FROM="${from}"`);
    process.exit(1);
  }

  console.log(`AUTH_EMAIL_FROM domain: ${domain}`);
  console.log(`AUTH_URL: ${authUrl ?? "(unset — falls back to VERCEL_URL)"}`);

  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const listBody = await res.text();

  if (res.status === 401 && listBody.includes("restricted_api_key")) {
    console.log(
      "Note: AUTH_RESEND_KEY is send-only (cannot list domains). Probing send API..."
    );
    const probe = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: "deliverability-check@example.com",
        subject: "Andrei deliverability check (ignore)",
        html: "<p>Config validation probe — ignore.</p>",
      }),
    });
    const probeBody = await probe.text();
    if (probe.ok) {
      console.log("OK: Resend accepted send with this from address");
      process.exit(0);
    }
    if (probe.status === 403) {
      console.error(`FAIL: Resend rejected from="${from}" (403)`);
      console.error(probeBody);
      process.exit(1);
    }
    console.error(`FAIL: Resend probe ${probe.status}: ${probeBody}`);
    process.exit(1);
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`FAIL: Resend API ${res.status} listing domains — check AUTH_RESEND_KEY`);
    console.error(listBody);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`FAIL: Resend API ${res.status}: ${listBody}`);
    process.exit(1);
  }

  const payload = JSON.parse(listBody) as {
    data?: Array<{ name: string; status: string }>;
  };
  const domains = payload.data ?? [];

  if (domains.length === 0) {
    console.error("FAIL: No domains in Resend account — add and verify a sending domain");
    process.exit(1);
  }

  console.log("Resend domains:");
  for (const d of domains) {
    console.log(`  - ${d.name}: ${d.status}`);
  }

  const verified = domains.filter((d) => d.status === "verified");
  const exact = verified.find((d) => d.name === domain);
  const parent = verified.find(
    (d) => domain === d.name || domain.endsWith(`.${d.name}`)
  );

  if (exact) {
    console.log(`OK: "${from}" matches verified domain ${exact.name}`);
    process.exit(0);
  }

  if (parent && parent.name !== domain) {
    console.error(
      `FAIL: AUTH_EMAIL_FROM uses "${domain}" but verified domain is "${parent.name}" (subdomain mismatch — use @${parent.name} or verify ${domain})`
    );
    process.exit(1);
  }

  console.error(
    `FAIL: "${domain}" is not verified in Resend. Verified: ${verified.map((d) => d.name).join(", ") || "none"}`
  );
  console.error(
    `Fix: set AUTH_EMAIL_FROM to noreply@<verified-domain> on Vercel Production, then redeploy.`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
