/**
 * Next.js server instrumentation hook.
 * Langfuse tracing via OpenTelemetry was removed; criteria review uses @langfuse/client only.
 */
export async function register(): Promise<void> {
  // No-op
}
