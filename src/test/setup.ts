import "@testing-library/jest-dom/vitest";

function isKnownCustomerId(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "mj" || normalized === "demo" || !normalized;
}

// Local shells may set ANDREI_CUSTOMER to a non-pack name (e.g. a project
// folder). Unknown ids throw at getDocumentType(); drop them so Vitest
// uses the demo default.
if (!isKnownCustomerId(process.env.ANDREI_CUSTOMER)) {
  delete process.env.ANDREI_CUSTOMER;
}
if (!isKnownCustomerId(process.env.NEXT_PUBLIC_ANDREI_CUSTOMER)) {
  delete process.env.NEXT_PUBLIC_ANDREI_CUSTOMER;
}
