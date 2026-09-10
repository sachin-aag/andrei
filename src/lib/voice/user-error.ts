/** Short copy for the composer toast — never dump gRPC / plugin internals. */

export function voiceUserErrorMessage(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  if (!raw.trim()) return "Voice input failed. Try again.";
  if (
    /headers\.forEach is not a function|Getting metadata from plugin|UNAUTHENTICATED|unauthenticated|invalid_grant|OIDC token|STS exchange|impersonation failed/i.test(
      raw
    )
  ) {
    return "Could not connect to voice input. Try again.";
  }
  if (/NotAllowedError|PermissionDenied|microphone access/i.test(raw)) {
    return "Microphone access is required for voice input.";
  }
  if (/monthly AI usage limit|monthly voice transcription limit/i.test(raw)) {
    return raw;
  }
  if (
    /RESOURCE_EXHAUSTED|quota|GOOGLE_VERTEX_PROJECT|PERMISSION_DENIED/i.test(
      raw
    )
  ) {
    return "Voice input is unavailable right now. Try again in a moment.";
  }
  if (raw.length > 140 || /\bUNKNOWN:|\bgrpc\b/i.test(raw)) {
    return "Voice input failed. Try again.";
  }
  return raw;
}
