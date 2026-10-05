"use client";

import { RouteErrorView } from "@/components/report/route-error-view";

export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorView {...props} />;
}
