import { redirect } from "next/navigation";

export default function LegacyLibraryRedirectPage() {
  redirect("/vault");
}
