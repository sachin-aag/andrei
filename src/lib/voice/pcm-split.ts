import {
  VOICE_MIN_WINDOW_BYTES,
  VOICE_TRANSCRIBE_CHUNK_BYTES,
} from "@/lib/voice/constants";

/** Slice LINEAR16 PCM into POSTs that stay under the transcribe body cap. */
export function splitPcmWindows(
  pcm: Uint8Array,
  maxBytes: number = VOICE_TRANSCRIBE_CHUNK_BYTES
): Uint8Array[] {
  if (pcm.byteLength === 0) return [];
  const cap = Math.max(maxBytes, VOICE_MIN_WINDOW_BYTES);
  if (pcm.byteLength <= cap) return [pcm];
  const parts: Uint8Array[] = [];
  let offset = 0;
  while (offset < pcm.byteLength) {
    const remaining = pcm.byteLength - offset;
    const size = remaining <= cap ? remaining : cap;
    parts.push(pcm.subarray(offset, offset + size));
    offset += size;
  }
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (last && prev && last.byteLength < VOICE_MIN_WINDOW_BYTES) {
    const merged = new Uint8Array(prev.byteLength + last.byteLength);
    merged.set(prev);
    merged.set(last, prev.byteLength);
    parts.splice(parts.length - 2, 2, merged);
  }
  return parts;
}
