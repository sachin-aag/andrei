/**
 * Neon project ids for per-git-ref preview branches.
 *
 * GitHub Actions variables (`NEON_PROJECT_ID_*`) are optional overrides.
 * Cleanup must not depend on those vars being set — unset ids previously
 * skipped 3xper (and demo / convergent / mj) while `preview/<git-branch>`
 * rows kept accumulating.
 *
 * These ids are public Neon project slugs (also in docs/neon-vercel-setup.md).
 */
export const CUSTOMER_NEON_PREVIEW_PROJECTS = [
  {
    label: "mj",
    id: "blue-block-88692066",
    envVar: "NEON_PROJECT_ID_MJ",
  },
  {
    label: "demo",
    id: "bold-field-45608643",
    envVar: "NEON_PROJECT_ID_DEMO",
  },
  {
    label: "convergent",
    id: "cold-thunder-36255681",
    envVar: "NEON_PROJECT_ID_CONVERGENT",
  },
  {
    label: "3xper",
    id: "dark-salad-24878113",
    envVar: "NEON_PROJECT_ID_3XPER",
  },
] as const;

export type NeonPreviewProject = {
  label: string;
  id: string;
};

const PROTECTED_GIT_REFS = new Set(["main", "master"]);

export function isProtectedGitRef(ref: string): boolean {
  return PROTECTED_GIT_REFS.has(ref.trim());
}

/**
 * Resolve customer Neon projects for preview-branch cleanup.
 *
 * - `NEON_PROJECT_ID` set → that project only (local / one-off).
 * - otherwise every known pack, with `NEON_PROJECT_ID_*` env overriding
 *   the hardcoded id when non-empty.
 */
export function resolveNeonPreviewProjectIds(
  env: Record<string, string | undefined> = process.env
): NeonPreviewProject[] {
  const only = env.NEON_PROJECT_ID?.trim();
  if (only) {
    return [{ label: "explicit", id: only }];
  }

  const seen = new Set<string>();
  const projects: NeonPreviewProject[] = [];
  for (const project of CUSTOMER_NEON_PREVIEW_PROJECTS) {
    const id = env[project.envVar]?.trim() || project.id;
    if (seen.has(id)) continue;
    seen.add(id);
    projects.push({ label: project.label, id });
  }
  return projects;
}
