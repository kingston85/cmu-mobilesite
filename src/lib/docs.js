// The printed CMU documents (licences, clearance letters, bill letters) and the reports, as a simple layout model.
// The same model is shown on screen (DocView) and turned into an A4 PDF (pdf.js).
import * as W from './doctext';
import { groupClearances, num, money, money0, kgFmt, mtFmt, fmtD, ordinalDate, longDate, amountInWords, eq, today, salutation, addressee, monthLabel, pct, sum, fmtWhen } from './util';
import { aging, monthly, annual, profile, licState } from './reports';

export const DOC_KINDS = {
  CRL: 'Annual Chemical Registration License', CIL: 'Chemical Importation License', EDL: 'Annual Effluent Discharge License',
  EDLRP: 'Effluent Discharge & Retention Pond License', CERT: 'Licence / Certificate', CLR: 'Chemical Clearance Letter', BILL: 'Bill Letter',
};
/** which licence document fits a licence record */
export function licenceKind(l) {
  const c = `${l['Licence Category'] || ''} ${l['Licence / Certificate Type'] || ''}`;
  if (/retention pond/i.test(c)) return 'EDLRP';
  if (/effluent|EDL/i.test(c)) return 'EDL';
  if (/importation|CIL/i.test(c)) return 'CIL';
  if (/registration|CRL/i.test(c)) return 'CRL';
  return 'CERT';
}
export const signatories = snap => (snap.config.signatories || []).filter(s => s['Signatory']);
function signer(snap, key, fallbackSetting) {
  const all = signatories(snap), set = snap.config.settings || {};
  let s = all.find(x => eq(x['Signatory'], key)) || all.find(x => eq(x['Signatory'], 'Executive Director'));
  if (!s && fallbackSetting) s = all.find(x => eq(x['Name'], set[fallbackSetting + ' – name']));
  return s || all[0] || { Signatory: '', Name: '', Title: '', 'Office Line': '', 'Contact Line': '' };
}
const qrText = (session, kind, id, code) => {
  if (!code) return { text: `EPA LIBERIA - CMU\n${id}\n(sample – not verifiable)`, code: '' };
  const tok = code.slice(String(id).length + 1);
  if (session && session.apiUrl) return { text: `${session.apiUrl}?v=${kind}&id=${encodeURIComponent(id)}&t=${tok}`, code };
  return { text: `EPA LIBERIA - CMU\n${id}\nCode ${code}`, code };
};
const head = (snap, show, office) => (show ? [{ t: 'letterhead', lines: letterLines(snap), office }] : [{ t: 'gap', h: 38 }]);
function letterLines(snap) {
  const s = snap.config.settings || {};
  return [1, 2, 3, 4, 5].map(i => s['Letterhead line ' + i]).filter(Boolean).length ? [1, 2, 3, 4, 5].map(i => s['Letterhead line ' + i] || '')
    : ['REPUBLIC OF LIBERIA', 'ENVIRONMENTAL PROTECTION AGENCY', 'P.O. Box 4024', 'Bright Building 302-A, Sekou Toure Avenue, Mamba Point', '1000 Monrovia, 10 Liberia'];
}
const fname = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

