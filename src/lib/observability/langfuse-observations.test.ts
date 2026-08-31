import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  groupObservationsByTraceId,
  LANGFUSE_OBSERVATIONS_V2_PATH,
  listObservations,
  listObservationsForTrace,
  listRootObservations,
  observationTimeRange,
  observationsV2Url,
  sessionIdFilter,
  TRACE_REPLACEMENT_FIELDS,
} from "@/lib/observability/langfuse-observations";

describe("Langfuse observations v2 (replaces GET /traces)", () => {
  const fromStartTime = "2026-08-30T00:00:00.000Z";
  const toStartTime = "2026-08-31T00:00:00.000Z";

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
    vi.stubEnv("LANGFUSE_HOST", "https://langfuse.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds the v2 observations path, never /api/public/traces", () => {
    const url = observationsV2Url({
      fromStartTime,
      toStartTime,
      traceId: "tr-1",
      fields: TRACE_REPLACEMENT_FIELDS,
    });
    expect(url).toContain(LANGFUSE_OBSERVATIONS_V2_PATH);
    expect(url).toContain("fromStartTime=2026-08-30T00%3A00%3A00.000Z");
    expect(url).toContain("toStartTime=2026-08-31T00%3A00%3A00.000Z");
    expect(url).toContain("traceId=tr-1");
    expect(url).not.toContain("/api/public/traces");
    expect(LANGFUSE_OBSERVATIONS_V2_PATH).toBe("/api/public/v2/observations");
  });

  it("requires a bounded time range", () => {
    expect(() =>
      observationsV2Url({
        fromStartTime: "",
        toStartTime,
      })
    ).toThrow(/fromStartTime and toStartTime are required/);
  });

  it("encodes a sessionId filter for former GET /sessions/{id}", () => {
    const url = observationsV2Url({
      fromStartTime,
      toStartTime,
      filter: sessionIdFilter("chat-42"),
    });
    const parsed = new URL(url);
    expect(JSON.parse(parsed.searchParams.get("filter") ?? "[]")).toEqual([
      {
        type: "string",
        column: "sessionId",
        operator: "=",
        value: "chat-42",
      },
    ]);
  });

  it("lists observations through v2 and follows the cursor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "obs-1", traceId: "tr-1", startTime: fromStartTime }],
          meta: { cursor: "cursor-2" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "obs-2", traceId: "tr-1", startTime: fromStartTime }],
          meta: {},
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const first = await listObservations({ fromStartTime, toStartTime, limit: 1 });
    expect(first.cursor).toBe("cursor-2");
    const second = await listObservations({
      fromStartTime,
      toStartTime,
      limit: 1,
      cursor: first.cursor ?? undefined,
    });
    expect(second.data.map((row) => row.id)).toEqual(["obs-2"]);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("/api/public/v2/observations");
    expect(urls[1]).toContain("cursor=cursor-2");
    expect(urls.join("\n")).not.toContain("/api/public/traces");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );
  });

  it("replaces GET /traces/{id} with traceId-filtered observations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "root",
            traceId: "tr-9",
            parentObservationId: null,
            isRootObservation: true,
            startTime: fromStartTime,
          },
          {
            id: "child",
            traceId: "tr-9",
            parentObservationId: "root",
            startTime: fromStartTime,
          },
        ],
        meta: {},
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await listObservationsForTrace("tr-9", {
      fromStartTime,
      toStartTime,
    });
    expect(rows).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("traceId=tr-9");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(
      "/api/public/traces/"
    );
  });

  it("replaces GET /traces with logical-root observations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "root-a",
            traceId: "tr-a",
            isRootObservation: true,
            startTime: fromStartTime,
          },
        ],
        meta: {},
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await listRootObservations({ fromStartTime, toStartTime });
    expect(rows[0]?.traceId).toBe("tr-a");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "isRootObservation=true"
    );
  });

  it("groups observation rows by traceId", () => {
    const grouped = groupObservationsByTraceId([
      { id: "a", traceId: "t1", startTime: fromStartTime },
      { id: "b", traceId: "t2", startTime: fromStartTime },
      { id: "c", traceId: "t1", startTime: fromStartTime },
    ]);
    expect([...grouped.keys()]).toEqual(["t1", "t2"]);
    expect(grouped.get("t1")?.map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("builds a 24h window when hours are omitted", () => {
    const range = observationTimeRange({
      toStartTime: "2026-08-31T12:00:00.000Z",
      hours: 24,
    });
    expect(range.toStartTime).toBe("2026-08-31T12:00:00.000Z");
    expect(range.fromStartTime).toBe("2026-08-30T12:00:00.000Z");
  });
});
