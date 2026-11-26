const PROJECT_ID_RE = /^prj_[A-Za-z0-9]+$/;
const WIF_AUDIENCE_RE =
  /^\/\/iam\.googleapis\.com\/projects\/(\d+)\/locations\/global\/workloadIdentityPools\/([^/]+)\/providers\/([^/]+)$/;
const IN_LIST_RE = /assertion\.project_id\s+in\s*\[([^\]]*)\]/;
const EQ_CHAIN_RE =
  /assertion\.project_id\s*==\s*['"]prj_[A-Za-z0-9]+['"](\s*\|\|\s*assertion\.project_id\s*==\s*['"]prj_[A-Za-z0-9]+['"])*/;

export type WifAudienceParts = {
  projectNumber: string;
  pool: string;
  provider: string;
};

export function parseWifAudience(audience: string): WifAudienceParts {
  const match = audience.trim().match(WIF_AUDIENCE_RE);
  if (!match) {
    throw new Error(
      "GCP_WIF_AUDIENCE must look like //iam.googleapis.com/projects/{number}/locations/global/workloadIdentityPools/{pool}/providers/{provider}"
    );
  }
  return {
    projectNumber: match[1],
    pool: match[2],
    provider: match[3],
  };
}

function quotedProjectIds(text: string): string[] {
  return [...text.matchAll(/['"](prj_[A-Za-z0-9]+)['"]/g)].map((match) => match[1]);
}

function inListExpression(ids: string[]): string {
  return `assertion.project_id in [${ids.map((id) => `'${id}'`).join(", ")}]`;
}

/**
 * Append a Vercel project id to a GCP WIF provider attribute condition.
 * New customer deploys fail chat/ingest with STS `rejected by the attribute
 * condition` until the `prj_…` is listed.
 */
export function addVercelProjectToAttributeCondition(
  condition: string,
  projectId: string
): string {
  if (!PROJECT_ID_RE.test(projectId)) {
    throw new Error(`Invalid Vercel project id "${projectId}" (expected prj_…)`);
  }

  const trimmed = condition.trim();
  if (!trimmed) {
    return `assertion.project_id == '${projectId}'`;
  }
  if (trimmed.includes(projectId)) {
    return trimmed;
  }

  const inMatch = trimmed.match(IN_LIST_RE);
  if (inMatch) {
    const existing = quotedProjectIds(inMatch[1]);
    const ids = existing.includes(projectId)
      ? existing
      : [...existing, projectId];
    return trimmed.replace(inMatch[0], inListExpression(ids));
  }

  const eqs = [
    ...trimmed.matchAll(
      /assertion\.project_id\s*==\s*['"](prj_[A-Za-z0-9]+)['"]/g
    ),
  ].map((match) => match[1]);
  if (eqs.length > 0 && EQ_CHAIN_RE.test(trimmed)) {
    const ids = [...new Set([...eqs, projectId])];
    return trimmed.replace(EQ_CHAIN_RE, inListExpression(ids));
  }

  throw new Error(
    `Cannot automatically add ${projectId} to the WIF attribute condition. Current condition:\n${trimmed}`
  );
}
