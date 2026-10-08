# OpenAI submission tasks

Sim Stage 0.1.5 passes local release checks. Public submission remains blocked by the unconfirmed local MCP review route, npm authentication, OpenAI developer verification and the deferred real-app demo/live-viewer evidence. The website is public at [simstage.swellapp.app](https://simstage.swellapp.app).

Audited October 7, 2026. This checklist covers source, manifests, skill, website, packaged artifacts and public requirements. The submission portal was inspected in the Personal organization. Upload is gated by developer verification; its Start flow requires a default payment method. No ZIP has been uploaded and OpenAI scans have not run.

## 1. Resolve eligibility

- [ ] **Publisher: confirm an accepted local MCP submission route with OpenAI.** Both MCP manifests use stdio; the ZIP requires the user's Apple Silicon Mac, Bun and Xcode. Obtain the review/install instructions and reviewer environment. Hosting the marketing site does not host the simulator server. [Local MCP guidance](https://developers.openai.com/plugins/guides/submit-claude-plugin)
- [ ] **Publisher: confirm desktop-only eligibility.** The plugin cannot run on web or mobile. Ask how that limitation is handled under the [desktop/mobile reliability requirement](https://developers.openai.com/plugins/plugin-guidelines#testing). Retain the actual platform limits in the listing.
- [ ] **Publisher: resolve native distribution acceptance.** The helper uses private CoreSimulator/SimulatorKit interfaces and an ad-hoc arm64 signature. Confirm Apple's permitted distribution and OpenAI's accepted signing/install requirements. Private-interface use is an observed dependency, not a confirmed rejection.
- [x] **Publisher declarations confirmed:** individual Rishi Sharma, all supported countries (`countries: []`), and no payments or purchases (`commerce: false`). Portal identity acceptance remains a separate requirement in step 4.

Completion: an accepted route that preserves the plugin's local simulator behavior, with a reviewer setup that can actually run it. If a remote route is proposed, settle the architecture and access model before declaring an HTTPS endpoint.

## 2. Finish distribution and evidence

- [ ] **Maintainer: publish `sim-stage-mcp@0.1.5` and verify registry installation.** The npm registry version is unpublished. Publishing was attempted but the local CLI has no npm authentication. Chrome signup works and is prepared with username `rishirsv`; the publisher must enter email/password, accept npm terms, verify email and complete `bunx npm login`. This blocks the Git marketplace launcher in `plugins/sim-stage/.mcp.json` and `mcp.json`; source installation and the bundled ZIP work independently. Publish only the verified tarball, using `bun scripts/publish.mjs`, and compare registry integrity with the local artifact. Do not overwrite an existing version with different bytes.
- [x] **Clean source installation:** an independent public clone passed frozen install/build and the README marketplace/plugin install commands in an isolated Codex home. The plugin and bundled skill were enabled; active user configuration was preserved.
- [x] **Final 0.1.5 actual Codex CLI discovery:** the built stdio server loads without skipped-tool warnings. Fixed four coordinate-input schemas rejected by Codex; all three negative prompts passed using the authenticated host with only Sim Stage enabled.
- [ ] **Clean desktop host live-viewer proof:** verify fresh native frames, visible viewer input and teardown in a new conversation using the final installed release. MCP tool discovery and simulator video alone do not complete this check.
- [ ] **Maintainer: run the eight cases below against the final release.** Use a dedicated sample-data simulator. Retain calls, important arguments, screenshots/results and cleanup evidence. Record Passed, Failed or Blocked; fix failures before final packaging.
- [x] **Physical-device claims narrowed:** README and listing explicitly state that physical interaction is unverified in this release and live video is simulator-only. No personal-device content was captured.
- [ ] **Deferred by publisher: record and host a real-app walkthrough.** Show installation/version, inventory, connection, observed Settings navigation, light/dark comparison and restoration, fresh live video/input, scoped disconnect and a boundary prompt. Verify readable playback without login barriers or private screen content, then add the actual URL as `review.demo_recording_url` in the canonical manifest and regenerate the overlay. Use the publisher’s real app for the final walkthrough. A private simulator-only recording was captured as test evidence; neither it nor the website’s scripted demo completes this item.
- [ ] **Maintainer: establish reviewer access.** Confirm required Mac/Xcode/runtime setup and sample data through the accepted local route. If authentication becomes necessary, put dedicated reviewer credentials and instructions only in secure portal fields.

The five positive and three negative cases are defined in [plugin.json](plugins/sim-stage/plugin.json). Final 0.1.5 positive workflows were exercised through its actual packaged MCP runtime; negative natural-language prompts ran in authenticated Codex CLI (gpt-5.5), limited to this integration. The exact saved portal version must still be tested after upload. The initial unconstrained host attempted an unrelated desktop tool for the Terminal prompt; permission denied it. These results establish this plugin’s boundary, not universal refusal by hosts with other integrations.

| Case | Local result and evidence limit |
| --- | --- |
| Inventory | Passed actual MCP inventory; dedicated sample-data device listed. |
| Connect and boot | Passed actual connection, screenshot, elements, logical coordinates and current snapshot; final cold-boot result recorded in private evidence. |
| Settings navigation | Passed exact `simulator_click` with current General ref/snapshot; returned General screen. |
| Appearance | Passed omitted-settings read of light, actual light/dark captures, and verified restoration to light. |
| Live viewer and disconnect | Scoped disconnect passed; embedded fresh-frame/input proof pending. Real-app demo deferred by publisher. |
| Mac desktop input | Passed final CLI prompt: scope explained; no desktop input, shell or device input. |
| Unpaired remote iPhone | Passed final CLI prompt: no fabricated access, pairing bypass or tool call. |
| Android | Passed final CLI prompt: Apple scope explained; no device connection/input. |

## 3. Finalize the package

- [x] Replace the broken GitHub Pages listing URL in both manifests with the public custom domain.
- [x] Add publisher identification, support and terms links to the website; correct its canonical/image URLs.
- [x] Verify the website, support, privacy and terms pages are publicly readable and serve the stated purposes. Support issues require GitHub sign-in to post.
- [x] Verify listing text limits, three distinct prompts, PNG dimensions/size/paths, manifest agreement, bundled skill, attribution and third-party licenses.
- [x] Verify both extracted packages start, expose expected tools and the self-contained viewer, and include the signed arm64 helper.
- [x] Check explicit boolean tool annotations and viewer CSP. Input tools declare write/destructive/open-world effects; observation tools declare read-only effects. The five video/live-input operations are app-only.
- [x] Inspect privacy coverage against source: observations, host/assistant recipients, local registry and temporary capture retention, deletion, restoration and shared-session cleanup are described.
- [ ] **Maintainer/publisher: close policy assessment gaps.** Secure-field text and typing are guarded, but screen pixels and ordinary labels can contain restricted data. Demonstrate sample-data workflows and establish acceptance for this device viewer under [OpenAI's data requirements](https://developers.openai.com/plugins/plugin-guidelines#data-collection). Confirm authorization for the Apple integration and support for the intended general audience. No acceptance claim has been made.
- [x] **Technical release rebuilt as 0.1.5:** typecheck/build, 169 tests, extracted ZIP/tarball checks and dependency audit pass. SHA-256 hashes retained in private release evidence.
- [ ] **Maintainer: finalize the submission ZIP after the real-app demo and accepted local route.** Run the commands below and inspect the exact ZIP. Preserve no app references, lifecycle hooks or credentials; retain the MCP configuration for the route OpenAI accepted. Write exact artifact hashes to private release evidence. The current artifact is verified locally, not submission-ready.

```sh
bun run typecheck
bun run build
bun test
bun run pack
bun run verify:packages
bun audit
shasum -a 256 release/sim-stage-0.1.5.zip release/sim-stage-mcp-0.1.5.tgz
```

If the version changes, use its actual archive names. Update release notes in the plugin manifest; a separate changelog is unnecessary.

## 4. Complete the portal

- [ ] **Publisher: finish developer verification** in Personal / Default project. Upload currently displays “You need a verified developer identity”; Start requires a default payment method even though the individual status label says Identity approved. Chrome is open at Add payment details. Publisher must complete card setup and verification; no card details were entered. Owner or Apps Management Write access is required.
- [ ] **Maintainer/publisher: upload the final ZIP through the accepted route.** Inspect the exact saved draft's listing, countries, commerce, cases, demo link and release notes. Upload success is not review readiness.
- [ ] **Maintainer: complete required metadata, skill and MCP scans; resolve setup errors and findings.** GitHub CI was enabled and its first release-check run passed; this does not imply OpenAI scans passed.
- [ ] **Maintainer: complete domain/authentication setup if the accepted route uses remote MCP.** The website's DNS verification does not replace the portal's MCP challenge. Local stdio currently has no OAuth account to connect.
- [ ] **Publisher: supply secure reviewer access details and confirm the saved review materials.** Keep that access available during review.
- [ ] **Publisher: complete legal/policy attestations and submit for review.** Track the decision and resolve feedback. Publish only after approval and an authorized publication action.

These portal steps follow [OpenAI's submission workflow](https://developers.openai.com/plugins/deploy/submission). No draft was uploaded, no attestations were completed and no review was submitted during this audit.

## Audit evidence and limits

| Area | Evidence | Status |
| --- | --- | --- |
| Runtime checks | Final 0.1.5 typecheck/build and 169 tests passed, including schema regression coverage. | Passed locally |
| Final packaging | 0.1.5 ZIP/tarball rebuilt with the Codex schema fix; isolated MCP/viewer/icon/skill/native-signature checks passed. | Passed locally |
| Dependencies | `bun audit`: no vulnerabilities among 262 packages. | Passed advisory check |
| Input and lifecycle controls | Source and tests cover bounded schemas, stale snapshots, secure typing, owned-simulator deletion, shared-session cleanup and video capability revocation. | Covered locally; host flows pending |
| Skill | Uses observed targets, treats screen content as untrusted, restores settings and scopes cleanup. | Source inspected; OpenAI scan pending |
| Website | Public custom domain with active HTTPS; listing points to it. | Hosting complete |
| Public package install | 0.1.5 unpublished; publishing blocked by missing npm authentication. | Blocked |
| Reviewer cases / recording | Four positive tool workflows and three final CLI boundary prompts pass; live viewer proof pending; real-app recording deferred. | Incomplete |
| OpenAI portal / identity / scans | Inspected; upload blocked by identity/payment-method prerequisite; no draft or scans. | Blocked |
| GitHub CI | Enabled; [initial run](https://github.com/rishirsv/simstage/actions/runs/37716849977) passed all release checks. | Passed |

This is a submission-readiness audit, not a penetration test or approval decision. Keep the source, tests, build/release scripts, icon masters and licenses: they are needed to maintain and reproduce the package.
