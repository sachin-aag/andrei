import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangeSharedPasswordForm } from "@/components/auth/change-shared-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.workspaceUserId) {
    redirect("/login");
  }
  if (!session.user.mustChangePassword && !session.user.passwordExpired) {
    redirect("/");
  }
  const isExpired = !!session.user.passwordExpired;

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-white p-1">
            <Image
              src="/logo.png"
              width={32}
              height={32}
              alt="Andrei logo"
              className="object-contain"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div className="font-semibold">Andrei</div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isExpired ? "Change your password" : "Choose your password"}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {isExpired
              ? "Your password has expired. Pick a new one to continue."
              : "Your administrator assigned a temporary password. Pick a new one to continue."}
          </p>
        </div>
        <ChangeSharedPasswordForm email={session.user.email ?? ""} />
      </div>
    </div>
  );
}
