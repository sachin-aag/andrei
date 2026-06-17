import {
  observe,
  updateActiveObservation,
  type PropagateAttributesParams,
} from "@langfuse/tracing";

type TelemetryMetadata = Record<string, string | number | boolean>;

/** True when Langfuse API keys are present (cloud or self-hosted). */
export function isLangfuseEnabled(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  );
}

/**
 * Vercel AI SDK telemetry options for Langfuse via OpenTelemetry.
 */
export function langfuseGenerateTextTelemetry(options: {
  functionId: string;
  metadata?: TelemetryMetadata;
}) {
  if (!isLangfuseEnabled()) return {};

  return {
    experimental_telemetry: {
      isEnabled: true,
      functionId: options.functionId,
      recordInputs: true,
      recordOutputs: true,
      metadata: options.metadata,
    },
  } as const;
}

export async function flushLangfuseTraces(): Promise<void> {
  if (!isLangfuseEnabled()) return;
  const { getLangfuseSpanProcessor } = await import("@/instrumentation");
  const processor = getLangfuseSpanProcessor();
  if (!processor) return;
  await processor.forceFlush();
}

/** Wrap a route handler without auto-capturing Request/params as I/O. */
export function observeRouteHandler<TArgs extends unknown[], TResult>(
  name: string,
  handler: (...args: TArgs) => Promise<TResult>
) {
  if (!isLangfuseEnabled()) return handler;
  return observe(handler, {
    name,
    captureInput: false,
    captureOutput: false,
  });
}

/** Set explicit input/output on the active route observation. */
export function setRouteObservationIO(attributes: {
  input?: unknown;
  output?: unknown;
}): void {
  if (!isLangfuseEnabled()) return;
  updateActiveObservation(attributes);
}

export type LangfuseTraceContext = PropagateAttributesParams & {
  input?: unknown;
  output?: unknown;
};
