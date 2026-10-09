// Exports made on the phone (work offline): CSV, Excel and PDF reports. Official letters with QR codes come from the
// database's own print pages (Print ▸ Official PDF), so they are identical to the desktop ones.
import { saveAndShare } from './device';
import { money, fmtD, MON, str, num, usd, amountInWords, topN } from './logic';

const NAVY = [31, 78, 120], PALE = [221, 235, 247], GREY = [89, 89, 89];
const stamp = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ CSV + Excel */
const esc = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(cols, rows) { return '﻿' + [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(c.get(r))).join(','))].join('\r\n'); }
export const exportCsv = (name, cols, rows) => saveAndShare(`${name} ${stamp()}.csv`, toCsv(cols, rows), 'text/csv');
export async function exportXlsx(name, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.cols.map(c => c.label), ...s.rows.map(r => s.cols.map(c => { const v = c.get(r); return v === undefined || v === null ? '' : v; }))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.cols.map(c => ({ wch: Math.min(48, Math.max(10, c.label.length + 2, ...s.rows.slice(0, 200).map(r => String(c.get(r) ?? '').length + 1))) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: s.cols.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
  }
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return saveAndShare(`${name} ${stamp()}.xlsx`, b64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { base64: true });
}

/* ------------------------------------------------------------------ PDF writer */
async function pdfKit(landscape = false) {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  let y = M;
  const K = {
    doc, W, H, M,
    get y() { return y; }, set y(v) { y = v; },
    need(h) { if (y + h > H - 16) { doc.addPage(); y = M; } },
    header(title, sub) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...NAVY);
      doc.text('ENVIRONMENTAL PROTECTION AGENCY OF LIBERIA', W / 2, y + 4, { align: 'center' }); y += 9;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
      doc.text('Environmental Research & Radiation Safety (ERRS) Department  |  Chemical Management Unit (CMU)', W / 2, y, { align: 'center' }); y += 6;
      doc.setFillColor(...NAVY); doc.rect(M, y, W - 2 * M, 9, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255); doc.text(title.toUpperCase(), W / 2, y + 6, { align: 'center' }); y += 13;
      if (sub) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(sub, W - 2 * M), M, y); y += 4 + 3.6 * Math.max(0, doc.splitTextToSize(sub, W - 2 * M).length - 1); }
      y += 2;
    },
    section(t) { K.need(14); doc.setFillColor(...PALE); doc.rect(M, y, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text(t, M + 2, y + 5); y += 9; },
    text(t, size = 9, style = 'normal', color = 40) { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(color); const ls = doc.splitTextToSize(String(t), W - 2 * M); K.need(ls.length * size * 0.42 + 2); doc.text(ls, M, y + size * 0.35); y += ls.length * size * 0.42 + 2; },
    kv(pairs) {
      autoTable(doc, { startY: y, theme: 'plain', margin: { left: M, right: M }, styles: { fontSize: 9, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: 'bold', textColor: [68, 84, 106], cellWidth: 52 } },
        body: pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '').map(p => [p[0], String(p[1])]) });
      y = doc.lastAutoTable.finalY + 3;
    },
    table(head, body, opts = {}) {
      if (!body.length) { K.text(opts.empty || 'None.', 8.5, 'italic', 120); return; }
      autoTable(doc, { startY: y, head: [head], body, foot: opts.foot ? [opts.foot] : undefined, margin: { left: M, right: M }, theme: 'grid',
        styles: { fontSize: opts.size || 8.2, cellPadding: 1.4, overflow: 'linebreak', lineColor: [210, 215, 222], lineWidth: 0.1 },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [242, 242, 242], textColor: 20, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 249, 252] }, columnStyles: opts.cols || {}, didParseCell: opts.didParseCell });
      y = doc.lastAutoTable.finalY + 4;
    },
    bars(title, labels, series, colors) {   // a small bar chart drawn with lines
      K.need(62); const x0 = M + 10, w = W - 2 * M - 14, h = 40, top = y + 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY); doc.text(title, M, y + 2);
      const max = Math.max(1, ...series.flat()); const n = labels.length, gw = w / n, bw = (gw * 0.7) / series.length;
      doc.setDrawColor(200); doc.line(x0, top + h, x0 + w, top + h);
      labels.forEach((lb, i) => {
        series.forEach((s, k) => { const bh = (s[i] / max) * h; doc.setFillColor(...colors[k]); if (bh > 0) doc.rect(x0 + i * gw + gw * 0.15 + k * bw, top + h - bh, bw - 0.3, bh, 'F'); });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(90); doc.text(lb, x0 + i * gw + gw / 2, top + h + 4, { align: 'center' });
      });
      doc.setFontSize(6.5); doc.text(money(max, 0), x0 - 1, top + 2, { align: 'right' }); doc.text('0', x0 - 1, top + h, { align: 'right' });
      y = top + h + 9;
    },
    signatures() { K.need(24); y += 8; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
      doc.text('Prepared by: ____________________________', M, y); doc.text('Approved by: ____________________________', W / 2 + 4, y); y += 7;
      doc.text('Date: ________________', M, y); doc.text('Date: ________________', W / 2 + 4, y); y += 6; },
    async finish(name, share = true) {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140);
        doc.text(`CMU Database – generated ${fmtD(new Date())} on the CMU Database app`, M, H - 7); doc.text(`Page ${i} of ${n}`, W - M, H - 7, { align: 'right' });
      }
      const b64 = doc.output('datauristring').split(',')[1];
      const file = `${name}.pdf`;
      if (share) await saveAndShare(file, b64, 'application/pdf', { base64: true });
      return { name: file, base64: b64 };
    },
  };
  return K;
}

