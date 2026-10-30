// Layout of the workout card, separated from drawing so it can be tested without a canvas.
// The card is always 1080x1920 (9:16). Content is placed with a fixed, predictable ladder of tiers:
// the first tier whose content fits wins, and the last tier lists as many whole exercises as fit and says
// how many were left out. Exercises and records are never dropped in any other situation.
import type { WorkoutSummary } from "./workout-summary.ts";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
export const PAD = 80;
export const CONTENT_BOTTOM = CARD_HEIGHT - 150; // the footer lives below this line
export const MIN_FONT_SIZE = 20;

const INNER = CARD_WIDTH - PAD * 2;
const CONTENT_TOP = 650; // below the header and the stat tiles

export const COLORS = {
  text: "#fafafa", soft: "#e4e4e7", muted: "#a1a1aa", emerald: "#10b981", emeraldLight: "#6ee7b7", onEmerald: "#052e2b",
  tile: "rgba(255,255,255,0.06)", recordFill: "rgba(16,185,129,0.14)", recordStroke: "rgba(16,185,129,0.45)",
} as const;

export type Measure = (text: string, size: number, weight: number) => number;

export type LayoutItem =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; fill: string; stroke?: string }
  | { kind: "text"; text: string; x: number; y: number; size: number; weight: number; color: string; align?: "left" | "right" | "center" };

export type SummaryLabels = {
  recordsTitle: string;
  recordBadge: string;
  moreExercises: (count: number) => string;
  moreSets: (count: number) => string;
  setsSummary: (total: number, top: string) => string;
};

export type CardLayout = { items: LayoutItem[]; tier: string; bottom: number; hiddenExercises: number };

type Tier = {
  name: string; cols: 1 | 2 | 3; nameSize: number; setSize: number; nameLines: number; setLines: number;
  gap: number; recordSize: number; recordRow: number; recordCols: 1 | 2; compactSets: boolean;
};

// Smallest text is 20px (about 1.9% of the card width). Tiers only get denser when the workout needs it.
const TIERS: Tier[] = [
  { name: "comfortable", cols: 1, nameSize: 40, setSize: 30, nameLines: 2, setLines: 2, gap: 30, recordSize: 32, recordRow: 56, recordCols: 1, compactSets: false },
  { name: "comfortable-90", cols: 1, nameSize: 36, setSize: 27, nameLines: 2, setLines: 2, gap: 27, recordSize: 29, recordRow: 50, recordCols: 1, compactSets: false },
  { name: "comfortable-80", cols: 1, nameSize: 32, setSize: 24, nameLines: 2, setLines: 2, gap: 24, recordSize: 26, recordRow: 45, recordCols: 1, compactSets: false },
  { name: "two-columns", cols: 2, nameSize: 28, setSize: 22, nameLines: 1, setLines: 2, gap: 22, recordSize: 24, recordRow: 40, recordCols: 2, compactSets: false },
  { name: "three-columns", cols: 3, nameSize: 24, setSize: 20, nameLines: 1, setLines: 1, gap: 16, recordSize: 22, recordRow: 36, recordCols: 2, compactSets: true },
];

function ellipsize(text: string, maxWidth: number, size: number, weight: number, measure: Measure): string {
  if (measure(text, size, weight) <= maxWidth) return text;
  let cut = text.trimEnd();
  while (cut.length > 1 && measure(`${cut}…`, size, weight) > maxWidth) cut = cut.slice(0, -1).trimEnd();
  return `${cut}…`;
}

// Word wrap into at most `maxLines`; whatever does not fit ends the last line with an ellipsis.
function wrapLines(text: string, maxWidth: number, size: number, weight: number, maxLines: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (line && measure(next, size, weight) > maxWidth) {
      if (lines.length === maxLines - 1) {
        line = `${line} ${words.slice(i).join(" ")}`;
        break;
      }
      lines.push(line);
      line = words[i];
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).map((entry, index, all) =>
    index === all.length - 1 || measure(entry, size, weight) > maxWidth ? ellipsize(entry, maxWidth, size, weight, measure) : entry,
  );
}

function fitSize(text: string, maxWidth: number, sizes: number[], weight: number, measure: Measure): number {
  return sizes.find((size) => measure(text, size, weight) <= maxWidth) ?? sizes[sizes.length - 1];
}

