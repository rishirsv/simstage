# Native-resolution HEVC encoder buffers

Use an NV12 video-range encoder pool for unrotated, unscaled HEVC frames. Core
Image still performs required Display P3 → sRGB conversion into an owned buffer.
Retain BGRA for H.264, scaled output, and rotation; those paths did not establish
comparable total CPU gains. A direct or identity copy of the real surface was
rejected because it would bypass required color conversion.

October 6, 2026, three alternating pairs per codec on the real simulator,
1206×2622 native resolution, continuous CADisplayLink animation, fixed 60 fps cap.
Capture-to-output and bytes cover a warm 3.5-second window per five-second run.
Helper CPU includes startup and excludes external encoder/GPU processes.

| HEVC mean across runs | BGRA pool | NV12 pool |
| --- | ---: | ---: |
| Capture-to-output | 12.079 ms | 9.547 ms |
| Helper CPU per run | 1.070 s | 0.820 s |
| Bytes/sec | 295,973 | 292,593 |
| Emitted fps | 52.95 | 52.67 |

This saves 2.532 ms (21%) on the measured native path and 23.4% helper CPU,
without increasing bytes. It is not a whole-viewer latency claim. H.264 reduced
capture-to-output by 1.178 ms but did not improve helper CPU, so it retains BGRA.
The prior scaled NV12 experiment lacked total-path evidence and stays excluded.

All 90 decoded mutable-source HEVC frames have the correct submitted color/frame
identity, with identical mean color error (0.167/255) in both variants. A static
real Display P3 screenshot comparison gives mean candidate/baseline channel
difference 0.238/255 and PSNR 41.75 dB. Against the screenshot reference, PSNR is
19.31 → 19.33 dB; the existing video color/rendering differences remain shared.
Dimensions match. Native tests check the actual VideoToolbox pool format for
native portrait HEVC and BGRA fallback for scaling, rotation, and H.264.
Typecheck, native tests, and build pass.

Raw prototypes and results remain under ignored
`artifacts/performance/implementation`: `live-nv12-results.json`,
`nv12-hevc-quality.json`, `native-still-quality.json`, and `check-copy-path.json`.
The eligibility diagnostic records Display P3 input and confirms that identity
copy timings cannot establish a real copy-path gain on this host.
