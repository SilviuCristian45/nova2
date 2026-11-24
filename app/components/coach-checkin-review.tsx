"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Send } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { useUnits } from "@/app/components/units-provider";
import { Badge, Button, Input, Message } from "@/app/components/ui";
import { CheckinPhotoStrip } from "@/app/components/checkin-photos";
import type { WeeklyCheckinWithPhotos } from "@/lib/coach/types";
import { reviewWeeklyCheckinAction } from "@/app/checkin/weekly/actions";

export type CoachCheckinItem = WeeklyCheckinWithPhotos & {
  clientName?: string;
};

export function CoachCheckinReviewList({
  items,
  showClientLink = false,
}: {
  items: CoachCheckinItem[];
  showClientLink?: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { format } = useUnits();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReview(item: CoachCheckinItem) {
    const text = (replies[item.id] ?? "").trim();
    if (!text) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await reviewWeeklyCheckinAction(item.id, text, item.client_id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setReplies((prev) => ({ ...prev, [item.id]: "" }));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md bg-inner px-3.5 py-4 text-sm text-muted">
        <Text ro="Niciun check-in săptămânal." en="No weekly check-ins yet." />
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error && <Message>{error}</Message>}
      {items.map((item) => {
        const weekLabel = new Date(`${item.week_start}T00:00:00`).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        });
        const reviewed = Boolean(item.reviewed_at);

        return (
          <div
            key={item.id}
            className={`flex flex-col gap-2 rounded-md p-3 text-sm ${
              reviewed ? "bg-inner" : "border border-lilac-border bg-lilac-soft"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {showClientLink && item.clientName ? (
                  <Link
                    href={`/coach/clients/${item.client_id}`}
                    className="font-bold text-foreground underline-offset-2 hover:underline"
                  >
                    {item.clientName}
                  </Link>
                ) : null}
                <span className="flex items-center gap-1 text-xs font-semibold text-soft">
                  <ClipboardCheck className="size-3.5" />
                  {t("Săpt.", "Wk")} {weekLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.weight_kg !== null && <Badge>{format(Number(item.weight_kg))}</Badge>}
                <Badge tone="lime">{t("En.", "En.")} {item.energy}/5</Badge>
                <Badge tone="ice">{t("Somn", "Sleep")} {item.sleep}/5</Badge>
                <Badge tone="coral">{t("Stres", "Stress")} {item.stress}/5</Badge>
              </div>
            </div>

            {item.client_notes && (
              <p className="whitespace-pre-wrap text-xs text-foreground">{item.client_notes}</p>
            )}

            <CheckinPhotoStrip photoUrls={item.photoUrls} />

            {reviewed && item.coach_reply ? (
              <div className="flex flex-col gap-0.5 rounded-sm bg-card px-3 py-2 text-xs">
                <span className="flex items-center gap-1 font-semibold text-lime-text">
                  <CheckCircle2 className="size-3.5" />
                  <Text ro="Răspunsul tău" en="Your reply" />
                </span>
                <p className="whitespace-pre-wrap text-soft">{item.coach_reply}</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleReview(item);
                }}
                className="flex items-center gap-2 pt-0.5"
              >
                <Input
                  value={replies[item.id] ?? ""}
                  onChange={(e) => setReplies((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  maxLength={1500}
                  placeholder={t("Scrie feedback-ul pentru această săptămână...", "Write your reply for this week...")}
                />
                <Button
                  type="submit"
                  small
                  icon={Send}
                  busy={busyId === item.id}
                  disabled={!(replies[item.id] ?? "").trim()}
                  className="shrink-0"
                >
                  <Text ro="Răspunde" en="Reply" />
                </Button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
