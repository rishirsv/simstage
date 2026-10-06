import type { VideoMilestone } from "./video-player.js";

/** Keep the full round-trip bound for old servers or invalid wait measurements. */
export function deliveryBoundMs(elapsedMs: number, waitMs: unknown): number {
  return typeof waitMs === "number" && Number.isFinite(waitMs) && waitMs >= 0 && waitMs <= elapsedMs
    ? elapsedMs - waitMs : elapsedMs;
}

/** Bounded, local aggregates; no network telemetry or per-frame history. */
export class VideoMetrics {
  private phases: Partial<Record<VideoMilestone["phase"], { count: number; totalAgeMs: number; maxAgeMs: number }>> = {};
  record(event: VideoMilestone) {
    const phase = this.phases[event.phase] ??= { count: 0, totalAgeMs: 0, maxAgeMs: 0 };
    phase.count++;
    phase.totalAgeMs += event.ageMs;
    phase.maxAgeMs = Math.max(phase.maxAgeMs, event.ageMs);
  }
  snapshot() {
    return Object.fromEntries(Object.entries(this.phases).map(([phase, value]) => [phase, {
      count: value.count, meanAgeMs: value.totalAgeMs / value.count, maxAgeMs: value.maxAgeMs,
    }]));
  }
}
