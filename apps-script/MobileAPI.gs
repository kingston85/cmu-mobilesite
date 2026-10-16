/**
 * EPA LIBERIA – ERRS | CMU DATABASE 2026 — ANDROID APP API  v2   (file: MobileAPI.gs)
 *
 * The CMU Database Android app talks to the CMU DATABASE Google Sheet through this file.
 * Add it as an EXTRA file in the sheet's Apps Script project, BELOW Code.gs and Claude.gs:
 *   Extensions ▸ Apps Script ▸ ＋ next to "Files" ▸ Script ▸ name it  MobileAPI  ▸ paste this whole file ▸ Save.
 *   (If an older MobileAPI file is already there, replace everything in it with this file.)
 * Do NOT change Code.gs or Claude.gs. This file re-uses their table engine, checks, print pages, reports, QR codes,
 * Activity Log and Claude, so a record saved on a phone is exactly like a record saved on the desktop forms.
 *
 * ONE-TIME SET-UP
 *  1. Save. In the toolbar choose the function  MOB_Setup  ▸ Run ▸ allow the permissions.
 *     It creates the sheets "Mobile Users" (hidden), "Mobile Uploads" (hidden) and "Mobile Inspections",
 *     and checks that this file answers the phones (see "doPost" below).
 *  2. Deploy ▸ New deployment ▸ ⚙ Web app ▸ Execute as: Me ▸ Who has access: Anyone ▸ Deploy ▸ copy the URL ending in /exec.
 *     If the sheet already has a web-app deployment (QR check page / Document Inbox web link):
 *     Deploy ▸ Manage deployments ▸ ✏️ Edit ▸ Version: New version ▸ Deploy — the URL stays the same and serves everything.
 *  3. On the phone: open the app ▸ paste the /exec link ▸ type your name ▸ Connect.
 *  Whenever this file changes: Deploy ▸ Manage deployments ▸ ✏️ Edit ▸ Version: New version ▸ Deploy.
 *
 * SIGN-IN
 *  MOB_NO_LOGIN = true (below): phones connect with the /exec link and the officer's name, as "staff" (add, change and delete
 *  records, like the desktop before the lock). Admin tools on the phone (backups, reminders, calendar, officers, Chemical
 *  Hazards, Claude settings) need an admin sign-in: the email + PIN of an "admin" row on the "Mobile Users" sheet.
 *  MOB_NO_LOGIN = false: every officer signs in with the email + PIN from "Mobile Users" (roles admin / staff / viewer).
 *
 * The web app keeps serving the QR check page (doGet in Code.gs) and the Document Inbox web link (handled here too).
 */

var MOB_NO_LOGIN = true;
var MOB_ALLOW_DELETE = true;          // false = phones can add and change records but never delete them

var MOB = { USERS: 'Mobile Users', UPLOADS: 'Mobile Uploads', INSP: 'Mobile Inspections', PHOTOS: 'CMU Inspection Photos', DOCS: 'CMU Mobile Documents',
  VERSION: '2026.10-v2.0', API: 2 };
var MOB_USER_HDR = ['Email', 'Name', 'Role', 'PIN', 'Active', 'Token', 'Last Sync', 'Device'];
var MOB_UP_HDR = ['Client ID', 'Type', 'Result', 'When', 'User'];
var MOB_INSP_HDR = ['Inspection ID', 'Inspection Date', 'Company ID', 'Company', 'Site / Facility', 'Inspection Type', 'Linked Record',
  'Compliance', 'Findings', 'Actions Required', 'Follow-up Date', 'Latitude', 'Longitude', 'GPS Accuracy (m)', 'Photos', 'Inspector', 'Recorded'];
try { [MOB.USERS, MOB.UPLOADS].forEach(function (n) { if (LOCK_ADMIN_HIDDEN.indexOf(n) < 0) LOCK_ADMIN_HIDDEN.push(n); }); } catch (e) { }
try { if (LOCK_STAFF.indexOf(MOB.INSP) < 0) LOCK_STAFF.push(MOB.INSP); } catch (e) { }

/* ================================================================ set-up and menu */
function MOB_addMenu_(ui) {
  ui.createMenu('📱 Mobile app')
    .addItem('Set up / repair', 'MOB_Setup')
    .addItem('Officers & PINs (open sheet)', 'MOB_OpenUsers')
    .addItem('Field inspections (open sheet)', 'MOB_OpenInspections')
    .addItem('Sign out all phones', 'MOB_ResetTokens')
    .addToUi();
}
function MOB_Setup() {
  var ss = ss_();
  PropertiesService.getScriptProperties().setProperty('CMU_SSID', ss.getId());
  var u = MOB_sheet_(MOB.USERS, MOB_USER_HDR);
  if (u.getLastRow() === 1) {
    var roles = {}; try { roles = ROLE_Map_(); } catch (e) { }
    var rows = Object.keys(roles).map(function (e) { return [e, '', roles[e], '', 'FALSE', '', '', '']; });
    if (rows.length) u.getRange(2, 1, rows.length, MOB_USER_HDR.length).setValues(rows);
  }
  u.getRange('D:D').setNumberFormat('@');
  u.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build());
  u.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['admin', 'staff', 'viewer'], true).build());
  [230, 170, 80, 70, 70, 260, 140, 150].forEach(function (w, i) { u.setColumnWidth(i + 1, w); });
  MOB_sheet_(MOB.UPLOADS, MOB_UP_HDR);
  var ins = MOB_sheet_(MOB.INSP, MOB_INSP_HDR);
  ins.getRange('B2:B').setNumberFormat('dd-MMM-yyyy'); ins.getRange('K2:K').setNumberFormat('dd-MMM-yyyy');
  try { ins.setTabColor('#2F75B5'); } catch (e) { }
  [MOB.USERS, MOB.UPLOADS].forEach(function (n) { try { ss.getSheetByName(n).setTabColor('#C00000').hideSheet(); } catch (e) { } });
  try { if (LOCK_On_()) LOCK_Apply_(); } catch (e) { }
  // the project may have only ONE doPost: the one in this file must be the one that runs (this file below Code.gs)
  var okPost = String(doPost).indexOf('MOB_route_') >= 0;
  var msg = (okPost ? '✔ Mobile app API ' + MOB.VERSION + ' is set up.\n\n' :
      '⚠ Another file\'s doPost is answering instead of MobileAPI. In the Apps Script editor drag MobileAPI BELOW Code.gs in the Files list, Save, and run MOB_Setup again.\n\n') +
    '1. Deploy ▸ New deployment ▸ Web app (Execute as: Me, Who has access: Anyone) – or Manage deployments ▸ Edit ▸ New version if it is already deployed.\n' +
    '2. On each phone: paste the /exec link in the CMU Database app.\n' +
    '3. For admin tools on the phone: open the hidden sheet "Mobile Users", give admins a PIN (4–8 digits) and set Active = TRUE.' +
    (MOB_NO_LOGIN ? '' : '\n   Sign-in is ON: every officer needs a row with a PIN, Active = TRUE and a role.');
  try { SpreadsheetApp.getUi().alert('CMU Mobile', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
}
function MOB_sheet_(name, hdr) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function MOB_OpenUsers() { var s = MOB_sheet_(MOB.USERS, MOB_USER_HDR); s.showSheet(); s.activate(); }
function MOB_OpenInspections() { var s = MOB_sheet_(MOB.INSP, MOB_INSP_HDR); s.showSheet(); s.activate(); }
function MOB_ResetTokens() {
  var s = MOB_sheet_(MOB.USERS, MOB_USER_HDR);
  if (s.getLastRow() > 1) s.getRange(2, 6, s.getLastRow() - 1, 1).clearContent();
  try { SpreadsheetApp.getActive().toast('All phones are signed out.', 'CMU Mobile', 5); } catch (e) { }
}

/* ================================================================ web API (POST, JSON) */
function doPost(e) {
  var out;
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = b.key !== undefined && !b.action ? MOB_hook_(b) : MOB_route_(b);   // Document Inbox web link | phone
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
/** the Document Inbox web link (same behaviour as the doPost in Code.gs, which this file replaces) */
function MOB_hook_(b) {
  if (typeof INB_get_ !== 'function') return { ok: false, error: 'Document Inbox is not installed.' };
  if (!INB_get_('HOOK_KEY') || b.key !== INB_get_('HOOK_KEY')) return { ok: false, error: 'wrong or missing key' };
  var blob;
  if (b.data) blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mimeType || 'application/pdf', b.name || 'document.pdf');
  else if (b.url) blob = UrlFetchApp.fetch(b.url).getBlob().setName(b.name || 'document');
  else return { ok: false, error: 'send "data" (base64) or "url"' };
  var f = INB_Folder_().createFile(blob).setDescription('source: ' + String(b.source || 'Web link').slice(0, 40));
  return { ok: true, id: f.getId(), note: 'it will be read within 10 minutes' };
}
function MOB_route_(b) {
  if (b.action === 'login') return MOB_login_(b);
  var u = MOB_auth_(b.token) || (MOB_NO_LOGIN ? MOB_openUser_(b.who) : null);
  if (!u) return { ok: false, code: 'auth', error: 'Signed out – please sign in again.' };
  switch (b.action) {
    case 'ping': return { ok: true, version: MOB.VERSION, api: MOB.API, user: MOB_pubUser_(u), serverTime: new Date().toISOString(), open: MOB_NO_LOGIN };
    case 'pull': return MOB_pull_(u);
    case 'push': return MOB_push_(u, b.items || []);
    case 'check': var c = MOB_check_(b.item || {}); return c.error ? { ok: false, error: c.error } : { ok: true, warnings: c.warnings || [], block: !!c.block };
    case 'photo': return MOB_photo_(u, b.photo || {});
    case 'verify': return MOB_verify_(u, String(b.code || ''));
    case 'pdf': return MOB_pdf_(u, b);
    case 'ai': return MOB_ai_(u, b);
    case 'aiDoc': return MOB_aiDoc_(u, b);
    case 'inbox': return MOB_inbox_(u, b);
    case 'admin': return MOB_admin_(u, b);
    case 'log': return { ok: true, rows: MOB_logRows_(Math.min(Number(b.n) || 300, 2000)) };
    default: return { ok: false, error: 'Unknown action "' + b.action + '". Update MobileAPI.gs or the app.' };
  }
}

/* ---------------------------------------------------------------- users */
function MOB_users_() {
  var sh = MOB_sheet_(MOB.USERS, MOB_USER_HDR), n = sh.getLastRow() - 1;
  return { sh: sh, rows: n > 0 ? sh.getRange(2, 1, n, MOB_USER_HDR.length).getValues() : [] };
}
function MOB_role_(r, email) {
  r = String(r || '').toLowerCase();
  if (['admin', 'staff', 'viewer'].indexOf(r) >= 0) return r;
  try { var m = ROLE_Map_()[email]; if (m === 'admin' || m === 'staff' || m === 'viewer') return m; } catch (e) { }
  return 'staff';
}
function MOB_pubUser_(u) { return { email: u.email, name: u.name, role: u.role, signedIn: !!u.row }; }
function MOB_login_(b) {
  var email = String(b.email || '').trim().toLowerCase(), pin = String(b.pin || '').trim();
  if (!email) {
    if (!MOB_NO_LOGIN) return { ok: false, code: 'auth', error: 'Sign in with your email and PIN.' };
    var o = MOB_openUser_(b.who);
    return { ok: true, token: '', user: MOB_pubUser_(o), open: true, version: MOB.VERSION, api: MOB.API };
  }
  var cache = CacheService.getScriptCache(), ck = 'mobfail_' + email, fails = Number(cache.get(ck) || 0);
  if (fails >= 5) return { ok: false, error: 'Too many wrong PINs. Try again in 15 minutes.' };
  var U = MOB_users_();
  for (var i = 0; i < U.rows.length; i++) {
    var r = U.rows[i];
    if (String(r[0]).trim().toLowerCase() !== email) continue;
    if (!pin || String(r[3]).trim() !== pin) break;
    if (String(r[4]).toUpperCase() !== 'TRUE') return { ok: false, error: 'This account is not active. Ask a CMU admin.' };
    var token = String(r[5] || '');
    if (!token) { token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8); U.sh.getRange(i + 2, 6).setValue(token); }
    U.sh.getRange(i + 2, 7, 1, 2).setValues([[nowText_(), String(b.device || '').slice(0, 60)]]);
    cache.remove(ck);
    var user = { email: email, name: String(r[1] || email), role: MOB_role_(r[2], email), row: i + 2 };
    MOB_log_(user, 'Mobile sign-in', MOB.USERS, email, String(b.device || ''));
    return { ok: true, token: token, user: MOB_pubUser_(user), open: MOB_NO_LOGIN, version: MOB.VERSION, api: MOB.API };
  }
  cache.put(ck, String(fails + 1), 900);
  return { ok: false, error: 'Wrong email or PIN.' };
}
function MOB_auth_(token) {
  if (!token) return null;
  var U = MOB_users_();
  for (var i = 0; i < U.rows.length; i++) {
    var r = U.rows[i];
    if (String(r[5]) === String(token) && String(r[4]).toUpperCase() === 'TRUE') {
      var email = String(r[0]).trim().toLowerCase();
      return { email: email, name: String(r[1] || email), role: MOB_role_(r[2], email), row: i + 2, sh: U.sh };
    }
  }
  return null;
}
function MOB_openUser_(who) {
  var n = String(who || '').trim().slice(0, 60);
  return { email: n || 'mobile-app', name: n || 'Mobile app', role: 'staff', row: 0, sh: null };
}
function MOB_need_(u, role) {
  var rank = { viewer: 0, staff: 1, admin: 2 };
  if ((rank[u.role] || 0) >= rank[role]) return null;
  return role === 'admin' ? 'Only a CMU admin can do this. Sign in as an admin (More ▸ Account).' : 'Your account is view-only.';
}
function MOB_log_(u, action, register, id, details) {
  try { EXT_LogSheet_().appendRow([new Date(), u.email + ' (mobile)', action, register || '', String(id || ''), details || '']); } catch (e) { }
}

