# github

> Register GitHub webhooks routed through your Wire so your agents get notified of PR events in real time — and act on them.

## What this gets you

- **Real-time PR events on Wire** — `pull_request`, `pull_request_review`, `issue_comment`, `check_run`, `check_suite`, `workflow_run` (pre- and post-merge) delivered as Wire channel events
- **Agent-driven PR work** — your agents watch a specific PR and act on it (read CI, post reviews, detect rebase conflicts, flip merge gates)
- **HMAC validation built in** — every webhook payload is HMAC-SHA256-validated in Wire's sandbox before delivery
- **PR-scoped by default** — `register_pr_webhook` scopes a hook to a single PR's lifecycle, so an agent only hears about its own PR (not the whole repo)
- **Auto-cleanup** — a built-in hook unregisters the PR's webhook on `pull_request.closed`/`merged`; Wire's janitor catches crash orphans on a grace window

This is how Agiterra agents become active participants in your code-review workflow, on Claude Code or Codex.

## Quick setup

```
/plugin install github@agiterra
```

Provide a GitHub token. In precedence order, the plugin resolves one from:

1. a per-call `github_token` argument, then
2. **`GITHUB_APP_TOKEN_CMD`** — a command that prints a fresh token on stdout (preferred for anything long-running; minted on demand and cached ~50min so the server never holds an expired ~1h installation token), then
3. **`GITHUB_TOKEN`** — a static token (needs `admin:repo_hook`; add `statuses:write` if you use `gate_set`), then
4. **`gh auth token`** — the gh CLI, if it is authenticated (common in worktrees).

Then ask your agent:

> "Register a webhook for PR 1234 on `<org>/<repo>` so I hear about its CI and reviews on Wire."

## Quick example

```
register_pr_webhook({
  repo: 'fabrica-land/fabrica-v3-api',
  pr_number: 1234,
})
```

Your agent now receives a Wire channel event (topic `webhook.github`) whenever that PR's CI completes, a review lands, a comment is posted, or a post-merge workflow runs. The hook is scoped to PR #1234 — the agent does not hear about other PRs.

## For the agent

Tools exposed:

| Tool | What it does |
|---|---|
| `register_pr_webhook` | Register a GitHub webhook scoped to one PR. Args: `repo` (owner/repo), `pr_number`, optional `name`, `deploy_workflow_name`, `filter`, `github_token`. Creates the GitHub hook, registers it on Wire with HMAC validation + PR-scoped filtering, and returns the Wire webhook ID + GitHub hook ID. Catches pre-merge events (CI on the PR branch) and post-merge events (workflows triggered by the merge commit on the default branch). |
| `register_repo_webhook` | Register a repo-wide webhook with custom `events` and an optional `filter`. Args: `repo`, `name`, `events` (array), optional `filter`, `github_token`. Use when you need events not tied to a single PR. |
| `check_pr_rebase` | Check whether a PR needs a rebase. Reads GitHub's `mergeable_state`, retrying with backoff (~52s) while GitHub computes it. Returns `{ state, needs_rebase, message, attempts, pr_url }`; `needs_rebase` is true only when `state === 'dirty'` (real conflicts). Args: `repo`, `pr_number`, optional `github_token`. |
| `gate_set` | Set the `brioche/gates` commit status on a PR's head commit (deterministic merge gate). Args: `repo`, `pr_number`, `state` (`pending`/`success`/`failure`/`error`), optional `description`, `target_url`, `github_token`. Requires `statuses:write` on the token. |
| `unregister_webhook` | Delete a Wire webhook registration (runs its cleanup, which deletes the GitHub hook). Args: `webhook_id`, optional `agent_id` to clean up another agent's webhook. |

Webhook payloads arrive on the **`webhook.github`** Wire topic. Each event has the GitHub payload plus a `webhook_id`; filter by repo, action, or sender per your agent's role.

### Default PR events

`register_pr_webhook` subscribes to: `check_run`, `check_suite`, `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `workflow_run`. The built-in filter scopes these to the given PR (including PR comments, which GitHub fires as `issue_comment`). Pass `deploy_workflow_name` (e.g. `'Deploy to Staging'`) to scope post-merge `workflow_run` matches to a specific deploy workflow.

### Filter trap (read before using `filter`)

The `filter` argument is **OR'd at the top level** with the built-in PR-scoped filter. If your expression is not scoped to THIS PR, it fires on matching events across the WHOLE repo. Scope every clause to the PR, e.g.:

- `pull_request_review` / `pull_request_review_comment`: `payload.pull_request?.number === <N>`
- `issue_comment` (PR comments): `payload.issue?.number === <N>`
- `check_run` / `check_suite`: `payload.check_run?.pull_requests?.some(p => p.number === <N>)`
- `workflow_run`: `payload.workflow_run?.pull_requests?.some(p => p.number === <N>)`

Legitimately repo-wide events (e.g. a `Deploy to Staging` run on `main`) should be narrowed by workflow name + branch instead of PR number.

## Reference

| Var | Default | Description |
|---|---|---|
| `GITHUB_APP_TOKEN_CMD` | (unset) | Command that prints a fresh GitHub token on stdout (e.g. a GitHub-App mint script). **Preferred** — minted on demand, cached ~50min, never holds a stale ~1h installation token. |
| `GITHUB_TOKEN` | (unset) | Static fallback token. Needs `admin:repo_hook`; add `statuses:write` for `gate_set`. WARNING: installation tokens expire in ~1h — prefer `GITHUB_APP_TOKEN_CMD` for long-running servers. |
| `WIRE_URL` | `http://localhost:9800` | Wire server base URL (where the plugin signs and POSTs registrations). |
| `WIRE_EXTERNAL_URL` | = `WIRE_URL` | Externally-reachable Wire URL advertised to GitHub for the webhook callback (e.g. your ngrok URL). On a localhost Wire you MUST set this to the public URL, or GitHub gets a `localhost` callback and rejects it (HTTP 422). |
| `AGENT_ID` | (required) | Agent identity for Wire routing and webhook URL path. |
| `AGENT_PRIVATE_KEY` | (required) | Ed25519 PKCS8 private key (base64) for Wire API auth. |

If no token is found via any source above, you can also pass `github_token` directly on each tool call.

## Concepts

- [Wire overview](https://github.com/agiterra/handbook/blob/main/CORE.md#2-the-wire)

## Related plugins

- [`wire`](https://github.com/agiterra/wire-claude-code) and [`wire-ipc`](https://github.com/agiterra/wire-ipc-claude-code) — required (registrations are signed through Wire and events are delivered over Wire)

## License

MIT.
