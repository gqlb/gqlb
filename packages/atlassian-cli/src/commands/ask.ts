/**
 * `ask` command - Pipe a question plus Atlassian context to an AI agent
 *
 * Supported agents: claude, codex, chatgpt, gemini, ollama, docker, custom
 *
 * Usage:
 *   atlassian ask "Summarise the last 5 issues in project DEMO" --agent claude
 *   atlassian ask "What blockers are in the current sprint?" --agent codex
 *   atlassian ask "Draft a release note" --agent "docker run --rm my-agent"
 *   atlassian ask --jql "project=DEMO ORDER BY created DESC" --agent claude
 *
 * How it works:
 *   1. Optional: fetch Jira/Confluence context (issues, pages, etc.)
 *   2. Build a prompt that combines the context with the user question
 *   3. Spawn the agent process and pipe the prompt to its stdin
 *   4. Print the agent's stdout/stderr
 */

import { spawn } from 'child_process';
import { getValidToken, loadConfig } from '../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../constants.js';
import type { Logger } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';

export interface AskCommandOptions {
  agent?: string;
  jql?: string;
  pageId?: string;
  spaceKey?: string;
  limit?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  dryRun?: boolean;
  logger?: Logger;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJiraContext(
  jql: string,
  limit: number,
  baseUrl: string,
  authHeader: string,
): Promise<string> {
  const params = new URLSearchParams({
    jql,
    maxResults: String(limit),
    fields: 'summary,status,assignee,priority,description,comment',
  });

  const response = await fetch(`${baseUrl}/rest/api/3/search?${params}`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });

  if (!response.ok) return '';

  const data = await response.json() as {
    total: number;
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        status?: { name: string };
        assignee?: { displayName: string };
        priority?: { name: string };
        description?: unknown;
      };
    }>;
  };

  const lines: string[] = [`Jira issues (${data.total} total, showing ${data.issues.length}):\n`];
  for (const issue of data.issues) {
    const f = issue.fields;
    lines.push(`• ${issue.key}: ${f.summary}`);
    if (f.status) lines.push(`  Status: ${f.status.name}`);
    if (f.assignee) lines.push(`  Assignee: ${f.assignee.displayName}`);
    if (f.priority) lines.push(`  Priority: ${f.priority.name}`);
  }
  return lines.join('\n');
}

async function fetchConfluencePage(
  pageId: string,
  baseUrl: string,
  authHeader: string,
): Promise<string> {
  const response = await fetch(
    `${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage,space,version`,
    { headers: { Authorization: authHeader, Accept: 'application/json' } },
  );

  if (!response.ok) return '';

  const page = await response.json() as {
    title: string;
    space?: { name: string };
    version?: { number: number };
    body?: { storage?: { value: string } };
  };

  // Strip HTML tags for best-effort plain-text context.
  // The Confluence REST API doesn't expose a plain-text representation via
  // the storage format endpoint, so this regex approach is intentional.
  const rawBody = page.body?.storage?.value || '';
  const plainText = rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return [
    `Confluence page: "${page.title}"`,
    page.space ? `Space: ${page.space.name}` : '',
    page.version ? `Version: ${page.version.number}` : '',
    '',
    plainText.substring(0, 4000),
  ]
    .filter(Boolean)
    .join('\n');
}

async function fetchSpacePages(
  spaceKey: string,
  limit: number,
  baseUrl: string,
  authHeader: string,
): Promise<string> {
  const params = new URLSearchParams({
    spaceKey,
    type: 'page',
    limit: String(limit),
    expand: 'space',
  });

  const response = await fetch(`${baseUrl}/wiki/rest/api/content?${params}`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });

  if (!response.ok) return '';

  const data = await response.json() as {
    size: number;
    results: Array<{ id: string; title: string }>;
  };

  const lines = [`Confluence pages in space ${spaceKey} (${data.size} shown):\n`];
  for (const p of data.results) {
    lines.push(`• [${p.id}] ${p.title}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Resolve agent command
// ---------------------------------------------------------------------------

function resolveAgentCommand(agent: string): { cmd: string; args: string[] } {
  const aliases: Record<string, { cmd: string; args: string[] }> = {
    claude: { cmd: 'claude', args: [] },
    codex: { cmd: 'codex', args: [] },
    chatgpt: { cmd: 'chatgpt', args: [] },
    gemini: { cmd: 'gemini', args: [] },
    ollama: { cmd: 'ollama', args: ['run', 'llama3'] },
  };

  const lower = agent.toLowerCase().split(' ')[0];
  if (aliases[lower]) return aliases[lower];

  // Treat as raw shell command (e.g. "docker run --rm my-agent")
  const parts = agent.split(' ').filter(Boolean);
  return { cmd: parts[0], args: parts.slice(1) };
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function askCommand(question: string | undefined, options: AskCommandOptions) {
  const logger = options.logger || createLogger(options.verbose || false);

  const agentName = options.agent || process.env.ATLASSIAN_ASK_AGENT || 'claude';

  const config = await loadConfig();
  const baseUrl = options.url || config.baseUrl || ATLASSIAN_DEFAULTS.API_BASE_URL;

  let token = options.token || process.env.ATLASSIAN_TOKEN;
  if (!token) token = (await getValidToken()) || undefined;

  const authHeader = token
    ? `${config.auth?.type === 'token' ? 'Basic' : 'Bearer'} ${token}`
    : '';

  // Gather optional context sections
  const contextSections: string[] = [];

  if (authHeader) {
    if (options.jql) {
      const limit = parseInt(options.limit || '10', 10);
      logger.info(`\n🔍 Fetching Jira context: ${options.jql}`);
      const ctx = await fetchJiraContext(options.jql, limit, baseUrl, authHeader);
      if (ctx) contextSections.push(ctx);
    }

    if (options.pageId) {
      logger.info(`\n📄 Fetching Confluence page ${options.pageId}`);
      const ctx = await fetchConfluencePage(options.pageId, baseUrl, authHeader);
      if (ctx) contextSections.push(ctx);
    }

    if (options.spaceKey) {
      const limit = parseInt(options.limit || '20', 10);
      logger.info(`\n🗂️  Fetching Confluence space ${options.spaceKey}`);
      const ctx = await fetchSpacePages(options.spaceKey, limit, baseUrl, authHeader);
      if (ctx) contextSections.push(ctx);
    }
  }

  // Build prompt
  const parts: string[] = [];

  if (contextSections.length > 0) {
    parts.push('=== Atlassian Context ===');
    parts.push(contextSections.join('\n\n'));
    parts.push('=== End Context ===\n');
  }

  if (question) {
    parts.push(question);
  }

  const prompt = parts.join('\n');

  if (!prompt.trim()) {
    logger.error('❌ Error: No question provided and no context fetched');
    process.exit(1);
  }

  if (options.dryRun) {
    logger.log('\n📋 Prompt that would be sent to agent:\n');
    console.log(prompt);
    return;
  }

  // Spawn agent
  const { cmd, args } = resolveAgentCommand(agentName);
  logger.info(`\n🤖 Sending to agent: ${cmd} ${args.join(' ')}`);

  const child = spawn(cmd, args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
  });

  child.stdin.write(prompt);
  child.stdin.end();

  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Agent process exited with code ${code}`));
      }
    });
    child.on('error', (err) => {
      reject(new Error(`Failed to spawn agent "${cmd}": ${err.message}`));
    });
  });
}