/* ---------------------------------------------------------------- serialising */
function MOB_ser_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}
function MOB_norm_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return MOB_ser_(v);
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  var s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 1e6) / 1e6);
  return s;
}
function MOB_table_(name) {
  var t = T_(name), cols = t.cols, out = [];
  t.values().forEach(function (r) {
    if (trim_(r[0]) === '') return;
    var o = {}; cols.forEach(function (c, j) { o[c] = MOB_ser_(r[j]); }); out.push(o);
  });
  return out;
}
function MOB_tableSafe_(name) { try { return MOB_table_(name); } catch (e) { return []; } }
function MOB_listCol_(tbl, col) { try { return T_(tbl).column(col).map(str_).filter(function (x) { return x !== ''; }); } catch (e) { return []; } }
function MOB_sheetRows_(name, hdrRow, firstRow, ncol, keyCol) {
  var sh = sh_(name); if (!sh) return [];
  var last = sh.getLastRow(); if (last < firstRow) return [];
  var hdr = sh.getRange(hdrRow, 1, 1, ncol).getValues()[0].map(str_);
  return sh.getRange(firstRow, 1, last - firstRow + 1, ncol).getValues().map(function (r, i) {
    var o = { _row: firstRow + i }; hdr.forEach(function (h, j) { if (h) o[h] = MOB_ser_(r[j]); }); return o;
  }).filter(function (o) { return trim_(o[hdr[keyCol || 0]]) !== ''; });
}
function MOB_logRows_(n) {
  var sh = sh_(EXT.LOG); if (!sh || sh.getLastRow() < 2) return [];
  var last = sh.getLastRow(), k = Math.min(n, last - 1);
  return sh.getRange(last - k + 1, 1, k, 6).getValues().reverse().map(function (r) {
    return { when: r[0] instanceof Date ? Utilities.formatDate(r[0], tz_(), "yyyy-MM-dd'T'HH:mm") : str_(r[0]), who: str_(r[1]), action: str_(r[2]),
      register: str_(r[3]), record: str_(r[4]), details: str_(r[5]) };
  });
}

/* ---------------------------------------------------------------- read everything the phone shows */
function MOB_pull_(u) {
  var hz = [];
  try {
    var hs = sh_(EXT.HAZ);
    if (hs) hz = hs.getRange(HAZ_FIRST, 1, HAZ_LAST - HAZ_FIRST + 1, 9).getValues().map(function (r, i) {
      return { _row: HAZ_FIRST + i, name: str_(r[0]), cas: str_(r[1]), h: MOB_ser_(r[2]), f: MOB_ser_(r[3]), p: MOB_ser_(r[4]), hmis: MOB_ser_(r[5]), cat: str_(r[6]), notes: str_(r[7]), sds: str_(r[8]) };
    }).filter(function (r) { return r.name; });
  } catch (e) { }
  var ins = [];
  var is = sh_(MOB.INSP);
  if (is && is.getLastRow() > 1) is.getRange(2, 1, is.getLastRow() - 1, MOB_INSP_HDR.length).getValues().forEach(function (r) {
    if (!trim_(r[0])) return; var o = {}; MOB_INSP_HDR.forEach(function (c, j) { o[c] = MOB_ser_(r[j]); }); ins.push(o);
  });
  var contacts = [];
  try { if (sh_(EXT.CON)) contacts = MOB_sheetRows_(EXT.CON, CON_FIRST - 1, CON_FIRST, 7, 0); } catch (e) { }
  var inbox = [];
  try {
    if (typeof INB_Rows_ === 'function' && sh_(INB.SHEET)) {
      var rows = INB_Rows_(), open = rows.filter(function (o) { return INB.OPEN.indexOf(String(o.Status)) >= 0; }),
        done = rows.filter(function (o) { return INB.OPEN.indexOf(String(o.Status)) < 0; }).slice(-20);
      inbox = open.concat(done).map(MOB_inboxItem_);
    }
  } catch (e) { }
  var emails = [];
  try {
    var ml = sh_(EXT2.MAIL);
    if (ml && ml.getLastRow() > 1) {
      var k = Math.min(300, ml.getLastRow() - 1);
      emails = ml.getRange(ml.getLastRow() - k + 1, 1, k, 8).getValues().reverse().map(function (r) {
        return { date: MOB_ser_(r[0]), dir: str_(r[1]), coId: str_(r[2]), co: str_(r[3]), from: str_(r[4]), to: str_(r[5]), subject: str_(r[6]), snippet: str_(r[7]) };
      });
    }
  } catch (e) { }
  if (u.sh && u.row) try { u.sh.getRange(u.row, 7).setValue(nowText_()); } catch (e) { }
  return {
    ok: true, serverTime: new Date().toISOString(), version: MOB.VERSION, api: MOB.API, user: MOB_pubUser_(u), open: MOB_NO_LOGIN, allowDelete: MOB_ALLOW_DELETE,
    tables: {
      companies: MOB_table_('tblCompanies'), licences: MOB_table_('tblLicences'), licenceChemicals: MOB_table_('tblLicenceChemicals'),
      licenceVehicles: MOB_tableSafe_('tblLicenceVehicles'), licenceEffluent: MOB_tableSafe_('tblLicenceEffluent'),
      clearances: MOB_table_('tblClearances'), bills: MOB_table_('tblBills'), payments: MOB_table_('tblPayments'),
      issues: MOB_tableSafe_('tblIssues'), correspondence: MOB_tableSafe_('tblCorrespondence'), inspections: ins,
      contacts: contacts, hazards: hz, activity: MOB_logRows_(400), inbox: inbox, emails: emails
    },
    lists: MOB_lists_(),
    settings: MOB_settings_()
  };
}
function MOB_lists_() {
  var bt = [], sv = [], sig = [], off = [];
  try { bt = T_('tblBillTypes').values().filter(function (r) { return str_(r[0]); }).map(function (r) { return { type: str_(r[0]), group: str_(r[1]), feeTable: /^y/i.test(str_(r[6])) }; }); } catch (e) { }
  try { sv = T_('tblServices').values().filter(function (r) { return str_(r[0]); }).map(function (r) { return { service: str_(r[0]), group: str_(r[1]), fee: isNum_(r[2]) && str_(r[2]) !== '' ? num_(r[2]) : null, notes: str_(r[3]) }; }); } catch (e) { }
  try { sig = T_('tSignatory').values().filter(function (r) { return str_(r[0]); }).map(function (r) { return { key: str_(r[0]), name: str_(r[1]), title: str_(r[2]) }; }); } catch (e) { }
  try { off = T_('tOffice').values().filter(function (r) { return str_(r[0]); }).map(function (r) { return { key: str_(r[0]), office: str_(r[1]), contact: str_(r[2]), prefix: str_(r[3]) }; }); } catch (e) { }
  return {
    categories: MOB_listCol_('tLicCategory', 'Licence Category'), types: MOB_listCol_('tLicType', 'Licence / Certificate Type'),
    units: MOB_listCol_('tUnit', 'Unit'), chemicals: MOB_listCol_('tChemical', 'Chemical (Standard)'), sectors: MOB_listCol_('tSector', 'Sector / Activity'),
    purposes: MOB_listCol_('tPurpose', 'Service / Purpose'), recordGroups: MOB_listCol_('tRecordGroup', 'Record Group'),
    parameters: MOB_listCol_('tParameter', 'Parameter'), effUnits: MOB_listCol_('tEffUnit', 'Effluent Unit'), schedules: MOB_listCol_('tSchedule', 'Testing Schedule'),
    billTypes: bt, services: sv, signatories: sig, offices: off,
    hazardCats: (typeof HAZ_CATS !== 'undefined' ? HAZ_CATS : []).map(function (c) { return { name: c[0], basis: c[1], rate: c[2] }; }),
    hazardIndex: (typeof HAZ_HI !== 'undefined' ? HAZ_HI : []).map(function (c) { return { hmis: c[0], hi: c[1] }; }),
    issueStatus: ['Open', 'Open – confirm', 'Verified', 'Closed'],
    registers: ['Companies', 'Licences & Certificates', 'Licence Chemicals', 'Chemical Clearances', 'Bills & Invoices', 'Payments & Receipts', 'Notes & Issues', 'Mobile Inspections'],
    corrTypes: ['Reminder Letter', 'Violation Notice', 'Shutdown Notice', 'Warning Letter', 'Compliance Order', 'Other']
  };
}
function MOB_settings_() {
  var s = { version: MOB.VERSION };
  try { s.lock = LOCK_On_(); } catch (e) { }
  try { s.qrUrl = QR_Url_(); } catch (e) { }
  try { var ins = sh_(EXT.INS); if (ins) { s.insAhead = num_(ins.getRange('B3').getValue()) || 60; s.insBack = num_(ins.getRange('D3').getValue()) || 30; } } catch (e) { }
  try { var con = sh_(EXT.CON); if (con) { var R = REM_Settings_(con); s.reminders = { on: R.on, licDays: R.licDays, billDays: R.billDays, cc: R.cc, sign: R.sign, last: str_(con.getRange('C8').getValue()) }; } } catch (e) { }
  try { var p = PropertiesService.getScriptProperties(); s.lastBackup = p.getProperty('CMU_LAST_BACKUP') || ''; s.backupsOn = p.getProperty('CMU_BAK_OFF') !== '1'; s.calLast = p.getProperty('CMU_CAL_LAST') || ''; } catch (e) { }
  try { s.calendarOn = CAL_Triggers_().length > 0; s.mailOn = MAIL_Triggers_().length > 0; s.inboxPolling = INB_Triggers_().length > 0; } catch (e) { }
  s.claude = typeof CLAUDE_key_ === 'function' ? { installed: true, hasKey: !!CLAUDE_key_(), model: CLAUDE_model_(), spent: CLAUDE_spent_(), budget: CLAUDE_budget_() } : { installed: false };
  return s;
}

