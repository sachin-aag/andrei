/** LINEAR16 PCM the AudioWorklet downsamples to before streaming. */
export const VOICE_SAMPLE_RATE_HZ = 16_000;

/** Click-to-stop is the product rule; still cap so STT / Vercel duration cannot hang. */
export const VOICE_MAX_DURATION_MS = 240_000;

export const VOICE_STT_MODEL = "chirp_3";

export const VOICE_STT_LOCATION = "global";

export const STUB_VOICE_INTERIM = "Checking the assay results";
export const STUB_VOICE_FINAL = "Checking the assay results from the last batch.";
