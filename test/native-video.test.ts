import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { AccessUnitReader } from "../src/video.js";
import { inspectVideoAccessUnit } from "../src/video-codec.js";

function run(command: string, args: string[]) {
  return new Promise<{ code: number | null; stdout: Buffer; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", code => resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString() }));
  });
}

test("native output honors CoreMedia framing and keeps concurrent output records intact", { skip: process.platform !== "darwin", timeout: 15_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "apple-native-video-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, "native-video-test");
  const compilation = await run("xcrun", [
    "clang", "-fobjc-arc", "-fblocks", "-O1", "-mmacosx-version-min=14.0",
    fileURLToPath(new URL("fixtures/native-video.m", import.meta.url)), "-o", executable,
    ...["Foundation", "CoreImage", "CoreVideo", "CoreMedia", "CoreGraphics", "VideoToolbox", "IOSurface", "ImageIO"].flatMap(framework => ["-framework", framework]),
  ]);
  assert.equal(compilation.code, 0, compilation.stderr);

  await t.test("native point-image conversion preserves dimensions and rejects unreadable input", async () => {
    const result = await run(executable, ["image-conversion", "4"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.length, 0);
  });

  await t.test("encoder buffers use NV12 only for native portrait HEVC", async () => {
    const result = await run(executable, ["encoder-pool", "4"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.length, 0);
  });

  await t.test("failed or uncertain releases retain cleanup until an acknowledged release", async () => {
    for (const mode of ["touch-release-failed", "touch-down-uncertain", "touch-release-retry", "touch-release-ok"]) {
      const result = await run(executable, [mode, "4"]);
      assert.equal(result.code, 0, `${mode}: ${result.stderr}`);
      const complete = result.stderr.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === "input-complete");
      assert.deepEqual(complete, { event: "input-complete", requestId: 17, success: mode === "touch-release-ok" });
    }
  });

  await t.test("damage settling finishes quietly and bounds a continuously animated screen", async () => {
    for (const [mode, quiet] of [["settle-quiet", true], ["settle-animated", false]] as const) {
      const result = await run(executable, [mode, "4"]);
      assert.equal(result.code, 0, result.stderr);
      const event = result.stderr.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === "settled");
      assert.deepEqual(event, { event: "settled", requestId: 17, quiet });
      assert.equal(result.stdout.length, 0, "settling depends on damage callbacks without an encoded idle frame");
    }
  });

  for (const width of [1, 2, 4]) {
    await t.test(`delta frames use the format's ${width}-byte NAL lengths`, async () => {
      const result = await run(executable, ["delta", String(width)]);
      assert.equal(result.code, 0, result.stderr);
      const units: Buffer[] = [];
      new AccessUnitReader().push(result.stdout, unit => { assert.equal(unit.id, 42); assert.equal(unit.capturedAtUnixMs, 123456789); units.push(Buffer.from(unit.data)); });
      assert.deepEqual(units, [Buffer.from([0, 0, 0, 1, 0x41, 0x55, 0x55, 0x55, 0x55])]);
    });
  }

  await t.test("explicit NotSync=false carries codec parameters on a keyframe", async () => {
    const result = await run(executable, ["key", "4"]);
    assert.equal(result.code, 0, result.stderr);
    const units: Buffer[] = [];
    new AccessUnitReader().push(result.stdout, unit => { assert.equal(unit.id, 42); assert.equal(unit.capturedAtUnixMs, 123456789); units.push(Buffer.from(unit.data)); });
    assert.equal(units.length, 1);
    assert.equal(units[0]![4]! & 0x1f, 7, "SPS precedes the frame");
    assert.match(result.stderr, /"event":"configuration"/);
  });

  for (const width of [1, 2, 4]) await t.test(`HEVC ${width}-byte NAL lengths carry VPS, SPS and PPS on an IRAP frame`, async () => {
    const key = await run(executable, ["hevc-key", String(width)]);
    assert.equal(key.code, 0, key.stderr);
    const units: Buffer[] = [];
    new AccessUnitReader().push(key.stdout, unit => units.push(Buffer.from(unit.data)));
    assert.equal(units.length, 1);
    assert.deepEqual(inspectVideoAccessUnit(units[0]!, "hevc"), { keyFrame: true, hasPicture: true, hasParameterSets: true, codec: "hev1.1.6.L150.B0" });
    assert.match(key.stderr, /hevc-annex-b/);
    const delta = await run(executable, ["hevc-delta", String(width)]);
    assert.equal(delta.code, 0, delta.stderr);
    const deltas: Buffer[] = [];
    new AccessUnitReader().push(delta.stdout, unit => deltas.push(Buffer.from(unit.data)));
    assert.deepEqual(deltas, [Buffer.from([0, 0, 0, 1, 2, 1, 0x55, 0x55, 0x55])]);
  });

  await t.test("a partial trailing NAL header fails before any record is emitted", async () => {
    const result = await run(executable, ["truncated", "4"]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout.length, 0);
    assert.match(result.stderr, /truncated NAL header/);
  });

  await t.test("two simultaneous callbacks cannot interleave length headers and large payloads", async () => {
    const result = await run(executable, ["concurrent", "4"]);
    assert.equal(result.code, 0, result.stderr);
    const units: Buffer[] = [];
    new AccessUnitReader().push(result.stdout, unit => { assert.equal(unit.id, 42); assert.equal(unit.capturedAtUnixMs, 123456789); units.push(Buffer.from(unit.data)); });
    assert.equal(units.length, 24);
    const counts = new Map<number, number>();
    for (const unit of units) {
      assert.equal(unit.length, 128 * 1024 + 4);
      assert.deepEqual(unit.subarray(0, 5), Buffer.from([0, 0, 0, 1, 0x41]));
      const marker = unit[5]!;
      assert.ok(marker === 0x55 || marker === 0x56);
      assert.ok(unit.subarray(5).every(byte => byte === marker));
      counts.set(marker, (counts.get(marker) ?? 0) + 1);
    }
    assert.deepEqual([...counts.values()], [12, 12]);
  });
});
