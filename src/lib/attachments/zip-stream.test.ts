import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { createAttachmentsZipStream } from "./zip-stream";

function webStreamFrom(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function readZip(stream: ReadableStream<Uint8Array>): Promise<PizZip> {
  const buffer = Buffer.from(await new Response(stream).arrayBuffer());
  return new PizZip(buffer);
}

describe("createAttachmentsZipStream", () => {
  it("writes each file under its zip path", async () => {
    const zip = await readZip(
      createAttachmentsZipStream([
        {
          zipPath: "root.pdf",
          open: async () => webStreamFrom("root-bytes"),
        },
        {
          zipPath: "SOPs/sop.pdf",
          open: async () => webStreamFrom("sop-bytes"),
        },
      ])
    );

    expect(zip.file("root.pdf")?.asText()).toBe("root-bytes");
    expect(zip.file("SOPs/sop.pdf")?.asText()).toBe("sop-bytes");
  });

  it("omits an entry whose open() fails and still finishes the archive", async () => {
    const zip = await readZip(
      createAttachmentsZipStream([
        {
          zipPath: "ok.pdf",
          open: async () => webStreamFrom("kept"),
        },
        {
          zipPath: "missing.pdf",
          open: async () => {
            throw new Error("object gone");
          },
        },
      ])
    );

    expect(zip.file("ok.pdf")?.asText()).toBe("kept");
    expect(zip.file("missing.pdf")).toBeNull();
  });
});
