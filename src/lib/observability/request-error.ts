import { SpanStatusCode, trace } from "@opentelemetry/api";
import { distinctIdFromCookieHeader, getPostHogServer } from "@/lib/analytics/posthog-server";
import { flushLangfuseTraces, isLangfuseEnabled } from "@/lib/observability/langfuse";

export type RequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
};

export type RequestErrorRequest = {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw.join("; ");
  return raw;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function errorDigest(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest : undefined;
  }
  return undefined;
}

async function recordLangfuse(input: {
  message: string;
  digest?: string;
  request: RequestErrorRequest;
  context: RequestErrorContext;
  error: unknown;
}): Promise<void> {
  if (!isLangfuseEnabled()) return;
  const tracer = trace.getTracer("andrei-request-error");
  const span = tracer.startSpan("nextjs.request_error");
  span.setStatus({ code: SpanStatusCode.ERROR, message: input.message.slice(0, 200) });
  span.setAttribute("request.path", input.request.path ?? "");
  span.setAttribute("request.method", input.request.method ?? "");
  span.setAttribute("route.path", input.context.routePath ?? "");
  span.setAttribute("route.type", input.context.routeType ?? "");
  if (input.digest) span.setAttribute("next.digest", input.digest);
  if (input.error instanceof Error) {
    span.recordException(input.error);
  }
  span.end();
  await flushLangfuseTraces();
}

async function recordPostHog(input: {
  error: unknown;
  request: RequestErrorRequest;
  context: RequestErrorContext;
}): Promise<void> {
  const posthog = getPostHogServer();
  if (!posthog) return;
  const cookie = headerValue(input.request.headers, "cookie");
  const distinctId = distinctIdFromCookieHeader(cookie);
  await posthog.captureExceptionImmediate(input.error, distinctId, {
    source: "nextjs.onRequestError",
    path: input.request.path ?? "",
    method: input.request.method ?? "",
    routePath: input.context.routePath ?? "",
    routeType: input.context.routeType ?? "",
    routerKind: input.context.routerKind ?? "",
  });
}

/**
 * Best-effort report of an unhandled Next.js request error.
 * Never throws — reporting must not mask the original failure.
 */
export async function reportRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext
): Promise<void> {
  const message = errorMessage(error);
  const digest = errorDigest(error);
  try {
    await Promise.all([
      recordLangfuse({ message, digest, request, context, error }),
      recordPostHog({ error, request, context }),
    ]);
  } catch (reportingError) {
    console.error("[request-error] failed to report", reportingError);
  }
}
