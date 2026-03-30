import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface CreateIssueOptions {
  project?: string;
  type?: string;
  priority?: string;
  assignee?: string;
  labels?: string;
  parent?: string;
  json?: boolean;
  verbose?: boolean;
  cloudId?: string;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function createIssue(summary: string, options: CreateIssueOptions) {
  const logger = options.logger || createLogger(options.json ? false : (options.verbose || false));

  const config = await loadConfig();
  const baseUrl = config.baseUrl || options.url || ATLASSIAN_DEFAULTS.API_BASE_URL;

  let token = options.token || process.env.ATLASSIAN_TOKEN;
  if (!token) token = (await getValidToken()) || undefined;

  if (!token) {
    logger.error('❌ Error: Not authenticated. Run: atlassian auth login');
    process.exit(1);
  }

  const projectKey = options.project || process.env.ATLASSIAN_PROJECT;
  if (!projectKey) {
    logger.error('❌ Error: Project key required. Use --project <key>');
    process.exit(1);
  }

  const authType = config.auth?.type === 'token' ? 'Basic' : 'Bearer';
  const headers: Record<string, string> = {
    Authorization: `${authType} ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const body: Record<string, unknown> = {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: options.type || 'Task' },
    },
  };

  if (options.priority) {
    (body.fields as Record<string, unknown>)['priority'] = { name: options.priority };
  }
  if (options.assignee) {
    (body.fields as Record<string, unknown>)['assignee'] = { accountId: options.assignee };
  }
  if (options.labels) {
    (body.fields as Record<string, unknown>)['labels'] = options.labels.split(',').map(l => l.trim());
  }
  if (options.parent) {
    (body.fields as Record<string, unknown>)['parent'] = { key: options.parent };
  }

  logger.info(`\n📝 Creating issue in project ${projectKey}...`);

  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as { id: string; key: string; self: string };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`✅ Issue created: ${result.key}`);
    logger.log(`   URL: ${baseUrl}/browse/${result.key}`);
    logger.log('');
  }
}
