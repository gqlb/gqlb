# Confluence Commands

Full reference for all `atlassian confluence` commands.

---

## Table of Contents

- [confluence get](#confluence-get)
- [confluence search](#confluence-search)
- [confluence spaces](#confluence-spaces)
- [confluence create](#confluence-create)

---

## confluence get

Fetch a single Confluence page by its numeric ID.

```
atlassian confluence get <page-id> [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `--expand <fields>` | string | `body.storage,version,space,ancestors` | Comma-separated expand fields |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

### Expand fields

Confluence's REST API uses an `expand` parameter to include related data. Common values:

| Value | Description |
|---|---|
| `body.storage` | Page body in Confluence storage format (XHTML) |
| `body.export_view` | Simplified HTML view |
| `body.view` | Rendered HTML |
| `version` | Version history metadata |
| `space` | Space name and key |
| `ancestors` | Parent page chain |
| `children.page` | Immediate child pages |
| `descendants.page` | All descendant pages |
| `metadata.labels` | Page labels/tags |

### Examples

```bash
# Fetch a page with default expand fields
atlassian confluence get 123456

# Only fetch the body and version
atlassian confluence get 123456 --expand body.storage,version

# Include child pages
atlassian confluence get 123456 --expand body.storage,children.page

# Extract body text via jq
atlassian confluence get 123456 --json \
  | jq -r '.body.storage.value'

# Get page metadata
atlassian confluence get 123456 --json \
  | jq '{title, version: .version.number, space: .space.name}'
```

---

## confluence search

Search Confluence content using [Confluence Query Language (CQL)](https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/).

```
atlassian confluence search <cql> [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-l, --limit <n>` | number | `10` | Maximum number of results |
| `--start <n>` | number | `0` | Pagination start index |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

### Examples

```bash
# Search by title
atlassian confluence search "title ~ 'Release Notes'"

# All pages in a space
atlassian confluence search "type = page AND space = DEMO" --limit 50

# Pages modified recently
atlassian confluence search "type = page AND lastModified >= '2024-01-01'"

# Pages with a specific label
atlassian confluence search "label = 'approved'" --limit 20

# Paginate through results
atlassian confluence search "type = page AND space = DOCS" --limit 25 --start 0
atlassian confluence search "type = page AND space = DOCS" --limit 25 --start 25

# JSON output — get page IDs and titles
atlassian confluence search "space = DEMO" --json \
  | jq '.results[] | {id, title}'

# Count results
atlassian confluence search "type = page AND space = DEMO" --limit 100 --json \
  | jq '.results | length'
```

### CQL Quick Reference

| Filter | Example |
|---|---|
| By title | `title ~ "Release Notes"` |
| Exact title | `title = "Home"` |
| By space | `space = DEMO` |
| By type | `type = page` or `type = blogpost` |
| By label | `label = "approved"` |
| By ancestor | `ancestor = 123456` |
| Text contains | `text ~ "authentication"` |
| Modified after | `lastModified >= "2024-01-01"` |
| Created by | `creator = currentUser()` |
| Sort | `ORDER BY lastModified DESC` |

---

## confluence spaces

List Confluence spaces in your instance.

```
atlassian confluence spaces [options]
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-t, --type <type>` | string | — | `global` or `personal` |
| `-l, --limit <n>` | number | `25` | Maximum number of spaces |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

### Examples

```bash
# All spaces
atlassian confluence spaces

# Global spaces only
atlassian confluence spaces --type global --limit 100

# Personal spaces only
atlassian confluence spaces --type personal

# Get space keys
atlassian confluence spaces --json | jq '.[].key'

# Get space name + key table
atlassian confluence spaces --json | jq '.[] | "\(.key)\t\(.name)"'
```

---

## confluence create

Create a new Confluence page.

```
atlassian confluence create <title> <content> [options]
```

Content should be provided as [Confluence Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html) (XHTML).

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `-s, --space-key <key>` | string | `CONFLUENCE_SPACE_KEY` env | Space key **(required)** |
| `--parent-id <id>` | string | — | Parent page numeric ID |
| `--json` | flag | — | Raw JSON output |
| `-v, --verbose` | flag | — | Verbose output |
| `--token <token>` | string | stored config | Override API token |
| `--url <url>` | string | stored config | Override base URL |

### Examples

```bash
# Simple page at root of space
atlassian confluence create "My Page" "<p>Hello world</p>" --space-key DEMO

# Page under a parent
atlassian confluence create "Sub Page" "<p>Under parent</p>" \
  --space-key DEMO --parent-id 123456

# Use default space from env
export CONFLUENCE_SPACE_KEY=DEMO
atlassian confluence create "Quick Note" "<p>Created from CLI</p>"

# Capture the new page ID
atlassian confluence create "Automated Report" "<p>Content</p>" \
  --space-key DEMO --json | jq -r '.id'

# Page with structured content
atlassian confluence create "Meeting Notes" \
  "<h2>Attendees</h2><ul><li>Alice</li><li>Bob</li></ul><h2>Actions</h2><p>TBD</p>" \
  --space-key DEMO --parent-id 98765
```

### Content Format Tips

Confluence Storage Format is XHTML-based. Key tags:

| Purpose | Tag |
|---|---|
| Paragraph | `<p>text</p>` |
| Heading | `<h1>`, `<h2>`, `<h3>` |
| Unordered list | `<ul><li>item</li></ul>` |
| Ordered list | `<ol><li>item</li></ol>` |
| Bold | `<strong>text</strong>` |
| Italic | `<em>text</em>` |
| Code block | `<ac:structured-macro ac:name="code">...` |
| Link | `<a href="url">text</a>` |

For complex pages, consider writing the content to a file and passing it via shell:

```bash
atlassian confluence create "My Page" "$(cat content.html)" --space-key DEMO
```
