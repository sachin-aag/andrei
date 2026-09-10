/** LINEAR16 PCM the AudioWorklet downsamples to before posting. */
export const VOICE_SAMPLE_RATE_HZ = 16_000;

export const VOICE_PCM_MIME = "application/octet-stream";

/** Click-to-stop is the product rule; still cap so STT / Vercel duration cannot hang. */
export const VOICE_MAX_DURATION_MS = 240_000;

/**
 * Same Flash-Lite as page extract. Uses the chat/Vertex Gemini resolver —
 * not Cloud Speech-to-Text. The WIF runtime SA already has Vertex; it does
 * not have `roles/speech.client`, so Chirp 403s as PERMISSION_DENIED.
 */
export const VOICE_TRANSCRIBE_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

export const STUB_VOICE_FINAL = "Checking the assay results from the last batch.";

/** Skip STT for less than 200 ms of 16 kHz s16le audio. */
export const VOICE_MIN_WINDOW_BYTES = 16_000 * 2 * 0.2;

/**
 * Max PCM bytes per POST at stop. 30s of 16 kHz s16le stays well under
 * typical Vercel body limits; longer recordings are sequential chunks.
 */
export const VOICE_TRANSCRIBE_CHUNK_BYTES = 16_000 * 2 * 30;

export const VOICE_RECOGNIZE_TIMEOUT_MS = 20_000;
