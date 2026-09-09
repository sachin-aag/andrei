import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserActivityReport } from "@/lib/usage/activity";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }
  if (user.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Only admins can view usage" },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { response: null, user };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const report = await getUserActivityReport();
  return NextResponse.json(report);
}
