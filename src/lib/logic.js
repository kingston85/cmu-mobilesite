// Business rules of the CMU Database, ported 1-to-1 from the sheet's Apps Script (Code.gs), so the phone gives the same
// answers offline as the sheet: register formulas, insights & aging, renewals, import quotas, duplicate check, fee rule
// RI/C&E-002-04/20, bill types & services, monthly / annual reports, company profile, amount in words.

export const DAY = 86400000;
export const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
export const MONTHS = 'January February March April May June July August September October November December'.split(' ');

/* ------------------------------------------------------------------ small helpers */
export const str = v => (v === null || v === undefined ? '' : String(v));
export const trim = v => str(v).trim();
export const eqi = (a, b) => trim(a).toLowerCase() === trim(b).toLowerCase();
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = trim(v).replace(/,/g, '');
  if (s === '' || isNaN(Number(s))) return 0;
  return Number(s);
}
export function isNum(v) {
  if (typeof v === 'number') return isFinite(v);
  const s = trim(v).replace(/,/g, '');
  return s !== '' && !isNaN(Number(s));
}
export const round2 = n => Math.round(num(n) * 100) / 100;
export function money(n, dec = 2) {
  const v = num(n), neg = v < 0, p = Math.abs(v).toFixed(dec).split('.');
  return (neg ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + p[1] : '');
}
export const usd = n => 'US$' + money(n);
export const usd0 = n => 'US$' + money(n, 0);
export const fmtNum = (n, dec = 0) => money(n, dec);
export const pad3 = n => String(n).padStart(3, '0');

