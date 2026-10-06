export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

/** Reserve room for the bezel, padding and the toolbar below the screen. */
export function fitScreenScale(viewport: { width: number; height: number }, screen: { width: number; height: number }) {
  if (!screen.width || !screen.height) return 1;
  return Math.max(0.05, Math.min((viewport.width - 64) / screen.width, (viewport.height - 120) / screen.height));
}

export function stepScreenZoom(scale: number, direction: -1 | 1) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((scale + direction * 0.25) * 100) / 100));
}
