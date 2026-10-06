# Benchmark availability review follow-up

Stacked on PR #4, `codex/perf-background-captures` at
`4fa41b24ed99080008dd0d9136648fd4b9d2f75d`. Addresses
[source review](https://github.com/rishirsv/simstage/pull/4#discussion_r4191417438).
This correction depends on the unmerged experiment documentation.

The referenced benchmark script and raw JSON are absent from both the tracked
source tree and this saved cloud checkout. The performance document now says
that the table contains previously reported local measurements that cannot be
audited or reproduced from a fresh checkout. It explicitly excludes those
figures from performance acceptance evidence until original artifacts are
retained in a tracked location or a real macOS simulator rerun is recorded.

Validation: `git diff --check` and inspection of tracked files and local artifacts.
No code changed; no tests, native build, packaging or benchmark was run for this
documentation correction. No measurement data was synthesized or reconstructed.
The original measurements remain unverified. Original artifacts or a real
simulator rerun are the concrete remaining blocker for performance acceptance.
