# Stream resize review follow-up

Stream sizing fits the device aspect ratio to the stage-derived CSS maximum dimensions instead of relying on a downsized canvas rectangle. Sustained regrowth is detected by the resize observer. Both shrink and frame-driven growth wait for pointer release, the in-flight input request, and the queued input batch.

Stacked on PR #10, `codex/perf-stream-shrink` at `2bb8bb00ee98a798b3fdccb74fa60d805a45d17d`. Target that experiment
branch; this change depends on the unmerged experiment and should not merge
directly to main before its dependency. Addresses [source review](https://github.com/rishirsv/simstage/pull/10#discussion_r4191631558). Also addresses [queued input review](https://github.com/rishirsv/simstage/pull/10#discussion_r4191631562).

## Cloud validation

Validated on Linux with Bun 1.4.2. `bun run typecheck` passes. The full fixture
suite uses `bun test --preload ./test/fixtures/cloud-boot.mjs`; that explicit
preload replaces only the macOS boot-UUID query with a fixed fixture UUID.
It does not emulate CoreSimulator, Xcode, HID delivery, or native encoding.

Before the suite, generated the real JS/CSS assets using a temporary copy of
`scripts/build.mjs` with only `await import("./build-native.mjs");` omitted.
The unmodified build requires macOS `xcrun` and `codesign`. To reproduce the
cloud assets without changing the build script:

```sh
python3 - <<'BUILD'
from pathlib import Path
source = Path("scripts/build.mjs").read_text()
Path("scripts/.cloud-build.mjs").write_text(source.replace('await import("./build-native.mjs");', ''))
BUILD
bun scripts/.cloud-build.mjs
rm scripts/.cloud-build.mjs
bun run typecheck
bun test --preload ./test/fixtures/cloud-boot.mjs
```

The initial suite lacked generated `dist/app.js` and failed the MCP discovery
resource test. Building the real browser assets resolved it. No dummy bundle or
native binary was supplied. The unmodified native build and package verification
are not accepted by these fixture checks. Real simulator and performance
acceptance remain required; no new timing or speedup claim is made.

## Results and remaining gates

All 14 viewer checks pass. Two new immediate/delayed-input cases fail on the original source and pass with the fix. Full suite: 147 pass, 1 native skip, 0 fail. `node test/fixtures/resize-layout.mjs` passes against actual production measurement code and CSS in Chromium at 1x DPR: required long edge 960 -> 576 -> 960 with canvas intrinsic dimensions fixed at 256x576; landscape is width-limited to 640. This browser fixture exposes the private measurement function only in its temporary test bundle and mocks empty discovery. Real simulator resize/rotation, gesture delivery, visual sharpness and performance remain acceptance gates. Native build and packaging were not run here.
