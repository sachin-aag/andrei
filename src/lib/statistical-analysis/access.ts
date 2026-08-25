import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { NextResponse } from "next/server";

export function statisticalAnalysisDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function requireStatisticalAnalysisEnabled(): NextResponse | null {
  if (!isStatisticalAnalysisEnabled()) {
    return statisticalAnalysisDisabledResponse();
  }
  return null;
}
