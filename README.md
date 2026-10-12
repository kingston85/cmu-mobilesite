# CMU Database – Android app v2

The phone app of the EPA Liberia · ERRS · Chemical Management Unit, with the Google Sheet database **CMU Mobile Database v2** behind it.

## What it does

| Area | On the phone |
| --- | --- |
| Home | The Main Menu: licences expiring, unpaid bills, clearances this month, open data issues, and shortcuts to all work |
| Registers | Companies (with contacts), Licences & Certificates, Licence Chemicals / Vehicles / Effluent, Chemical Clearances, Bills & Invoices, Payments & Receipts, Notes & Issues, Correspondence, Field Inspections, Document Inbox, Fee Schedule, Chemical Hazards, Activity Log. You can search, filter, sort, and download any of them as CSV or a PDF table |
| Forms | Company, Licence (chemicals, vehicles, effluent limits, retention-pond coordinates and sources), Clearance (20 chemicals), Bill (10 services, suggested fees, letter wording by Bill Type), Payment (against a bill or the company account), Field inspection (GPS and photos), Data issue, Letter / notice. Each one supports **edit and delete** |
| From a record | Licence: print, create a bill, renew. Clearance: print the letter, estimate the fee, create a bill. Bill: print the letter, record a payment. Company: profile, call, WhatsApp, e-mail |
| Print (PDF on the phone, works offline) | CRL, CIL, EDL, EDL Retention Pond, other certificates, Clearance letter, Bill letter. You choose the signatory, whether the letterhead prints, and the QR code. You can then print or share the PDF, save it on the phone, or save it to Drive |
| QR check | Every printed document carries a QR code. Anyone who scans it with any phone gets the live status from the database. In the app, More ▸ Check a document |
| Reports (PDF) | Dashboard charts, Insights & alerts with bill aging, Monthly report, Annual report, Quota tracker, Company profile |
| Tools | Fee calculator (Qp = R × Hi × Qi, then bill the result), chemical-name standardiser, contacts and reminders |
| Claude | Chat about the data. Claude fills forms for the officer to check and save. **Read a document**: a photo or PDF becomes a filled form. The Document Inbox holds what Claude read. The monthly budget limits the cost |
| Admin (PIN) | Claude API key, model and budget; weekly reminder e-mails; Google Calendar of licence expiries; weekly backups; Drive inbox folder; alert window; Admin PIN |
| Offline | Everything is recorded on the phone and uploads when there is a signal. Warnings (duplicates, quotas, balance, receipts used twice) need the officer's OK |

## 1 – Connect your CMU DATABASE Google Sheet (MobileAPI.gs)

The app works directly on the **CMU DATABASE 2026** sheet: the same tables, forms, QR codes, reminders, backups, Document Inbox and Claude settings as the desktop. Code.gs is not changed.

1. Open the CMU DATABASE sheet ▸ **Extensions ▸ Apps Script**.
2. Next to **Files** click **＋ ▸ Script**, name it `MobileAPI`, delete what is in it, paste the whole of `apps-script/MobileAPI.gs`, **Save**. It must stay **below Code.gs** in the file list. Do not paste it into Code.gs.
3. Choose the function **MOB_Setup** ▸ **Run** ▸ allow the permissions. It checks everything and says what to fix if something is missing.
4. Deploy: **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy** if the sheet is already deployed for the QR check page, otherwise **Deploy ▸ New deployment ▸ ⚙ Web app ▸ Execute as Me ▸ Who has access Anyone**. Copy the `/exec` link.

MobileAPI.gs also keeps the Document Inbox web link of Code.gs working, and lets the Drive inbox folder read files with the current Claude models.

## 2 – The APK (GitHub)

Upload everything inside this zip to the `cmu-mobile` repository: **Add file ▸ Upload files ▸ Commit**. **Build Android APK** runs. When it finishes, download **CMU-Database-APK** and install it over the old app. The connection and the phone's data stay.

## 3 – Phones

Open the app ▸ paste the `/exec` link and your name ▸ Connect. To edit or delete records, enter the Admin PIN in More ▸ Settings once.
