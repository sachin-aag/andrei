import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/ai/chat/access", () => ({
  loadAccessibleReport: vi.fn(),
}));

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubSpeech: vi.fn(() => true),
}));

vi.mock("@/lib/voice/speech-stream", () => ({
  recognizePcmWindow: vi.fn(async () => ({
    text: "Checking the assay results from the last batch.",
    languageCode: "en-US",
  })),
}));

vi.mock("@/lib/voice/budget", () => ({
  assertVoiceBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  isVoiceBudgetExceededError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "voice_budget_exceeded"
    ),
  voiceBudgetExceededResponse: (error: { message: string }) =>
    new Response(JSON.stringify({ error: error.message, code: "voice_budget_exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  isAiBudgetExceededError: () => false,
  aiBudgetExceededResponse: () =>
    new Response(JSON.stringify({ error: "AI budget" }), { status: 429 }),
}));

vi.mock("@/lib/customers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers")>();
  return {
    ...actual,
    voiceInputLanguageCodes: vi.fn(() => ["en-IN", "hi-IN", "mr-IN"]),
  };
});

import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { STUB_VOICE_FINAL } from "@/lib/voice/constants";
import { VoiceBudgetExceededError } from "@/lib/voice/budget/errors";
import { assertVoiceBudgetAvailable } from "@/lib/voice/budget";
import { recognizePcmWindow } from "@/lib/voice/speech-stream";
import { GET, POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const params = { params: Promise.resolve({ reportId: "report-1" }) };

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/reports/[reportId]/chat/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recognizePcmWindow).mockResolvedValue({
      text: STUB_VOICE_FINAL,
      languageCode: "en-US",
    });
    vi.mocked(assertVoiceBudgetAvailable).mockResolvedValue(undefined);
  });

  it("POST returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const response = await POST(jsonRequest("http://localhost/transcribe", { action: "start" }), {
      params: Promise.resolve({ reportId: "report-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("GET returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost/transcribe"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("POST returns 404 when the report is not accessible", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValueOnce(null);
    const response = await POST(jsonRequest("http://localhost/transcribe", { action: "start" }), {
      params: Promise.resolve({ reportId: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("GET returns 204 when the report is accessible", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValueOnce({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    const response = await GET(new Request("http://localhost/transcribe"), params);
    expect(response.status).toBe(204);
    expect(assertVoiceBudgetAvailable).toHaveBeenCalledWith({ audioSeconds: 1 });
  });

  it("GET returns 429 when the voice budget is exhausted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValueOnce({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    vi.mocked(assertVoiceBudgetAvailable).mockRejectedValueOnce(
      new VoiceBudgetExceededError(100_000, 6_000_000, 1)
    );
    const response = await GET(new Request("http://localhost/transcribe"), params);
    expect(response.status).toBe(429);
    const payload = (await response.json()) as { error: string; code: string };
    expect(payload.code).toBe("voice_budget_exceeded");
    expect(payload.error).toMatch(/voice transcription limit/i);
  });

  it("POST audio returns a transcript without a sticky session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    const audio = await POST(
      new Request("http://localhost/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-voice-languages": "en-US",
        },
        body: new Uint8Array(8_000),
      }),
      params
    );
    expect(audio.status).toBe(200);
    await expect(audio.json()).resolves.toEqual({
      text: STUB_VOICE_FINAL,
      languageCode: "en-US",
    });
    expect(recognizePcmWindow).toHaveBeenCalledOnce();
  });

  it("POST json is a no-op warmup", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    const response = await POST(
      jsonRequest("http://localhost/transcribe", { action: "start" }),
      params
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("POST audio returns 429 when the voice budget is exhausted", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    vi.mocked(recognizePcmWindow).mockRejectedValueOnce(
      new VoiceBudgetExceededError(100_000, 6_000_000, 30)
    );
    const response = await POST(
      new Request("http://localhost/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(8_000),
      }),
      params
    );
    expect(response.status).toBe(429);
    const payload = (await response.json()) as { error: string; code: string };
    expect(payload.code).toBe("voice_budget_exceeded");
  });

  it("POST audio returns 502 when recognition fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    vi.mocked(recognizePcmWindow).mockRejectedValueOnce(
      new Error("2 UNKNOWN: Getting metadata from plugin failed")
    );
    const response = await POST(
      new Request("http://localhost/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(8_000),
      }),
      params
    );
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).not.toMatch(/UNKNOWN|metadata/i);
  });

  it("forwards x-voice-languages to recognizePcmWindow", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    await POST(
      new Request("http://localhost/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-voice-languages": "hi-IN",
        },
        body: new Uint8Array(8_000),
      }),
      params
    );
    expect(recognizePcmWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        languageCodes: ["hi-IN"],
        reportId: "report-1",
        userId: "engineer-1",
      })
    );
  });
});
