"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Printer,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { Badge, Button, Card, CardTitle, Message } from "@/app/components/ui";
import { formatMealPlanAsText, type MealPlanDocument } from "@/lib/coach/meal-plans";
import { renderMealPlanPdf } from "@/lib/coach/meal-plan-pdf-renderer";
import { shareImageFile } from "@/lib/share-image";

export type ShareLinkControls = {
  token: string | null;
  onEnable: () => Promise<{ shareToken?: string | null; error?: string }>;
  onDisable: () => Promise<{ shareToken?: string | null; error?: string }>;
  onRegenerate: () => Promise<{ shareToken?: string | null; error?: string }>;
};

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function MealPlanExportBar({
  plan,
  shareLink,
  compact = false,
}: {
  plan: MealPlanDocument;
  shareLink?: ShareLinkControls;
  compact?: boolean;
}) {
  const { t, locale } = useLanguage();
  const [busy, setBusy] = useState<"download" | "share" | "link" | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "lime" | "red" | "ice"; text: string } | null>(null);
  const [token, setToken] = useState<string | null>(shareLink?.token ?? plan.shareToken ?? null);

  async function handleDownloadPdf() {
    setBusy("download");
    setFeedback(null);
    try {
      const rendered = await renderMealPlanPdf(plan, { t, locale });
      triggerBlobDownload(rendered.blob, rendered.filename);
      setFeedback({
        tone: "lime",
        text: t(
          `PDF descărcat (${rendered.pageCount} ${rendered.pageCount === 1 ? "pagină" : "pagini"}).`,
          `PDF downloaded (${rendered.pageCount} ${rendered.pageCount === 1 ? "page" : "pages"}).`,
        ),
      });
    } catch (err) {
      setFeedback({
        tone: "red",
        text: err instanceof Error ? err.message : t("Nu s-a putut genera PDF-ul.", "Could not generate the PDF."),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSharePdf() {
    setBusy("share");
    setFeedback(null);
    try {
      const rendered = await renderMealPlanPdf(plan, { t, locale });
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const result = await shareImageFile(nav, rendered.file, plan.title);
      if (result === "shared") {
        setFeedback({ tone: "lime", text: t("Planul PDF a fost partajat.", "PDF plan shared.") });
      } else if (result === "cancelled") {
        // User dismissed the share sheet; no message needed.
      } else {
        // Desktop browsers typically don't support sharing files via Web Share API -> fall back to direct PDF download.
        triggerBlobDownload(rendered.blob, rendered.filename);
        setFeedback({
          tone: "ice",
          text: t(
            "Partajarea directă de fișiere nu e suportată pe acest browser — am descărcat PDF-ul ca să îl poți trimite.",
            "Direct file sharing is not supported in this browser — downloaded the PDF so you can send it.",
          ),
        });
      }
    } catch (err) {
      setFeedback({
        tone: "red",
        text: err instanceof Error ? err.message : t("Eroare la partajarea PDF-ului.", "Failed to share PDF."),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyText() {
    setFeedback(null);
    try {
      const text = formatMealPlanAsText(plan, t);
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      setFeedback({
        tone: "red",
        text: t("Nu am putut copia textul în clipboard.", "Could not copy text to clipboard."),
      });
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  function buildPublicUrl(activeToken: string) {
    if (typeof window === "undefined") return `/plan/${activeToken}`;
    return `${window.location.origin}/plan/${activeToken}`;
  }

  async function handleCopyLink() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(token));
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setFeedback({
        tone: "red",
        text: t("Nu am putut copia linkul.", "Could not copy the link."),
      });
    }
  }

  async function handleShareLinkAction(action: "enable" | "disable" | "regenerate") {
    if (!shareLink) return;
    setBusy("link");
    setFeedback(null);
    try {
      const res =
        action === "enable"
          ? await shareLink.onEnable()
          : action === "disable"
            ? await shareLink.onDisable()
            : await shareLink.onRegenerate();
      if (res.error) {
        setFeedback({ tone: "red", text: res.error });
        return;
      }
      setToken(res.shareToken ?? null);
      if (action === "enable") {
        setFeedback({ tone: "lime", text: t("Linkul public de partajare a fost activat.", "Public share link enabled.") });
      } else if (action === "regenerate") {
        setFeedback({ tone: "lime", text: t("Linkul a fost regenerat. Linkul vechi nu mai funcționează.", "Link regenerated. The previous link is now invalid.") });
      } else {
        setFeedback({ tone: "ice", text: t("Linkul public a fost dezactivat.", "Public share link revoked.") });
      }
    } finally {
      setBusy(null);
    }
  }

  const actionButtons = (
    <div className="flex flex-wrap gap-2 no-print">
      <Button
        small
        icon={Download}
        busy={busy === "download"}
        disabled={busy !== null}
        onClick={() => void handleDownloadPdf()}
      >
        <Text ro="Descarcă PDF" en="Download PDF" />
      </Button>
      <Button
        variant="secondary"
        small
        icon={Share2}
        busy={busy === "share"}
        disabled={busy !== null}
        onClick={() => void handleSharePdf()}
      >
        <Text ro="Partajează PDF" en="Share PDF" />
      </Button>
      <Button
        variant="secondary"
        small
        icon={copiedText ? Check : Copy}
        onClick={() => void handleCopyText()}
      >
        {copiedText ? <Text ro="Text copiat" en="Text copied" /> : <Text ro="Copiază text" en="Copy text" />}
      </Button>
      <Button
        variant="outline"
        small
        icon={Printer}
        onClick={handlePrint}
      >
        <Text ro="Printează" en="Print" />
      </Button>
    </div>
  );

  if (compact && !shareLink) {
    return (
      <div className="flex flex-col gap-2 no-print">
        {actionButtons}
        {feedback && <Message tone={feedback.tone === "lime" ? "lime" : feedback.tone === "ice" ? "ice" : "red"}>{feedback.text}</Message>}
      </div>
    );
  }

  return (
    <Card className="no-print">
      <CardTitle
        description={
          <Text
            ro="Descarcă planul în format PDF, trimite-l direct pe WhatsApp/email sau generează un link public read-only."
            en="Download as PDF, share directly via WhatsApp/email, or generate a read-only public link."
          />
        }
      >
        <span className="flex items-center gap-2">
          <FileText className="size-5 text-lime-text" />
          <Text ro="Export & Partajare" en="Export & Share" />
        </span>
      </CardTitle>

      {actionButtons}

      {shareLink && (
        <div className="flex flex-col gap-2.5 rounded-md bg-inner p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <Globe className="size-4 text-ice-text" />
              <Text ro="Link public (fără cont)" en="Public read-only link (no login)" />
            </span>
            <Badge tone={token ? "lime" : undefined}>
              {token ? <Text ro="Activ" en="Active" /> : <Text ro="Inactiv" en="Disabled" />}
            </Badge>
          </div>

          {token ? (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-sm bg-card px-3 py-2 text-xs font-mono text-soft">
                <Link2 className="size-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{`/plan/${token}`}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  small
                  icon={copiedLink ? Check : Copy}
                  onClick={() => void handleCopyLink()}
                >
                  {copiedLink ? <Text ro="Link copiat" en="Link copied" /> : <Text ro="Copiază link" en="Copy link" />}
                </Button>
                <a
                  href={`/plan/${token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-control px-3.5 text-sm font-semibold text-foreground transition-opacity active:opacity-80"
                >
                  <ExternalLink className="size-4" />
                  <Text ro="Deschide" en="Open" />
                </a>
                <Button
                  variant="outline"
                  small
                  icon={RefreshCw}
                  busy={busy === "link"}
                  disabled={busy !== null}
                  onClick={() => void handleShareLinkAction("regenerate")}
                >
                  <Text ro="Regenerează" en="Regenerate" />
                </Button>
                <Button
                  variant="outline"
                  tone="red"
                  small
                  icon={Trash2}
                  busy={busy === "link"}
                  disabled={busy !== null}
                  onClick={() => void handleShareLinkAction("disable")}
                >
                  <Text ro="Revocă link" en="Revoke link" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                <Text
                  ro="Oricine are linkul va putea vizualiza și descărca PDF-ul acestui plan (datele private ale clientului nu sunt expuse)."
                  en="Anyone with the link can view and download this plan as PDF (private client details are never exposed)."
                />
              </p>
              <Button
                variant="secondary"
                small
                icon={Link2}
                busy={busy === "link"}
                disabled={busy !== null}
                onClick={() => void handleShareLinkAction("enable")}
              >
                <Text ro="Activează link public" en="Enable public link" />
              </Button>
            </div>
          )}
        </div>
      )}

      {feedback && (
        <Message tone={feedback.tone === "lime" ? "lime" : feedback.tone === "ice" ? "ice" : "red"}>
          {feedback.text}
        </Message>
      )}
    </Card>
  );
}
