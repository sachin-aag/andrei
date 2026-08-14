export type CustomerId = "mj" | "demo";

export type CustomerEnv = {
  ANDREI_CUSTOMER?: string;
  NEXT_PUBLIC_ANDREI_CUSTOMER?: string;
  ANDREI_VERCEL_DEPLOY_SCOPE?: string;
  [key: string]: string | undefined;
};

function parseCustomerId(raw: string | undefined): CustomerId | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "mj" || value === "demo") return value;
  if (!value) return undefined;
  throw new Error(
    `Invalid customer id "${raw}". Expected mj or demo (ANDREI_CUSTOMER / NEXT_PUBLIC_ANDREI_CUSTOMER).`
  );
}

function parseDeployScope(raw: string | undefined): CustomerId | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "mj" || value === "demo") return value;
  return undefined;
}

/**
 * Resolve the customer pack id.
 *
 * Preference: NEXT_PUBLIC_ANDREI_CUSTOMER (client + server) → ANDREI_CUSTOMER
 * → ANDREI_VERCEL_DEPLOY_SCOPE → `demo`. Conflicting values throw so the two
 * env knobs cannot silently drift.
 */
export function resolveCustomerId(
  env: CustomerEnv = process.env
): CustomerId {
  const fromPublic = parseCustomerId(env.NEXT_PUBLIC_ANDREI_CUSTOMER);
  const fromServer = parseCustomerId(env.ANDREI_CUSTOMER);
  const fromScope = parseDeployScope(env.ANDREI_VERCEL_DEPLOY_SCOPE);

  if (fromPublic && fromServer && fromPublic !== fromServer) {
    throw new Error(
      `ANDREI_CUSTOMER (${fromServer}) disagrees with NEXT_PUBLIC_ANDREI_CUSTOMER (${fromPublic}).`
    );
  }

  const customer = fromPublic ?? fromServer;
  if (customer && fromScope && customer !== fromScope) {
    throw new Error(
      `ANDREI_CUSTOMER (${customer}) disagrees with ANDREI_VERCEL_DEPLOY_SCOPE (${fromScope}).`
    );
  }

  return customer ?? fromScope ?? "demo";
}

/** Call at build time (next.config) so a bad Vercel env fails the build. */
export function assertCustomerEnvAgreement(
  env: CustomerEnv = process.env
): void {
  resolveCustomerId(env);
}
