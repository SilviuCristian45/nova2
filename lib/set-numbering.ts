// Set numbers. What is stored in `set_number` is the position of the set in the workout (1..n): it is the only
// thing that keeps the real order of sets across exercises. What the user sees is the number of the set
// within its exercise (1, 2, 3 for each exercise), derived from that order, so it stays right after any
// add or delete and is the same on /insert, /offline, /edit and in the history.

// `order` is anything that sorts the sets in their real order (list index, or the stored set_number).
// Ties keep the list order.
export function displayOrdinals(sets: readonly { exercise: string; order: number }[]): number[] {
  const ranked = sets.map((set, index) => ({ ...set, index })).sort((a, b) => a.order - b.order || a.index - b.index);
  const seen = new Map<string, number>();
  const result: number[] = new Array(sets.length);
  for (const set of ranked) {
    const next = (seen.get(set.exercise) ?? 0) + 1;
    seen.set(set.exercise, next);
    result[set.index] = next;
  }
  return result;
}

// Stored numbers for a list that is about to be saved: the position in the list.
export function positionSetNumbers<T>(sets: readonly T[]): (T & { setNumber: number })[] {
  return sets.map((set, index) => ({ ...set, setNumber: index + 1 }));
}
