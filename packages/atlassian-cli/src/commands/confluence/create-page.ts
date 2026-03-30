import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface CreatePageOptions {
  spaceKey?: string;
  parentId?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function createPage(title: string, content: string, options: CreatePageOptions) {
  const logger = options.logger || createLogger(options.json ? false : (options.verbose || false));

  const config = await loadConfig();
  const baseUrl = config.baseUrl || options.url || ATLASSIAN_DEFAULTS.API_BASE_URL;

  let token = options.token || process.env.ATLASSIAN_TOKEN;
  if (!token) token = (await getValidToken()) || undefined;

  if (!token) {
    logger.error('❌ Error: Not authenticated. Run: atlassian auth login');
    process.exit(1);
  }

  const spaceKey = options.spaceKey || process.env.CONFLUENCE_SPACE_KEY;
  if (!spaceKey) {
    logger.error('❌ Error: Space key required. Use --space-key <key>');
    process.exit(1);
  }

  const authType = config.auth?.type === 'token' ? 'Basic' : 'Bearer';
  const headers: Record<string, string> = {
    Authorization: `${authType} ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const body: Record<string, unknown> = {
    type: 'page',
    title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: content,
        representation: 'storage',
      },
    },
  };

  if (options.parentId) {
    body['ancestors'] = [{ id: options.parentId }];
  }

  logger.info(`\n📝 Creating Confluence page "${title}" in space ${spaceKey}...`);

  const response = await fetch(`${baseUrl}/wiki/rest/api/content`, {
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

  const result = await response.json() as {
    id: string;
    title: string;
    _links?: { webui: string };
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`✅ Page created: ${result.title}`);
    logger.log(`   ID: ${result.id}`);
    if (result._links?.webui) logger.log(`   URL: ${baseUrl}/wiki${result._links.webui}`);
    logger.log('');
  }
}
