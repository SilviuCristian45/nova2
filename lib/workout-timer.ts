// Workout stopwatch based on timestamps instead of counting interval ticks: a background tab or a reload
// does not lose time, and the state is small enough to live in the workout draft.

export type TimerState = { elapsedMs: number; startedAt: number | null };

export const idleTimer: TimerState = { elapsedMs: 0, startedAt: null };

export function timerSeconds(timer: TimerState, now: number): number {
  const running = timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt);
  return Math.floor((timer.elapsedMs + running) / 1000);
}

export function startTimer(timer: TimerState, now: number): TimerState {
  return timer.startedAt === null ? { ...timer, startedAt: now } : timer;
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  return timer.startedAt === null
    ? timer
    : { elapsedMs: timer.elapsedMs + Math.max(0, now - timer.startedAt), startedAt: null };
}

// Reads a timer from stored JSON; anything malformed becomes an idle timer.
export function parseTimer(value: unknown): TimerState {
  if (!value || typeof value !== "object") return idleTimer;
  const { elapsedMs, startedAt } = value as Record<string, unknown>;
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0) return idleTimer;
  if (startedAt !== null && (typeof startedAt !== "number" || !Number.isFinite(startedAt))) return idleTimer;
  return { elapsedMs, startedAt };
}
