"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { localDate } from "@/lib/daily-metrics";
import type { OfflineDatabase, OfflinePayload, OfflineSnapshot } from "./types";
import { validOfflinePayload } from "./model";
import { acknowledgeMutation, activateSnapshot, enableOfflineDownload, enqueueMutation, forgetOfflineAccount, lockOfflineAccount, readOfflineDatabase } from "./store";

const EVENT = "replog-offline-change";
let verifiedOwner: string | null = null;
function notify(queued = false) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { queued } }));
  // Broadcast only a timestamp, never private data, to other app tabs.
  try { localStorage.setItem(EVENT, String(Date.now())); }
  catch (error) { console.warn("Offline cross-tab notification unavailable:", error); }
}
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (response.status === 401 || response.status === 409) {
    verifiedOwner = null;
    await lockOfflineAccount();
    notify();
  }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Sync failed (${response.status}).`);
  return data;
}
let running: Promise<void> | null = null;
async function synchronize() {
  const initial = await readOfflineDatabase();
  if (!initial.enabled) return;
  const bootstrap = await request("/api/offline");
  const snapshot: OfflineSnapshot = bootstrap.snapshot;
  if (!snapshot?.ownerId) throw new Error("Offline data download failed.");
  await activateSnapshot(snapshot, initial.revision, Boolean(bootstrap.warning));
  verifiedOwner = snapshot.ownerId;
  notify();
  while (navigator.onLine) {
    const state = await readOfflineDatabase();
    if (state.activeOwner !== snapshot.ownerId || state.revision !== initial.revision) return;
    const mutation = state.accounts[snapshot.ownerId]?.queue[0];
    if (!mutation) break;
    await request("/api/offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation) });
    await acknowledgeMutation(snapshot.ownerId, mutation.id);
    notify();
  }
  if (navigator.onLine) {
    const latest = await request("/api/offline");
    if (latest.snapshot.ownerId !== snapshot.ownerId) {
      await lockOfflineAccount();
      throw new Error("Account changed. Reopen the app while online.");
    }
    await activateSnapshot(latest.snapshot, initial.revision, Boolean(latest.warning));
    if (latest.warning) throw new Error(latest.warning);
  }
}
export async function syncOffline(manual = false) {
  if (!navigator.onLine) return;
  if (running) {
    if (!manual) return running;
    await running.catch(() => { /* A manual retry follows the previous visible failure. */ });
  }
  if (manual) await enableOfflineDownload();
  running = (async () => {
    try {
      if (navigator.locks) await navigator.locks.request("replog-offline-sync", synchronize);
      else await synchronize();
    } finally { running = null; notify(); }
  })();
  return running;
}

export async function saveOfflineMutation(payload: OfflinePayload, expectedOwner: string): Promise<string> {
  if (!validOfflinePayload(payload, localDate())) throw new Error("Invalid offline entry. Check the date and values.");
  const state = await readOfflineDatabase();
  if (!state.activeOwner || state.activeOwner !== expectedOwner) throw new Error("Account changed. Sign in online and download data before offline logging.");
  const id = crypto.randomUUID();
  await enqueueMutation({ id, ownerId: state.activeOwner, createdAt: new Date().toISOString(), payload });
  notify(true);
  return id;
}

type OfflineContextValue = {
  ready: boolean; ownerId: string | null; online: boolean; syncing: boolean;
  pending: number; error: string | null; snapshot: OfflineSnapshot | null;
  sync: () => Promise<void>; forget: () => Promise<void>;
};
const Context = createContext<OfflineContextValue | null>(null);
export function useOffline() {
  const context = useContext(Context);
  if (!context) throw new Error("OfflineProvider is required.");
  return context;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<OfflineDatabase | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const previousPath = useRef(pathname);
  const refresh = useCallback(async () => {
    try {
      const current = await readOfflineDatabase();
      if (!navigator.onLine) verifiedOwner = current.activeOwner;
      setState(current);
      setReady(true);
    }
    catch (error) { setError(error instanceof Error ? error.message : "Offline storage unavailable."); setReady(true); }
  }, []);
  const sync = useCallback(async (manual = true) => {
    setSyncing(true);
    setError(null);
    try { await syncOffline(manual); }
    catch (error) {
      setError(error instanceof Error ? error.message : "Sync failed. Entries remain on this device.");
    } finally { setSyncing(false); await refresh(); }
  }, [refresh]);
  const forget = useCallback(async () => {
    await forgetOfflineAccount();
    verifiedOwner = null;
    notify();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    async function start() {
      setOnline(navigator.onLine);
      if (navigator.onLine && !["/login", "/register"].includes(window.location.pathname)) {
        // Verify the current online account before exposing any previous local account.
        await sync(false);
      } else await refresh();
      if (disposed) return;
    }
    void start();
    const change = (event: Event) => {
      void refresh();
      if (event instanceof CustomEvent && event.detail?.queued && navigator.onLine) void sync(false);
    };
    const connected = () => { setOnline(true); void sync(false); };
    const disconnected = () => { setOnline(false); };
    const storage = (event: StorageEvent) => { if (event.key === EVENT) void refresh(); };
    window.addEventListener(EVENT, change);
    window.addEventListener("storage", storage);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    const timer = window.setInterval(() => { if (navigator.onLine && !["/login", "/register"].includes(window.location.pathname)) void sync(false); }, 60000);
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        verifiedOwner = null;
        setState(null);
        void lockOfflineAccount().then(() => { notify(); return refresh(); }).catch((error) => setError(String(error)));
      }
    });
    return () => {
      disposed = true; subscription.unsubscribe(); clearInterval(timer);
      window.removeEventListener(EVENT, change); window.removeEventListener("storage", storage);
      window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected);
    };
  }, [sync, refresh]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/register") {
      verifiedOwner = null;
      void lockOfflineAccount().then(refresh).catch((error) => setError(String(error)));
    } else if (previousPath.current === "/login" || previousPath.current === "/register") {
      void sync();
    }
    previousPath.current = pathname;
  }, [pathname, refresh, sync]);

  const owner = state?.activeOwner && (!online || verifiedOwner === state.activeOwner) &&
    pathname !== "/login" && pathname !== "/register" ? state.activeOwner : null;
  const account = owner ? state?.accounts[owner] : null;
  return <Context.Provider value={{
    ready, online, syncing, error, ownerId: owner,
    snapshot: account?.snapshot ?? null, pending: account?.queue.length ?? 0,
    sync, forget,
  }}>{children}</Context.Provider>;
}
