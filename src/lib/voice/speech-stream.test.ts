import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubSpeech: vi.fn(() => true),
}));

vi.mock("@/lib/gcp/wif-token", () => ({
  getWifConfig: vi.fn(() => ({
    audience: "//iam.googleapis.com/test",
    serviceAccountEmail: "runtime@example.iam.gserviceaccount.com",
  })),
  getWifAccessToken: vi.fn(async () => "ya29.test"),
}));

import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { VOICE_INPUT_MJ_CODES } from "@/lib/customers/packs";
import { STUB_VOICE_FINAL } from "./constants";
import {
  buildVoiceRecognitionConfig,
  parseSpeechResults,
  recognizePcmWindow,
  speechApiHost,
  speechRecognizerName,
  speechRecognizeUrl,
} from "./speech-stream";

describe("speechRecognizerName", () => {
  it("uses the us Chirp 3 recognizer wildcard", () => {
    expect(speechRecognizerName("andrei-493614")).toBe(
      "projects/andrei-493614/locations/us/recognizers/_"
    );
  });
});

describe("speechRecognizeUrl", () => {
  it("posts to the us Speech v2 REST recognize custom method", () => {
    expect(speechApiHost("global")).toBe("speech.googleapis.com");
    expect(speechApiHost("us")).toBe("us-speech.googleapis.com");
    expect(speechRecognizeUrl("andrei-493614")).toBe(
      "https://us-speech.googleapis.com/v2/projects/andrei-493614/locations/us/recognizers/_:recognize"
    );
  });
});

describe("buildVoiceRecognitionConfig", () => {
  it("uses Chirp 3 without translating Hindi or Marathi to English", () => {
    const config = buildVoiceRecognitionConfig(VOICE_INPUT_MJ_CODES);
    expect(config.languageCodes).toEqual(["en-IN", "hi-IN", "mr-IN"]);
    expect(config.model).toBe("chirp_3");
    expect(JSON.stringify(config)).not.toContain("translation");
  });
});

describe("recognizePcmWindow", () => {
  beforeEach(() => {
    vi.mocked(isTestStubSpeech).mockReturnValue(true);
    vi.unstubAllGlobals();
  });

  it("returns the canned stub transcript without opening Chirp", async () => {
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(4),
        languageCodes: ["en-US"],
      })
    ).resolves.toEqual({ text: STUB_VOICE_FINAL, languageCode: "en-US" });
  });

  it("skips Chirp for a short window when not stubbed", async () => {
    vi.mocked(isTestStubSpeech).mockReturnValue(false);
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(10),
        languageCodes: ["en-US"],
      })
    ).resolves.toEqual({ text: "" });
  });

  it("POSTs LINEAR16 PCM to Speech v2 REST recognize", async () => {
    vi.mocked(isTestStubSpeech).mockReturnValue(false);
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "andrei-493614");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              alternatives: [{ transcript: "नमस्कार" }],
              languageCode: "mr-IN",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const pcm = new Uint8Array(8_000);
    await expect(
      recognizePcmWindow({ pcm, languageCodes: VOICE_INPUT_MJ_CODES })
    ).resolves.toEqual({ text: "नमस्कार", languageCode: "mr-IN" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://us-speech.googleapis.com/v2/projects/andrei-493614/locations/us/recognizers/_:recognize"
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer ya29.test",
      "x-goog-user-project": "andrei-493614",
    });
    const body = JSON.parse(String(init.body)) as {
      config: { languageCodes: string[]; model: string };
      configMask: string;
      content: string;
    };
    expect(body.configMask).toBe("*");
    expect(body.config.model).toBe("chirp_3");
    expect(body.config.languageCodes).toEqual(["en-IN", "hi-IN", "mr-IN"]);
    expect(JSON.stringify(body)).not.toContain("translation");
    expect(body.content).toBe(Buffer.from(pcm).toString("base64"));
  });

  it("throws PERMISSION_DENIED from a Speech REST error", async () => {
    vi.mocked(isTestStubSpeech).mockReturnValue(false);
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "andrei-493614");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { status: "PERMISSION_DENIED", message: "Speech API" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(8_000),
        languageCodes: ["en-US"],
      })
    ).rejects.toThrow(/PERMISSION_DENIED: Speech API/);
  });
});

describe("parseSpeechResults", () => {
  it("emits native-script transcripts including Devanagari", () => {
    expect(
      parseSpeechResults([
        {
          alternatives: [{ transcript: "  नमस्कार जग  " }],
          isFinal: true,
          languageCode: "mr-IN",
        },
        {
          alternatives: [{ transcript: "" }],
          isFinal: false,
        },
      ])
    ).toEqual([
      {
        type: "transcript",
        text: "नमस्कार जग",
        isFinal: true,
        languageCode: "mr-IN",
      },
    ]);
  });

  it("treats unary results without isFinal as finals", () => {
    expect(
      parseSpeechResults([
        { alternatives: [{ transcript: "assay" }], languageCode: "en-US" },
      ])
    ).toEqual([
      {
        type: "transcript",
        text: "assay",
        isFinal: true,
        languageCode: "en-US",
      },
    ]);
  });
});
