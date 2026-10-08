# OpenAI submission tasks

Sim Stage 0.1.4 passes local package checks. Public submission remains blocked by the unconfirmed local MCP review route and missing demo/test evidence. The website is public at [simstage.swellapp.app](https://simstage.swellapp.app).

Audited October 7, 2026. This checklist covers source, manifests, skill, website, packaged artifacts and public requirements. The submission portal, verified publisher identity and OpenAI scan results have not been inspected.

## 1. Resolve eligibility

- [ ] **Publisher: confirm an accepted local MCP submission route with OpenAI.** Both MCP manifests use stdio; the ZIP requires the user's Apple Silicon Mac, Bun and Xcode. Obtain the review/install instructions and reviewer environment. Hosting the marketing site does not host the simulator server. [Local MCP guidance](https://developers.openai.com/plugins/guides/submit-claude-plugin)
- [ ] **Publisher: confirm desktop-only eligibility.** The plugin cannot run on web or mobile. Ask how that limitation is handled under the [desktop/mobile reliability requirement](https://developers.openai.com/plugins/plugin-guidelines#testing). Retain the actual platform limits in the listing.
- [ ] **Publisher: resolve native distribution acceptance.** The helper uses private CoreSimulator/SimulatorKit interfaces and an ad-hoc arm64 signature. Confirm Apple's permitted distribution and OpenAI's accepted signing/install requirements. Private-interface use is an observed dependency, not a confirmed rejection.
- [ ] **Publisher: confirm the intended individual/business identity, organization/project, unrestricted country availability and no-commerce declaration.** The package says Rishi Sharma, `countries: []` and `commerce: false`; these values do not establish verified identity or publisher approval.

Completion: an accepted route that preserves the plugin's local simulator behavior, with a reviewer setup that can actually run it. If a remote route is proposed, settle the architecture and access model before declaring an HTTPS endpoint.

## 2. Finish distribution and evidence

- [ ] **Maintainer: publish `sim-stage-mcp@0.1.4` and verify registry installation.** The npm registry currently returns 404. This blocks the Git marketplace launcher in `plugins/sim-stage/.mcp.json` and `mcp.json`; source installation and the bundled ZIP work independently. Publish only the verified tarball, using `bun scripts/publish.mjs`, and compare registry integrity with the local artifact. Do not overwrite an existing version with different bytes.
- [ ] **Maintainer: test a clean source installation in Codex.** Follow the README on a supported Mac and verify the installed version, skill, actual tool calls and fresh live frames. Package startup checks alone do not establish host acceptance.
- [ ] **Maintainer: run the eight cases below against the final release.** Use a dedicated sample-data simulator. Retain calls, important arguments, screenshots/results and cleanup evidence. Record Passed, Failed or Blocked; fix failures before final packaging.
- [ ] **Maintainer: verify or narrow physical-device claims.** Test capture/action on an eligible paired device. Simulator video checks do not establish physical-device video support.
- [ ] **Maintainer: record and host a real walkthrough.** Show installation/version, inventory, connection, observed Settings navigation, light/dark comparison and restoration, fresh live video/input, scoped disconnect and a boundary prompt. Verify readable playback without login barriers or private screen content, then add the actual URL as `review.demo_recording_url` in the canonical manifest and regenerate the overlay. The website's scripted demo does not satisfy this evidence item.
- [ ] **Maintainer: establish reviewer access.** Confirm required Mac/Xcode/runtime setup and sample data through the accepted local route. If authentication becomes necessary, put dedicated reviewer credentials and instructions only in secure portal fields.

The five positive and three negative cases are already defined in [plugin.json](plugins/sim-stage/plugin.json). All remain **Not run end to end** in this audit:

| Case | Observable result required |
| --- | --- |
| Inventory | Actual local devices listed; no invented connection. |
| Connect and boot | Dedicated simulator boots; screenshot, elements, coordinates and snapshot returned. |
| Settings navigation | General opened with a current observed element/snapshot. |
| Appearance | Actual light/dark screenshots; observed original appearance restored. |
| Live viewer and disconnect | Fresh real frames and interaction visible; only this session released after the user's request. |
| Mac desktop input | Explain scope; no desktop input or arbitrary shell action. |
| Unpaired remote iPhone | No fabricated access or pairing bypass. |
| Android | Explain Apple-only scope; no Apple tool invoked for Android. |

## 3. Finalize the package

- [x] Replace the broken GitHub Pages listing URL in both manifests with the public custom domain.
- [x] Add publisher identification, support and terms links to the website; correct its canonical/image URLs.
- [x] Verify the website, support, privacy and terms pages are publicly readable and serve the stated purposes. Support issues require GitHub sign-in to post.
- [x] Verify listing text limits, three distinct prompts, PNG dimensions/size/paths, manifest agreement, bundled skill, attribution and third-party licenses.
- [x] Verify both extracted packages start, expose expected tools and the self-contained viewer, and include the signed arm64 helper.
- [x] Check explicit boolean tool annotations and viewer CSP. Input tools declare write/destructive/open-world effects; observation tools declare read-only effects. The five video/live-input operations are app-only.
- [x] Inspect privacy coverage against source: observations, host/assistant recipients, local registry and temporary capture retention, deletion, restoration and shared-session cleanup are described.
- [ ] **Maintainer/publisher: close policy assessment gaps.** Secure-field text and typing are guarded, but screen pixels and ordinary labels can contain restricted data. Demonstrate sample-data workflows and establish acceptance for this device viewer under [OpenAI's data requirements](https://developers.openai.com/plugins/plugin-guidelines#data-collection). Confirm authorization for the Apple integration and support for the intended general audience. No acceptance claim has been made.
- [ ] **Maintainer: rebuild the final submission ZIP after demo, scope, country or release-note changes.** Run the commands below and inspect the exact ZIP. Preserve no app references, lifecycle hooks or credentials; retain the MCP configuration for the route OpenAI accepted. Write exact artifact hashes to private release evidence. The current artifact is verified locally, not submission-ready.

```sh
bun run typecheck
bun run build
bun test
bun run pack
bun run verify:packages
bun audit
shasum -a 256 release/sim-stage-0.1.4.zip release/sim-stage-mcp-0.1.4.tgz
```

If the version changes, use its actual archive names. Update release notes in the plugin manifest; a separate changelog is unnecessary.

## 4. Complete the portal

- [ ] **Publisher: verify developer identity and submission access** in the intended organization/project; owner or Apps Management Write access is required.
- [ ] **Maintainer/publisher: upload the final ZIP through the accepted route.** Inspect the exact saved draft's listing, countries, commerce, cases, demo link and release notes. Upload success is not review readiness.
- [ ] **Maintainer: complete required metadata, skill and MCP scans; resolve setup errors and findings.** Repository CI is currently disabled, so successful local checks do not imply GitHub CI or OpenAI scans passed. Enable repository CI if it will be used for release evidence.
- [ ] **Maintainer: complete domain/authentication setup if the accepted route uses remote MCP.** The website's DNS verification does not replace the portal's MCP challenge. Local stdio currently has no OAuth account to connect.
- [ ] **Publisher: supply secure reviewer access details and confirm the saved review materials.** Keep that access available during review.
- [ ] **Publisher: complete legal/policy attestations and submit for review.** Track the decision and resolve feedback. Publish only after approval and an authorized publication action.

These portal steps follow [OpenAI's submission workflow](https://developers.openai.com/plugins/deploy/submission). No draft was uploaded, no attestations were completed and no review was submitted during this audit.

## Audit evidence and limits

| Area | Evidence | Status |
| --- | --- | --- |
| Runtime checks | Typecheck, build and 169 tests passed earlier in this session; runtime source is unchanged by this cleanup. | Passed locally |
| Final packaging | ZIP/tarball rebuilt after the website URL change; isolated MCP/viewer/icon/skill/native-signature checks passed. | Passed locally |
| Dependencies | `bun audit`: no vulnerabilities among 262 packages. | Passed advisory check |
| Input and lifecycle controls | Source and tests cover bounded schemas, stale snapshots, secure typing, owned-simulator deletion, shared-session cleanup and video capability revocation. | Covered locally; host flows pending |
| Skill | Uses observed targets, treats screen content as untrusted, restores settings and scopes cleanup. | Source inspected; OpenAI scan pending |
| Website | Public custom domain with active HTTPS; listing points to it. | Hosting complete |
| Public package install | Registry lookup for 0.1.4 returns 404. | Blocked |
| Reviewer cases / recording | Cases drafted; no executed host-case evidence or actual demo URL established. | Incomplete |
| OpenAI portal / identity / scans | Not inspected. | Unknown |

This is a submission-readiness audit, not a penetration test or approval decision. Keep the source, tests, build/release scripts, icon masters and licenses: they are needed to maintain and reproduce the package.
