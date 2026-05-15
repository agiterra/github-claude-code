# agiterra-github

> Register PR webhooks routed through your Wire so your agents get notified of PR events in real time — and act on them.

## What this gets you

- **Real-time PR notifications on Wire** — `pull_request.opened`, `synchronize`, `closed`, etc. delivered as channel events
- **Agent-driven PR reviews** — your agents subscribe to relevant repos and act on review-ready PRs (run tests, post reviews, request changes, etc.)
- **HMAC validation built in** — webhook payloads validated before delivery
- **Multi-repo, per-agent registrations** — each agent subscribes only to repos they care about

This is how Agiterra agents become active participants in your code review workflow.

## Quick setup

```
/plugin install agiterra-github@agiterra
```

Set `GITHUB_TOKEN` to a personal access token with `repo` scope (webhook management requires this).

Then ask your agent:

> "Register a webhook for the <org>/<repo> repo to receive PR events on Wire."

## Quick example

```
github_webhook_register({
  repo: 'fabrica-land/fabrica-v3-api',
  events: ['pull_request', 'pull_request_review'],
})
```

Your agent now receives a Wire channel event whenever a PR opens or a review lands on that repo. They can decide whether to engage based on author, branch, file changes, etc.

## For the agent

Tools exposed:

| Tool | What it does |
|---|---|
| `github_webhook_register` | Register a PR webhook for a repo, routed through Wire |
| `github_webhook_list` | List your active webhook registrations |
| `github_webhook_delete` | Remove a webhook registration |
| `github_pr_status` | Get current status (checks, mergeable, review state) for a PR |

Webhook payloads arrive on the `github` Wire topic. Filter by repo, event type, or sender per your agent's role.

## Reference

| Var | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | (required) | GitHub personal access token with `repo` scope |
| `WIRE_URL` | `http://localhost:9800` | Wire server base URL |
| `AGENT_ID` | (required) | Agent identity for Wire routing |
| `AGENT_PRIVATE_KEY` | (required) | Ed25519 private key for Wire auth |

## Concepts

- [Wire overview](https://github.com/agiterra/handbook/blob/main/CORE.md#2-the-wire)

## Related plugins

- [`wire`](https://github.com/agiterra/wire-claude-code) and [`wire-ipc`](https://github.com/agiterra/wire-ipc-claude-code) — required (webhooks delivered via Wire)

## License

MIT.
