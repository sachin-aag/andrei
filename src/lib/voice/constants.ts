/** LINEAR16 PCM the AudioWorklet downsamples to before posting. */
export const VOICE_SAMPLE_RATE_HZ = 16_000;

export const VOICE_PCM_MIME = "application/octet-stream";

/** Click-to-stop is the product rule; still cap so STT / Vercel duration cannot hang. */
export const VOICE_MAX_DURATION_MS = 240_000;

export const VOICE_STT_MODEL = "chirp_3";

export const VOICE_STT_LOCATION = "global";

export const STUB_VOICE_INTERIM = "Checking the assay results";
export const STUB_VOICE_FINAL = "Checking the assay results from the last batch.";

/** How often the composer POSTs the current PCM window (one request = one Chirp call). */
export const VOICE_FLUSH_MS = 650;

/** Skip Chirp for less than 200 ms of 16 kHz s16le audio. */
export const VOICE_MIN_WINDOW_BYTES = 16_000 * 2 * 0.2;

/** Roll the window so a POST stays under typical Vercel body limits. */
export const VOICE_MAX_WINDOW_BYTES = 16_000 * 2 * 10;

export const VOICE_RECOGNIZE_TIMEOUT_MS = 20_000;
