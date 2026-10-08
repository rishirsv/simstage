import { stagePlugin } from "./distribution.mjs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = fileURLToPath(new URL("../release/", import.meta.url));
await mkdir(destination, { recursive: true });
// The submission ZIP runs its bundled server.
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const archive = `${destination}sim-stage-${version}.zip`;
const stage = await mkdtemp(join(tmpdir(), "sim-stage-zip-"));
try {
  const files = ["plugin.json", ".codex-plugin", "dist", "assets", "skills", "LICENSE", "NOTICE"];
  await stagePlugin(root, stage);
  await rm(archive, { force: true });
  const zip = spawnSync("zip", ["-q", "-r", archive, ...files, ".mcp.json", "mcp.json"], { cwd: stage, stdio: "inherit" });
  if (zip.status !== 0) process.exit(zip.status || 1);
} finally {
  await rm(stage, { recursive: true, force: true });
}
