import { impliedConfigsFromNote } from "./applicability";
import type {
  Finding,
  FindingDisposition,
  FindingEvidence,
  Ledger,
  ProtocolCheckPolicy,
  ProtocolParserConfig,
} from "./types";
import { extractRequirementIds, uniqueIds } from "./ids";

const EMPTY_POLICY: ProtocolCheckPolicy = {
  confirmationIds: new Set(),
  corroborations: {},
};

const SOP_COVERAGE = ["775-00021 §6.5", "775-00021 §10.1"];
const SOP_TRACE = ["775-00021 §6.5"];
const SOP_EQUIPMENT = ["775-00021 §8.5"];

export type RunChecksOptions = {
  policy?: ProtocolCheckPolicy;
  config?: Pick<ProtocolParserConfig, "requirementId" | "applicabilityRules">;
};

export function runAllChecks(
  ledger: Ledger,
  options: RunChecksOptions = {}
): Finding[] {
  const policy = options.policy ?? EMPTY_POLICY;
  const requirementId = options.config?.requirementId;
  const applicabilityRules = options.config?.applicabilityRules ?? [];
  const registry = new Set(ledger.requirements.map((r) => r.id));
  const tested = unionIds(ledger.blocks.map((b) => b.testedReqIds));
  const claimed = unionIds(
    ledger.blocks.flatMap((b) => [b.declaredReqIds, b.bannerReqIds])
  );

  return [
    ...checkDanglingIds(ledger, registry, requirementId),
    ...checkApplicability(ledger, policy, applicabilityRules),
    ...checkOneConfigCode(ledger),
    ...checkDeclaredButUntested(ledger, claimed, tested),
    ...checkLiveUntested(ledger, tested, claimed),
    ...checkObsoleteStillPresent(ledger, claimed, tested),
    ...checkEquipmentGap(ledger),
    ...checkTildeTolerance(ledger),
    ...checkNonNormative(ledger),
    ...checkBannerDupes(ledger),
    ...checkDatasheetN1(),
  ];
}

function unionIds(groups: string[][]): Set<string> {
  const out = new Set<string>();
  for (const group of groups) {
    for (const id of group) out.add(id);
  }
  return out;
}

function checkDanglingIds(
  ledger: Ledger,
  registry: Set<string>,
  requirementId: RegExp | undefined
): Finding[] {
  const cited = new Map<string, { via: string; quote: string }>();
  if (requirementId) {
    for (const req of ledger.requirements) {
      for (const id of uniqueIds(
        extractRequirementIds(req.text, requirementId)
      )) {
        if (id === req.id || registry.has(id) || cited.has(id)) continue;
        cited.set(id, { via: req.id, quote: req.text.slice(0, 160) });
      }
    }
  }
  for (const block of ledger.blocks) {
    for (const id of [
      ...block.declaredReqIds,
      ...block.bannerReqIds,
      ...block.testedReqIds,
    ]) {
      if (registry.has(id) || cited.has(id)) continue;
      cited.set(id, {
        via: block.title,
        quote: `Cited in ${block.title}`,
      });
    }
  }
  return [...cited.entries()].map(([id, { via, quote }]) =>
    finding({
      id: `dangling.${id}`,
      check: "dangling_id",
      severity: "high",
      disposition: "defect",
      reqIds: [id],
      quote,
      questions: [
        `Does ${id} exist under another identifier, or should the citation at ${via} be removed?`,
      ],
      sopRefs: SOP_TRACE,
      doc: "srs",
    })
  );
}

function checkApplicability(
  ledger: Ledger,
  policy: ProtocolCheckPolicy,
  rules: ProtocolParserConfig["applicabilityRules"]
): Finding[] {
  const byReq = new Map(ledger.requirements.map((r) => [r.id, r]));
  const flagged = new Set<string>();
  const out: Finding[] = [];
  for (const entry of ledger.scope) {
    if (flagged.has(entry.reqId)) continue;
    const req = byReq.get(entry.reqId);
    if (!req?.applicabilityNote) continue;
    const implied = impliedConfigsFromNote(req.applicabilityNote, rules);
    if (implied.length === 0 || entry.requiredConfigs.length === 0) continue;
    const extra = entry.requiredConfigs.filter((c) => !implied.includes(c));
    if (extra.length === 0) continue;
    flagged.add(entry.reqId);
    const confirmation = policy.confirmationIds.has(entry.reqId);
    out.push(
      finding({
        id: `applicability.${entry.reqId}`,
        check: "applicability_vs_jcode",
        severity: confirmation ? "medium" : "high",
        disposition: confirmation ? "needs_confirmation" : "defect",
        reqIds: [entry.reqId],
        quote: `${req.applicabilityNote}; plan ${entry.jCode} → ${entry.requiredConfigs.join(", ")}`,
        corroboratedBy: policy.corroborations[entry.reqId],
        questions: [
          "Is the applicability note authoritative over the plan configuration code for this revision set?",
        ],
        sopRefs: SOP_COVERAGE,
        doc: "plan",
      })
    );
  }
  return out;
}

