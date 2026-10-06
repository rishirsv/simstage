# SimStage roadmap

Status: private staging, 2026-10-06. Read [audit](../docs/audit/READINESS.md) and
[migration boundary](../docs/audit/MIGRATION.md) for evidence and scope.
No public release, submission, merge, installation replacement or auth change
is authorized by this roadmap. Priorities below are sequencing, not forecasts.

## P0 — establish a distributable, reproducible product

1. **Rights and publisher.** Confirm ownership/permission for UNLICENSED upstream
   and local changes. Select verified individual/business identity; retain
   attribution. Acceptance: documented rights decision, approved license/terms
   and matching publisher metadata. Owner/legal input required; no invented terms.
2. **Review route.** Confirm local stdio/native helper support with OpenAI and
   required signing/hardware/host targeting. Directory differs from community
   marketplace. Acceptance: supported route plus reviewer setup that does not
   need creator personal accounts, network, MFA or devices. Stop if route cannot
   support this architecture; don't turn it into a remote device-control service
   merely to meet a generic HTTPS endpoint requirement.
3. **Independent installation.** Allocate authorized immutable version/package
   coordinates, then prove Git and ZIP installs load the same intended runtime.
   Current Git config still fetches upstream npm 0.1.3. Acceptance: fresh user
   environment, no sibling source repo/cache/ambient credentials, exact SHA/version,
   clean uninstall and unchanged original dev installation. Run Node 22/24 CI.
4. **Release gate.** Keep automatic publishing absent until authorized. Add a
   strict readiness validator distinct from runtime package verification:
   inspect every hidden manifest and final ZIP; reject app bindings/root .app.json/lifecycle hooks,
   escaping paths, missing files, incomplete required listing fields, invalid
   icons, missing URLs/demo and inconsistent versions. Acceptance: deliberately
   broken fixture packages fail for useful reasons; authorized complete archive
   passes, with remote URL/playback verification recorded separately.

## P1 — trust, failure recovery and submission evidence

| Work | Acceptance / evidence |
| --- | --- |
| Shared-session registry hardening | Multi-process contention, suspended lock owner, crash/restart, PID reuse, malformed file, directory permission and orphan cleanup tests. No lost holders or ending another process's active session. Use one small owner-aware lock mechanism; avoid a new service unless evidence requires it. |
| Tool contract and UI declarations | Resolve device_capture read-only vs preference-mutation mismatch; validate output schemas, resource CSP/domain and widget origin against the approved host route. Metadata is not a secret store. |
| Threat model and adversarial checks | Explicit local user/host trust boundary; wrong session/device/stream, stale ref after queued navigation, forged cache, cross-origin preview, leaked/revoked token, slow reader, malformed native packets and cancellation tests. Any hosted future variant authenticates before lookup and binds all resources to identity. |
| Privacy/support diagnostics | Keep screen data out of logs by default; redact session keys/device IDs/local paths in error/support exports. Document cache retention and deletion, abnormal temp residue and host metadata egress. Prove export with fake sensitive markers and explicit user preview. |
| Dependency/release trust | Fresh lockfile install, dependency vulnerability review, complete notices/SBOM, reproducible archive inventory and checksums; determine Developer ID/notarization requirements. No install-time unreviewed execution or shared credentials. |
| Listing and real demo | Confirm four public HTTPS URLs, valid legible square icon assets (existing 64×64 SVG is permitted; larger PNG is optional), publisher/countries/commerce, actual recording URL and legal attestations. Validate content and playback, not HTTP status alone. Missing fields stay absent until confirmed. |
| Reviewer cases | Rehearse five distinct positive and three true out-of-capability negative cases on sample device data, plus stale-snapshot/error tests separately. Record calls, arguments, returned evidence and pass/fail/blocked. No fixture pass substituted for host acceptance. |
| Compatibility and accessibility | Matrix of Xcode/macOS/Node/host versions, simulator rotation and physical-device eligibility; HEVC→H.264→stills failures recover visibly. Keyboard, screen-reader labels, focus, narrow panel, reduced motion and dark/high contrast checked in actual viewer. |

## P2 — measure before optimizing

