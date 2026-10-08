# Sim Stage website — design brief

A single-page site for Sim Stage. It serves as the `websiteURL` for the Codex plugin directory listing and is deployed from `sites/` to GitHub Pages. Nothing is for sale; the page explains what the plugin does and how to install it.

## The one idea

**The simulator stays open while the agent works.** Sim Stage keeps one viewer next to the Codex chat. You tap through the app while Codex edits code, and new builds appear in that same viewer. Sim-serve and device-hub workflows feel like repeated build-and-inspect cycles; Sim Stage feels like working on a running app together.

The page shows that loop instead of describing it: **you interact → the agent reads the same screen → the agent changes code → the build appears in the viewer you never closed.**

## Audience

1. **Codex users building native iOS apps.** Many already know serve-sim from OpenAI's `build-ios-apps` plugin. They should see the difference within seconds.
2. **Plugin directory reviewers.** They need requirements, privacy, security and the "not affiliated with Apple or OpenAI" notice within one glance.
3. **Mac and iOS developers curious about agents** that operate real simulators.

## What the product does (from the code)

- **Persistent embedded viewer.** `open_sim_stage` renders an MCP Apps viewer beside the chat. It has a device bar (name, runtime, live status, fps, pause), hardware controls (Home, Lock, Rotate, Type) and tools (Agent view, Elements, Appearance, Attach screen).
- **Live native video.** HEVC with H.264 fallback. Video bytes never enter the model's context.
- **Agent view and Elements.** Every accessibility element gets a numbered ref (`e1`, `e2`…), drawn on the screen and listed in the Elements panel.
- **Observe → act → verify.** Agents act on current refs and snapshot IDs and get the resulting screen back. Activity captions and tap marks show agent input live.
- **Shared sessions.** Several chats can join one device session. `simulator_create` and `simulator_delete` manage disposable simulators.
- **Appearance and accessibility.** Light/dark, Dynamic Type, Reduce Motion, Reduce Transparency and Increase Contrast can be read, changed and restored.
- **Safety.** Secure-field values are redacted, typing into secure fields is rejected, and input never reaches the Mac desktop.
- **Requirements.** Apple Silicon, Xcode 27 with the MCP bridge enabled, and Bun 1.4.2 or later.

## Sim Stage and serve-sim

They work at different layers, and Sim Stage complements `build-ios-apps` for building, profiling and previews.

| | serve-sim in build-ios-apps | Sim Stage |
|---|---|---|
| Where it lives | A `npx serve-sim` terminal plus a loopback URL in the in-app browser | An embedded viewer opened by one tool call |
| Lifecycle | Long-running terminal with trap cleanup | Managed sessions, shared across chats, kept across rebuilds |
| What the agent sees | Browser screenshots of a mirror | Accessibility elements with refs; screenshots when needed |
| Humans and agent together | You watch a page | You and the agent drive the same screen |
| Settings, fresh devices, physical devices | Not included | Included |

## Final direction: Split

Three directions were explored (Split, Spotlight, Loop). Split was chosen.

- **One screen, minimal text.** Headline, one sentence, two buttons, then a full Codex window. A thin footer carries requirements and policy links. Scrolling is only needed on phones.
- **The Codex window is the demo.** Chat on the left; the Sim Stage viewer on the right with the device bar, controls and Elements panel, matching `src/components`.
- **A working sample app.** "Brew", a coffee-ordering app with push navigation, a floating glass tab bar, a sliding size picker, switches, a quantity stepper and an add-to-order animation.
- **A scripted session that loops.** The user reports an unreadable button in dark mode. The agent taps into the item, switches to dark appearance, reads the elements, explains the cause, streams a diff, and runs a build. Build 2 lands in the same viewer on the same screen, and the agent verifies by adding the item to the order. Tool names are real.
- **Visitors can take over.** Any tap on the phone or the viewer controls pauses the script. Every control works: Home, Lock, Rotate, Agent view, Elements, Appearance and Attach screen.
- **Install sheet.** "Install" opens the three source-install steps with copy buttons.

## Visual direction

- Dark graphite and navy with slow-moving glows, a faint dot grid and grain.
- Brand blue `#3478F6` / `#8CB4FF`, logo cyan `#16C8F0` for agent refs, green for live and success.
- SF Pro for UI and headlines, SF Mono for refs and tool calls.
- Motion with purpose: iOS spring push transitions, tap marks, staggered ref badges, streamed chat, build progress, a settle sweep when a build lands. It respects `prefers-reduced-motion`.

## Constraints

- One static page in `sites/`, with no backend and no external requests.
- No implied endorsement by Apple or OpenAI.
- Every claim must match the code: no Android, no remote devices, accurate requirements.
