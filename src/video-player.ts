import { VIDEO_MAX_FRAME_AGE_MS } from "./shared.js";
import { inspectVideoAccessUnit, type VideoCodec } from "./video-codec.js";

export interface SimulatorStream {
  sessionId: string;
  url: string;
  codec: string;
  fps: number;
  streamId?: string;
  format?: VideoCodec;
}

/** Server age plus conservative response-delivery bound; the browser adds only its local monotonic elapsed. */
export interface SimulatorVideoFrame { id: number; capturedAtUnixMs: number; ageMs: number; data: Uint8Array }
export interface VideoMilestone { phase: "received" | "decode-start" | "decode" | "draw" | "present" | "stale-drop" | "reset" | "keyframe-request"; id: number; capturedAtUnixMs: number; ageMs: number; at: number }

export interface SimulatorVideoTransport {
  /** One item is one Annex B access unit; reads wait for a bounded video batch. */
  read(recover?: boolean): Promise<SimulatorVideoFrame[]>;
  stop(): void;
}

/** One access unit carries SPS/PPS on IDR frames. */
export function inspectH264AccessUnit(data: Uint8Array) {
  return inspectVideoAccessUnit(data, "h264");
}

export function coordinateSpaceMatchesFrame(space: { width: number; height: number }, frame: { width: number; height: number }) {
  if (!space.width || !space.height || !frame.width || !frame.height) return false;
  const screenRatio = space.width / space.height;
  const frameRatio = frame.width / frame.height;
  return Math.abs(screenRatio - frameRatio) / Math.max(screenRatio, frameRatio) < 0.02;
}

