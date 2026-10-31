// How an offline sync failure is understood. Only the first two of these may ever touch the user's data
// (never to delete it): everything keeps the queue on the device.
//   network   no answer / timeout            -> keep everything, retry later
//   server    5xx, outage, missing migration -> keep everything, retry later (not a rejection)
//   session   expired or invalid login       -> ask to sign in again, keep everything and the owner
//   owner     entry belongs to another login -> keep everything, sign in to that account
//   rejected  the server says this entry is invalid (400) -> mark it, keep it, let the user export it
export type SyncErrorKind = "network" | "server" | "session" | "owner" | "rejected";

export class SyncError extends Error {
  kind: SyncErrorKind;
  status?: number;
  constructor(kind: SyncErrorKind, message: string, status?: number) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
    this.status = status;
  }
}

export function classifyResponse(status: number): SyncErrorKind {
  if (status === 401 || status === 403) return "session";
  if (status === 409) return "owner";
  if (status === 400 || status === 413 || status === 422) return "rejected";
  if (status === 408) return "network";
  return "server"; // 5xx, 429 and anything unexpected: retry, never a rejection
}

type AuthLikeError = { name?: string; status?: number } | null | undefined;

// `getUser()` answers with an error both when the login is bad and when the auth server could not be reached.
// Only the first means "sign in again"; a transport problem must not look like an expired session.
export function classifyAuthResult(user: unknown, error: AuthLikeError): "valid" | "invalid" | "unavailable" {
  if (user && !error) return "valid";
  if (!error) return "invalid";
  const name = error.name ?? "";
  const status = error.status;
  if (name === "AuthRetryableFetchError") return "unavailable";
  if (typeof status === "number" && (status === 0 || status >= 500)) return "unavailable";
  if (!name.startsWith("Auth")) return "unavailable"; // TypeError: fetch failed, timeouts, ...
  return "invalid"; // AuthSessionMissingError, AuthApiError 4xx, invalid / expired JWT
}

// Postgres errors from `sync_offline_entry`: exceptions it raises on purpose (P0001) and constraint / data errors
// mean this entry can never be accepted; a missing function or an unavailable database can be retried.
export function classifySyncRpcError(error: { code?: string; message?: string }): { status: 400 | 401 | 503; error: string } {
  const code = error.code ?? "";
  if (code === "P0001" && error.message === "Authentication required") {
    return { status: 401, error: "Sign in again to sync. Your entries remain on this device." };
  }
  const permanent = code === "P0001" || code === "23505" || code === "23514" || code === "23502" || code === "23503" || code.startsWith("22");
  if (permanent) return { status: 400, error: `Rejected by the server: ${error.message ?? code}` };
  if (code === "PGRST202" || code === "42883") {
    return { status: 503, error: "Offline sync needs the database migration. Your entries remain safely queued on this device." };
  }
  return { status: 503, error: "Offline sync failed. Your entries remain on this device; retry or sign in again." };
}