/* ------------------------------------------------------------------ dates (all dates are local midnight) */
export function day(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function today() { return day(new Date()); }
const MI = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
function mk(y, m, d) { const dt = new Date(y < 100 ? 2000 + y : y, m, d); return dt.getMonth() === m && dt.getDate() === d ? dt : null; }
/** yyyy-mm-dd, 25-Sep-2026, 25/09/2026, 25 September 2026, Sep 25 2026, Date, Excel serial → Date or null */
export function toDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : day(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return day(new Date(Math.round((v - 25569) * DAY) + new Date().getTimezoneOffset() * 60000));
  const s = trim(v);
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) return mk(+m[3], +m[2] - 1, +m[1]);
  if ((m = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,9})[\s\-/,]*(\d{2,4})$/))) {
    const k = m[2].toLowerCase(), mo = MI[k.startsWith('sept') ? 'sept' : k.slice(0, 3)];
    return mo === undefined ? null : mk(+m[3], mo, +m[1]);
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
    const mo = MI[m[1].toLowerCase().slice(0, 3)];
    return mo === undefined ? null : mk(+m[3], mo, +m[2]);
  }
  return null;
}
export const days = (a, b) => Math.round((day(a) - day(b)) / DAY);       // a − b
export function iso(d) { d = d instanceof Date ? d : toDate(d); if (!d) return ''; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function fmtD(v) { const d = v instanceof Date ? v : toDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()}` : ''; }
export function fmtDT(s) { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return str(s); return `${fmtD(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
export function ago(s) {
  if (!s) return 'never'; const ms = Date.now() - new Date(s).getTime(); if (isNaN(ms)) return '';
  const m = Math.round(ms / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const dd = Math.round(h / 24); return dd + ' day' + (dd > 1 ? 's' : '') + ' ago';
}
export const todayISO = () => iso(today());

/* ------------------------------------------------------------------ amount in words (AmountInWords) */
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
function w999(n) {
  let s = '';
  if (n >= 100) { s = ONES[Math.floor(n / 100)] + ' HUNDRED'; n %= 100; if (n > 0) s += ' '; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10 > 0) s += '-' + ONES[n % 10]; } else if (n > 0) s += ONES[n];
  return s;
}
function wGroup(n) {
  const scl = ['', ' THOUSAND', ' MILLION', ' BILLION']; let i = 0, s = '';
  while (n > 0 && i <= 3) { const c = n % 1000; if (c > 0) s = w999(c) + scl[i] + (s === '' ? '' : ' ' + s); n = Math.floor(n / 1000); i++; }
  return s;
}
export function amountInWords(amt) {
  const r = Math.round(num(amt) * 100) / 100, d = Math.floor(r), c = Math.round((r - d) * 100);
  let s = d === 0 ? 'ZERO' : wGroup(d).trim();
  if (c > 0) s += ' AND ' + String(c).padStart(2, '0') + '/100';
  return s.toUpperCase();
}

/* ------------------------------------------------------------------ duplicate company check (DUP_Similar_) */
const DUP_STOP = ' inc ltd llc limited corp corporation company co the liberia lib and group plc sa ';
export const dupKey = s => str(s).toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w && DUP_STOP.indexOf(' ' + w + ' ') < 0).join('');
export function dice(a, b) {
  if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const m = {}; let n = 0;
  for (let i = 0; i < a.length - 1; i++) { const g = a.substr(i, 2); m[g] = (m[g] || 0) + 1; }
  for (let i = 0; i < b.length - 1; i++) { const g = b.substr(i, 2); if (m[g]) { m[g]--; n++; } }
  return 2 * n / (a.length + b.length - 2);
}
export function dupSimilar(companies, name, max = 5, exceptId = '') {
  const key = dupKey(name), out = [];
  if (!key) return out;
  for (const r of companies) {
    const nm = str(r['Company Name']); if (!nm || r['Company ID'] === exceptId) continue;
    const k2 = dupKey(nm);
    let best = Math.max(dice(key, k2), dice(key, dupKey(nm.replace(/\([^)]*\)/g, ' '))));
    if (k2 && key.length >= 4 && k2.length >= 4 && (k2.includes(key) || key.includes(k2))) best = Math.max(best, 0.9);
    str(r['Other Names Recorded']).split(/[;,/|\n]/).forEach(o => { best = Math.max(best, dice(key, dupKey(o))); });
    if (best >= 0.75) out.push({ id: str(r['Company ID']), name: nm, score: best });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/* ------------------------------------------------------------------ chemical names + quotas (quoKey_, QUO_Data_) */
const QUO_STOP = ' assorted min max solution liquid powder pellets flakes bag bags kg ltr litre liters drum drums technical grade industrial the and of ec sl wp ';
export const quoKey = s => str(s).toLowerCase().replace(/\d+(\.\d+)?\s*(%|g\/l|kg|l|ml|mt)\b/g, ' ').replace(/[^a-z0-9]/g, ' ').split(' ')
  .filter(w => w && !/^\d+$/.test(w) && QUO_STOP.indexOf(' ' + w + ' ') < 0).join('');
export function quoAlts(s) {
  s = str(s); const out = [quoKey(s), quoKey(s.replace(/\([^)]*\)/g, ' '))]; const re = /\(([^)]*)\)/g; let m;
  while ((m = re.exec(s))) out.push(quoKey(m[1]));
  return out.filter((k, i) => k && out.indexOf(k) === i);
}
export function quoScore(aAlts, bAlts) {
  let best = 0;
  for (const a of aAlts) for (const b of bAlts) {
    let s = dice(a, b);
    const sh = a.length <= b.length ? a : b, lo = a.length <= b.length ? b : a;
    if (sh.length >= 3 && lo.includes(sh)) s = Math.max(s, sh.length >= 6 || lo.indexOf(sh) === 0 || lo.length - sh.length <= 4 ? 0.9 : 0.8);
    best = Math.max(best, s);
  }
  return best;
}
export function quoKg(q, unit) {
  const u = str(unit).toLowerCase().replace(/\s+/g, '');
  if (!isNum(q)) return null;
  q = num(q);
  if (/^(kg|kgs|l|ltr|litre|liter|litres|liters)(\/|$)/.test(u)) return q;
  if (/^(mt|t|ton|tons|tonne|tonnes|metricton)(\/|$)/.test(u)) return q * 1000;
  if (/^g(\/|$)/.test(u)) return q / 1000;
  return null;
}
export function stdChem(name, chemicals, n = 3) {
  const alts = quoAlts(name), out = [];
  for (const s of chemicals) { const sc = quoScore(alts, quoAlts(s)); if (sc > 0.45) out.push({ name: s, score: Math.round(sc * 100) / 100 }); }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
export function aiUnit(u) {
  const s = str(u).toLowerCase().replace(/[\s.]/g, '');
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(s)) return 'kg';
  if (/^(mt|t|ton|tons|tonne|tonnes|metricton|metrictons)$/.test(s)) return 'MT';
  if (/^(l|lt|ltr|ltrs|litre|litres|liter|liters)$/.test(s)) return 'L';
  if (/^(pc|pcs|piece|pieces|unit|units|cyl|cylinder|cylinders|drum|drums|bag|bags)$/.test(s)) return 'pcs';
  return str(u);
}

/** quota use for every Chemical Importation Licence; extra = clearance lines not saved yet */
export function quotaData(T, extra = []) {
  const now = today();
  const lines = T.clearances.filter(r => trim(r['Record ID'])).map(r => {
    const rec = str(r['Chemical as Recorded']), std = str(r['Chemical (Standard)']);
    return { id: str(r['Record ID']), no: str(r['Clearance No.']), coId: str(r['Company ID']), co: str(r['Company Name']), rec, std,
      alts: quoAlts(rec).concat(quoAlts(std)), kg: num(r['Qty (kg)']), date: toDate(r['Clearance Date']) };
  });
  for (const x of extra) lines.push({ ...x, alts: quoAlts(x.rec).concat(quoAlts(x.std)), isNew: true });
  const lics = T.licences.filter(r => /CIL|importation/i.test(str(r['Licence Category']) + ' ' + str(r['Licence / Certificate Type'])) && trim(r['Record ID'])).map(r => {
    const issued = toDate(r['Date Issued']), exp = toDate(r['Expiry Date']);
    return { id: str(r['Record ID']), no: str(r['Licence / Certificate No.']), coId: str(r['Company ID']), co: str(r['Company Name']),
      from: issued || (exp ? new Date(exp.getFullYear(), 0, 1) : null), to: exp, chems: [] };
  });
  const byLic = {}; lics.forEach(l => { byLic[l.id] = l; });
  for (const r of T.licenceChemicals) {
    const l = byLic[str(r['Licence Record ID'])]; if (!l) continue;
    const nm = str(r['Trade or IUPAC Name']); if (!nm || /illegible/i.test(nm)) continue;
    const unit = str(r['Unit']), q = r['Stipulated Qty'];
    l.chems.push({ name: nm, alts: quoAlts(nm), unit, perMonth: /\/\s*month/i.test(unit), limit: quoKg(q, unit), used: 0, months: {}, lines: [] });
  }
  const covers = (l, ln) => (l.coId ? l.coId === ln.coId : eqi(l.co, ln.co)) && ln.date && l.from && ln.date >= l.from && (!l.to || ln.date <= l.to);
  const notOn = [], noLic = [];
  for (const ln of lines) {
    const ls = lics.filter(l => covers(l, ln));
    if (!ls.length) { if (ln.date) noLic.push(ln); continue; }
    let best = null, bs = 0;
    ls.forEach(l => l.chems.forEach(ch => { const s = quoScore(ch.alts, ln.alts); if (s > bs) { bs = s; best = ch; } }));
    if (best && bs >= 0.75) {
      best.used += ln.kg; best.lines.push(ln);
      const mk2 = ln.date.getFullYear() + '-' + (ln.date.getMonth() + 1);
      best.months[mk2] = (best.months[mk2] || 0) + ln.kg;
    } else if (ls.some(l => l.chems.length)) notOn.push({ line: ln, lic: ls[0] });
  }
  const rows = [];
  lics.forEach(l => l.chems.forEach(ch => {
    let basis = ch.used, mon = '';
    if (ch.perMonth) { basis = 0; Object.keys(ch.months).forEach(k => { if (ch.months[k] > basis) { basis = ch.months[k]; mon = k; } }); }
    const pct = ch.limit ? basis / ch.limit : null;
    rows.push({ lic: l, ch, basis, month: mon, pct,
      status: ch.limit === null ? 'No quantity on licence' : pct > 1.0000001 ? 'OVER QUOTA' : pct >= 0.8 ? 'Near limit (80%+)' : 'OK',
      active: !l.to || l.to >= now });
  }));
  rows.sort((a, b) => (b.pct === null ? -1 : b.pct) - (a.pct === null ? -1 : a.pct));
  return { lics, rows, notOn, noLic };
}
/** the quota problems new clearance lines would cause (QUO_FormWarn_) */
export function quotaWarnings(T, company, coId, date, lines) {
  const d = toDate(date) || today(), extra = [], warn = [];
  lines.forEach((l, i) => {
    if (!trim(l.rec) && !trim(l.std)) return;
    const kg = quoKg(l.qty, l.unit); if (!kg) return;
    extra.push({ id: 'NEW-' + i, no: 'this clearance', coId, co: company, rec: str(l.rec), std: str(l.std), kg, date: d });
  });
  if (!extra.length) return warn;
  const Q = quotaData(T, extra);
  Q.rows.forEach(x => {
    if (!x.ch.lines.some(l => l.isNew) || x.ch.limit === null || x.pct <= 1.0000001) return;
    warn.push(`Over quota: ${x.ch.name} – ${money(x.basis)} kg of ${money(x.ch.limit)} kg${x.ch.perMonth ? ' per month' : ''} (${Math.round(x.pct * 100)}%) on ${x.lic.id} ${x.lic.no}`);
  });
  Q.notOn.forEach(x => { if (x.line.isNew) warn.push(`Not on licence ${x.lic.id} ${x.lic.no}: ${x.line.rec || x.line.std}`); });
  if (Q.noLic.some(x => x.isNew) && Q.lics.some(l => l.coId === coId)) warn.push(`${company} has no Chemical Importation Licence valid on ${fmtD(d)}`);
  return warn;
}

/* ------------------------------------------------------------------ register formulas (calculated columns) */
export function clrKg(qty, unit) {
  if (unit !== 'kg' && unit !== 'MT') return '';
  const q = typeof qty === 'number' ? qty : Number(trim(String(qty).toUpperCase().replace('MT', '')));
  if (!isFinite(q) || trim(qty) === '') return '';
  return q * (unit === 'MT' ? 1000 : 1);
}
export function licStatus(r, now = today()) {
  if (!trim(r['Licence / Certificate No.']) && !trim(r['Date Issued'])) return 'Pending – no licence no.';
  const e = toDate(r['Expiry Date']);
  if (!e) return 'Issued – expiry not recorded';
  return e < now ? 'Expired' : 'Active';
}
/** recompute every calculated column, exactly like the sheet's formulas, so records added offline look right */
export function enrich(T) {
  const coName = {}; T.companies.forEach(c => { coName[c['Company ID']] = c['Company Name']; });
  const name = (r, alt) => coName[r['Company ID']] || r['Company Name'] || r[alt] || '';
  const now = today();
  const licences = T.licences.map(r => ({ ...r, 'Company Name': name(r, 'Name as Recorded'), Status: licStatus(r, now) }));
  const clearances = T.clearances.map(r => {
    const kg = clrKg(r['Qty as Recorded'], r['Unit']);
    return { ...r, 'Company Name': name(r), 'Qty (kg)': kg, 'Qty (MT)': kg === '' ? '' : kg / 1000 };
  });
  const payments = T.payments.map(r => ({ ...r, 'Company Name': name(r, 'Name as Recorded') }));
  const paidByBill = {}, paidByCo = {}, billedByBill = {}, billedByCo = {};
  payments.forEach(p => { paidByBill[p['Bill No.']] = (paidByBill[p['Bill No.']] || 0) + num(p['Amount (USD)']); paidByCo[p['Company ID']] = (paidByCo[p['Company ID']] || 0) + num(p['Amount (USD)']); });
  T.bills.forEach(b => { billedByBill[b['Bill No.']] = (billedByBill[b['Bill No.']] || 0) + num(b['Amount Billed (USD)']); billedByCo[b['Company ID']] = (billedByCo[b['Company ID']] || 0) + num(b['Amount Billed (USD)']); });
  const bills = T.bills.map(r => {
    const L = billedByCo[r['Company ID']] || 0, M = paidByCo[r['Company ID']] || 0, Tb = paidByBill[r['Bill No.']] || 0;
    const N = M === 0 ? 'No payment on record' : M >= L ? 'Paid' : 'Part paid';
    const U = Tb > 0 ? (Tb >= (billedByBill[r['Bill No.']] || 0) ? 'Paid' : 'Part paid') : (N === 'No payment on record' ? 'Unpaid' : N + ' (company account)');
    return { ...r, 'Company Name': name(r, 'Name as Recorded'), 'Company Total Billed (USD)': L, 'Company Total Paid (USD)': M, 'Payment Status': N, 'Paid on this Bill (USD)': Tb, 'Bill Status': U };
  });
  const cnt = (arr, k) => { const m = {}; arr.forEach(r => { m[r[k]] = (m[r[k]] || 0) + 1; }); return m; };
  const nLic = cnt(licences, 'Company ID'), nClr = cnt(clearances, 'Company ID'), kgCo = {};
  clearances.forEach(c => { kgCo[c['Company ID']] = (kgCo[c['Company ID']] || 0) + num(c['Qty (kg)']); });
  const companies = T.companies.map(c => ({ ...c, 'Licences (No.)': nLic[c['Company ID']] || 0, 'Clearances (No.)': nClr[c['Company ID']] || 0,
    'Total Cleared (kg)': kgCo[c['Company ID']] || 0, 'Total Billed (USD)': billedByCo[c['Company ID']] || 0, 'Total Paid (USD)': paidByCo[c['Company ID']] || 0 }));
  const licNo = {}; licences.forEach(l => { licNo[l['Record ID']] = { no: l['Licence / Certificate No.'], co: l['Company Name'] }; });
  const fillLic = r => ({ ...r, 'Licence No.': (licNo[r['Licence Record ID']] || {}).no || r['Licence No.'] || '', Company: (licNo[r['Licence Record ID']] || {}).co || r['Company'] || '' });
  const correspondence = (T.correspondence || []).map(r => ({ ...r, 'Company Name': name(r, 'Name as Recorded') }));
  return { ...T, companies, licences, clearances, bills, payments, correspondence,
    licenceChemicals: T.licenceChemicals.map(fillLic), licenceVehicles: (T.licenceVehicles || []).map(fillLic), licenceEffluent: (T.licenceEffluent || []).map(fillLic) };
}

/* ------------------------------------------------------------------ insights (INS_Data_) */
export function insData(T, ahead = 60, back = 30) {
  const now = today();
  const lic = T.licences.filter(r => trim(r['Record ID'])).map(r => {
    const e = toDate(r['Expiry Date']);
    return { id: str(r['Record ID']), coId: str(r['Company ID']), co: str(r['Company Name']), cat: str(r['Licence Category']), type: str(r['Licence / Certificate Type']),
      no: str(r['Licence / Certificate No.']), issued: toDate(r['Date Issued']), expiry: e, days: e ? days(e, now) : null, status: str(r['Status']) };
  });
  lic.forEach(x => {
    x.renewed = !!x.expiry && lic.some(y => y !== x && y.expiry && (y.coId ? y.coId === x.coId : eqi(y.co, x.co)) && eqi(y.type || y.cat, x.type || x.cat) && y.expiry > x.expiry);
  });
  const alerts = lic.filter(x => x.expiry && !x.renewed && x.days <= ahead && x.days >= -back).sort((a, b) => a.days - b.days);
  const byNo = {}, order = [];
  for (const r of T.bills) {
    const no = str(r['Bill No.']); if (!no) continue;
    let b = byNo[no];
    if (!b) {
      b = byNo[no] = { no, coId: str(r['Company ID']), co: str(r['Company Name']), date: toDate(r['Bill Date']), type: str(r['Bill Type']), ref: str(r['Bill Ref. No.']),
        contact: str(r['Contact Person']), title: str(r['Contact Title']), billed: 0, paid: num(r['Paid on this Bill (USD)']), status: str(r['Bill Status']), purpose: [], lines: [], linked: str(r['Linked Record']) };
      order.push(no);
    }
    b.billed += num(r['Amount Billed (USD)']); b.lines.push(r);
    const p = str(r['Purpose / Licence Billed']); if (p && !b.purpose.includes(p)) b.purpose.push(p);
    const d = toDate(r['Bill Date']); if (d && (!b.date || d < b.date)) b.date = d;
  }
  const bills = order.map(k => byNo[k]);
  bills.forEach(b => {
    b.out = Math.max(0, Math.round((b.billed - b.paid) * 100) / 100);
    b.age = b.date ? days(now, b.date) : null;
    b.isPaid = /^paid/i.test(b.status) || b.out <= 0.005;
    b.companyAcct = /company account/i.test(b.status);
    b.bucket = b.age === null ? 'Date not recorded' : b.age > 90 ? 'Over 90 days' : b.age > 60 ? '61 – 90 days' : b.age > 30 ? '31 – 60 days' : '0 – 30 days';
  });
  const unpaid = bills.filter(b => !b.isPaid).sort((a, b) => (b.age || 0) - (a.age || 0));
  const aging = ['0 – 30 days', '31 – 60 days', '61 – 90 days', 'Over 90 days', 'Date not recorded'].map(k => {
    const xs = unpaid.filter(b => b.bucket === k);
    return { bucket: k, n: xs.length, amt: xs.reduce((a, b) => a + b.out, 0) };
  });
  return { today: now, ahead, back, licences: lic, alerts, bills, unpaid, aging };
}

/* ------------------------------------------------------------------ grouping helpers */
export function clearanceGroups(T) {
  const by = {}, order = [];
  for (const r of T.clearances) {
    const k = str(r['Clearance No.']) || str(r['Record ID']); if (!k) continue;
    if (!by[k]) { by[k] = { no: k, coId: r['Company ID'], co: r['Company Name'], date: r['Clearance Date'], ref: r['Clearance Ref. No.'], eta: r['ETA'], remarks: r['Remarks'], lines: [], kg: 0, bls: [], pending: false }; order.push(k); }
    const g = by[k]; g.lines.push(r); g.kg += num(r['Qty (kg)']);
    const bl = str(r['B/L / Invoice / AWB No.']); if (bl && !g.bls.includes(bl)) g.bls.push(bl);
    if (r._pending) g.pending = true;
  }
  return order.map(k => by[k]);
}

/* ------------------------------------------------------------------ fee rule RI/C&E-002-04/20 (AI_Fee_) */
export const HAZ_CATS = [['Petrochemicals', 'kg', 0.05], ['Agrochemicals', 'kg', 0.15], ['Explosives', 'MT', 1.875], ['Laboratory Chemicals', 'kg', 0.05],
  ['Industrial Chemicals Class A', 'kg', 0.50], ['Industrial Chemicals Class B', 'kg', 0.40], ['Sodium Cyanide', 'MT', 6.5]].map(c => ({ name: c[0], basis: c[1], rate: c[2] }));
export const HAZ_HI = [[0, 1], [1, 1.5], [2, 2], [3, 2.5], [4, 3]].map(x => ({ hmis: x[0], hi: x[1] }));
export function feeCalc(items, hazards, chemicals, cats = HAZ_CATS, his = HAZ_HI) {
  const catMap = {}; (cats.length ? cats : HAZ_CATS).forEach(c => { catMap[c.name.toLowerCase()] = c; });
  const hi = {}; (his.length ? his : HAZ_HI).forEach(x => { hi[x.hmis] = x.hi; });
  let total = 0, missing = 0;
  const lines = items.map(it => {
    let std = it.chemical_standard || '';
    if (!std) { const s = stdChem(it.chemical, chemicals, 1)[0]; if (s && s.score >= 0.75) std = s.name; }
    const row = hazards.find(r => std && eqi(r.name, std));
    const hmis = isNum(it.hmis) && trim(it.hmis) !== '' ? num(it.hmis) : row && isNum(row.hmis) && trim(row.hmis) !== '' ? num(row.hmis) : null;
    const catName = it.category || (row ? row.cat : ''), cat = catMap[str(catName).toLowerCase()];
    const unit = aiUnit(it.unit) || 'kg', kg = quoKg(it.quantity, unit);
    const line = { chemical: it.chemical, standard: std || '(not matched)', quantity: it.quantity, unit, category: cat ? cat.name : (catName || ''), hmis, hi: hmis === null ? null : hi[hmis] };
    if (!cat || hmis === null || hi[hmis] === undefined || kg === null) {
      line.fee = null; missing++;
      line.note = !cat ? 'Fee category missing – set it in Chemical Hazards or choose it here.' : hmis === null ? 'HMIS rating missing – take it from the SDS (never guessed).' : kg === null ? 'Quantity/unit cannot be converted to kg.' : 'HMIS must be 0–4.';
    } else {
      const q = cat.basis === 'MT' ? kg / 1000 : kg;
      line.rate = cat.rate; line.basis = cat.basis; line.qtyBasis = q;
      line.fee = Math.round(cat.rate * hi[hmis] * q * 100) / 100; total += line.fee;
      line.working = `${cat.rate} × ${hi[hmis]} × ${money(q, q % 1 ? 3 : 0)} ${cat.basis === 'MT' ? 'MT' : 'kg'} = ${money(line.fee)}`;
    }
    return line;
  });
  total = Math.round(total * 100) / 100;
  return { lines, total, words: total > 0 ? amountInWords(total) : '', missing };
}
/** hazard + fee estimate for one clearance line (the "Hazard · fee estimate" column of the Clearance Form) */
export function lineHazard(std, qty, unit, hazards, cats = HAZ_CATS) {
  if (!std) return null;
  const row = hazards.find(r => eqi(r.name, std));
  if (!row) return { text: '– not in the Chemical Hazards list', level: 'muted' };
  if (trim(row.hmis) === '') return { text: '⚠ add HMIS rating in Chemical Hazards', level: 'warn' };
  const hmis = num(row.hmis);
  let t = 'HMIS ' + hmis;
  if (!row.cat) return { text: t + ' · add fee category', level: 'warn', hmis };
  t += ' · ' + row.cat;
  const cat = (cats.length ? cats : HAZ_CATS).find(c => eqi(c.name, row.cat));
  const q = unit === 'pcs' ? 0 : num(qty);
  let fee = null;
  if (cat && q) { fee = cat.rate * [1, 1.5, 2, 2.5, 3][hmis] * q * (unit === 'MT' ? 1000 : 1) / (cat.basis === 'MT' ? 1000 : 1); t += ' ≈ ' + usd(fee); }
  return { text: t, level: hmis >= 3 ? 'bad' : hmis >= 2 ? 'warn' : 'ok', hmis, fee, cat: row.cat };
}

/* ------------------------------------------------------------------ bills (Svc_For_, Fee_For_, Type_For, Bill_New) */
export function svcFor(cat, typ) {
  if (/\(CRL\)/i.test(cat)) return 'Annual Chemical Registration License';
  if (/\(CIL\)/i.test(cat)) return 'Chemical Importation License';
  if (/Dewatering/i.test(cat)) return 'Underground Mine Dewatering and Retention License';
  if (/\(EDL\)/i.test(cat)) return 'Annual Effluent Discharge License';
  if (/Fumigation/i.test(cat)) return /Accreditation/i.test(typ) ? 'Fumigation Service Provider Accreditation' : 'Fumigation Certificate';
  if (/Transport/i.test(cat)) return 'Chemical Transportation License';
  return 'Other Service';
}
export const feeFor = (svc, services) => { const s = services.find(x => eqi(x.service, svc)); return s && s.fee !== null && s.fee !== undefined && s.fee !== '' ? num(s.fee) : null; };
export function typeFor(svc, services) {
  const s = services.find(x => eqi(x.service, svc)), g = s ? s.group : '';
  return { Licence: 'Licence – New Application', Clearance: 'Chemical Clearance', Fumigation: 'Fumigation', Transportation: 'Chemical Transportation' }[g] || 'Penalty / Other';
}
export const groupOfType = (t, billTypes) => { const b = billTypes.find(x => eqi(x.type, t)); return b ? b.group : ''; };
export const servicesForType = (t, billTypes, services) => { const g = groupOfType(t, billTypes); return g ? services.filter(s => s.group === g) : services; };
export const NEW = 'Licence – New Application';
export const BILL_KINDS = [
  { k: 1, label: 'Chemical Registration License (CRL)', svc: ['Annual Chemical Registration License'], lt: NEW, renew: true, link: 'LIC' },
  { k: 2, label: 'Chemical Importation License (CIL)', svc: ['Chemical Importation License'], lt: NEW, renew: true, link: 'LIC' },
  { k: 3, label: 'CRL + CIL together', svc: ['Annual Chemical Registration License', 'Chemical Importation License'], lt: NEW, renew: true },
  { k: 4, label: 'Effluent Discharge License (EDL)', svc: ['Annual Effluent Discharge License'], lt: NEW, renew: true, link: 'LIC' },
  { k: 5, label: 'Effluent Discharge & Dewatering License', svc: ['Effluent Discharge and Dewatering License'], lt: NEW, renew: true, link: 'LIC' },
  { k: 6, label: 'Fumigation Certificate', svc: ['Fumigation Certificate'], lt: 'Fumigation' },
  { k: 7, label: 'Chemical Clearance', svc: ['Chemical Clearance'], lt: 'Chemical Clearance', link: 'CLN' },
  { k: 8, label: 'Chemical Transportation License', svc: ['Chemical Transportation License'], lt: 'Chemical Transportation', renewNoType: true, details: 'for a total of ___ trucks' },
  { k: 9, label: 'Others (penalty, accreditation, combined…)', svc: ['Penalty / Fine'], lt: 'Penalty / Other' },
];
/** a bill line for a saved licence or clearance (Bill_FromID) */
export function billLineFor(T, id, services) {
  id = trim(id).toUpperCase();
  if (id.startsWith('LIC-')) {
    const l = T.licences.find(x => eqi(x['Record ID'], id)); if (!l) return null;
    const svc = svcFor(l['Licence Category'], l['Licence / Certificate Type']);
    return { company: l['Company Name'], location: l['Location'], service: svc, details: l['Licence / Certificate No.'] ? 'Licence No. ' + l['Licence / Certificate No.'] : '', amount: feeFor(svc, services), id };
  }
  if (id.startsWith('CLN-')) {
    const ls = T.clearances.filter(x => eqi(x['Clearance No.'], id)); if (!ls.length) return null;
    const bl = []; ls.forEach(x => { const v = str(x['B/L / Invoice / AWB No.']); if (v && !bl.includes(v)) bl.push(v); });
    const co = ls[0]['Company Name'], c = T.companies.find(x => x['Company Name'] === co);
    return { company: co, location: c ? c['Location'] : '', service: 'Chemical Clearance', details: ls.length + ' chemical line(s)' + (bl.length ? ' under B/L ' + bl.join(', ') : ''), amount: feeFor('Chemical Clearance', services), id };
  }
  return null;
}
export function billedAlready(T, id) { return T.bills.some(b => str(b['Linked Record']).toUpperCase().includes(trim(id).toUpperCase())); }
export function billStatus(T, bn) {
  bn = trim(str(bn).split(' ')[0]); let co = '', purpose = '', billed = 0, coId = '';
  T.bills.forEach(r => { if (str(r['Bill No.']) === bn) { if (!co) { co = str(r['Company Name']); coId = r['Company ID']; } purpose = purpose ? purpose + ', ' + str(r['Purpose / Licence Billed']) : str(r['Purpose / Licence Billed']); billed += num(r['Amount Billed (USD)']); } });
  const paid = T.payments.filter(p => str(p['Bill No.']) === bn).reduce((a, p) => a + num(p['Amount (USD)']), 0);
  return { bn, co, coId, purpose, billed, paid, bal: Math.max(0, billed - paid) };
}

/* ------------------------------------------------------------------ next IDs (for records made offline: shown as provisional) */
export function nextId(rows, col, pre) {
  let mx = 0;
  rows.forEach(r => { const v = str(r[col]); if (v.startsWith(pre)) { const n = parseInt(v.slice(pre.length), 10); if (!isNaN(n) && n > mx) mx = n; } });
  return pre + pad3(mx + 1);
}

/* ------------------------------------------------------------------ monthly report (REP_Build) */
export function monthlyReport(T, y, m) {
  const D = insData(T, 60, 30), start = new Date(y, m, 1), end = new Date(y, m + 1, 1), ystart = new Date(y, 0, 1), nextEnd = new Date(y, m + 2, 1);
  const inM = d => d && d >= start && d < end, inY = d => d && d >= ystart && d < end;
  const licM = D.licences.filter(x => inM(x.issued)), licY = D.licences.filter(x => inY(x.issued));
  const clr = T.clearances.filter(x => trim(x['Record ID'])).map(x => ({ no: str(x['Clearance No.']), co: str(x['Company Name']), chem: str(x['Chemical (Standard)']) || str(x['Chemical as Recorded']), kg: num(x['Qty (kg)']), date: toDate(x['Clearance Date']) }));
  const clrM = clr.filter(x => inM(x.date)), clrY = clr.filter(x => inY(x.date));
  const uniq = xs => new Set(xs.map(x => x.no)).size, kg = xs => xs.reduce((a, x) => a + x.kg, 0);
  const bM = D.bills.filter(b => inM(b.date)), bY = D.bills.filter(b => inY(b.date));
  const pay = T.payments.filter(x => trim(x['Record ID'])).map(x => ({ id: str(x['Record ID']), co: str(x['Company Name']), rec: str(x['Receipt No.']), bill: str(x['Bill No.']), amt: num(x['Amount (USD)']), date: toDate(x['Payment Date']), purpose: str(x['Purpose / Services']) }));
  const pM = pay.filter(x => inM(x.date)), pY = pay.filter(x => inY(x.date));
  const sum = (xs, k) => xs.reduce((a, x) => a + (x[k] || 0), 0);
  const billedToEnd = sum(D.bills.filter(b => b.date && b.date < end), 'billed'), paidToEnd = sum(pay.filter(x => x.date && x.date < end), 'amt');
  return {
    label: MONTHS[m] + ' ' + y, y, m, D,
    summary: [['Licences & certificates issued', licM.length, licY.length, 0], ['Chemical clearances (Clearance Nos.)', uniq(clrM), uniq(clrY), 0], ['Quantity cleared (MT)', kg(clrM) / 1000, kg(clrY) / 1000, 3],
      ['Bills issued', bM.length, bY.length, 0], ['Amount billed (US$)', sum(bM, 'billed'), sum(bY, 'billed'), 2], ['Payments received', pM.length, pY.length, 0], ['Amount received (US$)', sum(pM, 'amt'), sum(pY, 'amt'), 2]],
    outstanding: billedToEnd - paidToEnd,
    licences: licM.sort((a, b) => a.issued - b.issued), clearances: clrM.sort((a, b) => a.date - b.date || (a.no < b.no ? -1 : 1)), clrKg: kg(clrM),
    bills: bM.sort((a, b) => a.date - b.date), billed: sum(bM, 'billed'), payments: pM.sort((a, b) => a.date - b.date), received: sum(pM, 'amt'),
    expiringNext: D.licences.filter(x => x.expiry && !x.renewed && x.expiry >= end && x.expiry < nextEnd).sort((a, b) => a.expiry - b.expiry), nextLabel: MONTHS[(m + 1) % 12] + ' ' + (m === 11 ? y + 1 : y),
    old30: D.unpaid.filter(b => b.age !== null && b.age > 30),
  };
}

/* ------------------------------------------------------------------ annual report (ANN_Figures_ / ANN_Build) */
export function annualFigures(T, y, D, Q) {
  const inY = d => d && d.getFullYear() === y;
  const F = { y, months: Array.from({ length: 12 }, () => ({ lic: 0, clr: new Set(), kg: 0, billed: 0, paid: 0 })), byCo: {}, byChem: {}, byType: {} };
  D.licences.forEach(x => { if (inY(x.issued)) F.months[x.issued.getMonth()].lic++; });
  T.clearances.forEach(r => {
    const d = toDate(r['Clearance Date']); if (!inY(d) || !trim(r['Record ID'])) return;
    const kg = num(r['Qty (kg)']), mm = F.months[d.getMonth()];
    mm.kg += kg; mm.clr.add(str(r['Clearance No.']));
    const co = str(r['Company Name']) || 'Not recorded', ch = str(r['Chemical (Standard)']) || str(r['Chemical as Recorded']) || 'Not recorded';
    F.byCo[co] = (F.byCo[co] || 0) + kg; F.byChem[ch] = (F.byChem[ch] || 0) + kg;
  });
  D.bills.forEach(b => { if (!inY(b.date)) return; F.months[b.date.getMonth()].billed += b.billed; const k = b.type || 'Not recorded'; F.byType[k] = (F.byType[k] || 0) + b.billed; });
  const pays = T.payments.filter(r => trim(r['Record ID'])).map(r => ({ bill: str(r['Bill No.']), amt: num(r['Amount (USD)']), date: toDate(r['Payment Date']) }));
  pays.forEach(p => { if (inY(p.date)) F.months[p.date.getMonth()].paid += p.amt; });
  const sum = k => F.months.reduce((a, x) => a + (k === 'clr' ? x.clr.size : x[k]), 0);
  F.lic = sum('lic'); F.clr = sum('clr'); F.kg = sum('kg'); F.billed = sum('billed'); F.paid = sum('paid');
  const end = new Date(y + 1, 0, 1);
  F.outstanding = D.bills.filter(b => b.date && b.date < end).reduce((a, b) => a + b.billed, 0) - pays.filter(p => p.date && p.date < end).reduce((a, p) => a + p.amt, 0);
  const due = D.licences.filter(x => inY(x.expiry) && x.expiry < D.today);
  F.renewDue = due.length;
  F.renewOnTime = due.filter(x => D.licences.some(z => z !== x && (z.coId ? z.coId === x.coId : eqi(z.co, x.co)) && eqi(z.type || z.cat, x.type || x.cat) && z.expiry > x.expiry && z.issued && z.issued <= x.expiry)).length;
  const yb = D.bills.filter(b => inY(b.date)), dd = [];
  F.billsN = yb.length; F.paid30 = 0;
  yb.forEach(b => {
    const ps = pays.filter(p => p.bill === b.no && p.date).sort((a, c) => a.date - c.date); let acc = 0;
    for (const p of ps) { acc += p.amt; if (acc >= b.billed - 0.005) { const d0 = days(p.date, b.date); dd.push(d0); if (d0 <= 30) F.paid30++; break; } }
  });
  F.paidBills = dd.length; F.avgDays = dd.length ? dd.reduce((a, x) => a + x, 0) / dd.length : null;
  F.overQuota = Q.rows.filter(x => x.status === 'OVER QUOTA' && x.ch.lines.some(l => inY(l.date))).length;
  F.noLic = Q.noLic.filter(x => inY(x.date)).length;
  F.notOn = Q.notOn.filter(x => inY(x.line.date)).length;
  F.issuesOpen = (T.issues || []).filter(r => /open/i.test(str(r['Follow-up Status']))).length;
  const cats = {};
  D.licences.forEach(x => {
    const k = x.cat || 'Not recorded', c = cats[k] = cats[k] || [0, 0, 0];
    if (x.issued && x.issued.getFullYear() === y) c[0]++;
    if (x.expiry && x.days >= 0) c[1]++;
    if (x.expiry && x.days < 0 && !x.renewed) c[2]++;
  });
  F.cats = cats;
  return F;
}
export function topN(map, n = 10) {
  const tot = Object.values(map).reduce((a, x) => a + x, 0);
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, value: v, share: tot ? v / tot : 0 }));
}

