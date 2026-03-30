import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface BoardOptions {
  type?: string;
  projectKey?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  maxResults?: string;
  logger?: Logger;
}

export async function listBoards(options: BoardOptions) {
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
  if (options.type) params.set('type', options.type);
  if (options.projectKey) params.set('projectKeyOrId', options.projectKey);
  if (options.maxResults) params.set('maxResults', options.maxResults);

  const url = `${baseUrl}/rest/agile/1.0/board?${params}`;
  logger.info('\n📊 Fetching Jira boards...');

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    total: number;
    values: Array<{ id: number; name: string; type: string; location?: { projectKey: string; projectName: string } }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n📊 Boards (${result.total} total):\n`);
    for (const b of result.values) {
      const project = b.location ? ` [${b.location.projectKey}]` : '';
      logger.log(`  [${b.id}] ${b.name.padEnd(40)} (${b.type})${project}`);
    }
    logger.log('');
  }
}