/* ================================================================ save records (queued on the phone, idempotent by client ID) */
/** item = { cid, type, op: create | update | delete, id, data, base, force, inboxFid } */
function MOB_push_(u, items) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var up = MOB_sheet_(MOB.UPLOADS, MOB_UP_HDR), done = {};
    if (up.getLastRow() > 1) up.getRange(2, 1, up.getLastRow() - 1, 3).getValues().forEach(function (r) { done[String(r[0])] = String(r[2]); });
    var results = [];
    items.forEach(function (it) {
      var cid = String(it.cid || '');
      if (!cid) return;
      if (done[cid]) { results.push({ cid: cid, status: 'ok', id: done[cid], repeat: true }); return; }
      var r;
      try {
        it.op = it.op || 'create';
        var need = MOB_need_(u, it.type === 'hazard' ? 'admin' : 'staff');
        if (need) r = { status: 'error', error: need };
        else if (it.op === 'delete' && !MOB_ALLOW_DELETE) r = { status: 'error', error: 'Deleting from the phone is switched off (MOB_ALLOW_DELETE in MobileAPI.gs).' };
        else {
          var conflict = it.op !== 'create' && !it.force ? MOB_conflict_(it) : null;
          if (conflict) r = { status: 'conflict', current: conflict.current, error: conflict.message };
          else {
            var chk = MOB_check_(it);
            if (chk.error) r = { status: 'error', error: chk.error };
            else if (chk.block && !it.force) r = { status: 'confirm', warnings: chk.warnings };
            else {
              var id = MOB_save_(u, it);
              r = { status: 'ok', id: id, warnings: chk.warnings };
              up.appendRow([cid, it.type + ' ' + it.op, id, new Date(), u.email]); done[cid] = id;
              if (it.inboxFid && it.op === 'create') try { MOB_inboxApproved_(u, it.inboxFid, it.type, id); } catch (e) { }
            }
          }
        }
      } catch (err) { r = { status: 'error', error: String(err && err.message || err) }; }
      r.cid = cid; results.push(r);
    });
    SpreadsheetApp.flush();
    return { ok: true, results: results };
  } finally { lock.releaseLock(); }
}
/** api_billStatus with fall-backs (company from Company ID / Name as Recorded when the Company Name formula is still empty) */
function MOB_billStatus_(pick) {
  var st = api_billStatus(pick);
  if (st.co) { st.coId = CompanyID_(st.co); return st; }
  var t = T_('tblBills'), rows = MOB_rowsOf_('tblBills', 'Bill No.', st.bn);
  if (!rows.length) return st;
  var coId = str_(t.get(rows[0], 'Company ID')), co = str_(t.get(rows[0], 'Name as Recorded'));
  if (coId) { var tc = T_('tblCompanies'), i = tc.match('Company ID', coId); if (i) co = str_(tc.get(i, 'Company Name')); }
  st.co = co || coId; st.coId = coId;
  return st;
}
function MOB_d_(v) { var d = ext_toDate_(v); return d ? dateCell_(d) : ''; }
function MOB_dOrText_(v) { var d = ext_toDate_(v); return d ? dateCell_(d) : (v === undefined || v === null ? '' : String(v)); }
function MOB_src_(u) { return 'Mobile app ' + nowText_() + ' (' + u.email + ')'; }
function MOB_srcUpd_(u, old) { return (str_(old) ? str_(old) + ' | ' : '') + 'Updated ' + nowText_() + ' (' + u.email + ', mobile)'; }
function MOB_q_(v) { return isNum_(v) && str_(v) !== '' ? num_(v) : (v === undefined || v === null ? '' : v); }
function MOB_rowsOf_(tbl, col, key) {
  var t = T_(tbl), c = t.col(col) - 1, k = trim_(key).toUpperCase(), out = [];
  t.values().forEach(function (r, i) { if (trim_(r[c]).toUpperCase() === k && k) out.push(i + 1); });
  return out;
}
function MOB_obj_(t, idx) { var o = {}, r = t.values()[idx - 1]; t.cols.forEach(function (c, j) { o[c] = MOB_ser_(r[j]); }); return o; }

/* ---------------------------------------------------------------- conflict check: the record changed on the desktop since the phone read it */
var MOB_KEYCOLS = {
  company: ['tblCompanies', 'Company ID', ['Company Name', 'Sector / Activity', 'Location', 'Other Names Recorded']],
  licence: ['tblLicences', 'Record ID', ['Company ID', 'Licence Category', 'Licence / Certificate Type', 'Location', 'Application Date', 'Response Date', 'Reference Code', 'Licence / Certificate No.', 'Date Issued', 'Expiry Date', 'Remarks']],
  clearance: ['tblClearances', 'Clearance No.', ['Record ID', 'Company ID', 'Chemical as Recorded', 'Chemical (Standard)', 'Qty as Recorded', 'Unit', 'B/L / Invoice / AWB No.', 'Clearance Ref. No.', 'Clearance Date', 'Remarks', 'ETA']],
  bill: ['tblBills', 'Bill No.', ['Bill ID', 'Company ID', 'Purpose / Licence Billed', 'Chemical', 'Amount Billed (USD)', 'Bill Date', 'Bill Ref. No.', 'Contact Person', 'Contact Title', 'Bill Type', 'Location', 'Activity', 'Linked Record']],
  payment: ['tblPayments', 'Record ID', ['Company ID', 'Purpose / Services', 'Amount (USD)', 'Payment Date', 'Receipt No.', 'Remarks', 'Bill No.']],
  issue: ['tblIssues', 'Issue #', ['Register', 'Record', 'Issue Found', 'Action Taken', 'Follow-up Status']],
  correspondence: ['tblCorrespondence', 'Record ID', ['Company ID', 'Type', 'Activity', 'Description', 'EPA Reference No.', 'Date Issued']]
};
function MOB_conflict_(it) {
  var k = MOB_KEYCOLS[it.type];
  if (!k || !it.base) return null;
  var t = T_(k[0]), idxs = MOB_rowsOf_(k[0], k[1], it.id);
  if (!idxs.length) return { message: it.id + ' is no longer in ' + t.sheet.getName() + ' (deleted on the desktop?).', current: null };
  var cur = idxs.map(function (i) { return MOB_obj_(t, i); });
  var base = Array.isArray(it.base) ? it.base : [it.base];
  var sig = function (rows) {
    return rows.map(function (o) { return k[2].map(function (c) { return MOB_norm_(o[c]); }).join('\u0001'); }).sort().join('\u0002');
  };
  if (sig(cur) === sig(base)) return null;
  return { message: it.id + ' was changed on the desktop (or another phone) after you opened it.', current: cur };
}

/* ---------------------------------------------------------------- checks (same questions as the desktop forms) */
function MOB_check_(it) {
  var d = it.data || {}, w = [], block = false, op = it.op || 'create';
  var need = function (v, label) { return trim_(v) === '' ? label + ' is required.' : ''; };
  if (op === 'delete') return MOB_checkDelete_(it);
  switch (it.type) {
    case 'company': {
      var nm = trim_(d.name);
      if (!nm) return { error: 'Company name is required.' };
      var t = T_('tblCompanies'), hit = t.match('Company Name', nm);
      if (hit && (op === 'create' || str_(t.get(hit, 'Company ID')) !== trim_(it.id))) return { error: '"' + nm + '" is already registered as ' + str_(t.get(hit, 'Company ID')) + '.' };
      DUP_Similar_(nm, 3).forEach(function (s) { if (s.id !== trim_(it.id)) { w.push('Similar company already registered: ' + s.id + ' ' + s.name + ' (' + Math.round(s.score * 100) + '% similar)'); if (op === 'create') block = true; } });
      break;
    }
    case 'licence': {
      var e1 = need(d.company, 'Company') || need(d.category, 'Licence category') || need(d.type, 'Licence / certificate type');
      if (e1) return { error: e1 };
      if (!CompanyID_(d.company)) return { error: 'Company "' + d.company + '" is not registered. Register it first.' };
      var iss = ext_toDate_(d.issued), exp = ext_toDate_(d.expiry);
      if (iss && exp && exp < iss) { w.push('Expiry date is before the issue date.'); block = true; }
      if (trim_(d.licNo)) {
        var L = T_('tblLicences'), dupNo = MOB_rowsOf_('tblLicences', 'Licence / Certificate No.', d.licNo).filter(function (i) { return str_(L.get(i, 'Record ID')) !== trim_(it.id); });
        if (dupNo.length) { w.push('Licence No. ' + trim_(d.licNo) + ' is already on ' + dupNo.map(function (i) { return str_(L.get(i, 'Record ID')); }).join(', ') + '.'); block = true; }
      }
      var chems = (d.chemicals || []).filter(function (c) { return trim_(c.name) || trim_(c.qty) || trim_(c.epaReg); });
      if (chems.some(function (c) { return !trim_(c.name); })) return { error: 'A chemical line has details but no Trade or IUPAC Name.' };
      if (chems.length && !/\(CRL\)|\(CIL\)/i.test(d.category)) w.push(chems.length + ' chemical line(s) are entered but the category is not CRL or CIL.');
      var ef = d.effluent || {};
      if ((ef.limits || []).some(function (l) { return !trim_(l.param) && (trim_(l.unit) || trim_(l.limit)); })) return { error: 'A discharge limit line has details but no parameter.' };
      if ((ef.sources || []).some(function (l) { return !trim_(l.source) && trim_(l.unit); })) return { error: 'A discharge source line has a receiving unit but no discharge source.' };
      break;
    }
    case 'clearance': {
      var co = trim_(d.company), coId = CompanyID_(co);
      if (!co) return { error: 'Company is required.' };
      if (!coId) return { error: 'Company "' + co + '" is not registered. Register it first.' };
      var date = ext_toDate_(d.date);
      if (!date) return { error: 'Clearance date is missing or not valid.' };
      var lines = (d.lines || []).filter(function (l) { return trim_(l.rec) || trim_(l.std); });
      if (!lines.length) return { error: 'Add at least one chemical line.' };
      if (lines.length > 20) return { error: 'A clearance can have at most 20 chemical lines.' };
      if (lines.some(function (l) { return trim_(l.qty) === '' || trim_(l.unit) === ''; })) return { error: 'Every chemical line needs a quantity and a unit.' };
      try {
        var keep = {}; (d.lines || []).forEach(function (l) { if (l.id) keep[String(l.id).toUpperCase()] = 1; });
        var extra = lines.filter(function (l) { return !l.id; }).map(function (l, i) {
          return { id: 'NEW-' + i, no: 'this clearance', coId: coId, co: co, rec: str_(l.rec || l.std), std: str_(l.std), kg: quoKg_(l.qty, l.unit) || 0, date: date };
        }).filter(function (x) { return x.kg; });
        if (extra.length) {
          var Q = QUO_Data_(extra);
          Q.rows.forEach(function (x) {
            if (!x.ch.lines.some(function (l) { return l.isNew; }) || x.ch.limit === null || x.pct <= 1.0000001) return;
            w.push('Over quota: ' + x.ch.name + ' – ' + fmtMoney_(x.basis) + ' kg of ' + fmtMoney_(x.ch.limit) + ' kg' + (x.ch.perMonth ? ' per month' : '') + ' (' + Math.round(x.pct * 100) + '%) on ' + x.lic.id + ' ' + x.lic.no); block = true;
          });
          Q.notOn.forEach(function (x) { if (x.line.isNew) { w.push('Not on licence ' + x.lic.id + ' ' + x.lic.no + ': ' + (x.line.rec || x.line.std)); block = true; } });
          if (Q.noLic.some(function (x) { return x.isNew; }) && Q.lics.some(function (l) { return l.coId === coId; })) { w.push(co + ' has no Chemical Importation Licence valid on ' + ext_fmtD_(date)); block = true; }
        }
      } catch (e) { }
      break;
    }
    case 'bill': {
      var e2 = need(d.company, 'Company') || need(d.type, 'Bill type');
      if (e2) return { error: e2 };
      if (!CompanyID_(d.company)) return { error: 'Company "' + d.company + '" is not registered.' };
      if (!ext_toDate_(d.date)) return { error: 'Bill date is missing or not valid.' };
      var bl = (d.lines || []).filter(function (l) { return trim_(l.service); });
      if (!bl.length) return { error: 'Add at least one service line.' };
      if (bl.length > 10) return { error: 'A bill can have at most 10 service lines.' };
      if (bl.some(function (l) { return trim_(l.amount) === '' || !isNum_(l.amount); })) return { error: 'Every service line needs an amount in US$.' };
      if (trim_(d.ref)) {
        var B = T_('tblBills'), refRows = MOB_rowsOf_('tblBills', 'Bill Ref. No.', d.ref).filter(function (i) { return str_(B.get(i, 'Bill No.')) !== trim_(it.id); });
        if (refRows.length) return { error: 'Bill Ref. No. ' + trim_(d.ref) + ' is already used on ' + str_(B.get(refRows[0], 'Bill No.')) + '. Each bill needs its own reference number.' };
      }
      var g = Group_OfType_(d.type);
      bl.forEach(function (l) { var tg = Group_OfType_(Type_For(l.service)); if (g && tg && g !== tg) { w.push('"' + l.service + '" is a ' + tg + ' service but the bill type is ' + d.type + ' (' + g + ').'); block = true; } });
      if (d.linked) String(d.linked).split(/\s*,\s*/).forEach(function (rec) {
        if (!rec) return; var n = T_('tblBills').countIf('Linked Record', '*' + rec + '*') - (op === 'update' ? MOB_rowsOf_('tblBills', 'Bill No.', it.id).filter(function (i) { return str_(T_('tblBills').get(i, 'Linked Record')).indexOf(rec) >= 0; }).length : 0);
        if (n > 0) { w.push(rec + ' has already been billed.'); block = true; }
      });
      break;
    }
    case 'payment': {
      if (!(num_(d.amount) > 0)) return { error: 'The amount must be above 0.' };
      if (!ext_toDate_(d.date)) return { error: 'Payment date is missing or not valid.' };
      if (!trim_(d.bill)) {      // a payment on the company account (no bill), like the desktop Payment Form allows
        if (!trim_(d.company) || !CompanyID_(d.company)) return { error: 'Choose the bill being paid, or a registered company.' };
        if (!trim_(d.purpose)) return { error: 'Purpose / services is required.' };
        if (trim_(d.receipt)) {
          var PR0 = T_('tblPayments'), rr0 = MOB_rowsOf_('tblPayments', 'Receipt No.', d.receipt).filter(function (i) { return str_(PR0.get(i, 'Record ID')) !== trim_(it.id); });
          if (rr0.length) { w.push('Receipt No. ' + trim_(d.receipt) + ' is already recorded (' + str_(PR0.get(rr0[0], 'Record ID')) + ').'); block = true; }
        }
        break;
      }
      var st = MOB_billStatus_(String(d.bill || ''));
      if (!st.co) return { error: 'Bill No. "' + (d.bill || '') + '" was not found.' };
      var already = 0;
      if (op === 'update') { var P = T_('tblPayments'), pi = P.match('Record ID', it.id); if (pi && str_(P.get(pi, 'Bill No.')) === st.bn) already = num_(P.get(pi, 'Amount (USD)')); }
      var bal = st.bal + already;
      if (num_(d.amount) > bal + 0.005) { w.push('Amount US$' + fmtMoney_(num_(d.amount)) + ' is more than the outstanding balance US$' + fmtMoney_(bal) + ' on ' + st.bn + '.'); block = true; }
      if (trim_(d.receipt)) {
        var PR = T_('tblPayments'), rr = MOB_rowsOf_('tblPayments', 'Receipt No.', d.receipt).filter(function (i) { return str_(PR.get(i, 'Record ID')) !== trim_(it.id); });
        if (rr.length) { w.push('Receipt No. ' + trim_(d.receipt) + ' is already recorded (' + str_(PR.get(rr[0], 'Record ID')) + ').'); block = true; }
      }
      break;
    }
    case 'issue': if (!trim_(d.issue)) return { error: 'Describe the issue found.' }; break;
    case 'correspondence':
      if (!trim_(d.company) || !CompanyID_(d.company)) return { error: 'Choose a registered company.' };
      if (!trim_(d.type)) return { error: 'Type (e.g. Violation Notice) is required.' };
      break;
    case 'inspection':
      if (!trim_(d.site)) return { error: 'Site / facility is required.' };
      if (!ext_toDate_(d.date)) return { error: 'Inspection date is missing or not valid.' };
      if (trim_(d.company) && !CompanyID_(d.company)) w.push('Company "' + d.company + '" is not registered – saved with the name only.');
      break;
    case 'contact':
      if (!trim_(d.coId)) return { error: 'Company ID missing.' };
      if (trim_(d.email) && !REM_Emails_(d.email).length) return { error: 'The email address does not look valid.' };
      break;
    case 'hazard':
      if (!trim_(d.name)) return { error: 'Chemical name missing.' };
      ['h', 'f', 'p', 'hmis'].forEach(function (k) { if (trim_(d[k]) !== '' && !(isNum_(d[k]) && num_(d[k]) >= 0 && num_(d[k]) <= 4)) w.push('HMIS values must be 0 – 4.'); });
      if (w.length) return { error: w[0] };
      break;
    default: return { error: 'Unknown record type ' + it.type };
  }
  return { warnings: w, block: block };
}
function MOB_checkDelete_(it) {
  var id = trim_(it.id).toUpperCase(), w = [];
  if (!id) return { error: 'Nothing to delete.' };
  if (it.type === 'company') {
    var n = 0;
    ['tblLicences', 'tblClearances', 'tblBills', 'tblPayments', 'tblCorrespondence'].forEach(function (x) { try { n += T_(x).countIf('Company ID', id); } catch (e) { } });
    if (n > 0) return { error: 'Cannot delete ' + id + ': it is used by ' + n + ' licence/clearance/bill/payment record(s).' };
  }
  if (it.type === 'bill') {
    var paid = T_('tblPayments').sumIfs('Amount (USD)', 'Bill No.', id);
    if (paid > 0) { w.push('US$' + fmtMoney_(paid) + ' in payments is linked to ' + id + '.'); return { warnings: w, block: true }; }
  }
  return { warnings: w, block: false };
}

