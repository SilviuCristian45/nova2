"use client";

import { useOffline } from "@/lib/offline/client";
import { useLanguage } from "./language-provider";
import { pageWidth } from "./ui";

export function OfflineStatus() {
  const { t } = useLanguage();
  const { ready, ownerId, online, syncing, pending, error, sync } = useOffline();
  if (!ready) return null;
  return (
    <aside aria-label={t("Stare offline", "Offline status")} className={`${pageWidth} flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-xs text-muted lg:px-8`}>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/offline" className="font-semibold text-lime-text underline">{t("Jurnal offline", "Offline log")}</a>
        <span role="status">{!online
          ? t("Fără conexiune", "Offline")
          : syncing ? t("Se sincronizează...", "Syncing...")
            : ownerId ? t("Date descărcate pe dispozitiv", "Data downloaded to device")
              : t("Autentifică-te online pentru acces offline", "Sign in online for offline access")}</span>
        {pending > 0 && <span className="font-bold text-gold-text">{pending} {t("în așteptare", "pending")}</span>}
      </div>
      {online && <button type="button" disabled={syncing} onClick={() => void sync()} className="font-semibold underline disabled:opacity-50">{t("Sincronizează / descarcă", "Sync / download")}</button>}
      {error && <p role="alert" className="w-full font-semibold text-red-text">{t("Sincronizarea nu este completă. Înregistrările salvate local rămân pe dispozitiv.", "Sync is incomplete. Locally saved entries remain on this device.")} {error}</p>}
    </aside>
  );
}
