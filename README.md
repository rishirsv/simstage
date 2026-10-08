# Sim Stage

View and control an Apple simulator beside a Codex chat. You and the agent use the same screen; the agent reads accessibility elements, acts on current targets and checks the result.

[Website](https://simstage.swellapp.app) · [Support](https://github.com/rishirsv/simstage/issues)

![Sim Stage beside a Codex chat](sites/assets/hero.png)

## Requirements

- Apple Silicon Mac, Bun 1.4.2 or later, Xcode 27 and an installed simulator runtime.
- Xcode open with **Settings → Intelligence → Model Context Protocol** enabled.
- A desktop host with local stdio MCP and MCP Apps support. Installation is unavailable on web and mobile.

Physical-device interaction requires pairing and Apple eligibility and remains unverified in this release. Live video is simulator-only. Simulator video uses hardware HEVC with H.264 fallback. The native helper targets macOS 14 or later; development checks run on macOS 27 and Xcode 27.

## Install

```sh
git clone https://github.com/rishirsv/simstage.git
cd simstage
bun install --frozen-lockfile
bun run dev:plugin
codex plugin marketplace add "$PWD/.dev-plugin" --json
codex plugin add sim-stage@sim-stage-dev --json
```

Start a new Codex chat and ask: "Open Sim Stage and show my available simulators." To update, rebuild and repeat the last two commands. This source installation uses the checkout's runtime and does not require the unpublished npm package.

Use current accessibility refs for input and request `screenshot: "always"` for visual checks. The [simulator skill](plugins/sim-stage/skills/drive-simulator/SKILL.md) covers selection, snapshots, settings and cleanup. Sim Stage does not build apps or generate SwiftUI previews.

Use development apps and sample data. Screens, element text and tool arguments can reach the assistant. Secure-field text is redacted and secure typing is blocked; screenshot and video pixels are not redacted. Restore temporary settings and disconnect when finished.

## Development

```sh
bun run typecheck
bun run build
bun test
bun run pack
bun run verify:packages
```

The ZIP and npm archive are written to `release/` and verified from isolated extraction directories. Native signing is ad-hoc, without Developer ID notarization. Edit `plugins/sim-stage/plugin.json`, then run `bun scripts/sync-version.mjs` to regenerate its Codex overlay. Keep generated builds, recordings and measurements out of Git.

For another local MCP client, build and run `bun packages/sim-stage-mcp/dist/server.js`; the root `.mcp.json` declares this command. `bun run preview` prints a loopback browser URL.

Source lives in `src/`, the native helper in `native/`, plugin metadata and assets in `plugins/sim-stage/`, and the Sites website in `sites/`.

[Privacy](PRIVACY.md) · [Terms](TERMS.md) · [Security](SECURITY.md)

MIT; see [LICENSE](LICENSE). Derived from [Max Weinbach's Apple simulator plugin](https://github.com/mweinbach/AppleSimChatGPTPlugin), with attribution in [NOTICE](NOTICE). Bundled dependency notices ship with the runtime. Maintained by Rishi Sharma; independent of Apple and OpenAI.
