import assert from "node:assert/strict";
import test from "node:test";
import { deliveryBoundMs } from "../src/video-metrics.js";
import { getEventListeners } from "node:events";
import { coordinateSpaceMatchesFrame, SimulatorVideoPlayer, type SimulatorVideoFrame } from "../src/video-player.js";

const keyframe = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f, 0xaa, 0, 0, 1, 0x68, 0xbb, 0, 0, 0, 1, 0x65, 0xcc]);
let frameId = 0;
function envelope(data: Uint8Array, ageMs = 0): SimulatorVideoFrame { return { id: ++frameId, capturedAtUnixMs: Date.now() - ageMs, ageMs, data }; }
const delta = new Uint8Array([0, 0, 1, 0x41, 0xcc]);

test("touch mapping accepts scaled frames and rejects the preceding rotation", () => {
  assert.equal(coordinateSpaceMatchesFrame({ width: 440, height: 956 }, { width: 1320, height: 2868 }), true);
  assert.equal(coordinateSpaceMatchesFrame({ width: 440, height: 956 }, { width: 2868, height: 1320 }), false);
  assert.equal(coordinateSpaceMatchesFrame({ width: 0, height: 956 }, { width: 1320, height: 2868 }), false);
});

function fakeBrowser(run: (browser: { decoder: () => FakeDecoder; socket: () => FakeSocket; canvas: HTMLCanvasElement; draws: unknown[]; decoders: FakeDecoder[]; sockets: FakeSocket[]; timers: Map<number, { callback: () => void; delay: number }>; paint: () => void }) => void | Promise<void>, options: { socketError?: Error; decodeInTasks?: boolean; now?: () => number } = {}): void | Promise<void> {
  frameId = 0;
  let decoder: FakeDecoder;
  let socket: FakeSocket;
  const draws: unknown[] = [];
  const decoders: FakeDecoder[] = [];
  const sockets: FakeSocket[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0;
  const paints = new Map<number, FrameRequestCallback>();
  const paint = () => { const callbacks = [...paints.values()]; paints.clear(); callbacks.forEach(callback => callback(performance.now())); };
  class BrowserDecoder extends FakeDecoder {
    constructor(callbacks: VideoDecoderInit) { super(callbacks); decoder = this; decoders.push(this); }
    override decode(chunk: { init: EncodedVideoChunkInit }) {
      super.decode(chunk);
      if (options.decodeInTasks) {
        this.decodeQueueSize++;
        setImmediate(() => {
          if (this.state === "closed") return;
          this.decodeQueueSize--;
          this.dispatchEvent(new Event("dequeue"));
          this.callbacks.output({ timestamp: chunk.init.timestamp, displayWidth: 440, displayHeight: 956, close() {} } as unknown as VideoFrame);
        });
      }
    }
  }
  class BrowserSocket extends FakeSocket {
    constructor(url: string) { super(url); if (options.socketError) throw options.socketError; socket = this; sockets.push(this); }
  }
  class BrowserChunk {
    constructor(readonly init: EncodedVideoChunkInit) {}
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  const replacements = {
    ...(options.now ? { performance: { now: options.now } } : {}),
    VideoDecoder: BrowserDecoder, EncodedVideoChunk: BrowserChunk, WebSocket: BrowserSocket,
    setTimeout: (callback: () => void, delay: number) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = ++nextTimer; paints.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => { paints.delete(id); },
  };
  const previous = Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globals, name, { value, configurable: true, writable: true });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (frame: unknown) => { draws.push(frame); } }) } as unknown as HTMLCanvasElement;
  const restore = () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globals, name, descriptor);
      else delete globals[name];
    }
  };
  try {
    const result = run({ decoder: () => decoder!, socket: () => socket!, canvas, draws, decoders, sockets, timers, paint });
    if (result) return result.finally(restore);
    restore();
  } catch (error) { restore(); throw error; }
}