function checkOneConfigCode(ledger: Ledger): Finding[] {
  const byReq = new Map<string, Set<string>>();
  for (const entry of ledger.scope) {
    const set = byReq.get(entry.reqId) ?? new Set();
    set.add(entry.jCode);
    byReq.set(entry.reqId, set);
  }
  const out: Finding[] = [];
  for (const [reqId, codes] of byReq) {
    if (codes.size < 2) continue;
    out.push(
      finding({
        id: `one_config.${reqId}`,
        check: "one_jcode_per_req",
        severity: "medium",
        disposition: "defect",
        reqIds: [reqId],
        quote: `Configuration codes: ${[...codes].join(", ")}`,
        questions: [
          "Is the later code a recorded narrowing, or were two codes assigned in error?",
        ],
        sopRefs: SOP_COVERAGE,
        doc: "plan",
      })
    );
  }
  return out;
}

function checkDeclaredButUntested(
  ledger: Ledger,
  claimed: Set<string>,
  tested: Set<string>
): Finding[] {
  const untested = [...claimed].filter((id) => !tested.has(id)).sort();
  return untested.map((id) => {
    const block = ledger.blocks.find(
      (b) => b.declaredReqIds.includes(id) || b.bannerReqIds.includes(id)
    );
    return finding({
      id: `declared_untested.${id}`,
      check: "declared_but_untested",
      severity: "high",
      disposition: "defect",
      reqIds: [id],
      quote: block
        ? `Claimed in ${block.title} (pp. ${block.pages.start}–${block.pages.end})`
        : "Claimed in protocol coverage",
      questions: [
        "Is this requirement verified inside another row without the ID in the Req(s) column, or is a method missing?",
      ],
      sopRefs: SOP_COVERAGE,
      page: block?.pages.start,
    });
  });
}

function checkLiveUntested(
  ledger: Ledger,
  tested: Set<string>,
  claimed: Set<string>
): Finding[] {
  return ledger.requirements
    .filter(
      (req) =>
        req.removedInRev === null &&
        !req.deferred &&
        !tested.has(req.id) &&
        !claimed.has(req.id)
    )
    .map((req) =>
      finding({
        id: `live_untested.${req.id}`,
        check: "live_untested",
        severity: "medium",
        disposition: "defect",
        reqIds: [req.id],
        quote: req.text.slice(0, 160),
        questions: [
          "Where is this requirement verified, or what documented rationale takes it out of scope?",
        ],
        sopRefs: SOP_COVERAGE,
      })
    );
}

function checkObsoleteStillPresent(
  ledger: Ledger,
  claimed: Set<string>,
  tested: Set<string>
): Finding[] {
  const removed = ledger.requirements.filter((r) => r.removedInRev !== null);
  const offenders = removed.filter(
    (r) => claimed.has(r.id) || tested.has(r.id)
  );
  if (offenders.length > 0) {
    return offenders.map((req) =>
      finding({
        id: `obsolete.${req.id}`,
        check: "obsolete_still_present",
        severity: "medium",
        disposition: "defect",
        reqIds: [req.id],
        quote: `Removed in rev ${req.removedInRev} but still claimed as live coverage in the protocol`,
        questions: [
          "Should this ID be dropped from the protocol, or was the removal reversed?",
        ],
        sopRefs: SOP_TRACE,
      })
    );
  }
  return [
    finding({
      id: "obsolete.clean",
      check: "obsolete_still_present",
      severity: "low",
      disposition: "clean",
      reqIds: [],
      quote:
        "No removed requirement IDs reappear as live protocol coverage",
      questions: [],
      sopRefs: SOP_TRACE,
    }),
  ];
}