/* ------------------------------------------------------------------ company profile (PRO_Build / AI_Company_Summary_) */
export function companyProfile(T, coId, D, Q) {
  const co = T.companies.find(c => c['Company ID'] === coId); if (!co) return null;
  const name = co['Company Name'], mine = x => (x.coId ? x.coId === coId : eqi(x.co, name));
  const lic = D.licences.filter(mine).sort((a, b) => (b.expiry || 0) - (a.expiry || 0));
  const bills = D.bills.filter(mine).sort((a, b) => (b.date || 0) - (a.date || 0));
  const pays = T.payments.filter(r => trim(r['Record ID']) && (r['Company ID'] === coId || eqi(r['Company Name'], name))).sort((a, b) => (toDate(b['Payment Date']) || 0) - (toDate(a['Payment Date']) || 0));
  const clr = T.clearances.filter(r => trim(r['Record ID']) && (r['Company ID'] === coId || eqi(r['Company Name'], name)));
  const byChem = {}, byYear = {};
  clr.forEach(r => { const ch = str(r['Chemical (Standard)']) || str(r['Chemical as Recorded']), d = toDate(r['Clearance Date']), y = d ? d.getFullYear() : 'no date'; byChem[ch] = (byChem[ch] || 0) + num(r['Qty (kg)']); byYear[y] = (byYear[y] || 0) + num(r['Qty (kg)']); });
  const billed = bills.reduce((a, b) => a + b.billed, 0), paid = pays.reduce((a, p) => a + num(p['Amount (USD)']), 0);
  const yr = D.today.getFullYear();
  const kgAll = clr.reduce((a, c) => a + num(c['Qty (kg)']), 0), kgYr = clr.filter(c => { const d = toDate(c['Clearance Date']); return d && d.getFullYear() === yr; }).reduce((a, c) => a + num(c['Qty (kg)']), 0);
  return {
    co, name, lic, bills, pays, clr, byChem, byYear, billed, paid, balance: billed - paid, kgAll, kgYr,
    active: lic.filter(x => x.expiry && x.days >= 0).length, expired: lic.filter(x => x.expiry && x.days < 0 && !x.renewed).length,
    outstanding: bills.reduce((a, b) => a + (b.isPaid ? 0 : b.out), 0),
    quotas: Q.rows.filter(x => mine(x.lic)),
    contact: (T.contacts || []).find(c => c['Company ID'] === coId) || null,
    inspections: (T.inspections || []).filter(i => i['Company ID'] === coId || eqi(i['Company'], name)),
    correspondence: (T.correspondence || []).filter(r => r['Company ID'] === coId),
    emails: (T.emails || []).filter(e => e.coId === coId),
  };
}

