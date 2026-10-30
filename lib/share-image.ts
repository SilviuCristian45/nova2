// Web Share API wrapper with explicit fallbacks. Takes the navigator as a parameter so it can be tested.
type ShareNavigator = {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
};

export type ShareResult = "shared" | "cancelled" | "unsupported" | "failed";

export function canShareFile(nav: ShareNavigator | undefined, file: File | null): boolean {
  if (!nav || !file || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

// "unsupported" and "failed" tell the UI to point the user to "Save image" instead.
export async function shareImageFile(nav: ShareNavigator | undefined, file: File, title: string): Promise<ShareResult> {
  if (!canShareFile(nav, file)) return "unsupported";
  try {
    await nav!.share!({ files: [file], title });
    return "shared";
  } catch (error) {
    // Closing the share sheet rejects with AbortError: that is the user's choice, not a failure.
    return (error as { name?: string } | null)?.name === "AbortError" ? "cancelled" : "failed";
  }
}

// iOS Safari (including iPadOS, which reports itself as a Mac) may open a downloaded PNG in a tab
// instead of saving it, so the UI explains the long-press way to save it.
export function isIOSLike(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}
