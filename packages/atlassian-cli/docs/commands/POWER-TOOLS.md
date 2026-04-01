# Power Tools: api, gql, ask

Advanced commands for raw API access and AI-assisted queries.

---

## Table of Contents

- [api — Raw REST API calls](#api--raw-rest-api-calls)
- [gql — Raw GraphQL queries](#gql--raw-graphql-queries)
- [ask — AI-assisted queries](#ask--ai-assisted-queries)

---

## api — Raw REST API calls

Execute any Atlassian REST API endpoint directly. Useful for operations not yet covered by the higher-level commands, or for debugging.

```
atlassian api <METHOD> <endpoint> [options]
```

The `endpoint` is the path relative to your Atlassian base URL (e.g. `/rest/api/3/myself`).

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-d, --data <json>` | string | — | JSON body for POST/PUT/PATCH requests |
| `-f, --file <path>` | string | — | Path to a JSON file to use as the request body |
| `-H, --header <header>` | string | — | Extra header in `Name: Value` format. Repeatable. |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Print request details before executing |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override Atlassian base URL |

### Examples

```bash
# Get current user
atlassian api GET /rest/api/3/myself

# Get a project
atlassian api GET /rest/api/3/project/DEMO

# Get an issue
atlassian api GET /rest/api/3/issue/PROJ-123

# Create an issue with inline JSON
atlassian api POST /rest/api/3/issue \
  --data '{
    "fields": {
      "project": { "key": "PROJ" },
      "summary": "Fix authentication bug",
      "issuetype": { "name": "Bug" }
    }
  }'

# Create an issue from a file
atlassian api POST /rest/api/3/issue --file new-issue.json

# Update an issue (PATCH)
atlassian api PUT /rest/api/3/issue/PROJ-123 \
  --data '{"fields": {"summary": "Updated summary"}}'

# Add a watcher
atlassian api POST /rest/api/3/issue/PROJ-123/watchers \
  --data '"accountid-of-user"'

# Custom headers
atlassian api GET /rest/api/3/issue/PROJ-123 \
  -H "X-Trace-Id: my-trace-123" \
  -H "X-Custom-Header: value"

# Pipe to jq
atlassian api GET /rest/api/3/myself --json | jq '{displayName, emailAddress}'

# List all issue link types
atlassian api GET /rest/api/3/issueLinkType --json | jq '.issueLinkTypes[] | {id, name}'

# List all priorities
atlassian api GET /rest/api/3/priority --json | jq '.[].name'
```

### Common Jira REST Endpoints

| Endpoint | Description |
|---|---|
| `GET /rest/api/3/myself` | Current user details |
| `GET /rest/api/3/project` | List all projects |
| `GET /rest/api/3/project/{key}` | Get a project |
| `GET /rest/api/3/issue/{key}` | Get an issue |
| `POST /rest/api/3/issue` | Create an issue |
| `PUT /rest/api/3/issue/{key}` | Update an issue |
| `DELETE /rest/api/3/issue/{key}` | Delete an issue |
| `GET /rest/api/3/issue/{key}/transitions` | List transitions |
| `POST /rest/api/3/issue/{key}/transitions` | Apply a transition |
| `GET /rest/api/3/issue/{key}/comment` | List comments |
| `POST /rest/api/3/issue/{key}/comment` | Add a comment |
| `GET /rest/api/3/issueLinkType` | List link types |
| `GET /rest/api/3/priority` | List priorities |
| `GET /rest/api/3/issuetype` | List issue types |

See the [Jira Cloud REST API docs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) for the full reference.

---

## gql — Raw GraphQL queries

Execute raw GraphQL queries directly against the [Atlassian Graph Gateway (AGG)](https://developer.atlassian.com/cloud/jira/platform/graphql/) API.

```
atlassian gql [query] [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-f, --file <path>` | string | — | Path to a `.graphql` file |
| `--variables <json>` | string | — | JSON variables object |
| `--variables-file <path>` | string | — | Path to a JSON variables file |
| `--operation-name <name>` | string | — | Operation name when the file has multiple operations |
| `--json` | flag | — | Include the full GraphQL envelope (`data` + `errors`) |
| `-v, --verbose` | flag | — | Print query and variables before executing |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override GraphQL API URL |

### Examples

#### Inline queries

```bash
# Simple query (cloud ID required in query)
atlassian gql 'query { __typename }'

# Query with verbose mode (see what's sent)
atlassian gql 'query { jira { projects(cloudId: "YOUR_CLOUD_ID") { nodes { id name } } } }' \
  --verbose
```

#### File-based queries

```graphql
# query.graphql
query GetIssue($cloudId: String!, $issueKey: String!) {
  jira {
    issueByKeyOrId(cloudId: $cloudId, issueIdOrKey: $issueKey) {
      id
      key
      summaryField { text }
      statusField { name }
      assigneeField {
        user { name accountId }
      }
    }
  }
}
```

```bash
atlassian gql --file query.graphql \
  --variables '{"cloudId": "your-cloud-id", "issueKey": "PROJ-123"}'
```

#### Variables from a file

```json
// vars.json
{
  "cloudId": "your-cloud-id",
  "issueKey": "PROJ-123"
}
```

```bash
atlassian gql --file query.graphql --variables-file vars.json
```

#### Multiple operations in one file

```graphql
# queries.graphql
query GetIssue($issueKey: String!) {
  jira { issueByKeyOrId(issueIdOrKey: $issueKey) { key } }
}

query GetProject($key: String!) {
  jira { projectByKey(key: $key) { name } }
}
```

```bash
atlassian gql --file queries.graphql \
  --operation-name GetIssue \
  --variables '{"issueKey": "PROJ-123"}'
```

#### Full GraphQL envelope (includes errors)

```bash
atlassian gql --file query.graphql --variables-file vars.json --json
# Returns: { "data": { ... }, "errors": [] }
```

### Tips

- Use `--verbose` during development to inspect the exact query being sent.
- Use `--json` when you need to check for GraphQL-level errors in `errors[]`.
- The Atlassian GraphQL schema has 8000+ types. Use [Atlassian's API explorer](https://developer.atlassian.com/platform/atlassian-graph-gateway/schema/) to browse them.

---

## ask — AI-assisted queries

Fetch Atlassian data and send it as context to an AI agent.

```
atlassian ask [question] [options]
```

The CLI fetches the requested context (Jira issues, Confluence pages, or space content), builds a prompt, and forwards it to the chosen AI agent.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-a, --agent <agent>` | string | `claude` | AI agent to use (see below) |
| `--jql <jql>` | string | — | Fetch Jira issues matching this JQL as context |
| `--page-id <id>` | string | — | Fetch a specific Confluence page as context |
| `--space-key <key>` | string | — | Fetch pages from a Confluence space as context |
| `-l, --limit <n>` | number | `10` | Maximum context items to fetch |
| `--dry-run` | flag | — | Print the prompt instead of sending it to the agent |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

### Supported Agents

| Value | Description |
|---|---|
| `claude` | [Anthropic Claude](https://claude.ai) (default) |
| `codex` | OpenAI Codex |
| `chatgpt` | OpenAI ChatGPT |
| `gemini` | Google Gemini |
| `ollama` | Local [Ollama](https://ollama.ai) instance |
| Any shell command | Runs the command and pipes the prompt to it (e.g. `"docker run --rm my-llm"`) |

### Examples

```bash
# Summarise recent bugs using Claude
atlassian ask "Summarise the top 5 bugs" \
  --jql "type = Bug ORDER BY created DESC" \
  --limit 5

# Sprint status report
atlassian ask "What is the status of the current sprint?" \
  --jql "project = DEMO AND sprint in openSprints()" \
  --limit 20

# Draft release notes from a Confluence space
atlassian ask "Draft a release note for version 2.0" \
  --agent claude \
  --space-key DOCS \
  --limit 10

# Answer a question about a specific page
atlassian ask "What decisions were made in this meeting?" \
  --page-id 123456

# Use a different AI agent
atlassian ask "List all open blockers" \
  --agent gemini \
  --jql "type = Bug AND priority = Blocker AND status != Done"

# Use a custom agent via shell command
atlassian ask "Summarise open issues" \
  --agent "docker run --rm my-llm-image" \
  --jql "status = Open"

# Dry run — inspect the prompt before sending
atlassian ask "Summarise issues" \
  --jql "project = DEMO" \
  --dry-run

# Multiple context sources
atlassian ask "What should I work on today?" \
  --jql "assignee = currentUser() AND status != Done" \
  --limit 10
```

### How It Works

1. **Fetch context** — The CLI fetches the data requested via `--jql`, `--page-id`, or `--space-key`
2. **Build prompt** — The data is serialised and combined with your question into a single prompt
3. **Send to agent** — The prompt is forwarded to the chosen AI agent
4. **Display response** — The agent's response is printed to stdout

Use `--dry-run` to inspect the full prompt before sending it to the agent. This is useful for debugging or for manually copying the prompt to another tool.
