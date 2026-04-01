#!/usr/bin/env bun
/**
 * GitHub webhook plugin for Claude Code.
 *
 * Provides tools for agents to register and manage GitHub webhooks on Wire.
 * The agent calls register_pr_webhook with a repo and PR number; the plugin
 * handles creating the GitHub hook, Wire registration, HMAC validation,
 * PR filtering, and cleanup on deletion.
 *
 * Config env vars:
 *   WIRE_URL             default http://localhost:9800
 *   WIRE_EXTERNAL_URL    externally-reachable Wire URL (e.g. ngrok)
 *   WIRE_AGENT_ID        required
 *   WIRE_PRIVATE_KEY     or PANE_PRIVATE_KEY — for Wire API auth
 *   GITHUB_TOKEN         default GitHub token (admin:repo_hook scope)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { registerPrWebhook, registerRepoWebhook, unregisterWebhook } from "@agiterra/github-tools";
import { createAuthJwt } from "@agiterra/wire-tools/crypto";

const WIRE_URL = process.env.WIRE_URL ?? "http://localhost:9800";
const WIRE_EXTERNAL_URL = process.env.WIRE_EXTERNAL_URL ?? WIRE_URL;
const AGENT_ID =
  process.env.PANE_AGENT_ID ?? process.env.WIRE_AGENT_ID ?? "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

let signingKey: CryptoKey | null = null;

// --- MCP server ---

const mcp = new Server(
  { name: "github", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "This plugin provides GitHub webhook management for Wire. " +
      "Use register_pr_webhook to monitor a PR's CI, reviews, and comments. " +
      "Use unregister_webhook to stop monitoring. " +
      "Webhooks are automatically cleaned up when ephemeral agents are reaped.",
  },
);

// --- Tools ---

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "register_pr_webhook",
      description:
        "Register a GitHub webhook to monitor a PR. Creates the hook on GitHub " +
        "and registers it on Wire with HMAC validation and PR number filtering. " +
        "Events delivered via Wire SSE.",
      inputSchema: {
        type: "object" as const,
        properties: {
          repo: {
            type: "string",
            description: "Repository in owner/repo format (e.g. 'fabrica-land/soil-app')",
          },
          pr_number: {
            type: "number",
            description: "PR number to monitor",
          },
          name: {
            type: "string",
            description: "Optional webhook name. Defaults to '{repo-name}-pr-{number}'",
          },
          events: {
            type: "array",
            items: { type: "string" },
            description:
              "GitHub events to subscribe to. Defaults to: check_run, pull_request, " +
              "pull_request_review, pull_request_review_comment, issue_comment, workflow_run",
          },
          github_token: {
            type: "string",
            description:
              "GitHub token with admin:repo_hook scope. Defaults to GITHUB_TOKEN env var.",
          },
        },
        required: ["repo", "pr_number"],
      },
    },
    {
      name: "register_repo_webhook",
      description:
        "Register a GitHub webhook for a repo with custom events and filter. " +
        "For PR monitoring, prefer register_pr_webhook which sets up defaults.",
      inputSchema: {
        type: "object" as const,
        properties: {
          repo: {
            type: "string",
            description: "Repository in owner/repo format",
          },
          name: {
            type: "string",
            description: "Webhook name (used in the Wire URL path)",
          },
          events: {
            type: "array",
            items: { type: "string" },
            description: "GitHub events to subscribe to",
          },
          filter: {
            type: "string",
            description:
              "JS filter expression. Available vars: headers (object), payload (parsed body). " +
              "Return true to deliver, false to drop. Example: 'payload.action === \"completed\"'",
          },
          github_token: {
            type: "string",
            description: "GitHub token. Defaults to GITHUB_TOKEN env var.",
          },
        },
        required: ["repo", "name", "events"],
      },
    },
    {
      name: "unregister_webhook",
      description:
        "Unregister a webhook from Wire. Runs the cleanup code to delete the " +
        "GitHub hook automatically.",
      inputSchema: {
        type: "object" as const,
        properties: {
          webhook_id: {
            type: "number",
            description: "Wire webhook ID (returned by register_pr_webhook)",
          },
        },
        required: ["webhook_id"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    if (!signingKey) throw new Error("no signing key — Wire auth disabled");

    // Mint a JWT for Wire API calls
    const body = "{}";
    const wireAuthToken = await createAuthJwt(signingKey, AGENT_ID, body);

    if (name === "register_pr_webhook") {
      const repo = a.repo as string;
      const prNumber = a.pr_number as number;
      const token = (a.github_token as string) || GITHUB_TOKEN;

      if (!token) throw new Error("no GitHub token — set GITHUB_TOKEN or pass github_token param");
      if (!repo) throw new Error("missing repo");
      if (!prNumber) throw new Error("missing pr_number");

      const result = await registerPrWebhook({
        wireUrl: WIRE_URL,
        agentId: AGENT_ID,
        wireAuthToken,
        githubToken: token,
        repo,
        prNumber,
        name: a.name as string | undefined,
        events: a.events as string[] | undefined,
        externalUrl: WIRE_EXTERNAL_URL,
      });

      return {
        content: [{
          type: "text" as const,
          text: `Webhook registered: ${result.name}\n` +
            `Wire webhook ID: ${result.wireWebhookId}\n` +
            `GitHub hook ID: ${result.githubHookId}\n` +
            `URL: ${result.wireWebhookUrl}`,
        }],
      };
    }

    if (name === "register_repo_webhook") {
      const repo = a.repo as string;
      const webhookName = a.name as string;
      const events = a.events as string[];
      const token = (a.github_token as string) || GITHUB_TOKEN;

      if (!token) throw new Error("no GitHub token — set GITHUB_TOKEN or pass github_token param");
      if (!repo) throw new Error("missing repo");
      if (!webhookName) throw new Error("missing name");
      if (!events?.length) throw new Error("missing events");

      const result = await registerRepoWebhook({
        wireUrl: WIRE_URL,
        agentId: AGENT_ID,
        wireAuthToken,
        githubToken: token,
        repo,
        name: webhookName,
        events,
        filter: a.filter as string | undefined,
        externalUrl: WIRE_EXTERNAL_URL,
      });

      return {
        content: [{
          type: "text" as const,
          text: `Webhook registered: ${result.name}\n` +
            `Wire webhook ID: ${result.wireWebhookId}\n` +
            `GitHub hook ID: ${result.githubHookId}\n` +
            `URL: ${result.wireWebhookUrl}`,
        }],
      };
    }

    if (name === "unregister_webhook") {
      const webhookId = a.webhook_id as number;
      if (!webhookId) throw new Error("missing webhook_id");

      await unregisterWebhook({
        wireUrl: WIRE_URL,
        agentId: AGENT_ID,
        wireAuthToken,
        webhookId,
      });

      return {
        content: [{ type: "text" as const, text: `Webhook ${webhookId} deleted` }],
      };
    }

    throw new Error(`unknown tool: ${name}`);
  } catch (e: any) {
    return {
      content: [{ type: "text" as const, text: `${name} failed: ${e.message}` }],
      isError: true,
    };
  }
});

// --- Main ---

async function main(): Promise<void> {
  const rawKey = process.env.PANE_PRIVATE_KEY ?? process.env.WIRE_PRIVATE_KEY;
  if (!rawKey) {
    console.error("[github] no private key — Wire auth disabled");
  } else {
    const pkcs8 = Uint8Array.from(atob(rawKey), (c) => c.charCodeAt(0));
    signingKey = await crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", true, ["sign"]);
  }

  if (!AGENT_ID) {
    console.error("[github] no WIRE_AGENT_ID — tools will fail");
  }
  if (!GITHUB_TOKEN) {
    console.error("[github] no GITHUB_TOKEN — agents must pass github_token param");
  }

  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  console.error(`[github] ready (agent=${AGENT_ID})`);
}

main().catch((e) => {
  console.error("[github] fatal:", e);
  process.exit(1);
});