/* ---------------------------------------------------------------- save */
function MOB_save_(u, it) {
  var d = it.data || {}, op = it.op;
  switch (it.type) {
    case 'company': return MOB_saveCompany_(u, op, it.id, d);
    case 'licence': return MOB_saveLicence_(u, op, it.id, d);
    case 'clearance': return MOB_saveClearance_(u, op, it.id, d);
    case 'bill': return MOB_saveBill_(u, op, it.id, d);
    case 'payment': return MOB_savePayment_(u, op, it.id, d);
    case 'issue': return MOB_saveIssue_(u, op, it.id, d);
    case 'correspondence': return MOB_saveCorr_(u, op, it.id, d);
    case 'inspection': return MOB_saveInspection_(u, op, it.id, d);
    case 'contact': return MOB_saveContact_(u, d);
    case 'hazard': return MOB_saveHazard_(u, d);
  }
  throw new Error('Unknown record type');
}
function MOB_find_(tbl, col, id) {
  var t = T_(tbl), i = t.match(col, id);
  if (!i) throw new Error(id + ' was not found in ' + t.sheet.getName() + '.');
  return { t: t, i: i };
}
function MOB_saveCompany_(u, op, id, d) {
  var t = T_('tblCompanies');
  if (op === 'delete') { var f = MOB_find_('tblCompanies', 'Company ID', id), desc = str_(f.t.get(f.i, 'Company Name')); f.t.deleteRow(f.i); MOB_log_(u, 'Deleted', 'Companies', id, desc); return id; }
  var row = { 'Company Name': trim_(d.name), 'Sector / Activity': d.sector || '', 'Location': d.location || '', 'Other Names Recorded': d.other || '' };
  if (op === 'update') {
    var g = MOB_find_('tblCompanies', 'Company ID', id), oldName = str_(g.t.get(g.i, 'Company Name'));
    if (oldName && oldName !== row['Company Name'] && (', ' + row['Other Names Recorded'] + ',').indexOf(oldName) < 0)
      row['Other Names Recorded'] = row['Other Names Recorded'] ? row['Other Names Recorded'] + '; ' + oldName : oldName;   // keep the old spelling findable
    g.t.setRow(g.i, row);
    MOB_log_(u, 'Updated', 'Companies', id, row['Company Name']);
    return id;
  }
  var nid = NextID_(t, 'Company ID', 'CMU-'), idx = t.addRow();
  row['Company ID'] = nid; t.setRow(idx, row);
  if (idx > 1) t._fillCalculated(idx);
  try {   // Company Contacts: reuse a left-over row of a deleted company with the same ID, else add one
    var cs = sh_(EXT.CON);
    if (cs) {
      var cn = Math.max(cs.getLastRow() - CON_FIRST + 1, 0), cr = 0;
      if (cn) cs.getRange(CON_FIRST, 1, cn, 1).getValues().forEach(function (x, i) { if (!cr && str_(x[0]) === nid) cr = CON_FIRST + i; });
      cs.getRange(cr || Math.max(cs.getLastRow() + 1, CON_FIRST), 1, 1, 7).setValues([[nid, row['Company Name'], '', '', '', 'Yes', '']]);
    }
  } catch (e) { }
  MOB_log_(u, 'Saved new', 'Companies', nid, row['Company Name']);
  return nid;
}
function MOB_saveLicence_(u, op, id, d) {
  var t = T_('tblLicences');
  if (op === 'delete') {
    var f = MOB_find_('tblLicences', 'Record ID', id), desc = [str_(f.t.get(f.i, 'Company Name')), str_(f.t.get(f.i, 'Licence / Certificate Type')), str_(f.t.get(f.i, 'Licence / Certificate No.'))].filter(String).join(' – ');
    f.t.deleteRow(f.i);
    DeleteByKey_('tblLicenceChemicals', id); try { DeleteByKey_('tblLicenceEffluent', id); } catch (e) { } try { DeleteByKey_('tblLicenceVehicles', id); } catch (e) { }
    MOB_log_(u, 'Deleted', 'Licences & Certificates', id, desc);
    return id;
  }
  var co = trim_(d.company);
  var row = { 'Company ID': CompanyID_(co), 'Name as Recorded': co, 'Licence Category': d.category || '', 'Licence / Certificate Type': d.type || '',
    'Location': d.location || '', 'Application Date': MOB_d_(d.applicationDate), 'Response Date': MOB_d_(d.responseDate), 'Reference Code': d.refCode || '',
    'Licence / Certificate No.': d.licNo || '', 'Date Issued': MOB_d_(d.issued), 'Expiry Date': MOB_d_(d.expiry), 'Remarks': d.remarks || '' };
  var lid, idx;
  if (op === 'update') {
    var g = MOB_find_('tblLicences', 'Record ID', id); lid = trim_(id).toUpperCase(); idx = g.i;
    row['Source'] = MOB_srcUpd_(u, g.t.get(g.i, 'Source'));
    g.t.setRow(idx, row); if (idx > 1) g.t._fillCalculated(idx);
  } else {
    lid = NextID_(t, 'Record ID', 'LIC-'); idx = t.addRow();
    row['Record ID'] = lid; row['Source'] = MOB_src_(u);
    t.setRow(idx, row); if (idx > 1) t._fillCalculated(idx);
  }
  // chemicals (all of them are replaced, like Save New / Update on the Licence Form – but without the 15-line limit)
  if (d.chemicals) {
    DeleteByKey_('tblLicenceChemicals', lid);
    var lc = T_('tblLicenceChemicals');
    d.chemicals.filter(function (c) { return trim_(c.name); }).forEach(function (c) {
      lc.refresh(); var k = lc.addRow();
      lc.setRow(k, { 'Licence Record ID': lid, 'Trade or IUPAC Name': trim_(c.name), 'EPA Registration No.': c.epaReg || '', 'Type': c.type || '',
        'Stipulated Qty': MOB_q_(c.qty), 'Unit': c.unit || '', 'Consignment Ref. (BL/IPD No.)': c.consignment || '' });
      lc.refresh(); ForceCalc_(lc, k, ['Licence No.', 'Company']);
    });
  }
  if (d.vehicles) {
    try {
      DeleteByKey_('tblLicenceVehicles', lid);
      var lv = T_('tblLicenceVehicles');
      d.vehicles.filter(function (v) { return trim_(v.type) || trim_(v.reg) || trim_(v.epaReg); }).forEach(function (v) {
        lv.refresh(); var k = lv.addRow();
        lv.setRow(k, { 'Licence Record ID': lid, 'Vehicle Type': v.type || '', 'Vehicle Registration No.': v.reg || '', 'EPA Registration No.': v.epaReg || '' });
        lv.refresh(); ForceCalc_(lv, k, ['Licence No.', 'Company']);
      });
    } catch (e) { }
  }
  if (d.effluent) {
    var ef = d.effluent, te = T_('tblLicenceEffluent');
    Eff_Delete_(lid);
    (ef.settings || []).forEach(function (s, i) { if (trim_(s.value)) Eff_AddRow_(te, lid, 'Setting', i + 1, [s.item || '', s.value]); });
    var n = 0; (ef.limits || []).forEach(function (l) { if (trim_(l.param)) { n++; Eff_AddRow_(te, lid, 'Limit', n, [l.param, l.unit || '', l.limit || '', l.sample || '', l.schedule || '', l.stage || '']); } });
    n = 0; (ef.coords || []).forEach(function (c) { if ([c.table, c.vertex, c.easting, c.northing].some(function (x) { return trim_(x); })) { n++; Eff_AddRow_(te, lid, 'Coordinate', n, [c.table || '', c.vertex || '', c.easting || '', c.northing || '']); } });
    n = 0; (ef.sources || []).forEach(function (s) { if (trim_(s.source)) { n++; Eff_AddRow_(te, lid, 'Source', n, [s.source, s.unit || '', s.x || '', s.y || '']); } });
  }
  MOB_log_(u, op === 'update' ? 'Updated' : 'Saved new', 'Licences & Certificates', lid, [co, d.type, d.licNo].filter(Boolean).join(' – '));
  return lid;
}
function MOB_saveClearance_(u, op, cln, d) {
  var t = T_('tblClearances');
  if (op === 'delete') {
    var ids = MOB_rowsOf_('tblClearances', 'Clearance No.', cln).map(function (i) { return str_(t.get(i, 'Record ID')); }), co0 = '';
    if (!ids.length) throw new Error(cln + ' was not found.');
    ids.forEach(function (rid) { t.refresh(); var i = t.match('Record ID', rid); if (i) { if (!co0) co0 = str_(t.get(i, 'Company Name')); t.deleteRow(i); } });
    MOB_log_(u, 'Deleted', 'Chemical Clearances', cln, co0 + ' – ' + ids.length + ' line(s)');
    return cln;
  }
  var co = trim_(d.company), coId = CompanyID_(co), nU = 0, nA = 0, nD = 0, first = '', last = '';
  if (op === 'create') cln = NextID_(t, 'Clearance No.', 'CLN-');
  var head = { 'Clearance No.': cln, 'Company ID': coId, 'Clearance Ref. No.': d.ref || '', 'Clearance Date': MOB_d_(d.date), 'Remarks': d.remarks || '', 'ETA': MOB_dOrText_(d.eta) };
  var keep = {};
  (d.lines || []).forEach(function (l) {
    var rec = trim_(l.rec) || trim_(l.std); if (!rec) return;
    var row = {}; for (var k in head) row[k] = head[k];
    row['Chemical as Recorded'] = rec; row['Chemical (Standard)'] = l.std || ''; row['Qty as Recorded'] = MOB_q_(l.qty); row['Unit'] = l.unit || '';
    row['B/L / Invoice / AWB No.'] = trim_(l.bl) || d.bl || '';
    t.refresh();
    var i = l.id && op === 'update' ? t.match('Record ID', l.id) : 0;
    if (i) {
      row['Source'] = MOB_srcUpd_(u, t.get(i, 'Source'));
      t.setRow(i, row); keep[String(l.id).toUpperCase()] = 1; nU++;
    } else {
      var rid = NextID_(t, 'Record ID', 'CLR-'); i = t.addRow();
      row['Record ID'] = rid; row['Source'] = MOB_src_(u);
      t.setRow(i, row); if (i > 1) t._fillCalculated(i);
      keep[rid] = 1; nA++; if (!first) first = rid; last = rid;
    }
  });
  if (op === 'update') {
    t.refresh();
    MOB_rowsOf_('tblClearances', 'Clearance No.', cln).map(function (i) { return str_(t.get(i, 'Record ID')).toUpperCase(); })
      .filter(function (rid) { return !keep[rid]; }).forEach(function (rid) { t.refresh(); var i = t.match('Record ID', rid); if (i) { t.deleteRow(i); nD++; } });
    MOB_log_(u, 'Updated', 'Chemical Clearances', cln, co + ' – ' + nU + ' line(s) changed, ' + nA + ' added, ' + nD + ' deleted');
  } else MOB_log_(u, 'Saved new', 'Chemical Clearances', cln, co + ' – ' + nA + ' chemical line(s) (' + first + ' to ' + last + ')');
  return cln;
}
function MOB_saveBill_(u, op, bn, d) {
  var t = T_('tblBills');
  if (op === 'delete') {
    var ids = MOB_rowsOf_('tblBills', 'Bill No.', bn).map(function (i) { return str_(t.get(i, 'Bill ID')); }), co0 = '';
    if (!ids.length) throw new Error(bn + ' was not found.');
    var paid = T_('tblPayments').sumIfs('Amount (USD)', 'Bill No.', bn);
    ids.forEach(function (bid) { t.refresh(); var i = t.match('Bill ID', bid); if (i) { if (!co0) co0 = str_(t.get(i, 'Company Name')); t.deleteRow(i); } });
    MOB_log_(u, 'Deleted', 'Bills & Invoices', bn, co0 + ' – ' + ids.length + ' line(s)' + (paid > 0 ? ' – US$' + fmtMoney_(paid) + ' in payments was linked' : ''));
    return bn;
  }
  var co = trim_(d.company), coId = CompanyID_(co), lines = (d.lines || []).filter(function (l) { return trim_(l.service); });
  var type = d.type || (lines.length ? Type_For(lines[0].service) : '');
  var loc = d.location;
  if (!trim_(loc)) { var tc = T_('tblCompanies'), r = tc.match('Company Name', co); if (r) loc = str_(tc.get(r, 'Location')); }
  if (op === 'create') bn = NextID_(t, 'Bill No.', 'BN-' + Utilities.formatDate(new Date(), tz_(), 'yyyy') + '-');
  var head = { 'Bill No.': bn, 'Company ID': coId, 'Name as Recorded': co, 'Bill Date': MOB_d_(d.date), 'Bill Type': type, 'Bill Ref. No.': d.ref || '',
    'Contact Person': d.contact || '', 'Contact Title': d.title || '', 'Location': loc || '', 'Activity': d.activity || '', 'Linked Record': d.linked || '' };
  var keep = {}, nU = 0, nA = 0, nD = 0, tot = 0;
  lines.forEach(function (l) {
    var row = {}; for (var k in head) row[k] = head[k];
    row['Purpose / Licence Billed'] = trim_(l.service); row['Chemical'] = l.details || ''; row['Amount Billed (USD)'] = num_(l.amount); tot += num_(l.amount);
    t.refresh();
    var i = l.id && op === 'update' ? t.match('Bill ID', l.id) : 0;
    if (i) { row['Source'] = MOB_srcUpd_(u, t.get(i, 'Source')); t.setRow(i, row); keep[String(l.id).toUpperCase()] = 1; nU++; }
    else {
      var bid = NextID_(t, 'Bill ID', 'BIL-'); i = t.addRow();
      row['Bill ID'] = bid; row['Source'] = MOB_src_(u);
      t.setRow(i, row); if (i > 1) t._fillCalculated(i);
      keep[bid] = 1; nA++;
    }
  });
  if (op === 'update') {
    t.refresh();
    MOB_rowsOf_('tblBills', 'Bill No.', bn).map(function (i) { return str_(t.get(i, 'Bill ID')).toUpperCase(); })
      .filter(function (bid) { return !keep[bid]; }).forEach(function (bid) { t.refresh(); var i = t.match('Bill ID', bid); if (i) { t.deleteRow(i); nD++; } });
    MOB_log_(u, 'Updated', 'Bills & Invoices', bn, co + ' – ' + nU + ' line(s) changed, ' + nA + ' added, ' + nD + ' deleted');
  } else MOB_log_(u, 'Saved new', 'Bills & Invoices', bn, co + ' – ' + nA + ' line(s), US$' + fmtMoney_(tot));
  return bn;
}
function MOB_savePayment_(u, op, id, d) {
  var t = T_('tblPayments');
  if (op === 'delete') { var f = MOB_find_('tblPayments', 'Record ID', id), desc = str_(f.t.get(f.i, 'Company Name')) + ' – US$' + fmtMoney_(f.t.get(f.i, 'Amount (USD)')); f.t.deleteRow(f.i); MOB_log_(u, 'Deleted', 'Payments & Receipts', id, desc); return id; }
  var st = trim_(d.bill) ? MOB_billStatus_(String(d.bill)) : { bn: '', co: trim_(d.company), coId: CompanyID_(d.company), purpose: '' };
  var row = { 'Company ID': st.coId || CompanyID_(st.co), 'Name as Recorded': st.co, 'Purpose / Services': d.purpose || st.purpose, 'Amount (USD)': num_(d.amount),
    'Payment Date': MOB_d_(d.date), 'Receipt No.': d.receipt || '', 'Remarks': d.remarks || '', 'Bill No.': st.bn };
  if (op === 'update') {
    var g = MOB_find_('tblPayments', 'Record ID', id);
    row['Source'] = MOB_srcUpd_(u, g.t.get(g.i, 'Source'));
    g.t.setRow(g.i, row);
    MOB_log_(u, 'Updated', 'Payments & Receipts', id, st.co + ' – US$' + fmtMoney_(num_(d.amount)) + (st.bn ? ' – ' + st.bn : ''));
    return id;
  }
  var pid = NextID_(t, 'Record ID', 'PAY-'), pi = t.addRow();
  row['Record ID'] = pid; row['Record Group'] = 'Form entry'; row['Source'] = MOB_src_(u);
  t.setRow(pi, row); if (pi > 1) t._fillCalculated(pi);
  MOB_log_(u, 'Saved new', 'Payments & Receipts', pid, st.co + ' – US$' + fmtMoney_(num_(d.amount)) + (st.bn ? ' – ' + st.bn : ' (company account)'));
  return pid;
}
function MOB_nextIssue_(ti) {
  var ids = ti.column('Issue #').map(str_).filter(String), lastId = ids[ids.length - 1] || 'ISS-000', m = lastId.match(/^(.*?)(\d+)$/);
  if (!m) return 'ISS-' + fmt000_(ids.length + 1);
  var mx = 0; ids.forEach(function (x) { var k = x.match(/(\d+)$/); if (k && x.indexOf(m[1]) === 0) mx = Math.max(mx, +k[1]); });
  var p = String(mx + 1); while (p.length < m[2].length) p = '0' + p;
  return m[1] + p;
}
function MOB_saveIssue_(u, op, id, d) {
  var ti = T_('tblIssues');
  if (op === 'delete') { var f = MOB_find_('tblIssues', 'Issue #', id); f.t.deleteRow(f.i); MOB_log_(u, 'Deleted', 'Notes & Issues', id, ''); return id; }
  var row = { 'Register': d.register || '', 'Record': d.record || '', 'Issue Found': d.issue || '', 'Action Taken': d.action || '', 'Follow-up Status': d.status || 'Open' };
  if (op === 'update') {
    var g = MOB_find_('tblIssues', 'Issue #', id);
    if (d.source) row['Source'] = d.source;
    g.t.setRow(g.i, row); MOB_log_(u, 'Updated', 'Notes & Issues', id, String(d.issue || '').slice(0, 120)); return id;
  }
  var iid = MOB_nextIssue_(ti), ii = ti.addRow();
  row['Issue #'] = iid; row['Source'] = d.source || MOB_src_(u);
  ti.setRow(ii, row); if (ii > 1) ti._fillCalculated(ii);
  MOB_log_(u, 'Saved new', 'Notes & Issues', iid, String(d.issue || '').slice(0, 120));
  return iid;
}
function MOB_saveCorr_(u, op, id, d) {
  var t = T_('tblCorrespondence');
  if (op === 'delete') { var f = MOB_find_('tblCorrespondence', 'Record ID', id); f.t.deleteRow(f.i); MOB_log_(u, 'Deleted', 'Notes & Issues', id, 'correspondence'); return id; }
  var co = trim_(d.company);
  var row = { 'Company ID': CompanyID_(co), 'Name as Recorded': co, 'Type': d.type || '', 'Activity': d.activity || '', 'Description': d.description || '',
    'EPA Reference No.': d.ref || '', 'Date Issued': MOB_d_(d.date) };
  if (op === 'update') { var g = MOB_find_('tblCorrespondence', 'Record ID', id); g.t.setRow(g.i, row); MOB_log_(u, 'Updated', 'Notes & Issues', id, co + ' – ' + d.type); return id; }
  var cid = NextID_(t, 'Record ID', 'COR-'), i = t.addRow();
  row['Record ID'] = cid; t.setRow(i, row); if (i > 1) t._fillCalculated(i);
  MOB_log_(u, 'Saved new', 'Notes & Issues', cid, co + ' – ' + d.type);
  return cid;
}
function MOB_saveInspection_(u, op, id, d) {
  var sh = MOB_sheet_(MOB.INSP, MOB_INSP_HDR), n = sh.getLastRow() - 1, ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return str_(r[0]); }) : [];
  var rowOf = function (x) { var k = ids.indexOf(String(x)); return k < 0 ? 0 : k + 2; };
  if (op === 'delete') { var r0 = rowOf(id); if (!r0) throw new Error(id + ' was not found.'); sh.deleteRow(r0); MOB_log_(u, 'Deleted', MOB.INSP, id, ''); return id; }
  var cname = trim_(d.company), cId = cname ? CompanyID_(cname) : '';
  var vals = [MOB_d_(d.date), cId, cname, d.site || '', d.type || '', d.linked || '', d.compliance || '', d.findings || '', d.actions || '',
    MOB_d_(d.followUp), d.lat === undefined || d.lat === null ? '' : d.lat, d.lng === undefined || d.lng === null ? '' : d.lng, d.acc === undefined || d.acc === null ? '' : d.acc];
  if (op === 'update') {
    var r = rowOf(id); if (!r) throw new Error(id + ' was not found.');
    sh.getRange(r, 2, 1, vals.length).setValues([vals]);
    MOB_log_(u, 'Updated', MOB.INSP, id, (cname || '') + ' – ' + (d.site || ''));
    return id;
  }
  var mxi = 0; ids.forEach(function (x) { var k = x.match(/^INS-(\d+)/); if (k) mxi = Math.max(mxi, +k[1]); });
  var insId = 'INS-' + fmt000_(mxi + 1);
  sh.appendRow([insId].concat(vals).concat(['', u.name + ' (' + u.email + ')', nowText_()]));
  MOB_log_(u, 'Field inspection', MOB.INSP, insId, (cname || '') + ' – ' + (d.site || '') + ' – ' + (d.compliance || ''));
  return insId;
}
function MOB_saveContact_(u, d) {
  var sh = sh_(EXT.CON) || EXT_ContactsSheet_(), n = Math.max(sh.getLastRow() - CON_FIRST + 1, 0), r = 0;
  if (n) sh.getRange(CON_FIRST, 1, n, 1).getValues().forEach(function (x, i) { if (!r && str_(x[0]) === trim_(d.coId)) r = CON_FIRST + i; });
  if (!r) { r = Math.max(sh.getLastRow() + 1, CON_FIRST); sh.getRange(r, 1, 1, 2).setValues([[trim_(d.coId), d.company || '']]); }
  sh.getRange(r, 3, 1, 4).setValues([[d.person || '', d.email || '', d.phone || '', d.send === false || /^no$/i.test(String(d.send)) ? 'No' : 'Yes']]);
  MOB_log_(u, 'Contact updated', EXT.CON, d.coId, [d.person, d.email, d.phone].filter(Boolean).join(' · '));
  return trim_(d.coId);
}
function MOB_saveHazard_(u, d) {
  var sh = sh_(EXT.HAZ) || EXT_HazardsSheet_(), v = sh.getRange(HAZ_FIRST, 1, HAZ_LAST - HAZ_FIRST + 1, 1).getValues(), r = 0, last = HAZ_FIRST - 1;
  v.forEach(function (x, i) { if (trim_(x[0])) { last = HAZ_FIRST + i; if (eqi_(x[0], d.name)) r = HAZ_FIRST + i; } });
  if (!r) r = last + 1;
  var q = function (x) { return trim_(x) === '' ? '' : num_(x); };
  sh.getRange(r, 1, 1, 9).setValues([[trim_(d.name), d.cas || '', q(d.h), q(d.f), q(d.p), q(d.hmis), d.cat || '', d.notes || '', d.sds || '']]);
  MOB_log_(u, 'Hazard rating updated', EXT.HAZ, d.name, 'HMIS ' + (d.hmis === '' ? '–' : d.hmis) + ' · ' + (d.cat || ''));
  return trim_(d.name);
}

