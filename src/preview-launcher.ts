import { realpath, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Server } from "node:http";
import { AppleHub } from "./apple.js";
import { DATA_META_KEY, type Hub } from "./mcp.js";
import { startPreview } from "./preview.js";
import { SessionRegistry, type PreviewRecord } from "./session-registry.js";
import { version } from "./version.js";
import type { HubState } from "./shared.js";

export interface PreviewOptions { workspacePath: string; deviceId?: string; label?: string; port?: number }
export interface PreviewHandle { record: PreviewRecord; reused: boolean; close(): Promise<void> }

const closeServer = async (server: Server) => {
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
};

/** Reuse only a live server that proves its identity, workspace and version. */
async function verifiedPreview(record: PreviewRecord): Promise<boolean> {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(record.url)) return false;
  try {
    const response = await fetch(`${record.url}/api/instance`, { signal: AbortSignal.timeout(2000), redirect: "error" });
    if (!response.ok) return false;
    const current = await response.json() as PreviewRecord;
    return current.instance.id === record.instance.id && current.workspacePath === record.workspacePath && current.version === version && current.pid === record.pid && current.url === record.url;
  } catch { return false; }
}

export async function launchWorkspacePreview(options: PreviewOptions, assetRoot: URL, dependencies: {
  registry?: SessionRegistry;
  hub?: (registry: SessionRegistry) => Hub;
} = {}): Promise<PreviewHandle> {
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535)) throw new Error("Preview port must be an integer between 0 and 65535.");
  const workspacePath = await realpath(options.workspacePath);
  if (!(await stat(workspacePath)).isDirectory()) throw new Error("Workspace must be a directory.");
  const label = options.label?.trim() || `${basename(workspacePath)} (${basename(dirname(workspacePath))})`;
  if (label.length > 100 || /[\r\n\x00-\x1f]/.test(label)) throw new Error("Workspace label must be at most 100 characters on one line.");
  const registry = dependencies.registry ?? new SessionRegistry(undefined, undefined, { label, workspacePath });
  return registry.workspace(workspacePath, async () => {
    const previous = await registry.preview(workspacePath);
    if (previous && await verifiedPreview(previous)) {
      if (options.deviceId) {
        const response = await fetch(`${previous.url}/api/tool`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "sim_stage_status", arguments: {} }), signal: AbortSignal.timeout(10_000), redirect: "error",
        });
        const result = await response.json() as { isError?: boolean; _meta?: Record<string, unknown> };
        const state = result._meta?.[DATA_META_KEY] as HubState | undefined;
        if (!response.ok || result.isError || !state?.sessions.some(session => session.device.id === options.deviceId) || state.focus?.deviceId !== options.deviceId) {
          throw new Error("This workspace already has a preview on another device. Select the device in that viewer, or use its current URL without --device.");
        }
      }
      return { record: previous, reused: true, async close() {} };
    }
    const hub = dependencies.hub?.(registry) ?? new AppleHub({ registry });
    let server: Server | undefined;
    try {
      if (options.deviceId) await hub.connect(options.deviceId);
      const identity = { workspacePath, instance: registry.instance, pid: process.pid, version };
      server = await startPreview(hub, assetRoot, { port: options.port, record: identity });
      const address = server.address() as { port: number };
      const record = { ...identity, url: `http://127.0.0.1:${address.port}` };
      await registry.savePreview(record);
      let closing: Promise<void> | undefined;
      return { record, reused: false, close() {
        return closing ??= (async () => {
          try { await hub.close(); }
          finally {
            try { await closeServer(server!); }
            finally { await registry.removePreview(workspacePath, record.instance.id); }
          }
        })();
      } };
    } catch (error) {
      try { if (server) await closeServer(server); }
      finally { await hub.close(); }
      throw error;
    }
  });
}
