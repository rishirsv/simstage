# Input-only tap experiment

A running simulator video helper can deliver a tap and acknowledge HID delivery
without generating an intermediate observation. Settled tap actions use this
path; they still validate element refs against a fresh AX snapshot and obtain a
final observation after settling. Without an available helper, and for typing,
launches, other action types or `settle: false`, the Apple bridge path remains.
The installed bridge schema has no input-only mode.

Thirty alternating pairs on the dedicated simulator, with an active H.264
stream, a fresh identifier target and screenshots omitted from both responses:

| Metric | Bridge input | Acknowledged helper input |
| --- | ---: | ---: |
| Action p50 | 1,289.2 ms | 1,026.9 ms |
| Action p75 | 1,355.8 ms | 1,048.6 ms |
| Action p95 | 1,474.5 ms | 1,182.0 ms |
| Observations per action | 3 | 2 |

The final hierarchy marker advanced once for every input in both variants.
The p75 saving is 307.2 ms (22.7%). Input delivery failures and timeouts invalidate
old refs and never replay input. Native acknowledgments differ from viewer input
acknowledgments, which only confirm enqueueing.

Typecheck, native build and 94 focused checks passed, covering coordinate taps,
refs, stale snapshot rejection, text/launch fallbacks, uncertain delivery and
shutdown. Raw samples and the reproduction program remain in
`artifacts/performance/implementation/tap-results.json` and `tap-benchmark.ts`.
