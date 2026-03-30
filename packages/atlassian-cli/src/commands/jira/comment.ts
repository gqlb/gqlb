import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface CommentOptions {
  json?: boolean;
  verbose?: boolean;
  cloudId?: string;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function addComment(issueKey: string, body: string, options: CommentOptions) {
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

  logger.info(`\n💬 Adding comment to ${issueKey}...`);

  const payload = {
    body: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: body }],
        },
      ],
    },
  };

  const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as { id: string; author: { displayName: string }; created: string };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`✅ Comment added to ${issueKey}`);
    logger.log(`   By: ${result.author?.displayName}`);
    logger.log(`   At: ${result.created}`);
    logger.log('');
  }
}

export async function listComments(issueKey: string, options: CommentOptions) {
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

  logger.info(`\n💬 Fetching comments for ${issueKey}...`);

  const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    total: number;
    comments: Array<{ id: string; author: { displayName: string }; created: string; body: unknown }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n💬 Comments for ${issueKey} (${result.total} total):\n`);
    for (const comment of result.comments) {
      logger.log(`  [${comment.id}] ${comment.author?.displayName} @ ${comment.created}`);
    }
    logger.log('');
  }
}