/* ------------------------------------------------------------------ chart data (INS_ChartData_) */
export function chartData(T, D, y = today().getFullYear()) {
  const billed = Array(12).fill(0), paid = Array(12).fill(0);
  D.bills.forEach(b => { if (b.date && b.date.getFullYear() === y) billed[b.date.getMonth()] += b.billed; });
  T.payments.forEach(r => { const d = toDate(r['Payment Date']); if (d && d.getFullYear() === y) paid[d.getMonth()] += num(r['Amount (USD)']); });
  const byType = {}; D.bills.forEach(b => { if (b.date && b.date.getFullYear() !== y) return; const k = b.type || 'Not recorded'; byType[k] = (byType[k] || 0) + b.billed; });
  const byCo = {}, byCh = {}, kgMonth = Array(12).fill(0);
  T.clearances.forEach(r => {
    const kg = num(r['Qty (kg)']); if (!kg) return; const d = toDate(r['Clearance Date']);
    if (d && d.getFullYear() !== y) return;
    if (d) kgMonth[d.getMonth()] += kg / 1000;
    const co = str(r['Company Name']) || 'Not recorded', ch = str(r['Chemical (Standard)']) || 'Not recorded';
    byCo[co] = (byCo[co] || 0) + kg / 1000; byCh[ch] = (byCh[ch] || 0) + kg / 1000;
  });
  const bySector = {};
  T.companies.forEach(c => { const k = c['Sector / Activity'] || 'Not recorded'; bySector[k] = (bySector[k] || 0) + 1; });
  const licByCat = {};
  D.licences.forEach(x => { if (x.issued && x.issued.getFullYear() === y) { const k = x.cat || 'Not recorded'; licByCat[k] = (licByCat[k] || 0) + 1; } });
  return { y, billed, paid, kgMonth, byType: topN(byType, 8), byCo: topN(byCo, 10), byCh: topN(byCh, 10), bySector: topN(bySector, 8), licByCat: topN(licByCat, 8) };
}
export function yearsIn(T) {
  const ys = new Set([today().getFullYear()]);
  [[T.bills, 'Bill Date'], [T.payments, 'Payment Date'], [T.clearances, 'Clearance Date'], [T.licences, 'Date Issued']].forEach(([rows, c]) => rows.forEach(r => { const d = toDate(r[c]); if (d) ys.add(d.getFullYear()); }));
  return [...ys].sort((a, b) => b - a);
}

