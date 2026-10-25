import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppleHub } from "./apple.js";
import { createHubServer } from "./mcp.js";
import { serverOptions } from "./cli.js";

const options = serverOptions(process.argv.slice(2));
let cleanup: (() => Promise<void>) | undefined;
const assetRoot = import.meta.url.endsWith("/src/server.ts") ? new URL("../packages/sim-stage-mcp/dist/", import.meta.url) : new URL("./", import.meta.url);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await cleanup?.(); }
  catch (error) { console.error("Device session cleanup failed:", error); }
  finally { process.exit(0); }
}
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
if (options.preview && options.workspacePath) {
  const { launchWorkspacePreview } = await import("./preview-launcher.js");
  const preview = await launchWorkspacePreview({ ...options, workspacePath: options.workspacePath }, assetRoot, {
    hub(registry) {
      const hub = new AppleHub({ registry });
      cleanup = () => hub.close();
      return hub;
    },
  });
  cleanup = () => preview.close();
  console.log(JSON.stringify({ ...preview.record, deviceId: options.deviceId, reused: preview.reused }));
} else if (options.preview) {
  const hub = new AppleHub();
  cleanup = () => hub.close();
  const { startPreview } = await import("./preview.js");
  const preview = await startPreview(hub, assetRoot, { port: options.port });
  cleanup = async () => { await hub.close(); preview.closeAllConnections(); await new Promise<void>(resolve => preview.close(() => resolve())); };
} else {
  const hub = new AppleHub();
  cleanup = () => hub.close();
  const server = createHubServer(hub, assetRoot);
  server.server.onclose = () => { void hub.close().catch(error => console.error("Device session cleanup failed:", error)); };
  await server.connect(new StdioServerTransport());
}
