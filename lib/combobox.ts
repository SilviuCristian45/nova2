// Keyboard navigation of the exercise combobox (WAI-ARIA listbox pattern): which option is active after a key.
export function nextActiveIndex(key: string, active: number, count: number): number {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return active + 1 >= count ? 0 : active + 1;
  if (key === "ArrowUp") return active <= 0 ? count - 1 : active - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return active;
}