/* ---------------------------------------------------------------- inspection photos → Google Drive */
function MOB_photo_(u, p) {
  var need = MOB_need_(u, 'staff'); if (need) return { ok: false, error: need };
  var up = MOB_sheet_(MOB.UPLOADS, MOB_UP_HDR), map = {};
  if (up.getLastRow() > 1) up.getRange(2, 1, up.getLastRow() - 1, 3).getValues().forEach(function (r) { map[String(r[0])] = String(r[2]); });
  if (map[p.id]) return { ok: true, url: map[p.id] };
  var insId = p.inspectionId || map[p.inspectionCid];
  if (!insId) return { ok: false, error: 'Inspection not uploaded yet.' };
  var folder = MOB_folder_(MOB.PHOTOS);
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.base64), 'image/jpeg', insId + '_' + String(p.id).slice(0, 8) + '.jpg'));
  var url = file.getUrl(), sh = MOB_sheet_(MOB.INSP, MOB_INSP_HDR), ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === insId) {
    var c = sh.getRange(i + 2, 15), cur = str_(c.getValue()); c.setValue(cur ? cur + '\n' + url : url); break;
  }
  up.appendRow([p.id, 'photo', url, new Date(), u.email]);
  return { ok: true, url: url };
}
function MOB_folder_(name) {
  var me = DriveApp.getFileById(ss_().getId()), ps = me.getParents(), parent = ps.hasNext() ? ps.next() : DriveApp.getRootFolder();
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---------------------------------------------------------------- QR check of a printed licence / clearance / bill */
function MOB_verify_(u, code) {
  var kind = '', id = '', tok = '', m;
  code = String(code || '').trim();
  if ((m = code.match(/[?&]id=([^&]+)/)) && /[?&]t=/.test(code)) {
    id = decodeURIComponent(m[1]).toUpperCase(); tok = (code.match(/[?&]t=([0-9A-Fa-f]+)/) || [])[1] || '';
    kind = (code.match(/[?&]v=(\w+)/) || [])[1] || '';
  } else if ((m = code.toUpperCase().replace(/\s+/g, ' ').match(/CODE\s+(\S+)-([0-9A-F]{10})\b/)) || (m = code.toUpperCase().replace(/\s+/g, '').match(/^(.+)-([0-9A-F]{10})$/))) {
    id = m[1]; tok = m[2];
  }
  tok = String(tok).toUpperCase();
  if (!id || !tok) return { ok: true, genuine: false, message: 'This is not a CMU document code.' };
  if (!kind) kind = /^CLN/.test(id) ? 'clearance' : /^BN-/.test(id) ? 'bill' : 'licence';
  var info = null, good = false;
  try { good = QR_Token_(kind, id) === tok; if (good) info = QR_Lookup_(kind, id); } catch (e) { good = false; }
  MOB_log_(u, 'Document checked (mobile)', kind, id, good && info ? 'GENUINE – ' + info.status : 'NOT RECOGNISED');
  if (!good || !info) return { ok: true, genuine: false, id: id, kind: kind, message: 'NOT RECOGNISED – this code was not issued by the CMU Database. Treat the document as suspicious.' };
  return { ok: true, genuine: true, id: id, kind: kind, status: info.status, valid: info.ok, lines: info.lines };
}

/* ================================================================ official PDFs (the print pages and reports of the sheet) */
/** b.kind: licence | clearance | bill (b.id) · monthly (b.month yyyy-mm) · annual (b.year) · profile (b.company) · quota · insights
 *  b.signatory (Lists ▸ Signatory), b.letterhead (true/false), b.salutation (bill)  →  { name, base64, url, warnings } */
function MOB_pdf_(u, b) {
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var kind = String(b.kind || ''), blob, name, warn = '', sh, restore = [];
    var setCell = function (s, a1, v) { if (v === undefined || v === null) return; var c = s.getRange(a1); restore.push([c, c.getValue()]); c.setValue(v); };
    try {
      if (kind === 'licence' || kind === 'clearance' || kind === 'bill') {
        var id = trim_(b.id).toUpperCase(), target = '', pick = id;
        if (kind === 'licence') {
          var L = T_('tblLicences'), i = L.match('Record ID', id);
          if (!i) return { ok: false, error: id + ' was not found.' };
          var cat = str_(L.get(i, 'Licence Category')), typ = str_(L.get(i, 'Licence / Certificate Type'));
          if (/\(CIL\)/i.test(cat)) target = 'Print CIL';
          else if (/\(CRL\)/i.test(cat) || cat === '') target = 'Print CRL';
          else if (/Retention/i.test(typ)) target = 'Print EDL RP';
          else if (/\(EDL\)/i.test(cat) || /Effluent/i.test(cat)) target = 'Print EDL';
          else return { ok: false, error: 'Print pages exist for CRL, CIL and EDL licences only. This record is: ' + cat };
        } else if (kind === 'clearance') { target = 'Print Clearance'; pick = ListPick_('R', id); }
        else { target = 'Print Bill'; pick = ListPick_('Y', id); }
        sh = sh_(target);
        if (!sh) return { ok: false, error: 'The sheet "' + target + '" is missing.' };
        var sigCell = { 'Print CRL': 'J13', 'Print CIL': 'J13', 'Print Clearance': 'J13', 'Print EDL': 'J12', 'Print EDL RP': 'J12', 'Print Bill': 'J10' }[target];
        var logoCell = { 'Print Clearance': 'J7', 'Print Bill': 'J8' }[target] || 'J3';
        setCell(sh, 'J4', pick);
        if (b.signatory) setCell(sh, sigCell, b.signatory);
        if (b.letterhead !== undefined) setCell(sh, logoCell, b.letterhead ? 'Yes' : 'No');
        if (target === 'Print Bill' && b.salutation !== undefined) setCell(sh, 'J9', b.salutation);
        SpreadsheetApp.flush();
        warn = sh.getRange('J5').getDisplayValue();
        if (/not found/i.test(warn)) return { ok: false, error: warn.replace(/⚠/g, '').trim() };
        blob = Prn_MakePdf_(sh);
        name = Prn_FileName_(sh) + '.pdf';
      } else if (kind === 'monthly') {
        sh = sh_(EXT.REP) || EXT_ReportSheet_();
        var mm = String(b.month || '').match(/(\d{4})-(\d{1,2})/), now = new Date(), y = mm ? +mm[1] : now.getFullYear(), m = mm ? +mm[2] : now.getMonth() + 1;
        var lab = y + '-' + (m < 10 ? '0' : '') + m + '  (' + Utilities.formatDate(new Date(y, m - 1, 1), tz_(), 'MMMM yyyy') + ')';
        setCell(sh, 'H3', lab);
        var last = REP_Build(true);
        META.print[EXT.REP] = { area: 'A1:' + colLetter_(REP_NC) + last, left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, portrait: true, center: true };
        blob = Prn_Export_(sh); name = 'CMU Monthly Report ' + y + '-' + (m < 10 ? '0' : '') + m + '.pdf';
      } else if (kind === 'annual') {
        sh = ANN_Sheet_(); setCell(sh, 'I3', String(b.year || new Date().getFullYear()));
        if (b.target !== undefined && b.target !== '') setCell(sh, 'I6', num_(b.target));
        var la = ANN_Build(true);
        if (!la) return { ok: false, error: 'The Annual Report is for admins.' };
        META.print[EXT2.ANN] = { area: 'A1:' + colLetter_(ANN_NC) + la, left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, portrait: true, center: true };
        blob = Prn_Export_(sh); name = 'CMU Annual Report ' + (b.year || new Date().getFullYear()) + '.pdf';
      } else if (kind === 'profile') {
        sh = PRO_Sheet_(); setCell(sh, 'H3', String(b.company || ''));
        var lp = PRO_Build(true);
        if (!lp) return { ok: false, error: 'Company not found.' };
        META.print[EXT2.PRO] = { area: 'A1:' + colLetter_(PRO_NC) + lp, left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, portrait: true, center: true };
        blob = Prn_Export_(sh); name = 'Company Profile ' + String(b.company || '').replace(/[\/\\:*?"<>|]/g, '-') + ' ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + '.pdf';
      } else if (kind === 'quota') {
        QUO_Refresh(true); sh = sh_(EXT2.QUO);
        META.print[EXT2.QUO] = { area: 'A1:J' + sh.getLastRow(), left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, portrait: false, center: true };
        blob = Prn_Export_(sh); name = 'CMU Quota Tracker ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + '.pdf';
      } else if (kind === 'insights') {
        INS_Refresh(true); sh = sh_(EXT.INS);
        META.print[EXT.INS] = { area: 'A1:H' + sh.getLastRow(), left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, portrait: false, center: true };
        blob = Prn_Export_(sh); name = 'CMU Insights ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + '.pdf';
      } else return { ok: false, error: 'Unknown document type "' + kind + '".' };
    } finally {
      restore.reverse().forEach(function (x) { try { x[0].setValue(x[1]); } catch (e) { } });
    }
    var url = '';
    try { url = saveBlob_(blob.setName(name), name).getUrl(); } catch (e) { }
    MOB_log_(u, 'PDF made (mobile)', kind, b.id || b.month || b.year || b.company || '', name);
    return { ok: true, name: name, base64: Utilities.base64Encode(blob.getBytes()), url: url, warnings: warn && warn.indexOf(WARN) >= 0 ? warn.replace(/⚠/g, '').trim() : '' };
  } finally { lock.releaseLock(); }
}

/* ================================================================ Claude on the phone (needs Claude.gs and an API key) */
var MOB_AI_TOOLS = [
  { name: 'cmu_alerts', description: 'Licences expiring soon or recently expired (not renewed) and unpaid bills with age and outstanding amount.', input_schema: { type: 'object', properties: {} } },
  { name: 'cmu_lists', description: 'Valid drop-down values: licence categories/types, sectors, units, standard chemical names, bill types, services with suggested fees, companies (ID | name).', input_schema: { type: 'object', properties: {} } },
  { name: 'find_records', description: 'Search companies, licences, clearances, bills and payments by any text (name, ID, licence no., B/L, receipt no.).', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'company_summary', description: 'Everything about one company: details, licences with expiry, bills with outstanding amounts, payments, quantities cleared, quotas.', input_schema: { type: 'object', properties: { company: { type: 'string' } }, required: ['company'] } },
  { name: 'quota_status', description: 'Licensed import quantities vs cleared, chemicals cleared but not on the licence, clearances without a valid CIL. Optional company.', input_schema: { type: 'object', properties: { company: { type: 'string' } } } },
  { name: 'calculate_fee', description: 'Chemical importation fee under RI/C&E-002-04/20 (Qp = R × Hi × Qi). HMIS and fee category come from the Chemical Hazards sheet unless given; never invent them.',
    input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { chemical: { type: 'string' }, chemical_standard: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' }, category: { type: 'string' }, hmis: { type: 'number' } }, required: ['chemical', 'quantity', 'unit'] } } }, required: ['items'] } },
  { name: 'standardise_chemicals', description: 'Closest standard chemical names for free-text names, with a score 0–1.', input_schema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] } },
  { name: 'read_register', description: 'Rows of one register, optionally only rows containing a text. Registers: companies, licences, licenceChemicals, clearances, bills, payments, issues, correspondence. Max 150 rows.',
    input_schema: { type: 'object', properties: { register: { type: 'string' }, contains: { type: 'string' } }, required: ['register'] } },
  { name: 'draft_record', description: 'Prepare a record for the officer to check in the app form and save (nothing is saved by you). Fields by form:\n' +
      '- company: name, sector, location, other_names\n- licence: company, category, type, location, application_date, response_date, reference_code, licence_no, date_issued, expiry_date, remarks, chemicals[{name, epa_registration_no, type, quantity, unit, consignment_ref}]\n' +
      '- clearance: company, date, epa_ref, bl_no, remarks, eta, lines[{chemical_as_recorded, chemical_standard, quantity, unit, bl_no}]\n- bill: company, date, bill_type, bill_ref, contact_person, contact_title, lines[{service, details, amount}]\n' +
      '- payment: bill_no (or company when no bill), amount, date, receipt_no, remarks, purpose\n- issue: register, record, issue, action, status\n- inspection: company, site, date, type, compliance, findings, actions, follow_up',
    input_schema: { type: 'object', properties: { form: { type: 'string', enum: ['company', 'licence', 'clearance', 'bill', 'payment', 'issue', 'inspection'] }, data: { type: 'object' } }, required: ['form', 'data'] } }
];
var MOB_REG_TBL = { companies: 'tblCompanies', licences: 'tblLicences', licencechemicals: 'tblLicenceChemicals', clearances: 'tblClearances', bills: 'tblBills', payments: 'tblPayments', issues: 'tblIssues', correspondence: 'tblCorrespondence' };
function MOB_aiReady_() {
  if (typeof CLAUDE_call_ !== 'function') return 'Claude is not installed in the CMU Database (add Claude.gs to the Apps Script project).';
  if (!CLAUDE_key_()) return 'No Anthropic API key yet: set it on the desktop (Claude ▸ Settings) or on the phone (Admin ▸ Claude).';
  return '';
}
function MOB_aiSystem_(u) {
  var s = 'You are Claude, the assistant inside the CMU Database Android app of the Chemical Management Unit (CMU), ERRS Department, Environmental Protection Agency of Liberia. ' +
    'You are talking with ' + u.name + ' (' + u.role + ') on a phone, so keep answers short: short paragraphs or simple lists, no wide tables. ' +
    'Always look at the actual data with the tools before answering; never guess figures, licence numbers, receipt numbers, dates or HMIS ratings. Quote record IDs.\n' +
    'Registers: companies (CMU-###), licences & certificates (LIC-###, with chemicals, vehicles, effluent details), chemical clearances (CLN-### with lines CLR-###), bills (BN-yyyy-### with lines BIL-###), payments (PAY-###), notes & issues, correspondence, field inspections.\n' +
    'Fees follow RI/C&E-002-04/20: Qp = R × Hi × Qi; per-kg categories use kilograms, Explosives and Sodium Cyanide use metric tons. Use calculate_fee.\n' +
    'To add a record, call draft_record: the app opens the matching form filled in, the officer checks it and taps Save. Tell them plainly that NOTHING IS SAVED until they check and save it. Never say a record was saved.\n' +
    'When a document or photo is attached, read it faithfully: copy quantities, units and reference numbers exactly as written and list what you extracted.\n' +
    'Today is ' + Utilities.formatDate(new Date(), tz_(), 'd MMMM yyyy') + '.';
  return s;
}
function MOB_aiTool_(name, inp, drafts) {
  switch (name) {
    case 'cmu_alerts': return EXT_AlertsForClaude_();
    case 'cmu_lists': return AI_Lists_();
    case 'find_records': return AI_Find_(inp.text);
    case 'company_summary': return AI_Company_Summary_(inp.company);
    case 'quota_status': return AI_Quota_(inp.company);
    case 'calculate_fee': return AI_Fee_(inp.items);
    case 'standardise_chemicals': return AI_StdNames_(inp.names);
    case 'read_register': {
      var tbl = MOB_REG_TBL[String(inp.register || '').toLowerCase().replace(/[^a-z]/g, '')];
      if (!tbl) return { error: 'Unknown register. Use: ' + Object.keys(MOB_REG_TBL).join(', ') };
      var rows = MOB_table_(tbl), k = String(inp.contains || '').toLowerCase();
      if (k) rows = rows.filter(function (o) { return JSON.stringify(o).toLowerCase().indexOf(k) >= 0; });
      return { total: rows.length, rows: rows.slice(0, 150) };
    }
    case 'draft_record': {
      var warn = [], data = inp.data || {};
      if (data.company) { var c = AI_Company_(data.company); if (c.warn) warn.push(c.warn); if (c.name) data.company = c.name; }
      drafts.push({ form: inp.form, data: data, warnings: warn });
      return { ok: true, note: 'The ' + inp.form + ' form will open filled in on the phone for the officer to check and save. Nothing is saved yet.', warnings: warn };
    }
  }
  return { error: 'Unknown tool ' + name };
}
function MOB_aiTrack_(u, model, usage, kind) {
  try { if (SpreadsheetApp.getActive()) return; } catch (e) { }   // Claude.gs already logged it on "Claude Usage"
  try {
    var sh = ss_().getSheetByName('Claude Usage');
    if (sh) sh.appendRow([new Date(), u.email + ' (mobile)', kind, model, usage.input_tokens || 0, usage.cache_creation_input_tokens || 0, usage.cache_read_input_tokens || 0, usage.output_tokens || 0,
      Math.round(CLAUDE_cost_(model, usage) * 100000) / 100000]);
  } catch (e) { }
}
function MOB_ai_(u, b) {
  var nr = MOB_aiReady_(); if (nr) return { ok: false, error: nr };
  var hist = (b.history || []).slice(-16).map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }; });
  var text = String(b.message || ''), f = b.file, userContent = text;
  if (f && f.data) {
    var kind = CLAUDE_FILE_TYPES[String(f.mime || '').toLowerCase()];
    if (!kind) return { ok: false, error: 'Claude can read PDF, JPG, PNG, WEBP and GIF files.' };
    if (f.data.length * 0.75 > CLAUDE_MAX_FILE_MB * 1048576) return { ok: false, error: 'The file is larger than ' + CLAUDE_MAX_FILE_MB + ' MB.' };
    userContent = [{ type: kind, source: { type: 'base64', media_type: String(f.mime).toLowerCase(), data: f.data } }, { type: 'text', text: '[Attached: ' + (f.name || 'document') + ']\n' + text }];
  }
  var choice = b.model || CLAUDE_model_(), model = typeof CLAUDE_pickModel_ === 'function' ? CLAUDE_pickModel_(choice, text, !!(f && f.data)) : CLAUDE_STRONG;
  var turn = hist.slice(); turn.push({ role: 'user', content: userContent });
  var tools = JSON.parse(JSON.stringify(MOB_AI_TOOLS)); tools[tools.length - 1].cache_control = { type: 'ephemeral' };
  var system = [{ type: 'text', text: MOB_aiSystem_(u), cache_control: { type: 'ephemeral' } }];
  var drafts = [], finalText = '', cost = 0, used = [];
  for (var round = 0; round < 10; round++) {
    var resp = CLAUDE_call_({ model: model, max_tokens: 3000, system: system, tools: tools, messages: CLAUDE_cacheLast_(turn) }, null, 'mobile');
    if (resp.error) return { ok: false, error: resp.error };
    if (resp.usage) { cost += resp._cost || 0; MOB_aiTrack_(u, model, resp.usage, f && f.data ? 'mobile document' : 'mobile chat'); }
    turn.push({ role: 'assistant', content: resp.content });
    var uses = (resp.content || []).filter(function (x) { return x.type === 'tool_use'; });
    finalText = CLAUDE_text_(resp) || finalText;
    if (resp.stop_reason !== 'tool_use' || !uses.length) break;
    turn.push({ role: 'user', content: uses.map(function (x) {
      var out; used.push(x.name);
      try { out = MOB_aiTool_(x.name, x.input || {}, drafts); } catch (e) { out = { error: e.message }; }
      var s = JSON.stringify(out); if (s.length > 120000) s = s.slice(0, 120000) + '… [truncated]';
      return { type: 'tool_result', tool_use_id: x.id, content: s, is_error: !!(out && out.error) };
    }) });
  }
  hist.push({ role: 'user', content: (f && f.data ? '[Attached: ' + (f.name || 'document') + ']\n' : '') + text });
  hist.push({ role: 'assistant', content: finalText || '(no answer)' });
  MOB_log_(u, 'Claude (mobile)', '', '', text.slice(0, 120));
  return { ok: true, reply: finalText || '(no answer)', history: hist, drafts: drafts, tools: used, usage: { model: model, cost: cost, month: CLAUDE_spent_(), budget: CLAUDE_budget_() } };
}
/** read a photographed / scanned document into a draft record (clearance, licence, payment, bill or company) */
function MOB_aiDoc_(u, b) {
  var nr = MOB_aiReady_(); if (nr) return { ok: false, error: nr };
  var f = b.file || {};
  var kind = CLAUDE_FILE_TYPES[String(f.mime || '').toLowerCase()];
  if (!f.data || !kind) return { ok: false, error: 'Attach a PDF or a photo (JPG / PNG).' };
  var tool = JSON.parse(JSON.stringify(INB_TOOL));
  tool.input_schema.properties.doc_type.enum = ['clearance', 'licence', 'payment', 'bill', 'company', 'other'];
  var sys = INB_System_() + '\n- bill: company, date, bill_type, bill_ref, contact_person, contact_title, lines[{service, details, amount}] (an EPA bill / fee assessment letter)' +
    '\n- company: name, sector, location, other_names (a company registration or profile)' +
    (b.hint ? '\n\nThe officer says: ' + String(b.hint).slice(0, 300) : '') + '\n\nAlways answer by calling the tool record_document exactly once.';
  var body = { model: CLAUDE_STRONG, max_tokens: 4000, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], tools: [tool],
    messages: [{ role: 'user', content: [{ type: kind, source: { type: 'base64', media_type: String(f.mime).toLowerCase(), data: f.data } },
      { type: 'text', text: 'File name: ' + (f.name || 'document') + '\nRead this document and record it with record_document.' }] }] };
  var out = CLAUDE_call_(body, null, 'mobile document');
  if (out.error) return { ok: false, error: out.error };
  if (out.usage) MOB_aiTrack_(u, CLAUDE_STRONG, out.usage, 'mobile document');
  var tu = (out.content || []).filter(function (x) { return x.type === 'tool_use'; })[0], r = tu ? tu.input || {} : null;
  if (!r) { var t = CLAUDE_text_(out), m = t.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch (e) { r = null; } }
  if (!r) return { ok: false, error: 'Claude could not read the document. Try a clearer photo.' };
  var issues = (r.issues || []).slice();
  var data = r.data || {};
  if (data.company || r.company) { var c = AI_Company_(data.company || r.company); if (c.warn) issues.push(c.warn); if (c.name) data.company = c.name; }
  MOB_log_(u, 'Document read by Claude (mobile)', '', f.name || '', (r.doc_type || '') + ' – ' + String(r.summary || '').slice(0, 100));
  return { ok: true, docType: r.doc_type || 'other', summary: r.summary || '', confidence: Number(r.confidence) || 0, data: data, issues: issues,
    usage: { cost: out._cost || 0, month: CLAUDE_spent_(), budget: CLAUDE_budget_() } };
}

