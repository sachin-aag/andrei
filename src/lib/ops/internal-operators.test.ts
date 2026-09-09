import { describe, expect, it } from "vitest";
import {
  emailLocalPartBase,
  isInternalOperator,
  isInternalOperatorEmail,
} from "./internal-operators";

describe("internal operators", () => {
  it("treats plus-aliases of Sachin and Aditya as operators", () => {
    expect(emailLocalPartBase("Sachin+Admin@AndreiHealth.com")).toBe("sachin");
    expect(isInternalOperatorEmail("sachin@andreihealth.com")).toBe(true);
    expect(isInternalOperatorEmail("aditya+manager@andreihealth.com")).toBe(
      true
    );
    expect(isInternalOperatorEmail("engineer@mjbiopharm.com")).toBe(false);
  });

  it("matches first-name fallback when the mailbox is not a plus-alias", () => {
    expect(
      isInternalOperator({
        name: "Sachin Patel",
        email: "sp@mjbiopharm.com",
      })
    ).toBe(true);
    expect(
      isInternalOperator({
        name: "Priya Engineer",
        email: "priya@mjbiopharm.com",
      })
    ).toBe(false);
  });
});