/* ------------------------------------------------------------------ data health check (offline version of the Claude data check) */
export function dataCheck(T) {
  const out = [], add = (sev, sheet, id, text) => out.push({ sev, sheet, id, text });
  const seen = (rows, col, sheet) => { const m = {}; rows.forEach(r => { const k = trim(r[col]); if (!k) return; if (m[k]) add(1, sheet, k, `${col} ${k} is used twice`); m[k] = 1; }); };
  seen(T.companies, 'Company ID', 'Companies'); seen(T.licences, 'Record ID', 'Licences & Certificates'); seen(T.clearances, 'Record ID', 'Chemical Clearances');
  seen(T.bills, 'Bill ID', 'Bills & Invoices'); seen(T.payments, 'Record ID', 'Payments & Receipts');
  for (let i = 0; i < T.companies.length; i++) for (let j = i + 1; j < T.companies.length; j++) {
    const a = T.companies[i], b = T.companies[j], s = dice(dupKey(a['Company Name']), dupKey(b['Company Name']));
    if (s >= 0.85) add(2, 'Companies', a['Company ID'], `Possible duplicate: ${a['Company ID']} "${a['Company Name']}" and ${b['Company ID']} "${b['Company Name']}" (${Math.round(s * 100)}%)`);
  }
  const coIds = new Set(T.companies.map(c => c['Company ID']));
  T.licences.forEach(l => {
    if (!coIds.has(l['Company ID'])) add(1, 'Licences & Certificates', l['Record ID'], 'Company ID missing or not registered');
    const i = toDate(l['Date Issued']), e = toDate(l['Expiry Date']);
    if (i && e && e < i) add(1, 'Licences & Certificates', l['Record ID'], `Expiry ${fmtD(e)} is before the issue date ${fmtD(i)}`);
    if (!trim(l['Licence Category'])) add(3, 'Licences & Certificates', l['Record ID'], 'No licence category');
    if (trim(l['Licence / Certificate No.']) && !e) add(3, 'Licences & Certificates', l['Record ID'], 'Issued but no expiry date');
  });
  T.clearances.forEach(c => {
    if (!coIds.has(c['Company ID'])) add(1, 'Chemical Clearances', c['Record ID'], 'Company ID missing or not registered');
    if (trim(c['Qty as Recorded']) !== '' && !trim(c['Unit'])) add(2, 'Chemical Clearances', c['Record ID'], 'Quantity but no unit');
    if (isNum(c['Qty as Recorded']) && num(c['Qty as Recorded']) === 0) add(2, 'Chemical Clearances', c['Record ID'], 'Quantity is zero');
    if (!trim(c['Chemical (Standard)']) || /other \/ unspecified/i.test(c['Chemical (Standard)'])) add(3, 'Chemical Clearances', c['Record ID'], `No standard chemical name for "${c['Chemical as Recorded']}"`);
    if (!toDate(c['Clearance Date'])) add(2, 'Chemical Clearances', c['Record ID'], 'No clearance date');
  });
  const billNos = new Set(T.bills.map(b => b['Bill No.']));
  const D = insData(T);
  D.bills.forEach(b => { if (!b.ref) add(3, 'Bills & Invoices', b.no, 'No Bill Ref. No.'); if (!b.type) add(2, 'Bills & Invoices', b.no, 'No Bill Type (the bill letter cannot print)'); if (b.paid > b.billed + 0.005) add(1, 'Bills & Invoices', b.no, `Paid ${usd(b.paid)} is more than billed ${usd(b.billed)}`); });
  T.payments.forEach(p => {
    if (!trim(p['Bill No.'])) add(3, 'Payments & Receipts', p['Record ID'], 'Not linked to a bill');
    else if (!billNos.has(p['Bill No.'])) add(1, 'Payments & Receipts', p['Record ID'], `Bill No. ${p['Bill No.']} does not exist`);
    if (!trim(p['Receipt No.'])) add(3, 'Payments & Receipts', p['Record ID'], 'No receipt number');
  });
  const rc = {}; T.payments.forEach(p => { const k = trim(p['Receipt No.']).toLowerCase(); if (!k) return; (rc[k] = rc[k] || []).push(p['Record ID']); });
  Object.entries(rc).forEach(([k, ids]) => { if (ids.length > 1) add(1, 'Payments & Receipts', ids.join(', '), `Receipt No. ${k} recorded ${ids.length} times`); });
  return out.sort((a, b) => a.sev - b.sev);
}

