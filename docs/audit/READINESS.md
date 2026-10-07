> Historical migration audit from PR #1. Runtime and distribution references
> describe the pre-refactor Device Hub source. The current Sim Stage architecture
> and performance reports supersede those implementation details.

# Source and distribution audit

Prepared 2026-10-06 against upstream 7907115 plus the local source import.
Scope: source, local fixture tests, build and extracted packages. No real-device
flow, installed-host acceptance, legal verification, online submission, or
public release was performed. Historical `VALIDATION.md` is separate evidence.

## Outcome

Suitable for a private migration draft. **Not ready for public distribution or
OpenAI submission.** The public Directory and community marketplace are separate
routes. A marketplace PR does not prove Directory acceptance. Reference gates:
[plugin package guide](https://developers.openai.com/plugins/build/plugins),
[submission guide](https://developers.openai.com/plugins/deploy/submission), and
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).
The parent task researched these current official requirements; exact target
portal behavior and the local-MCP route still require confirmation.

## Findings and acceptance evidence

| Priority | Finding | Evidence / action |
| --- | --- | --- |
| P0 | Distribution rights and publisher unresolved | Source manifests are `UNLICENSED` and name Max Weinbach. Preserve attribution; obtain rights and selected verified publisher before public packaging/release. |
| P0 | Local execution needs an approved Directory route | One stdio server uses the user's Xcode bridge plus a native helper. It is not a hosted HTTPS MCP endpoint accessible to generic reviewers. Confirm local support/reviewer hardware with OpenAI; do not add a remote shell or forward personal-device access to satisfy hosting. |
| P0 | Staging Git install would use old published runtime | Both MCP manifests invoke npm 0.1.3. Local source changes cannot overwrite an immutable npm release. Resolve new version/owner and clean-install evidence before calling a Git install equivalent to this branch. |
| P1 fixed | Privacy text incorrectly said sessions are memory-only | `src/session-registry.ts` persists keys, device names/IDs, holders, created simulators and focus in a cache. Corrected `docs/PRIVACY.md`; no legal/publisher claims added. Existing directory permissions are not forcibly tightened. |
| P1 fixed | Extracted-package verifier rejected valid global entrypoint | Imported verifiers expected settings/thread while `src/mcp.ts` and discovery test expose global/settings/thread. Both assertions corrected; extracted archive checks now pass. |
| P1 fixed | Inherited staging workflow could publish publicly | Removed `.github/workflows/publish.yml`. No tag, publish script or package upload executed. CI remains read-only apart from artifact storage. |
| P1 | Shared-file coordination needs stress/fault tests | Registry reaps a lock by age >2 s or retry count; a paused holder may still be updating. PID reuse and malformed local state need adversarial coverage. This is a source-grounded race hypothesis, not a reproduced corruption. |
| P1 | Required review/listing materials incomplete | Missing terms URL, verified demo recording, confirmed countries, publisher verification and legal attestations. Current official docs allow square SVG; existing 64×64 SVG is within documented dimensional/format limits, with visual/portal verification still needed. Existing website/support/privacy URLs refer to upstream and were not verified as this staging publisher's pages. |
| P1 | Signing/compatibility acceptance incomplete | Native helper uses private CoreSimulator/SimulatorKit APIs and ad-hoc signing. Compilation and signature verification pass; Developer ID/notarization requirements and Xcode/macOS compatibility need approved-route evidence. |
| P2 | Reviewer runbook had stale version/tool count | Corrected to 22 tools for this 0.1.3 source snapshot. Older validation/release prose is historical; do not use as fresh acceptance evidence. |

## Security boundaries inspected

- `NativeAppleBoundary` uses fixed `/usr/bin/xcrun` and `/usr/bin/sips`
  commands with argument arrays, not shell interpolation. Tools expose individual
  typed operations; no generic arbitrary execute/discover dispatcher, host URL,
  upload path, shell command, or file-install operation is exposed. Three skills
  call this plugin's tools and do not require another plugin to complete flows.
- Public session UUIDs are separate from Apple's interaction keys. Native keys
  stay inside local process/cache state; tests cover exclusion from public
  sessions. Input validates session/snapshot and bounds before invoking effects.
  Foreign sessions require explicit takeover; simulator deletion is limited to
  the registry's created-device IDs. This ownership mechanism is a same-user
  operational guard, not strong authorization against a process that can edit
  the cache.
- Local stdio relies on the host and OS user's trust boundary, not OAuth or a
  multi-tenant authenticated identity. Sharing intentionally crosses chats of
  the same local user. A hosted design would need identity established before
  lookup and user-bound device/session/stream authorization; none is claimed.
- All 22 tools emit explicit boolean read-only/destructive/open-world hints.
  A confirmed mismatch remains: `device_capture` advertises read-only while its
  default `updateAccessibilityPreference: true` path updates the viewer preference
  (`src/apple.ts` capture). Before review, separate observation from preference
  mutation or classify the mutating contract honestly; no runtime change was made
  in this audit.
  Boot/create/session operations are writes; delete/settings/input describe
  effects; arbitrary-app input is open-world/destructive. `simulator_scroll`
  remains a non-destructive local scroll operation. Annotations are guidance,
  not authentication or a guarantee that third-party apps cannot react.
- Video capabilities use random 24-byte tokens, session checks and revocation;
  loopback WebSocket validates Host/token and consumes the ticket. Encoders and
  relay buffers are bounded; slow viewers reset/reconnect. Tests cover invalid
  token/session, idle/stop/shutdown, oversized keyframe and backpressure cases.
  WebSocket does not separately validate Origin; capability secrecy is its
  browser boundary. Do not treat this as a multi-user internet service.
- Preview binds 127.0.0.1, validates Host and rejects unrelated supplied Origins
  on JSON POST. Origin-less local clients are allowed. No authenticated preview
  principal exists. Preview is development-only; production uses host MCP.
  Exact host CSP enforcement and cross-origin iframe behavior were not tested.
  `src/mcp.ts` registers no explicit outputSchema, resource CSP/domain declaration;
  host defaults may constrain it, but declared contract/origin/network allowlist
  requirements need approved-route validation. Component-only metadata is not a
  secret vault.
- Raw hierarchy and video travel in host metadata; stills/text can enter model
  context. No publisher telemetry/backend was found. Host egress/retention is
  governed by host policy, not proven local-only. Temporary files are normally
  removed, but crashes can leave them. Capture errors can include bridge stderr;
  redaction/support-export coverage is incomplete.
- `npx --yes` fetches a pinned package version for Git installs. Version pinning
  alone does not establish publisher authenticity, integrity or offline trust.
  Self-contained ZIP extracts and launches without sibling repositories or
  source-checkout dependencies. It still requires Node/Xcode/macOS. Third-party
  bundling currently carries only the explicit mcp-extensions notice; a complete
  dependency license/notice inventory and SBOM were not produced.

## Verification performed

Local environment: macOS 27.0 (26A428), Xcode 27.0 (27A266a), arm64,
Node v25.5.0/npm 11.11.0. Dependencies copied from the original local lock-matched
installation into an isolated directory; **fresh `npm ci` was not run**.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, arm64 helper compiled and ad-hoc signed |
| `npm test` | 147 passed, 0 failed/skipped; fixture/native-codec suite, 4.16 s |
| Initial sandbox test attempt | Failed on denied loopback/OS uptime prerequisites; investigated, rerun with approved access passed |
| `npm_config_cache=/tmp/device-hub-npm-cache npm run pack` | Passed; isolated npm cache avoids modifying existing user cache |
| `npm run verify:packages` | Passed extracted npm/ZIP server initialization, 22 tools, entrypoints, viewer, metadata and native signature |
| Source/package inventory | No local `.dev-plugin`, recordings, releases or dist added to Git; sample bundle ID sanitized |
| `git diff --check` | Passed at audit checkpoint; rerun before commit |
| Node 22/24 CI, fresh install, audit/SBOM | Not run |
| Live simulator/physical device, 5 positive/3 negative model cases, host CSP/render/attachment, recording | Not run |

Package verification checks format/runtime, not complete submission readiness.
It does not enforce every required public URL, icon format, video or publisher
field. The eight manifest cases are drafts with unrun live evidence. The stale
snapshot negative case is a supported-operation validation failure; add a
separate out-of-capability third negative prompt before final review while
retaining stale-snapshot regression coverage.

## Measured baseline

`scripts/baseline.mjs` only starts the built MCP process, lists tools, reads the
viewer and parses a public Settings fixture. [BASELINE.json](BASELINE.json)
records five trials: initialization 120–131 ms, viewer resource read 6.4–9.0 ms,
1,296,594-byte viewer HTML. Mean hierarchy parse/summary 0.140 ms over 1000 warm
iterations. Runtime bundle sizes: app JS 1,211,833; CSS 84,518; server JS 1,573,627;
native helper 89,280 bytes. Warm caches and Node 25 limit generalization.

No input-to-photon, frame quality, CPU/RSS, concurrent-viewer or actual host
baseline was measured. `scripts/interaction-benchmark.mjs` times the first frame
after input, which may be unrelated to the action; it cannot establish causal
input-to-photon latency without visual/frame markers. Historic latency numbers
are not new migration results. No speedup is claimed.

## Official-checklist cross-check

Current official docs accept square PNG/JPEG/WebP/SVG (48×48 minimum, ≤5 MiB);
PNG 256×256 is a conservative optional preparation choice, not a universal
requirement. Starter screenshots are optional and currently not displayed in
the Directory. Public upload validation also rejects lifecycle hooks in addition
to existing apps/.app.json bindings. Source manifests here define neither.

If the chosen route is `openai/community-plugins`, add that repository's root
`test:<name>` master suite/catalog entry, marketplace checks, CODEOWNERS/CLA
evidence and private vulnerability reporting route. These are route-specific
and were not performed for this private own-repository migration. Rights to
Apple branding/private APIs remain a publisher/platform decision; no claim of
Apple entitlement or legal compliance is established by successful compilation.
