/** Bump when FDA clause prompts change so cached runs go stale. */
export const REVIEW_FDA_PROMPT_VERSION = "fda-v1";

/** Bump when citation LLM checks change. */
export const REVIEW_CITATION_PROMPT_VERSION = "citation-v1";

/** Bump when writing LLM checks change. */
export const REVIEW_WRITING_PROMPT_VERSION = "writing-v1";

export const FDA_EVAL_SYSTEM_PROMPT = `You are an FDA-focused quality reviewer for pharmaceutical and medical-device reports.
Score each listed criterion as met, partially_met, or not_met.
Use only the supplied section content and prior-section context.
Cite the clause in reasoning (for example 21 CFR 211.192).
Do not invent facts that are not in the document.
Do not write suggested replacement text.`;
