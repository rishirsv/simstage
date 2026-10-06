import assert from "node:assert/strict";
import test from "node:test";
import { App } from "@modelcontextprotocol/ext-apps";
import type { CaptureState, Session } from "../src/shared.js";

class ViewerNode extends EventTarget {
  hidden = true;
  width = 0;
  height = 0;
  src = "";
  alt = "";
  clientWidth = 0;
  clientHeight = 0;
  parentElement: ViewerNode | null = null;
  rect = { left: 0, top: 0, width: 0, height: 0 };
  captured = new Set<number>();
  style = { left: "", top: "", colorScheme: "", setProperty() {} };
  setAttribute() {}
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  getContext() { return { drawImage() {} }; }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
}

class ViewerDecoder {
  state: CodecState = "unconfigured";
  decodeQueueSize = 0;
  chunks: Array<{ init: EncodedVideoChunkInit }> = [];
  constructor(readonly callbacks: VideoDecoderInit) {}
  configure() { this.state = "configured"; }
  reset() { this.state = "unconfigured"; }
  decode(chunk: { init: EncodedVideoChunkInit }) { this.chunks.push(chunk); }
  close() { this.state = "closed"; }
}

class ViewerSocket {
  binaryType = "";
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closes = 0;
  close() { this.closes++; }
  sendFrame(format: string) {
    const data = format === "hevc"
      ? [0, 0, 1, 0x40, 1, 0xaa, 0, 0, 1, 0x42, 1, 1, 1, 0x60, 0, 0, 3, 0, 0xb0, 0, 0, 3, 0, 0, 3, 0, 0x96, 0, 0, 1, 0x44, 1, 0xbb, 0, 0, 1, 0x26, 1, 0xcc]
      : [0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f, 0xaa, 0, 0, 1, 0x68, 0xbb, 0, 0, 0, 1, 0x65, 0xcc];
    const bytes = new Uint8Array(16 + data.length);
    const header = new DataView(bytes.buffer);
    header.setBigUint64(0, 1n);
    header.setBigUint64(8, BigInt(Date.now()));
    bytes.set(data, 16);
    this.onmessage!({ data: bytes.buffer } as MessageEvent);
  }
}

const current: Session = {
  id: "session",
  device: { id: "simulator", name: "Test Simulator", kind: "simulator", platform: "iOS", runtime: "iOS 27", state: "Booted", available: true },
  accessibilityEnabled: false,
};

function captured(data: string) {
  const capture: CaptureState = {
    session: current,
    capturedAt: "2026-09-30T12:00:00.000Z",
    coordinateSpace: { width: 440, height: 956 },
    screenshot: { mimeType: "image/png", width: 440, height: 956 },
  };
  return { content: [{ type: "image", data, mimeType: "image/png" }], structuredContent: capture };
}