class FakeDecoder extends EventTarget {
  state: CodecState = "unconfigured";
  decodeQueueSize = 0;
  configs: VideoDecoderConfig[] = [];
  chunks: { init: EncodedVideoChunkInit }[] = [];
  resets = 0;
  constructor(readonly callbacks: VideoDecoderInit) { super(); }
  configure(config: VideoDecoderConfig) { this.configs.push(config); this.state = "configured"; }
  decode(chunk: { init: EncodedVideoChunkInit }) { this.chunks.push(chunk); }
  reset() { this.resets++; this.decodeQueueSize = 0; this.state = "unconfigured"; }
  close() { this.state = "closed"; }
}

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  send(message: string) { this.sent.push(message); }
  binaryType = "";
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closes = 0;
  constructor(readonly url: string) {}
  close() { this.closes++; }
  sendFrame(data: Uint8Array) {
    const bytes = new Uint8Array(data.length + 16);
    const header = new DataView(bytes.buffer);
    header.setBigUint64(0, BigInt(++frameId));
    header.setBigUint64(8, BigInt(Date.now()));
    bytes.set(data, 16);
    this.onmessage?.({ data: bytes.buffer } as MessageEvent);
  }
}

test("video waits for a complete IDR, catches up after backpressure, and releases every frame on teardown", () => {
  fakeBrowser(browser => {
    const errors: Error[] = [];
    const dimensions: unknown[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://127.0.0.1:1234/video/token", codec: "avc1.42E01F", fps: 30 }, size => dimensions.push(size), error => errors.push(error));
    try {
      player.start();
      const decoder = browser.decoder();
      const socket = browser.socket();
      assert.equal(socket.binaryType, "arraybuffer");
      assert.equal(decoder.configs.length, 0);
      socket.sendFrame(delta);
      socket.sendFrame(new Uint8Array([0, 0, 1, 0x65, 0xcc]));
      assert.equal(decoder.chunks.length, 0);
      socket.sendFrame(keyframe);
      assert.equal(decoder.configs[0].description, undefined);
      socket.sendFrame(delta);
      assert.deepEqual(decoder.chunks.map(chunk => chunk.init.type), ["key", "delta"]);
      assert.deepEqual(decoder.chunks.map(chunk => chunk.init.timestamp), [3 * 33333, 4 * 33333]);
      decoder.decodeQueueSize = 5;
      socket.sendFrame(delta);
      socket.sendFrame(delta);
      assert.equal(decoder.resets, 1);
      assert.ok(socket.sent.includes("keyframe"));
      assert.equal(decoder.chunks.length, 2);
      socket.sendFrame(keyframe);
      assert.equal(decoder.chunks.length, 3);
      let closes = 0;
      const frame = { timestamp: decoder.chunks.at(-1)!.init.timestamp, displayWidth: 1320, displayHeight: 2868, close: () => { closes++; } } as unknown as VideoFrame;
      decoder.callbacks.output(frame);
      browser.paint();
      assert.equal(closes, 1);
      assert.deepEqual(dimensions, [{ width: 1320, height: 2868 }]);
      assert.equal(browser.draws.length, 1);
      assert.equal(browser.canvas.width, 1320);
      player.stop();
      decoder.callbacks.output(frame);
      assert.equal(closes, 2);
      assert.equal(browser.draws.length, 1);
      assert.equal(decoder.state, "closed");
      assert.equal(socket.closes, 1);
      assert.equal(socket.onmessage, null);
      assert.deepEqual(errors, []);
    } finally { player.stop(); }
  });
});

test("startup uses the actual SPS codec and does not duplicate or resurrect transports", () => {
  fakeBrowser(browser => {
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://127.0.0.1:1234/video/token", codec: "avc1.64001F", fps: 30 }, () => {}, error => errors.push(error));
    try {
      player.start();
      player.start();
      assert.equal(browser.decoders.length, 1);
      assert.equal(browser.sockets.length, 1);
      assert.equal(browser.decoder().configs.length, 0);
      browser.socket().sendFrame(keyframe);
      assert.equal(browser.decoder().configs[0].codec, "avc1.42E01F");
      player.stop();
      player.start();
      assert.equal(browser.decoders.length, 1);
      assert.equal(browser.sockets.length, 1);
      assert.equal(browser.timers.size, 0);
      assert.deepEqual(errors, []);
    } finally { player.stop(); }
  });
});

test("HEVC decoding waits for VPS, SPS and PPS, then configures from the actual SPS", () => {
  fakeBrowser(browser => {
    const unit = new Uint8Array([0, 0, 1, 0x40, 1, 0xaa, 0, 0, 1, 0x42, 1, 1, 1, 0x60, 0, 0, 3, 0, 0xb0, 0, 0, 3, 0, 0, 3, 0, 0x96, 0, 0, 1, 0x44, 1, 0xbb, 0, 0, 1, 0x26, 1, 0xcc]);
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", format: "hevc", url: "ws://127.0.0.1:1234/video/token", codec: "hev1.1.6.L120.B0", fps: 30 }, () => {}, error => assert.fail(error.message));
    try {
      player.start();
      browser.socket().sendFrame(unit.subarray(6));
      assert.equal(browser.decoder().chunks.length, 0);
      browser.socket().sendFrame(unit);
      assert.equal(browser.decoder().configs[0]!.codec, "hev1.1.6.L150.B0");
      assert.equal(browser.decoder().configs[0]!.description, undefined, "in-band parameter sets use Annex B decoding");
      assert.equal(browser.decoder().chunks[0]!.init.type, "key");
      browser.socket().sendFrame(new Uint8Array([0, 0, 1, 2, 1, 0xcc]));
      assert.equal(browser.decoder().chunks[1]!.init.type, "delta");
    } finally { player.stop(); }
  });
});

test("a synchronous transport failure closes the decoder and reports once", () => {
  fakeBrowser(browser => {
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "invalid", codec: "avc1.42E01F", fps: 30 }, () => {}, error => errors.push(error));
    player.start();
    player.start();
    assert.equal(browser.decoder().state, "closed");
    assert.equal(browser.decoders.length, 1);
    assert.equal(browser.sockets.length, 0);
    assert.equal(browser.timers.size, 0);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, "Invalid WebSocket URL.");
  }, { socketError: new Error("Invalid WebSocket URL.") });
});

