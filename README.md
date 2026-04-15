# github-claude-code

GitHub webhook tools — register PR webhooks via Wire and manage their lifecycle.

## Prerequisites

- `GITHUB_TOKEN` env var with repo webhook permissions
- Wire server running (default: `localhost:9800`)
- Bun (https://bun.sh)

## Install

```
/plugin install agiterra/github-claude-code
```

## Tools / Skills

**MCP tools:**
- `github_webhook_register` — register a PR webhook for a repo, routed through Wire
- `github_webhook_list` — list active webhook registrations
- `github_webhook_delete` — remove a webhook registration
- `github_pr_status` — get current status of a pull request

## Configuration

| Var | Default | Description |
|-----|---------|-------------|
| `GITHUB_TOKEN` | — | GitHub personal access token (required) |
| `WIRE_URL` | `http://localhost:9800` | Wire server base URL |
| `AGENT_ID` | — | Agent identity for Wire routing |
| `AGENT_PRIVATE_KEY` | — | Ed25519 private key for Wire auth |
