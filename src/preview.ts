import { createServer } from "node:http";
import { appHtml, callHubTool, type Hub } from "./mcp.js";
import type { PreviewRecord } from "./session-registry.js";

export async function startPreview(hub: Hub, assetRoot: URL, options: { port?: number; record?: Omit<PreviewRecord, "url"> } = {}) {
  const port = options.port ?? Number(process.env.SIM_STAGE_PREVIEW_PORT ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Preview port must be an integer between 0 and 65535.");
  let origin = "";
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) { response.writeHead(403).end("Open the preview at its 127.0.0.1 address."); return; }
    if (request.method === "GET" && request.url === "/api/instance" && options.record) {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ...options.record, url: origin })); return;
    }
    if (request.method === "GET" && request.url?.split("?")[0] === "/") {
      try { const html = await appHtml(assetRoot, true); response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html); }
      catch { response.writeHead(503).end("Build the viewer assets before starting a preview."); }
      return;
    }
    if (request.method === "POST" && request.url === "/api/tool") {
      if ((request.headers.origin && request.headers.origin !== origin) || !request.headers["content-type"]?.startsWith("application/json")) { response.writeHead(403).end("Only the local viewer can call device tools."); return; }
      try {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 65536) throw new Error("Tool request is too large."); }
        const input = JSON.parse(body) as { name?: unknown; arguments?: unknown };
        if (typeof input.name !== "string") throw new Error("Tool name is required.");
        const result = await callHubTool(hub, input.name, input.arguments ?? {});
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      } catch (error) { response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] })); }
      return;
    }
    response.writeHead(404).end("Not found");
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Preview did not bind a TCP port.");
  origin = `http://127.0.0.1:${address.port}`;
  console.error(`Sim Stage preview: ${origin}`);
  return server;
}