Current source-only baseline is [BASELINE.json](../docs/audit/BASELINE.json):
~120–131 ms MCP init, ~6–9 ms viewer-resource read, ~1.30 MB HTML,
~0.140 ms Settings summary. These are warm-cache Node 25 trials, not user latency.

Build an opt-in benchmark on a dedicated sample simulator. Capture p50/p95/p99
for cold boot, connect, observe, action→fresh observation and **causally marked**
input→displayed frame; measure host queue wait, encode/decode/render time,
bandwidth, CPU, RSS, allocations and steady-state idle cost. Track hardware,
resolution, codec, Xcode/host versions, warm/cold state and concurrent viewers.
Separate preview, direct MCP and embedded host paths. Repeat enough trials to
show variance. Acceptance: reproducible raw metrics and regression thresholds
based on measured variability, without storing personal screenshots or tokens.

| Hypothesis | Experiment and decision gate |
| --- | --- |
| Viewer bundle is a meaningful first-open cost | Trace parse/render in real host; inspect tree-shaken icon/UI imports and dead styles. Keep self-contained CSP-compatible HTML. Reduce only if first usable frame improves materially without losing accessibility or fallback. |
| Repeated Buffer.concat creates video allocation pressure | Profile native packet fragmentation and allocations under sustained 60 fps. Compare segmented/ring parsing with current code; preserve 8 MiB packet limit, ordering and truncated-packet behavior. Adopt only with measured CPU/RSS benefit. |
| Full-resolution encoding wastes bandwidth in a narrow panel | Compare bounded maxDimension tiers with legibility, input mapping and rotation tests. Add adaptive sizing only if p95 latency/CPU improves while tiny labels remain usable. Never silently use reduced resolution for an attached evidence screenshot. |
| Host request queue dominates input responsiveness | Measure one-video-read scheduling plus input and observation contention; vary read wait/batch budgets within bounded queues. Preserve cancellation, sequencing, keyframes and fair input admission. No caching before trace evidence. |
| Five-second AX refresh is costly or stale | Measure AX cost and change frequency; test event-triggered/coalesced refresh where supported. Preserve fresh snapshot checks and attachment capture. A stale cache must never authorize an input. |
| Encoder sharing saves enough resources to justify complexity | Compare 1/2/4 viewers and codecs, disconnect/idle behavior and stalled readers; bound per-viewer buffers and total resource budget. Last viewer releases capture; one bad client cannot stall others. |

No 10× promise: targets follow the first measured bottleneck. A change lands
only with before/after results, preserved correctness and an explicit rollback.

## P3 — product depth after reliability

- **Explainable agent actions:** correlate tool action, observation snapshot and
  visible result in a bounded in-memory timeline. Users can inspect what actually
  happened; show unknown/failed states. Opt-in exports redact sensitive data.
- **Reproducible bug flows:** sample-device scenario recipes with declared setup,
  checkpoints and teardown; restore known settings and expose incomplete cleanup.
  Export a portable test recipe rather than device recordings by default.
- **Accessibility workspace:** side-by-side Dynamic Type/appearance captures,
  ref/label/role inspection and actionable missing-label/touch-target findings.
  Reports distinguish automated heuristics from a real VoiceOver user test.
- **Safe human takeover:** clear current device/session ownership and immediate
  pause/cancel controls with no hidden background input. Test contention across
  chats while keeping another user's session out of scope.
- **Physical-device parity where Apple permits:** truthful pairing/eligibility,
  observation/input limits and recovery; never promise simulator video APIs on
  physical hardware. Acceptance matrix determines supported features.
- **Developer integration:** generic app launch and flow checkpoints through
  current typed tools, independent of Steady. Add adapters only for demonstrated
  callers; do not add repo-specific build systems to the runtime.

## Release decision

Ready for submission only when P0 and review-critical P1 evidence is complete,
final ZIP and exact saved portal version are checked, the owner supplies legal
and publisher decisions, and the approved local route has real reviewer proof.
Ready for public release only after separate explicit owner authorization.

If contributing to `openai/community-plugins`, separately satisfy its catalog,
root `test:<name>` suite, marketplace validation, CODEOWNERS, contributor CLA
and private vulnerability-reporting requirements. No upstream contribution is
authorized merely by this private migration.
