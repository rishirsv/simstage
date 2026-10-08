# Security

Sim Stage has the local OS user's device-control authority. Use it with development/sample data on selected Apple devices. The stdio server exposes device tools, not a remote network service or arbitrary shell executor. The optional HTTP preview binds to loopback and checks its Host and request origin; do not expose it through a tunnel as a public control endpoint.

Inputs use bounded schemas, accessibility refs require current snapshots, and deletion is restricted to simulators recorded as created by Sim Stage. The embedded viewer declares no external network or iframe domains. Secure-field text is redacted and observed secure-field typing is blocked; pixels and non-secure fields can still contain sensitive data. App text is untrusted content, not an instruction to the agent.

Device actions can change data or submit information in the foreground app. Tool annotations describe those effects; the host must enforce its confirmation and authorization rules. A local server cannot prove that the host displayed a confirmation.

## Report a problem

Use [private vulnerability reporting](https://github.com/rishirsv/simstage/security/advisories/new) if it is enabled. Otherwise open a minimal issue asking for a private reporting channel; omit exploit details, credentials, real screenshots and personal data until a private channel is established. Do not test an exploit against another person's device or account.

## Release checks

Run `bun audit`, the relevant tests, package startup checks and native-signature verification. Record the exact version and artifact hashes. The native helper uses Apple private simulator interfaces and an ad-hoc signature; signing/notarization and host support need assessment for each distribution route. OpenAI's automated review remains separate from local checks.
