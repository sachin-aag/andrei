/**
 * Apply a finished dictation to the composer.
 *
 * Prefix is the typed text captured when recording started. The live
 * recorder applies once at stop (`isFinal: true`); interim remains for tests.
 */

export type VoiceTranscriptState = {
  prefix: string;
  committed: string;
  interim: string;
};

export function createVoiceTranscriptState(prefix: string): VoiceTranscriptState {
  return { prefix, committed: "", interim: "" };
}

export function applyVoiceTranscript(
  state: VoiceTranscriptState,
  text: string,
  isFinal: boolean
): VoiceTranscriptState {
  const next = text.trim();
  if (isFinal) {
    return {
      prefix: state.prefix,
      committed: joinUtterance(state.committed, next),
      interim: "",
    };
  }
  return { ...state, interim: next };
}

export function voiceComposerValue(state: VoiceTranscriptState): string {
  return joinUtterance(state.prefix, joinUtterance(state.committed, state.interim));
}

export function joinUtterance(left: string, right: string): string {
  const next = right.trim();
  if (!next) return left;
  if (!left.trim()) {
    return left.length > 0 && /^\s/.test(left) ? `${left.trimStart()}${next}` : next;
  }
  if (/\s$/.test(left)) return `${left}${next}`;
  return `${left.trimEnd()} ${next}`;
}
