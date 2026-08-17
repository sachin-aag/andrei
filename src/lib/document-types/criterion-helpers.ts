import type { CriterionStatus } from "@/db/schema";
import type { CriterionDefinition } from "./types";

export function llm(
  key: string,
  label: string,
  description: string,
  dependsOn?: string[]
): CriterionDefinition {
  return { key, label, description, kind: "llm", dependsOn };
}

export function det(
  key: string,
  label: string,
  description: string,
  check: CriterionDefinition["check"],
  dependsOn?: string[]
): CriterionDefinition {
  return { key, label, description, kind: "deterministic", check, dependsOn };
}

export function verdict(
  status: CriterionStatus,
  reasoning: string
): { status: CriterionStatus; reasoning: string } {
  return { status, reasoning };
}