/* ------------------------------------------------------------------ register export as PDF */
export async function registerPdf(title, cols, rows, sub = '') {
  const K = await pdfKit(cols.length > 6);
  K.header(title, sub || `${rows.length} record(s) · ${fmtD(new Date())}`);
  K.table(cols.map(c => c.label), rows.map(r => cols.map(c => { const v = c.get(r); return typeof v === 'number' ? money(v, c.dec ?? 2) : str(v); })), { size: cols.length > 9 ? 6.6 : 7.6 });
  return K.finish(`${title} ${stamp()}`);
}

/* ------------------------------------------------------------------ monthly report */
export async function monthlyPdf(R, who = '') {
  const K = await pdfKit();
  K.header('Monthly report – ' + R.label, `Figures from the CMU Database registers. Generated ${fmtD(new Date())}${who ? ' by ' + who : ''}.`);
  K.section('1.  SUMMARY');
  K.table(['Item', R.label, 'Year to date'], R.summary.map(s => [s[0], money(s[1], s[3]), money(s[2], s[3])]), { cols: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
  K.text(`Billed minus received, to the end of ${R.label}: US$${money(R.outstanding)}`, 9, 'bold');
  K.section('2.  LICENCES & CERTIFICATES ISSUED');
  K.table(['Record ID', 'Company', 'Licence / Certificate', 'Licence No.', 'Issued', 'Expires'], R.licences.map(x => [x.id, x.co, x.type || x.cat, x.no, fmtD(x.issued), fmtD(x.expiry)]), { empty: 'None this month.' });
  K.section('3.  CHEMICAL CLEARANCES');
  K.table(['Clearance No.', 'Company', 'Chemical', 'Quantity (kg)', 'Date'], R.clearances.map(x => [x.no, x.co, x.chem, money(x.kg), fmtD(x.date)]),
    { empty: 'None this month.', foot: R.clearances.length ? ['', 'TOTAL', '', money(R.clrKg), ''] : null, cols: { 3: { halign: 'right' } } });
  K.section('4.  BILLS ISSUED');
  K.table(['Bill No.', 'Company', 'Bill Type / Purpose', 'Bill Ref. No.', 'Date', 'Amount (US$)'], R.bills.map(b => [b.no, b.co, b.type || b.purpose.join(', '), b.ref, fmtD(b.date), money(b.billed)]),
    { empty: 'None this month.', foot: R.bills.length ? ['', 'TOTAL', '', '', '', money(R.billed)] : null, cols: { 5: { halign: 'right' } } });
  K.section('5.  PAYMENTS RECEIVED');
  K.table(['Record ID', 'Company', 'Receipt No.', 'Bill No.', 'Date', 'Amount (US$)'], R.payments.map(p => [p.id, p.co, p.rec, p.bill, fmtD(p.date), money(p.amt)]),
    { empty: 'None this month.', foot: R.payments.length ? ['', 'TOTAL', '', '', '', money(R.received)] : null, cols: { 5: { halign: 'right' } } });
  K.section(`6.  LICENCES EXPIRING NEXT MONTH (${R.nextLabel}, not yet renewed)`);
  K.table(['Record ID', 'Company', 'Licence / Certificate', 'Licence No.', 'Expires'], R.expiringNext.map(x => [x.id, x.co, x.type || x.cat, x.no, fmtD(x.expiry)]), { empty: 'None.' });
  K.section(`7.  BILLS UNPAID FOR MORE THAN 30 DAYS (as at ${fmtD(new Date())})`);
  K.table(['Bill No.', 'Company', 'Bill Type', 'Bill Date', 'Days old', 'Outstanding (US$)'], R.old30.map(b => [b.no, b.co, b.type, fmtD(b.date), b.age, money(b.out)]),
    { empty: 'None.', foot: R.old30.length ? ['', 'TOTAL', '', '', '', money(R.old30.reduce((a, b) => a + b.out, 0))] : null, cols: { 5: { halign: 'right' } } });
  K.signatures();
  return K.finish(`CMU Monthly Report ${R.y}-${String(R.m + 1).padStart(2, '0')}`);
}

/* ------------------------------------------------------------------ annual report */
export async function annualPdf(F, Pv, today, target = 0, who = '') {
  const K = await pdfKit(), y = F.y;
  K.header(`Annual report ${y}${y === today.getFullYear() ? ' (year to date)' : ''}`, `Figures from the CMU Database registers. Generated ${fmtD(new Date())}${who ? ' by ' + who : ''}.`);
  const ch = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '');
  K.section('1.  KEY FIGURES');
  K.table(['', String(y), String(y - 1), 'Change'], [
    ['Licences & certificates issued', F.lic, Pv.lic, ch(F.lic, Pv.lic)], ['Chemical clearances (Clearance Nos.)', F.clr, Pv.clr, ch(F.clr, Pv.clr)],
    ['Quantity cleared (MT)', money(F.kg / 1000, 3), money(Pv.kg / 1000, 3), ch(F.kg, Pv.kg)], ['Bills issued', F.billsN, Pv.billsN, ch(F.billsN, Pv.billsN)],
    ['Amount billed (US$)', money(F.billed), money(Pv.billed), ch(F.billed, Pv.billed)], ['Amount received (US$)', money(F.paid), money(Pv.paid), ch(F.paid, Pv.paid)],
    ['Collection rate (received ÷ billed)', F.billed ? Math.round((F.paid / F.billed) * 100) + '%' : '', Pv.billed ? Math.round((Pv.paid / Pv.billed) * 100) + '%' : '', ''],
  ].map(r => r.map(String)), { cols: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  if (target) K.text(`Revenue target US$${money(target)} – achieved ${Math.round((F.paid / target) * 100)}%`, 9, 'bold');
  K.text(`Billed minus received, to the end of ${y}: US$${money(F.outstanding)}`, 9, 'bold');
  K.section('2.  MONTH BY MONTH');
  K.table(['Month', 'Licences', 'Clearances', 'Cleared (MT)', 'Billed (US$)', 'Received (US$)'],
    F.months.map((m, i) => [MON[i] + ' ' + y, m.lic, m.clr.size, money(m.kg / 1000, 3), money(m.billed), money(m.paid)].map(String)),
    { foot: ['TOTAL', F.lic, F.clr, money(F.kg / 1000, 3), money(F.billed), money(F.paid)].map(String), cols: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
  K.bars(`Billed vs received by month, ${y} (US$)`, MON, [F.months.map(m => m.billed), F.months.map(m => m.paid)], [NAVY, [112, 173, 71]]);
  K.section('3.  LICENCES & CERTIFICATES BY CATEGORY');
  K.table(['Category', `Issued in ${y}`, 'Active today', 'Expired, not renewed'], Object.keys(F.cats).sort().map(k => [k, ...F.cats[k]].map(String)));
  K.section('4.  TOP 10 IMPORTERS (quantity cleared)');
  K.table(['Company', 'MT', 'Share'], topN(F.byCo).map((x, i) => [`${i + 1}.  ${x.name}`, money(x.value / 1000, 3), Math.round(x.share * 100) + '%']), { empty: `No clearances in ${y}.` });
  K.section('5.  TOP 10 CHEMICALS (quantity cleared)');
  K.table(['Chemical', 'MT', 'Share'], topN(F.byChem).map((x, i) => [`${i + 1}.  ${x.name}`, money(x.value / 1000, 3), Math.round(x.share * 100) + '%']), { empty: `No clearances in ${y}.` });
  K.section('6.  REVENUE BY BILL TYPE');
  K.table(['Bill type', 'Billed (US$)', 'Share'], topN(F.byType, 20).map(x => [x.name, money(x.value), Math.round(x.share * 100) + '%']), { empty: `No bills in ${y}.` });
  K.section('7.  COMPLIANCE INDICATORS');
  K.table(['Indicator', 'Result', 'Basis'], [
    ['Licences renewed on time', F.renewDue ? Math.round((F.renewOnTime / F.renewDue) * 100) + '%' : 'n/a', `${F.renewOnTime} of ${F.renewDue} licences that expired in ${y}`],
    ['Bills paid in full within 30 days', F.billsN ? Math.round((F.paid30 / F.billsN) * 100) + '%' : 'n/a', `${F.paid30} of ${F.billsN} bills issued in ${y}`],
    ['Average days from bill to full payment', F.avgDays === null ? 'n/a' : String(Math.round(F.avgDays)), `${F.paidBills} bills fully paid (payments linked by Bill No.)`],
    ['Licensed chemicals cleared above quota', String(F.overQuota), 'see the Quota Tracker'], ["Clearance lines not on the company's CIL", String(F.notOn), 'see the Quota Tracker'],
    ['Clearance lines without a valid CIL', String(F.noLic), 'see the Quota Tracker'], ['Open data issues (Notes & Issues)', String(F.issuesOpen), 'all years']]);
  K.signatures();
  return K.finish(`CMU Annual Report ${y}`);
}

/* ------------------------------------------------------------------ company profile */
export async function profilePdf(P) {
  const K = await pdfKit(), c = P.co;
  K.header('Company profile – ' + P.name, `${c['Company ID']} · generated ${fmtD(new Date())}`);
  K.kv([['Company ID', c['Company ID']], ['Sector / activity', c['Sector / Activity']], ['Location', c['Location']], ['Other names recorded', c['Other Names Recorded']],
    ['Contact person', P.contact?.['Contact Person']], ['Email', P.contact?.['Email (several: separate with ;)']], ['Phone', P.contact?.['Phone']]]);
  K.section('SUMMARY');
  K.kv([['Licences / certificates', `${P.lic.length} (${P.active} active, ${P.expired} expired and not renewed)`], ['Cleared this year', money(P.kgYr / 1000, 3) + ' MT'], ['Cleared (all records)', money(P.kgAll / 1000, 3) + ' MT'],
    ['Billed', usd(P.billed)], ['Paid', usd(P.paid)], ['Balance', usd(P.balance)]]);
  K.section('LICENCES & CERTIFICATES');
  K.table(['Record', 'Licence / certificate', 'Licence No.', 'Issued', 'Expires', 'Status'], P.lic.map(x => [x.id, x.type || x.cat, x.no, fmtD(x.issued), fmtD(x.expiry),
    x.expiry ? (x.days < 0 ? (x.renewed ? 'Renewed' : 'EXPIRED') : x.days <= 60 ? `Expires in ${x.days} d` : 'Active') : x.status]));
  if (P.quotas.length) { K.section('IMPORT QUOTAS'); K.table(['Licence', 'Chemical', 'Quota (kg)', 'Cleared (kg)', '% used', 'Status'], P.quotas.map(x => [x.lic.id, x.ch.name, x.ch.limit === null ? '' : money(x.ch.limit), money(x.basis), x.pct === null ? '' : Math.round(x.pct * 100) + '%', x.status])); }
  K.section('BILLS');
  K.table(['Bill No.', 'Type / purpose', 'Ref.', 'Date', 'Billed', 'Outstanding'], P.bills.map(b => [b.no, b.type || b.purpose.join(', '), b.ref, fmtD(b.date), money(b.billed), money(b.isPaid ? 0 : b.out)]),
    { foot: P.bills.length ? ['', 'TOTAL', '', '', money(P.billed), money(P.outstanding)] : null });
  K.section('PAYMENTS');
  K.table(['Record', 'Purpose', 'Receipt', 'Bill No.', 'Date', 'Amount'], P.pays.map(p => [p['Record ID'], p['Purpose / Services'], p['Receipt No.'], p['Bill No.'], fmtD(p['Payment Date']), money(p['Amount (USD)'])]));
  K.section('CLEARANCES BY CHEMICAL');
  K.table(['Chemical', 'Quantity (kg)'], topN(P.byChem, 40).map(x => [x.name, money(x.value)]));
  if (P.inspections.length) { K.section('FIELD INSPECTIONS'); K.table(['ID', 'Date', 'Site', 'Compliance', 'Findings'], P.inspections.map(i => [i['Inspection ID'], fmtD(i['Inspection Date']), i['Site / Facility'], i['Compliance'], i['Findings']])); }
  return K.finish(`Company Profile ${P.name} ${stamp()}`);
}

/* ------------------------------------------------------------------ quota tracker / insights / data check */
export async function quotaPdf(Q) {
  const K = await pdfKit(true);
  K.header('Import quota tracker', 'Quantities on Chemical Importation Licences (CIL) vs quantities cleared. A clearance counts against a licence when it is for the same company, dated within the licence period, and the chemical name matches.');
  K.section('1.  QUOTA USE PER LICENSED CHEMICAL');
  K.table(['Licence', 'Licence No.', 'Company', 'Licensed chemical', 'Quota (kg)', 'Cleared (kg)', '% used', 'Remaining (kg)', 'Status'], Q.rows.map(x => [x.lic.id, x.lic.no, x.lic.co,
    x.ch.name + (x.ch.perMonth ? ` (per month${x.month ? ', highest ' + x.month : ''})` : ''), x.ch.limit === null ? '' : money(x.ch.limit), money(x.basis), x.pct === null ? '' : Math.round(x.pct * 100) + '%',
    x.ch.limit === null ? '' : money(Math.max(0, x.ch.limit - x.basis)), x.status + (x.active ? '' : ' (licence expired)')]), { empty: 'No Chemical Importation Licence lists chemicals yet.',
    didParseCell: d => { if (d.section === 'body' && d.column.index === 8) { const t = String(d.cell.raw); if (t.startsWith('OVER')) d.cell.styles.textColor = [156, 0, 6]; else if (t.startsWith('Near')) d.cell.styles.textColor = [128, 96, 0]; } } });
  K.section("2.  CLEARED BUT NOT ON THE COMPANY'S IMPORTATION LICENCE");
  K.table(['Clearance', 'Record', 'Company', 'Chemical cleared', 'Standard name', 'Qty (kg)', 'Date', 'Licence checked'], Q.notOn.map(x => [x.line.no, x.line.id, x.line.co, x.line.rec, x.line.std, money(x.line.kg), fmtD(x.line.date), x.lic.id + ' ' + x.lic.no]), { empty: 'None.' });
  K.section('3.  CLEARANCES WITH NO VALID CHEMICAL IMPORTATION LICENCE ON THAT DATE');
  K.table(['Clearance', 'Record', 'Company', 'Chemical cleared', 'Standard name', 'Qty (kg)', 'Date'], Q.noLic.map(x => [x.no, x.id, x.co, x.rec, x.std, money(x.kg), fmtD(x.date)]), { empty: 'None.' });
  return K.finish(`CMU Quota Tracker ${stamp()}`);
}
export async function insightsPdf(D) {
  const K = await pdfKit(true);
  K.header('Insights & alerts – licences to renew and bills to collect', `Licences expiring within ${D.ahead} days and expired within the last ${D.back} days. As at ${fmtD(D.today)}.`);
  K.section('LICENCES & CERTIFICATES – expiring soon or recently expired (not yet renewed)');
  K.table(['Record ID', 'Company', 'Licence / Certificate Type', 'Licence No.', 'Expiry Date', 'Days left', 'Alert'], D.alerts.map(x => [x.id, x.co, x.type || x.cat, x.no, fmtD(x.expiry), x.days,
    x.days < 0 ? `EXPIRED ${-x.days} day(s) ago` : x.days === 0 ? 'Expires TODAY' : `Expires in ${x.days} day(s)`]), { empty: 'Nothing to renew in this window.' });
  K.section('UNPAID BILLS – aging (age = days since the bill date)');
  K.table(['Age', 'Bills', 'Outstanding (US$)'], [...D.aging.filter(a => a.bucket !== 'Date not recorded' || a.n).map(a => [a.bucket, a.n, money(a.amt)]), ['TOTAL', D.unpaid.length, money(D.unpaid.reduce((a, b) => a + b.out, 0))]]);
  K.table(['Bill No.', 'Company', 'Bill Type / Purpose', 'Bill Ref. No.', 'Bill Date', 'Days old', 'Outstanding (US$)', 'Status'], D.unpaid.map(b => [b.no, b.co, b.type || b.purpose.join(', '), b.ref, fmtD(b.date), b.age ?? '', money(b.out), b.status]), { empty: 'No unpaid bills.' });
  return K.finish(`CMU Insights ${stamp()}`);
}
export async function dataCheckPdf(items) {
  const K = await pdfKit();
  K.header('Data health check', `${items.length} item(s) found in the registers on ${fmtD(new Date())}. Check each item in the register before changing anything.`);
  K.table(['Priority', 'Register', 'Record', 'Problem'], items.map(i => [['', 'High', 'Medium', 'Low'][i.sev], i.sheet, i.id, i.text]), { empty: 'No problems found.' });
  return K.finish(`CMU Data Check ${stamp()}`);
}

/* ------------------------------------------------------------------ fee worksheet + record summaries */
export async function feePdf(res, info = {}) {
  const K = await pdfKit();
  K.header('Chemical importation fee – worksheet', 'Regulatory Instrument RI/C&E-002-04/20: Qp = R × Hi × Qi. Per-kg categories use kilograms; Explosives and Sodium Cyanide use metric tons. Worksheet only – the bill letter is printed from the database.');
  K.kv([['Company', info.company], ['Reference', info.ref], ['Date', fmtD(new Date())]]);
  K.table(['Chemical', 'Standard name', 'Quantity', 'Category', 'HMIS', 'Hi', 'Rate R', 'Fee (US$)'], res.lines.map(l => [l.chemical, l.standard, `${money(l.quantity, String(l.quantity).includes('.') ? 3 : 0)} ${l.unit}`, l.category || '–',
    l.hmis ?? '–', l.hi ?? '–', l.rate ? `${l.rate} / ${l.basis}` : '–', l.fee === null ? (l.note || '–') : money(l.fee)]), { foot: ['', '', '', '', '', '', 'TOTAL', money(res.total)], cols: { 7: { halign: 'right' } } });
  if (res.words) K.text(`Total in words: ${res.words} UNITED STATES DOLLARS`, 9, 'bold');
  if (res.missing) K.text(`${res.missing} line(s) have no fee because the HMIS rating, fee category or unit is missing – add them in Chemical Hazards (from the SDS) and calculate again.`, 8.5, 'italic', 120);
  res.lines.filter(l => l.working).forEach(l => K.text(`${l.chemical}: ${l.working}`, 8, 'normal', 80));
  return K.finish(`Fee worksheet ${info.company || ''} ${stamp()}`.trim());
}
export async function recordPdf(title, sections) {
  const K = await pdfKit();
  K.header(title, 'Record summary from the CMU Database (not an official letter – use Print ▸ Official PDF for the signed letter).');
  for (const s of sections) {
    if (s.title) K.section(s.title);
    if (s.kv) K.kv(s.kv);
    if (s.table) K.table(s.table.head, s.table.body, s.table.opts || {});
    if (s.text) K.text(s.text, 9);
  }
  return K.finish(title.replace(/[\\/:*?"<>|]/g, '-'));
}
export { amountInWords, usd, num };
