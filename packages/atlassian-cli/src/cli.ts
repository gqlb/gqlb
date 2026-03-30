#!/usr/bin/env node
/**
 * Atlassian CLI
 * 
 * A command-line interface for Atlassian APIs using GraphQL
 */

import { Command } from 'commander';
import { getIssue } from './commands/jira/get-issue.js';
import { searchIssues } from './commands/jira/search-issues.js';
import { loginCommand } from './commands/auth/login.js';
import { auth, loadConfig, clearToken } from './auth/config.js';
import { createIssue } from './commands/jira/create-issue.js';
import { addComment, listComments } from './commands/jira/comment.js';
import { listTransitions, transitionIssue } from './commands/jira/transition.js';
import { listProjects, getProject } from './commands/jira/project.js';
import { listSprints, getSprintIssues } from './commands/jira/sprint.js';
import { listBoards } from './commands/jira/board.js';
import { getPage } from './commands/confluence/get-page.js';
import { searchConfluence } from './commands/confluence/search.js';
import { listSpaces } from './commands/confluence/spaces.js';
import { createPage } from './commands/confluence/create-page.js';
import { apiCommand } from './commands/api.js';
import { gqlCommand } from './commands/gql.js';
import { askCommand } from './commands/ask.js';

const program = new Command();

program
  .name('atlassian')
  .description('CLI for Atlassian APIs using GraphQL')
  .version('0.1.0');

// Auth commands
const authCmd = new Command('auth')
  .description('Authentication commands');

// Custom login command with interactive prompts
authCmd
  .command('login')
  .description('Login to Atlassian')
  .option('--method <type>', 'Authentication method: token or oauth', /^(token|oauth)$/)
  .option('--email <email>', 'Email address (for token auth)')
  .option('--token <token>', 'API token (for token auth)')
  .option('--client-id <id>', 'OAuth client ID (for OAuth)')
  .option('--client-secret <secret>', 'OAuth client secret (for OAuth)')
  .action(loginCommand);

// Logout and whoami from cli-oauth
authCmd
  .command('logout')
  .description('Logout and remove credentials')
  .action(async () => {
    await clearToken();
    console.log('✅ Logged out successfully!\n');
    console.log('Your credentials have been removed from:');
    console.log(`   ~/.atlassian-tools/token.json\n`);
  });

authCmd
  .command('whoami')
  .description('Show current authentication status')
  .action(async () => {
    const config = await loadConfig();
    const token = await auth.getValidToken();
    
    console.log('\n📁 Configuration:');
    console.log('   Config dir:  ~/.atlassian-tools');
    console.log('   Config file: ~/.atlassian-tools/config.json');
    console.log('   Token file:  ~/.atlassian-tools/token.json\n');
    
    if (token) {
      console.log('✅ Logged in\n');
      console.log('Token info:');
      console.log('   Expires: Never (API token)');
      console.log('   Has refresh token: No\n');
      console.log('Configuration:', JSON.stringify(config, null, 2));
      console.log('');
    } else {
      console.log('❌ Not logged in\n');
      console.log('Run: <command> auth login --help\n');
    }
  });

program.addCommand(authCmd);

// Jira commands
const jira = program
  .command('jira')
  .description('Jira commands');

jira
  .command('get <issue-key>')
  .description('Get a Jira issue by key')
  .option('-f, --fields <fields>', 'Comma-separated list of fields to fetch (default: common fields)')
  .option('--all', 'Fetch all available fields')
  .option('-v, --verbose', 'Show detailed query information')
  .option('--json', 'Output pure JSON (no decorations, pipeable to jq)')
  .option('--cloud-id <cloudId>', 'Atlassian cloud ID (overrides stored config)')
  .option('--token <token>', 'Atlassian API token (overrides stored token)')
  .option('--url <url>', 'Atlassian API URL (overrides default)')
  .action(getIssue);

jira
  .command('search <jql>')
  .description('Search Jira issues using JQL')
  .option('-f, --fields <fields>', 'Comma-separated list of fields to fetch', 'id,key,webUrl')
  .option('-l, --limit <limit>', 'Maximum number of results', '10')
  .option('--cloud-id <cloudId>', 'Atlassian cloud ID (overrides stored config)')
  .option('--token <token>', 'Atlassian API token (overrides stored token)')
  .option('--url <url>', 'Atlassian API URL (overrides default)')
  .action(searchIssues);

jira
  .command('create <summary>')
  .description('Create a new Jira issue')
  .option('-p, --project <key>', 'Project key (or set ATLASSIAN_PROJECT)')
  .option('-t, --type <type>', 'Issue type (default: Task)', 'Task')
  .option('--priority <priority>', 'Priority name (e.g. High, Medium, Low)')
  .option('--assignee <accountId>', 'Assignee account ID')
  .option('--labels <labels>', 'Comma-separated list of labels')
  .option('--parent <key>', 'Parent issue key (for sub-tasks)')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(createIssue);

