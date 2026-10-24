// Rest timer between sets. The timer stores when the rest ends, not a countdown, so it stays right
// when the browser throttles a background tab or the page reloads.

export const REST_PRESETS = [60, 90, 120, 180, 240];
export const DEFAULT_REST_SECONDS = 90;

export function clampRest(seconds: number): number {
  return Number.isFinite(seconds) ? Math.min(600, Math.max(15, Math.round(seconds))) : DEFAULT_REST_SECONDS;
}

export function remainingSeconds(endAt: number, now: number): number {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
