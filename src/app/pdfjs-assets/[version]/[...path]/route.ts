import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolvePdfjsAssetPath } from "@/lib/attachments/pdfjs-asset-files";

export const runtime = "nodejs";

/**
 * Serves official pdf.js worker / wasm / fonts from `pdfjs-dist`.
 * Preview must load these from our origin — CDN wasm is not a substitute.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ version: string; path: string[] }> }
) {
  const { version, path: segments } = await params;
  if (segments.length !== 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [root, file] = segments;
  const resolved = resolvePdfjsAssetPath(version, root ?? "", file ?? "");
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await readFile(resolved.absolutePath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": resolved.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
