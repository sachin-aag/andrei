import type {
  StatisticalWorkspaceSummary,
  StatisticalWorkspaceView,
} from "./types";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Body may be empty or HTML.
  }
  return `Request failed (${response.status})`;
}

async function parseWorkspace(response: Response): Promise<StatisticalWorkspaceView> {
  const body = (await response.json()) as { workspace: StatisticalWorkspaceView };
  return body.workspace;
}

export async function listStatisticalWorkspaces(): Promise<
  StatisticalWorkspaceSummary[]
> {
  const response = await fetch("/api/statistical-analysis/workspaces");
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as {
    workspaces: StatisticalWorkspaceSummary[];
  };
  return body.workspaces;
}

export async function createStatisticalWorkspace(
  name?: string
): Promise<StatisticalWorkspaceView> {
  const response = await fetch("/api/statistical-analysis/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  if (!response.ok) throw new Error(await readError(response));
  return parseWorkspace(response);
}

export async function patchStatisticalWorkspace(
  workspaceId: string,
  body: { name?: string; worksheet?: StatisticalWorkspaceView["worksheet"] },
  signal?: AbortSignal
): Promise<StatisticalWorkspaceView> {
  const response = await fetch(
    `/api/statistical-analysis/workspaces/${workspaceId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseWorkspace(response);
}

export async function deleteStatisticalWorkspace(
  workspaceId: string
): Promise<void> {
  const response = await fetch(
    `/api/statistical-analysis/workspaces/${workspaceId}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(await readError(response));
}

export async function createCapabilitySixpack(
  workspaceId: string,
  input: {
    columnId: string;
    title?: string;
    lsl: number | null;
    usl: number | null;
    target: number | null;
  }
): Promise<StatisticalWorkspaceView> {
  const response = await fetch(
    `/api/statistical-analysis/workspaces/${workspaceId}/analyses`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseWorkspace(response);
}

export async function recomputeCapabilitySixpack(
  workspaceId: string,
  analysisId: string
): Promise<StatisticalWorkspaceView> {
  const response = await fetch(
    `/api/statistical-analysis/workspaces/${workspaceId}/analyses/${analysisId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recompute" }),
    }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseWorkspace(response);
}

export async function deleteCapabilitySixpack(
  workspaceId: string,
  analysisId: string
): Promise<StatisticalWorkspaceView> {
  const response = await fetch(
    `/api/statistical-analysis/workspaces/${workspaceId}/analyses/${analysisId}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseWorkspace(response);
}
