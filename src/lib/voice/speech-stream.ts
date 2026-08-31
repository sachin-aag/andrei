import { GoogleAuth } from "google-auth-library";
import { getWifAccessToken, getWifConfig } from "@/lib/gcp/wif-token";
import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import {
  STUB_VOICE_FINAL,
  VOICE_MIN_WINDOW_BYTES,
  VOICE_RECOGNIZE_TIMEOUT_MS,
  VOICE_SAMPLE_RATE_HZ,
  VOICE_STT_LOCATION,
  VOICE_STT_MODEL,
} from "@/lib/voice/constants";

export type VoiceTranscriptEvent = {
  type: "transcript";
  text: string;
  isFinal: boolean;
  languageCode?: string;
};

export type VoiceRecognizeResult = {
  text: string;
  languageCode?: string;
};

type SpeechErrorPayload = {
  error?: { message?: string; status?: string };
};

type SpeechRecognizePayload = {
  results?: Array<{
    alternatives?: Array<{ transcript?: string | null } | null> | null;
    languageCode?: string | null;
  }>;
  error?: SpeechErrorPayload["error"];
};

function speechProjectId(): string {
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT is required for voice dictation. Set it or use ALLOW_TEST_STUB_SPEECH."
    );
  }
  return project;
}

export function speechRecognizerName(
  projectId: string = speechProjectId()
): string {
  return `projects/${projectId}/locations/${VOICE_STT_LOCATION}/recognizers/_`;
}

export function speechApiHost(
  location: string = VOICE_STT_LOCATION
): string {
  return location === "global"
    ? "speech.googleapis.com"
    : `${location}-speech.googleapis.com`;
}

export function speechRecognizeUrl(projectId: string = speechProjectId()): string {
  return `https://${speechApiHost()}/v2/${speechRecognizerName(projectId)}:recognize`;
}

function speechRecognizeErrorMessage(
  payload: SpeechRecognizePayload,
  status: number
): string {
  const code = payload.error?.status?.trim();
  const message = payload.error?.message?.trim();
  if (code && message) return `${code}: ${message}`;
  if (code) return code;
  if (message) return message;
  return `Speech recognize failed (${status})`;
}

/**
 * Chirp 3 unary config. Do not add translationConfig — Hindi/Marathi stay in
 * native script (Devanagari). Gemini understands that; only the assistant
 * reply is English (chat prompt Language rule).
 */
export function buildVoiceRecognitionConfig(languageCodes: readonly string[]) {
  return {
    explicitDecodingConfig: {
      encoding: "LINEAR16" as const,
      sampleRateHertz: VOICE_SAMPLE_RATE_HZ,
      audioChannelCount: 1,
    },
    languageCodes: [...languageCodes],
    model: VOICE_STT_MODEL,
    features: {
      enableAutomaticPunctuation: true,
    },
  };
}

export function parseSpeechResults(
  results: Array<{
    alternatives?: Array<{ transcript?: string | null } | null> | null;
    isFinal?: boolean | null;
    languageCode?: string | null;
  }> | null | undefined
): VoiceTranscriptEvent[] {
  if (!results?.length) return [];
  const events: VoiceTranscriptEvent[] = [];
  for (const result of results) {
    const text = result.alternatives?.[0]?.transcript?.trim();
    if (!text) continue;
    events.push({
      type: "transcript",
      text,
      isFinal: result.isFinal == null ? true : Boolean(result.isFinal),
      languageCode: result.languageCode?.trim() || undefined,
    });
  }
  return events;
}

async function speechAccessToken(): Promise<string> {
  const wif = getWifConfig();
  if (wif) return getWifAccessToken(wif);

  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error(
      "No Google access token for Speech-to-Text. Run `gcloud auth application-default login` or set WIF."
    );
  }
  return token.token;
}

/**
 * One Chirp 3 unary recognize over HTTPS. Do not use the Speech gRPC stream
 * on Vercel Fluid — grpc-js never shows up as an outbound HTTP call and
 * fails in ~150ms with a 502.
 */
export async function recognizePcmWindow(opts: {
  pcm: Uint8Array;
  languageCodes: readonly string[];
}): Promise<VoiceRecognizeResult> {
  if (isTestStubSpeech()) {
    return { text: STUB_VOICE_FINAL, languageCode: "en-US" };
  }
  if (opts.pcm.byteLength < VOICE_MIN_WINDOW_BYTES) {
    return { text: "" };
  }

  const token = await speechAccessToken();
  const projectId = speechProjectId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_RECOGNIZE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(speechRecognizeUrl(projectId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify({
        config: buildVoiceRecognitionConfig(opts.languageCodes),
        configMask: "*",
        content: Buffer.from(
          opts.pcm.buffer,
          opts.pcm.byteOffset,
          opts.pcm.byteLength
        ).toString("base64"),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Voice input timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => ({}))) as SpeechRecognizePayload;
  if (!response.ok) {
    throw new Error(speechRecognizeErrorMessage(payload, response.status));
  }

  const events = parseSpeechResults(payload.results);
  const text = events
    .map((event) => event.text)
    .join(" ")
    .trim();
  return {
    text,
    languageCode: events.find((event) => event.languageCode)?.languageCode,
  };
}
