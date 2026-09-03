import {
  PROOFREAD_MAX_REQUESTS_PER_HOUR,
  PROOFREAD_MAX_REQUESTS_PER_MINUTE,
} from "@/lib/ai/proofread/prompts";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const hitsByUser = new Map<string, number[]>();

export function takeProofreadRateSlot(
  userId: string,
  now = Date.now()
): boolean {
  const prev = hitsByUser.get(userId) ?? [];
  const recent = prev.filter((t) => now - t < HOUR_MS);
  const lastMinute = recent.filter((t) => now - t < MINUTE_MS);
  if (lastMinute.length >= PROOFREAD_MAX_REQUESTS_PER_MINUTE) {
    hitsByUser.set(userId, recent);
    return false;
  }
  if (recent.length >= PROOFREAD_MAX_REQUESTS_PER_HOUR) {
    hitsByUser.set(userId, recent);
    return false;
  }
  recent.push(now);
  hitsByUser.set(userId, recent);
  return true;
}

export function resetProofreadRateLimitForTests(): void {
  hitsByUser.clear();
}
