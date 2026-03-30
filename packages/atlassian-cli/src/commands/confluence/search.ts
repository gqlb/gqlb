import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface ConfluenceSearchOptions {
  limit?: string;
  start?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function searchConfluence(query: string, options: ConfluenceSearchOptions) {
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

  const params = new URLSearchParams({ cql: query });
  if (options.limit) params.set('limit', options.limit);
  if (options.start) params.set('start', options.start);

  const url = `${baseUrl}/wiki/rest/api/content/search?${params}`;
  logger.info(`\n🔍 Searching Confluence: ${query}`);

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    totalSize: number;
    results: Array<{
      id: string;
      title: string;
      type: string;
      space?: { key: string; name: string };
      _links?: { webui: string };
    }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n🔍 Results (${result.totalSize} total):\n`);
    for (const item of result.results) {
      const space = item.space ? `[${item.space.key}] ` : '';
      logger.log(`  [${item.id}] ${space}${item.title} (${item.type})`);
    }
    logger.log('');
  }
}
