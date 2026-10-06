# Touch release review follow-up

A failed or timed-out up/cancel retains active touch state so stop can attempt cleanup. Successful releases clear it. Uncertain down delivery keeps the existing conservative cleanup behavior.

Stacked on PR #3, `codex/perf-input-only-taps` at `ca7f74f52d2db8285db04a3d4ae44c65b4e5fa9c`. Target that experiment
branch; this change depends on the unmerged experiment and should not merge
directly to main before its dependency. Addresses [source review](https://github.com/rishirsv/simstage/pull/3#discussion_r4191412289).

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

Full cloud suite: 146 pass, 1 native skip, 0 fail. The new native fixture exercises the real touchPhase/command/stop path with stubbed HID delivery: failed release, uncertain down, successful release retry, and normal release. This Objective-C fixture is SKIPPED on Linux and has not been compiled here. macOS compilation plus `bun test test/native-video.test.ts` and real simulator fault/recovery verification are required before acceptance. Native build, signing, packaging and performance validation were not run here.