for (const mode of ["websocket", "relay-preview", "relay-host", "hevc-capture-failure", "hevc-decoder-failure", "hevc-preflight"] as const) test(`${mode} viewer ignores obsolete starts, exposes fresh stills on failure, and resumes video after Retry`, async t => {
  const hevc = mode.startsWith("hevc");
  const relay = mode === "relay-preview" || mode === "relay-host";
  const host = mode === "relay-host";
  const documentTarget = new EventTarget();
  const document = Object.assign(documentTarget, { hidden: false, documentElement: new ViewerNode() });
  const window = Object.assign(new EventTarget(), { __SIM_STAGE_PREVIEW__: !host, location: { search: relay ? "?transport=mcp" : "" } });
  const screen = new ViewerNode();
  const canvas = new ViewerNode();
  const frame = new ViewerNode();
  const root = new ViewerNode();
  const gesture = new ViewerNode();
  const sockets: ViewerSocket[] = [];
  const decoders: ViewerDecoder[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const streams: Array<(result: unknown) => void> = [];
  const requestedCodecs: string[] = [];
  const probes: Array<(result: VideoDecoderSupport) => void> = [];
  const reads: Array<{ streamId: string; resolve: (result: unknown) => void }> = [];
  const served = new Map<string, number>();
  let currentStream = "";
  const stops: string[] = [];
  const attachments: unknown[] = [];
  const calls: string[] = [];
  let timerId = 0;
  let frameNumber = 0;
  let streamNumber = 0;
  class BrowserSocket extends ViewerSocket {
    constructor() { super(); sockets.push(this); }
  }
  class BrowserDecoder extends ViewerDecoder {
    static async isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
      if (mode === "hevc-preflight") return new Promise(resolve => { probes.push(resolve); });
      return { supported: hevc, config };
    }
    constructor(callbacks: VideoDecoderInit) { super(callbacks); decoders.push(this); }
  }
  const tool = async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (name === "sim_stage_status") return { content: [], structuredContent: { devices: [current.device], sessions: [current], warnings: [] } };
    if (name === "device_stream") { requestedCodecs.push(args.codec as string); return new Promise(resolve => { streams.push(resolve); }); }
    if (name === "device_stream_read") return new Promise(resolve => { reads.push({ streamId: args.streamId as string, resolve }); });
    if (name === "device_stream_stop") { stops.push(args.streamId as string); return { content: [], structuredContent: { stopped: true } }; }
    if (name === "device_capture") return captured("initial-still");
    if (name === "device_action") return captured("action-still");
    if (name === "device_frame") return captured(`fallback-${++frameNumber}`);
    throw new Error(`Unexpected tool ${name}`);
  };
  if (host) {
    t.mock.method(App.prototype, "connect", async () => {});
    t.mock.method(App.prototype, "setupSizeChangedNotifications", () => () => {});
    t.mock.method(App.prototype, "callServerTool", async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => tool(name, args));
    t.mock.method(App.prototype, "getHostCapabilities", () => ({ updateModelContext: { image: {} } }));
    t.mock.method(App.prototype, "getHostContext", () => ({ theme: "light" }));
    t.mock.method(App.prototype, "updateModelContext", async (payload: unknown) => { attachments.push(payload); return {}; });
  }
  const replacements = {
    document, window,
    requestAnimationFrame: (callback: FrameRequestCallback) => setImmediate(() => callback(performance.now())),
    cancelAnimationFrame: (id: ReturnType<typeof setImmediate>) => clearImmediate(id),
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ maxHeight: "none" }),
    IntersectionObserver: class { observe() {} disconnect() {} },
    VideoDecoder: BrowserDecoder, WebSocket: BrowserSocket,
    EncodedVideoChunk: class { constructor(readonly init: EncodedVideoChunkInit) {} },
    Image: class { src = ""; async decode() {} },
    setTimeout: (callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    fetch: async (_url: string, init: RequestInit) => {
      const { name, arguments: args } = JSON.parse(init.body as string) as { name: string; arguments: Record<string, unknown> };
      const result = await tool(name, args);
      return { ok: true, async json() { return result; } };
    },
  };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const flush = async () => { await new Promise<void>(resolve => setImmediate(resolve)); };
  const openStream = async () => {
    if (mode === "hevc-preflight") { probes.shift()?.({ supported: false }); }
    await flush();
    const resolve = streams.shift();
    assert.ok(resolve, "a stream descriptor was requested");
    const streamId = (++streamNumber).toString(16).padStart(48, "0");
    const format = requestedCodecs.at(-1);
    resolve({ content: [], structuredContent: { sessionId: current.id, streamId, url: "ws://127.0.0.1:1234/video/token", format, codec: format === "hevc" ? "hev1.1.6.L150.B0" : "avc1.42E01F", fps: 60 } });
    currentStream = streamId;
    await flush();
    return streamId;
  };
  // The server answers pipelined reads in order and numbers each batch it serves.
  const takeRead = () => {
    const index = reads.findIndex(read => read.streamId === currentStream);
    assert.ok(index >= 0, "the current relay has a read awaiting its next batch");
    return reads.splice(index, 1)[0]!;
  };
  const deliverBatch = async (sessionId = current.id) => {
    const read = takeRead();
    const sequence = served.get(read.streamId) ?? 0;
    served.set(read.streamId, sequence + 1);
    read.resolve({ content: [{ type: "text", text: "Simulator video batch." }], _meta: { "sim-stage/video": { sessionId, streamId: read.streamId, sequence, active: true, frames: [{ id: sequence + 1, capturedAtUnixMs: Date.now(), ageMs: 0, data: Buffer.from([0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f, 0xaa, 0, 0, 1, 0x68, 0xbb, 0, 0, 0, 1, 0x65, 0xcc]).toString("base64") }] } } });
    await flush();
  };
  const failStream = async () => {
    if (relay) {
      const read = takeRead();
      read.resolve({ isError: true, content: [{ type: "text", text: "Simulator display unavailable." }] });
    } else sockets.at(-1)!.onerror!();
    await flush();
  };
  const fireTimer = (delay: number) => {
    const timer = [...timers.entries()].find(([, value]) => value.delay === delay);
    assert.ok(timer, `a ${delay}ms timer was scheduled`);
    timers.delete(timer[0]);
    timer[1].callback();
  };
  try {
    const module = new URL("../src/viewer-controller.ts", import.meta.url);
    const viewer = await import(module.href) as typeof import("../src/viewer-controller.js");
    await viewer.initializeViewer({ root: root as unknown as HTMLElement, screen: screen as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, frame: frame as unknown as HTMLElement, gesture: gesture as unknown as HTMLElement }).ready;
    if (host) await viewer.scanDevices();
    if (mode === "hevc-preflight") {
      assert.equal(streams.length, 0);
      document.hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      probes.shift()!({ supported: true });
      await flush();
      assert.equal(requestedCodecs.length, 0, "a late capability result cannot create a hidden viewer's stream");
      document.hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      probes.shift()!({ supported: false });
      await flush();
    }
    assert.equal(viewer.getSnapshot().noticeError, false);
    assert.equal(streams.length, 1);
    assert.equal(screen.src, "data:image/png;base64,initial-still");

    // A descriptor that arrives after the viewer hides must never open a socket.
    document.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    const obsoleteId = await openStream();
    assert.equal(sockets.length, 0);
    assert.ok(stops.includes(obsoleteId), "obsolete descriptors are released by their own stream ID");
    document.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await openStream();
    assert.equal(sockets.length, relay ? 0 : 1);
    if (hevc && mode !== "hevc-preflight") {
      assert.equal(requestedCodecs.at(-1), "hevc");
      if (mode === "hevc-decoder-failure") decoders.at(-1)!.callbacks.error(new DOMException("HEVC decoding unavailable."));
      else await failStream();
      await flush();
      assert.match(viewer.getSnapshot().videoMessage, /Switching to H.264/);
      assert.equal(canvas.hidden, true);
      assert.equal(frame.hidden, false);
      fireTimer(0);
      await openStream();
      assert.equal(requestedCodecs.at(-1), "h264");
    } else assert.ok(requestedCodecs.every(codec => codec === "h264"));
    if (relay) {
      await deliverBatch();
      assert.equal(decoders.at(-1)!.chunks.length, 1, "the player consumes H.264 from tool metadata");
    }
    if (!relay) sockets.at(-1)!.sendFrame(requestedCodecs.at(-1)!);
    decoders.at(-1)!.callbacks.output({ timestamp: decoders.at(-1)!.chunks.at(-1)!.init.timestamp, displayWidth: 440, displayHeight: 956, close() {} } as unknown as VideoFrame);
    await flush();
    assert.equal(viewer.getSnapshot().videoReady, true);
    assert.equal(canvas.hidden, false);

    if (host) {
      assert.equal(viewer.getSnapshot().contextEnabled, true);
      await viewer.attachScreen();
      assert.equal(attachments.length, 1, "standard model context remains supported without experimental extensions");
    }
    if (relay) await deliverBatch("another-session");
    else await failStream();
    assert.equal(viewer.getSnapshot().videoReady, false);
    assert.equal(canvas.hidden, true);
    assert.equal(frame.hidden, false);
    await viewer.performAction({ type: "button", button: "home" });
    assert.equal(screen.src, "data:image/png;base64,action-still");
    assert.equal(canvas.hidden, true);

    // Retry delays grow, then still-frame polling takes over after four failures.
    for (const delay of [500, 1000, 2000]) {
      fireTimer(delay);
      await openStream();
      await failStream();
    }
    assert.equal(viewer.getSnapshot().videoError, true);
    fireTimer(60);
    await flush();
    assert.ok(calls.includes("device_frame"));
    assert.equal(screen.src, "data:image/png;base64,fallback-1");
    assert.equal(canvas.hidden, true);

    viewer.setLive(false);
    assert.equal(timers.size, 0, "paused fallback does not poll or reconnect");
    viewer.setLive(true);
    await openStream();
    if (relay) await deliverBatch();
    if (!relay) sockets.at(-1)!.sendFrame(requestedCodecs.at(-1)!);
    decoders.at(-1)!.callbacks.output({ timestamp: decoders.at(-1)!.chunks.at(-1)!.init.timestamp, displayWidth: 440, displayHeight: 956, close() {} } as unknown as VideoFrame);
    await flush();
    assert.equal(viewer.getSnapshot().videoReady, true);
    assert.equal(canvas.hidden, false);
    assert.equal(viewer.getSnapshot().videoError, false);

    viewer.retryVideo();
    assert.equal(canvas.hidden, true);
    if (relay) {
      const oldDecoder = decoders.at(-1)!;
      const chunks = oldDecoder.chunks.length;
      await deliverBatch();
      assert.equal(oldDecoder.chunks.length, chunks, "a stopped relay cannot render a late batch");
    }
    await openStream();
    if (hevc && mode !== "hevc-preflight") assert.equal(requestedCodecs.at(-1), "hevc", "explicit Retry permits a fresh HEVC attempt");
    if (relay) await deliverBatch();
    if (!relay) sockets.at(-1)!.sendFrame(requestedCodecs.at(-1)!);
    decoders.at(-1)!.callbacks.output({ timestamp: decoders.at(-1)!.chunks.at(-1)!.init.timestamp, displayWidth: 440, displayHeight: 956, close() {} } as unknown as VideoFrame);
    await flush();
    assert.equal(viewer.getSnapshot().videoReady, true);
    window.dispatchEvent(new Event("pagehide"));
    assert.equal(viewer.getSnapshot().ended, true);
    assert.equal(timers.size, 0);
    assert.ok(sockets.every(socket => socket.closes === 1));
    assert.ok(decoders.every(decoder => decoder.state === "closed"));
    if (relay) assert.equal(stops.length, streamNumber, "every relay is stopped exactly once");
  } finally {
    window.dispatchEvent(new Event("pagehide"));
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
});