/* ================================================================ licences */
export function licenceDoc(snap, session, l, kind, o = {}) {
  kind = kind || licenceKind(l);
  const t = snap.tables, id = l['Record ID'], co = l['Company Name'] || '', loc = l['Location'] || '', no = l['Licence / Certificate No.'] || '';
  const sg = signer(snap, o.signer, 'Licence signatory');
  const chems = t.licenceChemicals.filter(c => c['Licence Record ID'] === id);
  const eff = t.licenceEffluent.filter(e => e['Licence Record ID'] === id);
  const set = k => (eff.find(e => e['Section'] === 'Setting' && eq(e['Field 1'], k)) || {})['Field 2'] || '';
  const water = set('Receiving water'), vol = set('Max. volume (m³/day)'), point = set('Discharge point');
  const limits = eff.filter(e => e['Section'] === 'Limit').sort((a, b) => num(a['Line']) - num(b['Line']));
  const B = [...head(snap, o.letterhead !== false)];
  const title = { CRL: 'ANNUAL CHEMICAL REGISTRATION LICENSE', CIL: 'CHEMICAL IMPORTATION LICENSE', EDL: 'ANNUAL EFFLUENT DISCHARGE LICENSE', EDLRP: 'EFFLUENT DISCHARGE & RETENTION POND LICENSE',
    CERT: String(l['Licence / Certificate Type'] || l['Licence Category'] || 'LICENCE').toUpperCase() }[kind];
  B.push({ t: 'text', text: 'License No. ' + (no || '________'), bold: true, size: 11, gap: 3 });
  B.push({ t: 'text', text: title, bold: true, size: 15, align: 'center', gap: 1 }, { t: 'text', text: '(Issued under Part II Section VI of the EPA Act)', italic: true, size: 10, align: 'center', gap: 5 });
  if (kind === 'CRL' || kind === 'CIL' || kind === 'CERT') {
    B.push({ t: 'text', text: 'This is to certify that', align: 'center', size: 11, gap: 2 }, { t: 'text', text: co.toUpperCase(), bold: true, size: 14, align: 'center', gap: 1 });
    if (loc) B.push({ t: 'text', text: `(Located at ${loc})`, align: 'center', size: 10.5, gap: 4 });
    B.push({ t: 'text', text: kind === 'CRL' ? W.CRL_GRANT : kind === 'CIL' ? W.CIL_GRANT
      : `Is hereby granted this ${l['Licence / Certificate Type'] || 'licence / certificate'}, pursuant to the Environmental Protection and Management Law of Liberia, subject to the EPA Act, the guidelines of the Environmental Protection Agency of Liberia and the conditions specified in this license.`, align: 'justify', size: 11, gap: 5 });
    if (kind !== 'CERT' || chems.length) {
      B.push({ t: 'text', text: 'PRODUCT INFORMATION', bold: true, align: 'center', size: 11, gap: 2 });
      if (kind === 'CIL') B.push({ t: 'table', size: 9.5, widths: [7, 33, 25, 15, 20], head: ['No.', 'Trade or IUPAC Name', 'EPA / Registration #.', 'Stipulated Qty (kg/L)', 'Consignment Reference (BL/IPD No.)'],
        rows: chems.map((c, i) => [i + 1, c['Trade or IUPAC Name'], c['EPA Registration No.'], c['Stipulated Qty'] !== '' && c['Stipulated Qty'] != null ? `${kgFmt(c['Stipulated Qty'])} ${c['Unit'] || ''}`.trim() : '', c['Consignment Ref. (BL/IPD No.)'] || 'To Be Provided']) });
      else B.push({ t: 'table', size: 9.5, widths: [8, 46, 26, 20], head: ['No.', 'Trade or IUPAC Name', 'EPA Registration #.', 'Types'], rows: chems.map((c, i) => [i + 1, c['Trade or IUPAC Name'], c['EPA Registration No.'], c['Type']]) });
    }
    if (kind === 'CERT') {
      const v = t.licenceVehicles.filter(x => x['Licence Record ID'] === id);
      if (v.length) B.push({ t: 'text', text: 'VEHICLES', bold: true, align: 'center', size: 11, gap: 2 }, { t: 'table', size: 9.5, widths: [8, 34, 29, 29], head: ['No.', 'Vehicle Type', 'Vehicle Registration No.', 'EPA Registration No.'], rows: v.map((x, i) => [i + 1, x['Vehicle Type'], x['Vehicle Registration No.'], x['EPA Registration No.']]) });
    }
    if (kind !== 'CERT') B.push({ t: 'text', text: 'CONDITIONS', bold: true, size: 11, gap: 2 }, { t: 'list', size: 10, items: (kind === 'CRL' ? W.CRL_CONDITIONS : W.CIL_CONDITIONS).map((x, i) => [`${i + 1}.0`, x]) });
    else if (l['Remarks']) B.push({ t: 'text', text: 'Remarks: ' + l['Remarks'], size: 10, gap: 3 });
  } else if (kind === 'EDL') {
    B.push({ t: 'text', text: 'LICENSEE', bold: true, size: 10.5, gap: 0.5 }, { t: 'text', text: co.toUpperCase(), bold: true, size: 13, gap: 2 },
      { t: 'text', text: 'LOCATION', bold: true, size: 10.5, gap: 0.5 }, { t: 'text', text: loc || '–', size: 11, gap: 4 }, { t: 'text', text: W.EDL_GRANT, align: 'justify', size: 11, gap: 4 },
      { t: 'text', text: 'CONDITIONS', bold: true, size: 11, gap: 2 },
      { t: 'list', size: 10, items: [['1.', `This license refers to the discharge of treated trade effluent from only the proposed development of ${co}${loc ? ' at ' + loc : ''}${point ? ' ' + point : ''};`],
        ['2.', `The total volume of the treated trade effluent discharged to ${water || '________'} shall not exceed ${vol || '____'}m³/day;`], ['3.', W.EDL_C3], ['4.', W.EDL_C4]] },
      { t: 'table', size: 9.5, widths: [40, 15, 20, 25], indent: 8, head: ['Parameter', 'Unit', 'Limit', 'Testing Schedule'], rows: limits.map(x => [x['Field 1'], x['Field 2'], x['Field 3'], x['Field 5']]) },
      { t: 'list', size: 10, items: W.EDL_CONDITIONS_AFTER.map((x, i) => [`${i + 5}.`, x]) });
  } else {    // EDL – retention pond
    const coords = eff.filter(e => e['Section'] === 'Coordinate'), srcs = eff.filter(e => e['Section'] === 'Source');
    const stages = [...new Set(limits.map(x => x['Field 6'] || ''))];
    B.push({ t: 'text', text: 'LICENSEE', bold: true, size: 10.5, gap: 0.5 }, { t: 'text', text: co.toUpperCase(), bold: true, size: 13, gap: 2 },
      { t: 'text', text: 'LOCATION', bold: true, size: 10.5, gap: 0.5 }, { t: 'text', text: loc || '–', size: 11, gap: 4 },
      { t: 'text', text: `In pursuant to Part 5 Section 56-60 of the Environmental Protection and Management Law of Liberia (EPML), this Effluent Discharge & Retention Pond License is hereby issued to ${co} (hereafter called the licensee) for the discharge of treated effluents subject to the Act of the Environmental Protection Agency of Liberia, the Liberia Water Quality Standards and all other conditions specified in this license.`, align: 'justify', size: 11, gap: 4 },
      { t: 'text', text: '1.   Project Geo-reference', bold: true, size: 11, gap: 1.5 }, { t: 'text', text: W.RP_GEO, size: 10.5, gap: 2, indent: 8 });
    const c1a = coords.filter(c => !/1B/i.test(c['Field 1'])), c1b = coords.filter(c => /1B/i.test(c['Field 1']));
    if (c1a.length) B.push({ t: 'text', text: 'Table 1A: Metes and bounds of the discharge sources', bold: true, size: 10, gap: 1, indent: 8 }, { t: 'table', size: 9.5, indent: 8, widths: [30, 35, 35], head: ['Vertex', 'Eastern', 'Northern'], rows: c1a.map(c => [c['Field 2'], c['Field 3'], c['Field 4']]) });
    if (srcs.some(s => s['Field 3'] || s['Field 4']) || c1b.length) {
      B.push({ t: 'text', text: 'Table 1B: Metes and bounds of the discharge sources', bold: true, size: 10, gap: 1, indent: 8 });
      if (srcs.some(s => s['Field 3'] || s['Field 4'])) B.push({ t: 'table', size: 9.5, indent: 8, widths: [40, 30, 30], head: ['Discharge source', 'X', 'Y'], rows: srcs.map(s => [s['Field 1'], s['Field 3'], s['Field 4']]) });
      if (c1b.length) B.push({ t: 'table', size: 9.5, indent: 8, widths: [30, 35, 35], head: ['Vertex', 'Eastern', 'Northern'], rows: c1b.map(c => [c['Field 2'], c['Field 3'], c['Field 4']]) });
    }
    B.push({ t: 'text', text: W.RP_GEO_END, size: 10.5, gap: 4, indent: 8, align: 'justify' },
      { t: 'text', text: '2.0   EFFLUENT DISCHARGE', bold: true, size: 11, gap: 1.5 },
      { t: 'text', text: `In pursuance of the Environment Protection & Management Law of Liberia, 2003 Part III Sections 8 (1), 13 and based on the Submitted Project Brief and Audit Report for Effluent Discharge, ${co} is hereby issued this License to discharge treated effluent water as per the applicable Class of the Liberia Water Quality Standards/Guide (1987), Liberia Effluent Guideline Values and IFC Effluent guidelines as indicated below:`, size: 10.5, gap: 2, indent: 8, align: 'justify' },
      { t: 'text', text: 'Table 2: Effluent discharge sources and receiving units.', bold: true, size: 10, gap: 1, indent: 8 },
      { t: 'table', size: 9.5, indent: 8, widths: [50, 50], head: ['Discharge source', 'Receiving unit'], rows: srcs.map(s => [s['Field 1'], s['Field 2']]) },
      { t: 'text', text: '3.0   CONDITIONS OF LICENSE', bold: true, size: 11, gap: 1.5 }, { t: 'text', text: '3.1   COMPLY WITH THE FOLLOWING MITIGATION MEASURES:', bold: true, size: 10.5, gap: 1.5, indent: 4 },
      { t: 'text', text: `During the effective period of this license, ${co} is authorized to discharge its effluent ${point || '________'} to ${water || '________'}${vol ? ` (not exceeding ${vol} m³/day)` : ''} within the specific limits and subject to the condition set forth herein.`, size: 10.5, gap: 2, indent: 8, align: 'justify' },
      { t: 'text', text: W.RP_C31B, size: 10.5, gap: 3, indent: 8, align: 'justify' });
    stages.forEach((st, i) => {
      B.push({ t: 'text', text: `${co} must limit and monitor discharges${st ? ' from ' + st : ''} as specified in Table ${i + 3}. The figure represents maximum effluent limits unless otherwise indicated. The licensee must comply with the effluent limits in the tables unless otherwise indicated, regardless of the frequency of monitoring or reporting required by other provisions of this license.`, size: 10.5, gap: 1.5, indent: 8, align: 'justify' },
        { t: 'text', text: `Table ${i + 3}${st ? ': ' + st : ''}`, bold: true, size: 10, gap: 1, indent: 8 },
        { t: 'table', size: 9.5, indent: 8, widths: [32, 14, 22, 16, 16], head: ['Parameter', 'Unit', 'Maximum Discharge Limit', 'Sample Type', 'Testing Schedule'], rows: limits.filter(x => (x['Field 6'] || '') === st).map(x => [x['Field 1'], x['Field 2'], x['Field 3'], x['Field 4'], x['Field 5']]) });
    });
    B.push({ t: 'text', text: '3.2   GENERAL CONDITIONS', bold: true, size: 10.5, gap: 1.5, indent: 4 }, { t: 'list', size: 10, indent: 8, items: W.RP_GENERAL.map((x, i) => [`${i + 1}.`, x]) });
  }
  B.push({ t: 'gap', h: 3 }, { t: 'twocol', left: 'Issued Date:  ' + ordinalDate(l['Date Issued']), right: 'Expired Date:  ' + ordinalDate(l['Expiry Date']), bold: true, size: 10.5 });
  B.push({ t: 'sign', name: sg['Name'], title: sg['Title'], qr: o.qr === false ? null : qrText(session, 'licence', id, snap.codes.licence[id]) });
  return { title: `${DOC_KINDS[kind]} – ${co}`, filename: fname(`${kind} ${no || id} ${co}.pdf`), font: 'times', blocks: B, record: id };
}