test("decoder configuration failures release the capture transport", () => {
  fakeBrowser(browser => {
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://127.0.0.1:1234/video/token", codec: "avc1.42E01F", fps: 30 }, () => {}, error => errors.push(error));
    try {
      player.start();
      browser.decoder().configure = () => { throw new Error("Unsupported H.264 configuration."); };
      browser.socket().sendFrame(keyframe);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, "Unsupported H.264 configuration.");
      assert.equal(browser.socket().closes, 1);
      assert.equal(browser.decoder().state, "closed");
      assert.equal(browser.timers.size, 0);
    } finally { player.stop(); }
  });
});

test("stopping from the rendered-frame callback leaves no watchdog behind", () => {
  fakeBrowser(browser => {
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://127.0.0.1:1234/video/token", codec: "avc1.42E01F", fps: 30 }, () => player.stop(), error => assert.fail(error.message));
    player.start();
    let closes = 0;
    browser.socket().sendFrame(keyframe);
    browser.decoder().callbacks.output({ timestamp: browser.decoder().chunks.at(-1)!.init.timestamp, displayWidth: 440, displayHeight: 956, close: () => { closes++; } } as unknown as VideoFrame);
    browser.paint();
    assert.equal(closes, 1);
    assert.equal(browser.timers.size, 0);
    assert.equal(browser.socket().closes, 1);
  });
});

test("startup permits native error reporting while decoded-frame stalls fail promptly", () => {
  fakeBrowser(browser => {
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://127.0.0.1:1234/video/token", codec: "avc1.42E01F", fps: 30 }, () => {}, error => errors.push(error));
    try {
      player.start();
      assert.equal([...browser.timers.values()][0].delay, 20_000);
      browser.socket().sendFrame(keyframe);
      browser.decoder().callbacks.output({ timestamp: browser.decoder().chunks.at(-1)!.init.timestamp, displayWidth: 440, displayHeight: 956, close: () => {} } as unknown as VideoFrame);
      browser.paint();
      assert.equal(browser.timers.size, 1);
      const watchdog = [...browser.timers.values()][0];
      assert.equal(watchdog.delay, 5000);
      watchdog.callback();
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, "The simulator stopped producing live video frames.");
      assert.equal(browser.socket().closes, 1);
      assert.equal(browser.timers.size, 0);
    } finally { player.stop(); }
  });
});

