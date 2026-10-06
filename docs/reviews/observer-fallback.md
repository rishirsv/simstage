# Observer fallback review follow-up

Optional settling failures after delivered input use screenshot settling before a fresh final observation. Input is never replayed. The fallback also covers a rejecting active-video settling promise.

Stacked on PR #7, `codex/perf-damage-settling` at `78a86d0fef40fbda63850efbc5d18e38050cdb3f`. Target that experiment
branch; this change depends on the unmerged experiment and should not merge
directly to main before its dependency. Addresses [source review](https://github.com/rishirsv/simstage/pull/7#discussion_r4191557211).

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

All 61 Apple checks pass. Three new observer-exit/error/timeout cases fail on the original source and pass with the fix. Full suite: 149 pass, 1 native skip, 0 fail. An unmodified `bun run build` was attempted and failed at native compilation because Linux has no `xcrun`. macOS must verify helper exit/timeout after delivered input and final observation freshness.
