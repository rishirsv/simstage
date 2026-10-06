#!/usr/bin/env bun
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log(JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version);
} else if (args.includes("--help")) {
  console.log("sim-stage-mcp [--preview | --version | --help]\nRuns the Sim Stage MCP server over stdio. Requires macOS and Xcode 27.");
} else if (args.some(arg => arg !== "--preview")) {
  console.error("Unknown argument. Use --help for usage.");
  process.exitCode = 1;
} else {
  await import("../dist/server.js");
}
