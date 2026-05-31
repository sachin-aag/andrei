import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

function langfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  );
}

/** Shared processor — call `forceFlush()` from serverless routes before exit. */
export const langfuseSpanProcessor = new LangfuseSpanProcessor();

/**
 * Next.js server instrumentation hook.
 * Langfuse tracing for inline suggestions / evaluation observability.
 * Criteria review data is stored in Neon (see src/lib/criteria-review/store.ts).
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (!langfuseConfigured()) return;

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [langfuseSpanProcessor],
  });

  tracerProvider.register();
}
