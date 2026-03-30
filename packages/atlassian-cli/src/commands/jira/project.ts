import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface ProjectOptions {
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  maxResults?: string;
  logger?: Logger;
}

export async function listProjects(options: ProjectOptions) {
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

  const maxResults = options.maxResults || '50';
  logger.info('\n📋 Fetching Jira projects...');

  const response = await fetch(
    `${baseUrl}/rest/api/3/project/search?maxResults=${maxResults}&orderBy=name`,
    { headers },
  );

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    total: number;
    values: Array<{ id: string; key: string; name: string; projectTypeKey: string }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n📋 Projects (${result.total} total):\n`);
    for (const p of result.values) {
      logger.log(`  ${p.key.padEnd(12)} ${p.name.padEnd(40)} [${p.projectTypeKey}]`);
    }
    logger.log('');
  }
}

export async function getProject(projectKey: string, options: ProjectOptions) {
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

  logger.info(`\n📋 Fetching project ${projectKey}...`);

  const response = await fetch(`${baseUrl}/rest/api/3/project/${projectKey}`, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const proj = result as { key: string; name: string; projectTypeKey: string; description?: string; lead?: { displayName: string } };
    logger.log(`\n📋 Project: ${proj.key}`);
    logger.log(`   Name:    ${proj.name}`);
    logger.log(`   Type:    ${proj.projectTypeKey}`);
    if (proj.description) logger.log(`   Desc:    ${proj.description}`);
    if (proj.lead) logger.log(`   Lead:    ${proj.lead.displayName}`);
    logger.log('');
  }
}
