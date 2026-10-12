/**
 * CMU DATABASE 2026 – MOBILE API v2   (a SECOND script file beside Code.gs and Claude.gs: "MobileAPI.gs")
 * Lets the CMU Database Android app (v2) read and write the registers of THIS spreadsheet.
 * It uses Code.gs itself: the register tables (T_ engine), the QR codes, reminders, calendar, backups,
 * the Document Inbox and the Claude settings. Nothing in Code.gs has to be changed.
 *
 * INSTALL (once)
 *  1. Open the CMU DATABASE Google Sheet ▸ Extensions ▸ Apps Script.
 *  2. Next to "Files" click ＋ ▸ Script ▸ name it  MobileAPI  ▸ delete what is in it ▸ paste this whole file ▸ Save.
 *     Keep it BELOW Code.gs in the file list (new files are added at the bottom).  Do NOT paste it into Code.gs.
 *  3. In the toolbar choose the function  MOB_Setup  ▸ Run ▸ allow the permissions.
 *  4. Deploy ▸ New deployment ▸ ⚙ Web app ▸ Execute as: Me ▸ Who has access: Anyone ▸ Deploy ▸ copy the /exec link.
 *     (Already deployed for the QR check page? Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy – same link.)
 *  5. In the app: paste the link, type your name, Connect.
 *
 * This file also answers the Document Inbox web link (the doPost of Code.gs) exactly as before,
 * and replaces INB_Read_ so the Document Inbox reads files with the current Claude models.
 */

