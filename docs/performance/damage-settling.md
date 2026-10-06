# Damage settling without video

A persistent damage observer handles settled simulator actions without an active
video channel. It retains the current surface wrapper to receive screen damage,
without creating Core Image contexts or encoding video. It reattaches after app
relaunch; disconnect, expiry, shutdown, and parent EOF release it. Physical
devices and failed attachments retain screenshot polling. Active video retains
its existing damage-settling path.

October 6, 2026, Bun 1.4.2, real Xcode bridge on the dedicated iOS simulator:
30 alternating static pairs, plus five pairs for each controlled animation.
Every sample relaunches the fixture, waits for the actual button to exist, and
checks that the final fresh hierarchy reports Marker 1. Both variants include
fresh selector validation, identical bridge input, and a final observation.

| No-viewer action | Polling p75 | Observer p75 | Total settling screenshots, before → after |
| --- | ---: | ---: | ---: |
| Static (30 samples each) | 2,329.55 ms | 1,634.18 ms | 60 → 0 |
| One-second animation (5 each) | 2,983.66 ms | 2,304.35 ms | 17 → 0 |
| Continuous animation (5 each) | 3,925.29 ms | 4,152.68 ms | 34 → 0 |

Static p75 improves 695.37 ms (29.8%). All static and one-second samples become
quiet; all continuous samples correctly return `quiet=false`. The continuous
path is 227.39 ms slower at sample p75, while removing polling subprocesses.
Five animation samples are descriptive, not population tail estimates. The
150 ms quiet window and 2,500 ms settling deadline remain unchanged.

An earlier prototype stopped receiving damage after relaunch and falsely
reported quiet. Its attractive animation timings were discarded. Retaining the
surface and reattaching for a changed foreground application PID fixes that
failure. Native damage deadlines, shared attachment, teardown, no-video routing,
and existing active-video routing pass focused tests and typecheck.

Raw runs, fixtures, and diagnostics remain in ignored
`artifacts/performance/implementation`: `observer-production-benchmark.ts`,
`observer-production-results.json`, `observer-production-v5.log`, and
`observer-diagnostic.json`. No encoded output is produced by the observer.
