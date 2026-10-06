import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(root + "package.json", "utf8"));
const name = "sim-stage-mcp";
const archive = `${root}release/${name}-${version}.tgz`;
const response = await fetch(`https://registry.npmjs.org/${name}/${version}`);
if (response.ok) {
  const existing = await response.json();
  const integrity = `sha512-${createHash("sha512").update(await readFile(archive)).digest("base64")}`;
  if (existing.dist.integrity !== integrity) throw new Error(`${name}@${version} already exists with different bytes. Bump the version.`);
  console.log(`${name}@${version} is already published with matching integrity.`);
} else {
  if (response.status !== 404) throw new Error(`Registry lookup failed: ${response.status} ${response.statusText}`);
  // Bun publishes the prebuilt archive; it currently has no provenance flag.
  const result = spawnSync(process.execPath, ["publish", archive, "--access", "public", "--tag", version.includes("-") ? "next" : "latest"], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
