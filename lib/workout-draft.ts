// Restoring the saved workout draft. The draft is read only once the signed-in owner is known, which
// can happen after the user already started logging, so what is on screen wins over a stored draft.

export type DraftState<S = unknown, C = unknown> = { sets: S[]; cardio: C[]; mode: "strength" | "cardio" };

export function restoreDraft<S, C>(current: DraftState<S, C>, stored: string | null): DraftState<S, C> {
  const parsed = stored ? JSON.parse(stored) : { sets: [], cardio: [], mode: "strength" };
  if (!Array.isArray(parsed.sets) || !Array.isArray(parsed.cardio)) throw new Error("Invalid workout draft");
  if (current.sets.length || current.cardio.length) return current;
  return { sets: parsed.sets, cardio: parsed.cardio, mode: parsed.mode === "cardio" ? "cardio" : "strength" };
}

// Used by /offline, which cannot continue the /insert draft but must not let it be forgotten.
export function draftHasEntries(stored: string | null): boolean {
  try {
    const parsed = stored ? JSON.parse(stored) : null;
    return Boolean(parsed && ((Array.isArray(parsed.sets) && parsed.sets.length) || (Array.isArray(parsed.cardio) && parsed.cardio.length)));
  } catch {
    return false;
  }
}
