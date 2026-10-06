import test from "node:test";
import assert from "node:assert/strict";
import { fitScreenScale, stepScreenZoom } from "../src/screen-zoom.js";

test("Fit enlarges logical device points and reserves the toolbar in a tall panel", () => {
  const scale = fitScreenScale({ width: 770, height: 1200 }, { width: 402, height: 874 });
  assert.ok(scale > 1);
  assert.ok(402 * scale <= 770 - 64);
  assert.ok(874 * scale <= 1200 - 120);
});

test("Fit keeps a rotated device inside a short panel", () => {
  const scale = fitScreenScale({ width: 420, height: 490 }, { width: 874, height: 402 });
  assert.ok(scale > 0 && scale < 1);
  assert.ok(874 * scale <= 420 - 64);
  assert.ok(402 * scale <= 490 - 120);
});

test("Zoom steps from the current Fit scale without crossing the manual limits", () => {
  assert.equal(stepScreenZoom(1.23, 1), 1.48);
  assert.equal(stepScreenZoom(2.9, 1), 3);
  assert.equal(stepScreenZoom(0.3, -1), 0.25);
});
