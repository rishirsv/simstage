# Damage settling experiment

Use a persistent damage-only simulator observer when there is no active video
capture. It registers the same screen callbacks as video, without creating a
Core Image context, retaining image buffers, or submitting frames for encoding.
Active viewers retain their existing settling path; physical devices and failed
observer attachments retain screenshot polling.

Thirty alternating pairs per path on the dedicated simulator, with the same
bridge input and final observation in both variants:

| No-viewer action | Screenshot polling p75 | Damage observer p75 | Settling screenshots |
| --- | ---: | ---: | ---: |
| Static tap | 1,805.2 ms | 1,201.9 ms | 2 → 0 per action |
| Scroll | 2,732.5 ms | 1,834.9 ms | 2 → 0 per action |

The quiet window remains 150 ms; the no-viewer deadline remains 2,500 ms. The
native observer returns a distinct boolean for quiet versus deadline expiry.
Both outcomes produce one final fresh observation. Attachment is lazy, before
input; the first action includes helper startup. Warm observations establish
the ROI above. Session expiry, disconnect, hub shutdown and parent EOF release
the observer. Pending settling requests reject on teardown.

Validation covers native damage deadlines, shared attachment, continuous damage,
no-video action routing, fallback, and session cleanup. Raw alternating runs and
native prototypes are retained in `artifacts/performance/implementation`.
