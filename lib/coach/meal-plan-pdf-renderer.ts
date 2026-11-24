// Browser Canvas 2D multi-page A4 renderer for Meal Plans.
// Uses native browser typography so Romanian diacritics (ă â î ș ț) render accurately,
// requires zero external PDF libraries, and works offline in the PWA.

import {
  computeDayMacros,
  computeItemMacros,
  computeMealMacros,
  mealPlanGoalLabel,
  mealTypeLabel,
  type MealPlanDocument,
  type Translator,
} from "./meal-plans";
import {
  PDF_PAGE_HEIGHT_PX,
  PDF_PAGE_WIDTH_PX,
  buildPdfFromJpegs,
  mealPlanPdfFilename,
  wrapTextLines,
  type PdfJpegPage,
} from "./meal-plan-pdf";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const MARGIN_X = 76;
const TOP_Y = 72;
const BOTTOM_LIMIT = PDF_PAGE_HEIGHT_PX - 86;
const CONTENT_W = PDF_PAGE_WIDTH_PX - MARGIN_X * 2;

const COLORS = {
  pageBg: "#ffffff",
  cardBg: "#f6f5f0",
  innerBg: "#ffffff",
  ink: "#0c0c0d",
  soft: "#44444a",
  muted: "#74747c",
  line: "#e5e3dc",
  limeFill: "#c8f031",
  limeText: "#3f5800",
  limeSoft: "#eff8c8",
  iceSoft: "#e4f2ff",
  iceText: "#165080",
  goldSoft: "#fff3d1",
  goldText: "#7c4e00",
  coralSoft: "#ffe7e0",
  coralText: "#a93516",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fill: string,
  textColor: string,
  fontSize = 18,
): number {
  ctx.font = `700 ${fontSize}px ${FONT}`;
  const textW = ctx.measureText(text).width;
  const padX = 16;
  const h = fontSize + 16;
  const w = textW + padX * 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode PDF page image"))),
      "image/jpeg",
      0.92,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export type RenderedMealPlanPdf = {
  blob: Blob;
  file: File;
  filename: string;
  pageCount: number;
};

export async function renderMealPlanPdf(
  plan: MealPlanDocument,
  options: { t: Translator; locale: string },
): Promise<RenderedMealPlanPdf> {
  const { t, locale } = options;
  const canvases: HTMLCanvasElement[] = [];

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let y = TOP_Y;

  const startPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = PDF_PAGE_WIDTH_PX;
    canvas.height = PDF_PAGE_HEIGHT_PX;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available");
    ctx = context;
    ctx.fillStyle = COLORS.pageBg;
    ctx.fillRect(0, 0, PDF_PAGE_WIDTH_PX, PDF_PAGE_HEIGHT_PX);
    canvases.push(canvas);
    y = TOP_Y;
  };

  const ensureSpace = (neededPx: number) => {
    if (y + neededPx > BOTTOM_LIMIT && y > TOP_Y + 40) {
      startPage();
    }
  };

  const measure = (font: string) => (text: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  startPage();

  // ---- Header Banner ----
  const descLines = plan.description
    ? wrapTextLines(plan.description, CONTENT_W - 56, measure(`400 20px ${FONT}`)).slice(0, 5)
    : [];
  const headerH = 148 + (descLines.length > 0 ? descLines.length * 28 + 16 : 0);

  roundRect(ctx!, MARGIN_X, y, CONTENT_W, headerH, 24);
  ctx!.fillStyle = COLORS.ink;
  ctx!.fill();

  // Brand tag & goal pill
  drawPill(ctx!, MARGIN_X + 28, y + 24, "REPLOG · NUTRITION", COLORS.limeFill, COLORS.ink, 15);
  const goalText = mealPlanGoalLabel(plan.goal, t).toUpperCase();
  ctx!.font = `700 15px ${FONT}`;
  const goalW = ctx!.measureText(goalText).width + 32;
  drawPill(ctx!, MARGIN_X + CONTENT_W - 28 - goalW, y + 24, goalText, "#242429", "#f5f4ef", 15);

  // Plan title
  ctx!.font = `800 36px ${FONT}`;
  ctx!.fillStyle = "#ffffff";
  ctx!.textBaseline = "top";
  ctx!.textAlign = "left";
  const titleLines = wrapTextLines(plan.title, CONTENT_W - 56, measure(`800 36px ${FONT}`)).slice(0, 2);
  let titleY = y + 72;
  for (const line of titleLines) {
    ctx!.fillText(line, MARGIN_X + 28, titleY);
    titleY += 42;
  }

  // Meta line: Coach + Client + Date
  const dateStr = new Date(plan.updatedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const metaParts = [`${t("Antrenor", "Coach")}: ${plan.coachName}`];
  if (plan.clientName) metaParts.push(`${t("Client", "Client")}: ${plan.clientName}`);
  metaParts.push(dateStr);

  ctx!.font = `500 18px ${FONT}`;
  ctx!.fillStyle = "#b8b8c0";
  ctx!.fillText(metaParts.join("  ·  "), MARGIN_X + 28, titleY + 2);

  if (descLines.length > 0) {
    ctx!.font = `400 20px ${FONT}`;
    ctx!.fillStyle = "#e4e4e7";
    let dy = titleY + 34;
    for (const line of descLines) {
      ctx!.fillText(line, MARGIN_X + 28, dy);
      dy += 28;
    }
  }

  y += headerH + 24;

  // ---- Daily Targets Strip ----
  const targetCards: { label: string; value: string; bg: string; fg: string }[] = [];
  if (plan.targetKcal !== null) {
    targetCards.push({ label: t("Calorii", "Calories"), value: `${plan.targetKcal} kcal`, bg: COLORS.limeSoft, fg: COLORS.limeText });
  }
  if (plan.targetProteinG !== null) {
    targetCards.push({ label: t("Proteine", "Protein"), value: `${plan.targetProteinG} g`, bg: COLORS.iceSoft, fg: COLORS.iceText });
  }
  if (plan.targetCarbsG !== null) {
    targetCards.push({ label: t("Carbohidrați", "Carbs"), value: `${plan.targetCarbsG} g`, bg: COLORS.goldSoft, fg: COLORS.goldText });
  }
  if (plan.targetFatG !== null) {
    targetCards.push({ label: t("Grăsimi", "Fat"), value: `${plan.targetFatG} g`, bg: COLORS.coralSoft, fg: COLORS.coralText });
  }
  if (plan.targetFiberG !== null) {
    targetCards.push({ label: t("Fibre", "Fiber"), value: `${plan.targetFiberG} g`, bg: COLORS.cardBg, fg: COLORS.soft });
  }
  if (plan.waterLiters !== null) {
    targetCards.push({ label: t("Hidratare", "Water"), value: `${plan.waterLiters} L`, bg: COLORS.iceSoft, fg: COLORS.iceText });
  }

  if (targetCards.length > 0) {
    ensureSpace(100);
    const gap = 14;
    const cardW = (CONTENT_W - gap * (targetCards.length - 1)) / targetCards.length;
    const cardH = 82;
    targetCards.forEach((card, idx) => {
      const cx = MARGIN_X + idx * (cardW + gap);
      roundRect(ctx!, cx, y, cardW, cardH, 16);
      ctx!.fillStyle = card.bg;
      ctx!.fill();
      ctx!.textAlign = "left";
      ctx!.textBaseline = "top";
      ctx!.font = `600 15px ${FONT}`;
      ctx!.fillStyle = card.fg;
      ctx!.fillText(card.label.toUpperCase(), cx + 16, y + 15);
      ctx!.font = `800 24px ${FONT}`;
      ctx!.fillStyle = COLORS.ink;
      ctx!.fillText(card.value, cx + 16, y + 40);
    });
    y += cardH + 28;
  }

  // ---- Days & Meals ----
  for (let di = 0; di < plan.days.length; di++) {
    const day = plan.days[di];
    const dayTotals = computeDayMacros(day.meals);

    const dayNotesLines = day.notes
      ? wrapTextLines(day.notes, CONTENT_W - 20, measure(`400 18px ${FONT}`))
      : [];
    ensureSpace(92 + dayNotesLines.length * 24);

    // Day Header
    roundRect(ctx!, MARGIN_X, y, CONTENT_W, 56, 14);
    ctx!.fillStyle = COLORS.cardBg;
    ctx!.fill();

    ctx!.textBaseline = "middle";
    ctx!.textAlign = "left";
    ctx!.font = `800 24px ${FONT}`;
    ctx!.fillStyle = COLORS.ink;
    ctx!.fillText(day.title, MARGIN_X + 20, y + 29);

    const daySummary = `${dayTotals.kcal} kcal  ·  P ${dayTotals.protein}g  ·  C ${dayTotals.carbs}g  ·  ${t("G", "F")} ${dayTotals.fat}g`;
    ctx!.font = `700 17px ${FONT}`;
    ctx!.fillStyle = COLORS.limeText;
    ctx!.textAlign = "right";
    ctx!.fillText(daySummary, MARGIN_X + CONTENT_W - 20, y + 29);

    y += 66;

    if (dayNotesLines.length > 0) {
      ctx!.textAlign = "left";
      ctx!.textBaseline = "top";
      ctx!.font = `400 18px ${FONT}`;
      ctx!.fillStyle = COLORS.soft;
      for (const line of dayNotesLines) {
        ctx!.fillText(line, MARGIN_X + 10, y);
        y += 24;
      }
      y += 10;
    }

    // Meals in day
    for (const meal of day.meals) {
      const mealTotals = computeMealMacros(meal.items);
      const mealNoteLines = meal.notes
        ? wrapTextLines(meal.notes, CONTENT_W - 44, measure(`400 17px ${FONT}`))
        : [];

      // Pre-calculate item row heights so the meal card stays clean and unbroken when possible.
      const itemLayouts = meal.items.map((item) => {
        const nameLines = wrapTextLines(
          item.brand ? `${item.name} (${item.brand})` : item.name,
          560,
          measure(`600 19px ${FONT}`),
        );
        const noteLines = item.notes
          ? wrapTextLines(item.notes, 560, measure(`400 16px ${FONT}`))
          : [];
        const rowH = Math.max(44, nameLines.length * 24 + noteLines.length * 20 + 16);
        return { item, nameLines, noteLines, rowH };
      });

      const itemsTotalH = itemLayouts.reduce((s, r) => s + r.rowH, 0);
      const mealCardH =
        68 + // header
        (meal.items.length > 0 ? 32 + itemsTotalH : 44) +
        (mealNoteLines.length > 0 ? mealNoteLines.length * 22 + 24 : 0) +
        14;

      // If the entire meal fits on a fresh page, start a new page before drawing it.
      if (mealCardH < BOTTOM_LIMIT - TOP_Y && y + mealCardH > BOTTOM_LIMIT) {
        startPage();
      } else {
        ensureSpace(140);
      }

      const cardStartY = y;
      // Draw meal header bar
      roundRect(ctx!, MARGIN_X, y, CONTENT_W, 56, 14);
      ctx!.fillStyle = COLORS.limeSoft;
      ctx!.fill();

      ctx!.textAlign = "left";
      ctx!.textBaseline = "middle";
      ctx!.font = `800 21px ${FONT}`;
      ctx!.fillStyle = COLORS.ink;
      const mealHeading = meal.timeLabel ? `${meal.title}  ·  ${meal.timeLabel}` : meal.title;
      ctx!.fillText(mealHeading, MARGIN_X + 20, y + 29);

      const typeLabel = mealTypeLabel(meal.mealType, t, meal.position);
      const redundantPrefix = meal.title.trim().toLowerCase().startsWith(typeLabel.toLowerCase());
      const macroText = `${mealTotals.kcal} kcal (P ${mealTotals.protein}g / C ${mealTotals.carbs}g / ${t("G", "F")} ${mealTotals.fat}g)`;
      const typeAndMacro = redundantPrefix ? macroText : `${typeLabel}  ·  ${macroText}`;
      ctx!.font = `700 16px ${FONT}`;
      ctx!.fillStyle = COLORS.limeText;
      ctx!.textAlign = "right";
      ctx!.fillText(typeAndMacro, MARGIN_X + CONTENT_W - 20, y + 29);

      y += 64;

      if (meal.items.length === 0) {
        ctx!.textAlign = "left";
        ctx!.textBaseline = "top";
        ctx!.font = `400 17px ${FONT}`;
        ctx!.fillStyle = COLORS.muted;
        ctx!.fillText(t("Fără alimente adăugate.", "No foods added."), MARGIN_X + 20, y + 6);
        y += 38;
      } else {
        // Table column headers
        ctx!.font = `700 14px ${FONT}`;
        ctx!.fillStyle = COLORS.muted;
        ctx!.textBaseline = "top";
        ctx!.textAlign = "left";
        ctx!.fillText(t("ALIMENT", "FOOD"), MARGIN_X + 20, y);
        ctx!.textAlign = "right";
        ctx!.fillText(t("CANT.", "QTY"), MARGIN_X + 685, y);
        ctx!.fillText("KCAL", MARGIN_X + 785, y);
        ctx!.fillText("P", MARGIN_X + 875, y);
        ctx!.fillText("C", MARGIN_X + 965, y);
        ctx!.fillText(t("G", "F"), MARGIN_X + CONTENT_W - 20, y);
        y += 24;

        ctx!.strokeStyle = COLORS.line;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.moveTo(MARGIN_X + 16, y);
        ctx!.lineTo(MARGIN_X + CONTENT_W - 16, y);
        ctx!.stroke();
        y += 8;

        for (let idx = 0; idx < itemLayouts.length; idx++) {
          const { item, nameLines, noteLines, rowH } = itemLayouts[idx];
          ensureSpace(rowH + 10);

          if (idx % 2 === 1) {
            roundRect(ctx!, MARGIN_X + 8, y - 4, CONTENT_W - 16, rowH, 8);
            ctx!.fillStyle = "#faf9f6";
            ctx!.fill();
          }

          const macros = computeItemMacros(item);
          ctx!.textBaseline = "top";
          ctx!.textAlign = "left";
          ctx!.font = `600 19px ${FONT}`;
          ctx!.fillStyle = COLORS.ink;
          let ly = y + 4;
          for (const nl of nameLines) {
            ctx!.fillText(nl, MARGIN_X + 20, ly);
            ly += 24;
          }
          if (noteLines.length > 0) {
            ctx!.font = `400 16px ${FONT}`;
            ctx!.fillStyle = COLORS.muted;
            for (const nl of noteLines) {
              ctx!.fillText(nl, MARGIN_X + 20, ly);
              ly += 20;
            }
          }

          ctx!.textAlign = "right";
          ctx!.font = `600 18px ${FONT}`;
          ctx!.fillStyle = COLORS.soft;
          ctx!.fillText(`${item.grams}g`, MARGIN_X + 685, y + 5);

          ctx!.font = `700 18px ${FONT}`;
          ctx!.fillStyle = COLORS.ink;
          ctx!.fillText(`${macros.kcal}`, MARGIN_X + 785, y + 5);

          ctx!.font = `600 18px ${FONT}`;
          ctx!.fillStyle = COLORS.iceText;
          ctx!.fillText(`${macros.protein}g`, MARGIN_X + 875, y + 5);

          ctx!.fillStyle = COLORS.goldText;
          ctx!.fillText(`${macros.carbs}g`, MARGIN_X + 965, y + 5);

          ctx!.fillStyle = COLORS.coralText;
          ctx!.fillText(`${macros.fat}g`, MARGIN_X + CONTENT_W - 20, y + 5);

          y += rowH;
        }
      }

      if (mealNoteLines.length > 0) {
        ensureSpace(mealNoteLines.length * 22 + 24);
        y += 6;
        roundRect(ctx!, MARGIN_X + 12, y, CONTENT_W - 24, mealNoteLines.length * 22 + 18, 10);
        ctx!.fillStyle = COLORS.cardBg;
        ctx!.fill();
        ctx!.textAlign = "left";
        ctx!.textBaseline = "top";
        ctx!.font = `400 17px ${FONT}`;
        ctx!.fillStyle = COLORS.soft;
        let ny = y + 10;
        for (const nl of mealNoteLines) {
          ctx!.fillText(nl, MARGIN_X + 24, ny);
          ny += 22;
        }
        y += mealNoteLines.length * 22 + 24;
      }

      // Subtle card border if meal stayed on the same page
      if (y > cardStartY) {
        ctx!.strokeStyle = COLORS.line;
        ctx!.lineWidth = 1.5;
        roundRect(ctx!, MARGIN_X, cardStartY, CONTENT_W, y - cardStartY + 6, 14);
        ctx!.stroke();
      }

      y += 24;
    }
  }

  // ---- General Guidelines / Coach Notes ----
  if (plan.notes) {
    const noteLines = wrapTextLines(plan.notes, CONTENT_W - 48, measure(`400 19px ${FONT}`));
    const boxH = 56 + noteLines.length * 26 + 20;
    if (boxH < BOTTOM_LIMIT - TOP_Y && y + boxH > BOTTOM_LIMIT) {
      startPage();
    } else {
      ensureSpace(120);
    }

    roundRect(ctx!, MARGIN_X, y, CONTENT_W, Math.min(boxH, BOTTOM_LIMIT - y), 16);
    ctx!.fillStyle = COLORS.cardBg;
    ctx!.fill();

    ctx!.textAlign = "left";
    ctx!.textBaseline = "top";
    ctx!.font = `800 20px ${FONT}`;
    ctx!.fillStyle = COLORS.ink;
    ctx!.fillText(t("Recomandări generale", "General guidelines"), MARGIN_X + 24, y + 18);

    ctx!.font = `400 19px ${FONT}`;
    ctx!.fillStyle = COLORS.soft;
    let ny = y + 52;
    for (const line of noteLines) {
      if (ny + 26 > BOTTOM_LIMIT) {
        startPage();
        ny = TOP_Y;
        ctx!.textAlign = "left";
        ctx!.textBaseline = "top";
        ctx!.font = `400 19px ${FONT}`;
        ctx!.fillStyle = COLORS.soft;
      }
      ctx!.fillText(line, MARGIN_X + 24, ny);
      ny += 26;
    }
  }

  // ---- Draw Footers with Page Numbers ----
  const totalPages = canvases.length;
  canvases.forEach((pageCanvas, idx) => {
    const pCtx = pageCanvas.getContext("2d");
    if (!pCtx) return;
    pCtx.strokeStyle = COLORS.line;
    pCtx.lineWidth = 1.5;
    pCtx.beginPath();
    pCtx.moveTo(MARGIN_X, PDF_PAGE_HEIGHT_PX - 64);
    pCtx.lineTo(PDF_PAGE_WIDTH_PX - MARGIN_X, PDF_PAGE_HEIGHT_PX - 64);
    pCtx.stroke();

    pCtx.font = `600 15px ${FONT}`;
    pCtx.fillStyle = COLORS.muted;
    pCtx.textBaseline = "middle";
    pCtx.textAlign = "left";
    pCtx.fillText(`RepLog · ${plan.title}`, MARGIN_X, PDF_PAGE_HEIGHT_PX - 40);

    pCtx.textAlign = "right";
    pCtx.fillText(
      `${t("Pagina", "Page")} ${idx + 1} / ${totalPages}`,
      PDF_PAGE_WIDTH_PX - MARGIN_X,
      PDF_PAGE_HEIGHT_PX - 40,
    );
  });

  const jpegPages: PdfJpegPage[] = await Promise.all(
    canvases.map(async (c) => ({
      jpegBytes: await canvasToJpegBytes(c),
      widthPx: c.width,
      heightPx: c.height,
    })),
  );

  const pdfBytes = buildPdfFromJpegs(jpegPages);
  const pdfBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;
  const filename = mealPlanPdfFilename(plan.title);
  const blob = new Blob([pdfBuffer], { type: "application/pdf" });
  const file = new File([blob], filename, { type: "application/pdf" });

  return { blob, file, filename, pageCount: totalPages };
}
