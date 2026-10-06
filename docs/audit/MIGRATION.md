# Standalone migration boundary

Prepared 2026-10-06. This is a private review branch, not a release.

## Source and provenance

The live source was already outside Steady, in a sibling directory named
`apple-device-hub`, without Git metadata. Steady's tracked `AGENTS.md` refers to
Device Hub as an external testing tool. No plugin source, adapter, or removal
from Steady is necessary. Its existing simulator fallback remains usable.

The source declares upstream `mweinbach/AppleSimChatGPTPlugin`, author Max
Weinbach, version 0.1.3 and `UNLICENSED`. The private staging repository retains
the public upstream history through commit
`790711598fc622cf8745ea7b5384f412f9f7befa`. Local viewer, zoom, attachment,
skill and verifier changes were imported in `a92f00c` (rebased from original import `07dcb08`). Attribution, package
names, marketplace identity and runtime tool names remain intact. No license
or ownership transfer is inferred from possession of source.

Import includes TypeScript/React, native Objective-C helper, three skills,
portable/compatibility manifests, lockfile, fixtures and development scripts.
It excludes node_modules, releases, dist, captures, artifacts, local installation
metadata and personal configuration. The one local test bundle ID was replaced
with `com.example.sample`. Only upstream-public history and audited source
changes are transferred; no Steady application code or local device data is added.

## Installation and release boundary

The current development installation and its original source are untouched.
Do not run `npm run dev:plugin` during migration: that command replaces a local
installation. The new repository is staging; Git marketplace installation still
points to the existing npm `apple-device-hub-mcp@0.1.3`, not this branch's runtime.
A future release needs its own immutable version and an approved publishing
owner/path before updating those coordinates. Building a local ZIP does not
update users or authorize distribution.

The inherited automatic public publish workflow was removed from this branch.
The publisher script is retained for provenance but was not run. Restoring any
release automation requires owner authorization after rights and release
coordinates are resolved. Existing upstream release documentation describes
upstream behavior, not an enabled release process in this staging repository.

Rollback is to keep using the existing installation. Neither Steady nor the
installed development cache needs modification. A source checkout is reviewable
with `npm ci`, `npm run typecheck`, `npm run build`, `npm test`, `npm run pack`
and `npm run verify:packages`; build outputs remain ignored. Node 22/24 CI is
defined but has not run on this private repository yet.

The private main baseline is `177c47823df2195434e8afb48346c0a30b4612cc`,
which disables publishing before the first staging push. The migration branch
adds the local source import and audit commits above that baseline.
