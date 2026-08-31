import { v2 } from "@google-cloud/speech";
import { createWifAuthClient, getWifConfig } from "@/lib/gcp/wif-token";
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

type SpeechClient = InstanceType<typeof v2.SpeechClient>;

export type SpeechStream = {
  writeAudio: (chunk: Uint8Array) => void;
  end: () => void;
};

export type VoiceRecognizeResult = {
  text: string;
  languageCode?: string;
};

let cachedSpeechClient: SpeechClient | null = null;

function speechProjectId(): string {
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT is required for voice dictation. Set it or use ALLOW_TEST_STUB_SPEECH."
    );
  }
  return project;
}

export function speechRecognizerName(projectId: string = speechProjectId()): string {
  return `projects/${projectId}/locations/${VOICE_STT_LOCATION}/recognizers/_`;
}

export function createSpeechClient(): SpeechClient {
  if (cachedSpeechClient) return cachedSpeechClient;
  const wif = getWifConfig();
  cachedSpeechClient = new v2.SpeechClient({
    apiEndpoint: "speech.googleapis.com",
    projectId: speechProjectId(),
    ...(wif
      ? { authClient: createWifAuthClient(wif) as never }
      : {}),
  });
  return cachedSpeechClient;
}

/**
 * Chirp 3 streaming config. Do not add translationConfig — Hindi/Marathi
 * stay in native script (Devanagari). Gemini understands that; only the
 * assistant reply is English (chat prompt Language rule).
 */
export function buildVoiceStreamingConfig(languageCodes: readonly string[]) {
  return {
    config: {
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
    },
    streamingFeatures: {
      interimResults: true,
      enableVoiceActivityEvents: false,
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
      isFinal: Boolean(result.isFinal),
      languageCode: result.languageCode?.trim() || undefined,
    });
  }
  return events;
}

export function openSpeechRecognizeStream(opts: {
  languageCodes: readonly string[];
  onTranscript: (event: VoiceTranscriptEvent) => void;
  onError: (error: Error) => void;
  onEnd: () => void;
}): SpeechStream {
  const client = createSpeechClient();
  const stream = client._streamingRecognize();
  let closed = false;

  const finish = (error?: Error) => {
    if (closed) return;
    closed = true;
    if (error) opts.onError(error);
    else opts.onEnd();
  };

  stream.on("data", (response: {
    results?: Array<{
      alternatives?: Array<{ transcript?: string | null } | null> | null;
      isFinal?: boolean | null;
      languageCode?: string | null;
    }> | null;
  }) => {
    for (const event of parseSpeechResults(response.results)) {
      opts.onTranscript(event);
    }
  });
  stream.on("error", (error: Error) => finish(error));
  stream.on("end", () => finish());

  stream.write({
    recognizer: speechRecognizerName(),
    streamingConfig: buildVoiceStreamingConfig(opts.languageCodes),
  });

  return {
    writeAudio(chunk) {
      if (closed || chunk.byteLength === 0) return;
      stream.write({ audio: Buffer.from(chunk) });
    },
    end() {
      stream.end();
    },
  };
}

/**
 * One Chirp 3 turn in this request. Vercel Fluid does not pin POSTs to the
 * isolate that handled `start`, so a long-lived in-memory stream 404s.
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

  return new Promise((resolve, reject) => {
    const finals: string[] = [];
    let interim = "";
    let languageCode: string | undefined;
    let settled = false;
    let stream: SpeechStream | null = null;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        stream?.end();
      } catch {
        /* already ended */
      }
      if (error) {
        reject(error);
        return;
      }
      const text = (finals.join(" ").trim() || interim).trim();
      resolve({ text, languageCode });
    };

    const timer = setTimeout(() => {
      finish(new Error("Voice input timed out."));
    }, VOICE_RECOGNIZE_TIMEOUT_MS);

    stream = openSpeechRecognizeStream({
      languageCodes: opts.languageCodes,
      onTranscript: (event) => {
        languageCode = event.languageCode ?? languageCode;
        if (event.isFinal) finals.push(event.text);
        else interim = event.text;
      },
      onError: (error) => finish(error),
      onEnd: () => finish(),
    });
    stream.writeAudio(opts.pcm);
    stream.end();
  });
}
