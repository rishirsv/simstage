import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

interface Observer {
  process: ChildProcess;
  ready: Promise<void>;
  attached: boolean;
  closing?: Promise<void>;
  waits: Map<number, { resolve: (quiet: boolean) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>;
}

/** Owns one damage-only callback registration per simulator session. */
export class SimulatorObserver {
  private observers = new Map<string, Observer>();
  private request = 0;
  constructor(private readonly helper: URL) {}

  start(sessionId: string, deviceId: string): Promise<void> {
    const existing = this.observers.get(sessionId);
    if (existing) return existing.ready;
    const child = spawn(fileURLToPath(this.helper), [deviceId, "--observe-only"], { stdio: ["pipe", "ignore", "pipe"] });
    let ready!: () => void, failed!: (error: Error) => void;
    const observer: Observer = { process: child, attached: false, waits: new Map(), ready: new Promise((resolve, reject) => { ready = resolve; failed = reject; }) };
    this.observers.set(sessionId, observer);
    const dispose = (error: Error) => {
      clearTimeout(startup);
      failed(error);
      for (const wait of observer.waits.values()) { clearTimeout(wait.timer); wait.reject(error); }
      observer.waits.clear();
      if (this.observers.get(sessionId) === observer) this.observers.delete(sessionId);
    };
    const startup = setTimeout(() => { dispose(new Error("Simulator damage observer did not attach.")); child.kill("SIGTERM"); }, 15_000);
    let tail = "";
    child.stdin!.on("error", () => {});
    child.stderr!.on("data", chunk => {
      const lines = (tail + chunk).split("\n");
      tail = lines.pop()!.slice(-3000);
      for (const line of lines) {
        let event: { event?: string; message?: string; requestId?: number; quiet?: boolean };
        try { event = JSON.parse(line); } catch { continue; }
        if (event.event === "attached") { clearTimeout(startup); observer.attached = true; ready(); }
        if (event.event === "error") { dispose(new Error(event.message || "Simulator damage observer failed.")); child.kill("SIGTERM"); }
        if (event.event === "settled" && typeof event.requestId === "number") {
          const wait = observer.waits.get(event.requestId);
          if (wait) { clearTimeout(wait.timer); observer.waits.delete(event.requestId); wait.resolve(event.quiet === true); }
        }
      }
    });
    child.once("error", dispose);
    child.once("close", () => dispose(new Error("Simulator damage observer stopped.")));
    return observer.ready;
  }

  waitForIdle(sessionId: string, budgetMs = 2500): Promise<boolean> | undefined {
    const observer = this.observers.get(sessionId);
    if (!observer?.attached || !observer.process.stdin?.writable) return undefined;
    const id = ++this.request;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { observer.waits.delete(id); reject(new Error("Simulator damage settling timed out.")); }, budgetMs + 1000);
      observer.waits.set(id, { resolve, reject, timer });
      observer.process.stdin!.write(`s ${id} 150 ${budgetMs}\n`);
    });
  }

  async restart(sessionId: string, deviceId: string) {
    await this.closeSession(sessionId);
    await this.start(sessionId, deviceId);
  }

  closeSession(sessionId: string): Promise<void> {
    const observer = this.observers.get(sessionId);
    if (!observer) return Promise.resolve();
    if (observer.closing) return observer.closing;
    const child = observer.process;
    return observer.closing = new Promise(resolve => {
      const forced = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 1000);
      forced.unref();
      child.once("close", () => { clearTimeout(forced); resolve(); });
      child.kill("SIGTERM");
    });
  }
  async close() { await Promise.all([...this.observers.keys()].map(id => this.closeSession(id))); }
}
