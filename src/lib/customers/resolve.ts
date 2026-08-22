export type CustomerId = "mj" | "demo" | "convergent";

export type CustomerEnv = {
  ANDREI_CUSTOMER?: string;
  NEXT_PUBLIC_ANDREI_CUSTOMER?: string;
  ANDREI_VERCEL_DEPLOY_SCOPE?: string;
  [key: string]: string | undefined;
};

function parseCustomerId(raw: string | undefined): CustomerId | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "mj" || value === "demo" || value === "convergent") return value;
  if (!value) return undefined;
  throw new Error(
    `Invalid customer id "${raw}". Expected mj, demo, or convergent (ANDREI_CUSTOMER / NEXT_PUBLIC_ANDREI_CUSTOMER).`
  );
}

function parseDeployScope(raw: string | undefined): CustomerId | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "mj" || value === "demo" || value === "convergent") return value;
  return undefined;
}

/**
 * Next.js inlines NEXT_PUBLIC_* into the client bundle only for a static
 * `process.env.NEXT_PUBLIC_…` member access. Passing `process.env` through as
 * an object and reading `env.NEXT_PUBLIC_ANDREI_CUSTOMER` leaves the client
 * on the demo default (login is a server component, so it would still look
 * like MJ while the shell, create dialog, and section tabs stay demo).
 */
function processCustomerEnv(): CustomerEnv {
  return {
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };
}

/**
 * Resolve the customer pack id.
 *
 * Preference: NEXT_PUBLIC_ANDREI_CUSTOMER (client + server) → ANDREI_CUSTOMER
 * → ANDREI_VERCEL_DEPLOY_SCOPE → `demo`. Conflicting values throw so the two
 * env knobs cannot silently drift.
 */
export function resolveCustomerId(
  env: CustomerEnv = processCustomerEnv()
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
  env: CustomerEnv = processCustomerEnv()
): void {
  resolveCustomerId(env);
}
