import { VOICE_SAMPLE_RATE_HZ } from "@/lib/voice/constants";

/** Inlined AudioWorklet: downsample to 16 kHz LINEAR16 and report RMS for the bars. */
export const PCM_CAPTURE_WORKLET = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / ${VOICE_SAMPLE_RATE_HZ};
    this._offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;
    let sum = 0;
    for (let i = 0; i < channel.length; i++) {
      const s = channel[i];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / channel.length);
    const ratio = this._ratio;
    const outLength = Math.floor((channel.length - this._offset) / ratio);
    if (outLength <= 0) return true;
    const pcm = new Int16Array(outLength);
    let offset = this._offset;
    for (let i = 0; i < outLength; i++) {
      const sample = channel[Math.min(channel.length - 1, Math.floor(offset))];
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      offset += ratio;
    }
    this._offset = offset - channel.length;
    this.port.postMessage({ rms, pcm: pcm.buffer }, [pcm.buffer]);
    return true;
  }
}
registerProcessor("pcm-capture", PcmCaptureProcessor);
`;
