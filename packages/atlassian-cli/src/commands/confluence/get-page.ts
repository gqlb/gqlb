import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface ConfluencePageOptions {
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  expand?: string;
  logger?: Logger;
}

export async function getPage(pageId: string, options: ConfluencePageOptions) {
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

  const expand = options.expand || 'body.storage,version,space,ancestors';
  const url = `${baseUrl}/wiki/rest/api/content/${pageId}?expand=${expand}`;

  logger.info(`\n📄 Fetching Confluence page ${pageId}...`);

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    id: string;
    title: string;
    type: string;
    space?: { key: string; name: string };
    version?: { number: number };
    body?: { storage?: { value: string } };
    _links?: { webui: string };
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n📄 Page: ${result.title}`);
    logger.log(`   ID:      ${result.id}`);
    logger.log(`   Type:    ${result.type}`);
    if (result.space) logger.log(`   Space:   ${result.space.key} - ${result.space.name}`);
    if (result.version) logger.log(`   Version: ${result.version.number}`);
    if (result._links?.webui) logger.log(`   URL:     ${baseUrl}/wiki${result._links.webui}`);
    logger.log('');
  }
}
