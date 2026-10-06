import assert from "node:assert/strict";
import test from "node:test";
import { deliveryBoundMs, VideoMetrics } from "../src/video-metrics.js";
import { VIDEO_MAX_FRAME_AGE_MS } from "../src/shared.js";

test("a fresh frame after long polling retains delivery delay and the 500ms stale policy", () => {
  assert.equal(10 + deliveryBoundMs(270, 250), 30);
  assert.ok(10 + deliveryBoundMs(800, 250) > VIDEO_MAX_FRAME_AGE_MS);
  for (const wait of [undefined, -1, Infinity, NaN, "250", 801]) assert.equal(deliveryBoundMs(800, wait), 800);
});
test("local milestones retain counts and ages without retaining frames", () => {
  const metrics = new VideoMetrics();
  for (const ageMs of [20, 40]) metrics.record({ phase: "draw", id: 1, capturedAtUnixMs: 0, at: 0, ageMs });
  assert.deepEqual(metrics.snapshot(), { draw: { count: 2, meanAgeMs: 30, maxAgeMs: 40 } });
});
