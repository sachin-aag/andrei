import { VOICE_SAMPLE_RATE_HZ } from "@/lib/voice/constants";

const WAV_HEADER_BYTES = 44;

/**
 * Wrap 16-bit little-endian mono PCM as a WAV so Gemini accepts it as audio.
 */
export function pcmS16leMonoToWav(
  pcm: Uint8Array,
  sampleRateHz: number = VOICE_SAMPLE_RATE_HZ
): Uint8Array {
  const dataSize = pcm.byteLength;
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(sampleRateHz * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const wav = new Uint8Array(WAV_HEADER_BYTES + dataSize);
  wav.set(header, 0);
  wav.set(pcm, WAV_HEADER_BYTES);
  return wav;
}
