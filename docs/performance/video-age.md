# Relay age accounting and local milestones

Subtract measured server long-poll wait from the RPC round trip before adding
its remaining conservative delivery bound to server frame age. Missing or invalid
wait measurements retain the full round-trip bound. The stale threshold remains
500 ms, including time spent waiting for the browser decoder and renderer.

A controlled player experiment separates four cases:

| Response | Old bound | Corrected bound | Recovery requests, before → after |
| --- | ---: | ---: | ---: |
| Fresh frame: age 10 ms, RTT 270 ms, wait 250 ms | 280 ms | 30 ms | 0 → 0 |
| Frame age 260 ms, RTT 280 ms, wait 250 ms | 540 ms | 290 ms | 1 → 0 |
| Delayed response: age 10 ms, RTT 800 ms, wait 250 ms | 810 ms | 560 ms | 1 → 1 |

The middle case removes a false recovery caused by counting server wait twice.
It establishes correctness under that condition, not its frequency in a real
host or an improvement in median video latency. Thirty preview and thirty
reference SDK-host journey samples per variant are documented in
[the SDK experiment](sdk-import.md); connection timings are individual trials.

The viewer now retains bounded local counts and mean/max ages for receive,
decode-start, decode, draw, rendering opportunity, stale drop, chain reset, and
keyframe recovery. Received milestones precede decoder backpressure; recovery
counts include frames rejected before any decode. One latest metadata identity
is retained without its payload. `getVideoDiagnostics()` exposes a copy of
aggregates; no external telemetry service is introduced. Presentation denotes a
rendering opportunity, not physical scanout.

Validation: typecheck and focused video, player, transport, and viewer tests,
including the cases above and invalid/old-server wait fallback. Raw checks and
journey artifacts remain under ignored `artifacts/performance`.
