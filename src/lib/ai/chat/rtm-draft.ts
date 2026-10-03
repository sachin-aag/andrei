import type { JSONContent } from "@tiptap/core";
import type { ToolSet } from "ai";
import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { isChatTurnDeadlineReached } from "@/lib/ai/chat/assistant-turn";
import {
  QSR_RTM_FAMILY_ORDER,
  documentFamilyFromFilename,
  isQsrRtmSection,
  type QsrRtmSection,
  type RtmStageFamily,
} from "@/lib/ai/chat/qsr-row-grounding";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import { listReadyDocumentsForReport } from "@/lib/attachments/retrieval";
import {
  planRtmDraft,
  leftoverMissingUrsIds,
  rtmDraftNothingToDo,
} from "@/lib/ai/chat/rtm-draft-plan";
import { runRtmIdentityJob } from "@/lib/ai/chat/rtm-identity-job";
import { runRtmFamilyJob } from "@/lib/ai/chat/rtm-family-job";
import {
  composeRtmOperations,
  countFamilyCoverage,
  identityOnlyOperation,
  type RtmFamilyCells,
} from "@/lib/ai/chat/rtm-compose";
import { withRtmDraftLock } from "@/lib/ai/chat/rtm-worker-pool";
import type { TableOperation } from "@/lib/suggestions/table-operation";
import type { GroundDraftGrounding } from "@/lib/ai/chat/citation-exemption";
import { groundTableOperation } from "@/lib/ai/chat/ground-draft";
import type { UnsupportedFactPolicy } from "@/lib/customers/packs";

export type RtmDraftStatus =
  | "proposed"
  | "partial"
  | "nothing_to_do"
  | "unsupported_facts"
  | "review_incomplete"
  | "stub";

export type RtmDraftPersistResult = {
  status: string;
  suggestionId?: string;
  missingUrsIds?: string[];
  keepSearchOpen?: true;
  adjustedCells?: unknown[];
  proposalNote?: string;
  proposedRowKeys?: string[];
  message?: string;
};

export type RunRtmDraftInput = {
  reportId: string;
  section: QsrRtmSection;
  ledger: CitationPageLedger;
  fieldDoc: JSONContent | null;
  familyTools: (family: RtmStageFamily, attachmentIds: readonly string[]) => ToolSet;
  persist: (operation: TableOperation) => Promise<RtmDraftPersistResult>;
  grounding: GroundDraftGrounding;
  policy: UnsupportedFactPolicy;
  abortSignal?: AbortSignal;
  turnStartedAtMs?: number;
};

export type RtmDraftResult = {
  status: RtmDraftStatus;
  suggestionIds: string[];
  section: QsrRtmSection;
  targetField: "table";
  rowsProposed: number;
  familyCoverage: { dq: number; iq: number; oq: number; pq: number };
  clearedCells: number;
  missingUrsIds: string[];
  keepSearchOpen?: true;
  proposalNote: string;
  message?: string;
  persistResults?: RtmDraftPersistResult[];
};

const EMPTY_COVERAGE = { dq: 0, iq: 0, oq: 0, pq: 0 };

function resultBase(
  section: QsrRtmSection,
  extras: Partial<RtmDraftResult>
): RtmDraftResult {
  return {
    status: "nothing_to_do",
    suggestionIds: [],
    section,
    targetField: "table",
    rowsProposed: 0,
    familyCoverage: EMPTY_COVERAGE,
    clearedCells: 0,
    missingUrsIds: [],
    proposalNote: "",
    ...extras,
  };
}

async function familyAttachmentIds(
  reportId: string,
  family: RtmStageFamily
): Promise<string[]> {
  try {
    const docs = await listReadyDocumentsForReport(reportId);
    return docs
      .filter((doc) => documentFamilyFromFilename(doc.filename) === family)
      .map((doc) => doc.attachmentId);
  } catch {
    return [];
  }
}

