# Sustained stream downsizing

Restart live video at the current display size after a reduction of at least
25% persists for 500 ms. Cancel the pending shrink when the panel rebounds, and
wait for a held touch or pointer to finish. Dispose the resize observer and timer
with the viewer attachment. Existing growth behavior remains in place.

October 6, 2026, Chrome 154 HTTP preview, genuine continuous simulator animation,
three alternating pairs: viewport height 1050 → 600 at device pixel ratio 1.
A 200 ms reduction and rebound precedes the sustained reduction.

| Mean across runs | Retained larger stream | Sustained shrink |
| --- | ---: | ---: |
| Output dimensions | 412×896 | 234×512 |
| Bytes/sec | 108,569 | 88,427 |
| Native encode time | 2.769 ms | 2.073 ms |
| Capture-to-output age | 5.059 ms | 4.614 ms |
| Restarts after rebound | 0 | 0 |
| Restarts after sustained shrink | 0 | 1 |

Output pixels fall 67.5%; measured bytes fall 18.6% and mean encode time falls
25.1%. These are stream components, not full action latency gains. Encoding
statistics cover the helper lifetime; final-window age/bytes cover 3.5 seconds.
Screenshots show the same layout and no clipping; small text is slightly softer
at the tested 1× scale, while row labels remain readable. Requests account for
the actual display pixel ratio.

Focused viewer tests pass for rebound cancellation, sustained shrink, held
pointer deferral, obsolete stream cleanup, and attachment disposal. Real rotation
validation checks the current landscape video against fresh logical coordinates.
Raw measurements and screenshots remain under ignored
`artifacts/performance/implementation`: `resize-results.json`,
`resize-benchmark-v2.log`, `resize-*.png`, and `rotation.log`.
