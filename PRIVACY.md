# Privacy and data handling

Sim Stage runs locally and sends selected device observations to the host and assistant so they can inspect and control the device. Local execution does not keep tool results out of the conversation.

## Data processed

Sim Stage discovers device identifiers, names, runtimes and availability. A connected session can return the foreground app identity, accessibility labels/values, logical screen coordinates and requested screenshots. The live viewer receives video frames and accessibility state. Input tools process the text, coordinates, keys and setting changes supplied for the selected device.

Use development apps and sample data. Do not supply passwords, API keys, authentication codes, payment-card data, government identifiers or health records. Secure accessibility-field text values are replaced with `[redacted]`, including in viewer metadata. Typing into an observed secure field, or without a target when secure fields are present, is rejected. These controls do not identify every kind of sensitive content and do not redact screenshot/video pixels. Keep such content off the selected screen.

## Recipients

The local server uses Apple's Xcode bridge and simulator services. Tool observations and arguments are processed by the host and may reach the assistant; the host's own data policies and conversation settings apply. Native video batches are app-only metadata rather than model-visible tool content. No plugin-operated external analytics service is configured in the current source.

## Storage and retention

The per-user file `~/Library/Caches/sim-stage/sessions.json` stores native interaction-session keys, device identifiers/names, process holders, shared focus and the IDs of simulators created by Sim Stage. New cache directories use mode 0700 and files 0600. Servers sharing the same OS user can use this registry across chats. Dead process holders and previous-boot sessions are pruned; created simulator IDs remain until removed, with no general time-based expiry.

Observations and bounded video buffers live in memory. Device sessions default to five minutes of inactivity expiry; an idle video relay expires after ten seconds without reads. Temporary capture directories are removed in normal `finally` cleanup. An abnormal process termination can leave temporary files. These timings do not govern host/chat retention, simulator app data or recordings you explicitly save.

## Controls and deletion

Disconnect your session when finished. Other chats sharing the device retain their own sessions. Restore device settings changed for a temporary test; disconnect does not undo app input or settings. `simulator_delete` removes a simulator created by Sim Stage, including its apps and data, and ends its shared sessions.

To remove the local registry, stop the Sim Stage MCP processes first, then delete `~/Library/Caches/sim-stage/`. Deleting the registry does not delete simulators or their apps/data and removes Sim Stage's record of which simulators it created. Remove unwanted disposable simulators before clearing that record. Delete explicitly saved captures and recordings separately. Use the host's controls to manage conversation data.

## Support

Rishi Sharma maintains this fork. Repository issues are the support channel. Use synthetic examples and redact device IDs, session keys, personal paths and screen content before sharing a report. Public hosting and the final published policy URL remain release items until verified.