/* ================================================================ clearance letter */
export function clearanceDoc(snap, session, cln, o = {}) {
  const g = groupClearances(snap.tables.clearances.filter(r => r['Clearance No.'] === cln))[0];
  if (!g) return null;
  const sg = signer(snap, o.signer, 'Clearance signatory');
  const B = [...head(snap, o.letterhead !== false), { t: 'office', office: sg['Office Line'], contact: sg['Contact Line'] }];
  B.push({ t: 'text', text: g.ref || '', bold: true, size: 11, gap: 2 }, { t: 'text', text: longDate(g.date), size: 11, gap: 5 },
    { t: 'text', text: 'TO WHOM IT MAY CONCERN', bold: true, size: 11.5, gap: 4, underline: true },
    { t: 'text', text: `This is to testify that ${g.co} is in the process of obtaining the Environmental Protection Agency (EPA) Importation License issued for the clearance of the following consignments:`, align: 'justify', size: 11, gap: 4 },
    { t: 'table', size: 10, widths: [38, 20, 24, 18], head: ['Description', 'Weight (Kgs)', 'BL/ Invoice No.', 'ETA'],
      rows: g.lines.map(l => [String(l['Chemical as Recorded'] || l['Chemical (Standard)'] || '').toUpperCase(), l['Qty (kg)'] !== '' ? kgFmt(l['Qty (kg)']) + 'KGS' : `${l['Qty as Recorded'] || ''} ${l['Unit'] || ''}`, l['B/L / Invoice / AWB No.'] || '', fmtD(l['ETA'] || g.eta)]) },
    { t: 'text', text: W.CLR_REQUEST, align: 'justify', size: 11, gap: 3 }, { t: 'text', text: W.CLOSING_CLR, align: 'justify', size: 11, gap: 4 },
    { t: 'text', text: 'Kind regards,', size: 11, gap: 2 },
    { t: 'sign', name: sg['Name'], title: sg['Title'], left: true, qr: o.qr === false ? null : qrText(session, 'clearance', cln, snap.codes.clearance[cln]) });
  return { title: `Clearance letter ${cln} – ${g.co}`, filename: fname(`Clearance ${cln} ${g.co}.pdf`), font: 'times', blocks: B, record: cln };
}

