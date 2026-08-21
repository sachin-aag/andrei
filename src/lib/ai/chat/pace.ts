/**
 * How hard the orchestrator works on a turn. The composer surfaces these as
 * "Quick" and "Deep" — the model behind each is deliberately never shown.
 *
 * Kept out of `model.ts` so the client composer can import the union without
 * dragging the Vertex / gateway providers into the browser bundle.
 */
export const CHAT_PACES = ["quick", "deep"] as const;
export type ChatPace = (typeof CHAT_PACES)[number];

/** Most turns are lookups and short questions, so Quick is the default. */
export const DEFAULT_CHAT_PACE: ChatPace = "quick";

export function isChatPace(value: unknown): value is ChatPace {
  return value === "quick" || value === "deep";
}
