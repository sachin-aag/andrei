/**
 * Classify a Vercel/GitHub failure and, when it looks like an application bug,
 * launch a Cursor cloud agent that diagnoses (PostHog / Langfuse / Neon) and
 * opens a draft PR with the fix.
 *
 *   pnpm exec tsx scripts/autodiagnose/launch-cursor-agent.ts
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { classifyVercelError } from "@/lib/autodiagnose/classify";
import { fingerprintMarker } from "@/lib/autodiagnose/fingerprint";
import { parseAutodiagnoseEvent } from "@/lib/autodiagnose/github-event";
import {
  buildCursorCreateAgentBody,
  decideAutodiagnoseLaunch,
} from "@/lib/autodiagnose/launch-decision";
import { buildAutodiagnoseAgentPrompt } from "@/lib/autodiagnose/prompt";

const CURSOR_AGENTS_URL = "https://api.cursor.com/v1/agents";

type GhJson = unknown;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function readGithubEvent(): Promise<unknown> {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return {};
  }
}

const execFileAsync = promisify(execFile);

async function ghJson(args: string[]): Promise<GhJson> {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      env: process.env,
      maxBuffer: 2_000_000,
    });
    return JSON.parse(stdout) as GhJson;
  } catch {
    return null;
  }
}

function repositoryHttpsUrl(): string {
  const slug = process.env.GITHUB_REPOSITORY?.trim();
  if (slug) return `https://github.com/${slug}`;
  return "https://github.com/sachin-aag/andrei";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function collectOpenPrText(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    return [String(record.title ?? ""), String(record.body ?? "")];
  });
}

function collectCommentBodies(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const record = asRecord(item);
    const body = record?.body;
    return typeof body === "string" ? [body] : [];
  });
}

async function launchCursorAgent(body: unknown): Promise<{ id?: string; url?: string }> {
  const apiKey = requiredEnv("CURSOR_API_KEY");
  const response = await fetch(CURSOR_AGENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(
      `Cursor Agents API ${response.status}: ${JSON.stringify(json ?? {})}`
    );
  }
  const agent = asRecord(json?.agent) ?? json;
  const id = typeof agent?.id === "string" ? agent.id : undefined;
  return {
    id,
    url: id ? `https://cursor.com/agents?id=${id}` : undefined,
  };
}

async function postCommitComment(sha: string, body: string): Promise<void> {
  const slug = process.env.GITHUB_REPOSITORY?.trim();
  if (!slug || !sha) return;
  await ghJson([
    "api",
    `repos/${slug}/commits/${sha}/comments`,
    "-f",
    `body=${body}`,
  ]);
}

async function main(): Promise<void> {
  const payload = await readGithubEvent();
  const event = parseAutodiagnoseEvent({
    eventName: process.env.GITHUB_EVENT_NAME,
    payload,
    env: process.env,
  });
  const classification = classifyVercelError(event);
  console.log(
    JSON.stringify(
      {
        event: {
          source: event.source,
          environment: event.environment,
          projectName: event.projectName,
          sha: event.sha,
        },
        classification,
      },
      null,
      2
    )
  );

  const sha = event.sha || process.env.GITHUB_SHA || "";
  const slug = process.env.GITHUB_REPOSITORY ?? "";
  const openPrs = collectOpenPrText(
    await ghJson(["pr", "list", "--state", "open", "--limit", "50", "--json", "title,body,url"])
  );
  const comments = sha
    ? collectCommentBodies(await ghJson(["api", `repos/${slug}/commits/${sha}/comments`]))
    : [];

  const decision = decideAutodiagnoseLaunch({
    classification,
    existingOpenPrs: openPrs,
    existingCommitComments: comments,
    cursorApiKeyPresent: Boolean(process.env.CURSOR_API_KEY?.trim()),
  });
  console.log(`decision: ${decision.action} (${decision.reason})`);
  if (decision.action === "skip") {
    return;
  }

  const repository = repositoryHttpsUrl();
  const startingRef = sha || event.ref || "main";
  const prompt = buildAutodiagnoseAgentPrompt({
    event,
    classification,
    repository,
  });
  const body = buildCursorCreateAgentBody({
    prompt,
    repository,
    startingRef,
  });
  const launched = await launchCursorAgent(body);
  console.log(`launched: ${launched.url ?? launched.id ?? "(no id)"}`);

  if (sha) {
    const marker = fingerprintMarker(classification.fingerprint);
    const url = launched.url ?? "";
    await postCommitComment(
      sha,
      `${marker} Launched Cursor autodiagnose. ${url}`.trim()
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
