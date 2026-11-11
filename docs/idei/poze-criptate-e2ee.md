# Idee: poze de progres criptate end-to-end

Stare: **amânată** (decizia utilizatorului, 2026-11-11: „lasă deocamdată, ne mai gândim"). Nimic implementat.

## De ce
Pozele sunt date foarte personale. Utilizatorul nu vrea ca administratorii (dashboard Supabase, cine are service-role key
sau acces la server) să le poată vedea.

## Ce NU ajută
Criptarea server-side (o cheie în env, ca `DRIVE_TOKEN_KEY`): cine are accesul la server sau la service-role key
decriptează. Ascunde pozele doar de cineva care se uită în dashboard-ul Storage. Supabase criptează deja discul.

## Varianta care ajută: E2EE în browser
- Cheia derivată dintr-o **parolă de poze** aleasă de utilizator (separată de parola contului): WebCrypto, PBKDF2 pentru
  cheie, AES-256-GCM pentru fișiere (IV unic per fișier).
- Parola nu pleacă din browser. Pe server (profil) doar sarea (salt) + o verificare că parola e corectă (ex. un blob
  mic criptat cu cheia, decriptat la deblocare).
- Încărcare: redimensionare (cum e acum) → criptare → upload în bucket-ul `progress-photos`; bucket-ul trebuie să
  accepte `application/octet-stream` (acum doar `image/jpeg`).
- Galerie: linkurile semnate rămân, dar duc la fișiere criptate; browserul le descarcă și le decriptează la afișare
  (blob URL). Compararea și vizualizarea merg la fel.
- Backup Drive: `backupPhotos` ar urca tot fișierele criptate (Google vede doar date ilizibile). Restaurarea
  (`lib/photos-restore.ts`) rămâne valabilă: rândurile + fișierele criptate; pozele se pot citi doar cu parola de poze.
- Ștergerea contului/datelor: neschimbată (`removeAllPhotoFiles`).

## Ce se pierde / riscuri
- **Parola uitată = poze pierdute definitiv.** Soluție: cheie de recuperare afișată o singură dată (utilizatorul o
  păstrează), care poate deriva/înfășura aceeași cheie.
- Parola se cere la fiecare sesiune (ținută în memorie), sau opțional păstrată în browser (cheie neextractibilă în
  IndexedDB). De decis.
- Pozele existente (necriptate) trebuie șterse sau recriptate la activare.
- Nu se pot vedea pozele din dashboard-ul Supabase; nu se pot genera miniaturi pe server.
- Exportul JSON are doar metadatele; imaginile criptate nu sunt utile fără parolă, deci exportul de imagini ar trebui
  să fie decriptat în browser.

## Decizii de luat
1. Parola doar în memorie sau păstrată între sesiuni?
2. Cheie de recuperare obligatorie?
3. Ce facem cu pozele deja încărcate (ștergere sau recriptare)?
4. Câmpul `note` din `progress_photos` rămâne necriptat sau se criptează și el?

## Unde s-ar atinge codul
`app/photos/photo-gallery.tsx` (criptare la upload, decriptare la afișare), `app/photos/page.tsx`,
`lib/photos.ts` (cripto), migrație (sare + verificare în profil, mime-type bucket), `lib/drive-service.ts`
(`backupPhotos` neschimbat în principiu), README și CLAUDE.md.