/** Owns the transport and decoder; stopping releases native capture. */
export class SimulatorVideoPlayer {
  private socket: WebSocket | undefined;
  private decoder: VideoDecoder | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private resumeDecode: (() => void) | undefined;
  private stopped = false;
  private waitingForKey = true;
  private codec: string;
  private ageTimer: ReturnType<typeof setTimeout> | undefined;
  private paint: number | undefined;
  private present: number | undefined;
  private latestFrame: { frame: VideoFrame; metadata?: SimulatorVideoFrame; receivedAt: number } | undefined;
  private metadata = new Map<number, { frame: SimulatorVideoFrame; receivedAt: number }>();
  private recover = false;
  private lastReceived: { frame: Pick<SimulatorVideoFrame, "id" | "capturedAtUnixMs" | "ageMs">; receivedAt: number } | undefined;
  private readonly context: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stream: SimulatorStream,
    private readonly onFrame: (dimensions: { width: number; height: number }) => void,
    private readonly onError: (error: Error) => void,
    private readonly transport?: SimulatorVideoTransport,
    private readonly milestone?: (event: VideoMilestone) => void,
  ) {
    this.codec = stream.codec;
    if (typeof VideoDecoder === "undefined" || typeof EncodedVideoChunk === "undefined") throw new Error("This viewer does not support live simulator video. Open it in a browser with WebCodecs support.");
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("The viewer could not create a video canvas.");
    this.context = context;
  }

  start() {
    if (this.stopped || this.decoder || this.socket) return;
    try {
      this.decoder = new VideoDecoder({
        output: frame => {
          const metadata = this.metadata.get(frame.timestamp);
          this.metadata.delete(frame.timestamp);
          if (this.stopped || !metadata) { frame.close(); return; }
          this.record("decode", metadata.frame, metadata.receivedAt);
          this.latestFrame?.frame.close();
          this.latestFrame = { frame, metadata: metadata.frame, receivedAt: metadata.receivedAt };
          if (this.paint === undefined) this.paint = requestAnimationFrame(() => this.drawLatest());
        },
        error: error => this.fail(new Error(`Live video decoder failed: ${error.message}`)),
      });
      // Native startup has a 15-second timeout and can report a more useful error.
      this.armWatchdog(20_000);
      if (this.transport) {
        void this.readFrames();
        return;
      }
      const socket = new WebSocket(this.stream.url);
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      socket.onmessage = event => {
        if (this.stopped) return;
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data) as { type?: string; message?: string };
            if (message.type === "error") this.fail(new Error(message.message || "Native simulator capture failed."));
          } catch (error) { this.fail(error); }
          return;
        }
        if (!(event.data instanceof ArrayBuffer)) return;
        try {
          const bytes = new Uint8Array(event.data);
          if (bytes.length <= 16) throw new Error("Invalid video frame envelope.");
          const header = new DataView(bytes.buffer, bytes.byteOffset, 16);
          const capturedAtUnixMs = Number(header.getBigUint64(8));
          const frame = { id: Number(header.getBigUint64(0)), capturedAtUnixMs, ageMs: Math.max(0, Date.now() - capturedAtUnixMs), data: bytes.subarray(16) };
          const receivedAt = performance.now();
          this.received(frame, receivedAt);
          this.decode(frame, receivedAt);
        } catch (error) { this.fail(error); }
      };
      socket.onerror = () => this.fail(new Error("Could not connect to the local simulator video stream."));
      socket.onclose = () => { if (!this.stopped) this.fail(new Error("The simulator video stream disconnected.")); };
    } catch (error) { this.fail(error); }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.watchdog !== undefined) clearTimeout(this.watchdog);
    this.watchdog = undefined;
    this.resumeDecode?.();
    if (this.paint !== undefined) cancelAnimationFrame(this.paint);
    if (this.present !== undefined) cancelAnimationFrame(this.present);
    this.paint = this.present = undefined;
    this.latestFrame?.frame.close();
    this.latestFrame = undefined;
    this.metadata.clear();
    this.lastReceived = undefined;
    this.transport?.stop();
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = undefined;
  }

  private configure() {
    // Omitting description selects Annex B. avc.format belongs to VideoEncoder.
    this.decoder!.configure({ codec: this.codec, optimizeForLatency: true, hardwareAcceleration: "prefer-hardware" });
    this.waitingForKey = true;
  }

  private async readFrames() {
    try {
      while (!this.stopped) {
        const recovery = this.recover;
        this.recover = false;
        const frames = await this.transport!.read(recovery);
        if (this.stopped) return;
        const receivedAt = performance.now();
        for (const frame of frames) this.received(frame, receivedAt);
        for (const frame of frames) {
          if (this.stopped) return;
          if (this.age(frame, receivedAt) > VIDEO_MAX_FRAME_AGE_MS) { this.resetChain(true, { frame, receivedAt }); break; }
          if (this.decoder!.decodeQueueSize >= 4) await this.waitForDecoder(frame, receivedAt);
          if (this.stopped) return;
          if (this.age(frame, receivedAt) > VIDEO_MAX_FRAME_AGE_MS) { this.resetChain(true, { frame, receivedAt }); break; }
          this.decode(frame, receivedAt);
        }
      }
    } catch (error) { this.fail(error); }
  }

  private age(frame: Pick<SimulatorVideoFrame, "ageMs">, receivedAt: number) { return frame.ageMs + performance.now() - receivedAt; }

  private resetChain(requestKeyframe = true, stale?: { frame: SimulatorVideoFrame; receivedAt: number }) {
    if (stale) this.record("stale-drop", stale.frame, stale.receivedAt);
    const tracked = stale ?? this.lastReceived;
    if (tracked?.frame) {
      this.record("reset", tracked.frame, tracked.receivedAt);
      if (requestKeyframe) this.record("keyframe-request", tracked.frame, tracked.receivedAt);
    }
    if (this.decoder!.state === "configured") this.decoder!.reset();
    this.metadata.clear();
    this.latestFrame?.frame.close();
    this.latestFrame = undefined;
    this.waitingForKey = true;
    this.recover = requestKeyframe;
    if (requestKeyframe && this.socket?.readyState === WebSocket.OPEN) this.socket.send("keyframe");
  }

  private waitForDecoder(frame: SimulatorVideoFrame, receivedAt: number) {
    const decoder = this.decoder!;
    return new Promise<void>(resolve => {
      const ready = () => { if (decoder.decodeQueueSize < 4) finish(); };
      const finish = () => {
        decoder.removeEventListener("dequeue", ready);
        clearTimeout(this.ageTimer);
        this.ageTimer = undefined;
        this.resumeDecode = undefined;
        resolve();
      };
      this.resumeDecode = finish;
      this.ageTimer = setTimeout(finish, Math.max(0, VIDEO_MAX_FRAME_AGE_MS - this.age(frame, receivedAt)));
      decoder.addEventListener("dequeue", ready);
      ready();
    });
  }

  private received(frame: SimulatorVideoFrame, receivedAt: number) {
    this.record("received", frame, receivedAt);
  }

  private record(phase: VideoMilestone["phase"], frame: Pick<SimulatorVideoFrame, "id" | "capturedAtUnixMs" | "ageMs">, receivedAt: number) {
    this.milestone?.({ phase, id: frame.id, capturedAtUnixMs: frame.capturedAtUnixMs, ageMs: this.age(frame, receivedAt), at: performance.now() });
  }

  private drawLatest() {
    this.paint = undefined;
    const latest = this.latestFrame;
    this.latestFrame = undefined;
    if (!latest) return;
    const { frame, metadata, receivedAt } = latest;
    try {
      if (this.stopped) return;
      if (metadata && this.age(metadata, receivedAt) > VIDEO_MAX_FRAME_AGE_MS) { this.resetChain(true, { frame: metadata, receivedAt }); this.resumeDecode?.(); return; }
      if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
      }
      this.context.drawImage(frame, 0, 0);
      if (metadata) this.record("draw", metadata, receivedAt);
      this.onFrame({ width: frame.displayWidth, height: frame.displayHeight });
      if (!this.stopped) {
        this.armWatchdog(5000);
        if (metadata) {
          // A following animation frame confirms a rendering opportunity after the canvas draw.
          if (this.present !== undefined) cancelAnimationFrame(this.present);
          this.present = requestAnimationFrame(() => { this.present = undefined; if (!this.stopped) this.record("present", metadata, receivedAt); });
        }
      }
    } catch (error) { this.fail(error); }
    finally { frame.close(); }
  }

  private decode(frame: SimulatorVideoFrame, receivedAt: number) {
    const { id, capturedAtUnixMs, ageMs } = frame;
    this.lastReceived = { frame: { id, capturedAtUnixMs, ageMs }, receivedAt };
    const data = frame.data;
    if (this.age(frame, receivedAt) > VIDEO_MAX_FRAME_AGE_MS) { this.resetChain(true, { frame, receivedAt }); return; }
    const decoder = this.decoder!;
    const unit = inspectVideoAccessUnit(data, this.stream.format ?? "h264");
    if (!unit.hasPicture) return;
    if (unit.codec && unit.codec !== this.codec) {
      this.codec = unit.codec;
      this.resetChain(!unit.keyFrame || !unit.hasParameterSets);
    }
    // A slow renderer catches up at the next IDR instead of accumulating latency.
    if (decoder.decodeQueueSize > 4) {
      this.resetChain();
    }
    if (this.waitingForKey && (!unit.keyFrame || !unit.hasParameterSets)) return;
    // The descriptor codec is provisional; configure from the actual SPS only
    // once a complete keyframe can start decoding.
    if (decoder.state === "unconfigured") this.configure();
    this.waitingForKey = false;
    if (unit.keyFrame && unit.hasParameterSets) this.recover = false;
    // Native IDs are monotonic per encoder. Gaps retain identity when recovery skips frames.
    const timestamp = frame.id * Math.round(1_000_000 / this.stream.fps);
    this.metadata.set(timestamp, { frame, receivedAt });
    this.record("decode-start", frame, receivedAt);
    decoder.decode(new EncodedVideoChunk({ type: unit.keyFrame ? "key" : "delta", timestamp, data }));
  }

  private armWatchdog(delay: number) {
    if (this.watchdog !== undefined) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.fail(new Error("The simulator stopped producing live video frames.")), delay);
  }

  private fail(error: unknown) {
    if (this.stopped) return;
    this.stop();
    this.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