function header(summary: WorkoutSummary, measure: Measure): LayoutItem[] {
  const items: LayoutItem[] = [
    { kind: "rect", x: PAD, y: 90, w: 84, h: 84, r: 22, fill: COLORS.emerald },
    { kind: "text", text: "R", x: PAD + 42, y: 152, size: 54, weight: 900, color: COLORS.onEmerald, align: "center" },
    { kind: "text", text: "RepLog", x: PAD + 108, y: 150, size: 48, weight: 800, color: COLORS.text },
  ];
  const titleSize = fitSize(summary.title, INNER, [110, 92, 76, 62, 52], 900, measure);
  items.push({ kind: "text", text: ellipsize(summary.title, INNER, titleSize, 900, measure), x: PAD, y: 330, size: titleSize, weight: 900, color: COLORS.text });
  const dateSize = fitSize(summary.dateLabel, INNER, [34, 30, 26, 22], 500, measure);
  items.push({ kind: "text", text: ellipsize(summary.dateLabel, INNER, dateSize, 500, measure), x: PAD, y: 392, size: dateSize, weight: 500, color: COLORS.muted });

  const gap = 20;
  const count = Math.max(summary.stats.length, 1);
  const tileWidth = (INNER - gap * (count - 1)) / count;
  summary.stats.forEach((stat, index) => {
    const x = PAD + index * (tileWidth + gap);
    const textWidth = tileWidth - 44;
    const valueSize = fitSize(stat.value, textWidth, [46, 40, 34, 28, 24], 800, measure);
    const labelText = stat.label.toUpperCase();
    const labelSize = fitSize(labelText, textWidth, [22, 20], 600, measure);
    items.push(
      { kind: "rect", x, y: 450, w: tileWidth, h: 150, r: 28, fill: COLORS.tile },
      { kind: "text", text: ellipsize(stat.value, textWidth, valueSize, 800, measure), x: x + 22, y: 520, size: valueSize, weight: 800, color: COLORS.text },
      { kind: "text", text: ellipsize(labelText, textWidth, labelSize, 600, measure), x: x + 22, y: 566, size: labelSize, weight: 600, color: COLORS.muted },
    );
  });
  return items;
}

function footer(): LayoutItem[] {
  return [
    { kind: "rect", x: PAD, y: CARD_HEIGHT - 110, w: 64, h: 6, r: 0, fill: COLORS.emerald },
    { kind: "text", text: "RepLog", x: PAD, y: CARD_HEIGHT - 56, size: 28, weight: 600, color: COLORS.muted },
  ];
}

function recordsBox(summary: WorkoutSummary, tier: Tier, labels: SummaryLabels, top: number, measure: Measure) {
  const items: LayoutItem[] = [];
  const records = summary.records;
  if (records.length === 0) return { items, bottom: top };
  const cols = tier.recordCols;
  const headH = cols === 1 ? 96 : 80;
  const rows = Math.ceil(records.length / cols);
  const boxH = headH + rows * tier.recordRow + 20;
  items.push({ kind: "rect", x: PAD, y: top, w: INNER, h: boxH, r: 32, fill: COLORS.recordFill, stroke: COLORS.recordStroke });
  items.push({ kind: "text", text: `★  ${labels.recordsTitle.toUpperCase()}`, x: PAD + 36, y: top + 56, size: cols === 1 ? 28 : 24, weight: 800, color: COLORS.emeraldLight });
  const cellW = (INNER - 72 - (cols - 1) * 24) / cols;
  records.forEach((record, index) => {
    const x = PAD + 36 + (index % cols) * (cellW + 24);
    const baseline = top + headH + Math.floor(index / cols) * tier.recordRow;
    const valueWidth = measure(record.text, tier.recordSize, 700);
    items.push({ kind: "text", text: record.text, x: x + cellW, y: baseline, size: tier.recordSize, weight: 700, color: COLORS.text, align: "right" });
    items.push({
      kind: "text", text: ellipsize(record.name, Math.max(cellW - valueWidth - 24, 40), tier.recordSize, 600, measure),
      x, y: baseline, size: tier.recordSize, weight: 600, color: COLORS.soft,
    });
  });
  return { items, bottom: top + boxH };
}

type Cell = { items: LayoutItem[]; height: number };

