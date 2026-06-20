import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangeSharedPasswordForm } from "@/components/auth/change-shared-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.workspaceUserId) {
    redirect("/login");
  }
  if (!session.user.mustChangePassword) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-white p-1">
            <Image
              src="/logo.png"
              width={32}
              height={32}
              alt="MJ Biopharm logo"
              className="object-contain"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div className="font-semibold">M.J. Biopharm</div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Choose your password
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Your administrator assigned a temporary password. Pick a new one to
            continue — it must be different from the temporary password.
          </p>
        </div>
        <ChangeSharedPasswordForm email={session.user.email ?? ""} />
      </div>
    </div>
  );
}
