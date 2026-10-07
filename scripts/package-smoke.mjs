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
    const serverInfo = client.getServerVersion();
    assert.equal(serverInfo.name, "sim-stage");
    assert.equal(serverInfo.version, version);
    assert.deepEqual(serverInfo.icons.map(icon => icon.theme), ["light", "dark"]);
    for (const icon of serverInfo.icons) {
      assert.equal(icon.mimeType, "image/svg+xml");
      assert.deepEqual(icon.sizes, ["any"]);
      assert.match(icon.src, /^data:image\/svg\+xml;base64,/);
      assert.match(Buffer.from(icon.src.split(",")[1], "base64").toString(), /<svg[^>]+viewBox="0 0 512 512"/);
    }
    const { tools } = await client.listTools();
    for (const tool of tools) {
      for (const hint of ["readOnlyHint", "destructiveHint", "openWorldHint"]) {
        assert.equal(typeof tool.annotations?.[hint], "boolean", `${tool.name} must declare ${hint}`);
      }
    }
    for (const required of [...requiredTools, ...additionalTools]) assert.ok(tools.some(tool => tool.name === required), `Missing required tool ${required}`);
    const opener = tools.find(tool => tool.name === "open_sim_stage");
    const settings = tools.find(tool => tool.name === "sim_stage_preferences");
    assert.deepEqual(opener.icons, serverInfo.icons, "Sidebar entrypoint must carry the bundled phone icons");
    assert.deepEqual(settings.icons, serverInfo.icons);
    assert.deepEqual(opener._meta["openai/ui"].entrypoints.map(entry => entry.type).sort(), ["global", "thread"]);
    assert.deepEqual(settings._meta["openai/ui"].entrypoints.map(entry => entry.type), ["settings"]);
    const { resources } = await client.listResources();
    assert.ok(resources.some(resource => resource.uri === "ui://sim-stage/viewer"));
    const resource = await client.readResource({ uri: "ui://sim-stage/viewer" });
    const viewer = resource.contents.find(content => content.uri === "ui://sim-stage/viewer");
    assert.equal(viewer.mimeType, "text/html;profile=mcp-app");
    assert.deepEqual(viewer._meta?.ui?.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
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
