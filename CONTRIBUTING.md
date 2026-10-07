# Contributing

Use an Apple Silicon Mac with Bun 1.4.2+ and Xcode 27. Install with `bun install --frozen-lockfile`. Keep changes focused and explain the behavior they change.

## Check a change

Run `bun run typecheck`, `bun run build` and the tests relevant to the change. Runtime, transport or dependency changes should pass the full `bun test` suite. Before a release, run `bun run pack` and `bun run verify:packages`; these check extracted archives, manifests, tool metadata, icons, the bundled skill and native signature.

Test device behavior on a disposable sample-data simulator. Observe before input, verify the returned state, restore temporary settings, disconnect your session and delete only simulators you created. Do not collect real credentials or personal screenshots in fixtures, reports or issues.

## Source boundaries

- Edit `plugins/sim-stage/plugin.json`; `scripts/sync-version.mjs` regenerates the Codex overlay and launch manifests.
- Edit the skill in `plugins/sim-stage/skills/drive-simulator/`. Keep guidance consistent with the advertised tool schemas and actual lifecycle.
- Regenerate icons with `bun run assets`. SVG masters and PNG exports are maintained assets; the review sheet belongs in ignored `artifacts/submission/`.
- Do not commit `node_modules/`, `.dev-plugin/`, native build output, archives, machine-specific captures, audit receipts or temporary plans.
- Preserve vendored licenses in `src/styles/` and `third_party/`. The build collects actual bundled dependency licenses into `dist/THIRD_PARTY_NOTICES.txt` and fails if a license is missing.

Keep public docs about installation, supported behavior and contribution. Git history retains completed plans and experiment reports. Reusable benchmarks live in `scripts/`; generated measurements belong in `artifacts/`.

## Measure performance changes

`bun run benchmark:browser -- --samples 12 --out artifacts/browser-results.json` exercises actual native input and the viewer in HTTP preview and a reference MCP AppBridge host. It creates and deletes its own simulator when no device is supplied. An explicit `--device` must be a dedicated simulator named `Sim Stage benchmark`.

Report the hardware/runtime, warm or cold state, sample count and latency distribution. Preserve correctness and provide before/after evidence before claiming a gain. A browser reference host is not proof of acceptance in ChatGPT or Codex.

## Release

Update the root version and release notes, then rebuild, test, pack and verify. Confirm that a registry version is unused or has matching immutable bytes before publishing the npm archive with `bun scripts/publish.mjs`. Do not publish a new version under existing coordinates with different bytes.

Local redeployment uses `bun run dev:plugin` and the supported `codex plugin` commands in the README. Edit the source marketplace, not the installed cache. Verify the installed version, bundled skill/assets and an actual MCP call.

Directory publication additionally needs the agreed local-MCP route, verified publisher, public policy/support pages, reviewer-accessible demo, review cases, required scans and publisher attestations. Keep local package verification separate from those checks.

Use concise conventional commit subjects such as `fix: reject stale screen targets`. Pull requests should state the change, reason and validation.
