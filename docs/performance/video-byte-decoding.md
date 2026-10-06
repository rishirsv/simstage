# Video byte decoding and inspection

Use `Uint8Array.fromBase64` when the browser provides it, retaining the existing
`atob` fallback. Annex B inspection uses `Uint8Array.indexOf(0)` to skip payload
bytes between possible start codes. Codec and picture metadata are unchanged.

Matched replay on October 6, 2026 used ten saved H.264/HEVC access units
(5,051–71,432 bytes), Bun 1.4.2 and Chrome 154. Native base64 is supported by that
browser. Each candidate's bytes and inspected metadata matched the baseline.

| Component | Measured reduction in CPU time | Absolute sample range, before → after |
| --- | ---: | --- |
| Browser base64 | 84.2–90.3% | 0.009–0.1082 → 0.0013–0.0171 ms |
| Browser inspection | 46.5–60.5% | 0.0043–0.0690 → 0.0017–0.0293 ms |
| Server inspection | 22.2–94.1% | 0.00340–0.08251 → 0.00037–0.05218 ms |

These are small per-frame component wins, not whole-video latency percentages.
No dependency or protocol change is required. Tests cover three/four-byte start
codes, leading zeros, adjacent empty NALs, truncated parameter sets, escaped
zeros, and subarray offsets. Typecheck and 29 codec/player/viewer checks pass.

Raw data and replay are retained locally in the ignored
`artifacts/performance/stream/real-frame-microbench.json` and `.ts` files.
