// Synchronous re-entrancy guard for save buttons. React state (isSaving, disabled) only updates on the next
// render, so a fast double-click can start a second save first; a plain flag flips immediately.
export function createSubmitGuard() {
  let busy = false;
  return {
    // True for the first caller only; everyone else is rejected until release().
    acquire(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
    get busy() {
      return busy;
    },
  };
}

export type SubmitGuard = ReturnType<typeof createSubmitGuard>;

// Runs `task` once at a time. The guard stays locked after a successful run (the caller is about to leave the
// page) and is released when the task reports failure by returning false or throwing.
export async function runGuarded(guard: SubmitGuard, task: () => Promise<boolean>): Promise<"skipped" | "done" | "failed"> {
  if (!guard.acquire()) return "skipped";
  try {
    if (await task()) return "done";
  } catch (error) {
    guard.release();
    throw error;
  }
  guard.release();
  return "failed";
}
