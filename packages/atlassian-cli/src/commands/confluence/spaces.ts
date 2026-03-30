import { getValidToken, loadConfig } from '../../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../../constants.js';
import type { Logger } from '../../utils/logger.js';
import { createLogger } from '../../utils/logger.js';

interface SpacesOptions {
  type?: string;
  limit?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function listSpaces(options: SpacesOptions) {
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
  if (options.limit) params.set('limit', options.limit);

  const url = `${baseUrl}/wiki/rest/api/space?${params}&expand=description.plain`;
  logger.info('\n🗂️  Fetching Confluence spaces...');

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ Error: ${response.status} ${response.statusText}`);
    logger.error(text);
    process.exit(1);
  }

  const result = await response.json() as {
    size: number;
    results: Array<{
      key: string;
      name: string;
      type: string;
      description?: { plain?: { value: string } };
    }>;
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.log(`\n🗂️  Spaces (${result.size} shown):\n`);
    for (const s of result.results) {
      logger.log(`  ${s.key.padEnd(16)} ${s.name.padEnd(40)} (${s.type})`);
      if (s.description?.plain?.value) {
        const desc = s.description.plain.value;
        const truncated = desc.length > 70 ? `${desc.substring(0, 70)}...` : desc;
        logger.log(`  ${''.padEnd(16)} ${truncated}`);
      }
    }
    logger.log('');
  }
}