/* ================================================================ bill letter */
export function billDoc(snap, session, no, o = {}) {
  const b = snap.insights.bills.find(x => x.no === no); if (!b) return null;
  const lines = snap.tables.bills.filter(r => r['Bill No.'] === no);
  const bt = (snap.config.billTypes || []).find(x => eq(x['Bill Type'], b.type)) || (snap.config.billTypes || [])[0] || {};
  const sg = signer(snap, o.signer, 'Bill signatory'), set = snap.config.settings || {};
  const c = snap.tables.companies.find(x => x['Company ID'] === b.coId) || {};
  const services = [...new Set(lines.map(l => l['Purpose / Licence Billed']).filter(Boolean))].join(', ');
  const details = lines[0] ? lines[0]['Chemical'] || '' : '';
  const fill = s => String(s || '').replace(/\{SERVICES\}/g, services).replace(/\{DETAILS\}/g, details).replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ');
  const to = billAddressee(snap, b), contact = o.contact !== undefined ? o.contact : to.contact, title = o.title !== undefined ? o.title : to.title, address = o.address !== undefined ? o.address : to.address;
  const B = [...head(snap, o.letterhead !== false), { t: 'office', office: sg['Office Line'], contact: sg['Contact Line'] }];
  B.push({ t: 'text', text: b.ref || '', bold: true, size: 11, gap: 2 }, { t: 'text', text: longDate(b.date), size: 11, gap: 4 });
  // the recipient block: name (with Mr./Dr./Hon.), position, company, address – as on the Print Bill sheet
  const who = addressee(contact, title), addrLines = String(address || '').split(/\n|;\s*/).map(x => x.trim()).filter(Boolean);
  who.forEach((t, i) => B.push({ t: 'text', text: t, bold: i === 0, size: 11, gap: 0.3 }));
  B.push({ t: 'text', text: b.co, bold: who.length === 0, size: 11, gap: addrLines.length ? 0.3 : 4 });
  addrLines.forEach((a, i) => B.push({ t: 'text', text: a, size: 11, gap: i === addrLines.length - 1 ? 4 : 0.3 }));
  B.push({ t: 'text', text: o.salutation || salutation(contact, title), size: 11, gap: 3 });
  B.push({ t: 'text', text: fill(bt['Opening Paragraph']), align: 'justify', size: 11, gap: 3 });
  if (bt['Extra Paragraph']) B.push({ t: 'text', text: fill(bt['Extra Paragraph']), align: 'justify', size: 11, gap: 3 });
  B.push({ t: 'text', text: `${bt['Bill Sentence (starts)'] || 'The total bill is'} UNITED STATES DOLLARS-${amountInWords(b.billed)} (US$${money(b.billed)}) payable at the ${set['Bank name'] || 'Eco-Bank Liberia Limited'}; Account Number: ${set['Account number'] || '6100064132'}; Account Title: ${set['Account title'] || 'NATIONAL ENVIRONMENTAL COMMISSION'}.`, align: 'justify', size: 11, gap: 3 });
  if (!/^no$/i.test(String(bt['Show Fee Table'] || 'Yes'))) B.push({ t: 'table', size: 10, widths: [8, 42, 30, 20], head: ['No.', 'Service', 'Details', 'Amount (USD)'], align: [null, null, null, 'right'],
    rows: lines.map((l, i) => [i + 1, l['Purpose / Licence Billed'], l['Chemical'] || '', money(l['Amount Billed (USD)'])]), foot: ['', '', 'TOTAL', money(b.billed)] });
  let coll = fill(bt['Collection Paragraph']);
  if (o.deadline) coll = coll.replace('Please come', `Please pay this amount within ${set['Payment deadline (words)'] || 'seventy-two (72) hours'} of receipt of this communication and come`);
  B.push({ t: 'text', text: coll, align: 'justify', size: 11, gap: 3 }, { t: 'text', text: W.CLOSING_BILL, align: 'justify', size: 11, gap: 4 }, { t: 'text', text: 'Kind regards,', size: 11, gap: 2 },
    { t: 'sign', name: sg['Name'], title: sg['Title'], left: true, qr: o.qr === false ? null : qrText(session, 'bill', no, snap.codes.bill[no]) },
    { t: 'text', text: 'CC: Finance Department', size: 10, gap: 3 }, { t: 'text', text: W.MOTTO, italic: true, align: 'center', size: 10, gap: 0 });
  return { title: `Bill ${no} – ${b.co}`, filename: fname(`Bill ${no} ${b.co}.pdf`), font: 'times', blocks: B, record: no };
}

