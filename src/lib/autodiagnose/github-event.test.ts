import { describe, expect, it } from "vitest";
import { parseAutodiagnoseEvent } from "./github-event";

describe("parseAutodiagnoseEvent", () => {
  it("parses GitHub deployment_status failures", () => {
    const event = parseAutodiagnoseEvent({
      eventName: "deployment_status",
      payload: {
        deployment: { sha: "deadbeef", ref: "main", environment: "Production" },
        deployment_status: {
          state: "failure",
          description: "Type error: src/lib/foo.ts",
          log_url: "https://vercel.com/logs/1",
          environment: "Production",
          environment_url: "https://mj.andreihealth.com",
        },
      },
    });
    expect(event.source).toBe("deployment_status");
    expect(event.environment).toBe("Production");
    expect(event.sha).toBe("deadbeef");
    expect(event.text).toContain("Type error");
    expect(event.logUrl).toBe("https://vercel.com/logs/1");
  });

  it("parses Vercel deployment.error webhooks", () => {
    const event = parseAutodiagnoseEvent({
      eventName: "repository_dispatch",
      payload: {
        type: "deployment.error",
        payload: {
          target: "production",
          deployment: {
            name: "andrei-v2",
            url: "andrei-v2-abc.vercel.app",
            meta: {
              githubCommitSha: "cafebabe",
              githubCommitRef: "main",
            },
          },
          links: { deployment: "https://vercel.com/inspect" },
          errorMessage: "Failed to compile",
        },
      },
    });
    expect(event.source).toBe("vercel_webhook");
    expect(event.environment).toBe("production");
    expect(event.projectName).toBe("andrei-v2");
    expect(event.sha).toBe("cafebabe");
    expect(event.text).toContain("Failed to compile");
  });

  it("parses a runtime client_payload", () => {
    const event = parseAutodiagnoseEvent({
      eventName: "repository_dispatch",
      payload: {
        client_payload: {
          source: "runtime",
          environment: "production",
          projectName: "andrei-demo",
          text: "FUNCTION_INVOCATION_FAILED",
        },
      },
    });
    expect(event.source).toBe("runtime");
    expect(event.text).toBe("FUNCTION_INVOCATION_FAILED");
  });

  it("reads workflow_dispatch inputs from env", () => {
    const event = parseAutodiagnoseEvent({
      eventName: "workflow_dispatch",
      payload: {},
      env: {
        INPUT_ERROR_TEXT: "manual boom",
        INPUT_ENVIRONMENT: "production",
        INPUT_PROJECT_NAME: "andrei-v2",
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(event.source).toBe("manual");
    expect(event.text).toBe("manual boom");
    expect(event.projectName).toBe("andrei-v2");
  });
});
