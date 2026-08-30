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
import { POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

describe("POST /api/reports/[reportId]/chat/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTestStubSpeech).mockReturnValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const response = await POST(new Request("http://localhost/transcribe"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 when the report is not accessible", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValueOnce(null);
    const response = await POST(new Request("http://localhost/transcribe"), {
      params: Promise.resolve({ reportId: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("streams the canned stub transcript", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValueOnce({
      report: { id: "report-1" },
      canEdit: true,
    } as never);
    const response = await POST(new Request("http://localhost/transcribe"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain(STUB_VOICE_FINAL);
    expect(body).toContain('"type":"done"');
  });
});
