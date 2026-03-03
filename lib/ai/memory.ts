/**
 * ClaudeBot Memory — GitHub knowledge base manager
 *
 * Stores persistent memory for the CEO agent in a private GitHub repo.
 * Each file is also embedded into pgvector for semantic search.
 *
 * Env vars required:
 *   GITHUB_PAT              — personal access token with repo scope
 *   GITHUB_KNOWLEDGE_OWNER  — e.g. "adamwolfe2"
 *   GITHUB_KNOWLEDGE_REPO   — e.g. "amcollective-knowledge"
 */

import { storeEmbedding, searchSimilar } from "./embeddings";

const GITHUB_API = "https://api.github.com";

function getConfig() {
  const token = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_KNOWLEDGE_OWNER;
  const repo = process.env.GITHUB_KNOWLEDGE_REPO;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo };
}

export function isMemoryConfigured(): boolean {
  return !!getConfig();
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function readMemory(path: string): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) return null;

  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`,
      { headers: githubHeaders(cfg.token) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.content) return null;
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function writeMemory(
  path: string,
  content: string,
  message: string
): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg) return false;

  try {
    // Get current SHA if file exists (required for updates)
    let sha: string | undefined;
    const existing = await fetch(
      `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`,
      { headers: githubHeaders(cfg.token) }
    );
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }

    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content).toString("base64"),
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: githubHeaders(cfg.token),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) return false;

    // Embed the content for semantic search
    await embedMemoryFile(path, content).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listMemory(prefix = ""): Promise<string[]> {
  const cfg = getConfig();
  if (!cfg) return [];

  try {
    const url = prefix
      ? `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents/${prefix}`
      : `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents`;

    const res = await fetch(url, { headers: githubHeaders(cfg.token) });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const paths: string[] = [];
    for (const item of data) {
      if (item.type === "file") {
        paths.push(item.path as string);
      } else if (item.type === "dir") {
        const subPaths = await listMemory(item.path as string);
        paths.push(...subPaths);
      }
    }
    return paths;
  } catch {
    return [];
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchMemory(
  query: string,
  limit = 5
): Promise<Array<{ path: string; content: string; similarity: number }>> {
  const results = await searchSimilar(query, limit, "sop");
  return results
    .filter((r) => r.sourceType === "sop" && r.sourceId?.startsWith("memory:"))
    .map((r) => ({
      path: (r.sourceId ?? "").replace("memory:", ""),
      content: r.content,
      similarity: r.similarity,
    }));
}

// ─── Embed ────────────────────────────────────────────────────────────────────

export async function embedMemoryFile(
  path: string,
  content: string
): Promise<void> {
  await storeEmbedding(content, "sop", `memory:${path}`, { path });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/** Initialize the knowledge repo with default files on first run */
export async function bootstrapMemory(): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return;

  const defaultFiles: Record<string, string> = {
    "README.md": `# AM Collective Knowledge Base\n\nPersistent memory for ClaudeBot CEO.\n\nUpdated automatically during conversations.\n`,
    "people/adam.md": `# Adam Wolfe — CTO\n\n## Role\nCTO of AM Collective Capital. Focuses on building and selling.\n\n## Working Style\n- Prefers async communication\n- Direct, no fluff\n- Technical depth matters\n\n## Current Context\n_Updated by ClaudeBot during conversations._\n`,
    "people/maggie.md": `# Maggie — COO\n\n## Role\nCOO of AM Collective Capital. Focuses on operations and selling.\n\n## Working Style\n_Updated by ClaudeBot during conversations._\n`,
    "company/strategy.md": `# Company Strategy\n\n## Current Goals\n_Updated by ClaudeBot during conversations._\n\n## Products\n- TBGC — B2B wholesale food distribution portal\n- Trackr — AI tool intelligence layer\n- Cursive — Multi-tenant SaaS lead marketplace\n- TaskSpace — Internal team management / EOS\n- Wholesail — White-label B2B distribution portal\n- Hook — AI-powered viral content platform\n`,
    "notes/.gitkeep": "",
    "decisions/.gitkeep": "",
  };

  for (const [path, content] of Object.entries(defaultFiles)) {
    if (!content) continue;
    const existing = await readMemory(path);
    if (!existing) {
      await writeMemory(path, content, `Bootstrap: ${path}`);
    }
  }
}
