// bun scripts/browser-benchmark.mjs [--device <benchmark UDID>] [--samples 12] [--server <bin/server.mjs>] [--out <report.json>]
// Uses the shipped viewer in HTTP preview and an SDK AppBridge host over real MCP.
import { chromium } from "playwright-core";
import { build } from "esbuild";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const options = Object.fromEntries(Array.from({ length: Math.floor(process.argv.slice(2).length / 2) }, (_, index) => process.argv.slice(2).slice(index * 2, index * 2 + 2)));
const samples = Number(options["--samples"] ?? 12);
const output = resolve(options["--out"] ?? "artifacts/architecture-review/journeys.json");
await mkdir(join(output, ".."), { recursive: true });
if (!Number.isInteger(samples) || samples < 1) throw new Error("--samples must be a positive integer.");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "sim-stage-journey-"));
const bundle = join(directory, "Scene.app");
const appId = "dev.simstage.benchmark";
const xcrun = (...args) => execFileSync("/usr/bin/xcrun", args, { encoding: "utf8", timeout: 180_000 });
let deviceId = options["--device"];
let browser, http, client;
const createdDevice = !deviceId;
let diagnostics = "";
try {
  const devices = JSON.parse(xcrun("simctl", "list", "devices", "--json"));
  if (deviceId && !Object.values(devices.devices).flat().some(device => device.udid === deviceId && device.name === "Sim Stage benchmark")) throw new Error("--device must identify a simulator named Sim Stage benchmark; the fixture replaces its foreground app.");
  if (!deviceId) {
    const runtime = JSON.parse(xcrun("simctl", "list", "runtimes", "--json")).runtimes.find(runtime => runtime.isAvailable && runtime.platform === "iOS");
    if (!runtime) throw new Error("Install an iOS simulator runtime before benchmarking.");
    const type = runtime.supportedDeviceTypes.find(type => type.productFamily === "iPhone");
    deviceId = xcrun("simctl", "create", "Sim Stage benchmark", type.identifier, runtime.identifier).trim();
    xcrun("simctl", "boot", deviceId);
    xcrun("simctl", "bootstatus", deviceId, "-b");
  }
  await mkdir(bundle);
  const sdk = xcrun("--sdk", "iphonesimulator", "--show-sdk-path").trim();
  xcrun("--sdk", "iphonesimulator", "clang", "-fobjc-arc", "-fmodules", "-target", "arm64-apple-ios27.0-simulator", "-isysroot", sdk, "-framework", "UIKit", "-framework", "Foundation", join(root, "test/fixtures/performance-scene.m"), "-o", join(bundle, "Scene"));
  await writeFile(join(bundle, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${appId}</string><key>CFBundleExecutable</key><string>Scene</string><key>CFBundleName</key><string>Sim Stage benchmark</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSRequiresIPhoneOS</key><true/><key>UILaunchScreen</key><dict/><key>UIApplicationSceneManifest</key><dict><key>UISceneConfigurations</key><dict><key>UIWindowSceneSessionRoleApplication</key><array><dict><key>UISceneConfigurationName</key><string>Default</string><key>UISceneDelegateClassName</key><string>BenchmarkSceneDelegate</string></dict></array></dict></dict></dict></plist>`);
  xcrun("simctl", "install", deviceId, bundle);
  xcrun("simctl", "launch", "--terminate-running-process", deviceId, appId);

  client = new Client({ name: "sim-stage-browser-benchmark", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(options["--server"] ?? join(root, "packages/sim-stage-mcp/bin/server.mjs"))], stderr: "pipe" });
  transport.stderr?.on("data", chunk => { diagnostics += chunk.toString(); });
  await client.connect(transport, { timeout: 60_000 });
  const resource = await client.readResource({ uri: "ui://sim-stage/viewer" });
  const viewer = resource.contents[0].text;
  const rpc = [];
  const callTool = async (input) => {
    const start = performance.now();
    const result = await client.callTool(input, undefined, { timeout: 120_000 });
    rpc.push({ name: input.name, durationMs: performance.now() - start, bytes: Buffer.byteLength(JSON.stringify(result)) });
    return result;
  };
  const hostScript = (await build({ stdin: { contents: `
    import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
    const iframe = document.querySelector("iframe");
    const bridge = new AppBridge(null, {name:"Sim Stage benchmark host",version:"1"}, {serverTools:{},logging:{}});
    bridge.oncalltool = async input => {
      const start=performance.now(); const response=await fetch("/api/tool",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
      const text=await response.text(); window.rpc.push({name:input.name,start,end:performance.now(),bytes:new TextEncoder().encode(text).length}); return JSON.parse(text);
    };
    bridge.oninitialized=async()=>{window.hostReady=true; const response=await fetch("/api/tool",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"sim_stage_status",arguments:{}})}); await bridge.sendToolResult(await response.json());};
    bridge.setHostContext({theme:"light",displayMode:"inline",availableDisplayModes:["inline"],containerDimensions:{width:1000,height:900}});
    await bridge.connect(new PostMessageTransport(iframe.contentWindow,iframe.contentWindow));
    iframe.src="/viewer?mode=mcp";
  `, resolveDir: root }, bundle: true, format: "esm", platform: "browser", write: false })).outputFiles[0].text;
  http = createServer(async (request, response) => {
    try {
      const port = http.address().port;
      if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403).end(); return; }
      if (request.url === "/host.js") { response.writeHead(200, { "Content-Type": "text/javascript" }).end(hostScript); return; }
      if (request.url === "/host") { response.writeHead(200, { "Content-Type": "text/html" }).end('<style>body{margin:0}iframe{width:100%;height:900px;border:0}</style><iframe></iframe><script>window.rpc=[]</script><script type="module" src="/host.js"></script>'); return; }
      if (request.url?.startsWith("/viewer")) {
        const preview = request.url.includes("preview");
        response.writeHead(200, { "Content-Type": "text/html" }).end(viewer.replace("<head>", `<head><script>window.__SIM_STAGE_PREVIEW__=${preview}</script>`)); return;
      }
      if (request.method === "POST" && request.url === "/api/tool") {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 65536) throw new Error("Request too large"); }
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(await callTool(JSON.parse(body)))); return;
      }
      response.writeHead(404).end();
    } catch (error) { response.writeHead(500).end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${http.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const reports = [];
  for (const mode of ["preview", "mcp"]) {
    console.error(`Benchmarking ${mode}`);
    xcrun("simctl", "launch", "--terminate-running-process", deviceId, appId);
    const context = await browser.newContext({ viewport: { width: 1100, height: 950 } });
    await context.addInitScript(() => {
      window.benchmark = { frames: [], inputAt: 0, decode: [], decodeStart: [], received: [], rpc: [] };
      const received = new Map();
      let interval = Math.round(1_000_000 / 60);
      window.benchmark.receive = (frames, elapsed = 0) => {
        for (const frame of frames ?? []) if (typeof frame.id === "number") {
          const receipt = { id: frame.id, capturedAtUnixMs: frame.capturedAtUnixMs, ageMs: frame.ageMs + elapsed, at: performance.now() };
          received.set(frame.id, receipt); window.benchmark.received.push(receipt);
        }
      };
      const OriginalSocket = window.WebSocket;
      window.WebSocket = class extends OriginalSocket {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", event => {
            if (!(event.data instanceof ArrayBuffer) || event.data.byteLength <= 16) return;
            const view = new DataView(event.data), capturedAtUnixMs = Number(view.getBigUint64(8));
            if (capturedAtUnixMs < 1_600_000_000_000 || capturedAtUnixMs > Date.now() + 60_000) return;
            window.benchmark.receive([{ id: Number(view.getBigUint64(0)), capturedAtUnixMs, ageMs: Math.max(0, Date.now() - capturedAtUnixMs) }]);
          });
        }
      };
      const OriginalDecoder = window.VideoDecoder;
      if (OriginalDecoder) window.VideoDecoder = class extends OriginalDecoder {
        constructor(init) {
          super({ ...init, output(frame) {
            const id = Math.round(frame.timestamp / interval);
            window.benchmark.decode.push({ timestamp: frame.timestamp, id: received.has(id) ? id : undefined, at: performance.now() });
            init.output(frame);
          } });
        }
        decode(chunk) { window.benchmark.decodeStart.push({ timestamp: chunk.timestamp, at: performance.now(), bytes: chunk.byteLength }); super.decode(chunk); }
      };
      for (const name of ["pointerdown", "pointerup"]) document.addEventListener(name, () => { window.benchmark.inputAt = performance.now(); }, true);
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        draw.apply(this, args);
        if (!(args[0] instanceof VideoFrame) || !this.canvas.width) return;
        let marker = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixel = this.getImageData(Math.floor(this.canvas.width * (.15 + bit * .1)), Math.floor(this.canvas.height * .18), 1, 1).data;
          if (pixel[0] + pixel[1] + pixel[2] > 384) marker |= 1 << bit;
        }
        const id = Math.round(args[0].timestamp / interval), metadata = received.get(id);
        const frame = { marker, timestamp: args[0].timestamp, id: metadata ? id : undefined, capturedAtUnixMs: metadata?.capturedAtUnixMs, ageMsAtDraw: metadata ? metadata.ageMs + performance.now() - metadata.at : undefined, drawnAt: performance.now(), presentedAt: null };
        window.benchmark.frames.push(frame);
        requestAnimationFrame(() => requestAnimationFrame(() => { frame.presentedAt = performance.now(); }));
      };
      const fetchOriginal = window.fetch;
      window.fetch = async (...args) => {
        const start = performance.now(); const response = await fetchOriginal(...args);
        if (String(args[0]).includes("/api/tool")) {
          const text = await response.clone().text();
          const end = performance.now(), result = JSON.parse(text);
          const stream = result.structuredContent ?? result._meta?.["sim-stage/data"];
          if (stream?.fps) interval = Math.round(1_000_000 / stream.fps);
          const target = window.benchmark.receive ? window : document.querySelector("iframe")?.contentWindow;
          // MCP RPC in the host frame hands its envelope to the viewer's clock.
          const receiver = result._meta?.["sim-stage/video"] ? (document.querySelector("iframe")?.contentWindow ?? target) : target;
          receiver?.benchmark?.receive(result._meta?.["sim-stage/video"]?.frames, end - start);
          window.benchmark.rpc.push({ name: JSON.parse(args[1].body).name, start, end, bytes: new TextEncoder().encode(text).length });
        }
        return response;
      };
    });
    const page = await context.newPage();
    page.on("console", message => { if (message.type() === "error") diagnostics += `\nConsole: ${message.text()}`; });
    page.on("pageerror", error => { diagnostics += `\nBrowser: ${error.message}`; });
    await page.goto(`${origin}/${mode === "preview" ? "viewer?mode=preview" : "host"}`);
    const frame = mode === "preview" ? page.mainFrame() : await (await page.waitForSelector("iframe")).contentFrame();
    const row = frame.getByRole("button").filter({ hasText: "Sim Stage benchmark" });
    await row.waitFor({ timeout: 60_000 });
    const started = await frame.evaluate(() => performance.now());
    await row.click();
    console.error(`${mode}: connect requested`);
    await frame.waitForFunction(() => window.benchmark.frames.some(frame => frame.presentedAt !== null), null, { timeout: 120_000 });
    console.error(`${mode}: video ready`);
    const first = await frame.evaluate(() => window.benchmark.frames.find(frame => frame.presentedAt !== null));
    const journeys = { connectToFirstPaintOpportunityMs: [first.presentedAt - started], pointerToVisibleChangeMs: [], scrollToSettledPaintOpportunityMs: [], agentActionToObservationMs: [] };
    const canvas = frame.locator("canvas");
    for (let sample = 0; sample < samples; sample++) {
      console.error(`${mode}: sample ${sample + 1}/${samples}`);
      const expected = ((await frame.evaluate(() => window.benchmark.frames.at(-1).marker)) + 1) & 255;
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + box.width * .5, box.y + box.height * .35);
      await frame.waitForFunction(marker => window.benchmark.frames.some(frame => frame.marker === marker && frame.presentedAt !== null && frame.drawnAt >= window.benchmark.inputAt), expected, { timeout: 15_000 });
      journeys.pointerToVisibleChangeMs.push(await frame.evaluate(marker => window.benchmark.frames.find(frame => frame.marker === marker && frame.presentedAt !== null && frame.drawnAt >= window.benchmark.inputAt).presentedAt - window.benchmark.inputAt, expected));
      const scrollMarker = await frame.evaluate(() => window.benchmark.frames.at(-1).marker);
      const downward = sample % 2 === 0;
      await page.mouse.move(box.x + box.width * .5, box.y + box.height * (downward ? .83 : .57));
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .5, box.y + box.height * (downward ? .57 : .83), { steps: 12 });
      await page.mouse.up();
      await frame.waitForFunction(marker => window.benchmark.frames.some(frame => frame.marker !== marker && frame.presentedAt !== null && frame.drawnAt >= window.benchmark.inputAt), scrollMarker, { timeout: 15_000 });
      // A changed marker must also remain unchanged for 150ms after gesture release.
      await frame.waitForFunction(() => {
        const frames = window.benchmark.frames; const last = frames.at(-1);
        const changed = frames.findLastIndex(frame => frame.marker !== last.marker);
        return last.presentedAt !== null && performance.now() - (frames[changed + 1] ?? frames[0]).drawnAt >= 150;
      }, null, { timeout: 15_000 });
      journeys.scrollToSettledPaintOpportunityMs.push(await frame.evaluate(() => {
        const frames = window.benchmark.frames, last = frames.at(-1);
        const changed = frames.findLastIndex(frame => frame.marker !== last.marker);
        return Math.max(0, (frames[changed + 1] ?? last).presentedAt - window.benchmark.inputAt);
      }));
      const status = await callTool({ name: "sim_stage_status", arguments: {} });
      const state = status._meta?.["sim-stage/data"] ?? status.structuredContent;
      const session = state.sessions.find(session => session.device.id === deviceId);
      const agentExpected = ((await frame.evaluate(() => window.benchmark.frames.at(-1).marker)) + 1) & 255;
      const agentFrameStart = await frame.evaluate(() => performance.now());
      const start = performance.now();
      const result = await callTool({ name: "device_action", arguments: { sessionId: session.id, action: { type: "tap", element: { identifier: "advance-marker" } }, screenshot: "never" } });
      if (result.isError) throw new Error(JSON.stringify(result));
      journeys.agentActionToObservationMs.push(performance.now() - start);
      // Drain the exact action result before the next pointer sample can begin.
      await frame.waitForFunction(({ marker, start }) => window.benchmark.frames.some(frame => frame.marker === marker && frame.drawnAt >= start && frame.presentedAt !== null), { marker: agentExpected, start: agentFrameStart }, { timeout: 15_000 });
    }
    const data = await frame.evaluate(() => window.benchmark);
    const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
    const summary = Object.fromEntries(Object.entries(journeys).map(([name, values]) => [name, { samples: values.length, p75: percentile(values, .75), p95: percentile(values, .95), values }]));
    reports.push({ mode: mode === "mcp" ? "reference-embedded-mcp-host" : "http-preview", summary, frames: data.frames, received: data.received, decodeStart: data.decodeStart, decode: data.decode, rpc: mode === "mcp" ? await page.evaluate(() => window.benchmark.rpc) : data.rpc, serverRpc: rpc.splice(0) });
    await page.screenshot({ path: output.replace(/\.json$/, "") + `-${mode}.png` });
    await context.close();
    const status = await callTool({ name: "sim_stage_status", arguments: {} });
    const state = status._meta?.["sim-stage/data"] ?? status.structuredContent;
    for (const session of state.sessions.filter(session => session.device.id === deviceId)) await callTool({ name: "device_disconnect", arguments: { sessionId: session.id } });
  }
  const report = { serverPath: resolve(options["--server"] ?? join(root, "packages/sim-stage-mcp/bin/server.mjs")), serverVersion: client.getServerVersion(), measuredAt: new Date().toISOString(), deviceId, browser: await browser.version(), runtime: JSON.parse(xcrun("simctl", "list", "devices", "--json")), clock: "Browser-local performance.now; paint opportunity after draw and two requestAnimationFrame callbacks. Native frame timestamps are separately reported, never subtracted from browser clock.", scope: "Real simulator, shipped viewer, reference SDK AppBridge MCP host and HTTP preview. This does not measure Codex host overhead or physical display scanout.", reports };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, summaries: reports.map(({ mode, summary }) => ({ mode, summary })) }, null, 2));
} catch (error) {
  throw new Error(`${error.message}\n${diagnostics}`, { cause: error });
} finally {
  await browser?.close();
  await client?.close();
  if (http) { http.closeAllConnections?.(); await new Promise(resolve => http.close(resolve)); }
  if (createdDevice && deviceId) { try { xcrun("simctl", "shutdown", deviceId); } finally { xcrun("simctl", "delete", deviceId); } }
  await rm(directory, { recursive: true, force: true });
}