test("a native capture error closes the transport and reports one actionable failure", () => {
  fakeBrowser(browser => {
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://127.0.0.1:1234/video/token", codec: "avc1.42E01F", fps: 30 }, () => {}, error => errors.push(error));
    try {
      player.start();
      const socket = browser.socket();
      const receive = socket.onmessage!;
      receive({ data: JSON.stringify({ type: "error", message: "Simulator display unavailable." }) } as MessageEvent);
      receive({ data: JSON.stringify({ type: "error", message: "Repeated failure." }) } as MessageEvent);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, "Simulator display unavailable.");
      assert.equal(socket.closes, 1);
      assert.equal(browser.decoder().state, "closed");
    } finally { player.stop(); }
  });
});

test("MCP transport keeps one read in flight and discards late batches after stopping", async () => {
  await fakeBrowser(async browser => {
    const reads: Array<(frames: SimulatorVideoFrame[]) => void> = [];
    let stops = 0;
    let activeReads = 0;
    let maximumReads = 0;
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", streamId: "token", url: "ws://blocked", codec: "avc1.42E01F", fps: 30 }, () => {}, error => errors.push(error), {
      read() {
        activeReads++;
        maximumReads = Math.max(maximumReads, activeReads);
        return new Promise<SimulatorVideoFrame[]>(resolve => { reads.push(resolve); }).finally(() => { activeReads--; });
      },
      stop() { stops++; },
    });
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    try {
      player.start();
      assert.equal(reads.length, 1);
      assert.equal(browser.sockets.length, 0, "embedded transport never opens a blocked WebSocket");
      reads.shift()!([delta, keyframe, delta].map(data => envelope(data)));
      await flush();
      assert.deepEqual(browser.decoder().chunks.map(chunk => chunk.init.type), ["key", "delta"]);
      assert.equal(reads.length, 1);
      assert.equal(maximumReads, 1);
      browser.decoder().decodeQueueSize = 6;
      reads.shift()!([envelope(delta)]);
      await flush();
      assert.equal(browser.decoder().resets, 0, "ordinary batch decoding does not discard its GOP");
      assert.equal(reads.length, 0, "the next batch waits for decoder backpressure to clear");
      browser.decoder().decodeQueueSize = 0;
      browser.decoder().dispatchEvent(new Event("dequeue"));
      await flush();
      player.stop();
      const chunks = browser.decoder().chunks.length;
      reads.shift()!([envelope(keyframe)]);
      await flush();
      assert.equal(browser.decoder().chunks.length, chunks);
      assert.equal(browser.decoder().state, "closed");
      assert.equal(reads.length, 0);
      assert.equal(stops, 1);
      assert.equal(browser.timers.size, 0);
      assert.deepEqual(errors, []);
    } finally { player.stop(); }
  });
});

test("native MCP capture errors close the relay and report once", async () => {
  await fakeBrowser(async browser => {
    let rejectRead: (error: Error) => void;
    let stops = 0;
    const errors: Error[] = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", streamId: "token", url: "ws://blocked", codec: "avc1.42E01F", fps: 30 }, () => {}, error => errors.push(error), {
      read: () => new Promise<SimulatorVideoFrame[]>((_resolve, reject) => { rejectRead = reject; }),
      stop() { stops++; },
    });
    try {
      player.start();
      rejectRead!(new Error("Simulator display unavailable."));
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(stops, 1);
      assert.equal(browser.decoder().state, "closed");
      assert.equal(browser.timers.size, 0);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, "Simulator display unavailable.");
      assert.equal(browser.sockets.length, 0);
    } finally { player.stop(); }
  });
});

test("a relay burst decodes dependencies and paints only the latest completed frame", async () => {
  await fakeBrowser(async browser => {
    const reads: Array<(frames: SimulatorVideoFrame[]) => void> = [];
    let stops = 0;
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", streamId: "token", url: "ws://blocked", codec: "avc1.42E01F", fps: 30 }, () => {}, error => assert.fail(error.message), {
      read: () => new Promise<SimulatorVideoFrame[]>(resolve => { reads.push(resolve); }),
      stop() { stops++; },
    });
    try {
      player.start();
      reads.shift()!([keyframe, ...Array.from({ length: 29 }, () => delta)].map(data => envelope(data)));
      for (let tick = 0; tick < 40 && browser.decoder().chunks.length < 30; tick++) await new Promise<void>(resolve => setImmediate(resolve));
      await new Promise<void>(resolve => setImmediate(resolve));
      browser.paint();
      assert.equal(browser.draws.length, 1);
      assert.equal(browser.decoder().chunks.length, 30);
      assert.equal(browser.decoder().resets, 0);
      assert.equal(reads.length, 1, "the next bounded batch is requested after decoding");
      assert.equal(getEventListeners(browser.decoder(), "dequeue").length, 0);
      player.stop();
      reads.shift()!([]);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(stops, 1);
    } finally { player.stop(); }
  }, { decodeInTasks: true });
});

