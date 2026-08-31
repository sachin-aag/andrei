import { fingerprintError } from "./fingerprint";
import type { ClassifyResult, VercelErrorEvent } from "./types";

const NOT_A_BUG_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /deployment (was )?cancel+ed/i,
    reason: "Deployment was canceled, not a product failure",
  },
  {
    re: /canceled because a newer/i,
    reason: "Superseded by a newer deployment",
  },
  {
    re: /skipped (due to|because)/i,
    reason: "Build was skipped",
  },
];

const INFRA_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b28P01\b/,
    reason: "Neon leftover preview password (28P01) — delete the preview branch and redeploy",
  },
  {
    re: /password authentication failed/i,
    reason: "Database password rejected — usually a stale Neon preview compute",
  },
  {
    re: /DATABASE_URL is not set/i,
    reason: "DATABASE_URL missing from the Vercel environment",
  },
  {
    re: /ENOTFOUND|ECONNREFUSED|getaddrinfo/i,
    reason: "Network/DNS failure talking to an external host",
  },
  {
    re: /missing (required )?(env|environment variable)/i,
    reason: "Required environment variable is not configured",
  },
];

const THIRD_PARTY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /RESOURCE_EXHAUSTED/,
    reason: "Upstream quota exhausted",
  },
  {
    re: /\b429\b|rate[- ]limit/i,
    reason: "Upstream rate limit",
  },
  {
    re: /generativelanguage\.googleapis|google\.generativeai/i,
    reason: "Gemini API failure",
  },
  {
    re: /vertex.?ai.*(unavailable|permission|quota)/i,
    reason: "Vertex AI platform failure",
  },
  {
    re: /ai gateway.*(unavailable|401|403|429)/i,
    reason: "Vercel AI Gateway credential or quota failure",
  },
];

const BUILD_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /Type error:/i,
    reason: "TypeScript failed during the Vercel build",
  },
  {
    re: /Failed to compile/i,
    reason: "Next.js compile failed",
  },
  {
    re: /TS\d{4}:/,
    reason: "TypeScript diagnostic during build",
  },
  {
    re: /Module not found/i,
    reason: "Missing module at build time",
  },
  {
    re: /ESLint found too many errors/i,
    reason: "Lint failed the build",
  },
];

const DATABASE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /syntax error at or near/i,
    reason: "SQL syntax error — likely a migration or query bug",
  },
  {
    re: /column .+ does not exist/i,
    reason: "Schema drift: query references a missing column",
  },
  {
    re: /relation .+ does not exist/i,
    reason: "Schema drift: query references a missing table",
  },
];

const RUNTIME_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /FUNCTION_INVOCATION_FAILED/,
    reason: "Vercel function crashed",
  },
  {
    re: /FUNCTION_INVOCATION_TIMEOUT/,
    reason: "Vercel function timed out — may be an unbounded route",
  },
  {
    re: /Cannot read propert(y|ies) of (undefined|null)/i,
    reason: "Unhandled null/undefined access",
  },
  {
    re: /\bTypeError\b|\bReferenceError\b|\bRangeError\b/,
    reason: "Unhandled JavaScript exception",
  },
  {
    re: /\bstatus code 500\b|\bHTTP 500\b|\bInternal Server Error\b/i,
    reason: "HTTP 500 from the deployment",
  },
];

const AI_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /AI_APICallError|NoOutputGeneratedError|NoObjectGeneratedError/,
    reason: "AI SDK call failed in application code",
  },
  {
    re: /evaluateSection|generateSuggestionsForSection|streamText/,
    reason: "AI evaluation/suggestion/chat path threw",
  },
];

function firstMatch(
  text: string,
  patterns: Array<{ re: RegExp; reason: string }>
): string | null {
  for (const pattern of patterns) {
    if (pattern.re.test(text)) return pattern.reason;
  }
  return null;
}

export function isProductionEnvironment(environment: string | null): boolean {
  if (!environment) return false;
  return /production/i.test(environment) && !/preview/i.test(environment);
}

export function isPreviewEnvironment(environment: string | null): boolean {
  if (!environment) return false;
  return /preview|staging/i.test(environment) && !/production/i.test(environment);
}

export function classifyVercelError(event: VercelErrorEvent): ClassifyResult {
  const text = event.text.trim();
  const base = {
    projectName: event.projectName,
    text: text || event.source,
  };

  const notABug = firstMatch(text, NOT_A_BUG_PATTERNS);
  if (notABug) {
    return {
      action: "skip",
      category: "not_a_bug",
      reason: notABug,
      confidence: "high",
      fingerprint: fingerprintError({ category: "not_a_bug", ...base }),
    };
  }

  const infra = firstMatch(text, INFRA_PATTERNS);
  if (infra) {
    return {
      action: "skip",
      category: "infra_config",
      reason: infra,
      confidence: "high",
      fingerprint: fingerprintError({ category: "infra_config", ...base }),
    };
  }

  if (event.source !== "manual" && isPreviewEnvironment(event.environment)) {
    return {
      action: "skip",
      category: "not_a_bug",
      reason:
        "Preview/staging failures are not auto-fixed (avoids PRs that bundle unrelated branch work onto main)",
      confidence: "high",
      fingerprint: fingerprintError({ category: "not_a_bug", ...base }),
    };
  }

  const build = firstMatch(text, BUILD_PATTERNS);
  if (build) {
    return {
      action: "investigate",
      category: "build",
      reason: build,
      confidence: "high",
      fingerprint: fingerprintError({ category: "build", ...base }),
    };
  }

  const database = firstMatch(text, DATABASE_PATTERNS);
  if (database) {
    return {
      action: "investigate",
      category: "database",
      reason: database,
      confidence: "high",
      fingerprint: fingerprintError({ category: "database", ...base }),
    };
  }

  const thirdParty = firstMatch(text, THIRD_PARTY_PATTERNS);
  if (thirdParty) {
    return {
      action: "skip",
      category: "third_party",
      reason: thirdParty,
      confidence: "medium",
      fingerprint: fingerprintError({ category: "third_party", ...base }),
    };
  }

  const ai = firstMatch(text, AI_PATTERNS);
  if (ai) {
    return {
      action: "investigate",
      category: "ai",
      reason: ai,
      confidence: "medium",
      fingerprint: fingerprintError({ category: "ai", ...base }),
    };
  }

  const runtime = firstMatch(text, RUNTIME_PATTERNS);
  if (runtime) {
    return {
      action: "investigate",
      category: "runtime",
      reason: runtime,
      confidence: "medium",
      fingerprint: fingerprintError({ category: "runtime", ...base }),
    };
  }

  if (!text) {
    return {
      action: "skip",
      category: "not_a_bug",
      reason: "No error text to diagnose",
      confidence: "high",
      fingerprint: fingerprintError({ category: "not_a_bug", ...base }),
    };
  }

  return {
    action: "investigate",
    category: "runtime",
    reason: "Unrecognized production error — Cursor should inspect logs before deciding",
    confidence: "low",
    fingerprint: fingerprintError({ category: "runtime", ...base }),
  };
}
