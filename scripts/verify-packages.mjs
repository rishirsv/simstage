import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { smokeArtifact } from "./package-smoke.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const name = "sim-stage-mcp";
const directory = await mkdtemp(join(tmpdir(), "apple-packages-"));
try {
  execFileSync("tar", ["-xzf", join(root, "release", `${name}-${version}.tgz`), "-C", directory]);
  const packageRoot = join(directory, "package");
  const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(metadata.name, name);
  assert.equal(metadata.version, version);
  assert.ok(!metadata.dependencies, "Runtime dependencies must be bundled");
  for (const file of ["LICENSE", "NOTICE"]) assert.deepEqual(await readFile(join(packageRoot, "dist", file)), await readFile(join(root, file)));
  const notices = await readFile(join(packageRoot, "dist", "THIRD_PARTY_NOTICES.txt"), "utf8");
  for (const name of ["@modelcontextprotocol/sdk@", "react@", "shadcn@", "tailwindcss@", "tw-animate-css@"]) assert.ok(notices.includes(name), `${name} license must ship`);
  const bin = join(packageRoot, metadata.bin[name]);
  assert.equal(execFileSync(bin, ["--version"], { cwd: directory, encoding: "utf8" }).trim(), version);
  assert.match(execFileSync(bin, ["--help"], { cwd: directory, encoding: "utf8" }), new RegExp(name));
  const native = join(packageRoot, "dist", "simulator-stream");
  assert.deepEqual(execFileSync("xcrun", ["lipo", "-archs", native], { encoding: "utf8" }).trim().split(/\s+/), ["arm64"]);
  execFileSync("codesign", ["--verify", "--strict", native]);
  await assert.rejects(readFile(join(packageRoot, ".codex-plugin", "plugin.json")), /ENOENT/);
  await smokeArtifact({ name, version, command: process.execPath, args: [bin], cwd: directory });
  console.log(`Verified ${name}@${version}: isolated MCP, viewer, signed arm64 helper.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}

// The Git-installed plugin contains only manifests and assets, and runs the npm server of its own version.
const plugin = join(root, "plugins", "sim-stage");
const marketplace = JSON.parse(await readFile(join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
assert.equal(marketplace.name, "sim-stage");
assert.deepEqual(marketplace.plugins.map(entry => [entry.name, entry.source.path]), [["sim-stage", "./plugins/sim-stage"]]);
const manifest = JSON.parse(await readFile(join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
assert.equal(manifest.version, version);
assert.equal(JSON.parse(await readFile(join(plugin, "plugin.json"), "utf8")).version, version);
assert.deepEqual(JSON.parse(await readFile(join(plugin, manifest.mcpServers), "utf8")).mcpServers["sim-stage"], { command: "bun", args: ["x", "--bun", `${name}@${version}`] });
assert.deepEqual(JSON.parse(await readFile(join(plugin, "mcp.json"), "utf8")).mcpServers["sim-stage"], { type: "stdio", command: "bun", args: ["x", "--bun", `${name}@${version}`] });
const tracked = execFileSync("git", ["ls-files", "plugins/sim-stage"], { cwd: root, encoding: "utf8" }).trim().split("\n");
assert.ok(!tracked.some(file => file.includes("/dist/")), "The plugin's server comes from npm, not committed build output");
console.log(`Verified the Git plugin: marketplace sim-stage, ${name}@${version} over bun x.`);

await import("./verify-gallery.mjs");
