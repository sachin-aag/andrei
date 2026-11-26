/**
 * Repeatable infra for a new customer pack. Dashboard leftovers print as
 * remaining steps. See docs/whitelabel-vercel-deploy.md#add-a-customer.
 *
 *   pnpm standup-customer -- status --slug ami
 *   pnpm standup-customer -- env --slug ami
 *   pnpm standup-customer -- link-shared --slug ami
 *   pnpm standup-customer -- wif --slug ami
 *   pnpm standup-customer -- users --slug ami --yes
 *   pnpm standup-customer -- all --slug ami
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  addVercelProjectToAttributeCondition,
  parseWifAudience,
} from "@/lib/gcp/wif-attribute-condition";

// CLI / already-exported env wins; .env.local fills gaps; .env fills the rest.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

type Command = "status" | "env" | "link-shared" | "wif" | "users" | "all";

const COMMANDS = new Set<Command>([
  "status",
  "env",
  "link-shared",
  "wif",
  "users",
  "all",
]);

const PACK_IDENTITY_KEYS = [
  "ANDREI_CUSTOMER",
  "NEXT_PUBLIC_ANDREI_CUSTOMER",
  "ANDREI_VERCEL_DEPLOY_SCOPE",
] as const;

const SHARED_KEYS = [
  "AUTH_RESEND_KEY",
  "AUTH_EMAIL_FROM",
  "AI_GATEWAY_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_VERTEX_PROJECT",
  "GOOGLE_VERTEX_LOCATION",
  "GCP_WIF_AUDIENCE",
  "GCP_SERVICE_ACCOUNT_EMAIL",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
] as const;

const POSTHOG_KEYS = [
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
] as const;

const ATTACHMENT_DEFAULTS: Record<string, string> = {
  MAX_ATTACHMENT_BYTES: "262144000",
  MAX_ATTACHMENT_PAGES: "500",
  ATTACHMENT_MALWARE_SCAN_REQUIRED: "false",
  DOCUMENT_EXTRACT_GOOGLE_MODEL_ID: "gemini-3.1-flash-lite",
  DOCUMENT_EMBEDDING_MODEL_ID: "gemini-embedding-001",
  DOCUMENT_EXTRACT_LOCATION: "global",
};

const SEED_USERS: { email: string; role: "engineer" | "manager" | "admin" }[] =
  [
    { email: "sachin@andreihealth.com", role: "engineer" },
    { email: "aditya@andreihealth.com", role: "engineer" },
    { email: "sachin+manager@andreihealth.com", role: "manager" },
    { email: "aditya+manager@andreihealth.com", role: "manager" },
    { email: "sachin+admin@andreihealth.com", role: "admin" },
    { email: "aditya+admin@andreihealth.com", role: "admin" },
  ];

type VercelLink = { orgId: string; projectId: string };

type SharedEnvRow = {
  id: string;
  key: string;
  target?: string[];
  type?: string;
  projectId?: string[];
};

type ProjectEnvRow = {
  key: string;
  target?: string[];
  gitBranch?: string | null;
  configurationId?: string | null;
  comment?: string | null;
};

function scriptArgv(): string[] {
  return process.argv.slice(2).filter((arg) => arg !== "--");
}

function printUsage(): void {
  console.log(`Repeatable infra for a new customer pack.

  pnpm standup-customer -- status --slug {slug}
  pnpm standup-customer -- env --slug {slug}
  pnpm standup-customer -- link-shared --slug {slug}
  pnpm standup-customer -- wif --slug {slug}
  pnpm standup-customer -- users --slug {slug} --yes --database-url 'postgresql://…'
  pnpm standup-customer -- all --slug {slug}

See docs/whitelabel-vercel-deploy.md#add-a-customer.
Dashboard leftovers (Neon Storage, GCS terraform, DNS, pack-on-main) print from status.`);
}

function parseArgs(argv: string[]): {
  command: Command;
  slug: string | undefined;
  yes: boolean;
  password: string | undefined;
  databaseUrl: string | undefined;
} {
  let command: Command = "status";
  let slug: string | undefined;
  let yes = false;
  let password: string | undefined;
  let databaseUrl: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--slug" && argv[i + 1]) {
      slug = argv[++i]?.trim().toLowerCase();
      continue;
    }
    if (arg.startsWith("--slug=")) {
      slug = arg.slice("--slug=".length).trim().toLowerCase();
      continue;
    }
    if (arg === "--password" && argv[i + 1]) {
      password = argv[++i];
      continue;
    }
    if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
      continue;
    }
    if (arg === "--database-url" && argv[i + 1]) {
      databaseUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--database-url=")) {
      databaseUrl = arg.slice("--database-url=".length);
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      yes = true;
      continue;
    }
    if (arg.startsWith("-")) {
      console.error(`Unknown flag ${arg}`);
      process.exit(1);
    }
    positionals.push(arg);
  }

  if (positionals[0]) {
    if (!COMMANDS.has(positionals[0] as Command)) {
      console.error(
        `Unknown command "${positionals[0]}". Use status | env | link-shared | wif | users | all`
      );
      process.exit(1);
    }
    command = positionals[0] as Command;
  }

  return { command, slug, yes, password, databaseUrl };
}

function run(
  command: string,
  args: string[],
  options: { stdin?: string; inherit?: boolean } = {}
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.stdin,
    stdio: options.inherit
      ? ["pipe", "inherit", "inherit"]
      : ["pipe", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function firstJsonValue(raw: string): unknown {
  const start = Math.min(
    ...["{", "["]
      .map((ch) => raw.indexOf(ch))
      .filter((index) => index >= 0)
  );
  if (!Number.isFinite(start) || start < 0) {
    throw new Error(`Expected JSON in:\n${raw.slice(0, 400)}`);
  }
  return JSON.parse(raw.slice(start));
}

function readVercelLink(): VercelLink {
  const parsed = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as {
    orgId?: string;
    projectId?: string;
  };
  if (!parsed.orgId || !parsed.projectId) {
    throw new Error("Run vercel link against andrei-{slug} first");
  }
  return { orgId: parsed.orgId, projectId: parsed.projectId };
}

function vercelApi(path: string, link: VercelLink): unknown {
  const result = run("vercel", [
    "api",
    path,
    "--scope",
    link.orgId,
    "--raw",
  ]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "vercel api failed");
  }
  return firstJsonValue(result.stdout);
}

function vercelApiWrite(
  method: string,
  path: string,
  link: VercelLink,
  body: unknown
): unknown {
  const result = run("vercel", [
    "api",
    path,
    "--scope",
    link.orgId,
    "-X",
    method,
    "-H",
    "Content-Type: application/json",
    "--data",
    JSON.stringify(body),
    "--raw",
  ]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `vercel api ${method} failed`);
  }
  const trimmed = result.stdout.trim();
  if (!trimmed) return null;
  try {
    return firstJsonValue(trimmed);
  } catch {
    return trimmed;
  }
}

function ensureLinked(slug: string): VercelLink {
  const project = `andrei-${slug}`;
  const linked = run("vercel", [
    "link",
    "--yes",
    "--project",
    project,
    "--scope",
    process.env.VERCEL_ORG_ID || "",
  ].filter((arg, index, all) => !(all[index - 1] === "--scope" && arg === "")));
  if (linked.status !== 0) {
    const retry = run("vercel", ["link", "--yes", "--project", project]);
    if (retry.status !== 0) {
      console.error(retry.stderr || linked.stderr);
      throw new Error(`Could not vercel link ${project}`);
    }
  }
  return readVercelLink();
}

function projectEnvKeys(link: VercelLink): Map<string, ProjectEnvRow[]> {
  const project = vercelApi(`/v9/projects/${link.projectId}`, link) as {
    env?: ProjectEnvRow[];
    name?: string;
  };
  const map = new Map<string, ProjectEnvRow[]>();
  for (const row of project.env ?? []) {
    const list = map.get(row.key) ?? [];
    list.push(row);
    map.set(row.key, list);
  }
  return map;
}

function sharedRows(link: VercelLink): SharedEnvRow[] {
  const payload = vercelApi(`/v1/env?teamId=${link.orgId}`, link) as {
    data?: SharedEnvRow[];
  };
  return payload.data ?? [];
}

function hasTargets(
  rows: ProjectEnvRow[] | undefined,
  needed: string[]
): boolean {
  const have = new Set(
    (rows ?? []).flatMap((row) => row.target ?? [])
  );
  return needed.every((target) => have.has(target));
}

function addEnv(
  key: string,
  value: string,
  environment: "production" | "preview" | "development",
  link: VercelLink
): void {
  const result = run(
    "vercel",
    [
      "env",
      "add",
      key,
      environment,
      "--scope",
      link.orgId,
      "--yes",
    ],
    { stdin: value }
  );
  if (result.status !== 0) {
    const text = `${result.stderr}\n${result.stdout}`;
    if (/already exists|duplicate/i.test(text)) {
      console.log(`  skip ${key} (${environment}) — already set`);
      return;
    }
    throw new Error(`vercel env add ${key} ${environment} failed:\n${text}`);
  }
  console.log(`  set ${key} (${environment})`);
}

function addEnvMissing(
  key: string,
  value: string,
  environments: ("production" | "preview" | "development")[],
  existing: Map<string, ProjectEnvRow[]>,
  link: VercelLink
): void {
  const rows = existing.get(key);
  for (const environment of environments) {
    if (hasTargets(rows, [environment])) {
      console.log(`  skip ${key} (${environment}) — already set`);
      continue;
    }
    addEnv(key, value, environment, link);
  }
}

function gcsBucket(slug: string): string {
  return `andrei-493614-${slug}-attachments`;
}

function publicHost(slug: string): string {
  return `https://${slug}.andreihealth.com`;
}

function printStatus(slug: string, link: VercelLink): void {
  const env = projectEnvKeys(link);
  const shared = sharedRows(link);
  const allTargets = ["production", "preview", "development"] as const;
  const prodPreview = ["production", "preview"] as const;

  console.log(`Project ${link.projectId} (andrei-${slug})`);
  console.log("");
  console.log("Pack identity (project):");
  for (const key of PACK_IDENTITY_KEYS) {
    const ok = hasTargets(env.get(key), [...allTargets]);
    console.log(`  ${ok ? "done" : "MISSING"}  ${key}`);
  }
  console.log("Auth / bucket (project):");
  console.log(
    `  ${hasTargets(env.get("AUTH_SECRET"), [...allTargets]) ? "done" : "MISSING"}  AUTH_SECRET`
  );
  console.log(
    `  ${hasTargets(env.get("AUTH_URL"), [...prodPreview]) ? "done" : "MISSING"}  AUTH_URL`
  );
  console.log(
    `  ${hasTargets(env.get("GCS_BUCKET"), [...prodPreview]) ? "done" : "MISSING"}  GCS_BUCKET`
  );
  const neonProd = (env.get("DATABASE_URL") ?? []).some(
    (row) =>
      (row.target ?? []).includes("production") &&
      !row.gitBranch &&
      row.configurationId
  );
  const neonPreview = (env.get("DATABASE_URL") ?? []).some(
    (row) => (row.target ?? []).includes("preview") && row.configurationId
  );
  console.log("Neon integration:");
  console.log(
    `  ${neonProd ? "done" : "MISSING"}  Production DATABASE_URL (Storage → Neon)`
  );
  console.log(
    `  ${neonPreview ? "done" : "pending until first preview deploy"}  Preview branching inject`
  );
  console.log("Shared team vars linked to this project:");
  for (const key of SHARED_KEYS) {
    const row = shared.find((item) => item.key === key);
    const linked = Boolean(row?.projectId?.includes(link.projectId));
    const exists = Boolean(row);
    console.log(
      `  ${linked ? "done" : exists ? "NOT LINKED" : "no team row"}  ${key}`
    );
  }
  console.log("PostHog (still project-level on older packs — not on Shared):");
  for (const key of POSTHOG_KEYS) {
    console.log(
      `  ${hasTargets(env.get(key), [...prodPreview]) ? "done" : "MISSING"}  ${key}`
    );
  }
  console.log("");
  console.log("Still dashboard / terraform / git (not this CLI):");
  console.log("  1. Neon Console project + Vercel Storage → Neon (preview branching on)");
  console.log("  2. CUSTOMER_NEON_PREVIEW_PROJECTS row + tests (code PR)");
  console.log(`  3. infra/gcs tenant ${slug} + terraform apply`);
  console.log(`  4. Domain ${slug}.andreihealth.com + CNAME to cname.vercel-dns.com`);
  console.log("  5. Merge the pack to main — Production 404s with DEPLOYMENT_NOT_FOUND until then");
  console.log("Then this CLI:");
  console.log("  pnpm standup-customer -- wif --slug " + slug);
  console.log(
    "  pnpm standup-customer -- users --slug " +
      slug +
      " --yes --database-url 'postgresql://…this neon…'"
  );
  console.log("Smoke /login, create, export, chat hi (needs WIF), vault PDF.");
}

function applyEnv(slug: string, link: VercelLink): void {
  const existing = projectEnvKeys(link);
  const all = ["production", "preview", "development"] as const;
  const prodPreview = ["production", "preview"] as const;

  console.log("Pack identity");
  for (const key of PACK_IDENTITY_KEYS) {
    addEnvMissing(key, slug, [...all], existing, link);
  }

  console.log("Auth");
  const authRows = existing.get("AUTH_SECRET");
  if (hasTargets(authRows, [...all])) {
    console.log("  skip AUTH_SECRET — already set");
  } else if (authRows && authRows.length > 0) {
    console.log(
      "  AUTH_SECRET exists on some targets only — fill the rest in the dashboard (do not mint a second secret)"
    );
  } else {
    addEnvMissing(
      "AUTH_SECRET",
      randomBytes(32).toString("base64"),
      [...all],
      existing,
      link
    );
  }
  addEnvMissing("AUTH_URL", publicHost(slug), [...prodPreview], existing, link);
  addEnvMissing(
    "GCS_BUCKET",
    gcsBucket(slug),
    [...prodPreview],
    existing,
    link
  );

  console.log("Attachment / extract defaults");
  for (const [key, value] of Object.entries(ATTACHMENT_DEFAULTS)) {
    addEnvMissing(key, value, [...prodPreview], existing, link);
  }
}

function linkShared(link: VercelLink): void {
  const rows = sharedRows(link);
  for (const key of SHARED_KEYS) {
    const row = rows.find((item) => item.key === key);
    if (!row) {
      console.log(`  no team row ${key} — skip`);
      continue;
    }
    const ids = row.projectId ?? [];
    if (ids.includes(link.projectId)) {
      console.log(`  skip ${key} — already linked`);
      continue;
    }
    try {
      vercelApiWrite("PATCH", `/v1/env/${row.id}?teamId=${link.orgId}`, link, {
        projectId: [...ids, link.projectId],
        target: row.target ?? ["production", "preview"],
        type: row.type ?? "encrypted",
      });
      console.log(`  linked ${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${key}: ${message.split("\n")[0]}`);
      console.error(
        "  Link it in Vercel → Environment Variables → Shared (the API needs the value to PATCH)."
      );
    }
  }
  console.log(
    "PostHog is not a team Shared row. Copy NEXT_PUBLIC_POSTHOG_KEY / HOST from andrei-demo as project vars, or promote those keys to Shared."
  );
}

function applyWif(link: VercelLink): void {
  const audience = process.env.GCP_WIF_AUDIENCE?.trim();
  if (!audience) {
    throw new Error("GCP_WIF_AUDIENCE is not set in .env.local (needed to find the pool/provider).");
  }
  const gcpProject =
    process.env.GOOGLE_VERTEX_PROJECT?.trim() || "andrei-493614";
  const { pool, provider } = parseWifAudience(audience);
  console.log(`WIF pool=${pool} provider=${provider} gcp=${gcpProject}`);
  const described = run("gcloud", [
    "iam",
    "workload-identity-pools",
    "providers",
    "describe",
    provider,
    "--location=global",
    `--workload-identity-pool=${pool}`,
    `--project=${gcpProject}`,
    "--format=json",
  ]);
  if (described.status !== 0) {
    throw new Error(
      `gcloud describe failed (need ADC: gcloud auth application-default login).\n${described.stderr}`
    );
  }
  const payload = JSON.parse(described.stdout) as {
    attributeCondition?: string;
  };
  const current = payload.attributeCondition ?? "";
  const next = addVercelProjectToAttributeCondition(current, link.projectId);
  if (next === current.trim()) {
    console.log(`  ${link.projectId} already in the attribute condition`);
    return;
  }
  console.log("  current:", current);
  console.log("  next:   ", next);
  const updated = run("gcloud", [
    "iam",
    "workload-identity-pools",
    "providers",
    "update-oidc",
    provider,
    "--location=global",
    `--workload-identity-pool=${pool}`,
    `--project=${gcpProject}`,
    `--attribute-condition=${next}`,
  ]);
  if (updated.status !== 0) {
    throw new Error(updated.stderr || "gcloud update-oidc failed");
  }
  console.log(`  added ${link.projectId} to the WIF attribute condition`);
}

function seedUsers(
  password: string | undefined,
  yes: boolean,
  databaseUrlFlag: string | undefined
): void {
  const databaseUrl = (databaseUrlFlag ?? process.env.DATABASE_URL)?.trim();
  if (!databaseUrl) {
    throw new Error(
      "Pass --database-url with this pack's Neon pooled URL (do not seed against .env.local demo/MJ)."
    );
  }
  const host = new URL(
    databaseUrl.replace(/^postgres:\/\//, "postgresql://")
  ).hostname;
  console.log(`Target database host: ${host}`);
  if (!yes) {
    throw new Error("Refusing to create users without --yes (check the host above).");
  }
  const secret = password ?? `${randomBytes(9).toString("base64url")}Aa1!`;
  const dir = mkdtempSync(join(tmpdir(), "andrei-standup-"));
  const envFile = join(dir, ".env");
  writeFileSync(envFile, `DATABASE_URL=${JSON.stringify(databaseUrl)}\n`);
  try {
    for (const user of SEED_USERS) {
      const result = run(
        "pnpm",
        [
          "set-workspace-password",
          "--",
          user.email,
          secret,
          "--role",
          user.role,
          "--env-file",
          envFile,
        ],
        { inherit: true }
      );
      if (result.status !== 0) {
        throw new Error(`Failed creating ${user.email}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(
    "Temporary password (must change on first login; not stored in git):"
  );
  console.log(`  ${secret}`);
}

function requireSlug(slug: string | undefined): string {
  if (!slug || !/^[a-z][a-z0-9-]+$/.test(slug)) {
    console.error("Usage: pnpm standup-customer -- <command> --slug {slug}");
    process.exit(1);
  }
  return slug;
}

async function main(): Promise<void> {
  const { command, slug: rawSlug, yes, password, databaseUrl } =
    parseArgs(scriptArgv());
  const slug = requireSlug(rawSlug);

  switch (command) {
    case "status": {
      const link = ensureLinked(slug);
      printStatus(slug, link);
      return;
    }
    case "env": {
      const link = ensureLinked(slug);
      applyEnv(slug, link);
      return;
    }
    case "link-shared": {
      const link = ensureLinked(slug);
      linkShared(link);
      return;
    }
    case "wif": {
      const link = ensureLinked(slug);
      applyWif(link);
      return;
    }
    case "users": {
      seedUsers(password, yes, databaseUrl);
      return;
    }
    case "all": {
      const link = ensureLinked(slug);
      applyEnv(slug, link);
      linkShared(link);
      try {
        applyWif(link);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`WIF skipped: ${message}`);
      }
      printStatus(slug, link);
      return;
    }
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhandled command ${exhaustive}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
