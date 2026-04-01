# @atlassian-tools/cli

> 🎯 **Demo Application:** This CLI demonstrates real-world usage of [`gqlb`](../gqlb) with dynamic field selection, OAuth authentication, and interactive commands. It serves as a reference implementation and will be moved to its own repository soon.

**Command-line interface for Atlassian APIs powered by gqlb**

An interactive CLI showcasing [`gqlb`](../gqlb)'s capabilities: dynamic field selection, runtime query building, and full type safety with Atlassian's GraphQL API (8000+ types).

## Table of Contents

- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Command Reference](#command-reference)
  - [Auth Commands](#auth-commands)
  - [Jira Commands](#jira-commands)
  - [Confluence Commands](#confluence-commands)
  - [API Command](#api-command)
  - [GQL Command](#gql-command)
  - [Ask Command](#ask-command)
- [Global Options](#global-options)
- [Environment Variables](#environment-variables)
- [Scripting with jq](#scripting-with-jq)
- [Programmatic Usage](#programmatic-usage)
- [Development Mode](#development-mode)
- [How It Works](#how-it-works)
- [Related](#related)

## Architecture

```
@atlassian-tools/cli    (Demo: CLI commands & OAuth)
    ↓
@atlassian-tools/gql    (Demo: Pre-configured gqlb for Atlassian)
    ↓
gqlb                    (Core: Runtime query builder)
```

> **Looking for the core library?** Check out [`gqlb`](../gqlb) — it works with any GraphQL API, not just Atlassian.

## Installation

```bash
npm install -g @atlassian-tools/cli
```

This installs two commands:

| Command | Description |
|---|---|
| `atlassian` | Full CLI — Jira, Confluence, raw API/GraphQL, AI |
| `jira` | Shortcut for all Jira-specific commands |

## Quick Start

```bash
# 1. Log in with an API token
atlassian auth login --method token --email you@company.com --token YOUR_API_TOKEN

# 2. Check status
atlassian auth whoami

# 3. Start using
atlassian jira get PROJ-123
jira search "project = DEMO ORDER BY created DESC" --limit 5
```

## Authentication

Credentials are stored in `~/.atlassian-tools/`:

| File | Contents |
|---|---|
| `config.json` | Instance URL, cloud ID, auth type, email |
| `token.json` | API token / OAuth access & refresh tokens |

See [`docs/CONFIG.md`](docs/CONFIG.md) for the full configuration reference and [`docs/OAUTH.md`](docs/OAUTH.md) for the OAuth flow details.

### Option 1: API Token (recommended for quick start)

1. Generate a token at <https://id.atlassian.com/manage-profile/security/api-tokens>
2. Run:

```bash
atlassian auth login --method token --email you@company.com --token YOUR_API_TOKEN
```

### Option 2: OAuth 2.0 (recommended for production)

1. Create an OAuth 2.0 app at [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
   - Add redirect URI: `http://localhost:33418/callback`
   - Required scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `read:confluence-content.all`, `offline_access`
2. Run:

```bash
atlassian auth login --method oauth --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

The CLI will open your browser, complete the flow, and store tokens automatically.

---

## Command Reference

### Auth Commands

```
atlassian auth <subcommand>
jira auth <subcommand>
```

| Subcommand | Description |
|---|---|
| `login` | Authenticate (token or OAuth) |
| `logout` | Remove stored credentials |
| `whoami` | Show authentication status and config paths |

```bash
atlassian auth login --method token --email you@example.com --token ATATT3x...
atlassian auth login --method oauth --client-id X --client-secret Y
atlassian auth whoami
atlassian auth logout
```

---

### Jira Commands

All `jira <subcommand>` commands are also available as `atlassian jira <subcommand>`.

> 📖 Full reference with all fields and examples: [`docs/commands/JIRA.md`](docs/commands/JIRA.md)

#### `jira get` — Fetch a single issue

```
jira get <issue-key> [options]
```

| Option | Description |
|---|---|
| `-f, --fields <list>` | Comma-separated fields (default: common fields) |
| `--all` | Fetch all available fields |
| `-v, --verbose` | Print the generated GraphQL query |
| `--json` | Raw JSON output (pipeable to `jq`) |
| `--cloud-id <id>` | Override stored cloud ID |
| `--token <token>` | Override stored token |
| `--url <url>` | Override GraphQL URL |

```bash
jira get PROJ-123
jira get PROJ-123 --fields id,key,summaryField.text,assigneeField.user.name
jira get PROJ-123 --all
jira get PROJ-123 --json | jq '.jira.issueByKeyOrId.summaryField.text'
```

#### `jira search` — Search issues using JQL

```
jira search <jql> [options]
```

| Option | Description |
|---|---|
| `-f, --fields <list>` | Comma-separated fields (default: `id,key,webUrl`) |
| `-l, --limit <n>` | Max results (default: `10`) |
| `--cloud-id <id>` | Override stored cloud ID |
| `--token <token>` | Override stored token |
| `--url <url>` | Override GraphQL URL |

```bash
jira search "project = DEMO"
jira search "project = DEMO AND status = 'In Progress'" --limit 20
jira search "assignee = currentUser()" --fields id,key,summaryField.text,statusField.name
jira search "project = DEMO" --json | jq '.jira.issueSearchStable.edges[].node.key'
```

#### `jira create` — Create a new issue

```
jira create <summary> [options]
```

| Option | Description |
|---|---|
| `-p, --project <key>` | Project key **(required**, or set `ATLASSIAN_PROJECT`)  |
| `-t, --type <type>` | Issue type (default: `Task`) |
| `--priority <name>` | Priority: `High`, `Medium`, `Low`, etc. |
| `--assignee <accountId>` | Assignee account ID |
| `--labels <list>` | Comma-separated labels |
| `--parent <key>` | Parent issue key (for sub-tasks) |
| `--json` | Raw JSON output |
| `-v, --verbose` | Verbose output |

```bash
jira create "Fix login bug" --project DEMO --priority High
jira create "New feature" --project PROJ --type Story --labels feature,ui
jira create "Subtask" --project PROJ --parent PROJ-123 --type Sub-task
```

#### `jira comment` — Manage issue comments

```
jira comment add <issue-key> <body> [options]
jira comment list <issue-key> [options]
```

```bash
jira comment add PROJ-123 "Looks good to me, approving."
jira comment list PROJ-123
jira comment list PROJ-123 --json | jq '.[].body'
```

#### `jira transition` — Manage issue workflow

```
jira transition list <issue-key> [options]
jira transition do <issue-key> <transition-id> [options]
```

```bash
# List available transitions (shows IDs)
jira transition list PROJ-123

# Move the issue to a new status
jira transition do PROJ-123 31
```

#### `jira project` — Manage projects

```
jira project list [options]
jira project get <project-key> [options]
```

| Option | Description |
|---|---|
| `-n, --max-results <n>` | Max results (default: `50`) |
| `--json` | Raw JSON output |

```bash
jira project list
jira project list --max-results 100 --json
jira project get DEMO
```

#### `jira board` — Manage boards

```
jira board list [options]
```

| Option | Description |
|---|---|
| `-t, --type <type>` | `scrum` or `kanban` |
| `--project-key <key>` | Filter by project key |
| `-n, --max-results <n>` | Max results (default: `50`) |

```bash
jira board list
jira board list --type scrum
jira board list --project-key DEMO
```

#### `jira sprint` — Manage sprints

```
jira sprint list <board-id> [options]
jira sprint issues <sprint-id> [options]
```

| Option | Description |
|---|---|
| `--state <state>` | `active`, `closed`, or `future` |
| `-n, --max-results <n>` | Max results (default: `20` / `50`) |

```bash
# Find your board ID with: jira board list
jira sprint list 42
jira sprint list 42 --state active

# Find the sprint ID in the list output
jira sprint issues 123
jira sprint issues 123 --max-results 100 --json
```

#### `jira link` — Link issues together (`jira` command only)

```
jira link <source-key> <target-keys...> [options]
```

| Option | Description |
|---|---|
| `--link-type-id <id>` | Link type ID (default: `10000` = Relates) |
| `--direction <dir>` | `INWARD` or `OUTWARD` (default: `OUTWARD`) |

Common link type IDs:

| ID | Meaning |
|---|---|
| `10000` | Relates to |
| `10001` | Blocks |
| `10002` | Clones |
| `10003` | Duplicates |

```bash
jira link PROJ-123 PROJ-456 --link-type-id 10000
jira link PROJ-1 PROJ-2 PROJ-3 --link-type-id 10001 --direction OUTWARD
```

> **Note:** `jira link` is available via the `jira` shortcut only (not `atlassian jira link`).

---

### Confluence Commands

```
atlassian confluence <subcommand>
```

> 📖 Full reference with all fields and examples: [`docs/commands/CONFLUENCE.md`](docs/commands/CONFLUENCE.md)

#### `confluence get` — Fetch a page by ID

```
atlassian confluence get <page-id> [options]
```

| Option | Description |
|---|---|
| `--expand <fields>` | Expand fields (default: `body.storage,version,space,ancestors`) |
| `--json` | Raw JSON output |

```bash
atlassian confluence get 123456
atlassian confluence get 123456 --expand body.storage,version --json
```

#### `confluence search` — Search using CQL

```
atlassian confluence search <cql> [options]
```

| Option | Description |
|---|---|
| `-l, --limit <n>` | Max results (default: `10`) |
| `--start <n>` | Pagination start index (default: `0`) |

```bash
atlassian confluence search "title ~ 'Release Notes'"
atlassian confluence search "type = page AND space = DEMO" --limit 20
atlassian confluence search "label = 'archived'" --start 20 --limit 20
```

#### `confluence spaces` — List spaces

```
atlassian confluence spaces [options]
```

| Option | Description |
|---|---|
| `-t, --type <type>` | `global` or `personal` |
| `-l, --limit <n>` | Max results (default: `25`) |

```bash
atlassian confluence spaces
atlassian confluence spaces --type global --limit 50
```

#### `confluence create` — Create a page

```
atlassian confluence create <title> <content> [options]
```

| Option | Description |
|---|---|
| `-s, --space-key <key>` | Space key **(required**, or set `CONFLUENCE_SPACE_KEY`) |
| `--parent-id <id>` | Parent page ID |
| `--json` | Raw JSON output |

```bash
atlassian confluence create "My Page" "<p>Hello world</p>" --space-key DEMO
atlassian confluence create "Sub Page" "<p>Under parent</p>" --space-key DEMO --parent-id 123
```

---

### API Command

Execute raw Atlassian REST API calls without leaving your terminal.

```
atlassian api <METHOD> <endpoint> [options]
```

| Option | Description |
|---|---|
| `-d, --data <json>` | JSON body for POST/PUT/PATCH |
| `-f, --file <path>` | Path to JSON file for request body |
| `-H, --header <header>` | Extra header (`Name: Value`), repeatable |
| `--json` | Raw JSON output |
| `-v, --verbose` | Verbose output |

> 📖 Full reference and examples: [`docs/commands/POWER-TOOLS.md`](docs/commands/POWER-TOOLS.md)

```bash
atlassian api GET /rest/api/3/myself
atlassian api GET /rest/api/3/project/DEMO --json
atlassian api POST /rest/api/3/issue \
  --data '{"fields":{"project":{"key":"PROJ"},"summary":"Test","issuetype":{"name":"Task"}}}'
atlassian api POST /rest/api/3/issue --file new-issue.json
atlassian api GET /rest/api/3/issue/PROJ-123 -H "X-Trace-Id: abc123"
```

---

### GQL Command

Execute raw GraphQL queries against the Atlassian AGG (Atlassian Graph Gateway) API.

```
atlassian gql [query] [options]
```

| Option | Description |
|---|---|
| `-f, --file <path>` | Path to `.graphql` file |
| `--variables <json>` | JSON variables object |
| `--variables-file <path>` | Path to JSON variables file |
| `--operation-name <name>` | Operation name to execute |
| `--json` | Include full GraphQL envelope (`data` + `errors`) |
| `-v, --verbose` | Print query and variables before executing |

> 📖 Full reference and examples: [`docs/commands/POWER-TOOLS.md`](docs/commands/POWER-TOOLS.md)

```bash
atlassian gql 'query { jira { projects(cloudId: "...") { nodes { id name } } } }'
atlassian gql --file query.graphql --variables '{"cloudId":"your-cloud-id"}'
atlassian gql --file query.graphql --variables-file vars.json --operation-name GetIssues
atlassian gql --file query.graphql --verbose --json
```

---

### Ask Command

Send a question to an AI agent with optional Atlassian context (Jira issues, Confluence pages).

```
atlassian ask [question] [options]
```

| Option | Description |
|---|---|
| `-a, --agent <agent>` | AI agent: `claude`, `codex`, `chatgpt`, `gemini`, `ollama`, or a shell command (default: `claude`) |
| `--jql <jql>` | Fetch Jira issues as context |
| `--page-id <id>` | Fetch a Confluence page as context |
| `--space-key <key>` | Fetch pages from a Confluence space as context |
| `-l, --limit <n>` | Max context items to fetch (default: `10`) |
| `--dry-run` | Print the prompt instead of sending it |
| `-v, --verbose` | Verbose output |

> 📖 Full reference and examples: [`docs/commands/POWER-TOOLS.md`](docs/commands/POWER-TOOLS.md)

```bash
atlassian ask "Summarise the last 5 bugs" --jql "type = Bug ORDER BY created DESC" --limit 5
atlassian ask "What blockers are in the current sprint?" --agent codex \
  --jql "project = DEMO AND sprint in openSprints()"
atlassian ask "Draft a release note for DEMO space" --agent claude --space-key DEMO
atlassian ask "What's on this page?" --page-id 123456
atlassian ask "List open issues" --agent "docker run --rm my-llm" --jql "status = Open"
atlassian ask "Summarise" --jql "project=DEMO" --dry-run  # preview prompt
```

---

## Global Options

Every command accepts these common options:

| Option | Description |
|---|---|
| `--token <token>` | API token (overrides stored credentials) |
| `--url <url>` | Base/GraphQL URL (overrides stored config) |
| `--json` | Output raw JSON — ideal for piping to `jq` |
| `-v, --verbose` | Print the generated query and extra details |

---

## Environment Variables

Override any stored config at runtime:

| Variable | Description |
|---|---|
| `ATLASSIAN_TOKEN` | API token |
| `ATLASSIAN_CLOUD_ID` | Cloud ID |
| `ATLASSIAN_BASE_URL` | Atlassian instance URL (e.g. `https://company.atlassian.net`) |
| `ATLASSIAN_API_URL` | GraphQL API URL (default: `https://api.atlassian.com/graphql`) |
| `ATLASSIAN_PROJECT` | Default Jira project key for `jira create` |
| `CONFLUENCE_SPACE_KEY` | Default Confluence space key for `confluence create` |

---

## Scripting with jq

All commands support `--json` for clean JSON output, which pairs perfectly with `jq`.

```bash
# Get a single field value
jira get PROJ-123 --json | jq -r '.jira.issueByKeyOrId.summaryField.text'

# Extract all issue keys from a search
jira search "project = DEMO" --json \
  | jq -r '.jira.issueSearchStable.edges[].node.key'

# Table of issue key + status
jira search "project = DEMO" --fields id,key,statusField.name --json \
  | jq -r '.jira.issueSearchStable.edges[].node | "\(.key)\t\(.statusField.name)"'

# Get assignee name
jira get PROJ-123 --fields assigneeField.user.name --json \
  | jq -r '.jira.issueByKeyOrId.assigneeField.user.name'

# Count results
jira search "project = DEMO AND status = Open" --limit 100 --json \
  | jq '.jira.issueSearchStable.edges | length'
```

---

## Programmatic Usage

The package also exports its functions for use in your own code:

```typescript
import { getIssue, searchIssues, createIssue } from '@atlassian-tools/cli';
import { ConsoleLogger, SilentLogger } from '@atlassian-tools/cli/utils/logger';

// Standard usage (prints to console)
const result = await getIssue('PROJ-123', {
  fields: 'id,key,summaryField.text',
  json: true,
});

// Silent usage (for MCP servers, tests, etc.)
const result = await getIssue('PROJ-123', {
  fields: 'id,key,summaryField.text',
  json: true,
  logger: new SilentLogger(),
});

// Search
const issues = await searchIssues('project = DEMO', {
  fields: 'id,key,summaryField.text',
  limit: '20',
  logger: new SilentLogger(),
});
```

---

## Development Mode

Run commands directly from source without building first:

```bash
# From packages/atlassian-cli
npx tsx src/cli.ts auth login --method token --email you@example.com --token YOUR_TOKEN
npx tsx src/cli.ts auth whoami
npx tsx src/cli.ts jira get PROJ-123 --fields id,key,summaryField.text
npx tsx src/jira-cli.ts search "project = DEMO"
```

---

## How It Works

This CLI demonstrates **gqlb's dynamic query building**:

1. **Parse command** — Extract arguments and options from the terminal
2. **Build query** — Use gqlb to construct the GraphQL query at runtime based on `--fields`
3. **Execute** — Send the query to the Atlassian GraphQL API
4. **Display** — Format and print the results (or output raw JSON)

**The magic:** gqlb uses runtime proxies to walk the GraphQL schema on-the-fly, producing fully typed queries with zero code generation.

```typescript
// Dynamic query based on user's --fields option
const query = builder.query('GetIssue', q => [
  q.jira(jira => [
    jira.issueByKeyOrId({ issueIdOrKey }, issue => [
      // Fields are selected by the user at runtime!
      ...buildFieldsFromUserInput(issue, fields)
    ])
  ])
]);
```

---

## Related

- **[gqlb](../gqlb)** — The core library (works with any GraphQL API)
- **[@atlassian-tools/gql](../atlassian-graphql)** — Pre-configured gqlb for Atlassian
- **[Innovation Deep Dive](../../docs/INNOVATION.md)** — How gqlb works
- **[Configuration Guide](docs/CONFIG.md)** — Full config reference
- **[OAuth Guide](docs/OAUTH.md)** — OAuth 2.0 implementation details
- **[Jira Commands](docs/commands/JIRA.md)** — Full Jira command reference
- **[Confluence Commands](docs/commands/CONFLUENCE.md)** — Full Confluence command reference
- **[Power Tools](docs/commands/POWER-TOOLS.md)** — API, GQL, and Ask command reference

## 📄 License

MIT

---

**This is a demo/reference implementation. For the core library, see [`gqlb`](../gqlb).**
