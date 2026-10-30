// Draws the workout card with the Canvas 2D API: no dependencies, no network, works offline.
// All positions come from computeLayout (see workout-summary-layout.ts); this file only paints them.
import type { WorkoutSummary } from "./workout-summary.ts";
import { CARD_HEIGHT, CARD_WIDTH, computeLayout, type Measure, type SummaryLabels } from "./workout-summary-layout.ts";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderWorkoutSummary(summary: WorkoutSummary, labels: SummaryLabels): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas is not available"));

  const measure: Measure = (text, size, weight) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  const layout = computeLayout(summary, labels, measure);

  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  background.addColorStop(0, "#09090b");
  background.addColorStop(0.6, "#0b1f1c");
  background.addColorStop(1, "#064e3b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glow = ctx.createRadialGradient(CARD_WIDTH - 120, 160, 0, CARD_WIDTH - 120, 160, 520);
  glow.addColorStop(0, "rgba(16,185,129,0.35)");
  glow.addColorStop(1, "rgba(16,185,129,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.textBaseline = "alphabetic";
  for (const item of layout.items) {
    if (item.kind === "rect") {
      roundRect(ctx, item.x, item.y, item.w, item.h, item.r);
      ctx.fillStyle = item.fill;
      ctx.fill();
      if (item.stroke) {
        ctx.strokeStyle = item.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      ctx.font = `${item.weight} ${item.size}px ${FONT}`;
      ctx.fillStyle = item.color;
      ctx.textAlign = item.align ?? "left";
      ctx.fillText(item.text, item.x, item.y);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image could not be created"))), "image/png");
  });
}
