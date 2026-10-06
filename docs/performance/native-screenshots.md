# Native point-image conversion

Replace `sips` with ImageIO in the packaged simulator helper. Agent screenshots
retain the logical-point long edge and JPEG quality 0.65; full-resolution viewer
captures bypass conversion. An unreadable input still falls back to the original
PNG through the existing capture behavior.

Measured October 6, 2026 on macOS with Bun 1.4.2: 30 alternating pairs using the
same real 1206×2622 simulator screenshot, resized to 402×874. Each sample includes
process startup, conversion, and reading the JPEG. Both paths launch one process.

| Conversion plus read | sips | ImageIO |
| --- | ---: | ---: |
| p50 | 20.59 ms | 15.56 ms |
| p75 | 21.47 ms | 16.54 ms |
| p95 | 24.38 ms | 19.12 ms |
| JPEG bytes | 16,653 | 16,509 |

The measured p75 saving is 4.93 ms (23%), smaller than the plan's 30–60 ms
hypothesis. This is a component improvement; it does not establish a full-action
latency reduction. The first ImageIO invocation took 168.64 ms, so the warm
percentiles do not imply improved first-use latency.

Dimensions match exactly, preserving the point-coordinate contract. Comparing
both decoded JPEGs gives mean absolute channel difference 0.27/255 and PSNR
45.11 dB. The native fixture checks proportional dimensions, readable output,
and rejection of missing input. Typecheck and native framing/conversion tests
pass.

Raw samples and reproduction scripts remain in the ignored local directory
`artifacts/performance/implementation`: `converter-benchmark.ts`,
`converter-results.json`, `image-quality.mjs`, and `image-quality.json`.
