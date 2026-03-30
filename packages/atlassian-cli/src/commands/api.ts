/**
 * `api` command - Execute raw Atlassian REST API calls
 *
 * Usage:
 *   atlassian api GET /rest/api/3/myself
 *   atlassian api POST /rest/api/3/issue --data '{"fields":{"project":{"key":"PROJ"},...}}'
 */

import { readFileSync } from 'fs';
import { getValidToken, loadConfig } from '../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../constants.js';
import type { Logger } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';

export interface ApiCommandOptions {
  data?: string;
  file?: string;
  header?: string[];
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function apiCommand(
  method: string,
  endpoint: string,
  options: ApiCommandOptions,
) {
  const logger = options.logger || createLogger(options.json ? false : (options.verbose || false));
  const httpMethod = method.toUpperCase();

  const config = await loadConfig();
  const baseUrl = options.url || config.baseUrl || ATLASSIAN_DEFAULTS.API_BASE_URL;

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

  // Merge any additional headers from --header options
  if (options.header) {
    for (const h of options.header) {
      const idx = h.indexOf(':');
      if (idx > 0) {
        headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
      }
    }
  }

  // Resolve request body
  let body: string | undefined;
  if (options.file) {
    body = readFileSync(options.file, 'utf-8');
    headers['Content-Type'] = 'application/json';
  } else if (options.data) {
    body = options.data;
    headers['Content-Type'] = 'application/json';
  }

  // Build full URL (support relative and absolute endpoints)
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  logger.info(`\n🌐 ${httpMethod} ${fullUrl}`);

  const fetchOptions: RequestInit = { method: httpMethod, headers };
  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod)) {
    fetchOptions.body = body;
  }

  const response = await fetch(fullUrl, fetchOptions);

  // Try to parse JSON; fall back to text
  let result: unknown;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    result = await response.json();
  } else {
    result = await response.text();
  }

  if (!response.ok) {
    logger.error(`❌ ${response.status} ${response.statusText}`);
    if (typeof result === 'string') {
      logger.error(result);
    } else {
      logger.error(JSON.stringify(result, null, 2));
    }
    process.exit(1);
  }

  if (options.json || typeof result !== 'string') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result);
  }
}
