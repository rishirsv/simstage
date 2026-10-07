import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { smokeArtifact } from "./package-smoke.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const archive = join(root, "release", `sim-stage-${version}.zip`);
assert.ok((await stat(archive)).size <= 100_000_000, "ZIP exceeds the portal size limit");
const directory = await mkdtemp(join(tmpdir(), "apple-gallery-"));
try {
  execFileSync("unzip", ["-q", archive, "-d", directory]);
  const manifest = JSON.parse(await readFile(join(directory, "plugin.json"), "utf8"));
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(manifest.name, "sim-stage");
  assert.equal(manifest.version, version);
  const extension = manifest.extensions["com.openai"];
  const listing = extension.interface;
  assert.ok(listing.displayName.length <= 30 && listing.shortDescription.length <= 30);
  assert.ok(listing.longDescription.length <= 4000 && listing.developerName.length <= 80);
  assert.equal(manifest.apps ?? null, null);
  assert.equal(extension.apps ?? null, null);
  await assert.rejects(stat(join(directory, ".app.json")), /ENOENT/);
  assert.equal(extension.review.test_cases.positive.length, 5);
  assert.equal(extension.review.test_cases.negative.length, 3);
  assert.ok(extension.publication.release_notes.length > 0);
  assert.deepEqual(extension.publication.countries, []);
  assert.equal(extension.review.commerce, false);
  for (const file of ["LICENSE", "NOTICE"]) assert.deepEqual(await readFile(join(directory, file)), await readFile(join(root, file)));
  assert.equal(listing.defaultPrompt.length, 3);
  const prompts = listing.defaultPrompt.map(prompt => prompt.trim().replace(/\s+/g, " "));
  assert.equal(new Set(prompts).size, prompts.length);
  for (const prompt of listing.defaultPrompt) assert.ok(prompt.trim() && prompt.length <= 128 && !/[\r\n@]/.test(prompt));
  for (const key of ["logo", "logoDark", "composerIcon", "composerIconDark"]) {
    const path = resolve(directory, listing[key]);
    assert.ok(path.startsWith(directory + sep), `${key} must be inside the ZIP`);
    const bytes = await readFile(path);
    assert.deepEqual(bytes, await readFile(join(root, "plugins", "sim-stage", listing[key])), `${key} must match the maintained export`);
    assert.ok(bytes.length <= 5 * 1024 * 1024, `${key} exceeds 5 MiB`);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${key} must be an actual PNG`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.equal(width, height, `${key} must be square`);
    assert.ok(width >= (key.startsWith("logo") ? 256 : 48) && width <= 4096, `${key} dimensions are out of range`);
    if (key.startsWith("composer")) assert.equal(bytes[25], 6, `${key} must preserve RGBA transparency`);
  }
  const overlay = JSON.parse(await readFile(join(directory, ".codex-plugin", "plugin.json"), "utf8"));
  assert.deepEqual(overlay.interface, listing);
  assert.equal(overlay.skills, "./skills/");
  assert.deepEqual(await readFile(join(directory, "skills", "drive-simulator", "SKILL.md")), await readFile(join(root, "plugins", "sim-stage", "skills", "drive-simulator", "SKILL.md")), "The ZIP must ship the current agent skill");
  assert.equal(overlay.apps ?? null, null);
  assert.equal(overlay.extensions["com.openai"].apps ?? null, null);
  assert.deepEqual(overlay.extensions["com.openai"].review, extension.review);
  const mcp = JSON.parse(await readFile(join(directory, "mcp.json"), "utf8"));
  assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
  assert.equal(Object.keys(mcp.mcpServers).length, 1);
  const configuration = mcp.mcpServers["sim-stage"];
  assert.equal(configuration.type, "stdio");
  assert.equal(configuration.command, "bun");
  assert.equal(configuration.cwd, "./");
  assert.deepEqual(configuration.args, ["./dist/server.js"]);
  assert.deepEqual(JSON.parse(await readFile(join(directory, ".mcp.json"), "utf8")).mcpServers["sim-stage"], { command: "bun", args: ["./dist/server.js"], cwd: "./" }, "The ZIP's Codex overlay also runs its bundled server");
  await smokeArtifact({ name: "sim-stage ZIP", version, command: process.execPath, args: configuration.args.map(arg => resolve(directory, arg)), cwd: resolve(directory, configuration.cwd), additionalTools: extension.review.test_cases.positive.flatMap(testCase => testCase.tools_triggered.split(", ")) });
  for (const file of ["server.js", "app.js", "app.css", "simulator-stream", "THIRD_PARTY_NOTICES.txt", "LICENSE", "NOTICE"]) {
    assert.deepEqual(await readFile(join(directory, "dist", file)), await readFile(join(root, "packages", "sim-stage-mcp", "dist", file)));
  }
  execFileSync("codesign", ["--verify", "--strict", join(directory, "dist", "simulator-stream")]);
  console.log(`Verified sim-stage-${version}.zip: portable manifest, review metadata, isolated MCP, viewer and signed native helper. Local MCP partner approval remains required.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
