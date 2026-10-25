import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionRegistry } from "../src/session-registry.js";

const crashedPid = 999_999;

test("the last live holder ends a shared session, crashed holders are pruned, and foreign sessions are never ended", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sim-stage-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const mine = new SessionRegistry(directory);
  const other = new SessionRegistry(directory, process.ppid);
  await mine.hold({ key: "K", deviceId: "d", deviceName: "D" }, "s1");
  await other.hold({ key: "K", deviceId: "d", deviceName: "D" }, "s2");
  await new SessionRegistry(directory, crashedPid).hold({ key: "Gone", deviceId: "e", deviceName: "E" }, "s3");
  assert.deepEqual((await mine.elsewhere()).map(session => [session.key, session.holders.map(holder => holder.sessionId)]), [["K", ["s2"]]]);
  assert.deepEqual((await mine.find("Gone"))?.holders, [], "a crashed server is recoverable without being treated as an unknown live session");
  assert.deepEqual(await mine.release("K", "s1"), { known: true, last: false, foreign: false });
  assert.deepEqual(await other.release("K", "s2"), { known: true, last: true, foreign: false });
  assert.equal(await mine.find("K"), undefined);
  await mine.hold({ key: "F", deviceId: "d", deviceName: "D", foreign: true }, "s1");
  assert.deepEqual(await mine.release("F", "s1"), { known: true, last: true, foreign: true });
  assert.equal((await stat(join(directory, "sessions.json"))).mode & 0o777, 0o600);
});

test("concurrent servers serialize their updates and share created simulators", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sim-stage-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const servers = Array.from({ length: 8 }, () => new SessionRegistry(directory));
  await Promise.all(servers.map((server, index) => server.hold({ key: "K", deviceId: "d", deviceName: "D" }, `s${index}`)));
  assert.equal((await servers[0]!.find("K"))?.holders.length, 8);
  await Promise.all([servers[2]!.markCreated("x"), servers[3]!.markCreated("y")]);
  assert.deepEqual((await servers[4]!.createdDevices()).sort(), ["x", "y"]);
  await servers[5]!.forgetCreated("x");
  assert.deepEqual(await servers[6]!.createdDevices(), ["y"]);
});


test("live lifecycle lock owners keep exclusion regardless of age; dead owners are recovered", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sim-stage-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = new SessionRegistry(directory);
  const second = new SessionRegistry(directory);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const holding = first.lifecycle("d", async () => { entered(); await gate; });
  await started;
  const lock = (await readdir(directory)).find(name => name.startsWith("device-"))!;
  const ownerToken = (await readdir(join(directory, lock)))[0]!;
  const owner = JSON.parse(await readFile(join(directory, lock, ownerToken), "utf8")) as { pid: number; boot: string };
  await utimes(join(directory, lock), new Date(0), new Date(0));
  let joined = false;
  const joining = second.lifecycle("d", async () => { joined = true; });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(joined, false, "a slow live owner is never stolen");
  release();
  await Promise.all([holding, joining]);
  await mkdir(join(directory, lock));
  await writeFile(join(directory, lock, randomUUID()), JSON.stringify({ pid: crashedPid, boot: owner.boot }));
  await second.lifecycle("d", async () => { await second.markCreated("recovered"); });
  assert.deepEqual(await first.createdDevices(), ["recovered"]);
  assert.deepEqual(await first.release("missing", "s"), { known: false, last: false, foreign: false });
});


test("previous-boot locks and holders are reclaimed even when their PID is currently live", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sim-stage-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SessionRegistry(directory);
  const boot = randomUUID();
  const lock = join(directory, "sessions.lock");
  await mkdir(lock);
  await writeFile(join(lock, randomUUID()), JSON.stringify({ pid: process.pid, boot }));
  await writeFile(join(directory, "sessions.json"), JSON.stringify({ boot, sessions: { K: { key: "K", deviceId: "d", deviceName: "D", holders: [{ pid: process.pid, sessionId: "previous", since: "yesterday" }] } }, created: ["kept"], focus: { deviceId: "d", deviceName: "D", pid: process.pid, at: "yesterday" } }));
  await registry.markCreated("new");
  assert.deepEqual(await registry.createdDevices(), ["kept", "new"]);
  assert.equal(await registry.find("K"), undefined);
  const saved = JSON.parse(await readFile(join(directory, "sessions.json"), "utf8")) as { boot: string };
  assert.notEqual(saved.boot, boot);
});

test("cleanup ownership refuses another creator and active holders; abandoned and legacy devices require explicit claim", async t => {
  const directory = await mkdtemp(join(tmpdir(), "sim-stage-ownership-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const mine = new SessionRegistry(directory);
  const other = new SessionRegistry(directory);
  await mine.markCreated("owned");
  await assert.rejects(other.requireDeletionOwner("owned"), /does not own/);
  await assert.rejects(other.claimCreated("owned"), /creating instance is still running/);
  await mine.requireDeletionOwner("owned");
  await other.hold({ key: "K", deviceId: "owned", deviceName: "D" }, "s2");
  await assert.rejects(mine.requireDeletionOwner("owned"), /Another instance or tool/);
  await other.release("K", "s2");
  await mine.requireDeletionOwner("owned");
  await new SessionRegistry(directory, crashedPid).markCreated("abandoned");
  await assert.rejects(mine.requireDeletionOwner("abandoned"), /does not own/);
  await mine.claimCreated("abandoned");
  await mine.requireDeletionOwner("abandoned");
  await assert.rejects(mine.claimCreated("personal-device"), /previously created/);
  const file = join(directory, "sessions.json");
  const state = JSON.parse(await readFile(file, "utf8"));
  state.created.push("legacy");
  await writeFile(file, JSON.stringify(state));
  await assert.rejects(mine.requireDeletionOwner("legacy"), /does not own/);
  await mine.claimCreated("legacy");
  assert.equal((await mine.creationOwnership()).legacy?.owned, true);
});

test("corrupt registry data never grants a new holder or cleanup ownership", async t => {
  const directory = await mkdtemp(join(tmpdir(), "sim-stage-corrupt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SessionRegistry(directory);
  const file = join(directory, "sessions.json");
  await writeFile(file, "broken JSON");
  await assert.rejects(registry.markCreated("x"), /JSON/);
  await assert.rejects(registry.claimCreated("x"), /JSON/);
  await assert.rejects(registry.hold({ key: "K", deviceId: "x", deviceName: "D" }, "s"), /JSON/);
  assert.equal(await readFile(file, "utf8"), "broken JSON");
});
