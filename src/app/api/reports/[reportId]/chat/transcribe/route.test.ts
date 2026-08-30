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
  openSpeechRecognizeStream: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { STUB_VOICE_FINAL } from "@/lib/voice/constants";
import { voiceSessions } from "@/lib/voice/sessions";
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
    voiceSessions.clear();
    vi.mocked(isTestStubSpeech).mockReturnValue(true);
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
  });

  it("POST start returns a session, GET streams the canned stub transcript", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    const started = await POST(
      jsonRequest("http://localhost/transcribe", { action: "start" }),
      params
    );
    expect(started.status).toBe(200);
    const { sessionId } = (await started.json()) as { sessionId: string };
    expect(sessionId).toBeTruthy();

    const sse = await GET(
      new Request(`http://localhost/transcribe?session=${sessionId}`),
      params
    );
    expect(sse.status).toBe(200);
    expect(sse.headers.get("Content-Type")).toContain("text/event-stream");
    const body = await sse.text();
    expect(body).toContain(STUB_VOICE_FINAL);
    expect(body).toContain('"type":"done"');
  });

  it("POST audio and stop return 204 for a live session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    const started = await POST(
      jsonRequest("http://localhost/transcribe", { action: "start" }),
      params
    );
    const { sessionId } = (await started.json()) as { sessionId: string };

    const audio = await POST(
      new Request("http://localhost/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-voice-session": sessionId,
        },
        body: new Uint8Array([0, 0, 1, 0]),
      }),
      params
    );
    expect(audio.status).toBe(204);

    const stopped = await POST(
      jsonRequest("http://localhost/transcribe", { action: "stop", sessionId }),
      params
    );
    expect(stopped.status).toBe(204);
  });
});
