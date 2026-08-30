/** SSE payloads on POST /api/reports/[reportId]/chat/transcribe. */

export type VoiceTranscriptEvent = {
  type: "transcript";
  text: string;
  isFinal: boolean;
  languageCode?: string;
};

export type VoiceErrorEvent = {
  type: "error";
  message: string;
};

export type VoiceDoneEvent = {
  type: "done";
};

export type VoiceSseEvent =
  | VoiceTranscriptEvent
  | VoiceErrorEvent
  | VoiceDoneEvent;

export function encodeVoiceSse(event: VoiceSseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseVoiceSseData(data: string): VoiceSseEvent | null {
  const trimmed = data.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as VoiceSseEvent;
    if (
      parsed.type === "transcript" &&
      typeof parsed.text === "string" &&
      typeof parsed.isFinal === "boolean"
    ) {
      return parsed;
    }
    if (parsed.type === "error" && typeof parsed.message === "string") {
      return parsed;
    }
    if (parsed.type === "done") return parsed;
    return null;
  } catch {
    return null;
  }
}
