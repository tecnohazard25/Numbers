# Numbers — Specifiche Funzionali Complete

> Gestionale per il controllo di gestione di centri medici.
> Stack: Next.js App Router, Supabase (PostgreSQL), shadcn/ui (Base UI), Tailwind CSS 4, AG Grid Community.

---

## 1. Architettura Ruoli

Il sistema prevede 4 ruoli. Ogni utente puo avere piu ruoli contemporaneamente (tabella junction `user_roles`).

| Ruolo | Chiave DB | Descrizione |
|-------|-----------|-------------|
| Super Admin | `superadmin` | Gestisce le organizzazioni, i loro utenti e le impostazioni globali. Puo impersonare qualsiasi utente. |
| Gestione Utenti | `user_manager` | Gestisce esclusivamente gli utenti della propria organizzazione (CRUD, attivazione, ruoli, password). Non ha accesso ad altre funzionalita. |
| Business Analyst | `business_analyst` | Accede all'anagrafica soggetti (lettura e scrittura). Non vede impostazioni ne gestione utenti. |
| Contabile | `accountant` | Accede all'anagrafica soggetti e alle impostazioni (codici IVA). Unico ruolo che gestisce i codici IVA. |

### Matrice di accesso

| Funzionalita | superadmin | user_manager | business_analyst | accountant |
|---|:---:|:---:|:---:|:---:|
| Gestione organizzazioni | Si | | | |
| Impersonamento utenti | Si | | | |
| Gestione utenti org | | Si | | |
| Anagrafica soggetti | | | Si | Si |
| Tag soggetti | | | Si | Si |
| Impostazioni (Codici IVA) | | | | Si |
| Dashboard | Si | Si | Si | Si |
| Profilo personale (tema, password, regional) | Si | Si | Si | Si |

---

## 2. Menu / Navigazione

La sidebar mostra sezioni diverse in base ai ruoli dell'utente:

```
+-- Super Admin           [solo superadmin]
|   +-- Organizzazioni
+-- Gestione Utenti       [solo user_manager]
|   +-- Utenti
+-- Anagrafica            [business_analyst, accountant]
|   +-- Soggetti
+-- Configurazione        [solo accountant]
|   +-- Impostazioni
+-- Generale              [tutti]
|   +-- Dashboard
+-- Footer
    +-- Profilo utente (tema, password, impostazioni regionali)
    +-- Esci
```

---

## 3. Autenticazione

### 3.1 Login
- Form con Email + Password
- Autenticazione via Supabase Auth (`signInWithPassword`)
- Dopo login, redirect basato sul ruolo di priorita maggiore:
  - `superadmin` -> `/superadmin`
  - `user_manager` -> `/org/users`
  - altri -> `/dashboard`
- Messaggi di errore specifici: account disattivato, organizzazione disattivata, credenziali non valide

### 3.2 Logout
- Cancella il cookie `real_superadmin_id` (impersonamento)
- Chiama `supabase.auth.signOut()`
- Redirect a `/login`

### 3.3 Password Reset
- L'utente richiede il reset inserendo la propria email
- Supabase invia un link di recupero via email
- Il link porta a `/auth/callback?next=/reset-password`
- Il callback completa la verifica del magic link Supabase
- L'utente inserisce la nuova password (con validazione)
- Aggiorna `password_expires_at` a +90 giorni

### 3.4 Password Scaduta (Force Change)
- Se `password_expires_at` e nel passato, l'utente viene forzato a cambiarla
- Route: `/force-change-password`
- Richiede: password corrente (ri-autenticazione), nuova password, conferma
- Dopo il cambio, redirect basato sul ruolo