test("stopping a relay while the decoder is full releases its dequeue waiter", async () => {
  await fakeBrowser(async browser => {
    const reads: Array<(frames: SimulatorVideoFrame[]) => void> = [];
    let stops = 0;
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", streamId: "token", url: "ws://blocked", codec: "avc1.42E01F", fps: 30 }, () => {}, error => assert.fail(error.message), {
      read: () => new Promise<SimulatorVideoFrame[]>(resolve => { reads.push(resolve); }),
      stop() { stops++; },
    });
    player.start();
    const decoder = browser.decoder();
    const decode = decoder.decode.bind(decoder);
    decoder.decode = chunk => { decode(chunk); decoder.decodeQueueSize++; };
    reads.shift()!([keyframe, ...Array.from({ length: 29 }, () => delta)].map(data => envelope(data)));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(decoder.chunks.length, 4);
    assert.equal(getEventListeners(decoder, "dequeue").length, 1);
    player.stop();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(decoder.chunks.length, 4);
    assert.equal(getEventListeners(decoder, "dequeue").length, 0);
    assert.equal(reads.length, 0);
    assert.equal(stops, 1);
    assert.equal(browser.timers.size, 0);
  });
});

test("expired relay chains recover at a fresh keyframe and release the age waiter", async () => {
  let now = 0;
  await fakeBrowser(async browser => {
    const reads: Array<{ recover: boolean; resolve: (frames: SimulatorVideoFrame[]) => void }> = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://blocked", codec: "avc1.42E01F", fps: 30 }, () => {}, error => assert.fail(error.message), {
      read: recover => new Promise(resolve => reads.push({ recover: !!recover, resolve })), stop() {},
    });
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    player.start();
    const decoder = browser.decoder();
    const decode = decoder.decode.bind(decoder);
    decoder.decode = chunk => { decode(chunk); decoder.decodeQueueSize++; };
    const old = [keyframe, ...Array.from({ length: 8 }, () => delta)].map(data => envelope(data, 400));
    reads.shift()!.resolve(old);
    await flush();
    assert.equal(decoder.chunks.length, 4);
    assert.equal(getEventListeners(decoder, "dequeue").length, 1);
    now = 101;
    const timeout = [...browser.timers.values()].find(timer => timer.delay <= 100)!;
    assert.ok(timeout, "decoder wait is bounded by remaining capture age");
    timeout.callback();
    await flush();
    assert.equal(decoder.resets, 1);
    assert.equal(getEventListeners(decoder, "dequeue").length, 0);
    assert.equal(reads.length, 1);
    assert.equal(reads[0]!.recover, true, "discarding any dependent frame requests a fresh GOP");
    let retiredCloses = 0;
    decoder.callbacks.output({ timestamp: decoder.chunks[0]!.init.timestamp, displayWidth: 440, displayHeight: 956, close: () => { retiredCloses++; } } as unknown as VideoFrame);
    browser.paint();
    assert.equal(retiredCloses, 1, "late output from the discarded decoder chain is closed");
    assert.equal(browser.draws.length, 0);
    const incomplete = envelope(delta);
    const fresh = envelope(keyframe);
    reads.shift()!.resolve([incomplete, fresh, envelope(delta)]);
    await flush();
    assert.deepEqual(decoder.chunks.slice(4).map(chunk => chunk.init.type), ["key", "delta"]);
    assert.equal(decoder.chunks[4]!.init.timestamp, fresh.id * 33333, "recovery preserves native identity and its skipped-frame gap");
    assert.equal(reads.length, 1, "only one RPC read remains pending");
    let closes = 0;
    const latest = decoder.chunks.at(-1)!.init.timestamp;
    decoder.callbacks.output({ timestamp: latest, displayWidth: 956, displayHeight: 440, close: () => { closes++; } } as unknown as VideoFrame);
    browser.paint();
    assert.equal(browser.canvas.width, 956, "fresh rotated keyframe changes presentation dimensions");
    assert.equal(browser.draws.length, 1);
    assert.equal(closes, 1);
    player.stop();
    reads.shift()!.resolve([envelope(keyframe)]);
    await flush();
    assert.equal(browser.draws.length, 1);
    assert.equal(browser.timers.size, 0);
  }, { now: () => now });
});

