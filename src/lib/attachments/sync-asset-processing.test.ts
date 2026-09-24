import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: Array<{ table: string; patch: unknown }> = [];

function updateChain(table: string) {
  return {
    set(patch: unknown) {
      updates.push({ table, patch });
      return {
        where: async () => undefined,
      };
    },
  };
}

vi.mock("@/db", () => ({
  db: {
    update: (table: { _: { name: string } }) => updateChain(table._.name),
  },
}));

vi.mock("@/db/schema", () => ({
  attachmentAssets: { _: { name: "attachment_assets" } },
  reportAttachments: { _: { name: "report_attachments" } },
}));

import { patchLinkedProcessing } from "./sync-asset-processing";

describe("patchLinkedProcessing", () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it("writes progress onto the vault asset the documents list reads", async () => {
    await patchLinkedProcessing("att-1", "asset-1", { processingProgress: 40 });
    expect(updates).toEqual([
      { table: "attachment_assets", patch: { processingProgress: 40 } },
      { table: "report_attachments", patch: { processingProgress: 40 } },
    ]);
  });

  it("updates only the report link when there is no vault asset", async () => {
    await patchLinkedProcessing("att-1", null, { processingPage: 3 });
    expect(updates).toEqual([
      { table: "report_attachments", patch: { processingPage: 3 } },
    ]);
  });
});
