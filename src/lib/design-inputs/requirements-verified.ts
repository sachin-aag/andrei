import type { Ledger } from "./types";
import { uniqueIds } from "./ids";

export type RequirementsVerifiedRow = {
  reqId: string;
  description: string;
  satisfiedBy: string;
  requiredConfigs: string[];
};

export function requirementsVerifiedRows(
  ledger: Ledger
): RequirementsVerifiedRow[] {
  return ledger.requirements
    .filter((req) => req.removedInRev === null)
    .map((req) => {
      const blocks = ledger.blocks.filter(
        (b) =>
          b.testedReqIds.includes(req.id) ||
          b.declaredReqIds.includes(req.id) ||
          b.bannerReqIds.includes(req.id)
      );
      const requiredConfigs = uniqueIds(
        ledger.scope
          .filter((entry) => entry.reqId === req.id)
          .flatMap((entry) => entry.requiredConfigs)
      );
      return {
        reqId: req.id,
        description: req.text,
        satisfiedBy: blocks
          .map((b) => `${b.title} (pp. ${b.pages.start}–${b.pages.end})`)
          .join("; "),
        requiredConfigs,
      };
    });
}
