# SDK import experiment

Retain the main SDK export for theme helpers. The bundled `app-with-deps`
entrypoint duplicates modules already supplied by the main export.

Measured October 5, 2026 on this Mac, Bun 1.4.2 and Chromium. Sixteen alternating
cold browser-context pairs, first two pairs excluded as warm-up. Empty discovery
was mocked to isolate viewer startup; these are local startup measurements.

| Metric | Bundled styles import | Main export |
| --- | ---: | ---: |
| Minified JavaScript | 1,205,903 bytes | 858,231 bytes |
| Gzip JavaScript | 302,478 bytes | 231,275 bytes |
| Module evaluation p75 | 55.9 ms | 37.6 ms |
| Render opportunity p75 | 112.4 ms | 82.7 ms |
| Render opportunity p95 | 148.8 ms | 94.4 ms |

The source builds include the same experimental age instrumentation in both
variants. Startup render opportunity improved 26.4%, with less code and no
additional dependency. The viewer lifecycle tests cover theme initialization and
embedded host handshakes. Real-simulator HTTP preview and reference SDK MCP host
journeys are measured separately; they do not establish Codex-host latency.

Reproduction and raw samples are retained locally in
`artifacts/performance/ui/bundle-experiment.mjs` and `bundle-experiment.json`.

The full live journey ran 30 actions in each transport, with no protocol errors.
Pointer-to-visible-change p75 was 80.8 ms in preview and 78.0 ms in the reference
MCP host. Connection trials remained backend-dominated (17.01 s and 33.06 s).
Action p75 ranged from 1.59 s to 2.39 s, versus 1.51 s to 1.61 s in the earlier
baseline run. These ordered runs are diagnostics, not causal SDK comparisons;
the PR makes no connection or agent-action performance claim.
