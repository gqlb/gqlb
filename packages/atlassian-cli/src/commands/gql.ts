/**
 * `gql` command - Execute raw GraphQL queries against the Atlassian AGG API
 *
 * Usage:
 *   atlassian gql 'query { ... }'
 *   atlassian gql --file query.graphql --variables '{"cloudId":"..."}'
 */

import { readFileSync } from 'fs';
import { getValidToken, loadConfig } from '../auth/config.js';
import { ATLASSIAN_DEFAULTS } from '../constants.js';
import type { Logger } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';

export interface GqlCommandOptions {
  file?: string;
  variables?: string;
  variablesFile?: string;
  operationName?: string;
  json?: boolean;
  verbose?: boolean;
  token?: string;
  url?: string;
  logger?: Logger;
}

export async function gqlCommand(queryArg: string | undefined, options: GqlCommandOptions) {
  const logger = options.logger || createLogger(options.json ? false : (options.verbose || false));

  // Resolve query source
  let query: string;
  if (options.file) {
    query = readFileSync(options.file, 'utf-8');
  } else if (queryArg) {
    query = queryArg;
  } else {
    logger.error('❌ Error: Provide a query string or --file <path>');
    process.exit(1);
  }

  // Resolve variables
  let variables: Record<string, unknown> = {};
  if (options.variablesFile) {
    variables = JSON.parse(readFileSync(options.variablesFile, 'utf-8')) as Record<string, unknown>;
  } else if (options.variables) {
    variables = JSON.parse(options.variables) as Record<string, unknown>;
  }

  const config = await loadConfig();

  let token = options.token || process.env.ATLASSIAN_TOKEN;
  if (!token) token = (await getValidToken()) || undefined;

  if (!token) {
    logger.error('❌ Error: Not authenticated. Run: atlassian auth login');
    process.exit(1);
  }

  const authType = config.auth?.type === 'token' ? 'Basic' : 'Bearer';
  const baseUrl = config.baseUrl || ATLASSIAN_DEFAULTS.API_BASE_URL;
  const apiUrl = options.url || config.apiUrl || process.env.ATLASSIAN_API_URL || `${baseUrl}/gateway/api/graphql`;

  logger.info(`\n📡 GraphQL → ${apiUrl}`);
  if (options.verbose) {
    logger.info('\nQuery:');
    logger.info(query);
    if (Object.keys(variables).length) {
      logger.info('\nVariables:');
      logger.info(JSON.stringify(variables, null, 2));
    }
  }

  const body: Record<string, unknown> = { query };
  if (Object.keys(variables).length) body['variables'] = variables;
  if (options.operationName) body['operationName'] = options.operationName;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `${authType} ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json() as { data?: unknown; errors?: unknown[] };

  if (!response.ok) {
    logger.error(`❌ ${response.status} ${response.statusText}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (result.errors && result.errors.length > 0 && !result.data) {
    logger.error('❌ GraphQL errors:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(options.json ? result : (result.data ?? result), null, 2));
}
