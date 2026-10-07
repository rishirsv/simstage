import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The Git launcher and bundled launcher share both external manifest formats. */
export async function writeLaunchManifests(destination, server) {
  const path = file => destination instanceof URL ? new URL(file, destination) : join(destination, file);
  await writeFile(path(".mcp.json"), JSON.stringify({ mcpServers: { "sim-stage": server } }, null, 2) + "\n");
  await writeFile(path("mcp.json"), JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { "sim-stage": { type: "stdio", ...server } },
  }, null, 2) + "\n");
}

/** A distribution stage owns its copy; the checkout has one canonical runtime. */
export async function stagePlugin(root, destination) {
  await mkdir(destination, { recursive: true });
  for (const file of ["plugin.json", ".codex-plugin", "assets", "skills"]) {
    await cp(join(root, "plugins/sim-stage", file), join(destination, file), { recursive: true });
  }
  await cp(join(root, "packages/sim-stage-mcp/dist"), join(destination, "dist"), { recursive: true });
  for (const file of ["LICENSE", "NOTICE"]) await cp(join(root, file), join(destination, file));
  await writeLaunchManifests(destination, { command: "bun", args: ["./dist/server.js"], cwd: "./" });
}