/** who a bill letter is addressed to: the bill's own contact, else the company's contact on Company Contacts; the address from the bill, else the company */
export function billAddressee(snap, b) {
  const c = snap.tables.companies.find(x => x['Company ID'] === b.coId) || {};
  const contact = b.contact || c['Contact Person'] || '', title = b.contact ? b.title || (eq(b.contact, c['Contact Person']) ? c['Contact Title'] : '') || '' : c['Contact Title'] || b.title || '';
  return { contact, title, address: b.location || c['Location'] || '' };
}

/* ================================================================ reports (Helvetica, CMU heading) */
const rHead = (title, sub) => [{ t: 'rhead', title, sub: sub || 'Environmental Research & Radiation Safety (ERRS) Department  |  Chemical Management Unit (CMU)' }];
const sec = text => ({ t: 'section', text });
const none = 'None.';
const tbl = (head, rows, widths, extra = {}) => (rows.length ? { t: 'table', head, rows, widths, size: 8.5, ...extra } : { t: 'text', text: none, italic: true, size: 9, gap: 3 });
const by0 = s => (s && s.user ? s.user.name : '');
const gen = session => ({ t: 'text', text: `Figures from the CMU Database registers. Generated ${fmtWhen(new Date().toISOString())}${by0(session) ? ' by ' + by0(session) : ''}.`, italic: true, size: 8.5, gap: 4 });
const signoff = { t: 'twocol', left: 'Prepared by: ______________________________\n\nDate: ________________', right: 'Approved by: ______________________________\n\nDate: ________________', size: 9.5 };

