# Background capture experiment

Coalesce viewer refreshes while one is pending. A background refresh may reuse a
quiet action's final observation for up to one second. Explicit captures and
ref validation always observe again. Captures, settings, viewer input, expired
entries and input during final capture invalidate reuse. A timed out animation
cannot seed the cache. Reused results preserve their original capture timestamp.

Thirty alternating real-bridge pairs requested a viewer refresh immediately
before an explicit action, after a quiet action observation. Settling was fixed
identically in both variants to isolate refresh work and queue wait.

| Collision measurement | Fresh background capture | Reused action observation |
| --- | ---: | ---: |
| Action p50 | 1,103.5 ms | 947.7 ms |
| Action p75 | 1,141.5 ms | 988.6 ms |
| Action p95 | 1,257.7 ms | 1,029.9 ms |
| Observations including refresh | 3 | 2 |

The p75 saving is 152.9 ms (13.4%) in this collision. There is no expected
queue-wait saving when a refresh does not collide with an action. An already
executing bridge capture cannot be preempted by this policy.

Focused hub, MCP and viewer validation covers freshness, timestamp preservation,
explicit refreshes, continuous animations and live-input races. Reproduction and
raw samples remain in `artifacts/performance/implementation/background-benchmark.ts`
and `background-results.json`.
