import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, rm, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchWorkspacePreview, type PreviewHandle } from "../src/preview-launcher.js";
import { SessionRegistry } from "../src/session-registry.js";
import { serverOptions } from "../src/cli.js";
import type { Hub } from "../src/mcp.js";
import type { Session } from "../src/shared.js";

async function fixture(t: TestContext) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "sim-stage-preview-test-")));
  const workspace = join(directory, "workspace");
  const otherWorkspace = join(directory, "other");
  const assets = join(directory, "assets");
  for (const path of [workspace, otherWorkspace, assets]) await mkdir(path);
  await writeFile(join(assets, "app.js"), "/* test viewer */");
  await writeFile(join(assets, "app.css"), "/* test styles */");
  const handles: PreviewHandle[] = [];
  t.after(async () => { await Promise.all(handles.map(handle => handle.close())); await rm(directory, { recursive: true, force: true }); });
  let starts = 0, closes = 0;
  const registry = (path = workspace) => new SessionRegistry(join(directory, "registry"), process.pid, { label: path === workspace ? "A" : "B", workspacePath: path });
  const hub = (registry: SessionRegistry): Hub => {
    starts++;
    let selected: Session | undefined;
    const unsupported = async (): Promise<never> => { throw new Error("Unexpected device operation"); };
    return {
      async status() { return { devices: selected ? [selected.device] : [], sessions: selected ? [selected] : [], warnings: [], instance: registry.instance, ...(selected ? { focus: { deviceId: selected.device.id, deviceName: selected.device.name, at: new Date().toISOString() } } : {}) }; },
      async connect(deviceId) {
        if (deviceId === "fail") throw new Error("Connection failed");
        selected = { id: "16764887-9da3-43ed-85d4-a372838d5a70", device: { id: deviceId, name: deviceId, kind: "simulator", platform: "iOS", runtime: "iOS 27", state: "Booted", available: true }, accessibilityEnabled: false };
        return { ...selected, origin: "new", observation: { session: selected, capturedAt: new Date().toISOString(), coordinateSpace: { width: 440, height: 956 } } };
      },
      capture: unsupported, frame: unsupported, stream: unsupported, streamRead: unsupported, streamStop: unsupported,
      input: unsupported, action: unsupported, settings: unsupported, disconnect: unsupported, createSimulator: unsupported,
      deleteSimulator: unsupported, claimSimulator: unsupported, async close() { closes++; },
    };
  };
  const launch = async (path = workspace, deviceId?: string, sharedRegistry = registry(path)) => {
    const handle = await launchWorkspacePreview({ workspacePath: path, deviceId, port: 0 }, pathToFileURL(`${assets}/`), { registry: sharedRegistry, hub });
    handles.push(handle);
    return handle;
  };
  return { directory, workspace, otherWorkspace, registry, launch, handles, get starts() { return starts; }, get closes() { return closes; } };
}

test("concurrent workspaces get distinct ports; concurrent launches of one workspace reuse its verified server", async t => {
  const f = await fixture(t);
  const [a, b, again] = await Promise.all([f.launch(f.workspace, "a"), f.launch(f.otherWorkspace, "b"), f.launch(f.workspace, "a")]);
  assert.notEqual(a.record.url, b.record.url);
  assert.equal(a.record.url, again.record.url);
  assert.equal([a, again].filter(handle => handle.reused).length, 1);
  assert.equal(f.starts, 2);
  const response = await fetch(a.record.url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /__SIM_STAGE_PREVIEW__/);
  const info = await (await fetch(`${b.record.url}/api/instance`)).json() as { instance: { label: string } };
  assert.equal(info.instance.label, "B");
  await [a, again].find(handle => handle.reused)!.close();
  assert.equal(f.closes, 0, "a caller reusing a preview never stops its owning process");
  await assert.rejects(f.launch(f.workspace, "b"), /another device/);
  assert.equal(f.starts, 2);
});

test("canonical workspace paths reuse previews and a dead or mismatched record cannot redirect to another workspace", async t => {
  const f = await fixture(t);
  const a = await f.launch();
  const alias = join(f.directory, "alias");
  await symlink(f.workspace, alias);
  assert.equal((await f.launch(alias)).record.url, a.record.url);
  const registry = f.registry(f.otherWorkspace);
  await registry.savePreview({ ...a.record, workspacePath: f.otherWorkspace });
  const b = await f.launch(f.otherWorkspace);
  assert.equal(b.reused, false, "a live PID and port do not establish identity");
  assert.notEqual(b.record.url, a.record.url);
  await a.close();
  assert.equal((await registry.preview(f.otherWorkspace))?.instance.id, b.record.instance.id);
});

test("preview endpoints enforce loopback Host and Origin and failed starts leave no registered preview", async t => {
  const f = await fixture(t);
  await assert.rejects(f.launch(f.workspace, "fail"), /Connection failed/);
  assert.equal(f.closes, 1);
  assert.equal(await f.registry().preview(f.workspace), undefined);
  const a = await f.launch();
  for (const headers of [{ Origin: "https://example.com" }, { Host: "example.com" }] as Record<string, string>[]) {
    assert.equal((await fetch(`${a.record.url}/api/instance`, { headers })).status, 403);
    assert.equal((await fetch(`${a.record.url}/api/tool`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: '{"name":"simulator_delete","arguments":{"deviceId":"anything"}}' })).status, 403);
  }
});

test("CLI requires explicit workspace context and validates ports before launching anything", () => {
  assert.deepEqual(serverOptions(["--preview", "--workspace", "/project", "--device", "udid", "--port", "0"], {}), { preview: true, workspacePath: "/project", deviceId: "udid", label: undefined, port: 0 });
  for (const args of [["--workspace", "/project"], ["--preview", "--device", "udid"], ["--preview", "--port", "-1"], ["--preview", "--port", "65536"], ["--preview", "--port", "NaN"], ["--unknown"]]) assert.throws(() => serverOptions(args, {}));
});
