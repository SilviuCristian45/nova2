"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight, Trash2 } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/app/components/notification-bell";
import { Badge, Button, Card, Empty, IconButton, Message, Segmented } from "@/app/components/ui";
import { formatNotification } from "@/lib/coach/interactions";
import type { AppNotification } from "@/lib/coach/types";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

export function NotificationsClient({ initialItems }: { initialItems: AppNotification[] }) {
  const router = useRouter();
  const { t, locale, language } = useLanguage();
  const [items, setItems] = useState<AppNotification[]>(initialItems);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = items.filter((i) => i.read_at === null).length;
  const visible = filter === "unread" ? items.filter((i) => i.read_at === null) : items;

  function notifyBell() {
    window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
  }

  async function handleOpen(item: AppNotification) {
    setError(null);
    if (item.read_at === null) {
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, read_at: nowIso } : x)));
      await markNotificationReadAction(item.id);
      notifyBell();
    }
    if (item.link) {
      router.push(item.link);
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    setError(null);
    try {
      const res = await markAllNotificationsReadAction();
      if (res.error) {
        setError(res.error);
        return;
      }
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: nowIso })));
      notifyBell();
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await deleteNotificationAction(id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
    notifyBell();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label={t("Filtru notificări", "Notification filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `${t("Toate", "All")} (${items.length})` },
            { value: "unread", label: `${t("Necitite", "Unread")} (${unreadCount})` },
          ]}
        />
        {unreadCount > 0 && (
          <Button variant="secondary" small icon={CheckCheck} busy={markingAll} onClick={handleMarkAllRead}>
            <Text ro="Marchează toate ca citite" en="Mark all read" />
          </Button>
        )}
      </div>

      {error && <Message>{error}</Message>}

      {visible.length === 0 ? (
        <Empty icon={Bell}>
          {filter === "unread" ? (
            <Text ro="Nu ai notificări necitite." en="You have no unread notifications." />
          ) : (
            <Text ro="Nu ai notificări încă." en="No notifications yet." />
          )}
        </Empty>
      ) : (
        <Card padded={false}>
          {visible.map((item, idx) => {
            const formatted = formatNotification(item, t, language);
            const isUnread = item.read_at === null;
            const dateText = new Date(item.created_at).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div key={item.id}>
                {idx > 0 && <div className="mx-4 h-px bg-line" />}
                <div className={`flex items-center gap-2 px-4 py-3.5 ${isUnread ? "bg-inner/60" : ""}`}>
                  <button
                    type="button"
                    onClick={() => void handleOpen(item)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                        isUnread ? "bg-lime" : "bg-transparent"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{formatted.title}</span>
                        {isUnread && (
                          <Badge tone={formatted.tone ?? "lime"}>
                            <Text ro="Nou" en="New" />
                          </Badge>
                        )}
                      </span>
                      <span className="text-sm text-soft">{formatted.body}</span>
                      <span className="text-xs text-muted">{dateText}</span>
                    </span>
                    {item.link && <ChevronRight className="mt-1 size-4 shrink-0 text-muted" />}
                  </button>
                  <IconButton
                    icon={Trash2}
                    plain
                    tone="red"
                    label={t("Șterge notificarea", "Delete notification")}
                    onClick={() => void handleDelete(item.id)}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