export function monthlyDoc(snap, session, ym) {
  const R = monthly(snap, ym), L = monthLabel(ym).toUpperCase();
  const B = [...rHead(`MONTHLY REPORT  –  ${L}`), gen(session), sec('1.  SUMMARY'),
    { t: 'table', size: 9, widths: [56, 22, 22], head: ['Item', monthLabel(ym), 'Year to date'], align: [null, 'right', 'right'],
      rows: R.summary.map(([k, a, b]) => [k, /US\$/.test(k) ? money0(a) : /MT/.test(k) ? mtFmt(a) : a, /US\$/.test(k) ? money0(b) : /MT/.test(k) ? mtFmt(b) : b]).concat([[`Billed minus received, to the end of ${monthLabel(ym)} (US$)`, money0(R.balance), '']]) },
    sec('2.  LICENCES & CERTIFICATES ISSUED'), tbl(['Record ID', 'Company', 'Licence / Certificate', 'Licence No.', 'Issued', 'Expires'], R.licences.map(l => [l['Record ID'], l['Company Name'], l['Licence / Certificate Type'], l['Licence / Certificate No.'], fmtD(l['Date Issued']), fmtD(l['Expiry Date'])]), [11, 25, 22, 20, 11, 11]),
    sec('3.  CHEMICAL CLEARANCES'), tbl(['Clearance No.', 'Company', 'Chemical', 'Quantity (kg)', 'Date'], R.clearances.map(c => [c.no, c.co, c.chem, kgFmt(c.kg), fmtD(c.date)]), [13, 32, 29, 14, 12], { foot: ['', 'TOTAL', '', kgFmt(sum(R.clearances, c => c.kg)), ''], align: [null, null, null, 'right'] }),
    sec('4.  BILLS ISSUED'), tbl(['Bill No.', 'Company', 'Bill Type / Purpose', 'Bill Ref. No.', 'Date', 'Amount (US$)'], R.bills.map(b => [b.no, b.co, b.type || b.purpose, b.ref, fmtD(b.date), money(b.billed)]), [14, 26, 22, 16, 10, 12], { align: [null, null, null, null, null, 'right'] }),
    sec('5.  PAYMENTS RECEIVED'), tbl(['Record ID', 'Company', 'Receipt No.', 'Bill No.', 'Date', 'Amount (US$)'], R.payments.map(p => [p['Record ID'], p['Company Name'], p['Receipt No.'], p['Bill No.'], fmtD(p['Payment Date']), money(p['Amount (USD)'])]), [11, 33, 13, 15, 12, 16], { foot: ['', 'TOTAL', '', '', '', money(sum(R.payments, p => p['Amount (USD)']))], align: [null, null, null, null, null, 'right'] }),
    sec(`6.  LICENCES EXPIRING NEXT MONTH (${monthLabel(R.nym)}, not yet renewed)`), tbl(['Record ID', 'Company', 'Licence / Certificate', 'Licence No.', 'Expires'], R.expiringNext.map(l => [l['Record ID'], l['Company Name'], l['Licence / Certificate Type'], l['Licence / Certificate No.'], fmtD(l['Expiry Date'])]), [12, 32, 24, 20, 12]),
    sec(`7.  BILLS UNPAID FOR MORE THAN 30 DAYS (as at ${fmtD(today())})`), tbl(['Bill No.', 'Company', 'Bill Type', 'Bill Date', 'Days old', 'Outstanding (US$)'], R.old.map(b => [b.no, b.co, b.type, fmtD(b.date), b.age, money(b.out)]), [14, 30, 20, 12, 9, 15], { foot: ['', 'TOTAL', '', '', '', money(sum(R.old, b => b.out))], align: [null, null, null, null, 'right', 'right'] }),
    { t: 'gap', h: 8 }, signoff];
  return { title: `Monthly report ${monthLabel(ym)}`, filename: `CMU Monthly Report ${ym}.pdf`, font: 'helvetica', blocks: B };
}
export function annualDoc(snap, session, y, target = 0) {
  const R = annual(snap, y, target), A = R.A, P = R.P;
  const ch = (a, b) => (b ? pct((a - b) / b) : '–');
  const B = [...rHead(`ANNUAL REPORT ${y}${y === new Date().getFullYear() ? `  (year to date, ${fmtD(today())})` : ''}`), gen(session), sec('1.  KEY FIGURES'),
    { t: 'table', size: 9, widths: [46, 18, 18, 18], align: [null, 'right', 'right', 'right'], head: ['', String(y), String(y - 1), 'Change'], rows: [
      ['Licences & certificates issued', A.lic, P.lic, ch(A.lic, P.lic)], ['Chemical clearances (Clearance Nos.)', A.clr, P.clr, ch(A.clr, P.clr)], ['Quantity cleared (MT)', mtFmt(A.mt), mtFmt(P.mt), ch(A.mt, P.mt)],
      ['Bills issued', A.bills, P.bills, ch(A.bills, P.bills)], ['Amount billed (US$)', money0(A.billed), money0(P.billed), ch(A.billed, P.billed)], ['Amount received (US$)', money0(A.recv), money0(P.recv), ch(A.recv, P.recv)],
      ['Collection rate (received ÷ billed)', pct(R.collection), '', ''], [`Billed minus received, to the end of ${y} (US$)`, money0(R.balance), '', ''],
      ...(target ? [['Revenue target (US$)', money0(target), '', pct(A.recv / target) + ' reached']] : [])] },
    sec('2.  MONTH BY MONTH'), { t: 'table', size: 8.5, widths: [20, 14, 16, 16, 17, 17], align: [null, 'right', 'right', 'right', 'right', 'right'], head: ['Month', 'Licences', 'Clearances', 'Cleared (MT)', 'Billed (US$)', 'Received (US$)'],
      rows: R.months.map(m => [monthLabel(m.ym), m.lic, m.clr, mtFmt(m.mt), money0(m.billed), money0(m.paid)]),
      foot: ['TOTAL', sum(R.months, m => m.lic), sum(R.months, m => m.clr), mtFmt(sum(R.months, m => m.mt)), money0(sum(R.months, m => m.billed)), money0(sum(R.months, m => m.paid))] },
    { t: 'chart', kind: 'bars', title: 'Cleared (MT) by month', labels: R.months.map(m => m.ym.slice(5)), series: [R.months.map(m => m.mt)] },
    sec('3.  LICENCES & CERTIFICATES BY CATEGORY'), tbl(['Category', `Issued in ${y}`, 'Active today', 'Expired, not renewed'], R.cats.map(c => [c.cat, c.issued, c.active, c.expired]), [46, 18, 18, 18]),
    sec('4.  TOP 10 IMPORTERS (quantity cleared)'), tbl(['Company', 'MT', 'Share'], R.importers.map((x, i) => [`${i + 1}.  ${x.name}`, mtFmt(x.mt), pct(x.share)]), [64, 18, 18], { align: [null, 'right', 'right'] }),
    sec('5.  TOP 10 CHEMICALS (quantity cleared)'), tbl(['Chemical', 'MT', 'Share'], R.chemicals.map((x, i) => [`${i + 1}.  ${x.name}`, mtFmt(x.mt), pct(x.share)]), [64, 18, 18], { align: [null, 'right', 'right'] }),
    sec('6.  REVENUE BY BILL TYPE'), tbl(['Bill type', 'Billed (US$)', 'Share'], R.revenue.map(x => [x.type, money0(x.billed), pct(x.share)]), [60, 22, 18], { align: [null, 'right', 'right'] }),
    sec('7.  COMPLIANCE INDICATORS'), tbl(['Indicator', 'Result', 'Basis'], R.compliance.map(([k, v, b]) => [k, v === null ? 'n/a' : typeof v === 'number' && v <= 1 && /renewed|paid in full/.test(k) ? pct(v) : v, b]), [40, 14, 46]),
    { t: 'gap', h: 8 }, signoff];
  return { title: `Annual report ${y}`, filename: `CMU Annual Report ${y}.pdf`, font: 'helvetica', blocks: B };
}
export function insightsDoc(snap, session) {
  const I = snap.insights, A = aging(I.bills);
  const B = [...rHead('INSIGHTS & ALERTS  –  licences to renew and bills to collect'), gen(session),
    { t: 'kv', rows: [['Expired, not renewed', I.alerts.filter(a => a.days < 0).length], ['Expire within 30 days', I.alerts.filter(a => a.days >= 0 && a.days <= 30).length], [`Expire in 31 – ${I.ahead || 60} days`, I.alerts.filter(a => a.days > 30).length], ['Bills unpaid > 30 days', A.unpaid.filter(b => b.age > 30).length], ['Outstanding (US$)', money(A.total)]] },
    sec('LICENCES & CERTIFICATES  –  expiring soon or recently expired (not yet renewed)'),
    tbl(['Record ID', 'Company', 'Licence / Certificate Type', 'Licence No.', 'Expiry Date', 'Days left'], I.alerts.map(a => [a.id, a.co, a.type, a.no, fmtD(a.expiry), a.days]), [11, 27, 22, 20, 12, 8]),
    sec('UNPAID BILLS  –  aging (age = days since the bill date)'), { t: 'table', size: 9, widths: [50, 20, 30], align: [null, 'right', 'right'], head: ['Age', 'Bills', 'Outstanding (US$)'], rows: A.rows.map(r => [r.label, r.n, money(r.out)]), foot: ['TOTAL', A.unpaid.length, money(A.total)] },
    tbl(['Bill No.', 'Company', 'Bill Type / Purpose', 'Bill Ref. No.', 'Bill Date', 'Days old', 'Outstanding (US$)', 'Status'], A.unpaid.map(b => [b.no, b.co, b.type || b.purpose, b.ref, fmtD(b.date), b.age ?? '', money(b.out), b.status]), [12, 20, 15, 12, 10, 7, 11, 13])];
  return { title: 'Insights & alerts', filename: `CMU Insights ${today()}.pdf`, font: 'helvetica', blocks: B };
}
export function quotaDoc(snap, session) {
  const q = snap.insights.quotas;
  const B = [...rHead('IMPORT QUOTAS  –  licensed quantities (CIL) against clearances'), gen(session),
    { t: 'kv', rows: [['Over quota', q.filter(x => x.status === 'OVER QUOTA').length], ['Near limit (80%+)', q.filter(x => /Near/.test(x.status)).length], ['Not on licence', (snap.insights.notOn || []).length], ['Clearance lines without a valid CIL', snap.insights.noLic || 0]] },
    tbl(['Licence', 'Licence No.', 'Company', 'Chemical', 'Licensed (kg)', 'Cleared (kg)', 'Used', 'Status'], q.map(x => [x.lic, x.licNo, x.co, x.chem, x.limit === null ? '–' : kgFmt(x.limit) + (x.perMonth ? '/month' : ''), kgFmt(x.used), pct(x.pct), x.status]), [9, 15, 17, 20, 11, 11, 6, 11]),
    sec('CLEARED BUT NOT ON THE COMPANY\'S LICENCE'), tbl(['Clearance', 'Company', 'Chemical', 'kg', 'Date', 'Licence'], (snap.insights.notOn || []).map(x => [x.cln, x.co, x.chem, kgFmt(x.kg), fmtD(x.date), `${x.lic} ${x.licNo}`]), [12, 24, 24, 12, 12, 16])];
  return { title: 'Import quotas', filename: `CMU Quota Tracker ${today()}.pdf`, font: 'helvetica', blocks: B };
}
export function profileDoc(snap, session, coId) {
  const P = profile(snap, coId); if (!P) return null;
  const c = P.c;
  const B = [...rHead('COMPANY PROFILE', c['Company Name']), { t: 'text', text: `Printed ${fmtWhen(new Date().toISOString())} from the CMU Database (EPA Liberia – ERRS, Chemical Management Unit).`, italic: true, size: 8.5, gap: 3 },
    { t: 'kv', rows: [['Company ID', c['Company ID']], ['Sector / Activity', c['Sector / Activity']], ['Location', c['Location']], ['Other names', c['Other Names Recorded']], ['Contact person', [c['Contact Person'], c['Contact Title']].filter(Boolean).join(', ') || '–'], ['Phone', c['Phone'] || '–'], ['Email', c['Email'] || '–']] },
    sec('SNAPSHOT'), { t: 'kv', rows: [['Licences / certificates', `${P.lic.length}  (${P.active} active, ${P.expired} expired)`], [`Quantity cleared ${new Date().getFullYear()}`, kgFmt(P.kgYear) + ' kg'], ['Quantity cleared, all records', kgFmt(P.kgAll) + ' kg'], ['Billed (US$)', money(P.billed)], ['Paid (US$)', money(P.paid)], ['Balance (US$)', money(P.balance)]] },
    sec('LICENCES & CERTIFICATES'), tbl(['Record ID', 'Licence / Certificate', 'Licence No.', 'Issued', 'Expires', 'Status'], P.lic.map(l => [l['Record ID'], l['Licence / Certificate Type'], l['Licence / Certificate No.'], fmtD(l['Date Issued']), fmtD(l['Expiry Date']), licState(l)]), [12, 26, 22, 13, 13, 14]),
    sec('BILLS'), tbl(['Bill No.', 'Bill Type / Purpose', 'Bill Ref. No.', 'Date', 'Billed (US$)', 'Outstanding (US$)'], P.bills.map(b => [b.no, b.type || b.purpose, b.ref, fmtD(b.date), money(b.billed), money(b.out)]), [15, 25, 18, 12, 15, 15], { align: [null, null, null, null, 'right', 'right'] }),
    sec('PAYMENTS'), tbl(['Record ID', 'Purpose / Services', 'Receipt No.', 'Bill No.', 'Date', 'Amount (US$)'], P.pays.map(p => [p['Record ID'], p['Purpose / Services'], p['Receipt No.'], p['Bill No.'], fmtD(p['Payment Date']), money(p['Amount (USD)'])]), [12, 30, 14, 15, 13, 16], { foot: ['', 'TOTAL', '', '', '', money(P.paid)], align: [null, null, null, null, null, 'right'] }),
    sec('CHEMICAL CLEARANCES'), tbl(['Clearance No.', 'Chemical', 'EPA Ref. No.', 'Date', 'Quantity (kg)'], P.cl.flatMap(g => g.lines.map(l => [g.no, l['Chemical (Standard)'] || l['Chemical as Recorded'], g.ref, fmtD(g.date), kgFmt(l['Qty (kg)'])])), [15, 35, 22, 13, 15], { align: [null, null, null, null, 'right'] }),
    ...(P.quotas.length ? [sec('IMPORT QUOTAS'), tbl(['Licence', 'Chemical', 'Licensed (kg)', 'Cleared (kg)', 'Status'], P.quotas.map(x => [x.lic, x.chem, x.limit === null ? '–' : kgFmt(x.limit), kgFmt(x.used), x.status]), [14, 36, 17, 17, 16])] : []),
    ...(P.insp.length ? [sec('FIELD INSPECTIONS'), tbl(['ID', 'Date', 'Site', 'Compliance', 'Findings'], P.insp.map(i => [i['Inspection ID'], fmtD(i['Inspection Date']), i['Site / Facility'], i['Compliance'], i['Findings']]), [11, 12, 22, 15, 40])] : []),
    ...(P.cor.length ? [sec('CORRESPONDENCE'), tbl(['ID', 'Type', 'Description', 'EPA Ref.'], P.cor.map(x => [x['Record ID'], x['Type'], x['Description'], x['EPA Reference No.']]), [12, 20, 48, 20])] : [])];
  return { title: `Company profile – ${c['Company Name']}`, filename: fname(`Company Profile ${c['Company ID']} ${c['Company Name']}.pdf`), font: 'helvetica', blocks: B };
}
/** any register list as a table (Sort & download) */
export function registerDoc(title, columns, rows) {
  const w = columns.map(() => 100 / columns.length);
  return { title, filename: fname(`CMU ${title} ${today()}.pdf`), font: 'helvetica', landscape: columns.length > 6,
    blocks: [...rHead(title.toUpperCase()), { t: 'text', text: `${rows.length} record(s) · ${fmtD(today())}`, italic: true, size: 8.5, gap: 3 }, { t: 'table', size: 7.5, widths: w, head: columns.map(c => c.label), rows: rows.map(r => columns.map(c => c.value(r))) }] };
}
