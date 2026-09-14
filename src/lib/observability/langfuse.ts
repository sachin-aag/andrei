import { trace } from "@opentelemetry/api";
import {
  observe,
  propagateAttributes,
  updateActiveObservation,
  getActiveTraceId,
  type PropagateAttributesParams,
} from "@langfuse/tracing";

export { getActiveTraceId };

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

export type LangfuseDeployContext = {
  /** First-class Langfuse environment (`production` / `preview` / `development`). */
  environment: string;
  /** Git SHA (`VERCEL_GIT_COMMIT_SHA` or `LANGFUSE_RELEASE`). */
  release?: string;
  gitBranch?: string;
  vercelEnv?: string;
  customer?: string;
};

/**
 * Deploy identity for Langfuse filters. `VERCEL_ENV` wins so a Vercel env
 * var of `LANGFUSE_TRACING_ENVIRONMENT=production` on Preview cannot collapse
 * preview traces into production.
 */
export function langfuseDeployContext(): LangfuseDeployContext {
  const vercelEnv = process.env.VERCEL_ENV?.trim() || undefined;
  const environment =
    vercelEnv ||
    process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() ||
    "development";
  const release =
    process.env.LANGFUSE_RELEASE?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    undefined;
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF?.trim() || undefined;
  const customer =
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER?.trim() ||
    process.env.ANDREI_CUSTOMER?.trim() ||
    process.env.ANDREI_VERCEL_DEPLOY_SCOPE?.trim() ||
    undefined;
  return { environment, release, gitBranch, vercelEnv, customer };
}

/** Metadata keys stamped on every generation / propagated observation. */
export function langfuseDeployMetadata(): Record<string, unknown> {
  const ctx = langfuseDeployContext();
  return {
    tracingEnvironment: ctx.environment,
    release: ctx.release,
    gitBranch: ctx.gitBranch,
    vercelEnv: ctx.vercelEnv,
    customer: ctx.customer,
  };
}

function withDeployObservationMetadata(
  metadata?: Record<string, unknown>
): Record<string, string> {
  return observationMetadata({
    ...langfuseDeployMetadata(),
    ...metadata,
  });
}

function uniqueClippedTags(tags: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (!tag) continue;
    const clipped = clipLangfuseAttribute(tag);
    if (seen.has(clipped)) continue;
    seen.add(clipped);
    out.push(clipped);
  }
  return out;
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
      metadata: withDeployObservationMetadata(options.metadata),
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
  const deploy = langfuseDeployContext();
  const release = rest.version ?? deploy.release;
  return propagateAttributes(
    {
      ...rest,
      environment: rest.environment ?? deploy.environment,
      ...(release ? { version: release } : {}),
      userId: rest.userId ? clipLangfuseAttribute(rest.userId) : undefined,
      sessionId: rest.sessionId
        ? clipLangfuseAttribute(rest.sessionId)
        : undefined,
      traceName: rest.traceName
        ? clipLangfuseAttribute(rest.traceName)
        : undefined,
      metadata: withDeployObservationMetadata(metadata),
      tags: uniqueClippedTags([
        ...(rest.tags ?? []),
        deploy.vercelEnv ?? deploy.environment,
      ]),
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
