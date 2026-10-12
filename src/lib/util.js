// Formatting, search and the fee calculation (same rule as the desktop: Qp = R × Hi × Qi, RI/C&E-002-04/20).

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoOf(new Date());
export const thisYear = () => new Date().getFullYear();
export const ymOf = iso => String(iso || '').slice(0, 7);
export const parts = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
export const fmtD = iso => { const p = parts(iso); return p ? `${pad(p.d)}-${MON[p.m - 1]}-${p.y}` : String(iso || ''); };
export const fmtWhen = iso => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
/** 1st January, 2026 (licences) */
export function ordinalDate(iso) {
  const p = parts(iso); if (!p) return '________';
  const s = p.d >= 11 && p.d <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][p.d % 10];
  return `${p.d}${s} ${MONTH[p.m - 1]}, ${p.y}`;
}
/** September 30, 2026 (letters) */
export const longDate = iso => { const p = parts(iso); return p ? `${MONTH[p.m - 1]} ${p.d}, ${p.y}` : ''; };
export const monthLabel = ym => { const [y, m] = String(ym).split('-'); return m ? `${MONTH[+m - 1]} ${y}` : ym; };
export const addDays = (iso, n) => { const p = parts(iso) || parts(today()); const d = new Date(p.y, p.m - 1, p.d + n); return isoOf(d); };
export const money = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = n => Math.round(Number(n) || 0).toLocaleString('en-US');
export const kgFmt = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const mtFmt = n => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 });
export const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
export const isNum = v => String(v ?? '').trim() !== '' && !isNaN(Number(String(v).replace(/,/g, '')));
export const daysUntil = iso => { const p = parts(iso); if (!p) return null; const t = parts(today()); return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(t.y, t.m - 1, t.d)) / 864e5); };
export const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
export const pct = x => (x === null || x === undefined || isNaN(x) ? '–' : Math.round(x * 100) + '%');
export const uniq = a => [...new Set(a.filter(x => x !== '' && x != null))];
export const sum = (a, f = x => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export const by = (f, desc) => (a, b) => { const x = f(a), y = f(b); const r = x < y ? -1 : x > y ? 1 : 0; return desc ? -r : r; };

/** all words must appear somewhere in the record */
export function matches(obj, q) {
  if (!q) return true;
  const hay = Object.values(obj).map(v => (typeof v === 'object' && v ? JSON.stringify(v) : v)).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/** one entry per Clearance No. */
export function groupClearances(rows) {
  const g = new Map();
  for (const r of rows) {
    const k = r['Clearance No.'] || r['Record ID'];
    if (!g.has(k)) g.set(k, { no: k, coId: r['Company ID'], co: r['Company Name'], date: r['Clearance Date'], eta: r['ETA'], ref: r['Clearance Ref. No.'], bl: r['B/L / Invoice / AWB No.'], remarks: r['Remarks'], billNo: r['Bill No.'], kg: 0, lines: [] });
    const x = g.get(k);
    x.lines.push(r);
    x.kg += num(r['Qty (kg)']);
    if (r['Clearance Date'] && (!x.date || r['Clearance Date'] < x.date)) x.date = r['Clearance Date'];
    if (!x.billNo && r['Bill No.']) x.billNo = r['Bill No.'];
  }
  return [...g.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));
}

/* ---------------- amount in words (as on the bill letters) */
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
function w999(n) {
  let s = '';
  if (n >= 100) { s = ONES[Math.floor(n / 100)] + ' HUNDRED'; n %= 100; if (n) s += ' '; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += '-' + ONES[n % 10]; } else if (n) s += ONES[n];
  return s;
}
export function amountInWords(amt) {
  const r = Math.round(num(amt) * 100) / 100, d = Math.floor(r), c = Math.round((r - d) * 100);
  const scl = ['', ' THOUSAND', ' MILLION', ' BILLION'];
  let s = '', n = d, i = 0;
  while (n > 0 && i < 4) { const ch = n % 1000; if (ch) s = w999(ch) + scl[i] + (s ? ' ' + s : ''); n = Math.floor(n / 1000); i++; }
  s = s || 'ZERO';
  if (c > 0) s += ' AND ' + String(c).padStart(2, '0') + '/100';
  return s;
}

/* ---------------- fee estimate (offline, from the Chemical Hazards sheet) */
export function toKg(q, unit) {
  if (!isNum(q)) return null;
  const u = String(unit || '').toLowerCase().replace(/\s+/g, '').replace(/\/.*$/, '');
  q = num(q);
  if (/^(kg|kgs|l|ltr|litre|liter|litres|liters)$/.test(u)) return q;
  if (/^(mt|t|ton|tons|tonne|tonnes)$/.test(u)) return q * 1000;
  if (/^g$/.test(u)) return q / 1000;
  return null;
}
export function feeLine(hazards, line) {
  const row = hazards.rows.find(r => eq(r.name, line.std)) || null;
  const hmisRaw = line.hmis !== '' && line.hmis != null ? line.hmis : row ? row.hmis : '';
  const hmis = isNum(hmisRaw) ? num(hmisRaw) : null;
  const catName = line.cat || (row ? row.cat : '');
  const cat = hazards.cats.find(c => eq(c[0], catName));
  const hiRow = hazards.hi.find(h => h[0] === hmis);
  const kg = toKg(line.qty, line.unit);
  const out = { row, hmis, catName, kg, fee: null, note: '' };
  if (!cat) out.note = 'Fee category missing – pick one.';
  else if (hmis === null) out.note = 'HMIS rating missing – take it from the SDS (never guessed).';
  else if (!hiRow) out.note = 'HMIS must be 0–4.';
  else if (kg === null) out.note = 'Quantity/unit cannot be converted to kg (pcs, cylinders…).';
  else {
    const q = cat[1] === 'MT' ? kg / 1000 : kg;
    out.fee = Math.round(cat[2] * hiRow[1] * q * 100) / 100;
    out.working = `${cat[2]} × ${hiRow[1]} × ${q.toLocaleString()} ${cat[1] === 'MT' ? 'MT' : 'kg'} = US$${money(out.fee)}`;
  }
  return out;
}

/* ---------------- fuzzy matching (company duplicates, chemical names) */
export function dice(a, b) {
  if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const m = new Map(); let n = 0;
  for (let i = 0; i < a.length - 1; i++) { const g = a.substr(i, 2); m.set(g, (m.get(g) || 0) + 1); }
  for (let i = 0; i < b.length - 1; i++) { const g = b.substr(i, 2); if (m.get(g)) { m.set(g, m.get(g) - 1); n++; } }
  return (2 * n) / (a.length + b.length - 2);
}
const STOP = new Set('inc ltd llc limited corp corporation company co the liberia lib and group plc sa'.split(' '));
export const coKey = s => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w && !STOP.has(w)).join('');
export const chemKey = s => String(s || '').toLowerCase().replace(/\d+(\.\d+)?\s*%/g, ' ').replace(/[^a-z0-9]/g, '');
export function similarCompanies(companies, name, exceptId) {
  const k = coKey(name); if (!k) return [];
  return companies.filter(r => !exceptId || r['Company ID'] !== exceptId).map(r => {
    const k2 = coKey(r['Company Name']); let sc = dice(k, k2);
    if (k2 && k.length >= 4 && k2.length >= 4 && (k2.includes(k) || k.includes(k2))) sc = Math.max(sc, 0.9);
    String(r['Other Names Recorded'] || '').split(/[;,/|\n]/).forEach(o => { sc = Math.max(sc, dice(k, coKey(o))); });
    return { id: r['Company ID'], name: r['Company Name'], score: sc };
  }).filter(x => x.score >= 0.75).sort(by(x => x.score, true)).slice(0, 3);
}
export function suggestChem(list, name, n = 3) {
  const k = chemKey(name);
  return list.map(c => { const kc = chemKey(c); let sc = dice(k, kc); if (kc && k && (kc.includes(k) || k.includes(kc))) sc = Math.max(sc, 0.85); return { name: c, score: sc }; })
    .sort(by(x => x.score, true)).slice(0, n);
}
/** "Mr. John Doe" → "Dear Mr. Doe:" */
const HON = /^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Hon\.?|Madam|Prof\.?|Rev\.?)$/i;
export function salutation(contact, title) {
  const c = String(contact || '').trim(), t = String(title || '').trim();
  if (!c) return 'Dear Sir/Madam:';
  const w = c.split(/\s+/), last = w[w.length - 1];
  if (HON.test(w[0]) && w.length > 1) return `Dear ${w[0]} ${last}:`;
  if (HON.test(t)) return `Dear ${t} ${last}:`;
  return 'Dear Sir/Madam:';
}
export function addressee(contact, title) {
  const c = String(contact || '').trim(), t = String(title || '').trim();
  if (!c) return [];
  if (HON.test(t)) return [`${t} ${c}`];
  return t ? [c, t] : [c];
}