test("decoded bursts retain the latest frame identity through a rendering opportunity", () => {
  fakeBrowser(browser => {
    const milestones: Array<{ phase: string; id: number }> = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "ws://local", codec: "avc1.42E01F", fps: 30 }, () => {}, error => assert.fail(error.message), undefined, event => milestones.push(event));
    player.start();
    browser.socket().sendFrame(keyframe);
    browser.socket().sendFrame(delta);
    const decoder = browser.decoder();
    let closes = 0;
    for (const chunk of decoder.chunks) decoder.callbacks.output({ timestamp: chunk.init.timestamp, displayWidth: 440, displayHeight: 956, close: () => { closes++; } } as unknown as VideoFrame);
    assert.equal(closes, 1, "superseded decoded frame is released before painting");
    assert.equal(browser.draws.length, 0);
    assert.equal(milestones.filter(event => event.phase === "decode").length, 2, "decode milestones record output completion before presentation");
    browser.paint();
    assert.equal(browser.draws.length, 1);
    assert.equal(closes, 2);
    assert.equal(milestones.filter(event => event.phase === "present").length, 0);
    browser.paint();
    const lastId = milestones.filter(event => event.phase === "received").at(-1)!.id;
    assert.deepEqual(milestones.filter(event => ["draw", "present"].includes(event.phase)).map(event => event.phase), ["draw", "present"]);
    assert.ok(milestones.filter(event => ["draw", "present"].includes(event.phase)).every(event => event.id === lastId));
    player.stop();
  });
});


test("relay age correction avoids a false recovery while retaining delayed-response recovery", async () => {
  for (const [elapsed, wait, serverAge, corrected, recoveries] of [
    [270, 250, 10, true, 0],
    [280, 250, 260, false, 1],
    [280, 250, 260, true, 0],
    [800, 250, 10, true, 1],
  ] as const) await fakeBrowser(async browser => {
    const events: string[] = [], reads: Array<(frames: SimulatorVideoFrame[]) => void> = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "unused", codec: "avc1.42E01F", fps: 60 }, () => {}, error => assert.fail(error.message), {
      read: () => new Promise(resolve => reads.push(resolve)), stop() {},
    }, event => events.push(event.phase));
    player.start();
    reads.shift()!([envelope(keyframe, serverAge + (corrected ? deliveryBoundMs(elapsed, wait) : elapsed))]);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(events.filter(phase => phase === "received").length, 1);
    assert.equal(events.filter(phase => phase === "stale-drop").length, recoveries);
    assert.equal(events.filter(phase => phase === "keyframe-request").length, recoveries);
    assert.equal(browser.decoder().chunks.length, recoveries ? 0 : 1);
    player.stop();
    reads.shift()?.([]);
  }, { now: () => 0 });
});


test("a codec-chain reset identifies the frame that triggered it within a received batch", async () => {
  await fakeBrowser(async browser => {
    const events: Array<{ phase: string; id: number; ageMs: number }> = [];
    const reads: Array<(frames: SimulatorVideoFrame[]) => void> = [];
    const player = new SimulatorVideoPlayer(browser.canvas, { sessionId: "session", url: "unused", codec: "avc1.640033", fps: 60 }, () => {}, error => assert.fail(error.message), {
      read: () => new Promise(resolve => reads.push(resolve)), stop() {},
    }, event => events.push(event));
    player.start();
    const first = envelope(keyframe, 30), last = envelope(delta, 10);
    reads.shift()!([first, last]);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(events.filter(event => event.phase === "reset").map(({ id, ageMs }) => ({ id, ageMs })), [{ id: first.id, ageMs: 30 }]);
    assert.deepEqual(events.filter(event => event.phase === "received").map(event => event.id), [first.id, last.id]);
    player.stop(); reads.shift()?.([]);
  }, { now: () => 0 });
});
