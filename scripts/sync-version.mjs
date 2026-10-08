import { writeLaunchManifests } from "./distribution.mjs";
import { readFile, writeFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
for (const file of ["packages/sim-stage-mcp/package.json", "plugins/sim-stage/plugin.json"]) {
  const url = new URL(`../${file}`, import.meta.url);
  const metadata = JSON.parse(await readFile(url, "utf8"));
  metadata.version = version;
  await writeFile(url, JSON.stringify(metadata, null, 2) + "\n");
}
const manifest = JSON.parse(await readFile(new URL("../plugins/sim-stage/plugin.json", import.meta.url), "utf8"));
const { $schema, extensions, ...identity } = manifest;
const { interface: presentation, ...openai } = extensions["com.openai"];
await writeFile(new URL("../plugins/sim-stage/.codex-plugin/plugin.json", import.meta.url), JSON.stringify({
  ...identity, interface: presentation, skills: "./skills/", mcpServers: "./.mcp.json", extensions: { "com.openai": openai },
}, null, 2) + "\n");
// Both manifests run the server bundled into the plugin.
await writeLaunchManifests(new URL("../plugins/sim-stage/", import.meta.url), { command: "bun", args: ["./dist/server.js"], cwd: "./" });
