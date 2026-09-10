/** Payload-only resolution reason (D-A3). No new commentStatusEnum value. */

export function withResolutionReason(
  content: string,
  reason: string
): string {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({
        ...(parsed as Record<string, unknown>),
        resolutionReason: reason,
      });
    }
  } catch {
    // plain content
  }
  return JSON.stringify({ text: content, resolutionReason: reason });
}

export function readResolutionReason(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { resolutionReason?: unknown };
    return typeof parsed.resolutionReason === "string"
      ? parsed.resolutionReason
      : null;
  } catch {
    return null;
  }
}
