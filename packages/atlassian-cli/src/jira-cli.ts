#!/usr/bin/env node

/**
 * Jira CLI - Standalone shortcut with auth support
 * 
 * Usage:
 *   jira auth login --client-id ... --client-secret ...
 *   jira get ISSUE-123
 *   jira search "project = MYPROJECT"
 *   jira create "Fix login bug" --project MYPROJECT
 *   jira comment add ISSUE-123 "Looks good to me"
 *   jira transition list ISSUE-123
 *   jira transition do ISSUE-123 31
 *   jira project list
 *   jira board list
 *   jira sprint list <board-id>
 */

import { Command } from 'commander';
import { getIssue } from './commands/jira/get-issue.js';
import { searchIssues } from './commands/jira/search-issues.js';
import { linkIssues } from './commands/jira/link-issues.js';
import { createIssue } from './commands/jira/create-issue.js';
import { addComment, listComments } from './commands/jira/comment.js';
import { listTransitions, transitionIssue } from './commands/jira/transition.js';
import { listProjects, getProject } from './commands/jira/project.js';
import { listSprints, getSprintIssues } from './commands/jira/sprint.js';
import { listBoards } from './commands/jira/board.js';
import { loginCommand } from './commands/auth/login.js';
import { auth, clearToken, loadConfig } from './auth/config.js';

const program = new Command();

program
  .name('jira')
  .description('Jira CLI - shortcut for Atlassian Jira commands')
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

// Logout and whoami
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
      console.log('Run: jira auth login\n');
    }
  });

program.addCommand(authCmd);

// Get issue command
program
  .command('get <issueKey>')
  .description('Get a Jira issue by key')
  .option('-f, --fields <fields>', 'Comma-separated list of fields to retrieve (default: common fields)')
  .option('--all', 'Fetch all available fields')
  .option('-v, --verbose', 'Show detailed query information')
  .option('--json', 'Output pure JSON (no decorations, pipeable to jq)')
  .option('--cloud-id <cloudId>', 'Atlassian Cloud ID')
  .option('--token <token>', 'Bearer token for authentication')
  .option('--url <url>', 'GraphQL API URL')
  .action(async (issueKey: string, options: any) => {
    await getIssue(issueKey, options);
  });

// Search issues command
program
  .command('search <jql>')
  .description('Search Jira issues using JQL')
  .option('-f, --fields <fields>', 'Comma-separated list of fields to retrieve', 'id,key,issueId,webUrl,summaryField.text')
  .option('-l, --limit <limit>', 'Maximum number of results', '10')
  .option('--cloud-id <cloudId>', 'Atlassian Cloud ID')
  .option('--token <token>', 'Bearer token for authentication')
  .option('--url <url>', 'GraphQL API URL')
  .action(async (jql: string, options: any) => {
    await searchIssues(jql, options);
  });

// Link issues command
program
  .command('link <sourceIssueKey> <targetIssueKeys...>')
  .description('Link Jira issues together (e.g., jira link PROJ-123 PROJ-456 PROJ-789)')
  .option('--link-type-id <id>', 'Link type ID (if not specified, uses "Relates" type)')
  .option('--direction <direction>', 'Link direction: INWARD or OUTWARD', 'OUTWARD')
  .option('-v, --verbose', 'Show detailed query information')
  .option('--json', 'Output pure JSON (no decorations, pipeable to jq)')
  .option('--cloud-id <cloudId>', 'Atlassian Cloud ID')
  .option('--token <token>', 'Bearer token for authentication')
  .option('--url <url>', 'GraphQL API URL')
  .action(async (sourceIssueKey: string, targetIssueKeys: string[], options: any) => {
    await linkIssues(sourceIssueKey, targetIssueKeys, options);
  });

// Create issue command
program
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
  .action(async (summary: string, options: any) => {
    await createIssue(summary, options);
  });

// Comment commands
const commentCmd = program.command('comment').description('Manage issue comments');

commentCmd
  .command('add <issue-key> <body>')
  .description('Add a comment to an issue')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(addComment);

commentCmd
  .command('list <issue-key>')
  .description('List comments on an issue')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listComments);

// Transition commands
const transitionCmd = program.command('transition').description('Manage issue transitions');

transitionCmd
  .command('list <issue-key>')
  .description('List available transitions for an issue')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listTransitions);

transitionCmd
  .command('do <issue-key> <transition-id>')
  .description('Transition an issue to a new status')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(transitionIssue);

// Project commands
const projectCmd = program.command('project').description('Manage Jira projects');

projectCmd
  .command('list')
  .description('List Jira projects')
  .option('-n, --max-results <n>', 'Max number of results', '50')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listProjects);

projectCmd
  .command('get <project-key>')
  .description('Get details of a Jira project')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(getProject);

// Board commands
const boardCmd = program.command('board').description('Manage Jira boards');

boardCmd
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

// Sprint commands
const sprintCmd = program.command('sprint').description('Manage Jira sprints');

sprintCmd
  .command('list <board-id>')
  .description('List sprints for a board')
  .option('--state <state>', 'Filter by state: active, closed, future')
  .option('-n, --max-results <n>', 'Max number of results', '20')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(listSprints);

sprintCmd
  .command('issues <sprint-id>')
  .description('List issues in a sprint')
  .option('-n, --max-results <n>', 'Max number of results', '50')
  .option('--json', 'Output pure JSON')
  .option('-v, --verbose', 'Show verbose output')
  .option('--token <token>', 'Atlassian API token')
  .option('--url <url>', 'Atlassian base URL')
  .action(getSprintIssues);

// Parse arguments
program.parse();

