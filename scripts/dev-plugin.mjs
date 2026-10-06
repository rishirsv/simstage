import { stagePlugin } from "./distribution.mjs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
await import("./build.mjs");

const marketplace = `${root}.dev-plugin/`;
const plugin = `${marketplace}plugins/sim-stage/`;
await rm(marketplace, { recursive: true, force: true });
await mkdir(`${marketplace}.agents/plugins`, { recursive: true });
await stagePlugin(root, plugin);
await writeFile(`${marketplace}.agents/plugins/marketplace.json`, JSON.stringify({
  name: "sim-stage-dev",
  interface: { displayName: "Sim Stage (development)" },
  plugins: [{ name: "sim-stage", source: { source: "local", path: "./plugins/sim-stage" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Developer Tools" }],
}, null, 2) + "\n");
// The host caches installed plugins by version, so each build needs a distinct one.
const manifestPath = `${plugin}.codex-plugin/plugin.json`;
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = `${manifest.version}+codex.${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Staged Sim Stage ${manifest.version} at ${plugin}`);
