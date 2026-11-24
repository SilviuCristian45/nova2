import { redirect } from "next/navigation";
import { Text } from "@/app/components/language-provider";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/lib/coach/types";
import { Screen } from "@/app/components/ui";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("notifications")
    .select("id, user_id, actor_id, type, payload, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Screen title={<Text ro="Notificări" en="Notifications" />}>
      <NotificationsClient initialItems={(data ?? []) as AppNotification[]} />
    </Screen>
  );
}
