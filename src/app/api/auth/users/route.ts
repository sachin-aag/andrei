import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createWorkspaceUser,
  listWorkspaceUsers,
} from "@/lib/auth/workspace-users";

const createBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  employeeId: z.string().trim().min(1, "Employee ID is required."),
  role: z.enum(["engineer", "manager"]).optional(),
  title: z.string().trim().optional(),
});

export async function GET() {
  try {
    const users = await listWorkspaceUsers();
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "Could not load users." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const parse = createBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json(
      { error: parse.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  try {
    const user = await createWorkspaceUser(parse.data);
    return NextResponse.json({ user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
