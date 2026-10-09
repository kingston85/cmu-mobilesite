# CMU Database – Android app (v2.0)

The phone app for the **CMU DATABASE** Google Sheet (EPA Liberia · ERRS Department · Chemical Management Unit).
It works on the real registers of the sheet through one extra Apps Script file, `apps-script/MobileAPI.gs`, and is built
into an Android APK by GitHub Actions. Nothing to install on a computer.

```
apps-script/MobileAPI.gs        ← goes into the CMU Database's Apps Script (step 1)
.github/workflows/build-android.yml   ← GitHub builds the APK with this (step 2)
src/ …                          ← the app (React + Capacitor)
android-res/, keys/, scripts/   ← icons, splash screens, test signing key, Android set-up script
```

---

## What the app does (everything from the sheet)

| In the sheet | In the app |
| --- | --- |
| **Companies** register, Company Form, Register Company (duplicate check) | Companies list (search, sector / “owing money” filters, sort), company 360° screen, add / edit / delete with the same duplicate check (letter-pair similarity, other names) |
| **Company Profile** + Save as PDF | Company screen: balance, licences, bills, payments, clearances by chemical, quotas, inspections, letters, emails; profile PDF made on the phone (offline) or by the sheet |
| **Company Contacts** | Contact per company (person, email, phone, reminders on/off) – call, WhatsApp, email, map from the app |
| **Licences & Certificates**, Licence Form, **Licence Chemicals**, **Licence Vehicles**, **Licence Effluent** | Licence list with status / expiry filters; licence screen with chemicals (and quota use), vehicles, effluent settings, discharge limits, geo-reference, discharge sources; add / edit / delete / **renew** |
| **Chemical Clearances**, multi-chemical Clearance Form (20 lines) | Clearance list grouped by CLN; form with 20 lines, standard-name suggestions, hazard + fee estimate per line, **live import-quota check** |
| **Bills & Invoices**, multi-service Bill Form, **Create Bill** from a licence / clearance, **New Bill wizard** | Bill list with paid / unpaid / aging filters; bill screen with services, total in words, payments; wizard (CRL, CIL, CRL+CIL, EDL, dewatering, fumigation, clearance, transport, other – new or renewal); create bill from any licence or clearance; bill-ref uniqueness and bill-type / service checks |
| **Payments & Receipts**, Payment Form, Record Payment | Record a payment against a bill (balance + receipt checks) or on the company account; edit / delete |
| **Notes & Issues**, Correspondence | Issues log (open / close), correspondence (reminder letters, violation and shutdown notices) |
| **Print CRL / CIL / EDL / EDL RP / Clearance / Bill** (PDF / Word) | **Official PDF** made by the sheet’s own print page – same letter, same QR code – signatory and letterhead choice, saved on the phone and in Drive, shared or printed |
| **QR verification** of printed documents | Scan the QR (or type the code): genuine / not recognised, valid / expired, from the live register |
| **Insights** (licences to renew, unpaid-bill aging), register colours | Home dashboard + Insights screen, same rules (renewed = later licence of the same type), adjustable window |
| **Quota Tracker** | Quota use per licensed chemical (per-month quotas on the busiest month), not on licence, no valid CIL |
| **Monthly Report**, **Annual Report** (+ PDF) | Both reports on the phone (all sections, charts) with PDF on the phone or the official PDF from the sheet |
| **Dashboard** charts, year selector | Analytics: billed vs collected, cumulative, MT by month, bill types, top importers / chemicals, licence categories, sectors |
| **Chemical Hazards** (HMIS, fee category), fee guide on the Clearance Form | Hazards list (admins edit ratings), **fee calculator** RI/C&E-002-04/20 (Qp = R × Hi × Qi, kg vs MT), fee worksheet PDF, “bill this” |
| **Fee Schedule** | Services with suggested fees and bill types (used by the bill forms) |
| AmountInWords | Amount in words (and kg ⇄ MT converter) |
| **Claude** (chat, read a document into a form, data check, price a consignment…) | Claude on the phone: ask about the registers, photograph a document → filled form to check and save; API key and budget stay in the sheet |
| **Document Inbox** | Review the documents Claude read, open the filled form, approve / reject, add a document from the phone |
| **Activity Log** | Activity log (every phone action is logged as “… (mobile)”) |
| Weekly **email reminders**, **Google Calendar** sync, **Gmail** email log, **backups** | Admin tools on the phone (admins only) + phone notifications before licences expire and for unpaid bills |
| Sort & download tables | Export any register view to **Excel, CSV or PDF** |
| Roles (admin / staff / viewer) | Officers & PINs (admins), view-only accounts, optional sign-in |
| Health check | Data health check (duplicates, IDs used twice, missing fields, expiry before issue, payments above the bill, receipts recorded twice) |

**Works offline.** The registers are kept on the phone. Records saved offline appear straight away (marked “waiting to upload”)
and upload when there is a signal. Every check of the desktop forms runs again on the server; if something needs a decision
(over quota, similar company, payment above the balance…) the app asks. If a record was changed on the desktop after the
phone read it, the app shows both and asks which one to keep. Record numbers (CMU-, LIC-, CLN-, BN-, PAY-) are given by the
database.

Other: dark mode, app PIN lock, Android back button, haptics, share sheet, saved PDFs, sample-data mode for training.

---

## Step 1 – Add MobileAPI.gs to the CMU Database (10 minutes, once)

1. Open the **CMU DATABASE** Google Sheet ▸ **Extensions ▸ Apps Script**.
2. Click **＋** next to *Files* ▸ **Script** ▸ name it `MobileAPI` ▸ paste everything from `apps-script/MobileAPI.gs` ▸ **Save**.
   *If a MobileAPI file is already there (the earlier app), replace its whole content with this file.*
   Keep **MobileAPI below Code.gs** in the Files list (it is when you add it). Do not change Code.gs or Claude.gs.
