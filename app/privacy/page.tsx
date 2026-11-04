import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RepLog – Politica de confidențialitate / Privacy Policy",
  description: "Privacy policy for the RepLog mobile app and its optional Google Drive backup.",
};

const EMAIL = "silviudinca412@gmail.com";
const GOOGLE_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";
const h2 = "mt-7 text-lg font-semibold";
const link = "underline underline-offset-2";

// Public page (no login): Google requires a privacy policy on a verified domain for the Drive backup in the mobile app.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 leading-relaxed sm:px-8">
      <section lang="ro">
        <h1 className="text-2xl font-bold">RepLog – Politica de confidențialitate</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ultima actualizare: 4 noiembrie 2026</p>

        <h2 className={h2}>Datele tale rămân pe telefon</h2>
        <p className="mt-2">RepLog este o aplicație de înregistrare a antrenamentelor, meselor, pașilor și greutății. Toate datele (profil, antrenamente, mese, pași, greutate) sunt stocate local, pe telefonul tău. Aplicația mobilă nu are servere, conturi proprii sau baze de date în cloud, nu colectăm date despre tine și nu folosim reclame sau statistici de utilizare.</p>

        <h2 className={h2}>Backup automat în Google Drive (opțional)</h2>
        <p className="mt-2">Dacă activezi această funcție și te conectezi cu contul Google, aplicația încarcă o copie a datelor tale (un fișier JSON) în Google Drive, la intervalul ales (zilnic, săptămânal sau lunar), când ai internet.</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Aplicația cere un singur permis Google: <code>drive.appdata</code>. Fișierele merg într-un folder ascuns, propriu aplicației, din Drive-ul tău. Aplicația nu poate vedea, citi sau modifica alte fișiere din Drive.</li>
          <li>Din contul Google folosim doar emailul, pentru a-ți arăta ce cont este conectat. Nu îl trimitem nicăieri altundeva.</li>
          <li>Datele merg direct de pe telefonul tău către Google Drive. Nu trec prin servere ale noastre și nu le vede nimeni altcineva.</li>
          <li>Se păstrează ultimele 5 backup-uri; cele mai vechi sunt șterse automat.</li>
          <li>Poți opri funcția oricând din Setări, apăsând „Deconectează”. Poți șterge backup-urile din Google Drive → Setări → Gestionează aplicațiile → RepLog → Șterge datele ascunse ale aplicației, sau revoca accesul din contul tău Google (myaccount.google.com/permissions).</li>
        </ul>
        <p className="mt-2">Utilizarea informațiilor primite de la Google respectă <a className={link} href={GOOGLE_POLICY}>Google API Services User Data Policy</a>, inclusiv cerințele de utilizare limitată (Limited Use).</p>

        <h2 className={h2}>Alte servicii</h2>
        <p className="mt-2">Când cauți un aliment sau scanezi un cod de bare, aplicația poate trimite căutarea (numele sau codul de bare, fără alte date personale) către bazele de date publice de alimente Open Food Facts și USDA FoodData Central.</p>

        <h2 className={h2}>Ștergerea datelor</h2>
        <p className="mt-2">Poți șterge toate datele din Setări → Zonă periculoasă sau dezinstalând aplicația.</p>

        <h2 className={h2}>Contact</h2>
        <p className="mt-2">Întrebări: <a className={link} href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      </section>

      <hr className="my-10" />

      <section lang="en">
        <h1 className="text-2xl font-bold">RepLog – Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: November 4, 2026</p>

        <h2 className={h2}>Your data stays on your phone</h2>
        <p className="mt-2">RepLog is an app for logging workouts, meals, steps and weight. All data (profile, workouts, meals, steps, weight) is stored locally on your phone. The mobile app has no servers, accounts or cloud databases of its own, we do not collect data about you, and we use no ads or usage analytics.</p>

        <h2 className={h2}>Automatic Google Drive backup (optional)</h2>
        <p className="mt-2">If you turn this feature on and sign in with your Google account, the app uploads a copy of your data (a JSON file) to your Google Drive at the interval you choose (daily, weekly or monthly), when you are online.</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>The app asks for a single Google permission: <code>drive.appdata</code>. Files go to a hidden folder that belongs to the app in your Drive. The app cannot see, read or change any other file in your Drive.</li>
          <li>From your Google account we use only your email address, to show you which account is connected. We do not send it anywhere else.</li>
          <li>The data goes straight from your phone to Google Drive. It does not pass through any server of ours and nobody else can see it.</li>
          <li>The latest 5 backups are kept; older ones are deleted automatically.</li>
          <li>You can turn the feature off any time in Settings with “Disconnect”. You can delete the backups in Google Drive → Settings → Manage apps → RepLog → Delete hidden app data, or revoke access from your Google account (myaccount.google.com/permissions).</li>
        </ul>
        <p className="mt-2">The use of information received from Google APIs adheres to the <a className={link} href={GOOGLE_POLICY}>Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

        <h2 className={h2}>Other services</h2>
        <p className="mt-2">When you search for a food or scan a barcode, the app may send the search (the food name or barcode, with no other personal data) to the public food databases Open Food Facts and USDA FoodData Central.</p>

        <h2 className={h2}>Deleting your data</h2>
        <p className="mt-2">You can delete all data in Settings → Danger zone, or by uninstalling the app.</p>

        <h2 className={h2}>Contact</h2>
        <p className="mt-2">Questions: <a className={link} href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      </section>
    </main>
  );
}