/* ================================================================ entry points (global) */
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { b = {}; }
  if (b && b.action) return MOB2.handle(b);
  // ---- the Document Inbox web link of Code.gs (Zapier, Make, Power Automate…), unchanged
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    if (!INB_get_('HOOK_KEY') || b.key !== INB_get_('HOOK_KEY')) return out({ ok: false, error: 'wrong or missing key' });
    var blob;
    if (b.data) blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mimeType || 'application/pdf', b.name || 'document.pdf');
    else if (b.url) blob = UrlFetchApp.fetch(b.url).getBlob().setName(b.name || 'document');
    else return out({ ok: false, error: 'send "data" (base64) or "url"' });
    var f = INB_Folder_().createFile(blob).setDescription('source: ' + String(b.source || 'Web link').slice(0, 40));
    return out({ ok: true, id: f.getId(), note: 'it will be read within 10 minutes' });
  } catch (err) { return out({ ok: false, error: err.message }); }
}
/** run once from the editor */
function MOB_Setup() { return MOB2.setup(); }
/** adds every chemical name used in the registers that is not yet on the drop-down list (run from the editor, or the app ▸ Admin) */
function MOB_AddMissingChemicals() {
  var r = MOB2.chemSync(true), msg = r.added.length + ' chemical name(s) added to the drop-down list' + (r.fixed ? ', and ' + r.fixed + ' clearance line(s) given their standard name' : '') + '.' + (r.added.length ? '\n\n' + r.added.join('\n') : '');
  try { SpreadsheetApp.getUi().alert('CMU Database – chemical list', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
  return msg;
}
/** Document Inbox: read a file with Claude (replaces the version in Code.gs, which forced a tool the newer models refuse) */
function INB_Read_(blob, mime, name) { return MOB2.inbRead(Utilities.base64Encode(blob.getBytes()), mime, name, ''); }

var MOB2 = (function () {
  var VERSION = '2.0.0-cmu';
  var TZ = 'Africa/Monrovia';
  /* registers: Code.gs tables, plus three plain sheets this file keeps (header in row 1) */
  var S = { CO: 'tblCompanies', LIC: 'tblLicences', LCH: 'tblLicenceChemicals', LVE: 'tblLicenceVehicles', LEF: 'tblLicenceEffluent', CLR: 'tblClearances',
    BIL: 'tblBills', PAY: 'tblPayments', ISS: 'tblIssues', COR: 'tblCorrespondence', INS: '@Field Inspections', INB: '@Document Inbox', LOG: '@Activity Log', UPL: '@Mobile Uploads' };
  var PLAIN = {
    'Field Inspections': ['Inspection ID', 'Inspection Date', 'Company ID', 'Company', 'Site / Facility', 'Inspection Type', 'Linked Record', 'Compliance',
      'Findings', 'Actions Required', 'Follow-up Date', 'Latitude', 'Longitude', 'GPS Accuracy (m)', 'Photos', 'Inspector', 'Recorded'],
    'Mobile Uploads': ['Client ID', 'Type', 'Result', 'When', 'Who']
  };
  var TABLES = { companies: S.CO, licences: S.LIC, licenceChemicals: S.LCH, licenceVehicles: S.LVE, licenceEffluent: S.LEF, clearances: S.CLR, bills: S.BIL,
    payments: S.PAY, issues: S.ISS, correspondence: S.COR, inspections: S.INS, inbox: S.INB };
  var HI = [[0, 1], [1, 1.5], [2, 2], [3, 2.5], [4, 3]];
  var FEE_CATS = [['Petrochemicals', 'kg', 0.05], ['Agrochemicals', 'kg', 0.15], ['Explosives', 'MT', 1.875], ['Laboratory Chemicals', 'kg', 0.05],
    ['Industrial Chemicals Class A', 'kg', 0.50], ['Industrial Chemicals Class B', 'kg', 0.40], ['Sodium Cyanide', 'MT', 6.5]];
  var EXTRA_LISTS = { inspectionTypes: ['Port clearance', 'Warehouse / storage', 'Mine site', 'Routine', 'Complaint', 'Follow-up', 'Effluent discharge'],
    compliance: ['Compliant', 'Minor issues', 'Non-compliant'], corTypes: ['Reminder Letter', 'Violation Notice', 'Shutdown Notice', 'Warning Letter', 'Other Letter'],
    vehicleTypes: ['Heavy Duty Truck', 'Tanker', 'Pick-up', 'Van', 'Other'], issueStatus: ['Open', 'Verified', 'Closed'] };

  /* ---------------------------------------------------------------- helpers (private to this file) */
  function ss() { var s = null; try { s = SpreadsheetApp.getActive(); } catch (e) { } return s || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('CMU_SSID')); }
  function P() { return PropertiesService.getScriptProperties(); }
  function str(v) { if (v === null || v === undefined) return ''; if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd'); return String(v); }
  function trim(v) { return str(v).replace(/^\s+|\s+$/g, ''); }
  function num(v) { if (typeof v === 'number') return v; var s = trim(v).replace(/,/g, ''); return s === '' || isNaN(Number(s)) ? 0 : Number(s); }
  function isNum(v) { if (typeof v === 'number') return true; var s = trim(v).replace(/,/g, ''); return s !== '' && !isNaN(Number(s)); }
  function eq(a, b) { return trim(a).toLowerCase() === trim(b).toLowerCase(); }
  function money(n) { n = Math.round(num(n) * 100) / 100; var p = n.toFixed(2).split('.'); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + p[1]; }
  function pad(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }
  function nowText() { return Utilities.formatDate(new Date(), TZ, 'dd-MMM-yyyy HH:mm'); }
  function iso(d) { return d ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : ''; }
  function date(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    var m = trim(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var m2 = trim(v).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); if (m2) { var mi = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m2[2].toLowerCase()) / 3; if (mi >= 0) return new Date(+m2[3], mi, +m2[1]); }
    return null;
  }
  function dv(v) { return date(v) || ''; }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function days(a, b) { return Math.round((a.getTime() - b.getTime()) / 86400000); }
  function ser(v) { return v instanceof Date ? (v.getHours() || v.getMinutes() ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm") : iso(v)) : (v === null || v === undefined ? '' : v); }
  function regName(k) { return k.charAt(0) === '@' ? k.slice(1) : ((typeof META === 'object' && META.tables[k]) ? META.tables[k].sheet : k); }

  /* ---------------------------------------------------------------- registers (cached for one request) */
  var MEMO = {};
  function dirty(k) { if (k) delete MEMO[k]; else MEMO = {}; }
  function plainSheet(name) {
    var sh = ss().getSheetByName(name);
    if (!sh && name === 'Document Inbox' && typeof INB_Sheet_ === 'function') sh = INB_Sheet_();
    if (!sh && name === 'Activity Log' && typeof EXT_LogSheet_ === 'function') sh = EXT_LogSheet_();
    if (!sh && PLAIN[name]) { sh = ss().insertSheet(name); sh.getRange(1, 1, 1, PLAIN[name].length).setValues([PLAIN[name]]).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF'); sh.setFrozenRows(1); }
    if (!sh) throw new Error('Sheet "' + name + '" is missing.');
    return sh;
  }
  /** {table?, t, sh, head, rows:[{col:value}], rowNo:[table index or sheet row]} */
  function reg(k) {
    if (MEMO[k]) return MEMO[k];
    var out;
    if (k.charAt(0) === '@') {
      var sh = plainSheet(k.slice(1)), v = sh.getLastRow() ? sh.getDataRange().getValues() : [[]], head = v.shift().map(String), rows = [], rowNo = [];
      v.forEach(function (r, i) { if (!r.some(function (x) { return trim(x) !== ''; })) return; var o = {}; head.forEach(function (h, j) { if (h) o[h] = r[j]; }); rows.push(o); rowNo.push(i + 2); });
      out = { sh: sh, head: head, rows: rows, rowNo: rowNo };
    } else {
      var t = T_(k), vals = t.values(), rs = [], idx = [];
      vals.forEach(function (r, i) {
        if (trim(r[0]) === '' && !r.slice(1, 6).some(function (x) { return trim(x) !== '' && typeof x !== 'number'; })) return;
        var o = {}; t.cols.forEach(function (h, j) { o[h] = r[j]; }); rs.push(o); idx.push(i + 1);
      });
      out = { table: true, t: t, head: t.cols, rows: rs, rowNo: idx };
    }
    return (MEMO[k] = out);
  }
  /** write the given columns of one row; calculated (formula) columns are left alone, links to the old source logs are replaced */
  function writeRow(t, i, obj) {
    var rg = t.sheet.getRange(t.r0 + i - 1, t.c0, 1, t.nCols), f = rg.getFormulas()[0];
    t.cols.forEach(function (h, j) {
      if (!obj.hasOwnProperty(h)) return;
      if (f[j] && !(typeof isLinked_ === 'function' && isLinked_(f[j]))) return;
      var v = obj[h], cell = rg.getCell(1, j + 1);
      if (v === '' || v === null || v === undefined) cell.clearContent(); else cell.setValue(v);
    });
    t._vals = null;
  }
  function add(k, obj) {
    if (k.charAt(0) === '@') { var R = reg(k), row = R.head.map(function (h) { var v = obj[h]; return v === undefined || v === null ? '' : v; }); R.sh.appendRow(row); dirty(k); return R.sh.getLastRow(); }
    var t = T_(k), i = t.addRow(); t.refresh(); writeRow(t, i, obj); dirty(k); return i;
  }
  function setRow(k, n, obj) {
    if (k.charAt(0) === '@') { var R = reg(k), cur = R.sh.getRange(n, 1, 1, R.head.length).getValues()[0]; R.head.forEach(function (h, j) { if (obj.hasOwnProperty(h)) cur[j] = obj[h] === undefined || obj[h] === null ? '' : obj[h]; }); R.sh.getRange(n, 1, 1, R.head.length).setValues([cur]); dirty(k); return; }
    writeRow(T_(k), n, obj); dirty(k);
  }
  function delRows(k, test) {
    var R = reg(k), del = [];
    R.rows.forEach(function (r, i) { if (test(r)) del.push(R.rowNo[i]); });
    del.sort(function (a, b) { return b - a; });
    if (k.charAt(0) === '@') del.forEach(function (n) { R.sh.deleteRow(n); });
    else { var t = T_(k); del.forEach(function (n) { t.deleteRow(n); }); }
    dirty(k); return del.length;
  }
  function find(k, col, val) { var R = reg(k); for (var i = 0; i < R.rows.length; i++) if (eq(R.rows[i][col], val)) return { row: R.rows[i], rowNo: R.rowNo[i] }; return null; }
  function nextId(k, col, pre) { var mx = 0; reg(k).rows.forEach(function (r) { var s = str(r[col]); if (s.indexOf(pre) === 0) { var n = parseInt(s.slice(pre.length), 10); if (n > mx) mx = n; } }); return pre + pad(mx + 1); }
  function companyRow(x) { var k = trim(x); if (!k) return null; return reg(S.CO).rows.filter(function (r) { return eq(r['Company Name'], k) || eq(r['Company ID'], k); })[0] || null; }
  function companyId(x) { var c = companyRow(x); return c ? str(c['Company ID']) : ''; }
  function companyName(x) { var c = companyRow(x); return c ? str(c['Company Name']) : ''; }
  function names() { var n = {}; reg(S.CO).rows.forEach(function (r) { n[trim(r['Company ID']).toUpperCase()] = str(r['Company Name']); }); return n; }
  function log(who, action, k, id, details) { try { plainSheet('Activity Log').appendRow([new Date(), who, action, regName(k || ''), String(id || ''), String(details || '').slice(0, 480)]); dirty(S.LOG); } catch (e) { } }
  function toKg(q, unit) {
    if (!isNum(q)) return null;
    var u = trim(unit).toLowerCase().replace(/\s+/g, '').replace(/\/.*$/, ''); q = num(q);
    if (/^(kg|kgs|l|ltr|litre|liter|litres|liters)$/.test(u)) return q;
    if (/^(mt|t|ton|tons|tonne|tonnes)$/.test(u)) return q * 1000;
    return null;
  }
  function named(n) { try { var r = ss().getRangeByName(n); return r ? r.getValues().map(function (x) { return trim(x[0]); }).filter(String) : []; } catch (e) { return []; } }
  function tableObjs(n) { try { var t = T_(n); return t.values().filter(function (r) { return trim(r[0]) !== ''; }).map(function (r) { var o = {}; t.cols.forEach(function (h, j) { o[h] = ser(r[j]); }); return o; }); } catch (e) { return []; } }
  function settings() {
    var o = {};
    try { ss().getSheetByName('Lists').getRange('O5:P20').getValues().forEach(function (r) { if (trim(r[0])) o[trim(r[0])] = ser(r[1]); }); } catch (e) { }
    try { var I = ss().getSheetByName('Insights'); o['Alert: days before expiry'] = num(I.getRange('B3').getValue()) || 60; o['Alert: days after expiry'] = num(I.getRange('D3').getValue()) || 30; } catch (e) { }
    return o;
  }
  function feeCats() {
    try { var v = ss().getSheetByName('Chemical Hazards').getRange('K5:M20').getValues().filter(function (r) { return trim(r[0]) && isNum(r[2]); }).map(function (r) { return [trim(r[0]), trim(r[1]) || 'kg', num(r[2])]; }); return v.length ? v : FEE_CATS; }
    catch (e) { return FEE_CATS; }
  }
  function hazards() {
    var sh = ss().getSheetByName('Chemical Hazards'); if (!sh || sh.getLastRow() < 5) return [];
    return sh.getRange(5, 1, sh.getLastRow() - 4, 9).getValues().filter(function (r) { return trim(r[0]); }).map(function (r) {
      return { name: trim(r[0]), cas: str(r[1]), h: str(r[2]), f: str(r[3]), p: str(r[4]), hmis: trim(r[5]) === '' ? '' : num(r[5]), cat: str(r[6]), notes: [str(r[7]), str(r[8])].filter(String).join(' – ') };
    });
  }
  /* ---- company contacts live on the sheet "Company Contacts" (row 10 = headers, from row 11) */
  function contacts() {
    var sh = ss().getSheetByName('Company Contacts'), out = {}; if (!sh || sh.getLastRow() < 11) return out;
    sh.getRange(11, 1, sh.getLastRow() - 10, 8).getValues().forEach(function (r, i) { if (trim(r[0])) out[trim(r[0]).toUpperCase()] = { row: 11 + i, person: str(r[2]), email: str(r[3]), phone: str(r[4]), send: str(r[5]), last: r[6], title: str(r[7]) }; });
    return out;
  }
  function saveContact(id, name, d) {
    var sh = ss().getSheetByName('Company Contacts'); if (!sh) return;
    if (trim(sh.getRange(10, 8).getValue()) === '') sh.getRange(10, 8).setValue('Contact Title');
    var c = contacts()[trim(id).toUpperCase()], row = c ? c.row : Math.max(sh.getLastRow() + 1, 11);
    sh.getRange(row, 1, 1, 6).setValues([[id, name, d.contact || '', d.email || '', d.phone || '', d.remind || (c ? c.send : 'Yes') || 'Yes']]);
    sh.getRange(row, 8).setValue(d.title || '');
  }

  /* ---------------------------------------------------------------- the standard chemical list (Lists ▸ Chemical (Standard), table tChemical) */
  var CHEM_JUNK = /illegible|\bfcl\b|pallet|dry van|high cube|load stow|^[A-Z]{4}\d{6}|^\(|^-+$|unknown|^n\/?a$/i;
  function chemKey(s) { return trim(s).toLowerCase().replace(/\d+(\.\d+)?\s*%/g, ' ').replace(/[^a-z0-9]/g, ''); }
  function chemSame(a, b) { a = chemKey(a); b = chemKey(b); if (!a || !b) return false; if (a === b) return true; var x = a.length < b.length ? a : b, y = a.length < b.length ? b : a; return x.length >= 8 && y.indexOf(x) >= 0; }
  function niceName(s) { s = trim(s).replace(/\s+/g, ' '); return s === s.toUpperCase() && /[A-Z]/.test(s) ? s.toLowerCase().replace(/(^|[\s(\/-])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); }) : s; }
  function chemList() { try { return T_('tChemical').column('Chemical (Standard)').map(trim).filter(String); } catch (e) { return named('lstChemical'); } }
  /** write one name below the list, grow its named ranges, and keep the drop-downs that use it in step */
  function chemAppend(name) {
    var s0 = ss(), nr = s0.getRangeByName('T_tChemical'); if (!nr) throw new Error('The chemical list (T_tChemical) is missing in Code.gs.');
    var sh = nr.getSheet(), last = nr.getRow() + nr.getNumRows() - 1, col = nr.getColumn();
    var cells = nr.getValues().map(function (r) { return trim(r[0]); }), empty = cells.lastIndexOf('') === cells.length - 1 && cells.length > 1 && cells[cells.length - 1] === '';
    if (empty) { sh.getRange(last, col).setValue(name); }               // the list ends with a blank placeholder row: use it
    else {
      var below = sh.getRange(last + 1, col);
      if (trim(below.getValue()) !== '') below.insertCells(SpreadsheetApp.Dimension.ROWS);   // shift only this column, never the other lists
      sh.getRange(last + 1, col).setValue(name);
      var grown = sh.getRange(nr.getRow(), col, nr.getNumRows() + 1, nr.getNumColumns());
      s0.setNamedRange('T_tChemical', grown);
      try { var ln = s0.getRangeByName('lstChemical'); if (ln && ln.getSheet().getName() === sh.getName() && ln.getColumn() === col) s0.setNamedRange('lstChemical', sh.getRange(ln.getRow(), col, grown.getRow() + grown.getNumRows() - ln.getRow(), 1)); } catch (e) { }
    }
  }
  function chemDropdowns() {
    if (typeof META !== 'object' || !META.dv) return;
    var nr = ss().getRangeByName('T_tChemical'); if (!nr) return;
    META.dv.forEach(function (d) {
      if (!d.tcol || d.tcol[0] !== 'tChemical' || d.type !== 'list') return;
      try {
        var src = nr.getSheet().getRange(nr.getRow(), nr.getColumn() + d.tcol[1] - 1, nr.getNumRows(), 1);
        var rule = SpreadsheetApp.newDataValidation().setAllowInvalid(!d.strict).requireValueInRange(src, !d.noDrop).build(), sh = ss().getSheetByName(d.sheet);
        d.sqref.split(' ').forEach(function (a1) { sh.getRange(typeof tableArea_ === 'function' ? tableArea_(d.sheet, a1) : a1).setDataValidation(rule); });
      } catch (e) { }
    });
  }
  /** a row on the Chemical Hazards sheet (HMIS + fee category for the fee calculation) */
  function hazardRow(name, h) {
    var sh = ss().getSheetByName('Chemical Hazards'); if (!sh) return;
    var n = Math.max(sh.getLastRow() - 4, 1), col = sh.getRange(5, 1, n, 1).getValues().map(function (r) { return trim(r[0]); }), i = -1;
    col.forEach(function (c, j) { if (i < 0 && eq(c, name)) i = j; });
    var lastName = -1; col.forEach(function (c, j) { if (c) lastName = j; });
    var row = i >= 0 ? 5 + i : 5 + lastName + 1;
    if (i < 0) sh.getRange(row, 1).setValue(name);
    h = h || {};
    if (trim(h.cas)) sh.getRange(row, 2).setValue(h.cas);
    if (isNum(h.hmis)) sh.getRange(row, 6).setValue(num(h.hmis));
    if (trim(h.cat)) sh.getRange(row, 7).setValue(h.cat);
    if (trim(h.notes)) sh.getRange(row, 8).setValue(h.notes);
  }
  function addChemical(name, h, who) {
    name = niceName(name);
    if (!chemList().some(function (c) { return eq(c, name); })) { chemAppend(name); chemDropdowns(); }
    hazardRow(name, h);
    log(who || 'mobile', 'Chemical added to the list', 'Lists', '', name);
    return name;
  }
  /** every chemical name used in the registers that is not on the list (dry run when apply is false) */
  function chemSync(apply) {
    var have = chemList(), cand = [], seen = {};
    var push = function (n, from) { n = niceName(n); var k = chemKey(n); if (!k || seen[k] || CHEM_JUNK.test(n)) return; seen[k] = 1; if (!have.some(function (x) { return chemSame(x, n); })) cand.push({ name: n, from: from }); };
    reg(S.CLR).rows.forEach(function (r) { if (trim(r['Chemical (Standard)'])) push(r['Chemical (Standard)'], 'clearance'); else if (trim(r['Chemical as Recorded'])) push(r['Chemical as Recorded'], 'clearance'); });
    reg(S.LCH).rows.forEach(function (r) { if (trim(r['Trade or IUPAC Name'])) push(r['Trade or IUPAC Name'], 'licence'); });
    var fixed = 0;
    if (apply) {
      cand.forEach(function (c) { chemAppend(c.name); hazardRow(c.name, {}); });
      if (cand.length) chemDropdowns();
      var list = chemList();
      reg(S.CLR).rows.forEach(function (r, i) {
        if (trim(r['Chemical (Standard)']) || !trim(r['Chemical as Recorded'])) return;
        var m = list.filter(function (x) { return chemSame(x, niceName(r['Chemical as Recorded'])); })[0];
        if (m) { setRow(S.CLR, reg(S.CLR).rowNo[i], { 'Chemical (Standard)': m }); fixed++; }
      });
      log('setup', 'Missing chemicals added to the list', 'Lists', '', cand.length + ' name(s); ' + fixed + ' clearance line(s) standardised');
    }
    return { added: cand.map(function (c) { return c.name; }), fixed: fixed };
  }

  /* ================================================================ the phone API */
  function handle(b) {
    var out;
    MEMO = {};
    try {
      var who = trim(b.who).slice(0, 60) || 'Mobile app', u = { name: who, email: who, role: 'staff', admin: pinOk(b.pin) };
      switch (b.action) {
        case 'login': out = { ok: true, token: '', user: u, open: true, version: VERSION, pinSet: !!P().getProperty('MOB_ADMIN_PIN') }; break;
        case 'pull': out = pull(u); break;
        case 'push': out = push(u, b.items || []); break;
        case 'check': var c = check(b.item || {}); out = c.error ? { ok: false, error: c.error } : { ok: true, warnings: c.warnings || [] }; break;
        case 'photo': out = photo(u, b.photo || {}); break;
        case 'verify': out = verify(u, String(b.code || '')); break;
        case 'file': out = file(u, b.file || {}); break;
        case 'ai': out = aiChat(u, b.history || [], String(b.message || ''), b.file || null, b.model || ''); break;
        case 'read': out = readUpload(u, b.file || {}, b.hint || ''); break;
        case 'admin': out = admin(u, b); break;
        default: out = { ok: false, error: 'Unknown action' };
      }
    } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  function pinOk(pin) { var p = P().getProperty('MOB_ADMIN_PIN'); return !p || (!!pin && String(pin) === p); }
  function outRows(k) { return reg(k).rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (h) { o[h] = ser(r[h]); }); return o; }); }

  function insights() {
    var t0 = today(), nm = names(), set = settings(), ahead = num(set['Alert: days before expiry']) || 60, after = num(set['Alert: days after expiry']) || 30;
    var L = reg(S.LIC).rows.map(function (r) {
      var e = date(r['Expiry Date']);
      return { id: str(r['Record ID']), coId: str(r['Company ID']), co: str(r['Company Name']) || nm[trim(r['Company ID']).toUpperCase()] || '', type: str(r['Licence / Certificate Type']) || str(r['Licence Category']),
        cat: str(r['Licence Category']), no: str(r['Licence / Certificate No.']), expiry: e, days: e ? days(e, t0) : null };
    });
    L.forEach(function (x) { x.renewed = !!x.expiry && L.some(function (y) { return y !== x && y.expiry && y.coId === x.coId && eq(y.type, x.type) && y.expiry > x.expiry; }); });
    return { alerts: L.filter(function (x) { return x.expiry && !x.renewed && x.days <= ahead && x.days >= -after; }).sort(function (a, b) { return a.days - b.days; })
      .map(function (x) { return { id: x.id, coId: x.coId, co: x.co, type: x.type, cat: x.cat, no: x.no, expiry: iso(x.expiry), days: x.days }; }), ahead: ahead, after: after };
  }
  /** one entry per Bill No.; payments without a Bill No. are applied to the company's bills, oldest first ("company account") */
  function bills(excludePay) {
    var t0 = today(), nm = names(), by = {}, order = [];
    reg(S.BIL).rows.forEach(function (r) {
      var no = trim(r['Bill No.']); if (!no) return;
      var b = by[no];
      if (!b) { b = by[no] = { no: no, coId: str(r['Company ID']), co: str(r['Company Name']) || nm[trim(r['Company ID']).toUpperCase()] || '', type: str(r['Bill Type']), ref: str(r['Bill Ref. No.']),
        date: date(r['Bill Date']), billed: 0, purpose: [], contact: str(r['Contact Person']), title: str(r['Contact Title']), location: str(r['Location']), linked: str(r['Linked Record']), lines: 0 }; order.push(no); }
      b.billed += num(r['Amount Billed (USD)']); b.lines++;
      var p = str(r['Purpose / Licence Billed']); if (p && b.purpose.indexOf(p) < 0) b.purpose.push(p);
    });
    var linked = {}, pool = {};
    reg(S.PAY).rows.forEach(function (p) {
      if (excludePay && eq(p['Record ID'], excludePay)) return;
      var no = trim(p['Bill No.']), amt = num(p['Amount (USD)']);
      if (no && by[no]) linked[no] = (linked[no] || 0) + amt; else { var c = trim(p['Company ID']).toUpperCase(); if (c) pool[c] = (pool[c] || 0) + amt; }
    });
    order.slice().sort(function (a, b) { var x = by[a].date, y = by[b].date; return (x ? x.getTime() : 0) - (y ? y.getTime() : 0); }).forEach(function (k) {
      var b = by[k], c = trim(b.coId).toUpperCase(); b.paid = linked[k] || 0; b.viaAccount = 0;
      var need = Math.max(0, b.billed - b.paid);
      if (need > 0 && pool[c] > 0) { var use = Math.min(need, pool[c]); pool[c] -= use; b.paid += use; b.viaAccount = use; }
    });
    return order.map(function (k) {
      var b = by[k], paid = Math.round(b.paid * 100) / 100, out = Math.max(0, Math.round((b.billed - paid) * 100) / 100), acct = b.viaAccount > 0 ? ' (company account)' : '';
      return { no: b.no, coId: b.coId, co: b.co, type: b.type, ref: b.ref, date: iso(b.date), billed: b.billed, paid: paid, out: out, age: b.date ? days(t0, b.date) : null,
        isPaid: out <= 0.005, status: (out <= 0.005 ? 'Paid' : paid > 0 ? 'Part-paid' : 'Unpaid') + acct, purpose: b.purpose.join(', '), contact: b.contact, title: b.title, location: b.location, linked: b.linked, lines: b.lines };
    });
  }
  function billStatus(no, excludePay) { return bills(excludePay).filter(function (b) { return eq(b.no, no); })[0] || null; }

  /* ---- import quotas (CIL licensed quantities vs clearances) */
  function key(s) { return trim(s).toLowerCase().replace(/\d+(\.\d+)?\s*%/g, ' ').replace(/[^a-z0-9]/g, ''); }
  function same(a, b) { a = key(a); b = key(b); if (!a || !b) return false; if (a === b) return true; var s = a.length < b.length ? a : b, l = a.length < b.length ? b : a; return s.length >= 4 && l.indexOf(s) >= 0; }
  function quotas(extra, skipCln) {
    var t0 = today(), rows = [], notOn = [], noLic = [];
    var lics = reg(S.LIC).rows.filter(function (r) { return /CIL|importation/i.test(str(r['Licence Category']) + ' ' + str(r['Licence / Certificate Type'])); }).map(function (r) {
      var is = date(r['Date Issued']), ex = date(r['Expiry Date']);
      return { id: str(r['Record ID']), no: str(r['Licence / Certificate No.']), coId: str(r['Company ID']), co: str(r['Company Name']), from: is || (ex ? new Date(ex.getFullYear(), 0, 1) : null), to: ex, chems: [] };
    });
    reg(S.LCH).rows.forEach(function (r) {
      var l = lics.filter(function (x) { return eq(x.id, r['Licence Record ID']); })[0]; if (!l || !trim(r['Trade or IUPAC Name'])) return;
      l.chems.push({ name: str(r['Trade or IUPAC Name']), perMonth: /\/\s*month/i.test(str(r['Unit'])), limit: toKg(r['Stipulated Qty'], r['Unit']), used: 0, months: {}, hasNew: false, lines: 0 });
    });
    var lines = reg(S.CLR).rows.filter(function (r) { return !skipCln || !eq(r['Clearance No.'], skipCln); })
      .map(function (r) { return { id: str(r['Record ID']), cln: str(r['Clearance No.']), coId: str(r['Company ID']), co: str(r['Company Name']), rec: str(r['Chemical as Recorded']), std: str(r['Chemical (Standard)']), kg: num(r['Qty (kg)']), date: date(r['Clearance Date']) }; })
      .concat((extra || []).map(function (x) { x.isNew = true; return x; }));
    lines.forEach(function (ln) {
      if (!ln.date) return;
      var ls = lics.filter(function (l) { return l.coId === ln.coId && l.from && ln.date >= l.from && (!l.to || ln.date <= l.to); });
      if (!ls.length) { noLic.push(ln); return; }
      var hit = null;
      ls.forEach(function (l) { l.chems.forEach(function (ch) { if (!hit && (same(ch.name, ln.std) || same(ch.name, ln.rec))) hit = ch; }); });
      if (hit) { hit.used += ln.kg; hit.lines++; var mk = ln.date.getFullYear() + '-' + (ln.date.getMonth() + 1); hit.months[mk] = (hit.months[mk] || 0) + ln.kg; if (ln.isNew) hit.hasNew = true; }
      else if (ls.some(function (l) { return l.chems.length; })) notOn.push({ line: ln, lic: ls[0] });
    });
    lics.forEach(function (l) {
      l.chems.forEach(function (ch) {
        var basis = ch.used; if (ch.perMonth) { basis = 0; Object.keys(ch.months).forEach(function (k) { basis = Math.max(basis, ch.months[k]); }); }
        var pct = ch.limit ? basis / ch.limit : null;
        rows.push({ lic: l.id, licNo: l.no, coId: l.coId, co: l.co, chem: ch.name, limit: ch.limit, perMonth: ch.perMonth, used: Math.round(basis * 100) / 100, pct: pct, lines: ch.lines,
          status: ch.limit === null ? 'No quantity on licence' : pct > 1.0000001 ? 'OVER QUOTA' : pct >= 0.8 ? 'Near limit (80%+)' : 'OK', active: !l.to || l.to >= t0, hasNew: ch.hasNew });
      });
    });
    rows.sort(function (a, b) { return (b.pct === null ? -1 : b.pct) - (a.pct === null ? -1 : a.pct); });
    return { rows: rows, notOn: notOn, noLic: noLic, lics: lics };
  }

  function pull(u) {
    var tables = {}; Object.keys(TABLES).forEach(function (k) { tables[k] = outRows(TABLES[k]); });
    var con = contacts();
    tables.companies.forEach(function (r) { var c = con[trim(r['Company ID']).toUpperCase()]; if (c) { r['Contact Person'] = c.person; r['Contact Title'] = c.title; r['Phone'] = c.phone; r['Email'] = c.email; r['Send reminders?'] = c.send; r['Last reminder sent'] = ser(c.last); } });
    tables.correspondence.forEach(function (r) { r['Date'] = r['Date Issued']; });
    tables.inbox.forEach(function (r) { delete r['File']; });
    tables.licences.forEach(function (r) { r['Verification Code'] = trim(r['Record ID']).toUpperCase() + '-' + QR_Token_('licence', r['Record ID']); });
    var Q = quotas([]), codes = { licence: {}, clearance: {}, bill: {} };
    tables.licences.forEach(function (r) { codes.licence[r['Record ID']] = r['Verification Code']; });
    tables.clearances.forEach(function (r) { var n = r['Clearance No.']; if (n && !codes.clearance[n]) codes.clearance[n] = trim(n).toUpperCase() + '-' + QR_Token_('clearance', n); });
    tables.bills.forEach(function (r) { var n = r['Bill No.']; if (n && !codes.bill[n]) codes.bill[n] = trim(n).toUpperCase() + '-' + QR_Token_('bill', n); });
    var act = reg(S.LOG).rows.slice(-300).reverse().map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = ser(r[k]); }); return o; });
    var I = insights(), sigs = tableObjs('tSignatory'), offs = tableObjs('tOffice');
    return {
      ok: true, serverTime: new Date().toISOString(), version: VERSION, user: u, tables: tables, codes: codes, activity: act,
      insights: { alerts: I.alerts, bills: bills(), quotas: Q.rows, ahead: I.ahead, after: I.after, noLic: Q.noLic.length,
        notOn: Q.notOn.map(function (x) { return { id: x.line.id, cln: x.line.cln, co: x.line.co, chem: x.line.rec || x.line.std, kg: x.line.kg, date: iso(x.line.date), lic: x.lic.id, licNo: x.lic.no }; }) },
      lists: { chemicals: named('lstChemical'), units: named('lstUnit'), sectors: named('lstSector'), purposes: named('lstPurpose'), categories: named('lstLicCategory'), types: named('lstLicType'),
        billTypes: named('lstBillType'), groups: named('lstRecordGroup').concat(['Mobile app']), params: named('lstParameter'), effUnits: named('lstEffUnit'), schedules: named('lstSchedule'),
        registers: ['Companies', 'Licences & Certificates', 'Licence Chemicals', 'Chemical Clearances', 'Bills & Invoices', 'Payments & Receipts', 'Field Inspections', 'Notes & Issues'],
        inspectionTypes: EXTRA_LISTS.inspectionTypes, compliance: EXTRA_LISTS.compliance, corTypes: EXTRA_LISTS.corTypes, vehicleTypes: EXTRA_LISTS.vehicleTypes, issueStatus: EXTRA_LISTS.issueStatus },
      hazards: { rows: hazards(), cats: feeCats(), hi: HI },
      config: { fees: tableObjs('tblServices'), billTypes: tableObjs('tblBillTypes'), settings: settings(),
        signatories: sigs.map(function (s) { var o = offs.filter(function (x) { return eq(x['Signatory'], s['Signatory']); })[0] || {}; return { 'Signatory': s['Signatory'], 'Name': s['Name'], 'Title': s['Title'], 'Office Line': o['Office Line'] || '', 'Contact Line': o['Contact Line'] || '', 'Ref. Prefix': o['Ref. Prefix'] || '' }; }) },
      server: serverInfo()
    };
  }
  function serverInfo() {
    var trig = {}; try { ScriptApp.getProjectTriggers().forEach(function (t) { trig[t.getHandlerFunction()] = true; }); } catch (e) { }
    return { version: VERSION, pinSet: !!P().getProperty('MOB_ADMIN_PIN'), ai: !!aiKey(), aiModel: P().getProperty('CLAUDE_MODEL') || 'auto', aiSpent: aiSpent(), aiBudget: parseFloat(P().getProperty('CLAUDE_BUDGET') || '0') || 0,
      reminders: !!trig.REM_Weekly, calendar: !!trig.CAL_Daily, backup: !!trig.BAK_Weekly, inbox: !!trig.INB_Poll, inboxLast: P().getProperty('INB_LAST') || '', sheet: (function () { try { return ss().getName(); } catch (e) { return ''; } })() };
  }

  /* ---------------------------------------------------------------- checks (the officer confirms warnings before saving) */
  function dice(a, b) { if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0; var m = {}, n = 0, i, g; for (i = 0; i < a.length - 1; i++) { g = a.substr(i, 2); m[g] = (m[g] || 0) + 1; } for (i = 0; i < b.length - 1; i++) { g = b.substr(i, 2); if (m[g]) { m[g]--; n++; } } return 2 * n / (a.length + b.length - 2); }
  function coKey(s) { var stop = ' inc ltd llc limited corp corporation company co the liberia lib and group plc sa '; return trim(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]/g, ' ').split(' ').filter(function (w) { return w && stop.indexOf(' ' + w + ' ') < 0; }).join(''); }
  function similar(name, exceptId) {
    var k = coKey(name), out = []; if (!k) return out;
    reg(S.CO).rows.forEach(function (r) {
      if (exceptId && eq(r['Company ID'], exceptId)) return;
      var k2 = coKey(r['Company Name']), sc = dice(k, k2);
      if (k2 && k.length >= 4 && k2.length >= 4 && (k2.indexOf(k) >= 0 || k.indexOf(k2) >= 0)) sc = Math.max(sc, 0.9);
      str(r['Other Names Recorded']).split(/[;,\/|\n]/).forEach(function (o) { sc = Math.max(sc, dice(k, coKey(o))); });
      if (sc >= 0.75) out.push({ id: str(r['Company ID']), name: str(r['Company Name']), score: sc });
    });
    return out.sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  }
  var KIND = { company: [S.CO, 'Company ID'], licence: [S.LIC, 'Record ID'], clearance: [S.CLR, 'Clearance No.'], bill: [S.BIL, 'Bill No.'], payment: [S.PAY, 'Record ID'],
    issue: [S.ISS, 'Issue #'], inspection: [S.INS, 'Inspection ID'], correspondence: [S.COR, 'Record ID'] };
  function check(it) {
    var d = it.data || {}, w = [], block = false, id = trim(d.id);
    if (id && KIND[it.type] && !find(KIND[it.type][0], KIND[it.type][1], id)) return { error: id + ' was not found – it may have been deleted. Sync and try again.' };
    if (it.type === 'delete') {
      var K = KIND[d.kind]; if (!K) return { error: 'Unknown record type ' + d.kind };
      if (!find(K[0], K[1], d.id)) return { error: d.id + ' is not in the register any more.' };
      if (d.kind === 'company') {
        var n = [S.LIC, S.CLR, S.BIL, S.PAY].reduce(function (a, s) { return a + reg(s).rows.filter(function (r) { return eq(r['Company ID'], d.id); }).length; }, 0);
        if (n) return { error: 'This company has ' + n + ' licence / clearance / bill / payment record(s). Delete or move them first.' };
      }
      if (d.kind === 'bill' && reg(S.PAY).rows.some(function (p) { return eq(p['Bill No.'], d.id); })) { w.push('Payments are linked to ' + d.id + '; they will stay in Payments & Receipts without a bill.'); block = true; }
      return { warnings: w, block: block };
    }
    if (it.type === 'company') {
      if (!trim(d.name)) return { error: 'Company name is required.' };
      var same0 = companyRow(d.name);
      if (same0 && !eq(same0['Company ID'], id)) return { error: '"' + trim(d.name) + '" is already registered as ' + same0['Company ID'] + '.' };
      if (!id) similar(d.name).forEach(function (s) { w.push('Similar company already registered: ' + s.id + ' ' + s.name + ' (' + Math.round(s.score * 100) + '% similar)'); block = true; });
    } else if (it.type === 'licence') {
      if (!companyId(d.company)) return { error: 'Company "' + trim(d.company) + '" is not registered. Register it first.' };
      if (!trim(d.category) || !trim(d.type)) return { error: 'Licence category and type are required.' };
      var is = date(d.issued), ex = date(d.expiry);
      if (is && ex && ex < is) { w.push('The expiry date is before the issue date.'); block = true; }
      if (trim(d.no)) reg(S.LIC).rows.forEach(function (r) { if (eq(r['Licence / Certificate No.'], d.no) && !eq(r['Record ID'], id)) { w.push('Licence No. ' + d.no + ' is already on ' + r['Record ID'] + ' (' + str(r['Company Name']) + ').'); block = true; } });
    } else if (it.type === 'clearance') {
      var coId = companyId(d.company);
      if (!coId) return { error: 'Company "' + trim(d.company) + '" is not registered. Register it first.' };
      var dt = date(d.date); if (!dt) return { error: 'Clearance date is missing or not valid.' };
      var lines = (d.lines || []).filter(function (l) { return trim(l.rec) || trim(l.std); });
      if (!lines.length) return { error: 'Add at least one chemical line.' };
      if (lines.length > 20) return { error: 'A clearance can have at most 20 chemical lines.' };
      var extra = lines.map(function (l) { return { coId: coId, co: d.company, rec: str(l.rec || l.std), std: str(l.std), kg: toKg(l.qty, l.unit) || 0, date: dt }; }).filter(function (x) { return x.kg; });
      if (extra.length) {
        var Q = quotas(extra, id);
        Q.rows.forEach(function (x) { if (x.hasNew && x.limit !== null && x.pct > 1.0000001) { w.push('Over quota: ' + x.chem + ' – ' + money(x.used) + ' kg of ' + money(x.limit) + ' kg' + (x.perMonth ? ' per month' : '') + ' (' + Math.round(x.pct * 100) + '%) on ' + x.lic + ' ' + x.licNo); block = true; } });
        Q.notOn.forEach(function (x) { if (x.line.isNew) { w.push('Not on licence ' + x.lic.id + ' ' + x.lic.no + ': ' + (x.line.rec || x.line.std)); block = true; } });
        if (Q.noLic.some(function (x) { return x.isNew; }) && Q.lics.some(function (l) { return l.coId === coId; })) { w.push(trim(d.company) + ' has no Chemical Importation Licence valid on ' + iso(dt)); block = true; }
      }
    } else if (it.type === 'bill') {
      if (!companyId(d.company)) return { error: 'Company "' + trim(d.company) + '" is not registered. Register it first.' };
      if (!date(d.date)) return { error: 'Bill date is missing or not valid.' };
      if (!trim(d.type)) return { error: 'Choose the Bill Type (it decides the letter wording).' };
      var bl = (d.lines || []).filter(function (l) { return trim(l.service); });
      if (!bl.length) return { error: 'Add at least one service line.' };
      if (bl.length > 10) return { error: 'A bill can have at most 10 service lines.' };
      if (bl.some(function (l) { return !(num(l.amount) > 0); })) return { error: 'Every service line needs an amount above 0.' };
      if (trim(d.ref)) reg(S.BIL).rows.forEach(function (r) { if (eq(r['Bill Ref. No.'], d.ref) && !eq(r['Bill No.'], id)) { w.push('Bill Ref. No. ' + d.ref + ' is already on ' + r['Bill No.'] + '.'); block = true; } });
    } else if (it.type === 'payment') {
      if (!(num(d.amount) > 0)) return { error: 'The amount must be above 0.' };
      if (!date(d.date)) return { error: 'Payment date is missing or not valid.' };
      if (trim(d.bill)) {
        var b = billStatus(d.bill, id);
        if (!b) return { error: 'Bill No. "' + d.bill + '" was not found.' };
        if (num(d.amount) > b.out + 0.005) { w.push('Amount US$' + money(d.amount) + ' is more than the outstanding balance US$' + money(b.out) + ' on ' + b.no + '.'); block = true; }
      } else if (!companyId(d.company)) return { error: 'Choose the bill, or the company for a payment to the company account.' };
      if (trim(d.receipt) && reg(S.PAY).rows.some(function (p) { return eq(p['Receipt No.'], d.receipt) && !eq(p['Record ID'], id); })) { w.push('Receipt No. ' + trim(d.receipt) + ' is already recorded.'); block = true; }
    } else if (it.type === 'inspection') {
      if (!trim(d.site)) return { error: 'Site / facility is required.' };
      if (!date(d.date)) return { error: 'Inspection date is missing or not valid.' };
      if (trim(d.company) && !companyId(d.company)) w.push('Company "' + d.company + '" is not registered – saved with the name only.');
    } else if (it.type === 'issue') {
      if (!trim(d.issue)) return { error: 'Describe the issue found.' };
    } else if (it.type === 'correspondence') {
      if (!trim(d.type) || !trim(d.description)) return { error: 'Type and description are required.' };
    } else if (it.type === 'chemical') {
      if (!trim(d.name)) return { error: 'Type the chemical name.' };
      if (chemList().some(function (c) { return eq(c, niceName(d.name)); }) && !trim(d.cas) && !isNum(d.hmis) && !trim(d.cat)) return { error: '"' + niceName(d.name) + '" is already on the chemical list.' };
      var near = chemList().filter(function (c) { return !eq(c, niceName(d.name)) && chemSame(c, d.name); });
      if (near.length) { w.push('Similar name already on the list: ' + near.slice(0, 3).join(', ')); block = true; }
      if (isNum(d.hmis) && (num(d.hmis) < 0 || num(d.hmis) > 4)) return { error: 'The HMIS rating must be 0 to 4.' };
    } else if (it.type === 'inboxReject') {
      if (!find(S.INB, 'File ID', d.fid)) return { error: 'This document is no longer in the Document Inbox.' };
    } else return { error: 'Unknown record type ' + it.type };
    return { warnings: w, block: block };
  }

  /* ---------------------------------------------------------------- save (idempotent by the phone's client ID) */
  function push(u, items) {
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      var done = {}; reg(S.UPL).rows.forEach(function (r) { done[str(r['Client ID'])] = str(r['Result']); });
      var results = [];
      items.forEach(function (it) {
        var cid = str(it.cid); if (!cid) return;
        if (done[cid]) { results.push({ cid: cid, status: 'ok', id: done[cid], repeat: true }); return; }
        var r;
        try {
          var d = it.data || {};
          if ((it.type === 'delete' || trim(d.id)) && !u.admin) r = { status: 'error', error: 'Editing and deleting need the Admin PIN. Enter it in More ▸ Settings, then tap Try again.' };
          else {
            var c = check(it);
            if (c.error) r = { status: 'error', error: c.error };
            else if (c.block && !it.force) r = { status: 'confirm', warnings: c.warnings };
            else { var id = save(u, it); r = { status: 'ok', id: id, warnings: c.warnings }; plainSheet('Mobile Uploads').appendRow([cid, it.type, id, new Date(), u.name]); done[cid] = id; dirty(); }
          }
        } catch (err) { r = { status: 'error', error: String(err && err.message || err) }; dirty(); }
        r.cid = cid; results.push(r);
      });
      try { SpreadsheetApp.flush(); } catch (e) { }
      return { ok: true, results: results };
    } finally { lock.releaseLock(); }
  }
  function src(u) { return 'Mobile app ' + nowText() + ' (' + u.name + ')'; }
  function save(u, it) {
    var d = it.data || {}, id = trim(d.id), by = u.name + ' (mobile)', out;
    switch (it.type) {
      case 'delete': out = del(u, d); break;
      case 'company': out = saveCompany(d, id, u); break;
      case 'licence': out = saveLicence(d, id, u); break;
      case 'clearance': out = saveClearance(d, id, u); break;
      case 'bill': out = saveBill(d, id, u); break;
      case 'payment': out = savePayment(d, id, u); break;
      case 'issue':
        var iid = id || nextId(S.ISS, 'Issue #', 'ISS-'), io = { 'Issue #': iid, 'Register': d.register || '', 'Record': d.record || '', 'Source': d.source || src(u), 'Issue Found': d.issue || '', 'Action Taken': d.action || '', 'Follow-up Status': d.status || 'Open' };
        if (id) setRow(S.ISS, find(S.ISS, 'Issue #', id).rowNo, io); else add(S.ISS, io);
        log(by, id ? 'Updated' : 'Saved new', S.ISS, iid, str(d.issue).slice(0, 120)); out = iid; break;
      case 'inspection':
        var ins = id || nextId(S.INS, 'Inspection ID', 'INS-'), cid = trim(d.company) ? companyId(d.company) : '';
        var o = { 'Inspection ID': ins, 'Inspection Date': dv(d.date), 'Company ID': cid, 'Company': cid ? companyName(cid) : trim(d.company), 'Site / Facility': d.site || '',
          'Inspection Type': d.type || '', 'Linked Record': d.linked || '', 'Compliance': d.compliance || '', 'Findings': d.findings || '', 'Actions Required': d.actions || '',
          'Follow-up Date': dv(d.followUp), 'Latitude': d.lat === undefined ? '' : d.lat, 'Longitude': d.lng === undefined ? '' : d.lng, 'GPS Accuracy (m)': d.acc === undefined ? '' : d.acc,
          'Inspector': d.inspector || u.name, 'Recorded': nowText() };
        if (id) { delete o['Recorded']; setRow(S.INS, find(S.INS, 'Inspection ID', id).rowNo, o); } else add(S.INS, o);
        log(by, id ? 'Updated' : 'Field inspection', S.INS, ins, (d.company || '') + ' – ' + (d.site || '') + ' – ' + (d.compliance || '')); out = ins; break;
      case 'correspondence':
        var cor = id || nextId(S.COR, 'Record ID', 'COR-'), ccid = companyId(d.company);
        var co = { 'Record ID': cor, 'Company ID': ccid, 'Company Name': ccid ? companyName(ccid) : trim(d.company), 'Name as Recorded': d.company || '', 'Type': d.type || '',
          'Activity': d.activity || '', 'Description': d.description || '', 'EPA Reference No.': d.ref || '', 'Date Issued': dv(d.date) };
        if (id) setRow(S.COR, find(S.COR, 'Record ID', id).rowNo, co); else add(S.COR, co);
        log(by, id ? 'Updated' : 'Saved new', S.COR, cor, (d.type || '') + ' – ' + (d.company || '')); out = cor; break;
      case 'chemical': out = addChemical(d.name, d, by); break;
      case 'inboxReject':
        var ib = find(S.INB, 'File ID', d.fid);
        setRow(S.INB, ib.rowNo, { 'Status': 'Rejected', 'Checked by': u.name, 'Checked on': new Date(), 'Notes': ('Rejected: ' + (d.reason || '') + (ib.row['Notes'] ? ' • ' + ib.row['Notes'] : '')).slice(0, 480) });
        log(by, 'Document rejected', S.INB, d.fid, d.reason || ''); out = d.fid; break;
      default: throw new Error('Unknown record type');
    }
    if (d.inboxId && it.type !== 'inboxReject') inbApproved(d.inboxId, out, u);
    return out;
  }
  function saveCompany(d, id, u) {
    var cid = id || nextId(S.CO, 'Company ID', 'CMU-'), name = trim(d.name);
    var o = { 'Company ID': cid, 'Company Name': name, 'Sector / Activity': d.sector || '', 'Location': d.location || '', 'Other Names Recorded': d.other || '' };
    if (id) {
      var f = find(S.CO, 'Company ID', id), old = str(f.row['Company Name']);
      setRow(S.CO, f.rowNo, o);
      if (!eq(old, name)) [S.LIC, S.CLR, S.BIL, S.PAY, S.COR].forEach(function (k) {   // the copied company names (where they are not formulas)
        reg(k).rows.forEach(function (r, i) { if (eq(r['Company ID'], id)) setRow(k, reg(k).rowNo[i], { 'Company Name': name }); });
      });
      log(u.name + ' (mobile)', 'Updated', S.CO, cid, name);
    } else { add(S.CO, o); log(u.name + ' (mobile)', 'Saved new', S.CO, cid, name); }
    if (d.contact || d.email || d.phone || d.title || d.remind) try { saveContact(cid, name, d); } catch (e) { }
    return cid;
  }
  function saveLicence(d, id, u) {
    var lid = id || nextId(S.LIC, 'Record ID', 'LIC-'), coId = companyId(d.company), co = companyName(coId);
    var o = { 'Record ID': lid, 'Company ID': coId, 'Company Name': co, 'Name as Recorded': d.asRecorded || co, 'Licence Category': d.category || '', 'Licence / Certificate Type': d.type || '',
      'Location': d.location || '', 'Application Date': dv(d.appDate), 'Response Date': dv(d.respDate), 'Reference Code': d.ref || '', 'Licence / Certificate No.': d.no || '',
      'Date Issued': dv(d.issued), 'Expiry Date': dv(d.expiry), 'Remarks': d.remarks || '', 'Bill No.': d.billNo || '' };
    if (id) { setRow(S.LIC, find(S.LIC, 'Record ID', id).rowNo, o); [S.LCH, S.LVE, S.LEF].forEach(function (k) { delRows(k, function (r) { return eq(r['Licence Record ID'], id); }); }); }
    else { o['Source'] = src(u); add(S.LIC, o); }
    var base = { 'Licence Record ID': lid, 'Licence No.': d.no || '', 'Company': co };
    var put = function (k, x) { var y = {}; Object.keys(base).forEach(function (q) { y[q] = base[q]; }); Object.keys(x).forEach(function (q) { y[q] = x[q]; }); add(k, y); };
    (d.chems || []).filter(function (c) { return trim(c.name); }).forEach(function (c) {
      put(S.LCH, { 'Trade or IUPAC Name': c.name, 'EPA Registration No.': c.reg || '', 'Type': c.type || '', 'Stipulated Qty': isNum(c.qty) ? num(c.qty) : (c.qty || ''), 'Unit': c.unit || '', 'Consignment Ref. (BL/IPD No.)': c.cons || '' });
    });
    (d.vehicles || []).filter(function (v) { return trim(v.type) || trim(v.reg); }).forEach(function (v) { put(S.LVE, { 'Vehicle Type': v.type || '', 'Vehicle Registration No.': v.reg || '', 'EPA Registration No.': v.epa || '' }); });
    var e = d.eff || {};
    [['Receiving water', e.water], ['Max. volume (m³/day)', e.volume], ['Discharge point / facility', e.point]].forEach(function (s, i) { if (trim(s[1])) put(S.LEF, { 'Section': 'Setting', 'Line': i + 1, 'Field 1': s[0], 'Field 2': String(s[1]) }); });
    (e.limits || []).filter(function (x) { return trim(x.param); }).forEach(function (x, i) { put(S.LEF, { 'Section': 'Limit', 'Line': i + 1, 'Field 1': x.param, 'Field 2': x.unit || '', 'Field 3': String(x.limit || ''), 'Field 4': x.sample || '', 'Field 5': x.schedule || '', 'Field 6': x.stage || '' }); });
    (e.coords || []).filter(function (x) { return trim(x.vertex) || trim(x.e); }).forEach(function (x, i) { put(S.LEF, { 'Section': 'Coordinate', 'Line': i + 1, 'Field 1': x.table || '1A', 'Field 2': x.vertex || '', 'Field 3': String(x.e || ''), 'Field 4': String(x.n || '') }); });
    (e.sources || []).filter(function (x) { return trim(x.source); }).forEach(function (x, i) { put(S.LEF, { 'Section': 'Source', 'Line': i + 1, 'Field 1': x.source, 'Field 2': x.unit || '', 'Field 3': String(x.x || ''), 'Field 4': String(x.y || '') }); });
    log(u.name + ' (mobile)', id ? 'Updated' : 'Saved new', S.LIC, lid, co + ' – ' + (d.type || d.category) + (d.no ? ' ' + d.no : '') + ' – ' + (d.chems || []).length + ' chemical(s)');
    return lid;
  }
  function saveClearance(d, id, u) {
    var cln = id || nextId(S.CLR, 'Clearance No.', 'CLN-'), coId = companyId(d.company), co = companyName(coId), keep = [];
    if (id) { reg(S.CLR).rows.forEach(function (r) { if (eq(r['Clearance No.'], id)) keep.push(str(r['Record ID'])); }); delRows(S.CLR, function (r) { return eq(r['Clearance No.'], id); }); }
    var next = parseInt(nextId(S.CLR, 'Record ID', 'CLR-').slice(4), 10), n = 0;
    (d.lines || []).forEach(function (l) {
      var rec = trim(l.rec) || trim(l.std); if (!rec) return;
      var kg = toKg(l.qty, l.unit);
      add(S.CLR, { 'Record ID': keep.length ? keep.shift() : 'CLR-' + pad(next++), 'Clearance No.': cln, 'Company ID': coId, 'Company Name': co, 'Chemical as Recorded': rec, 'Chemical (Standard)': l.std || '',
        'Qty as Recorded': isNum(l.qty) ? num(l.qty) : (l.qty || ''), 'Unit': l.unit || '', 'Qty (kg)': kg === null ? '' : kg, 'Qty (MT)': kg === null ? '' : kg / 1000,
        'B/L / Invoice / AWB No.': trim(l.bl) || d.bl || '', 'Clearance Ref. No.': d.ref || '', 'Clearance Date': dv(d.date), 'ETA': dv(d.eta), 'Remarks': d.remarks || '', 'Source': src(u), 'Bill No.': d.billNo || '' });
      n++;
    });
    log(u.name + ' (mobile)', id ? 'Updated' : 'Saved new', S.CLR, cln, co + ' – ' + n + ' chemical line(s)');
    return cln;
  }
  function saveBill(d, id, u) {
    var yr = (date(d.date) || today()).getFullYear(), bn = id || nextId(S.BIL, 'Bill No.', 'BN-' + yr + '-'), coId = companyId(d.company), C = companyRow(coId) || {}, co = str(C['Company Name']), keep = [];
    if (id) { reg(S.BIL).rows.forEach(function (r) { if (eq(r['Bill No.'], id)) keep.push(str(r['Bill ID'])); }); delRows(S.BIL, function (r) { return eq(r['Bill No.'], id); }); }
    var next = parseInt(nextId(S.BIL, 'Bill ID', 'BIL-').slice(4), 10);
    (d.lines || []).filter(function (l) { return trim(l.service); }).forEach(function (l) {
      add(S.BIL, { 'Bill ID': keep.length ? keep.shift() : 'BIL-' + pad(next++), 'Bill No.': bn, 'Company ID': coId, 'Company Name': co, 'Name as Recorded': d.asRecorded || co,
        'Activity': d.activity || str(C['Sector / Activity']), 'Location': d.location || str(C['Location']), 'Purpose / Licence Billed': l.service, 'Chemical': l.details || '',
        'Amount Billed (USD)': num(l.amount), 'Bill Date': dv(d.date), 'Bill Type': d.type || '', 'Bill Ref. No.': d.ref || '', 'Contact Person': d.contact || '', 'Contact Title': d.title || '',
        'Linked Record': d.linked || '', 'Source': src(u) });
    });
    String(d.linked || '').split(/[,;\s]+/).filter(String).forEach(function (rec) {
      if (/^CLN-/i.test(rec)) reg(S.CLR).rows.forEach(function (r, i) { if (eq(r['Clearance No.'], rec) && !trim(r['Bill No.'])) setRow(S.CLR, reg(S.CLR).rowNo[i], { 'Bill No.': bn }); });
      else { var f = find(S.LIC, 'Record ID', rec); if (f && !trim(f.row['Bill No.'])) setRow(S.LIC, f.rowNo, { 'Bill No.': bn }); }
    });
    var tot = (d.lines || []).reduce(function (a, l) { return a + (trim(l.service) ? num(l.amount) : 0); }, 0);
    log(u.name + ' (mobile)', id ? 'Updated' : 'Saved new', S.BIL, bn, co + ' – ' + (d.type || '') + ' – US$' + money(tot));
    return bn;
  }
  function savePayment(d, id, u) {
    var pid = id || nextId(S.PAY, 'Record ID', 'PAY-'), b = trim(d.bill) ? billStatus(d.bill, id) : null, coId = b ? b.coId : companyId(d.company), co = b ? b.co : companyName(coId);
    var o = { 'Record ID': pid, 'Company ID': coId, 'Company Name': co, 'Name as Recorded': d.asRecorded || co, 'Purpose / Services': d.purpose || (b ? b.purpose : ''),
      'Amount (USD)': num(d.amount), 'Payment Date': dv(d.date), 'Receipt No.': d.receipt || '', 'Bill No.': b ? b.no : '', 'Record Group': d.group || 'Form entry', 'Remarks': d.remarks || '' };
    if (id) setRow(S.PAY, find(S.PAY, 'Record ID', id).rowNo, o); else { o['Source'] = src(u); add(S.PAY, o); }
    log(u.name + ' (mobile)', id ? 'Updated' : 'Saved new', S.PAY, pid, co + ' – US$' + money(d.amount) + (b ? ' – ' + b.no : ' – company account'));
    return pid;
  }
  function del(u, d) {
    var K = KIND[d.kind], n = delRows(K[0], function (r) { return eq(r[K[1]], d.id); });
    if (d.kind === 'licence') [S.LCH, S.LVE, S.LEF].forEach(function (k) { n += delRows(k, function (r) { return eq(r['Licence Record ID'], d.id); }); });
    if (d.kind === 'bill') reg(S.PAY).rows.forEach(function (r, i) { if (eq(r['Bill No.'], d.id)) setRow(S.PAY, reg(S.PAY).rowNo[i], { 'Bill No.': '' }); });
    log(u.name + ' (mobile)', 'Deleted', K[0], d.id, (d.reason || '') + ' (' + n + ' row(s))');
    return d.id;
  }

  /* ---------------------------------------------------------------- files: inspection photos, PDFs from the phone */
  function folder(name) {
    var ps = DriveApp.getFileById(ss().getId()).getParents(), parent = ps.hasNext() ? ps.next() : DriveApp.getRootFolder();
    var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name);
  }
  function photo(u, p) {
    var map = {}; reg(S.UPL).rows.forEach(function (r) { map[str(r['Client ID'])] = str(r['Result']); });
    if (map[p.id]) return { ok: true, url: map[p.id] };
    var insId = map[p.inspectionCid]; if (!insId) return { ok: false, error: 'Inspection not uploaded yet.' };
    var url = folder('CMU Inspection Photos').createFile(Utilities.newBlob(Utilities.base64Decode(p.base64), 'image/jpeg', insId + '_' + String(p.id).slice(0, 8) + '.jpg')).getUrl();
    var f = find(S.INS, 'Inspection ID', insId); if (f) setRow(S.INS, f.rowNo, { 'Photos': str(f.row['Photos']) ? str(f.row['Photos']) + '\n' + url : url });
    plainSheet('Mobile Uploads').appendRow([p.id, 'photo', url, new Date(), u.name]);
    return { ok: true, url: url };
  }
  function file(u, f) {
    if (!f.base64 || !f.name) return { ok: false, error: 'No file.' };
    var name = String(f.name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    var x = folder('CMU Documents').createFile(Utilities.newBlob(Utilities.base64Decode(f.base64), f.mime || 'application/pdf', name));
    log(u.name + ' (mobile)', 'Document saved', 'Drive', f.record || '', name);
    return { ok: true, url: x.getUrl(), id: x.getId() };
  }

  /* ---------------------------------------------------------------- QR check: the same codes as the printed desktop documents */
  function parseCode(code) {
    var s = String(code || ''), q = s.match(/[?&]id=([^&]+)/), t = s.match(/[?&]t=([0-9A-Fa-f]+)/), v = s.match(/[?&]v=(\w+)/), id, tok;
    if (q && t) { id = decodeURIComponent(q[1]).toUpperCase(); tok = t[1].toUpperCase(); }
    else { var m = s.toUpperCase().replace(/\s+/g, ' ').match(/((?:LIC|CLN)-\d{3,}|BN-\d{4}-\d{3,})-([0-9A-F]{10})\b/); if (m) { id = m[1]; tok = m[2]; } }
    if (!id || !tok) return null;
    var kind = v ? (v[1] === 'clearance' ? 'clearance' : v[1] === 'bill' ? 'bill' : 'licence') : /^CLN/.test(id) ? 'clearance' : /^BN-/.test(id) ? 'bill' : 'licence';
    return { id: id, tok: tok, kind: kind };
  }
  function verify(u, code) {
    var c = parseCode(code);
    if (!c) return { ok: true, genuine: false, message: 'This is not a CMU verification code.' };
    var info = QR_Token_(c.kind, c.id) === c.tok ? QR_Lookup_(c.kind, c.id) : null;
    log(u.name + ' (mobile)', 'Document checked', c.kind, c.id, info ? 'GENUINE – ' + info.status : 'NOT RECOGNISED');
    if (!info) return { ok: true, genuine: false, id: c.id, kind: c.kind, message: 'NOT RECOGNISED – this code was not issued by the CMU Database.' };
    return { ok: true, genuine: true, id: c.id, kind: c.kind, status: info.status, valid: info.ok, lines: info.lines };
  }

  /* ================================================================ CLAUDE – uses the key, model, budget and usage log of Claude.gs */
  var AI_STRONG = 'claude-sonnet-5-5', AI_FAST = 'claude-haiku-4-5-20251001';
  var AI_FILE_TYPES = { 'application/pdf': 'document', 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image' };
  function aiKey() { return P().getProperty('CLAUDE_API_KEY') || ''; }
  function aiSpent() { return parseFloat(P().getProperty('CLAUDE_SPEND_' + Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM')) || '0') || 0; }
  function aiCall(body, kind) {
    if (typeof CLAUDE_call_ !== 'function') return { error: 'Claude.gs is not in this Apps Script project.' };
    if (!aiKey()) return { error: 'Claude is not set up yet: an admin adds the Anthropic API key (app ▸ More ▸ Admin, or Claude ▸ Settings in the sheet).' };
    return CLAUDE_call_(body, null, kind);
  }
  function aiText(r) { return (r.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim(); }
  function aiPick(choice, message, hasFile) {
    if (choice && choice !== 'auto') return choice;
    if (hasFile) return AI_STRONG;
    var m = String(message || '');
    if (m.length > 160 || /fill|record|enter|regist|add |create|bill|invoice|letter|draft|check|analy|compar|summar|report|why|explain|quota|fee|calculat|price|document|attach/i.test(m)) return AI_STRONG;
    return AI_FAST;
  }
  function aiCompany(name) {
    var r = companyRow(name); if (r) return { id: str(r['Company ID']), name: str(r['Company Name']) };
    var s = similar(name); if (s.length && s[0].score >= 0.8) return { id: s[0].id, name: s[0].name, warn: '"' + name + '" matched to ' + s[0].name + ' (' + Math.round(s[0].score * 100) + '% similar) – check it.' };
    return { id: '', name: '', warn: '"' + name + '" is not registered.' };
  }
  function stdChem(name, n) {
    var k = key(name), list = named('lstChemical');
    return list.map(function (c) { var kc = key(c), sc = dice(k, kc); if (kc && k && (kc.indexOf(k) >= 0 || k.indexOf(kc) >= 0)) sc = Math.max(sc, 0.85); return { name: c, score: Math.round(sc * 100) / 100 }; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, n || 3);
  }
  function words(amt) {
    var ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'], tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    var w999 = function (n) { var s = ''; if (n >= 100) { s = ones[Math.floor(n / 100)] + ' HUNDRED'; n %= 100; if (n) s += ' '; } if (n >= 20) { s += tens[Math.floor(n / 10)]; if (n % 10) s += '-' + ones[n % 10]; } else if (n) s += ones[n]; return s; };
    var r = Math.round(num(amt) * 100) / 100, dd = Math.floor(r), c = Math.round((r - dd) * 100), scl = ['', ' THOUSAND', ' MILLION', ' BILLION'], s = '', i = 0;
    while (dd > 0 && i < 4) { var ch = dd % 1000; if (ch) s = w999(ch) + scl[i] + (s ? ' ' + s : ''); dd = Math.floor(dd / 1000); i++; }
    s = s || 'ZERO'; if (c > 0) s += ' AND ' + (c < 10 ? '0' + c : c) + '/100'; return s;
  }
  function aiFee(items) {
    var cats = feeCats(), hz = hazards(), total = 0;
    var lines = (items || []).map(function (it) {
      var std = it.chemical_standard || (stdChem(it.chemical, 1)[0] || {}).name, h = hz.filter(function (r) { return eq(r.name, std); })[0] || {};
      var hm = isNum(it.hmis) ? num(it.hmis) : isNum(h.hmis) ? num(h.hmis) : null, cn = it.category || h.cat || '', cat = cats.filter(function (x) { return eq(x[0], cn); })[0], hi = HI.filter(function (x) { return x[0] === hm; })[0], kg = toKg(it.quantity, it.unit);
      var o = { chemical: it.chemical, standard: std, category: cat ? cat[0] : cn, hmis: hm };
      if (!cat) o.missing = 'fee category'; else if (hm === null) o.missing = 'HMIS rating'; else if (!hi) o.missing = 'HMIS must be 0-4'; else if (kg === null) o.missing = 'quantity/unit';
      else { var q = cat[1] === 'MT' ? kg / 1000 : kg; o.fee = Math.round(cat[2] * hi[1] * q * 100) / 100; o.working = cat[2] + ' × ' + hi[1] + ' × ' + q + ' ' + cat[1] + ' = US$' + money(o.fee); total += o.fee; }
      return o;
    });
    return { lines: lines, total: Math.round(total * 100) / 100, total_words: words(total) + ' UNITED STATES DOLLARS', rule: 'RI/C&E-002-04/20: Qp = R × Hi × Qi' };
  }
  function aiFind(text) {
    var q = trim(text).toLowerCase().split(/\s+/).filter(String), out = []; if (!q.length) return out;
    [S.CO, S.LIC, S.CLR, S.BIL, S.PAY, S.ISS, S.COR, S.INS].forEach(function (k) {
      reg(k).rows.forEach(function (r) {
        if (out.length >= 40) return;
        var hay = Object.keys(r).map(function (h) { return str(r[h]); }).join(' ').toLowerCase();
        if (q.every(function (w) { return hay.indexOf(w) >= 0; })) { var o = { register: regName(k) }; Object.keys(r).forEach(function (h) { if (trim(r[h]) !== '') o[h] = ser(r[h]); }); out.push(o); }
      });
    });
    return out;
  }
  function aiSummary(name) {
    var c = aiCompany(name); if (!c.id) return { error: c.warn };
    var C = companyRow(c.id), o = {}; Object.keys(C).forEach(function (h) { o[h] = ser(C[h]); });
    var byYear = {}, byChem = {};
    reg(S.CLR).rows.filter(function (r) { return eq(r['Company ID'], c.id); }).forEach(function (r) { var dd = date(r['Clearance Date']), y = dd ? dd.getFullYear() : 'no date', ch = str(r['Chemical (Standard)']) || str(r['Chemical as Recorded']); byYear[y] = (byYear[y] || 0) + num(r['Qty (kg)']); byChem[ch] = (byChem[ch] || 0) + num(r['Qty (kg)']); });
    return { company: o, licences: reg(S.LIC).rows.filter(function (r) { return eq(r['Company ID'], c.id); }).map(function (r) { return { id: str(r['Record ID']), type: str(r['Licence / Certificate Type']), no: str(r['Licence / Certificate No.']), issued: iso(date(r['Date Issued'])), expiry: iso(date(r['Expiry Date'])), status: str(r['Status']) }; }),
      bills: bills().filter(function (b) { return b.coId === c.id; }), payments: reg(S.PAY).rows.filter(function (r) { return eq(r['Company ID'], c.id); }).map(function (r) { return { id: str(r['Record ID']), amount: num(r['Amount (USD)']), date: iso(date(r['Payment Date'])), receipt: str(r['Receipt No.']), bill: str(r['Bill No.']) }; }),
      cleared_kg_by_year: byYear, cleared_kg_by_chemical: byChem, quotas: quotas([]).rows.filter(function (q) { return q.coId === c.id; }), note: c.warn || '' };
  }
  function aiFill(form, d) {
    d = JSON.parse(JSON.stringify(d || {})); var warn = [];
    if (d.company) { var c = aiCompany(d.company); if (c.name) d.company = c.name; if (c.warn) warn.push(c.warn); }
    if (form === 'clearance') (d.lines || []).forEach(function (l) { if (!l.chemical_standard && l.chemical_as_recorded) { var s = stdChem(l.chemical_as_recorded, 1)[0]; if (s && s.score >= 0.6) l.chemical_standard = s.name; } });
    if (form === 'payment' && d.bill_no && !billStatus(d.bill_no)) warn.push('Bill ' + d.bill_no + ' was not found.');
    return { ok: true, form: form, data: d, warnings: warn, note: 'The form is now open on the phone with these values. Nothing is saved until the officer checks it and taps Save.' };
  }
  var TOOLS = [
    { name: 'cmu_alerts', description: 'Licences expiring soon or recently expired (not renewed), unpaid bills with age and outstanding amount, and quota problems.', input_schema: { type: 'object', properties: {} } },
    { name: 'cmu_lists', description: 'Valid drop-down values: licence categories and types, sectors, units, standard chemical names, bill types, services with suggested fees, registered companies. Use before filling a form.', input_schema: { type: 'object', properties: {} } },
    { name: 'find_records', description: 'Search every register by any text: name, ID, licence no., B/L, receipt no.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'company_summary', description: 'Everything about one company: details, licences, bills with outstanding amounts, payments, quantities cleared by year and chemical, quotas.', input_schema: { type: 'object', properties: { company: { type: 'string' } }, required: ['company'] } },
    { name: 'quota_status', description: 'Licensed import quantities (CIL) vs quantities cleared, chemicals cleared but not on the licence, clearances with no valid licence. Optional company filter.', input_schema: { type: 'object', properties: { company: { type: 'string' } } } },
    { name: 'calculate_fee', description: 'Chemical importation fee under RI/C&E-002-04/20 (Qp = R × Hi × Qi). HMIS rating and fee category come from the Chemical Hazards sheet unless given; never invent them.',
      input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { chemical: { type: 'string' }, chemical_standard: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' }, category: { type: 'string' }, hmis: { type: 'number' } }, required: ['chemical', 'quantity', 'unit'] } } }, required: ['items'] } },
    { name: 'standardise_chemicals', description: 'Suggest the closest standard chemical names for free-text names, with a score 0-1.', input_schema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] } },
    { name: 'fill_form', description: 'Open one CMU form on the phone, filled in, for the officer to check and save (it does NOT save). Dates yyyy-mm-dd. Fields:\n' +
      '- company: name, sector, location, other_names, contact_person, contact_title, phone, email\n- licence: company, category, type, location, application_date, response_date, reference_code, licence_no, date_issued, expiry_date, remarks, chemicals[{name, epa_registration_no, type, quantity, unit, consignment_ref}]\n' +
      '- clearance: company, date, epa_ref, bl_no, remarks, eta, lines[{chemical_as_recorded, chemical_standard, quantity, unit, bl_no}]\n- bill: company, date, bill_type, bill_ref, contact_person, contact_title, lines[{service, details, amount}]\n- payment: bill_no, company, amount, date, receipt_no, purpose, remarks\n- issue: register, record, issue, action',
      input_schema: { type: 'object', properties: { form: { type: 'string', enum: ['company', 'licence', 'clearance', 'bill', 'payment', 'issue'] }, data: { type: 'object' } }, required: ['form', 'data'] } }
  ];
  function runTool(name, inp, forms) {
    if (name === 'cmu_alerts') { var B = bills(); return { licences: insights().alerts, unpaid_bills: B.filter(function (b) { return !b.isPaid; }), quota_problems: quotas([]).rows.filter(function (q) { return q.status !== 'OK'; }).slice(0, 40) }; }
    if (name === 'cmu_lists') return { categories: named('lstLicCategory'), types: named('lstLicType'), sectors: named('lstSector'), units: named('lstUnit'), chemicals: named('lstChemical'),
      billTypes: tableObjs('tblBillTypes').map(function (r) { return r['Bill Type'] + ' (' + r['Bill Group'] + ')'; }), services: tableObjs('tblServices').map(function (r) { return r['Service'] + ' | ' + r['Bill Group'] + (r['Suggested Fee (USD)'] !== '' ? ' | US$' + r['Suggested Fee (USD)'] : ''); }),
      companies: reg(S.CO).rows.map(function (r) { return str(r['Company ID']) + ' | ' + str(r['Company Name']); }) };
    if (name === 'find_records') return aiFind(inp.text);
    if (name === 'company_summary') return aiSummary(inp.company);
    if (name === 'quota_status') { var Q = quotas([]), co = inp.company ? aiCompany(inp.company).id : ''; return { quotas: Q.rows.filter(function (q) { return !co || q.coId === co; }), not_on_licence: Q.notOn.filter(function (x) { return !co || x.line.coId === co; }).map(function (x) { return { clearance: x.line.cln, company: x.line.co, chemical: x.line.rec, kg: x.line.kg, licence: x.lic.id }; }), without_valid_cil: Q.noLic.filter(function (x) { return !co || x.coId === co; }).length }; }
    if (name === 'calculate_fee') return aiFee(inp.items);
    if (name === 'standardise_chemicals') return (inp.names || []).slice(0, 50).map(function (n) { return { name: n, suggestions: stdChem(n, 3) }; });
    if (name === 'fill_form') { var f = aiFill(inp.form, inp.data); forms.push({ form: f.form, data: f.data, warnings: f.warnings }); return f; }
    return { error: 'Unknown tool ' + name };
  }
  function aiSystem() {
    return 'You are Claude, the assistant inside the CMU Database Android app of the EPA Liberia ERRS Chemical Management Unit (CMU). The data is the Google Sheet "' + ss().getName() + '" (registers: Companies, Licences & Certificates with Licence Chemicals / Vehicles / Effluent, Chemical Clearances grouped by Clearance No., Bills & Invoices grouped by Bill No., Payments & Receipts, Notes & Issues, Correspondence, Field Inspections).\n' +
      'Use the tools before answering; never guess figures; quote record IDs. The officer reads on a phone: be concise, short paragraphs or simple lists.\n' +
      'RULES\n- To add or record something, call fill_form; then say plainly that the form is open and NOTHING IS SAVED until the officer checks it and taps Save.\n' +
      '- Never invent licence numbers, EPA reference numbers, receipt numbers, amounts, dates or HMIS ratings. If something is missing or unreadable, say so.\n' +
      '- Fees follow RI/C&E-002-04/20: Qp = R × Hi × Qi; per-kg categories in kg, Explosives and Sodium Cyanide in MT. Use calculate_fee.\n' +
      '- When a document is attached, copy quantities, units and reference numbers exactly as written.\nToday is ' + Utilities.formatDate(new Date(), TZ, 'd MMMM yyyy') + '.';
  }
  function aiChat(u, history, message, f, choice) {
    if (!trim(message)) return { ok: false, error: 'Type a question.' };
    var msgs = (history || []).slice(-20).map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }; }), content = message;
    if (f && f.data) {
      var kind = AI_FILE_TYPES[String(f.mime || '').toLowerCase()];
      if (!kind) return { ok: false, error: 'Claude can read PDF, JPG, PNG, WEBP and GIF files.' };
      content = [{ type: kind, source: { type: 'base64', media_type: String(f.mime).toLowerCase(), data: f.data } }, { type: 'text', text: '[Attached: ' + (f.name || 'file') + ']\n' + message }];
    }
    var model = aiPick(choice || P().getProperty('CLAUDE_MODEL') || 'auto', message, !!(f && f.data)), turn = msgs.concat([{ role: 'user', content: content }]);
    var tools = JSON.parse(JSON.stringify(TOOLS)); tools[tools.length - 1].cache_control = { type: 'ephemeral' };
    var system = [{ type: 'text', text: aiSystem(), cache_control: { type: 'ephemeral' } }], forms = [], usage = { cost: 0 }, finalText = '';
    for (var round = 0; round < 12; round++) {
      var resp = aiCall({ model: model, max_tokens: 4096, system: system, tools: tools, messages: turn }, f && f.data ? 'document (mobile)' : 'chat (mobile)');
      if (resp.error) return { ok: false, error: resp.error };
      usage.cost += resp._cost || 0;
      turn.push({ role: 'assistant', content: resp.content });
      finalText = aiText(resp) || finalText;
      var uses = (resp.content || []).filter(function (b) { return b.type === 'tool_use'; });
      if (resp.stop_reason !== 'tool_use' || !uses.length) break;
      turn.push({ role: 'user', content: uses.map(function (t) {
        var o; try { o = runTool(t.name, t.input || {}, forms); } catch (e) { o = { error: e.message }; }
        var s = JSON.stringify(o); if (s.length > 120000) s = s.slice(0, 120000) + '… [truncated]';
        return { type: 'tool_result', tool_use_id: t.id, content: s, is_error: !!(o && o.error) };
      }) });
    }
    usage.model = model; usage.month = aiSpent(); usage.budget = parseFloat(P().getProperty('CLAUDE_BUDGET') || '0') || 0;
    return { ok: true, reply: finalText || '(no answer)', forms: forms, usage: usage };
  }

  /* ---- Document Inbox: read a document (from the phone, or from the Drive folder via Code.gs) */
  var INB_TOOL = { name: 'record_document', description: 'Record what this document is and the values for the matching CMU form.',
    input_schema: { type: 'object', properties: { doc_type: { type: 'string', enum: ['clearance', 'licence', 'payment', 'bill', 'company', 'other'] }, company: { type: 'string' }, summary: { type: 'string' },
      confidence: { type: 'number' }, data: { type: 'object' }, issues: { type: 'array', items: { type: 'string' } } }, required: ['doc_type', 'summary', 'confidence', 'data'] } };
  function inbSystem() {
    return 'You read documents for the Chemical Management Unit (CMU) of the EPA of Liberia and ALWAYS answer by calling the tool record_document exactly once.\n' +
      'doc_type: clearance (commercial invoice, bill of lading, airway bill, packing list, clearance application), licence (application or issued licence / certificate), payment (official receipt, bank slip, transfer), bill (EPA bill letter), company (business registration), other.\n' +
      'data fields (dates yyyy-mm-dd; quantities as numbers; units kg, MT, L or pcs; amounts in US$):\n' +
      '- clearance: company, date, epa_ref, bl_no, remarks, eta, lines[{chemical_as_recorded, chemical_standard, quantity, unit, bl_no}]\n' +
      '- licence: company, category, type, location, application_date, response_date, reference_code, licence_no, date_issued, expiry_date, remarks, chemicals[{name, epa_registration_no, type, quantity, unit, consignment_ref}]\n' +
      '- payment: bill_no, company, purpose, amount, date, receipt_no, remarks\n- bill: company, date, bill_type, bill_ref, contact_person, contact_title, lines[{service, details, amount}]\n- company: name, sector, location, contact_person, phone, email\n' +
      'Copy values exactly; never invent a value – leave it out and add an issue. Put the importer (not the supplier or shipping line) as company. Lower the confidence for handwriting, blurred scans or missing key fields.\n' +
      'Standard chemical names: ' + named('lstChemical').join('; ') + '\nRegistered companies: ' + reg(S.CO).rows.map(function (r) { return str(r['Company Name']); }).join('; ');
  }
  function inbRead(b64, mime, name, hint) {
    var out = aiCall({ model: AI_STRONG, max_tokens: 4000, system: [{ type: 'text', text: inbSystem(), cache_control: { type: 'ephemeral' } }], tools: [INB_TOOL],
      messages: [{ role: 'user', content: [{ type: AI_FILE_TYPES[mime] || 'document', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: 'File name: ' + name + (hint ? '\nThe officer says: ' + hint : '') + '\nRead this document and record it with record_document.' }] }] }, 'inbox');
    if (out.error) throw new Error(out.error);
    var tu = (out.content || []).filter(function (b) { return b.type === 'tool_use'; })[0], r = tu ? tu.input || {} : null;
    if (!r) { var t = aiText(out), m = t.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch (e) { r = null; } }
    if (!r) throw new Error('Claude did not return the fields');
    r.doc_type = ['clearance', 'licence', 'payment', 'bill', 'company'].indexOf(r.doc_type) >= 0 ? r.doc_type : 'other';
    if (r.data && r.data.company) { var c = aiCompany(r.data.company); if (c.name) r.data.company = c.name; else (r.issues = r.issues || []).push(c.warn); }
    return r;
  }
  function readUpload(u, f, hint) {
    var mime = String(f.mime || '').toLowerCase();
    if (!AI_FILE_TYPES[mime]) return { ok: false, error: 'Use a PDF or a photo (JPG / PNG).' };
    var x = INB_Sub_('Read').createFile(Utilities.newBlob(Utilities.base64Decode(f.data), mime, f.name || ('Phone ' + nowText() + (mime === 'application/pdf' ? '.pdf' : '.jpg'))));
    var row = { 'Received': new Date(), 'Source': 'Phone (' + u.name + ')', 'File name': x.getName(), 'File': '=HYPERLINK("' + x.getUrl() + '","open")', 'File ID': x.getId(), 'Status': 'To review' };
    var r;
    try { r = inbRead(f.data, mime, x.getName(), hint); }
    catch (e) { row.Status = 'Not read'; row.Notes = 'Could not read it: ' + e.message; add(S.INB, row); return { ok: false, error: row.Notes, fid: x.getId() }; }
    row.Type = r.doc_type; row.Company = (r.data && r.data.company) || r.company || ''; row.Summary = r.summary || ''; row.Confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0));
    row.Data = JSON.stringify(r.data || {}); row.Notes = (r.issues || []).join(' • ').slice(0, 480); row.Status = r.doc_type === 'other' || row.Confidence < 0.6 ? 'Needs attention' : 'To review';
    add(S.INB, row);
    log(u.name + ' (mobile)', 'Document read by Claude', S.INB, x.getId(), x.getName() + ' – ' + r.doc_type);
    return { ok: true, fid: x.getId(), url: x.getUrl(), type: r.doc_type, company: row.Company, summary: r.summary || '', confidence: row.Confidence, issues: r.issues || [], data: r.data || {} };
  }
  function inbApproved(fid, rec, u) {
    var f = find(S.INB, 'File ID', fid); if (!f) return;
    setRow(S.INB, f.rowNo, { 'Status': 'Approved', 'Record ID': rec, 'Checked by': u.name, 'Checked on': new Date() });
    try { DriveApp.getFileById(fid).moveTo(INB_Sub_(trim(f.row['Company']) || 'Other', INB_Sub_('Processed'))); } catch (e) { }
  }

  /* ================================================================ ADMIN (app ▸ More ▸ Admin; the PIN is asked once one is set) */
  function trigger(fn, make) { var t = ScriptApp.getProjectTriggers().filter(function (x) { return x.getHandlerFunction() === fn; }); if (make && !t.length) make(); if (!make) t.forEach(function (x) { ScriptApp.deleteTrigger(x); }); }
  var TOGGLES = {
    reminders: { on: function () { trigger('REM_Weekly', function () { ScriptApp.newTrigger('REM_Weekly').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create(); }); try { ss().getSheetByName('Company Contacts').getRange('C3').setValue('ON'); } catch (e) { } },
      off: function () { trigger('REM_Weekly'); try { ss().getSheetByName('Company Contacts').getRange('C3').setValue('OFF'); } catch (e) { } } },
    calendar: { on: function () { trigger('CAL_Daily', function () { ScriptApp.newTrigger('CAL_Daily').timeBased().everyDays(1).atHour(6).create(); }); try { CAL_Sync_(); } catch (e) { } }, off: function () { trigger('CAL_Daily'); } },
    backup: { on: function () { trigger('BAK_Weekly', function () { ScriptApp.newTrigger('BAK_Weekly').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).create(); }); }, off: function () { trigger('BAK_Weekly'); } },
    inbox: { on: function () { INB_Folder_(); trigger('INB_Poll', function () { ScriptApp.newTrigger('INB_Poll').timeBased().everyMinutes(10).create(); }); }, off: function () { trigger('INB_Poll'); } }
  };
  function admin(u, b) {
    var op = b.op;
    if (op === 'status') { var c = {}; Object.keys(TABLES).forEach(function (k) { try { c[regName(TABLES[k])] = reg(TABLES[k]).rows.length; } catch (e) { c[regName(TABLES[k])] = 'missing'; } }); return { ok: true, server: serverInfo(), counts: c, models: (typeof CLAUDE_MODELS === 'object' ? CLAUDE_MODELS : [['auto', 'Auto']]) }; }
    if (op === 'unlock') return pinOk(b.pin) ? { ok: true, admin: true } : { ok: false, error: 'Wrong Admin PIN.' };
    if (!u.admin) return { ok: false, error: 'This needs the Admin PIN.' };
    if (op === 'setPin') {
      var np = trim(b.newPin);
      if (np && !/^\d{4,8}$/.test(np)) return { ok: false, error: 'The PIN must be 4 to 8 digits.' };
      if (np) P().setProperty('MOB_ADMIN_PIN', np); else P().deleteProperty('MOB_ADMIN_PIN');
      log(u.name + ' (mobile)', np ? 'Mobile admin PIN changed' : 'Mobile admin PIN removed', 'Settings', '', ''); return { ok: true, pinSet: !!np };
    }
    if (op === 'ai') {
      if (b.key) { var key0 = String(b.key).trim(), t = CLAUDE_call_({ model: AI_FAST, max_tokens: 5, messages: [{ role: 'user', content: 'Reply OK' }] }, key0, 'key test'); if (t.error) return { ok: false, error: 'The key did not work: ' + t.error }; P().setProperty('CLAUDE_API_KEY', key0); }
      if (b.model) P().setProperty('CLAUDE_MODEL', b.model);
      if (b.budget !== undefined) { var bu = parseFloat(String(b.budget).replace(/[^\d.]/g, '')); if (bu > 0) P().setProperty('CLAUDE_BUDGET', String(bu)); else P().deleteProperty('CLAUDE_BUDGET'); }
      log(u.name + ' (mobile)', 'Claude settings changed', 'Settings', '', b.key ? 'new key' : ''); return { ok: true, server: serverInfo() };
    }
    if (op === 'setting') {
      var I = ss().getSheetByName('Insights');
      if (b.key === 'Alert: days before expiry' && I) I.getRange('B3').setValue(num(b.value));
      else if (b.key === 'Alert: days after expiry' && I) I.getRange('D3').setValue(num(b.value));
      return { ok: true };
    }
    if (op === 'toggle') { var tg = TOGGLES[b.feature]; if (!tg) return { ok: false, error: 'Unknown feature' }; (b.on ? tg.on : tg.off)(); log(u.name + ' (mobile)', b.feature + (b.on ? ' switched on' : ' switched off'), 'Settings', '', ''); return { ok: true, server: serverInfo() }; }
    if (op === 'run') {
      if (b.feature === 'reminders') { var R = REM_Send_(REM_Plan_()); return { ok: true, result: R.sent + ' reminder e-mail(s) sent' + (R.fails.length ? ', ' + R.fails.length + ' failed' : '') + '.' }; }
      if (b.feature === 'calendar') { var cr = CAL_Sync_(); return { ok: true, result: typeof cr === 'string' ? cr : 'Calendar updated.' }; }
      if (b.feature === 'backup') { var br = BAK_Now_('from the app (' + u.name + ')'); return { ok: true, result: typeof br === 'string' ? br : 'Backup made in Drive.' }; }
      if (b.feature === 'inbox') { var ir = INB_Poll() || {}; return { ok: true, result: ir.busy ? 'The inbox is being read already.' : (ir.read || 0) + ' file(s) read.' }; }
      if (b.feature === 'fill') return { ok: true, result: 'The CMU Database fills IDs and names with its own formulas – nothing to do.' };
      return { ok: false, error: 'Unknown feature' };
    }
    if (op === 'chemSync') { var cs = chemSync(!!b.apply); return { ok: true, added: cs.added, fixed: cs.fixed, result: b.apply ? cs.added.length + ' chemical name(s) added' + (cs.fixed ? ', ' + cs.fixed + ' clearance line(s) standardised' : '') + '.' : cs.added.length + ' name(s) would be added.' }; }
    if (op === 'remPlan') { var pl = REM_Plan_(); return { ok: true, plan: pl.plan.map(function (g) { return { coId: g.coId, co: g.co, to: g.to, licences: g.lic.length, bills: g.bills.length }; }) }; }
    if (op === 'notify') { if (trim(b.email)) P().setProperty('INB_NOTIFY', trim(b.email)); else P().deleteProperty('INB_NOTIFY'); return { ok: true }; }
    return { ok: false, error: 'Unknown admin action' };
  }

  /* ================================================================ set-up (run MOB_Setup once from the editor) */
  function setup() {
    var s = ss();
    P().setProperty('CMU_SSID', s.getId());           // Code.gs needs it to open the sheet from the web app
    var problems = [];
    if (typeof T_ !== 'function' || typeof META !== 'object') problems.push('Code.gs (the CMU Database script) is not in this Apps Script project. Open the CMU DATABASE sheet ▸ Extensions ▸ Apps Script and add MobileAPI as a NEW file there.');
    else ['tblCompanies', 'tblLicences', 'tblLicenceChemicals', 'tblLicenceVehicles', 'tblLicenceEffluent', 'tblClearances', 'tblBills', 'tblPayments', 'tblIssues', 'tblCorrespondence'].forEach(function (k) { try { T_(k); } catch (e) { problems.push(e.message); } });
    if (typeof QR_Token_ !== 'function') problems.push('QR functions missing in Code.gs.');
    if (doPost.toString().indexOf('MOB2.handle') < 0) problems.push('Another doPost is used: drag MobileAPI BELOW Code.gs in the file list (or delete the doPost at the end of Code.gs).');
    if (!problems.length) { plainSheet('Field Inspections'); plainSheet('Mobile Uploads'); try { plainSheet('Mobile Uploads').hideSheet(); } catch (e) { } }
    var msg = problems.length ? 'Please fix:\n\n• ' + problems.join('\n• ') : 'The mobile API is ready (v' + VERSION + ').\n\nNext: Deploy ▸ New deployment ▸ Web app (Execute as: Me, Who has access: Anyone) – or, if the sheet is already deployed for the QR check page, Deploy ▸ Manage deployments ▸ Edit ▸ New version. Then paste the /exec link into the app.';
    try { SpreadsheetApp.getUi().alert('CMU Database – mobile app', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
    if (problems.length) throw new Error(problems[0]);
    try { log('setup', 'Mobile API installed', 'Settings', '', 'v' + VERSION); } catch (e) { }
    return msg;
  }

  return { handle: handle, setup: setup, inbRead: inbRead, chemSync: function (apply) { MEMO = {}; return chemSync(apply); } };
})();
