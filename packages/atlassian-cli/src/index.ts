/**
 * Main entry point for programmatic usage of Atlassian CLI
 * Useful for MCP servers or other integrations
 */

// Export command functions
export { getIssue } from './commands/jira/get-issue.js';
export { searchIssues } from './commands/jira/search-issues.js';
export { linkIssues } from './commands/jira/link-issues.js';
export { createIssue } from './commands/jira/create-issue.js';
export { addComment, listComments } from './commands/jira/comment.js';
export { listTransitions, transitionIssue } from './commands/jira/transition.js';
export { listProjects, getProject } from './commands/jira/project.js';
export { listSprints, getSprintIssues } from './commands/jira/sprint.js';
export { listBoards } from './commands/jira/board.js';

// Confluence commands
export { getPage } from './commands/confluence/get-page.js';
export { searchConfluence } from './commands/confluence/search.js';
export { listSpaces } from './commands/confluence/spaces.js';
export { createPage } from './commands/confluence/create-page.js';

// Raw API / GraphQL / Ask commands
export { apiCommand } from './commands/api.js';
export { gqlCommand } from './commands/gql.js';
export { askCommand } from './commands/ask.js';

// Export logger utilities
export { 
  createLogger,
  ConsoleLogger,
  SilentLogger,
  type Logger 
} from './utils/logger.js';

// Export auth utilities
export { 
  loadConfig,
  saveConfig,
  getValidToken,
  clearToken,
  type AtlassianConfig
} from './auth/config.js';

