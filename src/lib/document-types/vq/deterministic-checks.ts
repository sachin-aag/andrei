import type { EvaluationContext } from "../types";
import { fieldsForSection, vqFieldAnswerIds } from "./schema";
import { parseVqChoice, type VqSectionContent } from "./sections";

function asVq(content: unknown): VqSectionContent {
  if (!content || typeof content !== "object") {
    return { answers: {} };
  }
  const o = content as { answers?: unknown };
  const answers =
    o.answers && typeof o.answers === "object" && !Array.isArray(o.answers)
      ? (o.answers as Record<string, string>)
      : {};
  return { answers };
}

function filled(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function checkCoverIdentity(ctx: EvaluationContext) {
  const { answers } = asVq(ctx.content);
  const manufacturer = filled(answers.cover_manufacturer);
  const material = filled(answers.cover_material);
  if (manufacturer && material) {
    return {
      status: "met" as const,
      reasoning: "Cover names the manufacturer and the material.",
    };
  }
  return {
    status: "not_met" as const,
    reasoning:
      "Cover must name both the manufacturer and the material before this qualification can be issued.",
  };
}

export function checkScoringGrade(ctx: EvaluationContext) {
  const { answers } = asVq(ctx.content);
  const selected = (
    ["score_excellent", "score_good", "score_fair", "score_poor"] as const
  ).filter((key) => parseVqChoice(answers[key]) === "yes");
  if (selected.length === 1) {
    return {
      status: "met" as const,
      reasoning: `Questionnaire scoring is recorded (${selected[0].replace("score_", "")}).`,
    };
  }
  if (selected.length > 1) {
    return {
      status: "partially_met" as const,
      reasoning: "More than one score band is selected. Choose a single band.",
    };
  }
  return {
    status: "not_met" as const,
    reasoning: "Select Excellent, Good, Fair, or Poor after the questionnaire is complete.",
  };
}

export function checkSectionHasResponses(ctx: EvaluationContext) {
  const { answers } = asVq(ctx.content);
  const fields = fieldsForSection(ctx.section);
  const answered =
    fields.length > 0
      ? fields
          .flatMap(vqFieldAnswerIds)
          .some((id) => filled(answers[id]))
      : Object.values(answers).some((value) => filled(value));
  const narrative = (ctx.content as { narrative?: unknown } | null)?.narrative;
  const hasNarrative =
    narrative != null &&
    JSON.stringify(narrative).replace(/\s+/g, "").length > 80;
  if (answered || hasNarrative) {
    return {
      status: "met" as const,
      reasoning: "This section has at least one response or a comments narrative.",
    };
  }
  return {
    status: "not_met" as const,
    reasoning: "No answers or comments are recorded in this section.",
  };
}
