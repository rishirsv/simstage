import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const requiredTools = ["open_sim_stage", "sim_stage_preferences", "sim_stage_status", "device_connect", "device_capture", "device_action", "device_settings", "device_disconnect", "device_stream", "device_stream_read", "device_stream_stop", "device_input", "simulator_get_state", "simulator_click"];

/** Exercise the delivered artifact from an unrelated directory, through stdio. */
export async function smokeArtifact({ name, version, command, args, cwd, additionalTools = [] }) {
  const client = new Client({ name: `${name}-verification`, version: "1" });
  const transport = new StdioClientTransport({ command, args, cwd, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", chunk => { stderr += chunk.toString(); });
  try {
    await client.connect(transport, { timeout: 15_000 });
    assert.deepEqual(client.getServerVersion(), { name: "sim-stage", version });
    const { tools } = await client.listTools();
    for (const required of [...requiredTools, ...additionalTools]) assert.ok(tools.some(tool => tool.name === required), `Missing required tool ${required}`);
    const opener = tools.find(tool => tool.name === "open_sim_stage");
    const settings = tools.find(tool => tool.name === "sim_stage_preferences");
    assert.deepEqual(opener._meta["openai/ui"].entrypoints.map(entry => entry.type).sort(), ["global", "thread"]);
    assert.deepEqual(settings._meta["openai/ui"].entrypoints.map(entry => entry.type), ["settings"]);
    const { resources } = await client.listResources();
    assert.ok(resources.some(resource => resource.uri === "ui://sim-stage/viewer"));
    const resource = await client.readResource({ uri: "ui://sim-stage/viewer" });
    const viewer = resource.contents.find(content => content.uri === "ui://sim-stage/viewer");
    assert.equal(viewer.mimeType, "text/html;profile=mcp-app");
    assert.match(viewer.text, /<main id="root"><\/main>/);
    const script = viewer.text.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
    const style = viewer.text.match(/<style>([\s\S]+?)<\/style>/)?.[1];
    assert.ok(script && style, "Viewer must contain executable and styled assets");
    assert.doesNotMatch(viewer.text, /<(?:script|link)\b[^>]*(?:src|href)=/i, "Viewer assets must be self-contained");
    assert.doesNotThrow(() => new Function(script), "Bundled browser entrypoint must parse");
  } catch (error) {
    throw new Error(`${name} packaged MCP failed: ${stderr}`, { cause: error });
  } finally {
    await client.close();
  }
}
