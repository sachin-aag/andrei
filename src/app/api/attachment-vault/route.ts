import { NextResponse } from "next/server";
import { z } from "zod";
import { listAttachmentLibrary } from "@/lib/attachments/list-library";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const querySchema = z.object({
  scope: z.enum(["mine", "shared", "all"]).optional(),
});

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const library = await listAttachmentLibrary(user, parsed.data.scope);
  return NextResponse.json(library);
}