function exerciseCell(exercise: WorkoutSummary["exercises"][number], tier: Tier, labels: SummaryLabels, x: number, width: number, measure: Measure): Cell {
  const items: LayoutItem[] = [];
  let y = 0; // relative; shifted when the row is placed
  const place = (item: LayoutItem) => items.push(item);

  if (tier.cols === 1) {
    const pillSize = Math.max(MIN_FONT_SIZE, Math.round(tier.nameSize * 0.55));
    const pillText = labels.recordBadge.toUpperCase();
    const pillW = exercise.record ? measure(pillText, pillSize, 800) + 36 : 0;
    const nameLines = wrapLines(exercise.name, width - (pillW ? pillW + 16 : 0), tier.nameSize, 800, tier.nameLines, measure);
    const lineH = Math.round(tier.nameSize * 1.2);
    nameLines.forEach((line, index) => place({ kind: "text", text: line, x, y: y + lineH * (index + 1) - 8, size: tier.nameSize, weight: 800, color: COLORS.text }));
    if (exercise.record) {
      place({ kind: "rect", x: x + width - pillW, y: y + 4, w: pillW, h: Math.round(tier.nameSize * 0.85), r: 20, fill: COLORS.emerald });
      place({ kind: "text", text: pillText, x: x + width - pillW / 2, y: y + 4 + Math.round(tier.nameSize * 0.85) * 0.72, size: pillSize, weight: 800, color: COLORS.onEmerald, align: "center" });
    }
    y += lineH * nameLines.length + 8;
  } else {
    const label = `${exercise.record ? "★ " : ""}${exercise.name}`;
    place({ kind: "text", text: ellipsize(label, width, tier.nameSize, 800, measure), x, y: y + tier.nameSize, size: tier.nameSize, weight: 800, color: exercise.record ? COLORS.emeraldLight : COLORS.text });
    y += Math.round(tier.nameSize * 1.2) + 6;
  }

  const extra = exercise.hiddenSets > 0 ? `  ·  ${labels.moreSets(exercise.hiddenSets)}` : "";
  const setLines = tier.compactSets
    ? [ellipsize(labels.setsSummary(exercise.totalSets, exercise.top), width, tier.setSize, 500, measure)]
    : wrapLines(exercise.sets.join("  ·  ") + extra, width, tier.setSize, 500, tier.setLines, measure);
  const setLineH = Math.round(tier.setSize * 1.3);
  setLines.forEach((line, index) => place({ kind: "text", text: line, x, y: y + setLineH * (index + 1) - 6, size: tier.setSize, weight: 500, color: COLORS.muted }));
  y += setLineH * setLines.length;
  return { items, height: y + tier.gap };
}

function shift(item: LayoutItem, dy: number): LayoutItem {
  return { ...item, y: item.y + dy };
}

function build(summary: WorkoutSummary, tier: Tier, labels: SummaryLabels, measure: Measure, allowCut: boolean) {
  const items: LayoutItem[] = [];
  const records = recordsBox(summary, tier, labels, CONTENT_TOP, measure);
  items.push(...records.items);
  let y = records.bottom + (records.items.length ? 44 : 0);

  const gapX = 24;
  const cellW = (INNER - gapX * (tier.cols - 1)) / tier.cols;
  const rows: { items: LayoutItem[]; height: number; count: number }[] = [];
  for (let start = 0; start < summary.exercises.length; start += tier.cols) {
    const cells = summary.exercises.slice(start, start + tier.cols).map((exercise, column) =>
      exerciseCell(exercise, tier, labels, PAD + column * (cellW + gapX), cellW, measure));
    rows.push({ items: cells.flatMap((cell) => cell.items), height: Math.max(...cells.map((cell) => cell.height)), count: cells.length });
  }

  const moreH = Math.round(tier.setSize * 1.3) + 20;
  let used = rows.length;
  const total = () => rows.slice(0, used).reduce((sum, row) => sum + row.height, 0);
  let hidden = 0;
  if (allowCut) {
    while (used > 0 && y + total() > CONTENT_BOTTOM - (used < rows.length ? moreH : 0)) used--;
    hidden = rows.slice(used).reduce((sum, row) => sum + row.count, 0);
  }
  rows.slice(0, used).forEach((row) => {
    items.push(...row.items.map((item) => shift(item, y)));
    y += row.height;
  });
  if (hidden > 0) {
    items.push({ kind: "text", text: labels.moreExercises(hidden), x: PAD, y: y + tier.setSize, size: tier.setSize, weight: 600, color: COLORS.muted });
    y += moreH;
  }
  return { items, bottom: y, hidden };
}

export function computeLayout(summary: WorkoutSummary, labels: SummaryLabels, measure: Measure): CardLayout {
  const base = header(summary, measure);
  for (let index = 0; index < TIERS.length; index++) {
    const last = index === TIERS.length - 1;
    const result = build(summary, TIERS[index], labels, measure, last);
    if (last || result.bottom <= CONTENT_BOTTOM) {
      return { items: [...base, ...result.items, ...footer()], tier: TIERS[index].name, bottom: result.bottom, hiddenExercises: result.hidden };
    }
  }
  throw new Error("unreachable");
}