### 3.5 Policy Password
- Regex: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$`
- Requisiti: minimo 8 caratteri, 1 maiuscola, 1 minuscola, 1 numero, 1 carattere speciale
- Scadenza: 90 giorni dalla creazione/modifica

### 3.6 Middleware / Protezione Route
- Route pubbliche (senza auth): `/login`, `/reset-password`, `/auth/callback`
- Route autenticata speciale: `/force-change-password`
- Tutte le altre route richiedono sessione Supabase valida
- Utenti non autenticati vengono reindirizzati a `/login`
- Esclusi dal middleware: `_next/static`, `_next/image`, `favicon.ico`, file immagine

---

## 4. Impersonamento (Superadmin)

### 4.1 Avvio
- Solo `superadmin` puo impersonare
- POST `/api/impersonate` con `userId` nel body
- Salva l'ID reale del superadmin nel cookie `real_superadmin_id` (httpOnly, max-age 1 ora)
- Genera un magic link per l'utente target (`admin.auth.admin.generateLink({ type: "magiclink" })`)
- Il client scambia il token hash via `verifyOtp()` per creare la sessione dell'utente impersonato
- Redirect a `/dashboard`

### 4.2 Banner
- Quando il cookie `real_superadmin_id` esiste e differisce dall'utente corrente, viene mostrato un banner giallo
- Testo: "Stai impersonando [nome utente]"
- Bottone: "Torna a Superadmin"

### 4.3 Arresto
- DELETE `/api/impersonate`
- Legge il cookie per recuperare l'ID del superadmin reale
- Genera magic link per il superadmin
- Cancella il cookie
- Il client scambia il token per ripristinare la sessione originale
- Redirect a `/superadmin`

---

## 5. Organizzazioni

### 5.1 Creazione
- Solo `superadmin`
- Campi: Nome (obbligatorio), Valuta (default EUR)
- Genera automaticamente slug dal nome (lowercase, alfanumerico + trattini)
- Verifica unicita slug
- Alla creazione vengono inseriti automaticamente i 25 codici IVA italiani standard (vedi sezione 8.4)

### 5.2 Gestione (pagina dettaglio `/superadmin/organizations/[id]`)
- **Rinomina**: icona matita nell'header, dialog con nuovo nome, aggiorna anche lo slug
- **Gestione utenti**: griglia AG Grid con CRUD completo (vedi sezione 6)
- **Impersonamento**: bottone per ogni utente
- **Valuta**: select con 12 valute supportate
- **Strumenti**: bottone "Genera dati" per dati di test
- **Disattivazione / riattivazione**
- **Eliminazione** (cancella anche tutti gli utenti auth associati via cascade)

### 5.3 Lista organizzazioni (`/superadmin`)
- Griglia AG Grid con colonne: Nome, Stato (Attiva/Disattiva), Data creazione, Azioni
- Azioni: Gestisci, Disattiva/Riattiva, Elimina (con dialog di conferma)
- Vista mobile con card
- Export Excel

### 5.4 Valute supportate
EUR, USD, GBP, CHF, BRL, PLN, RON, SEK, NOK, DKK, CZK, HUF

---

## 6. Gestione Utenti

### 6.1 Creazione utente
- **Autorizzazione**: `superadmin` (qualsiasi org) o `user_manager` (solo propria org)
- **Campi**: Nome, Cognome, Email (obbligatori), Ruoli (checkbox), Organizzazione (solo per superadmin)
- **Restrizioni ruoli**:
  - `user_manager` puo assegnare solo: `business_analyst`, `accountant`
  - `superadmin` puo assegnare tutti i ruoli
- **Flusso creazione**:
  1. Crea utente auth via Supabase Admin API
     - **Sviluppo**: password temporanea `TempPass1!`, `email_confirm=true`
     - **Produzione**: invito via email (l'utente deve accettare per impostare la password)
  2. Upsert profilo con: id, first_name, last_name, organization_id
  3. Crea record `user_roles` per i ruoli selezionati (con `assigned_by` e `assigned_at`)

### 6.2 Modifica utente
- Campi: Nome, Cognome, Ruoli, Scadenza password, Nuova password (opzionale)
- Se viene impostata una nuova password, la scadenza viene forzata a "ora" (l'utente dovra cambiarla al primo accesso)

### 6.3 Altre operazioni
- **Disattivazione/Riattivazione**: toggle `is_active`
- **Eliminazione**: cancella account auth + profilo (cascade)

### 6.4 A livello `user_manager` (`/org/users`)
- Vede solo gli utenti della propria organizzazione
- Griglia AG Grid con: Nome, Email, Ruoli (con label tradotte), Stato, Azioni
- Tooltip su bottoni icona (Modifica, Elimina)

### 6.5 A livello `superadmin` (`/superadmin/organizations/[id]`)
- Stessa griglia ma con bottone Impersona aggiuntivo
- Puo gestire utenti di qualsiasi organizzazione

### 6.6 Superadmin Users (`/superadmin/users`)
- Lista globale di tutti gli utenti del sistema
- Filtro per organizzazione
- Tutti i ruoli disponibili per l'assegnazione

---

## 7. Anagrafica Soggetti

### 7.1 Tipi soggetto

| Tipo | Chiave DB | Campi specifici obbligatori |
|------|-----------|-----------------------------|
| Persona fisica | `person` | Nome, Cognome |
| Azienda | `company` | Ragione Sociale |
| Ditta individuale | `sole_trader` | Ragione Sociale |
| Pubblica amministrazione | `public_administration` | Ragione Sociale |

### 7.2 Form soggetto (struttura completa)

**Sezione 1 — Tipo Soggetto**
- Select con 4 opzioni
- Il cambio tipo abilita/disabilita i campi condizionali

**Sezione 2 — Dati Anagrafici / Aziendali**

*Per Persona fisica (`person`):*
| Campo | Obbligatorio | Note |
|-------|:---:|------|
| Nome | Si | |
| Cognome | Si | |
| Data di nascita | No | Input type=date |
| Luogo di nascita | No | Uppercase |
| Sesso | No | Dropdown M/F |
| Codice Fiscale | No | 16 caratteri, uppercase, font mono. Calcolo automatico da nome+cognome+nascita+sesso. Bottone "Ricalcola". Validazione formato in tempo reale (icona verde/rossa). |

*Per Azienda / Ditta individuale / PA:*
| Campo | Obbligatorio | Note |
|-------|:---:|------|
| Ragione Sociale | Si | |
| Partita IVA | No | 11+ cifre. Verifica VIES al blur (spinner, checkmark verde o X rossa). Se VIES ritorna un nome e il campo Ragione Sociale e vuoto, lo auto-compila. |
| Codice SDI | No | Max 7 caratteri, uppercase |
| Codice Fiscale | No | 16 caratteri, uppercase |

**Sezione 3 — Dati Comuni**
| Campo | Note |
|-------|------|
| IBAN | Uppercase, spazi rimossi automaticamente |
| Note | Textarea |

**Sezione 4 — Indirizzi (lista dinamica)**
- Bottone "Aggiungi indirizzo"
- Per ogni indirizzo:
  | Campo | Note |
  |-------|------|
  | Etichetta | Dropdown: Residenza, Domicilio, Sede legale, Sede operativa, Altro |
  | Primario | Checkbox (uno solo puo essere primario) |
  | Paese | Dropdown: IT, DE, FR, ES, GB, US, CH, AT |
  | Indirizzo | Per indirizzi IT: **Google Places Autocomplete** (compila automaticamente CAP, Citta, Provincia, Regione). Per altri paesi: input manuale. |
  | CAP | |
  | Citta | |
  | Provincia | Solo per IT, max 2 caratteri |
  | Regione | Solo per IT |
- Bottone rimuovi per ogni indirizzo

**Sezione 5 — Contatti (lista dinamica)**
- Bottone "Aggiungi contatto"
- Per ogni contatto:
  | Campo | Note |
  |-------|------|
  | Tipo | Dropdown: Telefono, Cellulare, Email, PEC |
  | Etichetta | Opzionale |
  | Valore | Obbligatorio |
  | Primario | Checkbox (uno solo puo essere primario) |
- Contatti con valore vuoto vengono filtrati automaticamente prima del salvataggio
- Bottone rimuovi per ogni contatto

**Sezione 6 — Tag**
- Tag selezionati mostrati come badge colorate con X per rimuovere
- Input di ricerca con dropdown autocomplete
- Filtro in tempo reale sui tag esistenti
- **Creazione tag inline**: se il testo non corrisponde a nessun tag esistente, appare opzione "Crea [nome]" con color picker (8 colori predefiniti)
- Enter o click crea il tag e lo seleziona automaticamente
- Deduplicazione client-side

### 7.3 Calcolo Codice Fiscale
- Libreria: `codice-fiscale-ts`
- Input: nome, cognome, data nascita (ISO), luogo nascita (uppercase), sesso (M/F)
- Output: codice a 16 caratteri
- Validazione formato: verifica lunghezza e pattern
- Funzione asincrona con gestione errori

### 7.4 Verifica VIES (Partita IVA europea)
- API: `POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`
- Payload: `{ countryCode, vatNumber }`
- Preprocessing: rimuove spazi, strip prefisso paese se presente (es. "IT12345" -> "12345")
- Paese default: IT
- Risposta: `{ valid, name?, address? }` (valori "---" filtrati)
- UI: spinner durante la verifica, icona verde (valido) o rossa (non valido)

### 7.5 Google Places Autocomplete (indirizzi)
- Attivo solo per indirizzi con paese = IT
- Al select di un risultato, compila automaticamente: via, CAP, citta, provincia, regione
- Si disattiva quando il paese non e IT

### 7.6 Lista soggetti (`/subjects`)
- Griglia AG Grid con colonne: Nome/Ragione Sociale, Tipo, Indirizzo, Contatti, Data di nascita, Tag, Azioni
- **Filtri**:
  - Tipo soggetto (dropdown: tutti i tipi, persona, azienda, ditta, PA)
  - Tag (dropdown: tutti i tag)
  - Ricerca full-text (ilike su nome, cognome, ragione sociale, codice fiscale, partita IVA)
- Azioni per riga: Modifica, Disattiva/Riattiva, Elimina (con conferma)
- Vista mobile con card (mostra nome, tipo, badge tag, indirizzo primario, contatto primario, data nascita)
- Export Excel

---

## 8. Codici IVA

### 8.1 Accesso
- Solo ruolo `accountant`
- Pagina: Impostazioni > Codici IVA
- Altri ruoli non vedono ne il menu Impostazioni ne la pagina

### 8.2 Campi

| Campo | Tipo DB | Note |
|-------|---------|------|
| Codice | `text` | Univoco per organizzazione. Es: "22", "10", "N1", "N2.1" |
| Descrizione | `text` | Testo libero. Es: "IVA 22% - Aliquota ordinaria" |
| Aliquota % | `numeric(5,2)` | 0-100 |
| Natura | `text` (select) | Dropdown con valori fissi da normativa AdE. Obbligatoria per aliquota 0%. |
| Attivo | `boolean` | Default true. Disattivazione senza eliminazione. |

### 8.3 Nature (Agenzia delle Entrate)
Dropdown a valori fissi con descrizione completa:

| Codice | Descrizione |
|--------|-------------|
| N1 | Escluse ex art. 15 del DPR 633/72 |
| N2.1 | Non soggette ad IVA ai sensi degli artt. da 7 a 7-septies del DPR 633/72 |
| N2.2 | Non soggette - altri casi |
| N3.1 | Non imponibili - esportazioni |
| N3.2 | Non imponibili - cessioni intracomunitarie |
| N3.3 | Non imponibili - cessioni verso San Marino |
| N3.4 | Non imponibili - operazioni assimilate alle cessioni all'esportazione |
| N3.5 | Non imponibili - a seguito di dichiarazioni d'intento |
| N3.6 | Non imponibili - altre operazioni che non concorrono alla formazione del plafond |
| N4 | Esenti |
| N5 | Regime del margine / IVA non esposta in fattura |
| N6.1 | Inversione contabile - cessione di rottami e altri materiali di recupero |
| N6.2 | Inversione contabile - cessione di oro e argento puro |
| N6.3 | Inversione contabile - subappalto nel settore edile |
| N6.4 | Inversione contabile - cessione di fabbricati |
| N6.5 | Inversione contabile - cessione di telefoni cellulari |
| N6.6 | Inversione contabile - cessione di prodotti elettronici |
| N6.7 | Inversione contabile - prestazioni comparto edile e settori connessi |
| N6.8 | Inversione contabile - operazioni settore energetico |
| N6.9 | Inversione contabile - altri casi |
| N7 | IVA assolta in altro stato UE |

Le descrizioni delle nature sono in italiano (riferimenti normativi) e non vengono tradotte dal sistema i18n.

### 8.4 Codici precaricati (seed)
Alla creazione di una nuova organizzazione vengono inseriti automaticamente 25 codici IVA:

**Aliquote standard:**
- 22% — Aliquota ordinaria
- 10% — Aliquota ridotta
- 5% — Aliquota ridotta
- 4% — Aliquota minima

**Nature a 0%:** N1, N2.1, N2.2, N3.1, N3.2, N3.3, N3.4, N3.5, N3.6, N4, N5, N6.1, N6.2, N6.3, N6.4, N6.5, N6.6, N6.7, N6.8, N6.9, N7

Se la tabella e vuota, un bottone "Popola con codici IVA italiani" permette il caricamento manuale.

### 8.5 UI lista codici IVA
- Lista verticale con card per ogni codice
- Ogni card mostra: codice (mono, badge), descrizione, aliquota %, natura (se presente), stato
- Codici disattivati con opacita ridotta
- Azioni: modifica (dialog), elimina (con conferma)
- Dialog creazione/modifica con: codice, aliquota, descrizione, natura (dropdown), attivo (checkbox, solo in modifica)

---

## 9. Profilo Utente

Accessibile a tutti i ruoli dal footer della sidebar (click sul nome utente).

### 9.1 Tema
- 3 opzioni: Chiaro (Sun), Scuro (Moon), Automatico (Monitor)
- Selezionabile con card visuale (icona + label)
- Automatico segue le impostazioni del sistema operativo
- Persistenza: `localStorage` via `next-themes`
- Default: dark

### 9.2 Impostazioni Regionali
Salvate sul profilo utente nel database (`profiles` table). Ogni utente ha le proprie preferenze indipendenti.

| Impostazione | Valori disponibili | Default |
|---|---|---|
| Lingua | it-IT, en-US, en-GB, de-DE, fr-FR, es-ES, pt-BR, nl-NL, pl-PL, ro-RO | it-IT |
| Formato data | dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd, dd.MM.yyyy, dd-MM-yyyy | dd/MM/yyyy |
| Formato ora | HH:mm (24h), hh:mm a (12h) | HH:mm |
| Separatore decimale | Virgola (,), Punto (.) | , |
| Separatore migliaia | Punto (.), Virgola (,), Spazio ( ), Nessuno | . |

- **Bottone "Rileva dal browser"**: usa `navigator.language` per determinare la lingua e imposta automaticamente tutti i default corrispondenti
- **Cambio lingua = cambio lingua interfaccia**: la lingua selezionata determina la lingua di tutta l'interfaccia (i18n)
- **Cambio lingua compila i default**: selezionando una lingua diversa, i campi formato data/ora/separatori si aggiornano automaticamente con i default di quella lingua
- **Bottone Salva** per persistere le modifiche

### 9.3 Cambio Password
- Richiede password corrente (ri-autenticazione via Supabase)
- Nuova password + conferma
- Validazione policy password (vedi sezione 3.5)
- Aggiorna `password_expires_at` a +90 giorni
- Dopo il cambio, redirect basato sul ruolo

### 9.4 Valuta (a livello organizzazione)
La valuta NON e nel profilo utente. E un'impostazione dell'organizzazione, configurata dal `superadmin` nella pagina dettaglio organizzazione (sezione 5.2).

---

## 10. Generazione Dati di Test

### 10.1 Accesso
- Solo `superadmin`
- Pagina: dettaglio organizzazione > bottone "Genera dati"

### 10.2 Parametri
- Numero di soggetti da generare (1-500)
- Distribuzione: ~60% persone fisiche, ~40% aziende

### 10.3 Dati generati per soggetto

**Persona fisica (60%):**
- Tipo: `person` o `sole_trader` (casuale)
- Nome e cognome da liste predefinite (12 nomi, 24 cognomi italiani)
- Sesso dedotto dal nome
- Data nascita casuale (1950-2000)
- Luogo nascita (citta italiana)
- Codice Fiscale (formato casuale 16 caratteri)
- P.IVA (30% probabilita)
- IBAN (50% probabilita)

**Azienda (40%):**
- Tipo: `company` o `sole_trader` (casuale)
- Ragione sociale (template nome + forma giuridica)
- Codice Fiscale (casuale)
- P.IVA (sempre)
- Codice SDI (7 cifre)
- IBAN (50% probabilita)

**Per tutti:**
- 1-2 indirizzi (Sede legale, Sede operativa) con citta/provincia/CAP italiani
- 1-3 contatti (email sempre, poi telefono/cellulare/PEC casuali)
- is_active: 90% attivo
- Note: 20% probabilita

---

## 11. Griglia Dati (Componente DataGrid)

### 11.1 Caratteristiche
- Basato su AG Grid Community con tema Quartz dark
- Colonne: ordinabili, filtrabili, ridimensionabili, floating filter
- Localizzazione automatica in base alla lingua utente

### 11.2 Mobile
- Sotto una certa larghezza, AG Grid viene sostituito da una vista card custom
- La vista card e definita per ogni griglia tramite prop `renderMobileCard`
- Export Excel funziona anche da mobile (usa i `rowData` invece dell'API AG Grid)

### 11.3 Export Excel
- Bottone "Export Excel" sopra la griglia
- Genera file `.xlsx` via libreria `xlsx`
- Rispetta filtri e ordinamento correnti
- Esclude la colonna "Azioni" dall'export
- Auto-dimensiona le colonne in base al contenuto

### 11.4 Props del componente

| Prop | Tipo | Default | Descrizione |
|------|------|---------|-------------|
| `rowData` | `T[]` | — | Dati della griglia |
| `columnDefs` | `ColDef<T>[]` | — | Definizione colonne AG Grid |
| `domLayout` | `"normal" \| "autoHeight" \| "print"` | `"autoHeight"` | Layout della griglia |
| `height` | `string` | `"500px"` | Altezza (solo se domLayout != autoHeight) |
| `pagination` | `boolean` | `false` | Abilita paginazione |
| `paginationPageSize` | `number` | `20` | Righe per pagina |
| `exportFileName` | `string` | — | Nome file export |
| `renderMobileCard` | `(item, index) => ReactNode` | — | Render card per mobile |

---

## 12. Internazionalizzazione (i18n)

### 12.1 Architettura
- React Context + dizionari JSON statici (nessuna libreria esterna)
- ~350 chiavi tradotte organizzate in 13 namespace
- Entrambi i dizionari caricati staticamente (totale ~15KB)

### 12.2 Lingue implementate

| Lingua | Codice | Stato |
|--------|--------|-------|
| Italiano | it-IT | Completo (lingua base e fallback) |
| Inglese | en-US | Completo |

### 12.3 Namespace traduzioni

| Namespace | Contenuto | ~Chiavi |
|-----------|-----------|---------|
| `common` | Label generiche UI (salva, annulla, elimina, modifica, caricamento...) | 35 |
| `auth` | Login, logout, password, messaggi errore autenticazione | 25 |
| `sidebar` | Label di navigazione | 12 |
| `dashboard` | Benvenuto, ruoli | 3 |
| `subjects` | Anagrafica completa (tipi, form, indirizzi, contatti, tag, paesi, validazioni) | 60 |
| `settings` | Codici IVA (CRUD, seed, nature) | 20 |
| `users` | Gestione utenti (CRUD, ruoli, password, dialogs) | 20 |
| `orgs` | Gestione organizzazioni (CRUD, rinomina, valuta) | 20 |
| `profile` | Tema, impostazioni regionali, password | 15 |
| `impersonation` | Banner impersonamento | 3 |
| `roles` | Nomi visualizzati dei ruoli | 4 |
| `regional` | Label separatori numerici | 4 |
| `agGrid` | Traduzioni complete griglia AG Grid | 65 |

### 12.4 Come funziona

**Provider:**
- Pagine protette: il layout legge `profile.locale` dal DB e wrappa in `<I18nProvider locale={locale}>`
- Pagine auth (login, reset, force-change): usano `detectBrowserLocale()` per scegliere la lingua automaticamente dal browser

**Uso nei componenti:**
```tsx
const { t, locale, lang } = useTranslation();
// t(key) -> traduzione
// t(key, { name: "Mario" }) -> interpolazione {name}
// locale -> "it-IT" (completo, per toLocaleDateString)
// lang -> "it" (2 lettere, per selezione dizionario)
```

**Logica di fallback:** lingua corrente -> italiano -> chiave stessa

**AG Grid:** locale dinamico selezionato in base a `lang` via `getAgGridLocale(lang)`

**Date:** `toLocaleDateString(locale)` invece di `"it-IT"` hardcoded

**Elementi non tradotti:** le descrizioni delle Nature IVA (N1..N7) restano in italiano (riferimenti normativi). I messaggi di errore delle server actions restano in italiano.

### 12.5 Aggiungere una nuova lingua
1. Copiare `src/lib/i18n/locales/en.json` -> `xx.json` e tradurre
2. Aggiungere import e entry in `src/lib/i18n/context.tsx`
3. Copiare `src/lib/i18n/ag-grid/en.ts` -> `xx.ts` e tradurre
4. Aggiungere entry in `src/lib/i18n/ag-grid/index.ts`

### 12.6 Aggiungere una nuova stringa
Per ogni nuova feature, label o messaggio:
1. Aggiungere la chiave in `src/lib/i18n/locales/it.json` e `en.json`
2. Nel componente usare `t("namespace.chiave")`
3. Mai stringhe hardcoded nell'UI

---

## 13. Database

### 13.1 Tabelle

| Tabella | Descrizione | RLS |
|---------|-------------|:---:|
| `organizations` | Organizzazioni (nome, slug, valuta) | Si |
| `profiles` | Profili utente (anagrafica, locale, preferenze regionali) | Si |
| `roles` | Ruoli di sistema (4 record fissi, seed) | No |
| `user_roles` | Associazione utente-ruolo (N:N) | Si |
| `subjects` | Soggetti anagrafica | Si |
| `subject_addresses` | Indirizzi soggetti (1:N) | Si |
| `subject_contacts` | Contatti soggetti (1:N) | Si |
| `tags` | Tag per organizzazione (nome + colore) | Si |
| `subject_tags` | Associazione soggetto-tag (N:N) | Si |
| `vat_codes` | Codici IVA per organizzazione | Si |

### 13.2 Schema tabelle principali

**organizations**
| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| id | uuid | gen_random_uuid() | PK |
| name | text | | |
| slug | text | | UNIQUE |
| is_active | boolean | true | |
| currency | text | 'EUR' | |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | Auto-update trigger |

**profiles**
| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| id | uuid | | PK, FK -> auth.users |
| organization_id | uuid | | FK -> organizations |
| first_name | text | | |
| last_name | text | | |
| is_active | boolean | true | |
| password_expires_at | timestamptz | | |
| locale | text | 'it-IT' | |
| date_format | text | 'dd/MM/yyyy' | |
| time_format | text | 'HH:mm' | |
| decimal_separator | text | ',' | |
| thousands_separator | text | '.' | |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | Auto-update trigger |

**subjects**
| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| id | uuid | gen_random_uuid() | PK |
| organization_id | uuid | | FK -> organizations, CASCADE |
| type | subject_type | | ENUM: person, company, sole_trader, public_administration |
| first_name | text | | Obbligatorio se type=person |
| last_name | text | | Obbligatorio se type=person |
| birth_date | date | | |
| birth_place | text | | |
| gender | char(1) | | M o F |
| business_name | text | | Obbligatorio se type!=person |
| tax_code | text | | |
| vat_number | text | | |
| sdi_code | text | | |
| iban | text | | |
| notes | text | | |
| is_active | boolean | true | |
| created_by | uuid | | FK -> profiles |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | Auto-update trigger |

**vat_codes**
| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| id | uuid | gen_random_uuid() | PK |
| organization_id | uuid | | FK -> organizations, CASCADE |
| code | text | | UNIQUE(organization_id, code) |
| description | text | | |
| rate | numeric(5,2) | 0 | |
| nature | text | | N1..N7 |
| is_active | boolean | true | |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | Auto-update trigger |

### 13.3 Multi-tenancy e RLS

**Principio**: ogni utente vede solo i dati della propria organizzazione.

**Funzioni SQL helper:**
- `get_user_organization_id()` -> uuid dell'organizzazione dell'utente corrente
- `has_role(role_name text)` -> boolean, verifica se l'utente ha un determinato ruolo

**Policy RLS per tabella:**

| Tabella | Policy |
|---------|--------|
| organizations | Superadmin: accesso totale. Altri: solo la propria org (read-only) |
| profiles | Superadmin: accesso totale. Utente: read/update proprio profilo. User_manager: read/update profili nella propria org |
| roles | Tutti autenticati: read-only |
| user_roles | Superadmin: accesso totale. Utente: read propri ruoli. User_manager: read/insert/delete ruoli nella propria org |
| subjects | Isolamento per organization_id |
| subject_addresses | Isolamento via subject_id -> subjects -> organization_id |
| subject_contacts | Isolamento via subject_id -> subjects -> organization_id |
| tags | Isolamento per organization_id |
| subject_tags | Isolamento via tag_id -> tags -> organization_id |
| vat_codes | Isolamento per organization_id |

### 13.4 Trigger

- **Auto-update `updated_at`**: trigger BEFORE UPDATE su organizations, profiles, subjects, vat_codes
- **Auto-creazione profilo**: trigger AFTER INSERT su `auth.users` che crea un record in `profiles` con dati da `raw_user_meta_data` (first_name, last_name, organization_id)

### 13.5 Migrazioni

| # | File | Descrizione |
|---|------|-------------|
| 001 | `migration.sql` | Schema base: auth, organizzazioni, profili, ruoli (seed 4 ruoli), RLS, trigger, funzioni helper |
| 002 | `migration_002_org_settings.sql` | Aggiunge colonne regionali a organizations (locale, date_format, time_format, separatori) |
| 003 | `migration_003_subjects.sql` | Anagrafica: subjects, subject_addresses, subject_contacts, tags, subject_tags, enum types, RLS |
| 004 | `migration_004_vat_codes.sql` | Tabella vat_codes con RLS e indici |
| 005 | `migration_005_rename_org_admin.sql` | Rinomina ruolo org_admin -> user_manager |
| 006 | `migration_006_user_locale.sql` | Sposta colonne regionali da organizations a profiles (copia dati, poi drop colonne org) |

---

## 14. API Routes

| Metodo | Route | Descrizione | Auth |
|--------|-------|-------------|------|
| GET | `/api/user-info` | Profilo utente corrente, ruoli, stato impersonamento | Si |
| GET | `/api/user-roles` | Array nomi ruoli dell'utente corrente | Si |
| GET | `/api/users?orgId=` | Lista utenti (opzionalmente filtrati per org) con ruoli e email | Si |
| GET | `/api/organizations` | Lista organizzazioni attive | Si |
| GET | `/api/organizations/[id]` | Singola organizzazione per ID | Si |
| GET | `/api/subjects?orgId=&type=&search=&tagId=` | Lista soggetti con filtri, indirizzi, contatti, tag | Si |
| GET | `/api/subjects/[id]` | Singolo soggetto con tutte le relazioni | Si |
| GET | `/api/tags?orgId=` | Lista tag per organizzazione | Si |
| GET | `/api/vat-codes?orgId=` | Lista codici IVA per organizzazione | Si |
| POST | `/api/impersonate` | Avvia impersonamento (solo superadmin) | Si |
| DELETE | `/api/impersonate` | Arresta impersonamento | Si |
| GET | `/auth/callback` | Callback Supabase per magic link / password reset | No |

---

## 15. Stack Tecnologico

| Componente | Tecnologia | Versione/Note |
|------------|------------|---------------|
| Framework | Next.js | App Router |
| UI Components | shadcn/ui | Basato su Base UI (non Radix) |
| CSS | Tailwind CSS | v4 |
| Griglia dati | AG Grid Community | v35.2 |
| Database | Supabase | PostgreSQL con RLS |
| Autenticazione | Supabase Auth | JWT |
| Icone | Lucide React | |
| Toast/Notifiche | Sonner | |
| Tema | next-themes | Dark/Light/System |
| i18n | Custom | React Context + JSON |
| Font | Inter (sans), Geist Mono | Google Fonts |
| Export Excel | xlsx | |
| Calcolo CF | codice-fiscale-ts | |
| Verifica P.IVA | EU VIES REST API | |
| Autocomplete indirizzi | Google Places API | Solo per indirizzi IT |

---

## 16. Convenzioni di Sviluppo

### Pattern architetturale
- **Pagine**: tutte `"use client"` con fetch client-side
- **Server Actions**: in `src/app/actions/`, autorizzazione con `getCurrentUser()`, revalidazione path dopo mutazione
- **API Routes**: in `src/app/api/`, per letture semplici (GET)
- **Admin client**: `createAdminClient()` per operazioni privilegiate (bypass RLS)
- **Componenti UI**: shadcn/ui in `src/components/ui/`

### i18n (obbligatorio)
- Ogni nuova stringa UI deve essere tradotta in `it.json` e `en.json`
- Usare `t("namespace.chiave")` — mai stringhe italiane/inglesi hardcoded
- Interpolazione: `t("chiave", { param: valore })`
- Date: `toLocaleDateString(locale)` con locale dal context
- Ruoli: `ROLE_LABELS` contiene chiavi i18n, chiamare `t(getRoleLabel(roleName))` per la label tradotta

### Database
- Ogni nuova tabella con dati per organizzazione: aggiungere `organization_id` + policy RLS
- Le migrazioni sono numerate sequenzialmente (`migration_NNN_*.sql`)
- Trigger `updated_at` per le tabelle con timestamp di modifica

### Sicurezza
- Controllare sempre i ruoli lato server nelle actions (non fidarsi solo del client)
- Controllare i ruoli lato client per mostrare/nascondere elementi UI
- RLS come secondo livello di protezione a livello database
- Mai esporre dati cross-organizzazione

### Struttura file

```
src/
  app/
    (protected)/           # Route protette (richiedono auth)
      layout.tsx           # Layout con I18nProvider + sidebar
      dashboard/page.tsx
      settings/page.tsx
      subjects/
        page.tsx
        new/page.tsx
        [id]/edit/page.tsx
        _components/subject-form.tsx
      org/users/page.tsx
      superadmin/
        page.tsx
        organizations-table.tsx
        organizations/new/page.tsx
        organizations/[id]/page.tsx
        organizations/[id]/generate/page.tsx
        users/page.tsx
        users/users-page-client.tsx
      change-password/page.tsx
    api/                   # API routes
    actions/               # Server actions
    login/                 # Pagina login (pubblica)
    reset-password/        # Reset password (pubblica)
    force-change-password/ # Cambio password forzato
    auth/callback/         # Callback Supabase
  components/
    ui/                    # Componenti shadcn/ui
    app-sidebar.tsx        # Sidebar navigazione
    app-layout.tsx         # Layout wrapper
    data-grid.tsx          # Componente griglia AG Grid
    impersonation-banner.tsx
  lib/
    i18n/
      context.tsx          # I18nProvider + useTranslation
      locales/it.json      # Traduzioni italiano
      locales/en.json      # Traduzioni inglese
      ag-grid/             # Locale AG Grid per lingua
    supabase/              # Client Supabase (server, client, admin, middleware)
    auth.ts                # getCurrentUser helper
    roles.ts               # ROLE_LABELS + getRoleLabel
    password.ts            # Validazione password
    locale-defaults.ts     # Default regionali per lingua
    tax-code.ts            # Calcolo codice fiscale
  types/
    supabase.ts            # Tipi TypeScript per tutte le tabelle
supabase/
  migration*.sql           # Migrazioni database (001-006)
```
