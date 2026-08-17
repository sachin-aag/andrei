import { CONVERGENT_PROTOCOL_CONFIG } from "@/lib/customers/convergent/protocol-config";
import type { Ledger, ProtocolParserConfig } from "./types";
import { parseProtocol } from "./parse-protocol";
import { parseRequirements } from "./parse-requirements";
import { parseTestPlan } from "./parse-test-plan";

export type LedgerSources = {
  srsText: string;
  planText: string;
  protocolText: string;
};

export function buildLedger(
  sources: LedgerSources,
  config: ProtocolParserConfig = CONVERGENT_PROTOCOL_CONFIG
): Ledger {
  const requirements = parseRequirements(sources.srsText, config);
  const scope = parseTestPlan(sources.planText, config);
  const protocol = parseProtocol(sources.protocolText, config);
  return {
    requirements,
    scope,
    blocks: protocol.blocks,
    equipmentTable: protocol.equipmentTable,
    referencesTable: protocol.referencesTable,
  };
}
