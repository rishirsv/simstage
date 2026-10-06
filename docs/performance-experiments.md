# Sim Stage performance experiments

All eleven experiments were implemented and measured. Nine optimizations and the
age-accounting prerequisite have separate ready-for-review PRs. The 60 fps cap
was rejected because it reduced drawn cadence. No PR has been merged.

## Implementation results, October 6, 2026

| Order | Outcome and measured scope | Report | PR |
| --- | --- | --- | --- |
| 0 | Corrected server-wait accounting; controlled false recovery 1 → 0, delayed-response recovery retained. No live median speed claim. | [Video age](performance/video-age.md) | [#8](https://github.com/rishirsv/simstage/pull/8) |
| 1 | Matched cold builds: module evaluation p75 55.9 → 37.6 ms; JS 1,205,903 → 858,231 bytes. | [SDK imports](performance/sdk-import.md) | [#2](https://github.com/rishirsv/simstage/pull/2) |
| 2 | Settled helper taps: action p75 1,355.8 → 1,048.6 ms; observations 3 → 2. Bridge-only actions retain their path. | [Input-only taps](performance/input-only-taps.md) | [#3](https://github.com/rishirsv/simstage/pull/3) |
| 2a | Controlled background collision: action p75 1,141.5 → 988.6 ms; fresh quiet action observations satisfy background refreshes. | [Background captures](performance/background-captures.md) | [#4](https://github.com/rishirsv/simstage/pull/4) |
| 3 | No-viewer static action p75 2,329.5 → 1,634.2 ms, settling screenshots 2 → 0. Continuous animation correctly times out but sample p75 is 227 ms slower. | [Damage settling](performance/damage-settling.md) | [#7](https://github.com/rishirsv/simstage/pull/7) |
| 4 | Warm real-image conversion p75 21.47 → 16.54 ms; matching point dimensions. First-use conversion is slower. | [Native screenshots](performance/native-screenshots.md) | [#5](https://github.com/rishirsv/simstage/pull/5) |
| 5 | Removed 30 physical discovery processes across 30 known-simulator connections; each costs about 70 ms process CPU. Warm connection p75 improvement is only 7.72 ms. | [Simulator discovery](performance/simulator-discovery.md) | [#11](https://github.com/rishirsv/simstage/pull/11) |
| 6 | Matched real-frame replay: browser base64 CPU falls 84–90%, browser inspection 46–61%. Savings are fractions of a millisecond per frame. | [Byte decoding](performance/video-byte-decoding.md) | [#6](https://github.com/rishirsv/simstage/pull/6) |
| 7 | Sustained shrink: bytes/sec falls 18.6%, mean encode time 25.1%. One sustained restart, no rebound restart; small text is slightly softer at 1× scale. | [Stream shrink](performance/stream-shrink.md) | [#10](https://github.com/rishirsv/simstage/pull/10) |
| 8 | Native portrait HEVC NV12: capture-to-output 12.08 → 9.55 ms; helper CPU falls 23.4%, bytes do not increase. Rotation, scaling, H.264 retain BGRA. | [Native NV12](performance/native-nv12.md) | [#9](https://github.com/rishirsv/simstage/pull/9) |
| 9 | Rejected 60 fps cap: drawn cadence 57.98 → 52.07 fps; mean sample p95 draw gap 22.87 → 33.57 ms. Retain 120 fps. | Cadence evidence below | None |

The component and action gains must not be added together. Alternating action
experiments retain at least 30 samples per variant; animation behavior uses five
samples per variant. Native and resize components use repeated alternating runs,
with their smaller sample counts stated in each report.

### Capture-cap and buffer decisions

Three alternating cap pairs used genuine continuous CADisplayLink animation in
the real HTTP preview, requesting up to 120 fps. The 120 fps cap emitted a mean
249 frames per 3.5-second window; 60 emitted 182.7. Lowering the cap reduced
bytes/sec (90,344 → 78,767) but worsened capture-to-output age (5.06 → 5.71 ms)
and drawn cadence. These are Chrome rendering opportunities, not physical
scanout. The configured cap was not treated as measured source cadence.

The direct-buffer and owned-copy prototypes were retained as experiments,
without a PR. The real BGRA surface carries Display P3; an identity copy fails
its color-space guard. Timings from that fallback path cannot establish a
copy-path improvement. NV12 preserves the required color conversion and earns
the native optimization PR through total-path and CPU measurements, with
matched color/frame identity and real-image comparisons.

### Cohort and integration validation

The lab used macOS 27.0 (26A428), Xcode 27.0 (27A266a), iOS 27.0,
iPhone 18 Pro simulator, Bun 1.4.2, Chrome 154.0.8037.98, and package 0.1.3.
Original baseline source is `7edcbb6`; each PR names its independent source
change. The local `codex/perf-experiments` branch combines all accepted changes,
including the action-path conflict resolutions, for integration validation.

Typecheck, native/browser/server build, all 157 tests, packing, isolated package
smoke tests, signed arm64 helper verification, and gallery archive verification
pass together. GitHub Actions are disabled in this repository; the PRs have no
remote check runs. No external telemetry backend or field dashboard was added.
The viewer exposes bounded local phase/age/recovery aggregates through
`window.__SIM_STAGE_VIDEO_DIAGNOSTICS__()`.

The combined 30-sample journey run completed in each transport:

| Journey | Original preview | Combined preview | Original reference MCP | Combined reference MCP |
| --- | ---: | ---: | ---: | ---: |
| Pointer-to-visible change p75 | 67.4 ms | 70.8 ms | 79.6 ms | 80.1 ms |
| Agent action-to-observation p75 | 1,605.1 ms | 1,309.4 ms | 1,512.4 ms | 1,299.7 ms |
| Release-to-settled paint p75 | 2,443.2 ms | 2,477.8 ms | 2,429.4 ms | 2,445.7 ms |
| Connect-to-first paint, one trial | 30.92 s | 4.51 s | 3.01 s | 2.06 s |

The ordered journey runs establish integration behavior, not causal timing
percentages. Connection trials have different cold/warm state. The original
and combined fixtures use the same simulator model and browser version. Both
combined transports record zero stale drops and zero keyframe recovery requests;
one startup codec-chain reset per transport is expected. Mean draw age is
19.36/20.04 ms and mean rendering-opportunity age is 32.87/34.13 ms. Ages come
from the corrected local player aggregates; the retained older probe-age columns
use the full RTT bound. The repository benchmark now subtracts valid server wait
and has a separate one-sample-per-transport smoke check.

Real combined tap, double-tap, and hold checks advance markers by 1, 2, and 1,
use only fresh target validation plus the final observation, and reuse the
result for a background capture without another synthesis.

Built combined assets have SHA-256 hashes:

- JS: `e46ee457e89ed020f370d553d4b82f00130da1c5fd8f1e24a73597ff8de01192`.
- Native helper: `6e747219bdc8a43e71d9cccfc4246f469a1910e26fff3f3c9d34d9224495ed74`.

Raw samples, prototypes, benchmark programs, images, and logs remain in ignored
`artifacts/performance`. They are local reproducibility artifacts, not committed
or uploaded device inventories. The original investigation and proposed field
monitoring below remain historical evidence and follow-up work.

## Original investigation, October 5, 2026

Start with measurement accuracy, SDK bundle deduplication, and observation work on
the action path. These offer the best combination of user impact and bounded
implementation effort. No production optimizations have been applied in this
investigation.

Investigated October 5, 2026 (America/Toronto), at source revision
`d55349c491d842653b9844be72fbc221051fcad1`, using three GPT-6.1 Sol agents with
High reasoning. Measurements below are local experiments, not field results.

The [Claude performance article](https://claude.dev/blog/how-we-made-claude-ai-faster/)
suggests a useful workflow: measure a complete user journey, isolate its expensive
work, compare a prototype against the baseline, then protect a proven improvement.
Validate cheap counts against elapsed time before making them CI gates.

## Evidence collected

| Experiment | Observed result | What it establishes |
| --- | --- | --- |
| SDK import deduplication, temporary browser build | JS 1,205,088 → 857,422 bytes (28.9% smaller); gzip 302,183 → 231,028 bytes (23.5% smaller). Repeated experiment: module evaluation p75 104.9 → 69.0 ms (34.2% faster). | A source-build component win; shipped JS hash matches the baseline. Fourteen retained cold contexts per variant; mocked empty discovery. Render opportunity p75 200.7 → 171.7 ms improved, but candidate p95 worsened (278.3 → 608.6 ms); this needs isolated confirmation. Real host validation remains. |
| Native base64 decoding, Chromium | At 128 KiB: 0.324 → 0.045 ms; at 512 KiB: 1.400 → 0.128 ms. Output bytes matched. | About 86–91% less decoding CPU in this synthetic component; not an equivalent improvement in video latency. |
| Native synthetic capture, 90 frames/run, three repetitions | Full-resolution H.264 encode mean 11.37–11.61 ms; 1024-edge output 3.28–4.30 ms. HEVC 7.85–8.47 → 2.85–3.09 ms. Submit/conversion work did not consistently improve. | Resolution affects encoding, but conversion can remain costly. Scaling already exists; this does not establish a new end-to-end win. No simulator, transport, or display in this experiment. |
| Read-only device discovery, 12 samples | `simctl` p50 413 ms; `devicectl` p50 516 ms; parallel discovery p50 1,153 ms. Parallel p95 reached 12.7 s. | Discovery deserves separate tracing. Concurrent simulator boot and other experiments contaminated tail timings; these are diagnostics, not release baselines. |
| Physical-discovery caching, six alternating pairs of actual `AppleHub.status` | Baseline p50 96.93 ms → cached p50 92.51 ms; p95 107.55 → 122.84 ms. | Only 4.6% median improvement and a worse observed tail. This rejects a large warm-status speedup claim and lowers the priority of caching. |
| Synthetic screenshot conversion | 1320×2868 PNG to point-size JPEG through `sips`: p50 155 ms, p95 309 ms. Full PNG read p50 2.67 ms. | Compression is a more promising target than saving a file read. Synthetic pixels and contended host; real screenshots still need measurement. |
| Real browser journey diagnostic retry | Preview connect 26.27 s (24.97 s in `device_connect`); MCP reference-host connect 4.84 s (4.08 s in `device_connect`). Pointer response 109.6/66.8 ms; agent observation 1.90/1.95 s. | One sample per mode after an earlier run timed out waiting for video. The connection outlier is in the backend, not JS evaluation. No population percentile or regression claim is justified. |

The final six-sample journey run completed after the other experiments finished:

| Journey | HTTP preview | Reference SDK MCP host |
| --- | ---: | ---: |
| Pointer-to-visible change, sample p75 | 86.4 ms | 85.0 ms |
| Agent-action-to-observation, sample p75 | 3.716 s | 2.372 s |
| Gesture release-to-settled paint opportunity, sample p75 | 2.355 s | 2.164 s |
| Connect-to-first paint opportunity, single trial | 36.156 s | 4.584 s |

These are descriptive lab observations, not established field percentiles. Six
samples make p95 equal to the maximum. The connection trials were ordered cold
then warm, so they cannot isolate transport cost. `device_connect` consumed
34.329 s and 3.765 s respectively. Automatic viewer captures took 0.41–3.12 s
and may have queued ahead of agent actions; instrument queue wait to establish
that contribution. The output is
[`journeys.json`](../artifacts/performance/ui/journeys.json).

Raw local artifacts and reproduction programs are in
[`artifacts/performance`](../artifacts/performance/). That directory is ignored by
Git. Keep it with this checkout to reproduce the investigation.

## Prioritized experiments

Expected gains below are hypotheses unless the row explicitly cites a measured
prototype. They apply to the named component or journey and must not be added
together. Effort estimates mean implementation plus focused validation.

| Order | Actionable experiment | Expected improvement | Evidence and acceptance criterion | Effort |
| --- | --- | --- | --- | --- |
| 0 | Validate MCP age accounting and establish comparable journey baselines. Separate server long-poll wait from response delivery; retain a conservative transit bound. Wire the player's milestone callback into local aggregates. | Measurement accuracy first. A 250 ms pre-capture wait adds 250 ms to the conservative age bound; eliminating false recoveries may save hundreds of ms in affected cases. No live occurrence or median gain established. | [`videoTransport`](../src/viewer-controller.ts) adds the entire read RTT to server age; [`serve`](../src/video.ts) computes age when responding. Test a fresh frame after long wait and a truly delayed response independently. Count resets and keyframe requests; preserve the 500 ms stale-frame policy. | Small–medium |
| 1 | Replace the `app-with-deps` styles import with the main SDK export, as in the temporary build. | **Measured:** 28.9% less JS, 35.9 ms less p75 module evaluation. Hypothesis: 30–60 ms less local viewer startup. | [`viewer-controller.ts`](../src/viewer-controller.ts) imports the bundled SDK while also importing the main SDK. Validate styles, host initialization, and connect flow in preview and embedded MCP. Keep if real startup improves without visual or protocol regressions. | Small |
| 2 | Avoid the discarded immediate observation on settled actions. Send input through an input-only path where supported, settle, then obtain one final AX/screenshot observation. | Hypothesis: **200–600 ms less per settled action**, about 5–25% against the measured 2.37–3.72 s sample p75 range. | [`AppleHub.action`](../src/apple.ts) synthesizes an observation immediately and again after settling. Trace each boundary call first. Preserve fresh target validation, stale-ref rejection, and the final snapshot. Keep if at least one observation is removed and action p75 falls materially; verify coordinate, ref, text, and launch actions. | Medium; depends on bridge capabilities |
| 2a | Measure and coalesce background viewer captures so they do not unnecessarily queue ahead of explicit agent actions. Reuse a fresh action observation when it satisfies the viewer refresh. | Hypothesis: **0.4–3.1 s less action queue wait in affected collisions**; expected gain is zero without a collision. This is based on measured capture RPC durations, not measured queue attribution. | [`scheduleVideoObservation`](../src/viewer-controller.ts) schedules an AX capture after gestures and every five seconds; [`AppleHub`](../src/apple.ts) serializes captures/actions per session. Record queue wait first, then compare background-refresh policies while preserving inspector freshness and ref validation. | Medium |
| 3 | Use damage-based settling for agent actions without a viewer, through a lightweight observer independent of video encoding. | Hypothesis: **50–80% fewer screenshot subprocesses** on animated paths; **100–500 ms less settling overhead** where polling dominates. The quiet window still costs at least 150 ms. | [`waitForIdle`](../src/apple.ts) repeatedly captures and compares screenshots without a sampling pause; native settling is used only with an active channel. Benchmark no-viewer, active-viewer, static, long-animation, and continuous-animation cases. Preserve the deadline and distinguish quiet from timed out. | Medium |
| 4 | Replace `sips` point-image conversion with an in-process/native conversion path for screenshot-heavy agent workflows. | Hypothesis: **30–60 ms less per point-size screenshot** (20–40% of the synthetic 155 ms conversion median). Real-image latency and quality remain unmeasured. | [`pointImage` and `captureResult`](../src/apple.ts) convert default agent screenshots. Compare dimensions, tap-coordinate agreement, image quality, process count, and action latency. Live viewer requests full PNG and skips this conversion, so this gain does not apply there. | Medium |
| 5 | Remove physical-device discovery from a known simulator's connect critical path; share in-flight discovery before considering caching. | **Measured cache prototype:** only 4.4 ms lower warm status median, with worse tail. Hypothesis: **100–500 ms lower connection time only when physical discovery stalls**; no large warm-host gain established. | [`deviceList` and `startSession`](../src/apple.ts) wait for both device classes. Trace selected-device lookup and cold discovery first. Revalidate the simulator, invalidate on create/delete, and retain physical-device behavior. Keep only if target-host connection data supports the change. | Small–medium |
| 6 | Decode base64 with `Uint8Array.fromBase64` where available, and benchmark a byte-search Annex B parser separately. | **Measured replay components:** base64 83–90% faster, saving 0.012–0.167 ms on captured 5–71 KiB frames; server Annex B inspection 77–92% faster, saving 0.009–0.166 ms/frame; browser inspection 44–61% faster. Synthetic 512 KiB base64 saves 1.27 ms. No whole-journey percentage claimed. | [`decodeBase64`](../src/viewer-controller.ts) uses a JS copy loop; [`inspectVideoAccessUnit`](../src/video-codec.ts) scans payloads byte by byte. Replay matched output across all ten captured frames, but add parser boundary/error cases and verify actual host support before production changes. | Small |
| 7 | Allow resolution to shrink after a sustained panel-size reduction, with hysteresis to avoid reconnect churn. | **Geometric bound:** a 25–50% smaller long edge yields 44–75% fewer output pixels. Synthetic HEVC encoding fell about 65% for full resolution → 1024-edge, but total CPU/latency gains are unproven. | [`videoSizeFloor` and the resize callback](../src/viewer-controller.ts) retain the larger stream size and only grow it. Try a 25% shrink held for 500 ms; compare encode time, bytes, reconnects, text clarity, and frame age across resize/rotation sequences. | Small–medium |
| 8 | Profile Core Image conversion, then test direct pixel-buffer submission for unrotated, unscaled frames or a cheaper encoder-compatible pixel format. | Hypothesis: **2–6 ms less native work per full-resolution frame**, if conversion is the bottleneck. | [`encodeLatestFrame`](../native/SimulatorStream.m) always renders to an owned buffer before encode timing begins. Retain buffers until completion; validate colors, rotation, dimensions, and encoder compatibility. Keep only if capture-to-output and total CPU improve at equal quality. | Medium–large |
| 9 | Align the native capture cap with measured source and presentation cadence. Compare explicit 60 versus 120 fps under genuine high-rate damage. | **Conditional upper bound:** up to 50% fewer encode submissions and associated work when 120 fps is currently encoded for 60 Hz presentation. At 60 Hz source, expected benefit is zero. | Native default is 120 fps; [`VIDEO_FPS`](../src/video.ts) advertises 60 and helper launch does not pass `--max-fps`. Measure actual emitted and drawn cadence before changing the default. Preserve gesture smoothness; do not infer 120 fps from configured caps. | Small experiment |

Order 0 is a measurement prerequisite, not a claim that telemetry itself makes
the plugin faster. Implement order 1 first for a low-complexity measured win;
trace orders 2–5 next because they target larger user waits.

Keep these findings lower priority: removing screenshots from live viewer action
responses may save bytes and serialization, but full-resolution viewer images do
not incur point-image `sips` work. Ordinary AX parsing was under 1 ms median on a
Settings fixture, so optimize it only if larger real trees appear in profiles.
An NV12 pool prototype lowered VideoToolbox-only encode time by 14–23%, but added
0.43–0.80 ms to render/submit and about 9% more bytes; no total-path win was proven.
Do not select a pixel-format change based on encode timing alone.

## Telemetry and deploy follow-up

The repo has useful building blocks but no continuous performance monitoring:
the browser benchmark measures changed pixels and paint opportunities; frames
carry IDs and capture timestamps; the player exposes receive/decode/draw/present
milestones. The viewer does not pass a milestone callback. Native configuration
and encode statistics are not retained by `NativeVideo.diagnostic`, which only
handles input and settling. CI runs build, tests, and packaging without a
performance job. No external telemetry backend or observability dashboard is
configured in the reviewed code.

Use four dashboard groups when instrumentation is added:

1. **Journeys:** open-to-device-list, connect-to-first-draw, pointer-to-visible
   change, and agent-action-to-fresh-observation; p50/p75/p95, sample counts, and
   failure rates. Report gesture release-to-settled separately from full gesture
   duration, since intended momentum is not processing overhead.
2. **Video:** native conversion/encode/output time, read wait versus delivery,
   decoder depth, frame age, stale drops, recovery requests, drawn cadence,
   bytes/sec, and idle CPU. Treat `present` as a rendering opportunity, not
   physical scanout. `device_input` acknowledgment means enqueued input, not
   confirmed HID delivery.
3. **Actions:** queue wait, target validation, input, settling, AX snapshot,
   screenshot conversion, and response serialization; count observations and
   subprocesses per action. Record whether settling actually became quiet.
4. **Releases:** commit, package version and bundle hashes, browser/macOS/runtime,
   transport, codec, output dimensions, device class, cold/warm state, and
   accessibility/screenshot settings. Compare identical cohorts across releases.

Run experiments serially after the parallel investigation to reduce contention.
Use alternating baseline/candidate order, at least 30 action samples, and repeated
independent connection trials. Rebuild and hash both candidates; label reference
SDK-host results separately from the real Codex host. The current browser harness
has only one connection sample per mode, so its connection p75/p95 labels are not
population percentile estimates.

Retain counts such as observations/action, duplicate SDK bytes, recovery requests,
and subprocesses/action alongside elapsed time. Add deterministic CI ceilings
only after showing they track a user-visible improvement. Publish timing reports
without gating on noisy wall-clock values initially. After a release, compare
matched pre/post cohorts and investigate sustained regressions larger than both
10% and 20 ms as an initial alert proposal; adjust after learning baseline noise.
Field monitoring and dashboards remain proposed work, not active services.

The browser benchmark itself also adds work: its eight `getImageData` probes per
draw increased synthetic 512×1152 canvas draw-plus-probe p75 from 0.2 to 3.5 ms.
Use the smallest marker readback that reliably detects the causal response, and
compare instrumented versus uninstrumented CPU before interpreting frame budgets.
Keep physical display validation separate from this headless paint-opportunity
measurement.
