# Jira Commands

Full reference for all `jira` / `atlassian jira` commands.

> **Quick note on CLI names:**  
> Every command below works with both `jira <command>` (the standalone shortcut) and `atlassian jira <command>` (the full CLI), unless noted otherwise.

---

## Table of Contents

- [jira get](#jira-get)
- [jira search](#jira-search)
- [jira create](#jira-create)
- [jira comment](#jira-comment)
- [jira transition](#jira-transition)
- [jira project](#jira-project)
- [jira board](#jira-board)
- [jira sprint](#jira-sprint)
- [jira link](#jira-link)
- [Field Reference](#field-reference)

---

## jira get

Fetch a single Jira issue by its key, with full control over which fields are returned.

```
jira get <issue-key> [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-f, --fields <list>` | string | (common fields) | Comma-separated list of fields to fetch |
| `--all` | flag | — | Fetch all available fields |
| `-v, --verbose` | flag | — | Print the generated GraphQL query |
| `--json` | flag | — | Raw JSON output (pipeable to `jq`) |
| `--cloud-id <id>` | string | stored config | Override the Atlassian cloud ID |
| `--token <token>` | string | stored config | Override the API token |
| `--url <url>` | string | stored config | Override the GraphQL API URL |

### Default fields (without `--all`)

`id`, `key`, `issueId`, `webUrl`, `summary`, `summaryField.text`, `descriptionField`, `statusField.name`, `priorityField.name`, `assigneeField`, `createdField`, `updatedField`, `issueType`, `projectField`

### Additional fields (with `--all`)

All default fields, plus: `issueTypeAvatarUrl`, `statusCategory`, `issueTypeField`, `resolutionDateField`, `dueDateField`, `startDateField`, `resolutionField`

### Examples

```bash
# Minimal — default fields
jira get PROJ-123

# Specific scalar fields
jira get PROJ-123 --fields id,key,webUrl

# Nested fields using dot notation
jira get PROJ-123 --fields id,key,summaryField.text,assigneeField.user.name

# All fields
jira get PROJ-123 --all

# Verbose — see the generated GraphQL query
jira get PROJ-123 --verbose

# JSON output for scripting
jira get PROJ-123 --json | jq '.jira.issueByKeyOrId.summaryField.text'
jira get PROJ-123 --json | jq '.jira.issueByKeyOrId.assigneeField.user.name'
jira get PROJ-123 --json | jq '.jira.issueByKeyOrId | {key, status: .statusField.name}'

# Override auth for a one-off request
jira get PROJ-123 --token ATATT3x... --cloud-id abc-123
```

---

## jira search

Search for issues using [Jira Query Language (JQL)](https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/).

```
jira search <jql> [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-f, --fields <list>` | string | `id,key,webUrl` | Comma-separated fields to fetch |
| `-l, --limit <n>` | number | `10` | Maximum number of results |
| `--json` | flag | — | Raw JSON output |
| `--cloud-id <id>` | string | stored config | Override cloud ID |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override GraphQL URL |

### Examples

```bash
# Simple project search (default fields)
jira search "project = DEMO"

# JQL with status filter and a higher limit
jira search "project = DEMO AND status = 'In Progress'" --limit 50

# Custom fields — key + summary + status
jira search "project = DEMO" \
  --fields id,key,summaryField.text,statusField.name \
  --limit 20

# Find my open issues
jira search "assignee = currentUser() AND status != Done" \
  --fields id,key,summaryField.text,priorityField.name

# Issues updated in the last 7 days
jira search "project = DEMO AND updated >= -7d ORDER BY updated DESC" --limit 25

# JSON output — extract all keys
jira search "project = DEMO" --json \
  | jq -r '.jira.issueSearchStable.edges[].node.key'

# JSON output — build a summary table
jira search "project = DEMO" \
  --fields id,key,summaryField.text,statusField.name --json \
  | jq -r '.jira.issueSearchStable.edges[].node | "\(.key)\t\(.statusField.name)\t\(.summaryField.text)"'
```

### JQL Quick Reference

| Filter | Example |
|---|---|
| By project | `project = DEMO` |
| By status | `status = "In Progress"` |
| By assignee (you) | `assignee = currentUser()` |
| Open sprints | `sprint in openSprints()` |
| Updated recently | `updated >= -7d` |
| Sort by created | `ORDER BY created DESC` |
| Unresolved bugs | `type = Bug AND resolution = Unresolved` |

---

## jira create

Create a new Jira issue from the command line.

```
jira create <summary> [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-p, --project <key>` | string | `ATLASSIAN_PROJECT` env | Project key **(required)** |
| `-t, --type <type>` | string | `Task` | Issue type name |
| `--priority <name>` | string | — | Priority: `Highest`, `High`, `Medium`, `Low`, `Lowest` |
| `--assignee <accountId>` | string | — | Atlassian account ID of the assignee |
| `--labels <list>` | string | — | Comma-separated labels |
| `--parent <key>` | string | — | Parent issue key (for sub-tasks) |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

### Examples

```bash
# Basic task
jira create "Fix login bug" --project DEMO

# Story with priority
jira create "Add dark mode" --project DEMO --type Story --priority High

# With labels
jira create "Update API docs" --project PROJ --labels docs,api

# Sub-task under a parent
jira create "Write unit tests" --project PROJ --type Sub-task --parent PROJ-42

# Use default project from env
export ATLASSIAN_PROJECT=DEMO
jira create "Quick task"

# Get the created issue key
jira create "New bug" --project DEMO --json | jq -r '.key'
```

### Common Issue Types

The available types depend on your Jira project configuration. Common ones include:

- `Task` (default)
- `Bug`
- `Story`
- `Epic`
- `Sub-task`

---

## jira comment

Manage comments on Jira issues.

### `jira comment add`

```
jira comment add <issue-key> <body> [options]
```

Adds a plain-text comment to an issue.

| Option | Description |
|---|---|
| `--json` | Raw JSON output |
| `-v, --verbose` | Verbose output |
| `--token <token>` | Override API token |
| `--url <url>` | Override base URL |

```bash
jira comment add PROJ-123 "This is fixed in branch feature/auth-fix."
jira comment add PROJ-123 "Approved. Merging after QA sign-off." --json
```

### `jira comment list`

```
jira comment list <issue-key> [options]
```

Lists all comments on an issue.

| Option | Description |
|---|---|
| `--json` | Raw JSON output |
| `-v, --verbose` | Verbose output |
| `--token <token>` | Override API token |
| `--url <url>` | Override base URL |

```bash
jira comment list PROJ-123
jira comment list PROJ-123 --json | jq '.[].body'
```

---

## jira transition

Move issues through the workflow.

### `jira transition list`

```
jira transition list <issue-key> [options]
```

Lists all transitions available from the issue's current status.

```bash
jira transition list PROJ-123
# Output: [11] To Do → In Progress
#         [21] In Progress → In Review
#         [31] In Review → Done
```

| Option | Description |
|---|---|
| `--json` | Raw JSON output |
| `-v, --verbose` | Verbose output |
| `--token <token>` | Override API token |
| `--url <url>` | Override base URL |

### `jira transition do`

```
jira transition do <issue-key> <transition-id> [options]
```

Moves an issue to a new status using the transition ID from `transition list`.

| Option | Description |
|---|---|
| `--json` | Raw JSON output |
| `-v, --verbose` | Verbose output |
| `--token <token>` | Override API token |
| `--url <url>` | Override base URL |

```bash
# First, find the transition ID
jira transition list PROJ-123

# Then apply it
jira transition do PROJ-123 31

# Workflow automation example
jira transition do PROJ-123 21  # → In Review
jira transition do PROJ-123 31  # → Done
```

---

## jira project

Browse and inspect Jira projects.

### `jira project list`

```
jira project list [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `-n, --max-results <n>` | number | `50` | Maximum number of projects to return |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

```bash
jira project list
jira project list --max-results 100
jira project list --json | jq '.[].key'
```

### `jira project get`

```
jira project get <project-key> [options]
```

```bash
jira project get DEMO
jira project get DEMO --json | jq '{key, name, description: .description}'
```

---

## jira board

List Jira boards (Scrum and Kanban).

### `jira board list`

```
jira board list [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `-t, --type <type>` | string | — | `scrum` or `kanban` |
| `--project-key <key>` | string | — | Filter boards by project key |
| `-n, --max-results <n>` | number | `50` | Maximum results |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

```bash
# All boards
jira board list

# Scrum boards only
jira board list --type scrum

# Boards for a specific project
jira board list --project-key DEMO

# Get board IDs for use with sprint commands
jira board list --json | jq '.[] | {id, name}'
```

---

## jira sprint

Manage sprints and sprint issues. You need a board ID (from `jira board list`) to list sprints.

### `jira sprint list`

```
jira sprint list <board-id> [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `--state <state>` | string | — | `active`, `closed`, or `future` |
| `-n, --max-results <n>` | number | `20` | Maximum results |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

```bash
# All sprints on board 42
jira sprint list 42

# Only the active sprint
jira sprint list 42 --state active

# Get sprint IDs for use with sprint issues
jira sprint list 42 --json | jq '.[] | {id, name, state}'
```

### `jira sprint issues`

```
jira sprint issues <sprint-id> [options]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `-n, --max-results <n>` | number | `50` | Maximum results |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

```bash
# List issues in sprint 123
jira sprint issues 123

# All issues (up to 100)
jira sprint issues 123 --max-results 100

# Extract keys
jira sprint issues 123 --json | jq '.[].key'
```

---

## jira link

Link two or more issues together.

> **Note:** This command is available via the `jira` shortcut only (not `atlassian jira link`).

```
jira link <source-key> <target-keys...> [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `--link-type-id <id>` | string | `10000` | Link type ID |
| `--direction <dir>` | string | `OUTWARD` | `INWARD` or `OUTWARD` |
| `-v, --verbose` | flag | — | Verbose output |
| `--json` | flag | — | Raw JSON output |
| `--cloud-id <id>` | string | stored config | Override cloud ID |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override GraphQL URL |

### Common Link Type IDs

| ID | Meaning |
|---|---|
| `10000` | Relates to (default) |
| `10001` | Blocks |
| `10002` | Clones |
| `10003` | Duplicates |

Your Jira instance may have additional custom link types. Use `atlassian api GET /rest/api/3/issueLinkType` to list all available types.

### Examples

```bash
# Link two issues as "Relates to"
jira link PROJ-123 PROJ-456

# Link one issue as blocking another
jira link PROJ-123 PROJ-456 --link-type-id 10001

# Link one issue to several targets at once
jira link PROJ-1 PROJ-2 PROJ-3 --link-type-id 10000

# Custom direction
jira link PROJ-123 PROJ-456 --link-type-id 10001 --direction INWARD
```

---

## Field Reference

Fields use **dot notation** for nested access. The available fields depend on your Jira configuration, but the most commonly used ones are:

### Scalar fields

| Field | Description |
|---|---|
| `id` | Internal GraphQL ID |
| `key` | Issue key (e.g. `PROJ-123`) |
| `issueId` | Numeric Jira issue ID |
| `webUrl` | URL to the issue in Jira |
| `summary` | Issue summary (plain string alias) |

### Field objects (use dot notation to drill in)

| Field | Sub-fields | Description |
|---|---|---|
| `summaryField` | `.text` | Issue summary |
| `descriptionField` | `.plainText`, `.html` | Issue description |
| `statusField` | `.name`, `.statusCategory.name` | Workflow status |
| `priorityField` | `.name`, `.iconUrl` | Priority level |
| `assigneeField` | `.user.name`, `.user.accountId`, `.user.email` | Assignee |
| `issueTypeField` | `.name`, `.iconUrl` | Issue type |
| `projectField` | `.name`, `.key` | Parent project |
| `createdField` | `.isoString`, `.epochMillis` | Creation timestamp |
| `updatedField` | `.isoString`, `.epochMillis` | Last updated timestamp |
| `resolutionField` | `.name` | Resolution (if resolved) |
| `resolutionDateField` | `.isoString` | Resolution date |
| `dueDateField` | `.isoString` | Due date |
| `startDateField` | `.isoString` | Start date |

### Examples of dot notation

```bash
jira get PROJ-123 --fields summaryField.text
jira get PROJ-123 --fields statusField.name,statusField.statusCategory.name
jira get PROJ-123 --fields assigneeField.user.name,assigneeField.user.email
jira get PROJ-123 --fields createdField.isoString,updatedField.isoString
```