/* ================================================================ Document Inbox on the phone */
function MOB_inboxItem_(o) {
  var d = {}; try { d = JSON.parse(o.Data || '{}'); } catch (e) { }
  return { fid: String(o['File ID']), name: str_(o['File name']), source: str_(o.Source), type: str_(o.Type), company: str_(o.Company), summary: str_(o.Summary),
    status: str_(o.Status), conf: Number(o.Confidence) || 0, notes: str_(o.Notes), record: str_(o['Record ID']), checkedBy: str_(o['Checked by']),
    when: o.Received instanceof Date ? Utilities.formatDate(o.Received, tz_(), "yyyy-MM-dd'T'HH:mm") : str_(o.Received), data: d,
    url: o['File ID'] ? 'https://drive.google.com/file/d/' + o['File ID'] + '/view' : '' };
}
function MOB_inbox_(u, b) {
  if (typeof INB_Rows_ !== 'function') return { ok: false, error: 'The Document Inbox is not installed in this database.' };
  var op = b.op || 'list';
  if (op === 'list') return { ok: true, items: INB_Rows_().slice(-60).reverse().map(MOB_inboxItem_) };
  var need = MOB_need_(u, 'staff'); if (need) return { ok: false, error: need };
  if (op === 'reject') {
    var o = INB_Find_(b.fid); if (!o) return { ok: false, error: 'Not found.' };
    INB_SetRow_(o.row, { 'Status': 'Rejected', 'Checked by': u.email + ' (mobile)', 'Checked on': new Date(), 'Notes': (b.reason ? 'Rejected: ' + b.reason + ' • ' : '') + (o.Notes || '') });
    try { DriveApp.getFileById(b.fid).moveTo(INB_Sub_('Rejected')); } catch (e) { }
    MOB_log_(u, 'Document rejected', INB.SHEET, o['File name'], b.reason || '');
    return { ok: true };
  }
  if (op === 'reread') { INB_Reread(b.fid); return { ok: true }; }
  if (op === 'run') return { ok: true, message: INB_RunNow() };
  if (op === 'upload') {   // a photo / PDF from the phone goes into the inbox to be read like any other document
    var f = b.file || {};
    if (!f.data) return { ok: false, error: 'No file.' };
    var file = INB_Folder_().createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/pdf', f.name || 'phone-document')).setDescription('source: Phone (' + u.name + ')');
    if (b.readNow) { try { INB_Take_(file); } catch (e) { } }
    return { ok: true, id: file.getId(), message: b.readNow ? 'Read and added to the Document Inbox.' : 'Added – it will be read within 10 minutes.' };
  }
  return { ok: false, error: 'Unknown inbox action.' };
}
function MOB_inboxApproved_(u, fid, type, id) {
  var o = INB_Find_(fid); if (!o) return;
  INB_SetRow_(o.row, { 'Status': 'Approved', 'Type': type, 'Record ID': String(id || ''), 'Checked by': u.email + ' (mobile)', 'Checked on': new Date() });
  try {
    var f = DriveApp.getFileById(fid), co = String(o.Company || 'Unknown company').replace(/[\\\/:*?"<>|]/g, '-');
    f.moveTo(INB_Sub_(co, INB_Sub_('Processed')));
    if (id && f.getName().indexOf(String(id)) !== 0) f.setName(id + ' – ' + f.getName());
  } catch (e) { }
}

/* ================================================================ admin tools on the phone */
function MOB_admin_(u, b) {
  var op = b.op || 'status';
  if (op === 'status') return { ok: true, settings: MOB_settings_(), users: u.role === 'admin' ? MOB_userList_() : [] };
  if (op === 'remPreview') {
    var need0 = MOB_need_(u, 'staff'); if (need0) return { ok: false, error: need0 };
    var P0 = REM_Plan_();
    return { ok: true, plan: P0.plan.map(MOB_remGroup_), missing: P0.missing.map(MOB_remGroup_), skipped: P0.skipped.map(MOB_remGroup_), settings: P0.S };
  }
  var need = MOB_need_(u, 'admin'); if (need) return { ok: false, error: need };
  var lockedOps = { backup: 1, remSend: 1, calSync: 1, mailSync: 1, refresh: 1 };
  var lock = lockedOps[op] ? LockService.getScriptLock() : null; if (lock) lock.waitLock(30000);
  try {
    switch (op) {
      case 'backup': var c = BAK_Now_('from the phone (' + u.email + ')'); return { ok: true, message: 'Backup saved: ' + c.getName(), url: c.getUrl() };
      case 'remSend': var P = REM_Plan_(); if (!P.plan.length) return { ok: true, message: 'Nothing to send today.' }; var r = REM_Send_(P);
        MOB_log_(u, 'Reminders sent (mobile)', EXT.CON, '', r.sent + ' sent'); return { ok: true, message: r.sent + ' reminder(s) sent.' + (r.fails.length ? ' Not sent: ' + r.fails.join('; ') : '') };
      case 'remOn': case 'remOff': {
        var sh = sh_(EXT.CON) || EXT_ContactsSheet_();
        REM_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
        if (op === 'remOn') ScriptApp.newTrigger('REM_Weekly').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
        sh.getRange('C3').setValue(op === 'remOn' ? 'ON' : 'OFF');
        MOB_log_(u, 'Reminders switched ' + (op === 'remOn' ? 'ON' : 'OFF') + ' (mobile)', EXT.CON, '', '');
        return { ok: true, message: 'Weekly reminders are ' + (op === 'remOn' ? 'ON (Mondays about 08:00)' : 'OFF') + '.' };
      }
      case 'remSettings': {
        var cs = sh_(EXT.CON) || EXT_ContactsSheet_();
        cs.getRange('C4:C7').setValues([[num_(b.licDays) || 30], [num_(b.billDays) || 30], [b.cc || ''], [b.sign || '']]);
        return { ok: true, message: 'Reminder settings saved.' };
      }
      case 'calSync': case 'calOn': {
        var rr = CAL_Sync_();
        if (op === 'calOn') { CAL_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); }); ScriptApp.newTrigger('CAL_Daily').timeBased().everyDays(1).atHour(6).create(); }
        return { ok: true, message: 'Calendar "' + CAL_NAME + '": ' + rr.add + ' added, ' + rr.upd + ' updated, ' + rr.del + ' removed' + (op === 'calOn' ? '. Daily updates are ON.' : '.') };
      }
      case 'calOff': CAL_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); }); return { ok: true, message: 'Daily calendar updates are OFF.' };
      case 'mailSync': case 'mailOn': {
        var mr = MAIL_Sync_(op === 'mailOn' ? 60 : 7);
        if (mr.none) return { ok: false, error: 'Add company email addresses (Company Contacts) first.' };
        if (op === 'mailOn') { MAIL_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); }); ScriptApp.newTrigger('MAIL_Daily').timeBased().everyDays(1).atHour(7).create(); }
        return { ok: true, message: mr.added + ' email(s) logged.' + (op === 'mailOn' ? ' Daily logging is ON.' : '') };
      }
      case 'mailOff': MAIL_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); }); return { ok: true, message: 'Email logging is OFF.' };
      case 'backupsOn': PropertiesService.getScriptProperties().deleteProperty('CMU_BAK_OFF'); BAK_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
        ScriptApp.newTrigger('BAK_Weekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(22).create(); return { ok: true, message: 'Weekly backups are ON (Sundays about 22:00).' };
      case 'backupsOff': PropertiesService.getScriptProperties().setProperty('CMU_BAK_OFF', '1'); BAK_Triggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); }); return { ok: true, message: 'Weekly backups are OFF.' };
      case 'refresh': INS_Refresh(true); try { QUO_Refresh(true); } catch (e) { } return { ok: true, message: 'Insights, charts and the Quota Tracker on the sheet were refreshed.' };
      case 'insWindow': { var ins = sh_(EXT.INS); if (ins) { ins.getRange('B3').setValue(num_(b.ahead) || 60); ins.getRange('D3').setValue(num_(b.back) || 30); } return { ok: true, message: 'Saved.' }; }
      case 'users': return { ok: true, users: MOB_userList_() };
      case 'userSave': return MOB_userSave_(u, b.user || {});
      case 'resetTokens': MOB_ResetTokens(); return { ok: true, message: 'All phones that signed in are signed out.' };
      case 'claude': {
        if (typeof CLAUDE_saveSettings !== 'function') return { ok: false, error: 'Claude.gs is not installed.' };
        var o = { key: b.key || '', model: b.model || CLAUDE_model_(), maxTokens: CLAUDE_props_().getProperty('CLAUDE_MAX_TOKENS') || '1024', budget: b.budget === undefined ? (CLAUDE_props_().getProperty('CLAUDE_BUDGET') || '') : b.budget };
        var res = CLAUDE_saveSettings(o);
        return res === 'OK' ? { ok: true, message: 'Claude settings saved.', settings: MOB_settings_() } : { ok: false, error: res };
      }
      case 'inboxPolling': INB_SaveSettings({ read: true, notify: INB_get_('NOTIFY'), polling: !!b.on }); return { ok: true, message: 'Automatic inbox reading is ' + (b.on ? 'ON (every 10 minutes).' : 'OFF.') };
    }
  } finally { if (lock) lock.releaseLock(); }
  return { ok: false, error: 'Unknown admin action.' };
}
function MOB_remGroup_(g) {
  return { coId: g.coId, co: g.co, to: g.to || '', person: g.person || '',
    lic: g.lic.map(function (x) { return { id: x.id, type: x.type || x.cat, no: x.no, expiry: ext_fmtD_(x.expiry), days: x.days }; }),
    bills: g.bills.map(function (b) { return { no: b.no, ref: b.ref, date: ext_fmtD_(b.date), out: b.out, age: b.age }; }) };
}
function MOB_userList_() {
  return MOB_users_().rows.map(function (r, i) {
    return { row: i + 2, email: str_(r[0]), name: str_(r[1]), role: str_(r[2]) || 'staff', hasPin: !!str_(r[3]), active: String(r[4]).toUpperCase() === 'TRUE', lastSync: str_(r[6]), device: str_(r[7]) };
  }).filter(function (x) { return x.email; });
}
function MOB_userSave_(u, x) {
  var email = trim_(x.email).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Type a valid email address.' };
  if (x.pin && !/^\d{4,8}$/.test(String(x.pin))) return { ok: false, error: 'The PIN must be 4–8 digits.' };
  var U = MOB_users_(), r = 0;
  U.rows.forEach(function (row, i) { if (trim_(row[0]).toLowerCase() === email) r = i + 2; });
  if (x.remove) { if (r) U.sh.deleteRow(r); MOB_log_(u, 'Officer removed (mobile)', MOB.USERS, email, ''); return { ok: true, users: MOB_userList_() }; }
  if (!r) { r = U.sh.getLastRow() + 1; U.sh.getRange(r, 1).setValue(email); }
  U.sh.getRange(r, 2, 1, 1).setValue(x.name || '');
  U.sh.getRange(r, 3).setValue(['admin', 'staff', 'viewer'].indexOf(x.role) >= 0 ? x.role : 'staff');
  if (x.pin) U.sh.getRange(r, 4).setNumberFormat('@').setValue(String(x.pin));
  U.sh.getRange(r, 5).setValue(x.active === false ? 'FALSE' : 'TRUE');
  if (x.active === false || x.signOut) U.sh.getRange(r, 6).clearContent();
  MOB_log_(u, 'Officer saved (mobile)', MOB.USERS, email, (x.role || 'staff') + (x.active === false ? ', inactive' : ''));
  return { ok: true, users: MOB_userList_() };
}
