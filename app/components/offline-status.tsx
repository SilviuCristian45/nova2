"use client";

import { useOffline } from "@/lib/offline/client";
import { useLanguage } from "./language-provider";

export function OfflineStatus() {
  const { t } = useLanguage();
  const { ready, ownerId, online, syncing, pending, error, sync } = useOffline();
  if (!ready) return null;
  return (
    <aside aria-label={t("Stare offline", "Offline status")} className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-2 text-xs text-muted-foreground sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/offline" className="font-semibold text-primary underline">{t("Jurnal offline", "Offline log")}</a>
        <span role="status">{!online
          ? t("Fără conexiune", "Offline")
          : syncing ? t("Se sincronizează...", "Syncing...")
            : ownerId ? t("Date descărcate pe dispozitiv", "Data downloaded to device")
              : t("Autentifică-te online pentru acces offline", "Sign in online for offline access")}</span>
        {pending > 0 && <span className="font-bold text-amber-700 dark:text-amber-400">{pending} {t("în așteptare", "pending")}</span>}
      </div>
      {online && <button type="button" disabled={syncing} onClick={() => void sync()} className="font-semibold underline disabled:opacity-50">{t("Sincronizează / descarcă", "Sync / download")}</button>}
      {error && <p role="alert" className="w-full text-red-700 dark:text-red-400">{t("Sincronizarea nu este completă. Înregistrările salvate local rămân pe dispozitiv.", "Sync is incomplete. Locally saved entries remain on this device.")} {error}</p>}
    </aside>
  );
}
