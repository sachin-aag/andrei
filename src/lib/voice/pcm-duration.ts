import { VOICE_SAMPLE_RATE_HZ } from "@/lib/voice/constants";

/** 16-bit mono PCM: two bytes per sample. */
export const VOICE_BYTES_PER_SECOND = VOICE_SAMPLE_RATE_HZ * 2;

export const SECONDS_PER_MINUTE = 60;

/** Whole seconds billed for a LINEAR16 window (ceil; empty clips are 0). */
export function pcmAudioSeconds(pcm: Uint8Array): number {
  if (pcm.byteLength <= 0) return 0;
  return Math.ceil(pcm.byteLength / VOICE_BYTES_PER_SECOND);
}

export function minutesFromSeconds(audioSeconds: number): number {
  return Math.round((audioSeconds / SECONDS_PER_MINUTE) * 10) / 10;
}

export function secondsFromMinutes(minutes: number): number {
  return minutes * SECONDS_PER_MINUTE;
}
