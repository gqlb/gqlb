import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface TransitionOptions {
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function listTransitions(issueKey: string, options: TransitionOptions) {
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

  const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    transitions: Array<{ id: string; name: string; to: { name: string } }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n🔄 Available transitions for ${issueKey}:\n`);
    for (const t of result.transitions) {
      logger.log(`  [${t.id}] ${t.name} → ${t.to?.name}`);
    }
    logger.log('');
  }
}

export async function transitionIssue(issueKey: string, transitionId: string, options: TransitionOptions) {
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
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  logger.info(`\n🔄 Transitioning ${issueKey} with transition ID: ${transitionId}...`);

  const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify({ success: true, issueKey, transitionId }, null, 2));
  } else {
    logger.log(`✅ Issue ${issueKey} transitioned successfully`);
    logger.log('');
  }
}
