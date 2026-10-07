# Discovery freshness review follow-up

Creating a simulator invalidates pending discovery. Query identity prevents an older completion from overwriting fresh known IDs or clearing a newer in-flight query. Original status callers may still receive their original pre-create snapshot.

Stacked on PR #11, `codex/perf-simulator-discovery` at `11e9905bf569d5393597eae96569e7240f16053c`. Target that experiment
branch; this change depends on the unmerged experiment and should not merge
directly to main before its dependency. Addresses [source review](https://github.com/rishirsv/simstage/pull/11#discussion_r4191641796).

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

All 61 Apple checks pass. Two new concurrency cases cover both completion orders and sharing the fresh query; they time out on the original source and pass with the fix. Full suite: 148 pass, 1 native skip, 0 fail. macOS must verify overlapping real simctl status/create calls, clone behavior, and registry-created ownership. Native build, packaging and simulator acceptance were not run here.
