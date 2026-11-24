"use client";

import { useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { Badge, Button, IconButton, Input, Message } from "@/app/components/ui";
import { FEEDBACK_REACTIONS, type FeedbackReaction } from "@/lib/coach/types";
import { REACTION_META } from "@/lib/coach/interactions";
import {
  addWorkoutFeedbackAction,
  deleteWorkoutFeedbackAction,
  type FeedbackThreadItem,
} from "@/app/feedback/actions";

export function WorkoutFeedbackThread({
  workoutId,
  currentUserId,
  initialItems,
  showReactions = true,
  collapsible = false,
  clientIdForRevalidate,
  placeholderRo = "Scrie un mesaj...",
  placeholderEn = "Write a message...",
}: {
  workoutId: string;
  currentUserId: string;
  initialItems: FeedbackThreadItem[];
  showReactions?: boolean;
  collapsible?: boolean;
  clientIdForRevalidate?: string;
  placeholderRo?: string;
  placeholderEn?: string;
}) {
  const { t, locale, language } = useLanguage();
  const [items, setItems] = useState<FeedbackThreadItem[]>(initialItems);
  const [open, setOpen] = useState(!collapsible || initialItems.length > 0);
  const [body, setBody] = useState("");
  const [reaction, setReaction] = useState<FeedbackReaction | null>(null);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await addWorkoutFeedbackAction(
        workoutId,
        body,
        showReactions ? reaction : null,
        clientIdForRevalidate,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.item) {
        setItems((prev) => [...prev, res.item!]);
      }
      setBody("");
      setReaction(null);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await deleteWorkoutFeedbackAction(id, clientIdForRevalidate);
      if (res.error) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-control px-3 py-1.5 text-xs font-semibold text-soft transition-colors active:opacity-75"
      >
        <MessageSquare className="size-3.5" />
        <Text ro="Lasă feedback" en="Leave feedback" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {collapsible && (
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-soft">
            <MessageSquare className="size-3.5 text-ice-text" />
            <Text ro="Feedback" en="Feedback" /> ({items.length})
          </span>
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-muted"
            >
              <Text ro="Ascunde" en="Hide" />
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const own = item.authorId === currentUserId;
            const timeLabel = new Date(item.createdAt).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-1 rounded-md px-3 py-2.5 text-sm ${
                  item.isCoachAuthor ? "border border-ice-border bg-ice-soft" : "bg-inner"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground">
                      {own ? t("Tu", "You") : item.authorName}
                    </span>
                    {item.isCoachAuthor && (
                      <Badge tone="ice"><Text ro="Antrenor" en="Coach" /></Badge>
                    )}
                    {item.reaction && (
                      <span
                        className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-foreground"
                        title={language === "ro" ? REACTION_META[item.reaction].ro : REACTION_META[item.reaction].en}
                      >
                        {REACTION_META[item.reaction].emoji}
                      </span>
                    )}
                    <span className="text-[11px] text-muted">{timeLabel}</span>
                  </div>
                  {own && (
                    <IconButton
                      icon={Trash2}
                      plain
                      tone="red"
                      disabled={deletingId === item.id}
                      label={t("Șterge mesajul", "Delete message")}
                      onClick={() => handleDelete(item.id)}
                    />
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">{item.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {showReactions && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Reacție rapidă", "Quick reaction")}>
            {FEEDBACK_REACTIONS.map((key) => {
              const active = reaction === key;
              const meta = REACTION_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setReaction(active ? null : key)}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors ${
                    active ? "bg-lime text-on-solid" : "bg-control text-soft"
                  }`}
                >
                  <span>{meta.emoji}</span>
                  <span>{language === "ro" ? meta.ro : meta.en}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            placeholder={t(placeholderRo, placeholderEn)}
            aria-label={t("Mesaj feedback", "Feedback message")}
          />
          <Button
            type="submit"
            small
            icon={Send}
            busy={sending}
            disabled={!body.trim()}
            className="shrink-0"
          >
            <Text ro="Trimite" en="Send" />
          </Button>
        </div>
        {error && <Message>{error}</Message>}
      </form>
    </div>
  );
}
