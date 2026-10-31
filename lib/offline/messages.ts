// Errors thrown by lib/offline/* and /api/offline are English; this shows them in the user's language.
const MESSAGES: Record<string, [string, string]> = {
  "Invalid offline entry. Check the date and values.": ["Înregistrare offline invalidă. Verifică data și valorile.", "Invalid offline entry. Check the date and values."],
  "Account changed. Sign in online and download data before offline logging.": ["Contul s-a schimbat. Autentifică-te online și descarcă datele înainte de a înregistra offline.", "Account changed. Sign in online and download data before offline logging."],
  "Account changed. Reopen the app while online.": ["Contul s-a schimbat. Redeschide aplicația cu conexiune la internet.", "Account changed. Reopen the app while online."],
  "Offline data download failed.": ["Descărcarea datelor offline a eșuat.", "Offline data download failed."],
  "Offline account mismatch.": ["Datele offline aparțin altui cont.", "Offline account mismatch."],
  "Unable to open offline storage.": ["Stocarea offline nu poate fi deschisă.", "Unable to open offline storage."],
  "Close other app tabs to enable offline storage.": ["Închide celelalte file ale aplicației pentru a activa stocarea offline.", "Close other app tabs to enable offline storage."],
  "Offline storage failed. Nothing was saved.": ["Stocarea offline a eșuat. Nu s-a salvat nimic.", "Offline storage failed. Nothing was saved."],
  "Offline storage transaction aborted.": ["Tranzacția de stocare offline a fost anulată.", "Offline storage transaction aborted."],
  "Offline download cancelled. Download again to resume.": ["Descărcarea offline a fost anulată. Descarcă din nou pentru a continua.", "Offline download cancelled. Download again to resume."],
  "Sign in online to enable offline logging.": ["Autentifică-te online pentru a activa înregistrarea offline.", "Sign in online to enable offline logging."],
  "Download your data before offline logging.": ["Descarcă-ți datele înainte de a înregistra offline.", "Download your data before offline logging."],
  "Sign in again to download or sync offline data.": ["Autentifică-te din nou pentru a descărca sau sincroniza datele offline.", "Sign in again to download or sync offline data."],
  "No secure random source is available.": ["Browserul nu oferă o sursă sigură de numere aleatoare, deci salvarea offline nu este posibilă.", "No secure random source is available."],
};

export function localizeOfflineMessage(message: string, t: (ro: string, en: string) => string): string {
  const known = MESSAGES[message];
  if (known) return t(known[0], known[1]);
  const status = /^Sync failed \((\d+)\)\.$/.exec(message);
  if (status) return t(`Sincronizarea a eșuat (${status[1]}).`, message);
  return message;
}