export async function runRtmDraft(
  input: RunRtmDraftInput
): Promise<RtmDraftResult> {
  if (!isQsrRtmSection(input.section)) {
    return resultBase("qsr_rtm_process", {
      status: "nothing_to_do",
      message: "Not an RTM table.",
    });
  }
  if (isTestStubChat()) {
    return resultBase(input.section, {
      status: "stub",
      message:
        "Stub draft_rtm_table — no suggestion card. Parallel RTM jobs are skipped in stub chat.",
    });
  }

  return withRtmDraftLock(input.reportId, input.section, async () => {
    const plan = planRtmDraft({
      section: input.section,
      ledger: input.ledger,
      fieldDoc: input.fieldDoc,
    });
    if (!plan) {
      return resultBase(input.section, {
        status: "nothing_to_do",
        message: "Not an RTM table.",
      });
    }
    if (rtmDraftNothingToDo(plan)) {
      return resultBase(input.section, {
        status: "nothing_to_do",
        message:
          "Every reviewed URS ID for this table is already a row and family columns are filled. Use edit_table for a single-cell correction.",
      });
    }

    const identityIds = [
      ...new Set([...plan.missingUrsIds, ...plan.identitySparseIds]),
    ];
    const identity = await runRtmIdentityJob({
      reportId: input.reportId,
      ursIds: identityIds,
      ursPages: plan.ursPages,
      abortSignal: input.abortSignal,
      turnStartedAtMs: input.turnStartedAtMs,
    });

    const familyTargetIds = [
      ...new Set([
        ...plan.missingUrsIds.filter((id) =>
          identity.rows.some((row) => row.ursId === id)
        ),
        ...plan.identitySparseIds.filter((id) =>
          identity.rows.some((row) => row.ursId === id)
        ),
        ...plan.familyBlankIds,
      ]),
    ];
    const familyRows = familyTargetIds.map((id) => {
      const found = identity.rows.find((row) => row.ursId === id);
      return (
        found ?? {
          ursId: id,
          parameters: "",
          userRequirement: "",
          citation: "",
        }
      );
    });

    let familyCells: RtmFamilyCells[] = QSR_RTM_FAMILY_ORDER.map((family) => ({
      family,
      cells: [],
    }));
    const deadlineHit =
      input.abortSignal?.aborted ||
      isChatTurnDeadlineReached(input.turnStartedAtMs ?? Date.now());
    if (!deadlineHit && familyRows.length > 0) {
      familyCells = await Promise.all(
        QSR_RTM_FAMILY_ORDER.map(async (family) => {
          const attachmentIds = await familyAttachmentIds(
            input.reportId,
            family
          );
          return runRtmFamilyJob({
            reportId: input.reportId,
            section: input.section,
            family,
            rows: familyRows,
            tools: input.familyTools(family, attachmentIds),
            attachmentIds,
            abortSignal: input.abortSignal,
            turnStartedAtMs: input.turnStartedAtMs,
          });
        })
      );
    }

    const composed = composeRtmOperations({
      section: input.section,
      fieldDoc: input.fieldDoc,
      identityRows: identity.rows,
      familyCells,
      insertUrsIds: plan.missingUrsIds,
      editUrsIds: [
        ...new Set([...plan.identitySparseIds, ...plan.familyBlankIds]),
      ],
    });

    const operations = [composed.insertRows, composed.editCells].filter(
      (operation): operation is TableOperation => operation != null
    );
    if (operations.length === 0) {
      return resultBase(input.section, {
        status: "partial",
        missingUrsIds: plan.missingUrsIds,
        keepSearchOpen: true,
        message: "No locatable URS windows on reviewed pages.",
      });
    }

    const persistResults: RtmDraftPersistResult[] = [];
    const suggestionIds: string[] = [];
    let missingUrsIds = plan.missingUrsIds;
    let keepSearchOpen: true | undefined;
    const notes: string[] = [];

    for (const operation of operations) {
      const identityOp = identityOnlyOperation(operation, input.section);
      const identityGround = groundTableOperation({
        operation: identityOp,
        ledger: input.ledger,
        policy: input.policy,
        grounding: input.grounding,
        fieldDoc: input.fieldDoc,
      });
      if (identityGround.blocked) {
        return resultBase(input.section, {
          status: "unsupported_facts",
          suggestionIds,
          missingUrsIds,
          keepSearchOpen: true,
          proposalNote: notes.join(" "),
          message:
            "URS ID / Parameters / User requirements could not be grounded from reviewed URS pages.",
          persistResults,
        });
      }
      const mergedGround = groundTableOperation({
        operation,
        ledger: input.ledger,
        policy: input.policy,
        grounding: input.grounding,
        clearOptionalOnBlock: true,
        fieldDoc: input.fieldDoc,
      });
      if (mergedGround.blocked) {
        return resultBase(input.section, {
          status: "unsupported_facts",
          suggestionIds,
          missingUrsIds,
          keepSearchOpen: true,
          proposalNote: notes.join(" "),
          persistResults,
        });
      }
      const persisted = await input.persist(mergedGround.operation);
      persistResults.push(persisted);
      if (persisted.status === "review_incomplete") {
        return resultBase(input.section, {
          status: "review_incomplete",
          suggestionIds,
          missingUrsIds,
          proposalNote: notes.join(" "),
          message: persisted.message,
          persistResults,
        });
      }
      if (persisted.status === "proposed" && persisted.suggestionId) {
        suggestionIds.push(persisted.suggestionId);
      }
      if (persisted.missingUrsIds) missingUrsIds = persisted.missingUrsIds;
      if (persisted.keepSearchOpen) keepSearchOpen = true;
      if (persisted.proposalNote) notes.push(persisted.proposalNote);
    }

    missingUrsIds = leftoverMissingUrsIds({
      operations,
      ledger: input.ledger,
      section: input.section,
      fieldDoc: input.fieldDoc,
    });

    const coverage = countFamilyCoverage(
      persistResults.length > 0 ? operations : [],
      input.section
    );
    const rowsProposed = identity.rows.length;
    return resultBase(input.section, {
      status: suggestionIds.length === 0 ? "partial" : "proposed",
      suggestionIds,
      rowsProposed,
      familyCoverage: coverage,
      missingUrsIds,
      keepSearchOpen:
        keepSearchOpen || missingUrsIds.length > 0 ? true : undefined,
      proposalNote: notes.join(" "),
      persistResults,
    });
  });
}

export function rtmDraftProposalNote(result: RtmDraftResult): string {
  const families = `DQ ${result.familyCoverage.dq}, IQ ${result.familyCoverage.iq}, OQ ${result.familyCoverage.oq}, PQ ${result.familyCoverage.pq}`;
  const missing =
    result.missingUrsIds.length > 0
      ? ` Missing URS IDs: ${result.missingUrsIds.slice(0, 12).join(", ")}.`
      : "";
  return `Proposed ${result.rowsProposed} URS row(s). Family coverage: ${families}.${missing}`;
}
