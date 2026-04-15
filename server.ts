#!/usr/bin/env bun
import { startServer } from "@agiterra/github-tools";

startServer().catch((e) => {
  console.error("[github] fatal:", e);
  process.exit(1);
});
