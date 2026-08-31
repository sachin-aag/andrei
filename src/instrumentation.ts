import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

function langfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  );
}

function langfuseBaseUrl(): string | undefined {
  const fromBase = process.env.LANGFUSE_BASE_URL?.trim();
  if (fromBase) return fromBase;
  const fromHost = process.env.LANGFUSE_HOST?.trim();
  return fromHost || undefined;
}

let langfuseSpanProcessor: LangfuseSpanProcessor | undefined;

/** Lazily created so CI/test without LANGFUSE_* keys does not warn on import. */
export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  if (!langfuseConfigured()) return null;
  langfuseSpanProcessor ??= new LangfuseSpanProcessor({
    baseUrl: langfuseBaseUrl(),
    // Next.js route handlers are short-lived; export immediately then forceFlush.
    exportMode: "immediate",
    // Selects the v4 observations-first ingestion path (SDK 5.4+ also
    // qualifies via the SDK version header; the explicit header is belt-and-suspenders).
    additionalHeaders: {
      "x-langfuse-ingestion-version": "4",
    },
  });
  return langfuseSpanProcessor;
}

/**
 * Next.js server instrumentation hook.
 * Langfuse tracing for inline suggestions / evaluation observability.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const spanProcessor = getLangfuseSpanProcessor();
  if (!spanProcessor) return;

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });

  tracerProvider.register();
}

/**
 * Unhandled App Router / route errors → PostHog + Langfuse (fail-soft).
 * Edge is skipped: posthog-node and the Langfuse Node exporter are Node-only.
 */
export async function onRequestError(
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
  }
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { reportRequestError } = await import("@/lib/observability/request-error");
  await reportRequestError(error, request, context);
}
