const NEON_API_BASE = "https://console.neon.tech/api/v2";

type NeonBranch = {
  id: string;
  name: string;
  created_at?: string;
};

type NeonListBranchesResponse = {
  branches: NeonBranch[];
};

export function previewBranchNameCandidates(input: {
  gitRef: string;
  prNumber?: string | number | null;
}): string[] {
  const gitRef = input.gitRef.trim();
  if (!gitRef) return [];

  const names = new Set<string>([`preview/${gitRef}`]);
  const prNumber =
    input.prNumber === undefined || input.prNumber === null
      ? ""
      : String(input.prNumber).trim();
  if (prNumber) {
    names.add(`preview/pr-${prNumber}-${gitRef}`);
  }
  return [...names];
}

function neonApiKey(): string | undefined {
  const key = process.env.NEON_API_KEY?.trim();
  return key || undefined;
}

function neonProjectId(): string | undefined {
  const id = process.env.NEON_PROJECT_ID?.trim();
  return id || undefined;
}

export function canAutoHealStaleNeonPreview(): boolean {
  return Boolean(neonApiKey() && neonProjectId());
}

async function neonFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const apiKey = neonApiKey();
  if (!apiKey) {
    throw new Error("NEON_API_KEY is not set");
  }

  const response = await fetch(`${NEON_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Neon API ${init?.method ?? "GET"} ${path} failed (${response.status}): ${body}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function listBranches(projectId: string): Promise<NeonBranch[]> {
  const data = await neonFetch<NeonListBranchesResponse>(
    `/projects/${projectId}/branches`
  );
  return data.branches ?? [];
}

async function deleteBranch(
  projectId: string,
  branchId: string
): Promise<void> {
  await neonFetch<void>(`/projects/${projectId}/branches/${branchId}`, {
    method: "DELETE",
  });
}

export async function deleteNeonPreviewBranchesForGitRef(input: {
  gitRef: string;
  prNumber?: string | number | null;
  projectId?: string;
}): Promise<{ deleted: string[]; missing: string[] }> {
  const projectId = input.projectId?.trim() || neonProjectId();
  if (!projectId) {
    throw new Error("NEON_PROJECT_ID is not set");
  }

  const candidates = previewBranchNameCandidates(input);
  if (candidates.length === 0) {
    return { deleted: [], missing: [] };
  }

  const branches = await listBranches(projectId);
  const byName = new Map(branches.map((branch) => [branch.name, branch]));

  const deleted: string[] = [];
  const missing: string[] = [];

  for (const name of candidates) {
    const branch = byName.get(name);
    if (!branch) {
      missing.push(name);
      continue;
    }
    await deleteBranch(projectId, branch.id);
    deleted.push(name);
  }

  return { deleted, missing };
}

export async function deleteStaleNeonPreviewBranches(input: {
  projectId: string;
  olderThanMs: number;
  now?: number;
}): Promise<{ deleted: string[]; kept: string[] }> {
  const now = input.now ?? Date.now();
  const cutoff = now - input.olderThanMs;
  const branches = await listBranches(input.projectId);

  const deleted: string[] = [];
  const kept: string[] = [];

  for (const branch of branches) {
    if (!branch.name.startsWith("preview/")) continue;

    const createdAt = branch.created_at
      ? Date.parse(branch.created_at)
      : Number.NaN;
    if (!Number.isFinite(createdAt) || createdAt > cutoff) {
      kept.push(branch.name);
      continue;
    }

    await deleteBranch(input.projectId, branch.id);
    deleted.push(branch.name);
  }

  return { deleted, kept };
}
