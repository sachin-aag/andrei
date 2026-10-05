import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceBundleInflight,
  fetchWorkspaceBundle,
  normalizeWorkspaceBundle,
  workspaceLoadErrorMessage,
  WorkspaceLoadError,
} from "./report-workspace-bundle";
import type { ReportBundle } from "@/types/report";

afterEach(() => {
  clearWorkspaceBundleInflight();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("workspaceLoadErrorMessage", () => {
  it("explains missing, forbidden, and hung reports", () => {
    expect(workspaceLoadErrorMessage(401)).toBe(
      "Your session has expired. Sign in again to open this report."
    );
    expect(workspaceLoadErrorMessage(404)).toBe("This report was not found.");
    expect(workspaceLoadErrorMessage(403)).toBe(
      "You do not have access to this report."
    );
    expect(workspaceLoadErrorMessage(500)).toBe(
      "The report could not be loaded."
    );
    expect(workspaceLoadErrorMessage(0, true)).toBe(
      "This report is taking too long to load. Refresh the page to try again."
    );
  });
});

describe("normalizeWorkspaceBundle", () => {
  it("fills attachments when GET omits them", () => {
    const data = {
      report: { id: "r1" },
      sections: [],
      evaluations: [],
      comments: [],
    } as unknown as ReportBundle;
    expect(normalizeWorkspaceBundle(data)).toEqual({
      ...data,
      attachments: [],
      attachmentFolders: [],
    });
  });
});

describe("fetchWorkspaceBundle", () => {
  it("coalesces concurrent GETs for the same report", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchWorkspaceBundle("r1");
    const second = fetchWorkspaceBundle("r1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(
      new Response(
        JSON.stringify({
          report: { id: "r1" },
          sections: [],
          evaluations: [],
          comments: [],
        }),
        { status: 200 }
      )
    );

    const [a, b] = await Promise.all([first, second]);
    expect(a.attachments).toEqual([]);
    expect(b.report).toEqual(a.report);
  });

  it("sends the workspace load id on the bundle GET", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            report: { id: "r1" },
            sections: [],
            evaluations: [],
            comments: [],
          }),
          { status: 200 }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWorkspaceBundle("r1", { loadId: "load-1" });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-workspace-load-id")).toBe("load-1");
  });

  it("times out a GET that never answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      )
    );

    await expect(
      fetchWorkspaceBundle("r-hang", { timeoutMs: 20 })
    ).rejects.toMatchObject({
      name: "WorkspaceLoadError",
      timedOut: true,
    } satisfies Partial<WorkspaceLoadError>);
  });

  it("surfaces HTTP errors instead of spinning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 401 })))
    );

    await expect(fetchWorkspaceBundle("r-auth")).rejects.toMatchObject({
      status: 401,
      timedOut: false,
    });
  });
});
