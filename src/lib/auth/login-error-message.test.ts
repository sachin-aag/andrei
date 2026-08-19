import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./login-error-message";

describe("loginErrorMessage", () => {
  it("returns null when no error is present", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
  });

  it("explains expired or invalid magic links", () => {
    expect(loginErrorMessage("Verification")).toMatch(/invalid or has expired/i);
  });

  it("explains access denied", () => {
    expect(loginErrorMessage("AccessDenied")).toMatch(/isn't allowed/i);
  });

  it("explains configuration failures", () => {
    expect(loginErrorMessage("Configuration")).toMatch(/temporarily unavailable/i);
  });

  it("falls back for unknown codes", () => {
    expect(loginErrorMessage("Default")).toMatch(/something went wrong/i);
  });
});
