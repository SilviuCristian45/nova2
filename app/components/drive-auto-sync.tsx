"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SESSION_KEY = "drive_sync_checked";
const SKIP = ["/login", "/register", "/offline", "/privacy"];

// Asks the server once per browser session to catch up an automatic Drive backup the hourly cron missed.
// Fire and forget: the server does nothing when Drive is not connected or no backup is due.
export function DriveAutoSync() {
  const pathname = usePathname();
  useEffect(() => {
    if (SKIP.some((path) => pathname.startsWith(path)) || !navigator.onLine) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      return;
    }
    void fetch("/api/drive/sync", { method: "POST", redirect: "manual" }).catch(() => undefined);
  }, [pathname]);
  return null;
}
