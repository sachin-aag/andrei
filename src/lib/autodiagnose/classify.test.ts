import { describe, expect, it } from "vitest";
import { classifyVercelError, isPreviewEnvironment, isProductionEnvironment } from "./classify";
import type { VercelErrorEvent } from "./types";

/** Production Vercel runtime log — does not fail a deploy. */
const CHAT_INVALID_TOOL_INPUT_LOG = `chat: assistant stream error {
  reportId: 'i5hpsr8nwcmyp1dxn48dm97h',
  sessionId: 'ld5cpa7x16o1sa4tqdractiu',
  error: 'AI_InvalidToolInputError: Invalid input for tool search_documents: Type validation failed: Value: {"limit":20,"queries":["\\"M3-HRS-GN-001\\"","\\"M3-HRS-PS-003\\" OR \\"M3-HRS-PS-014\\""],"mode":"keyword"}.\\n' +
    'Error message: [\\n' +
    '  {\\n' +
    '    "origin": "array",\\n' +
    '    "code": "too_big",\\n' +
    '    "maximum": 4,\\n' +
    '    "path": ["queries"],\\n' +
    '    "message": "Too big: expected array to have <=4 items"\\n' +
    '  }\\n' +
    ']'
}`;

function event(overrides: Partial<VercelErrorEvent> = {}): VercelErrorEvent {
  return {
    source: "deployment_status",
    environment: "Production",
    projectName: "andrei-v2",
    deploymentUrl: "https://andrei-v2.vercel.app",
    logUrl: "https://vercel.com/logs",
    sha: "abc1234",
    ref: "main",
    text: "Type error: src/lib/foo.ts(12,1): error TS2322",
    ...overrides,
  };
}

describe("classifyVercelError", () => {
  it("skips canceled deployments", () => {
    const result = classifyVercelError(
      event({ text: "Deployment was canceled because a newer deployment is in progress" })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("not_a_bug");
  });

  it("skips Neon leftover preview passwords", () => {
    const result = classifyVercelError(
      event({
        environment: "Preview",
        text: "28P01 password authentication failed for user 'neondb_owner'",
      })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("infra_config");
    expect(result.reason).toMatch(/28P01/);
  });

  it("skips missing DATABASE_URL as infra", () => {
    const result = classifyVercelError(
      event({ text: "Error: DATABASE_URL is not set" })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("infra_config");
  });

  it("skips Gemini quota / 429 as third-party", () => {
    const result = classifyVercelError(
      event({
        text: "generativelanguage.googleapis.com returned 429 rate limit",
      })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("third_party");
  });

  it("investigates TypeScript build failures", () => {
    const result = classifyVercelError(event());
    expect(result.action).toBe("investigate");
    expect(result.category).toBe("build");
    expect(result.fingerprint).toMatch(/^[a-f0-9]{12}$/);
  });

  it("investigates SQL schema bugs rather than treating them as infra", () => {
    const result = classifyVercelError(
      event({ text: "error: column \"document_type\" does not exist" })
    );
    expect(result.action).toBe("investigate");
    expect(result.category).toBe("database");
  });

  it("investigates function crashes", () => {
    const result = classifyVercelError(
      event({
        text: "FUNCTION_INVOCATION_FAILED TypeError: Cannot read properties of undefined (reading 'id')",
      })
    );
    expect(result.action).toBe("investigate");
    expect(result.category).toBe("runtime");
  });

  it("skips preview TypeScript failures so feature branches are not PR'd onto main", () => {
    const result = classifyVercelError(
      event({
        environment: "Preview — andrei-demo",
        text: "Type error: src/lib/foo.ts(12,1): error TS2322",
      })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("not_a_bug");
  });

  it("skips unrecognized preview failures so we do not PR feature branches onto main", () => {
    const result = classifyVercelError(
      event({
        environment: "Preview — andrei-demo",
        text: "Something vague went wrong on preview",
      })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("not_a_bug");
  });

  it("investigates unrecognized production errors at low confidence", () => {
    const result = classifyVercelError(
      event({ text: "Mysterious production blow-up in the report workspace" })
    );
    expect(result.action).toBe("investigate");
    expect(result.confidence).toBe("low");
  });

  it("investigates chat InvalidToolInputError as a high-confidence AI bug", () => {
    const result = classifyVercelError(
      event({
        source: "runtime",
        text: CHAT_INVALID_TOOL_INPUT_LOG,
      })
    );
    expect(result.action).toBe("investigate");
    expect(result.category).toBe("ai");
    expect(result.confidence).toBe("high");
    expect(result.reason).toMatch(/tool input failed schema validation/i);
  });

  it("investigates analytics-chat stream errors as AI", () => {
    const result = classifyVercelError(
      event({
        source: "runtime",
        text: "analytics-chat: assistant stream error { error: 'boom' }",
      })
    );
    expect(result.action).toBe("investigate");
    expect(result.category).toBe("ai");
    expect(result.confidence).toBe("high");
  });

  it("still skips Gemini 429 even when it arrives as a chat stream error", () => {
    const result = classifyVercelError(
      event({
        source: "runtime",
        text: "chat: assistant stream error generativelanguage.googleapis.com returned 429 rate limit",
      })
    );
    expect(result.action).toBe("skip");
    expect(result.category).toBe("third_party");
  });

  it("fingerprints the same chat schema error across report and session ids", () => {
    const a = classifyVercelError(
      event({ source: "runtime", text: CHAT_INVALID_TOOL_INPUT_LOG })
    );
    const b = classifyVercelError(
      event({
        source: "runtime",
        text: CHAT_INVALID_TOOL_INPUT_LOG.replace(
          "i5hpsr8nwcmyp1dxn48dm97h",
          "zzzzzzzzzzzzzzzzzzzzzzzzz"
        ).replace("ld5cpa7x16o1sa4tqdractiu", "yyyyyyyyyyyyyyyyyyyyyyyyy"),
      })
    );
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("fingerprints ignore volatile ids", () => {
    const a = classifyVercelError(
      event({
        text: "Type error: src/lib/foo.ts dpl_abc123 https://andrei-v2-aaa.vercel.app 1111111",
      })
    );
    const b = classifyVercelError(
      event({
        text: "Type error: src/lib/foo.ts dpl_zzz999 https://andrei-v2-bbb.vercel.app ffffff1",
      })
    );
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe("isProductionEnvironment", () => {
  it("matches Production and rejects Preview", () => {
    expect(isProductionEnvironment("Production")).toBe(true);
    expect(isProductionEnvironment("andrei-v2 - Production")).toBe(true);
    expect(isProductionEnvironment("Preview")).toBe(false);
    expect(isProductionEnvironment("Preview — andrei-demo")).toBe(false);
    expect(isProductionEnvironment(null)).toBe(false);
    expect(isPreviewEnvironment("Preview — andrei-demo")).toBe(true);
    expect(isPreviewEnvironment("staging")).toBe(true);
    expect(isPreviewEnvironment("Production")).toBe(false);
  });
});
