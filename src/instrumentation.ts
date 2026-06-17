import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

function langfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  );
}

let langfuseSpanProcessor: LangfuseSpanProcessor | undefined;

/** Lazily created so CI/test without LANGFUSE_* keys does not warn on import. */
export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  if (!langfuseConfigured()) return null;
  langfuseSpanProcessor ??= new LangfuseSpanProcessor();
  return langfuseSpanProcessor;
}

/**
 * Next.js server instrumentation hook.
 * Langfuse tracing for inline suggestions / evaluation observability.
 * Improve AI feedback sessions are stored in Neon (see src/lib/improve-ai/store.ts).
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
