import { redirect } from "next/navigation";
import { isDocumentTemplatesEnabled } from "@/lib/customers/packs";

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDocumentTemplatesEnabled()) {
    redirect("/");
  }
  return children;
}