test("live video keeps one read pending and streams touches and Home without Xcode", async () => {
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: new ViewerNode() });
  const window = Object.assign(new EventTarget(), { __SIM_STAGE_PREVIEW__: true, location: { search: "?transport=mcp" }, devicePixelRatio: 2 });
  const [screen, canvas, frame, root, gesture, stage] = Array.from({ length: 6 }, () => new ViewerNode());
  Object.assign(stage, { clientWidth: 400, clientHeight: 780 });
  frame.parentElement = stage;
  canvas.rect = { left: 100, top: 50, width: 200, height: 400 };
  frame.rect = { left: 100, top: 50, width: 200, height: 400 };
  const decoders: ViewerDecoder[] = [];
  const reads: Array<{ resolve: (result: unknown) => void }> = [];
  const inputs: Array<{ events: unknown[]; resolve: (result: unknown) => void }> = [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const tool = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "sim_stage_status") return { content: [], structuredContent: { devices: [current.device], sessions: [current], warnings: [] } };
    if (name === "device_capture") return captured("still");
    if (name === "device_stream") return { content: [], structuredContent: { sessionId: current.id, streamId: "1".padStart(48, "0"), url: "ws://blocked", format: "h264", codec: "avc1.42E01F", fps: 60 } };
    if (name === "device_stream_read") return new Promise(resolve => { reads.push({ resolve }); });
    if (name === "device_input") return new Promise(resolve => { inputs.push({ events: args.events as unknown[], resolve }); });
    if (name === "device_action") return captured("action-still");
    if (name === "device_stream_stop") return { content: [], structuredContent: { stopped: true } };
    if (name === "device_connect") return { isError: true, content: [{ type: "text", text: "Other Simulator is unavailable." }] };
    throw new Error(`Unexpected tool ${name}`);
  };
  const batch = (sequence: number, unit: number[], extra: Record<string, unknown> = {}) => ({ content: [], _meta: { "sim-stage/video": { sessionId: current.id, streamId: "1".padStart(48, "0"), sequence, active: true, frames: [{ id: sequence + 1, capturedAtUnixMs: Date.now(), ageMs: 0, data: Buffer.from(unit).toString("base64") }], ...extra } } });
  const replacements = {
    document, window,
    requestAnimationFrame: (callback: FrameRequestCallback) => setImmediate(() => callback(performance.now())),
    cancelAnimationFrame: (id: ReturnType<typeof setImmediate>) => clearImmediate(id),
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ maxHeight: "498px" }),
    IntersectionObserver: class { observe() {} disconnect() {} },
    VideoDecoder: class extends ViewerDecoder { static async isConfigSupported() { return { supported: false }; } constructor(callbacks: VideoDecoderInit) { super(callbacks); decoders.push(this); } },
    EncodedVideoChunk: class { constructor(readonly init: EncodedVideoChunkInit) {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    fetch: async (_url: string, init: RequestInit) => {
      const { name, arguments: args } = JSON.parse(init.body as string) as { name: string; arguments: Record<string, unknown> };
      const result = await tool(name, args);
      return { ok: true, async json() { return result; } };
    },
  };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const flush = async () => { for (let index = 0; index < 4; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
  const pointer = (type: string, clientX: number, clientY: number, timeStamp: number) => {
    const event = Object.assign(new Event(type), { button: 0, pointerId: 7, clientX, clientY });
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
    frame.dispatchEvent(event);
  };
  try {
    const module = new URL("../src/viewer-controller.ts", import.meta.url);
    const viewer = await import(module.href) as typeof import("../src/viewer-controller.js");
    await viewer.initializeViewer({ root: root as unknown as HTMLElement, screen: screen as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, frame: frame as unknown as HTMLElement, gesture: gesture as unknown as HTMLElement }).ready;
    await flush();
    assert.equal(calls.find(call => call.name === "device_stream")!.args.maxDimension, 1024, "video is sized to the frame's device pixels");
    assert.equal(reads.length, 1, "one read is pending, leaving host request capacity for input");
    reads[0]!.resolve(batch(0, [0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f, 0xaa, 0, 0, 1, 0x68, 0xbb, 0, 0, 0, 1, 0x65, 0xcc]));
    await flush();
    assert.equal(reads.length, 2, "the next read starts once a batch arrives");
    reads[1]!.resolve(batch(1, [0, 0, 1, 0x41, 0xcc]));
    await flush();
    assert.deepEqual(decoders[0]!.chunks.map(chunk => chunk.init.type), ["key", "delta"]);
    decoders[0]!.callbacks.output({ timestamp: decoders[0]!.chunks.at(-1)!.init.timestamp, displayWidth: 402, displayHeight: 874, close() {} } as unknown as VideoFrame);
    await flush();
    assert.equal(viewer.getSnapshot().liveInput, true);

    pointer("pointerdown", 150, 150, 1000);
    await flush();
    assert.deepEqual(inputs.map(input => input.events), [[{ type: "down", x: 0.25, y: 0.25, dt: 0 }]]);
    pointer("pointermove", 150, 170, 1016);
    pointer("pointermove", 150, 190, 1033);
    await flush();
    assert.equal(inputs.length, 1, "moves wait while a batch is in flight");
    inputs[0]!.resolve({ content: [], structuredContent: { delivered: 1 } });
    await flush();
    assert.deepEqual(inputs[1]!.events, [{ type: "move", x: 0.25, y: 0.3, dt: 16 }, { type: "move", x: 0.25, y: 0.35, dt: 17 }]);
    pointer("pointerup", 150, 190, 1050);
    inputs[1]!.resolve({ content: [], structuredContent: { delivered: 2 } });
    await flush();
    assert.deepEqual(inputs[2]!.events, [{ type: "up", x: 0.25, y: 0.35, dt: 17 }]);
    inputs[2]!.resolve({ content: [], structuredContent: { delivered: 1 } });
    await viewer.performAction({ type: "button", button: "home" });
    await flush();
    assert.equal(inputs[3]!.events.length, 1);
    assert.equal((inputs[3]!.events[0] as { type: string }).type, "home");
    assert.equal(calls.some(call => call.name === "device_action"), false, "live input never waits on Xcode");

    // A failed live delivery falls back to Xcode input for the next gesture.
    inputs[3]!.resolve({ isError: true, content: [{ type: "text", text: "Live input is unavailable: SimulatorKit is missing." }] });
    await flush();
    assert.equal(viewer.getSnapshot().liveInput, false);
    assert.match(viewer.getSnapshot().notice, /SimulatorKit is missing\. Using Xcode input instead/);
    pointer("pointerdown", 150, 150, 2000);
    pointer("pointerup", 150, 150, 2050);
    await flush();
    assert.equal(inputs.length, 4);
    assert.deepEqual(calls.find(call => call.name === "device_action")!.args.action, { type: "tap", x: 110, y: 239 });

    // A device the agent connected before the viewer opened is not followed; a later one is.
    reads[2]!.resolve(batch(2, [0, 0, 1, 0x41, 0xcc], { focus: { deviceId: "stale", deviceName: "Stale Simulator", at: "2000-01-01T00:00:00.000Z" } }));
    await flush();
    assert.equal(calls.some(call => call.name === "device_connect"), false);
    reads[3]!.resolve(batch(3, [0, 0, 1, 0x41, 0xcc], { focus: { deviceId: "other", deviceName: "Other Simulator", at: new Date(Date.now() + 1000).toISOString() } }));
    await flush();
    assert.deepEqual(calls.filter(call => call.name === "device_connect").map(call => call.args), [{ deviceId: "other" }]);
    assert.match(viewer.getSnapshot().notice, /Other Simulator is unavailable/);

    // A skipped batch would corrupt the decoder's reference chain, so video reconnects instead.
    reads[4]!.resolve(batch(5, [0, 0, 1, 0x41, 0xcc]));
    await flush();
    assert.equal(viewer.getSnapshot().videoReady, false);
    assert.match(viewer.getSnapshot().videoMessage, /out of order/);
  } finally {
    window.dispatchEvent(new Event("pagehide"));
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
});

test("surface attachments dispose listeners and ignore late observations and actions after remount", async () => {
  class TrackedTarget extends EventTarget {
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
      if (callback) { const listeners = this.listeners.get(type) ?? new Set(); listeners.add(callback); this.listeners.set(type, listeners); }
      super.addEventListener(type, callback, options);
    }
    override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
      if (callback) this.listeners.get(type)?.delete(callback);
      super.removeEventListener(type, callback, options);
    }
  }
  const document = Object.assign(new TrackedTarget(), { hidden: false, documentElement: new ViewerNode() });
  const window = Object.assign(new TrackedTarget(), { __SIM_STAGE_PREVIEW__: true, location: { search: "" } });
  const nodes = () => {
    const [root, screen, canvas, frame, gesture] = Array.from({ length: 5 }, () => new ViewerNode());
    return { root: root as unknown as HTMLElement, screen: screen as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, frame: frame as unknown as HTMLElement, gesture: gesture as unknown as HTMLElement };
  };
  let existing = true;
  let lateCapture: ((result: unknown) => void) | undefined;
  let lateAction: ((result: unknown) => void) | undefined;
  let settings: Record<string, unknown> | undefined;
  const calls: string[] = [];
  let disconnects = 0;
  const replacements = {
    document, window,
    matchMedia: () => ({ matches: false }),
    IntersectionObserver: class { observe() {} disconnect() { disconnects++; } },
    setTimeout: () => 0, clearTimeout: () => {},
    fetch: async (_url: string, init: RequestInit) => {
      const { name, arguments: args } = JSON.parse(init.body as string);
      calls.push(name);
      let result: unknown;
      if (name === "sim_stage_status") result = { content: [], structuredContent: { devices: [current.device], sessions: existing ? [current] : [], warnings: [] } };
      else if (name === "device_capture") result = await new Promise(resolve => { lateCapture = resolve; });
      else if (name === "device_connect") result = { ...captured("connection-still"), structuredContent: { ...current, origin: "started", observation: captured("").structuredContent } };
      else if (name === "device_action") result = await new Promise(resolve => { lateAction = resolve; });
      else if (name === "device_settings") { settings = args.settings; result = { ...captured("settings-still"), structuredContent: { ...captured("").structuredContent, settings: { appearance: "dark" } } }; }
      else throw new Error(`Unexpected tool ${name}`);
      return { ok: true, async json() { return result; } };
    },
  };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const flush = async () => { for (let index = 0; index < 4; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
  const viewer = await import("../src/viewer-controller.js");
  let mounted: ReturnType<typeof viewer.initializeViewer> | undefined;
  try {
    const oldNodes = nodes();
    const old = viewer.initializeViewer(oldNodes);
    viewer.setLive(false);
    await flush();
    assert.ok(lateCapture);
    assert.equal(window.listeners.get("pagehide")?.size, 1);
    old.dispose();
    assert.equal(window.listeners.get("pagehide")?.size, 0);
    assert.equal(document.listeners.get("visibilitychange")?.size, 0);
    existing = false;
    const currentNodes = nodes();
    mounted = viewer.initializeViewer(currentNodes);
    viewer.setLive(false);
    await mounted.ready;
    lateCapture!(captured("obsolete-still"));
    await old.ready;
    await flush();
    assert.equal(viewer.getSnapshot().session, undefined);
    assert.equal(currentNodes.screen.src, "");
    assert.equal(viewer.getSnapshot().busy, false);
    assert.equal(window.listeners.get("pagehide")?.size, 1);
    await viewer.connectDevice(current.device.id);
    assert.equal(currentNodes.screen.src, "data:image/png;base64,connection-still");
    assert.equal(calls.filter(name => name === "device_capture").length, 1, "connection uses its current observation without another capture");
    await viewer.changeSettings();
    assert.equal(settings, undefined, "explicit settings refresh omits mutation settings");
    assert.equal(viewer.getSnapshot().settings.appearance, "dark");
    const action = viewer.performAction({ type: "button", button: "lock" });
    await flush();
    assert.ok(lateAction);
    mounted.dispose();
    const lastNodes = nodes();
    mounted = viewer.initializeViewer(lastNodes);
    viewer.setLive(false);
    await mounted.ready;
    lateAction!(captured("obsolete-action"));
    await action;
    assert.equal(lastNodes.screen.src, "");
    assert.equal(viewer.getSnapshot().busy, false);
    old.dispose();
    assert.equal(window.listeners.get("pagehide")?.size, 1, "an old disposer cannot end the current attachment");
    mounted.dispose();
    assert.equal(disconnects, 3);
    assert.equal(window.listeners.get("pagehide")?.size, 0);
  } finally {
    mounted?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
});

test("switching devices resets still polling without letting an old completion clear the new request", async () => {
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: new ViewerNode() });
  const window = Object.assign(new EventTarget(), { __SIM_STAGE_PREVIEW__: true, location: { search: "" } });
  const [root, screen, canvas, frame, gesture] = Array.from({ length: 5 }, () => new ViewerNode());
  const physical = (id: string): Session => ({ ...current, id, device: { ...current.device, id, name: id, kind: "device" } });
  let selected = physical("first");
  const frames: Array<{ session: Session; resolve: (value: unknown) => void }> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const observation = (session: Session, data: string) => ({ ...captured(data), structuredContent: { ...captured("").structuredContent, session } });
  const replacements = {
    document, window, matchMedia: () => ({ matches: false }),
    IntersectionObserver: class { observe() {} disconnect() {} },
    Image: class { src = ""; async decode() {} },
    setTimeout: (callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    fetch: async (_url: string, init: RequestInit) => {
      const { name } = JSON.parse(init.body as string);
      const result = name === "sim_stage_status" ? { content: [], structuredContent: { devices: [selected.device], sessions: [selected], warnings: [] } }
        : name === "device_capture" ? observation(selected, `${selected.id}-still`)
          : name === "device_frame" ? await new Promise(resolve => frames.push({ session: selected, resolve }))
            : assert.fail(`Unexpected tool ${name}`);
      return { ok: true, async json() { return result; } };
    },
  };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const viewer = await import("../src/viewer-controller.js");
  const flush = async () => { for (let index = 0; index < 4; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
  const poll = () => {
    const scheduled = [...timers].find(([, timer]) => timer.delay === 60);
    assert.ok(scheduled, "the current device has a still poll scheduled");
    timers.delete(scheduled[0]);
    scheduled[1].callback();
  };
  let mounted: ReturnType<typeof viewer.initializeViewer> | undefined;
  try {
    mounted = viewer.initializeViewer({ root: root as unknown as HTMLElement, screen: screen as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, frame: frame as unknown as HTMLElement, gesture: gesture as unknown as HTMLElement });
    await mounted.ready;
    poll();
    await flush();
    assert.equal(frames.length, 1);
    selected = physical("second");
    await viewer.scanDevices();
    poll();
    await flush();
    assert.equal(frames.length, 2, "switching clears the old device's pending streaming flag");
    frames[0]!.resolve(observation(frames[0]!.session, "old-frame"));
    await flush();
    viewer.setLive(true);
    assert.equal([...timers.values()].some(timer => timer.delay === 60), false, "the old completion cannot clear the second device's in-flight request");
    assert.equal(screen.src, "data:image/png;base64,second-still");
    frames[1]!.resolve(observation(frames[1]!.session, "second-frame"));
    await flush();
    assert.equal(screen.src, "data:image/png;base64,second-frame");
    poll();
    await flush();
    assert.equal(frames.length, 3, "polling continues after the current request completes");
  } finally {
    mounted?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
});

test("host size notifications attach after an active handshake and dispose once per attachment", async t => {
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: new ViewerNode() });
  const window = Object.assign(new EventTarget(), { location: { search: "" } });
  const [root, screen, canvas, frame, gesture] = Array.from({ length: 5 }, () => new ViewerNode());
  const handshakes: Array<() => void> = [];
  let attached = 0;
  let disposed = 0;
  t.mock.method(App.prototype, "connect", function () {
    return new Promise<void>(resolve => handshakes.push(resolve));
  });
  t.mock.method(App.prototype, "setupSizeChangedNotifications", () => { attached++; return () => { disposed++; }; });
  t.mock.method(App.prototype, "getHostContext", () => ({ theme: "light" }));
  const replacements = { document, window, IntersectionObserver: class { observe() {} disconnect() {} }, setTimeout: () => 0, clearTimeout: () => {} };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const viewer = await import("../src/viewer-controller.js");
  const nodes = { root: root as unknown as HTMLElement, screen: screen as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, frame: frame as unknown as HTMLElement, gesture: gesture as unknown as HTMLElement };
  let mounted: ReturnType<typeof viewer.initializeViewer> | undefined;
  try {
    const obsolete = viewer.initializeViewer(nodes);
    obsolete.dispose();
    mounted = viewer.initializeViewer(nodes);
    handshakes[0]!();
    await obsolete.ready;
    assert.equal(attached, 0, "an ended handshake cannot create a size observer");
    handshakes[1]!();
    await mounted.ready;
    assert.equal(attached, 1);
    mounted.dispose();
    mounted.dispose();
    assert.equal(disposed, 1);
    mounted = viewer.initializeViewer(nodes);
    handshakes[2]!();
    await mounted.ready;
    assert.equal(attached, 2);
    assert.equal(disposed, 1);
    mounted.dispose();
    assert.equal(disposed, 2);
  } finally {
    mounted?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
});

test("switching video devices resets coordinate refresh and protects the new refresh from old replies", async () => {
  const document = Object.assign(new EventTarget(), { hidden: false, documentElement: new ViewerNode() });
  const window = Object.assign(new EventTarget(), { __SIM_STAGE_PREVIEW__: true, location: { search: "?transport=mcp" } });
  const [root, screen, canvas, frame, gesture] = Array.from({ length: 5 }, () => new ViewerNode());
  let selected = current;
  let now = 2000;
  const decoders: ViewerDecoder[] = [];
  const captures = new Map<string, number>();
  const pending: Array<{ session: Session; resolve: (value: unknown) => void }> = [];
  const reads: Array<{ session: Session; resolve: (value: unknown) => void }> = [];
  const streamIds = new Map<string, string>();
  const sequences = new Map<string, number>();
  const observation = (session: Session, data: string, landscape = false) => ({ ...captured(data), structuredContent: { ...captured("").structuredContent, session, coordinateSpace: landscape ? { width: 956, height: 440 } : { width: 440, height: 956 } } });
  const replacements = {
    document, window, performance: { now: () => now },
    matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ maxHeight: "none" }),
    IntersectionObserver: class { observe() {} disconnect() {} },
    VideoDecoder: class extends ViewerDecoder { static async isConfigSupported() { return { supported: false }; } constructor(callbacks: VideoDecoderInit) { super(callbacks); decoders.push(this); } },
    EncodedVideoChunk: class { constructor(readonly init: EncodedVideoChunkInit) {} },
    setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: (callback: FrameRequestCallback) => setImmediate(() => callback(now)),
    cancelAnimationFrame: (id: ReturnType<typeof setImmediate>) => clearImmediate(id),
    fetch: async (_url: string, init: RequestInit) => {
      const { name, arguments: args } = JSON.parse(init.body as string);
      let result: unknown;
      if (name === "sim_stage_status") result = { content: [], structuredContent: { devices: [selected.device], sessions: [selected], warnings: [] } };
      else if (name === "device_capture") {
        const count = (captures.get(args.sessionId) ?? 0) + 1;
        captures.set(args.sessionId, count);
        result = count === 1 ? observation(selected, `${selected.id}-initial`) : await new Promise(resolve => pending.push({ session: selected, resolve }));
      } else if (name === "device_stream") {
        const streamId = (streamIds.size + 1).toString().padStart(48, "0");
        streamIds.set(selected.id, streamId);
        result = { content: [], structuredContent: { sessionId: selected.id, streamId, url: "ws://blocked", format: "h264", codec: "avc1.42E01F", fps: 60 } };
      } else if (name === "device_stream_read") result = await new Promise(resolve => reads.push({ session: selected, resolve }));
      else if (name === "device_stream_stop") result = { content: [], structuredContent: { stopped: true } };
      else throw new Error(`Unexpected tool ${name}`);
      return { ok: true, async json() { return result; } };
    },
  };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const viewer = await import("../src/viewer-controller.js");
  const flush = async () => { for (let index = 0; index < 4; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
  const showLandscape = async () => {
    const index = reads.findIndex(read => read.session.id === selected.id);
    assert.ok(index >= 0);
    const read = reads.splice(index, 1)[0]!;
    const sequence = sequences.get(selected.id) ?? 0;
    sequences.set(selected.id, sequence + 1);
    read.resolve({ content: [], _meta: { "sim-stage/video": { sessionId: selected.id, streamId: streamIds.get(selected.id), sequence, active: true, frames: [{ id: sequence + 1, capturedAtUnixMs: Date.now(), ageMs: 0, data: Buffer.from([0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f, 0xaa, 0, 0, 1, 0x68, 0xbb, 0, 0, 0, 1, 0x65, 0xcc]).toString("base64") }] } } });
    await flush();
    const decoder = decoders.at(-1)!;
    decoder.callbacks.output({ timestamp: decoder.chunks.at(-1)!.init.timestamp, displayWidth: 956, displayHeight: 440, close() {} } as unknown as VideoFrame);
    await flush();
  };
  let mounted: ReturnType<typeof viewer.initializeViewer> | undefined;
  try {
    mounted = viewer.initializeViewer({ root: root as unknown as HTMLElement, screen: screen as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, frame: frame as unknown as HTMLElement, gesture: gesture as unknown as HTMLElement });
    await mounted.ready;
    await flush();
    await showLandscape();
    assert.equal(pending.length, 1, "the first device's rotation starts a coordinate refresh");
    selected = { ...current, id: "second", device: { ...current.device, id: "second", name: "Second Simulator" } };
    now = 4000;
    await viewer.scanDevices();
    await flush();
    await showLandscape();
    assert.equal(pending.length, 2, "the second device can refresh while the old device's request is pending");
    pending[0]!.resolve(observation(pending[0]!.session, "obsolete-coordinates", true));
    await flush();
    now = 6000;
    await showLandscape();
    assert.equal(pending.length, 2, "the old reply cannot clear the second device's pending refresh");
    assert.equal(viewer.getSnapshot().capture?.session.id, "second");
    pending[1]!.resolve(observation(pending[1]!.session, "current-coordinates", true));
    await flush();
    assert.deepEqual(viewer.getSnapshot().capture?.coordinateSpace, { width: 956, height: 440 });
  } finally {
    mounted?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
});
