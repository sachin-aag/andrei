import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { ZipFile } from "yazl";

export type ZipStreamEntry = {
  zipPath: string;
  open: () => Promise<ReadableStream<Uint8Array>>;
};

function asNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(
    stream as unknown as NodeWebReadableStream<Uint8Array>
  );
}

/**
 * Streams a ZIP of attachment bytes. Files are opened one at a time and
 * omitted when storage read fails so the rest of the archive still downloads.
 */
export function createAttachmentsZipStream(
  entries: ZipStreamEntry[]
): ReadableStream<Uint8Array> {
  const zipfile = new ZipFile();
  zipfile.on("error", (error: Error) => {
    console.error("[attachments-zip]", error);
  });

  void (async () => {
    try {
      for (const entry of entries) {
        try {
          const nodeStream = asNodeReadable(await entry.open());
          await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => reject(error);
            nodeStream.once("error", onError);
            nodeStream.once("end", () => {
              nodeStream.off("error", onError);
              resolve();
            });
            zipfile.addReadStream(nodeStream, entry.zipPath, {
              compress: false,
            });
          });
        } catch (error) {
          console.error("[attachments-zip] skip entry", {
            zipPath: entry.zipPath,
            error,
          });
        }
      }
    } finally {
      zipfile.end();
    }
  })();

  return Readable.toWeb(
    zipfile.outputStream as Readable
  ) as ReadableStream<Uint8Array>;
}
