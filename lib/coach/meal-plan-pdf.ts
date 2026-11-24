// Zero-dependency PDF 1.4 multi-page builder from JPEG page buffers, plus text wrapping
// and filename helpers. Tested directly in Node without browser APIs.

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

// 2x print-quality raster dimensions matching A4 aspect ratio (1 : 1.4142).
export const PDF_PAGE_WIDTH_PX = 1240;
export const PDF_PAGE_HEIGHT_PX = 1754;

export type PdfJpegPage = {
  jpegBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
};

const encoder = new TextEncoder();

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Builds a standards-compliant PDF 1.4 document with one A4 page per JPEG image.
 * Object layout:
 *   1: Catalog
 *   2: Pages
 *   For each page i (0..N-1):
 *     3 + i*3    : Image XObject (/DCTDecode)
 *     3 + i*3 + 1: Page content stream
 *     3 + i*3 + 2: Page dictionary
 */
export function buildPdfFromJpegs(pages: readonly PdfJpegPage[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error("At least one page is required to build a PDF");
  }

  const totalObjects = 2 + pages.length * 3;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let byteOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteOffset += bytes.length;
  };
  const pushText = (text: string) => {
    pushBytes(encoder.encode(text));
  };

  // PDF header with binary comment marker (recommended by PDF 1.4 spec).
  pushBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: Catalog
  offsets[1] = byteOffset;
  pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  const kidRefs = pages.map((_, idx) => `${3 + idx * 3 + 2} 0 R`).join(" ");
  offsets[2] = byteOffset;
  pushText(`2 0 obj\n<< /Type /Pages /Kids [ ${kidRefs} ] /Count ${pages.length} >>\nendobj\n`);

  const wPt = A4_WIDTH_PT.toFixed(2);
  const hPt = A4_HEIGHT_PT.toFixed(2);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const imgObj = 3 + i * 3;
    const contentObj = imgObj + 1;
    const pageObj = imgObj + 2;

    // Image XObject
    offsets[imgObj] = byteOffset;
    pushText(
      `${imgObj} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${Math.round(page.widthPx)} /Height ${Math.round(page.heightPx)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\n` +
        `stream\n`,
    );
    pushBytes(page.jpegBytes);
    pushText("\nendstream\nendobj\n");

    // Page content stream: draw full-bleed A4 image.
    const streamStr = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im0 Do\nQ\n`;
    const streamBytes = encoder.encode(streamStr);
    offsets[contentObj] = byteOffset;
    pushText(`${contentObj} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushText("endstream\nendobj\n");

    // Page object
    offsets[pageObj] = byteOffset;
    pushText(
      `${pageObj} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${wPt} ${hPt} ] ` +
        `/Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\n` +
        `endobj\n`,
    );
  }

  // Cross-reference table
  const xrefStart = byteOffset;
  pushText(`xref\n0 ${totalObjects + 1}\n`);
  pushText("0000000000 65535 f \n");
  for (let objId = 1; objId <= totalObjects; objId++) {
    pushText(`${String(offsets[objId]).padStart(10, "0")} 00000 n \n`);
  }

  pushText(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  );

  return concatBytes(chunks);
}

export function wrapTextLines(
  text: string,
  maxWidth: number,
  measureWidth: (s: string) => number,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureWidth(candidate) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Handle a single overlong word by splitting characters.
        if (measureWidth(word) > maxWidth) {
          let part = "";
          for (const ch of word) {
            if (part && measureWidth(part + ch) > maxWidth) {
              lines.push(part);
              part = ch;
            } else {
              part += ch;
            }
          }
          current = part;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

export function mealPlanPdfFilename(title: string): string {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `replog-${normalized || "meal-plan"}.pdf`;
}
