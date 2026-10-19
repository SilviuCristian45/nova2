import type { OfflineDatabase, OfflineMutation, OfflineSnapshot } from "./types";
import { mergeSnapshot } from "./model";

const DB_NAME = "replog-offline-v1";
const empty = (): OfflineDatabase => ({ activeOwner: null, accounts: {}, revision: 0, enabled: true });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline storage."));
    request.onblocked = () => reject(new Error("Close other app tabs to enable offline storage."));
  });
}

async function transact(update?: (state: OfflineDatabase) => OfflineDatabase): Promise<OfflineDatabase> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", update ? "readwrite" : "readonly");
    const store = tx.objectStore("state");
    const request = store.get("database");
    let result: OfflineDatabase;
    request.onsuccess = () => {
      try {
        const current: OfflineDatabase = request.result ?? empty();
        result = update ? update(current) : current;
        if (update) store.put(result, "database");
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Offline storage failed. Nothing was saved.")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Offline storage transaction aborted.")); };
  });
}

export const readOfflineDatabase = () => transact();

export function activateSnapshot(snapshot: OfflineSnapshot, revision: number, preserveWeights = false) {
  return transact((state) => {
    if (!state.enabled || state.revision !== revision) throw new Error("Offline download cancelled. Download again to resume.");
    const queue = state.accounts[snapshot.ownerId]?.queue ?? [];
    const downloaded = preserveWeights
      ? { ...snapshot, weights: state.accounts[snapshot.ownerId]?.snapshot.weights ?? [] }
      : snapshot;
    return { ...state, activeOwner: snapshot.ownerId, accounts: {
      ...state.accounts, [snapshot.ownerId]: { snapshot: mergeSnapshot(downloaded, queue), queue },
    } };
  });
}

export function lockOfflineAccount() {
  return transact((state) => ({ ...state, activeOwner: null, enabled: false, revision: state.revision + 1 }));
}

export function enableOfflineDownload() {
  return transact((state) => state.enabled ? state : { ...state, enabled: true, revision: state.revision + 1 });
}

export function enqueueMutation(mutation: OfflineMutation) {
  return transact((state) => {
    if (state.activeOwner !== mutation.ownerId) throw new Error("Sign in online to enable offline logging.");
    const account = state.accounts[mutation.ownerId];
    if (!account) throw new Error("Download your data before offline logging.");
    if (account.queue.some((entry) => entry.id === mutation.id)) return state;
    const queue = [...account.queue, mutation];
    return { ...state, accounts: { ...state.accounts, [mutation.ownerId]: {
      queue, snapshot: mergeSnapshot(account.snapshot, [mutation]),
    } } };
  });
}

export function acknowledgeMutation(ownerId: string, id: string) {
  return transact((state) => {
    const account = state.accounts[ownerId];
    if (!account) return state;
    return { ...state, accounts: { ...state.accounts, [ownerId]: {
      queue: account.queue.filter((entry) => entry.id !== id),
      snapshot: { ...account.snapshot, workouts: account.snapshot.workouts.map((w) => w.id === id ? { ...w, pending: false } : w) },
    } } };
  });
}

export function forgetOfflineAccount() {
  return transact((state) => {
    const accounts = { ...state.accounts };
    if (state.activeOwner) delete accounts[state.activeOwner];
    return { activeOwner: null, accounts, enabled: false, revision: state.revision + 1 };
  });
}