function checkEquipmentGap(ledger: Ledger): Finding[] {
  const table = new Set(
    ledger.equipmentTable.map((n) => n.toLowerCase())
  );
  const named = uniqueIds(ledger.blocks.flatMap((b) => b.instrumentsNamed));
  return named
    .filter((n) => !table.has(n) && ![...table].some((t) => t.includes(n)))
    .map((name) =>
      finding({
        id: `equipment.${name}`,
        check: "equipment_gap",
        severity: "high",
        disposition: "defect",
        reqIds: [],
        quote: `${name} is named in test methods but not in the equipment table`,
        questions: [
          "Is this instrument tracked under another name, or should it be added to the equipment table?",
        ],
        sopRefs: SOP_EQUIPMENT,
      })
    );
}

function checkTildeTolerance(ledger: Ledger): Finding[] {
  const hits = ledger.blocks.flatMap((b) => b.tildeHits);
  if (hits.length === 0) return [];
  return [
    finding({
      id: "tilde",
      check: "tilde_tolerance",
      severity: "medium",
      disposition: "review_queue",
      reqIds: [],
      quote: `${hits.length} quantitative expected result(s) use an approximation instead of a tolerance`,
      questions: [
        "Is each approximation a setup step, or an acceptance criterion that needs an explicit tolerance?",
      ],
      sopRefs: SOP_COVERAGE,
      page: hits[0]?.page,
    }),
  ];
}

function checkNonNormative(ledger: Ledger): Finding[] {
  const totals = ledger.blocks.reduce(
    (acc, b) => ({
      na: acc.na + b.nonNormativeHits.na,
      should: acc.should + b.nonNormativeHits.should,
      ifNeeded: acc.ifNeeded + b.nonNormativeHits.ifNeeded,
      appropriate: acc.appropriate + b.nonNormativeHits.appropriate,
    }),
    { na: 0, should: 0, ifNeeded: 0, appropriate: 0 }
  );
  const sum =
    totals.na + totals.should + totals.ifNeeded + totals.appropriate;
  if (sum === 0) return [];
  return [
    finding({
      id: "non_normative",
      check: "non_normative",
      severity: "low",
      disposition: "review_queue",
      reqIds: [],
      quote: `N/A ${totals.na}; should ${totals.should}; if needed/applicable/required ${totals.ifNeeded}; unmeasurable qualifier ${totals.appropriate}`,
      questions: [
        "Which of these are non-scoring setup rows versus missing acceptance criteria?",
      ],
      sopRefs: SOP_COVERAGE,
    }),
  ];
}

function checkBannerDupes(ledger: Ledger): Finding[] {
  return ledger.blocks
    .filter((b) => b.bannerDuplicateIds.length > 0)
    .map((block) =>
      finding({
        id: `banner_dupes.${block.id}`,
        check: "banner_dupes",
        severity: "low",
        disposition: "review_queue",
        reqIds: block.bannerDuplicateIds,
        quote: `${block.title}: duplicated coverage IDs ${block.bannerDuplicateIds.join(", ")}`,
        questions: [
          "Is the coverage banner generated from the requirements table, or hand-maintained?",
        ],
        sopRefs: SOP_TRACE,
      })
    );
}

function checkDatasheetN1(): Finding[] {
  return [
    finding({
      id: "datasheet_n1",
      check: "datasheet_n1",
      severity: "low",
      disposition: "review_queue",
      reqIds: [],
      quote:
        "Datasheet methods record a single UUT/configuration cell — sample size cannot be verified from the protocol alone",
      questions: [
        "Is N=1 the approved sample size, or should configuration columns record each execution?",
      ],
      sopRefs: SOP_COVERAGE,
    }),
  ];
}

function finding(input: {
  id: string;
  check: string;
  severity: Finding["severity"];
  disposition: FindingDisposition;
  reqIds: string[];
  quote: string;
  questions: string[];
  sopRefs: string[];
  corroboratedBy?: Finding["corroboratedBy"];
  doc?: FindingEvidence["doc"];
  page?: number;
}): Finding {
  return {
    id: input.id,
    check: input.check,
    severity: input.severity,
    disposition: input.disposition,
    reqIds: input.reqIds,
    evidence: [
      {
        doc: input.doc ?? "protocol",
        rev: "",
        page: input.page ?? 0,
        quote: input.quote,
      },
    ],
    corroboratedBy: input.corroboratedBy,
    questions: input.questions,
    sopRefs: input.sopRefs,
    proposedFix: null,
  };
}
