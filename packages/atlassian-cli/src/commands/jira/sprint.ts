import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface SprintOptions {
  state?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  maxResults?: string;
  logger?: Logger;
}

export async function listSprints(boardId: string, options: SprintOptions) {
  const logger = options.logger || createLogger(options.json ? false : (options.verbose || false));

  const config = await loadConfig();
  const baseUrl = config.baseUrl || options.url || ATLASSIAN_DEFAULTS.API_BASE_URL;

  let token = options.token || process.env.ATLASSIAN_TOKEN;
  if (!token) token = (await getValidToken()) || undefined;

  if (!token) {
    logger.error('❌ Error: Not authenticated. Run: atlassian auth login');
    process.exit(1);
  }

  const authType = config.auth?.type === 'token' ? 'Basic' : 'Bearer';
  const headers: Record<string, string> = {
    Authorization: `${authType} ${token}`,
    Accept: 'application/json',
  };

  const params = new URLSearchParams();
  if (options.state) params.set('state', options.state);
  if (options.maxResults) params.set('maxResults', options.maxResults);

  const url = `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?${params}`;
  logger.info(`\n🏃 Fetching sprints for board ${boardId}...`);

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    total: number;
    values: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n🏃 Sprints for board ${boardId} (${result.total} total):\n`);
    for (const s of result.values) {
      logger.log(`  [${s.id}] ${s.name.padEnd(40)} [${s.state}]`);
      if (s.startDate) logger.log(`        Start: ${s.startDate} → End: ${s.endDate}`);
    }
    logger.log('');
  }
}

export async function getSprintIssues(sprintId: string, options: SprintOptions) {
  const logger = options.logger || createLogger(options.json ? false : (options.verbose || false));

  const config = await loadConfig();
  const baseUrl = config.baseUrl || options.url || ATLASSIAN_DEFAULTS.API_BASE_URL;

  let token = options.token || process.env.ATLASSIAN_TOKEN;
  if (!token) token = (await getValidToken()) || undefined;

  if (!token) {
    logger.error('❌ Error: Not authenticated. Run: atlassian auth login');
    process.exit(1);
  }

  const authType = config.auth?.type === 'token' ? 'Basic' : 'Bearer';
  const headers: Record<string, string> = {
    Authorization: `${authType} ${token}`,
    Accept: 'application/json',
  };

  const params = new URLSearchParams();
  if (options.maxResults) params.set('maxResults', options.maxResults);

  const url = `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue?${params}`;
  logger.info(`\n📋 Fetching issues for sprint ${sprintId}...`);

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    total: number;
    issues: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; assignee?: { displayName: string } } }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n📋 Sprint ${sprintId} issues (${result.total} total):\n`);
    for (const issue of result.issues) {
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      logger.log(`  ${issue.key.padEnd(14)} ${issue.fields.summary.substring(0, 50).padEnd(50)} [${issue.fields.status.name}] ${assignee}`);
    }
    logger.log('');
  }
}
