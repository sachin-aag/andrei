import { trace } from "@opentelemetry/api";
import {
  observe,
  propagateAttributes,
  updateActiveObservation,
  type PropagateAttributesParams,
} from "@langfuse/tracing";

/** Langfuse correlating-attribute values must be strings of at most 200 chars. */
export const LANGFUSE_ATTRIBUTE_MAX_CHARS = 200;

/** True when Langfuse API keys are present (cloud or self-hosted). */
export function isLangfuseEnabled(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  );
}

export function clipLangfuseAttribute(value: string): string {
  return value.length <= LANGFUSE_ATTRIBUTE_MAX_CHARS
    ? value
    : value.slice(0, LANGFUSE_ATTRIBUTE_MAX_CHARS);
}

/**
 * Coerce metadata to `Record<string, string>` with values ≤200 characters.
 * Non-string values are stringified so v4 observation filters keep them.
 */
export function observationMetadata(
  metadata: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    const str = typeof value === "string" ? value : String(value);
    if (str.length === 0) continue;
    out[key] = clipLangfuseAttribute(str);
  }
  return out;
}

/**
 * Vercel AI SDK v6 telemetry options for Langfuse via OpenTelemetry.
 * Metadata is always string-only so generations stay filterable on v4.
 */
export function langfuseGenerateTextTelemetry(options: {
  functionId: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isLangfuseEnabled()) return {};

  return {
    experimental_telemetry: {
      isEnabled: true,
      functionId: options.functionId,
      recordInputs: true,
      recordOutputs: true,
      metadata: options.metadata
        ? observationMetadata(options.metadata)
        : undefined,
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

type ObserveRouteOptions = {
  /** Keep the root observation open until the stream finishes. */
  endOnExit?: boolean;
};

/** Wrap a route handler without auto-capturing Request/params as I/O. */
export function observeRouteHandler<TArgs extends unknown[], TResult>(
  name: string,
  handler: (...args: TArgs) => Promise<TResult>,
  options?: ObserveRouteOptions
) {
  if (!isLangfuseEnabled()) return handler;
  return observe(handler, {
    name,
    captureInput: false,
    captureOutput: false,
    endOnExit: options?.endOnExit ?? true,
  });
}

type PropagatedTraceParams = Omit<PropagateAttributesParams, "metadata"> & {
  metadata?: Record<string, unknown>;
};

/**
 * Copy correlating attributes onto the current observation and every child
 * created inside `fn` (session, user, tags, trace name, metadata).
 */
export function withPropagatedAttributes<T>(
  params: PropagatedTraceParams,
  fn: () => T
): T {
  if (!isLangfuseEnabled()) return fn();
  const { metadata, ...rest } = params;
  return propagateAttributes(
    {
      ...rest,
      userId: rest.userId ? clipLangfuseAttribute(rest.userId) : undefined,
      sessionId: rest.sessionId
        ? clipLangfuseAttribute(rest.sessionId)
        : undefined,
      traceName: rest.traceName
        ? clipLangfuseAttribute(rest.traceName)
        : undefined,
      metadata: metadata ? observationMetadata(metadata) : undefined,
      tags: rest.tags?.map(clipLangfuseAttribute),
    },
    fn
  );
}

/** Set explicit input/output on the active root observation (not trace I/O). */
export function setRouteObservationIO(attributes: {
  input?: unknown;
  output?: unknown;
}): void {
  if (!isLangfuseEnabled()) return;
  updateActiveObservation(attributes);
}

/** End the active root observation after a streaming response finishes. */
export function endActiveLangfuseObservation(): void {
  if (!isLangfuseEnabled()) return;
  trace.getActiveSpan()?.end();
}

/** Run `fn` as a named root observation (background jobs, not route handlers). */
export function observeWork<T>(
  name: string,
  fn: () => T,
  options?: ObserveRouteOptions
): T {
  if (!isLangfuseEnabled()) return fn();
  return observe(fn, {
    name,
    captureInput: false,
    captureOutput: false,
    endOnExit: options?.endOnExit ?? true,
  })();
}