3. In the toolbar choose the function **MOB_Setup** ▸ **Run** ▸ allow the permissions. It creates the sheets
   *Mobile Users* (hidden), *Mobile Uploads* (hidden) and *Mobile Inspections*, and tells you if everything is in place.
4. **Deploy the web app**
   * Never deployed before: **Deploy ▸ New deployment ▸ ⚙ Web app** · *Execute as:* **Me** · *Who has access:* **Anyone** ▸ **Deploy** ▸ copy the URL ending in `/exec`.
   * Already deployed (QR check page or Document Inbox web link): **Deploy ▸ Manage deployments ▸ ✏️ Edit ▸ Version: New version ▸ Deploy**. The URL stays the same.
5. For admin tools on the phone: open the hidden sheet **Mobile Users** (right-click the sheet tabs ▸ show), and on your row type a
   **PIN** (4–8 digits), **Role** `admin`, **Active** `TRUE`.
6. Optional, a menu: in Code.gs ▸ `onOpen`, after the line with `CLAUDE_addMenu_`, add `try { MOB_addMenu_(ui); } catch (err) { }`.

Whenever MobileAPI.gs changes later: **Deploy ▸ Manage deployments ▸ Edit ▸ New version** (not a new deployment – that would change the URL).

> **Sign-in:** at the top of MobileAPI.gs, `MOB_NO_LOGIN = true` lets phones connect with the link and the officer’s name (as staff:
> add, change and delete records, like the desktop before the lock). Set it to `false` to require email + PIN for everyone
> (roles admin / staff / viewer on *Mobile Users*). `MOB_ALLOW_DELETE = false` stops phones from deleting records.

## Step 2 – Put these files in your new GitHub repository

On github.com, in the new repository: **Add file ▸ Upload files** ▸ drag **everything inside** the unzipped
`cmu-database-android` folder (not the folder itself) ▸ **Commit changes**.

* The hidden folder **`.github`** must be uploaded too (it holds the build). If your computer hides it, show hidden files
  (Windows: File Explorer ▸ View ▸ Hidden items; Mac: Cmd + Shift + .) – or create it on GitHub: **Add file ▸ Create new file**,
  name `.github/workflows/build-android.yml`, paste the content of that file, **Commit**.
* The upload is about 70 files (under GitHub’s 100-file limit for one upload).

## Step 3 – Get the APK

1. Open the **Actions** tab of the repository. The run **Build Android APK** starts by itself after the commit (about 6–10 minutes).
2. When it shows a green tick, open it ▸ **Artifacts** ▸ **CMU-Database-APK** (a zip with `CMU-Database-2.0.N.apk` and a copy of MobileAPI.gs).
3. Copy the `.apk` to the phone and open it (allow “install unknown apps” for the browser / Files app when Android asks).

Every later commit builds a new APK that installs over the previous one (same test key in `keys/`).
**Download link for the team:** create a tag, e.g. `v2.0.1` (Releases ▸ Draft a new release ▸ choose a tag ▸ Publish):
the workflow attaches the APK to the release.

## Step 4 – Connect the phone

The app needs **Android 8.0 or newer**. Open **CMU Database** ▸ paste the `/exec` link ▸ type your name ▸ **Connect**. The registers download and the app is ready.
Admins: More ▸ Account ▸ *Sign in with email + PIN*. To show the app without the database: **Try with sample data**.

---

## Release key (optional – for the Play Store or a permanent install key)

Create a key once (`keytool -genkey -v -keystore cmu-release.jks -alias cmu -keyalg RSA -keysize 2048 -validity 10000`),
then in the repository: **Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret**:
`CMU_KEYSTORE_BASE64` (the .jks file as base64), `CMU_KEYSTORE_PASSWORD`, `CMU_KEY_ALIAS`, `CMU_KEY_PASSWORD`.
The workflow then builds a signed release APK and an `.aab` for the Play Store. (A release-signed app cannot install over
a test-signed one – uninstall the test app first.)

## Troubleshooting

| Message | What to do |
| --- | --- |
| “The server did not answer correctly” | The link must end in `/exec`; the deployment must be *Who has access: Anyone*; MobileAPI.gs must be saved **and a new version deployed**. |
| “Unknown action … Update MobileAPI.gs” | The sheet runs an older MobileAPI.gs – paste this one and deploy a new version. |
| MOB_Setup says another doPost answers | In the Apps Script editor drag **MobileAPI below Code.gs**, save, deploy a new version. |
| “Signed out – please sign in again” | The PIN sign-in was reset (Sign out all phones) or the account was set Active = FALSE. |
| Official PDF fails | The print page needs the record (e.g. a clearance needs an EPA Ref. No.); open the same record on the desktop print page to see the warning. |
| Build fails on GitHub | Open the failed step in the Actions run; the most common cause is a missing file (upload all files, including `.github`, `keys/` and `android-res/`). |

## For developers

```bash
npm install
npm run dev            # the app in a browser (sample data works without a database)
npm run build && node scripts/prepare-android.mjs && npx cap sync android   # native project in ./android
```

React 19 + Vite, Capacitor 8 (camera, barcode scanner, filesystem, share, geolocation, local notifications, network,
preferences, haptics, status bar, splash screen, browser), Dexie (IndexedDB), jsPDF + autotable, SheetJS.
`src/lib/logic.js` is a line-by-line port of the sheet’s rules (insights, quotas, fees, reports, duplicates); it was checked
against the figures on the Insights, Quota Tracker, Monthly Report and Annual Report sheets of the workbook.
