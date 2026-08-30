import {
  STUB_VOICE_FINAL,
  STUB_VOICE_INTERIM,
} from "@/lib/voice/constants";
import type { VoiceSseEvent } from "@/lib/voice/events";

export async function streamStubVoiceEvents(
  emit: (event: VoiceSseEvent) => void,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
  await wait(80);
  emit({
    type: "transcript",
    text: STUB_VOICE_INTERIM,
    isFinal: false,
    languageCode: "en-US",
  });
  await wait(120);
  emit({
    type: "transcript",
    text: STUB_VOICE_FINAL,
    isFinal: true,
    languageCode: "en-US",
  });
  emit({ type: "done" });
}