/* ------------------------------------------------------------------ search */
export function searchAll(T, q, limit = 60) {
  const k = trim(q).toLowerCase(); if (!k) return [];
  const out = [];
  const push = (kind, id, title, sub, row, hay) => { if (hay.toLowerCase().includes(k)) out.push({ kind, id, title, sub, row }); };
  T.companies.forEach(r => push('company', r['Company ID'], r['Company Name'], [r['Company ID'], r['Sector / Activity'], r['Location']].filter(Boolean).join(' · '), r, [r['Company ID'], r['Company Name'], r['Other Names Recorded'], r['Location']].join(' ')));
  T.licences.forEach(r => push('licence', r['Record ID'], r['Company Name'], [r['Record ID'], r['Licence / Certificate Type'] || r['Licence Category'], r['Licence / Certificate No.']].filter(Boolean).join(' · '), r, [r['Record ID'], r['Company Name'], r['Licence / Certificate No.'], r['Licence Category'], r['Reference Code']].join(' ')));
  clearanceGroups(T).forEach(g => push('clearance', g.no, g.co, [g.no, fmtD(g.date), g.lines.length + ' line(s)', g.bls.join(', ')].filter(Boolean).join(' · '), g, [g.no, g.co, g.ref, g.bls.join(' '), g.lines.map(l => l['Chemical as Recorded'] + ' ' + l['Chemical (Standard)'] + ' ' + l['Record ID']).join(' ')].join(' ')));
  const seenB = {};
  T.bills.forEach(r => { if (seenB[r['Bill No.']]) return; seenB[r['Bill No.']] = 1; const ls = T.bills.filter(b => b['Bill No.'] === r['Bill No.']); push('bill', r['Bill No.'], r['Company Name'], [r['Bill No.'], r['Bill Type'], r['Bill Ref. No.']].filter(Boolean).join(' · '), r, [r['Bill No.'], r['Company Name'], r['Bill Ref. No.'], r['Bill Type'], ls.map(b => b['Purpose / Licence Billed'] + ' ' + b['Bill ID']).join(' ')].join(' ')); });
  T.payments.forEach(r => push('payment', r['Record ID'], r['Company Name'], [r['Record ID'], 'Receipt ' + (r['Receipt No.'] || '–'), usd(r['Amount (USD)'])].join(' · '), r, [r['Record ID'], r['Company Name'], r['Receipt No.'], r['Bill No.'], r['Purpose / Services']].join(' ')));
  (T.issues || []).forEach(r => push('issue', String(r['Issue #']), r['Issue Found'], [r['Issue #'], r['Register'], r['Follow-up Status']].join(' · '), r, [r['Issue #'], r['Register'], r['Record'], r['Issue Found'], r['Action Taken']].join(' ')));
  (T.inspections || []).forEach(r => push('inspection', r['Inspection ID'], r['Company'] || r['Site / Facility'], [r['Inspection ID'], fmtD(r['Inspection Date']), r['Compliance']].filter(Boolean).join(' · '), r, [r['Inspection ID'], r['Company'], r['Site / Facility'], r['Findings']].join(' ')));
  (T.correspondence || []).forEach(r => push('correspondence', r['Record ID'], r['Company Name'], [r['Record ID'], r['Type'], fmtD(r['Date Issued'])].filter(Boolean).join(' · '), r, [r['Record ID'], r['Company Name'], r['Type'], r['Description'], r['EPA Reference No.']].join(' ')));
  return out.slice(0, limit);
}