const jiraComment = jira.command('comment').description('Manage issue comments');

jiraComment
  .command('add <issue-key> <body>')
  .description('Add a comment to an issue')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(addComment);

jiraComment
  .command('list <issue-key>')
  .description('List comments on an issue')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listComments);

const jiraTransition = jira.command('transition').description('Manage issue transitions');

jiraTransition
  .command('list <issue-key>')
  .description('List available transitions for an issue')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listTransitions);

jiraTransition
  .command('do <issue-key> <transition-id>')
  .description('Transition an issue to a new status')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(transitionIssue);

const jiraProject = jira.command('project').description('Manage Jira projects');

jiraProject
  .command('list')
  .description('List Jira projects')
  .option('-n, --max-results <n>', 'Max number of results', '50')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listProjects);

jiraProject
  .command('get <project-key>')
  .description('Get details of a Jira project')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(getProject);

const jiraBoard = jira.command('board').description('Manage Jira boards');

jiraBoard
  .command('list')
  .description('List Jira boards')
  .option('-t, --type <type>', 'Board type: scrum or kanban')
  .option('--project-key <key>', 'Filter by project key')
  .option('-n, --max-results <n>', 'Max number of results', '50')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listBoards);

const jiraSprint = jira.command('sprint').description('Manage Jira sprints');

jiraSprint
  .command('list <board-id>')
  .description('List sprints for a board')
  .option('--state <state>', 'Filter by state: active, closed, future')
  .option('-n, --max-results <n>', 'Max number of results', '20')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listSprints);

jiraSprint
  .command('issues <sprint-id>')
  .description('List issues in a sprint')
  .option('-n, --max-results <n>', 'Max number of results', '50')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(getSprintIssues);

// ─── Confluence commands ───────────────────────────────────────────────────

const confluence = program
  .command('confluence')
  .description('Confluence commands');

confluence
  .command('get <page-id>')
  .description('Get a Confluence page by ID')
  .option('--expand <fields>', 'Comma-separated list of expand fields')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(getPage);

confluence
  .command('search <cql>')
  .description('Search Confluence content using CQL')
  .option('-l, --limit <n>', 'Max number of results', '10')
  .option('--start <n>', 'Start index for pagination', '0')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(searchConfluence);

confluence
  .command('spaces')
  .description('List Confluence spaces')
  .option('-t, --type <type>', 'Space type: global or personal')
  .option('-l, --limit <n>', 'Max number of results', '25')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listSpaces);

confluence
  .command('create <title> <content>')
  .description('Create a new Confluence page')
  .option('-s, --space-key <key>', 'Space key (or set CONFLUENCE_SPACE_KEY)')
  .option('--parent-id <id>', 'Parent page ID')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(createPage);

// ─── api command ──────────────────────────────────────────────────────────

program
  .command('api <method> <endpoint>')
  .description('Execute a raw Atlassian REST API call (e.g. GET /rest/api/3/myself)')
  .option('-d, --data <json>', 'JSON body for POST/PUT/PATCH requests')
  .option('-f, --file <path>', 'Path to JSON file for request body')
  .option('-H, --header <header>', 'Extra header(s) in "Name: Value" format', (v, acc: string[]) => {
    acc.push(v);
    return acc;
  }, [] as string[])
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL override')
  .action(apiCommand);

// ─── gql command ──────────────────────────────────────────────────────────

program
  .command('gql [query]')
  .description('Execute a raw GraphQL query against the Atlassian AGG API')
  .option('-f, --file <path>', 'Path to .graphql file')
  .option('--variables <json>', 'JSON variables object')
  .option('--variables-file <path>', 'Path to JSON variables file')
  .option('--operation-name <name>', 'Operation name to execute')
  .option('--json', 'Include GraphQL envelope (data + errors)')
  .option('-v, --verbose', 'Show query and variables before executing')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'GraphQL API URL override')
  .action(gqlCommand);

// ─── ask command ──────────────────────────────────────────────────────────

program
  .command('ask [question]')
  .description('Send a question (with optional Atlassian context) to an AI agent')
  .option('-a, --agent <agent>', 'AI agent: claude, codex, chatgpt, gemini, ollama, or a shell command', 'claude')
  .option('--jql <jql>', 'Fetch Jira issues matching this JQL as context')
  .option('--page-id <id>', 'Fetch a Confluence page as context')
  .option('--space-key <key>', 'Fetch pages from a Confluence space as context')
  .option('-l, --limit <n>', 'Max context items to fetch', '10')
  .option('--dry-run', 'Print the prompt instead of sending it to the agent')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(askCommand);

program.parse();

