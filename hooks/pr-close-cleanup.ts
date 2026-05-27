#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: auto-unregister this agent's PR webhook on
 * pull_request.closed / merged.
 *
 * Why: wire's janitor (v1.8.0) catches crash orphans on a 1h grace window;
 * for the clean-close case the webhook should disappear immediately so it
 * doesn't fan out check_runs from future PRs or clutter the dashboard.
 *
 * Stdin: { prompt, session_id, cwd, ... }
 * Reads: AGENT_ID, AGENT_PRIVATE_KEY, WIRE_URL from env.
 * Requires: wire envelope enrichment (webhook_id field added 2026-05).
 */

import { importPrivateKey, createAuthJwt } from "@agiterra/wire-tools";

async function main() {
  let input: { prompt?: string };
  try {
    input = JSON.parse(await Bun.stdin.text());
  } catch {
    process.exit(0);
  }

  const prompt = input.prompt ?? "";
  if (!prompt.includes("<channel ")) process.exit(0);

  const m = prompt.match(/<channel\b[^>]*topic="webhook\.github"[^>]*>([\s\S]*?)<\/channel>/);
  if (!m) process.exit(0);

  let envelope: { payload?: { action?: string; pull_request?: unknown }; webhook_id?: number };
  try {
    envelope = JSON.parse(m[1]!.trim());
  } catch {
    process.exit(0);
  }

  const action = envelope.payload?.action;
  if (action !== "closed" && action !== "merged") process.exit(0);
  if (!envelope.payload?.pull_request) process.exit(0);

  const webhookId = envelope.webhook_id;
  if (typeof webhookId !== "number") {
    // Envelope from an older wire that doesn't surface webhook_id. No-op.
    console.error("[pr-close-cleanup] no webhook_id in envelope — wire too old?");
    process.exit(0);
  }

  const agentId = process.env.AGENT_ID;
  const wireUrl = process.env.WIRE_URL;
  const rawKey = process.env.AGENT_PRIVATE_KEY;
  if (!agentId || !wireUrl || !rawKey) {
    console.error("[pr-close-cleanup] missing AGENT_ID / WIRE_URL / AGENT_PRIVATE_KEY — skipping");
    process.exit(0);
  }

  try {
    const signingKey = await importPrivateKey(rawKey);
    const body = "{}";
    const token = await createAuthJwt(signingKey, agentId, body);
    const res = await fetch(`${wireUrl}/agents/${agentId}/webhooks/${webhookId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) {
      console.error(`[pr-close-cleanup] webhook ${webhookId} unregistered (action=${action})`);
    } else {
      console.error(`[pr-close-cleanup] delete failed (${res.status}): ${await res.text()}`);
    }
  } catch (e) {
    const err = e as Error;
    console.error(`[pr-close-cleanup] error: ${err.message}`);
  }

  process.exit(0);
}

main();
