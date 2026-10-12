// Figures for the dashboard and the reports – the same rules as the CMU Database sheets, computed on the phone (works offline).
import { groupClearances, num, sum, ymOf, daysUntil, today, thisYear, eq, by, parts } from './util';

export const yearOf = iso => (parts(iso) ? parts(iso).y : null);
const isOpen = s => /^open/i.test(String(s || '').trim()) || String(s || '').trim() === '';

/** licence status as the register shows it */
export function licState(r) {
  const d = daysUntil(r['Expiry Date']);
  if (d !== null) return d < 0 ? 'Expired' : 'Active';
  if (!String(r['Licence / Certificate No.'] || '').trim()) return 'Pending';
  return 'No expiry recorded';
}
export const licDays = r => daysUntil(r['Expiry Date']);
/** a newer licence of the same type for the same company */
export const renewed = (all, l) => !!l['Expiry Date'] && all.some(m => m !== l && m['Company ID'] === l['Company ID'] && eq(m['Licence / Certificate Type'], l['Licence / Certificate Type']) && m['Expiry Date'] && m['Expiry Date'] > l['Expiry Date']);

export function dashboard(snap, year = thisYear()) {
  const t = snap.tables, cl = groupClearances(t.clearances), bills = snap.insights.bills;
  const months = Array.from({ length: 12 }, (_, i) => ({ ym: `${year}-${String(i + 1).padStart(2, '0')}`, clr: 0, mt: 0, pays: 0, paid: 0, billed: 0, lic: 0 }));
  const M = ym => months.find(m => m.ym === ym);
  const nodate = { clr: 0, mt: 0, pays: 0, paid: 0, billed: 0, lic: 0 };
  cl.forEach(c => { const m = yearOf(c.date) === year ? M(ymOf(c.date)) : !c.date ? nodate : null; if (m) { m.clr++; m.mt += c.kg / 1000; } });
  t.payments.forEach(p => { const m = yearOf(p['Payment Date']) === year ? M(ymOf(p['Payment Date'])) : !p['Payment Date'] ? nodate : null; if (m) { m.pays++; m.paid += num(p['Amount (USD)']); } });
  bills.forEach(b => { const m = yearOf(b.date) === year ? M(ymOf(b.date)) : !b.date ? nodate : null; if (m) m.billed += b.billed; });
  t.licences.forEach(l => { const m = yearOf(l['Date Issued']) === year ? M(ymOf(l['Date Issued'])) : !l['Date Issued'] ? nodate : null; if (m) m.lic++; });
  const cats = {};
  t.licences.forEach(l => {
    const k = l['Licence Category'] || '(no category)', c = (cats[k] = cats[k] || { cat: k, total: 0, active: 0, noExpiry: 0, pending: 0, expired: 0 });
    const s = licState(l); c.total++; if (s === 'Active') c.active++; else if (s === 'Pending') c.pending++; else if (s === 'Expired') c.expired++; else c.noExpiry++;
  });
  const chem = {};
  t.clearances.forEach(r => { const k = r['Chemical (Standard)'] || '(not standardised)'; const c = (chem[k] = chem[k] || { chem: k, n: 0, kg: 0 }); c.n++; c.kg += num(r['Qty (kg)']); });
  const totKg = sum(t.clearances, r => r['Qty (kg)']);
  const payStatus = { Paid: { n: 0, amt: 0 }, 'Part paid': { n: 0, amt: 0 }, Unpaid: { n: 0, amt: 0 } };
  bills.forEach(b => { const k = b.isPaid ? 'Paid' : b.paid > 0 ? 'Part paid' : 'Unpaid'; payStatus[k].n++; payStatus[k].amt += b.billed; });
  const ym = today().slice(0, 7);
  return {
    year, months, nodate,
    companies: t.companies.length, licNumbered: t.licences.filter(l => String(l['Licence / Certificate No.'] || '').trim()).length,
    licPending: t.licences.filter(l => !String(l['Licence / Certificate No.'] || '').trim()).length,
    clearances: cl.length, totalMt: totKg / 1000, billed: sum(bills, b => b.billed), paid: sum(t.payments, p => p['Amount (USD)']),
    openIssues: t.issues.filter(i => isOpen(i['Follow-up Status'])).length, issues: t.issues.length,
    cats: Object.values(cats).sort(by(c => c.total, true)), chems: Object.values(chem).sort(by(c => c.kg, true)).map(c => ({ ...c, share: totKg ? c.kg / totKg : 0 })), totKg,
    payStatus, unpaid: bills.filter(b => !b.isPaid), outstanding: sum(bills.filter(b => !b.isPaid), b => b.out),
    clrMonth: cl.filter(c => ymOf(c.date) === ym), expSoon: snap.insights.alerts.filter(a => a.days >= 0 && a.days <= 30), expired: snap.insights.alerts.filter(a => a.days < 0),
  };
}

/** unpaid bills by age (days since the bill date) */
export function aging(bills) {
  const groups = [['0 – 30 days', b => b.age !== null && b.age <= 30], ['31 – 60 days', b => b.age > 30 && b.age <= 60], ['61 – 90 days', b => b.age > 60 && b.age <= 90], ['Over 90 days', b => b.age > 90], ['Date not recorded', b => b.age === null]];
  const unpaid = bills.filter(b => !b.isPaid).sort(by(b => (b.age === null ? -1 : b.age), true));
  return { rows: groups.map(([label, f]) => { const x = unpaid.filter(f); return { label, n: x.length, out: sum(x, b => b.out) }; }), unpaid, total: sum(unpaid, b => b.out) };
}

export function monthly(snap, ym) {
  const t = snap.tables, y = +ym.slice(0, 4), cl = groupClearances(t.clearances), bills = snap.insights.bills;
  const inM = d => ymOf(d) === ym, inYTD = d => yearOf(d) === y && ymOf(d) <= ym;
  const licM = t.licences.filter(l => inM(l['Date Issued'])), clrM = cl.filter(c => inM(c.date)), billM = bills.filter(b => inM(b.date)), payM = t.payments.filter(p => inM(p['Payment Date']));
  const next = new Date(y, +ym.slice(5) % 12 === 0 ? 12 : +ym.slice(5), 1), nym = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  const end = `${ym}-31`;
  const billedTo = sum(bills.filter(b => b.date && b.date <= end), b => b.billed), paidTo = sum(t.payments.filter(p => p['Payment Date'] && p['Payment Date'] <= end), p => p['Amount (USD)']);
  return {
    ym, summary: [
      ['Licences & certificates issued', licM.length, t.licences.filter(l => inYTD(l['Date Issued'])).length],
      ['Chemical clearances (Clearance Nos.)', clrM.length, cl.filter(c => inYTD(c.date)).length],
      ['Quantity cleared (MT)', sum(clrM, c => c.kg) / 1000, sum(cl.filter(c => inYTD(c.date)), c => c.kg) / 1000],
      ['Bills issued', billM.length, bills.filter(b => inYTD(b.date)).length],
      ['Amount billed (US$)', sum(billM, b => b.billed), sum(bills.filter(b => inYTD(b.date)), b => b.billed)],
      ['Payments received', payM.length, t.payments.filter(p => inYTD(p['Payment Date'])).length],
      ['Amount received (US$)', sum(payM, p => p['Amount (USD)']), sum(t.payments.filter(p => inYTD(p['Payment Date'])), p => p['Amount (USD)'])],
    ],
    balance: billedTo - paidTo,
    licences: licM, clearances: clrM.flatMap(c => c.lines.map(l => ({ no: c.no, co: c.co, chem: l['Chemical (Standard)'] || l['Chemical as Recorded'], kg: num(l['Qty (kg)']), date: c.date }))),
    bills: billM, payments: payM.sort(by(p => p['Payment Date'])),
    expiringNext: t.licences.filter(l => ymOf(l['Expiry Date']) === nym && !renewed(t.licences, l)),
    nym, old: bills.filter(b => !b.isPaid && b.age > 30).sort(by(b => b.age, true)),
  };
}

export function annual(snap, y, target = 0) {
  const t = snap.tables, cl = groupClearances(t.clearances), bills = snap.insights.bills, D = dashboard(snap, y);
  const inY = (d, yy = y) => yearOf(d) === yy;
  const fig = yy => ({
    lic: t.licences.filter(l => inY(l['Date Issued'], yy)).length, clr: cl.filter(c => inY(c.date, yy)).length, mt: sum(cl.filter(c => inY(c.date, yy)), c => c.kg) / 1000,
    bills: bills.filter(b => inY(b.date, yy)).length, billed: sum(bills.filter(b => inY(b.date, yy)), b => b.billed), recv: sum(t.payments.filter(p => inY(p['Payment Date'], yy)), p => p['Amount (USD)']),
  });
  const A = fig(y), P = fig(y - 1);
  const cats = {};
  t.licences.forEach(l => {
    const k = l['Licence Category'] || '(no category)', c = (cats[k] = cats[k] || { cat: k, issued: 0, active: 0, expired: 0 });
    if (inY(l['Date Issued'])) c.issued++;
    const s = licState(l); if (s === 'Active') c.active++;
    if (s === 'Expired' && !renewed(t.licences, l)) c.expired++;
  });
  const imp = {}, chem = {};
  cl.filter(c => inY(c.date)).forEach(c => { imp[c.co] = (imp[c.co] || 0) + c.kg; c.lines.forEach(l => { const k = l['Chemical (Standard)'] || l['Chemical as Recorded']; chem[k] = (chem[k] || 0) + num(l['Qty (kg)']); }); });
  const top = o => { const tot = sum(Object.values(o)); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ name: k, mt: v / 1000, share: tot ? v / tot : 0 })); };
  const rev = {}; bills.filter(b => inY(b.date)).forEach(b => { const k = b.type || '(no bill type)'; rev[k] = (rev[k] || 0) + b.billed; });
  const revTot = sum(Object.values(rev));
  // compliance
  const expiredInY = t.licences.filter(l => inY(l['Expiry Date']) && daysUntil(l['Expiry Date']) < 0);
  const renewedOk = expiredInY.filter(l => t.licences.some(m => m !== l && m['Company ID'] === l['Company ID'] && eq(m['Licence / Certificate Type'], l['Licence / Certificate Type']) && m['Date Issued'] && m['Date Issued'] <= l['Expiry Date'] && m['Expiry Date'] > l['Expiry Date']));
  const billsY = bills.filter(b => inY(b.date)), paidDays = [];
  billsY.forEach(b => {
    const ps = t.payments.filter(p => eq(p['Bill No.'], b.no)).sort(by(p => p['Payment Date'])); let acc = 0;
    for (const p of ps) { acc += num(p['Amount (USD)']); if (acc >= b.billed - 0.005) { const d = (Date.parse(p['Payment Date']) - Date.parse(b.date)) / 864e5; if (!isNaN(d)) paidDays.push(d); break; } }
  });
  const q = snap.insights.quotas;
  return {
    y, A, P, target, collection: A.billed ? A.recv / A.billed : null, balance: sum(bills.filter(b => b.date && yearOf(b.date) <= y), b => b.billed) - sum(t.payments.filter(p => p['Payment Date'] && yearOf(p['Payment Date']) <= y), p => p['Amount (USD)']),
    months: D.months, cats: Object.values(cats).sort(by(c => c.cat)), importers: top(imp), chemicals: top(chem),
    revenue: Object.entries(rev).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ type: k, billed: v, share: revTot ? v / revTot : 0 })),
    compliance: [
      ['Licences renewed on time', expiredInY.length ? renewedOk.length / expiredInY.length : null, `${renewedOk.length} of ${expiredInY.length} licences that expired in ${y}`],
      ['Bills paid in full within 30 days', billsY.length ? paidDays.filter(d => d <= 30).length / billsY.length : null, `${paidDays.filter(d => d <= 30).length} of ${billsY.length} bills issued in ${y}`],
      ['Average days from bill to full payment', paidDays.length ? Math.round(sum(paidDays) / paidDays.length) : null, `${paidDays.length} bills fully paid (payments linked by Bill No.)`],
      ['Licensed chemicals cleared above quota', q.filter(x => x.status === 'OVER QUOTA').length, 'see Import quotas'],
      ['Clearance lines not on the company\'s CIL', (snap.insights.notOn || []).length, 'see Import quotas'],
      ['Clearance lines without a valid CIL', snap.insights.noLic || 0, 'see Import quotas'],
      ['Open data issues (Notes & Issues)', t.issues.filter(i => isOpen(i['Follow-up Status'])).length, 'all years'],
    ],
  };
}

export function profile(snap, coId) {
  const t = snap.tables, c = t.companies.find(r => r['Company ID'] === coId);
  if (!c) return null;
  const lic = t.licences.filter(l => l['Company ID'] === coId).sort(by(l => l['Expiry Date'] || '', true));
  const bills = snap.insights.bills.filter(b => b.coId === coId).sort(by(b => b.date || '', true));
  const pays = t.payments.filter(p => p['Company ID'] === coId).sort(by(p => p['Payment Date'] || '', true));
  const cl = groupClearances(t.clearances.filter(r => r['Company ID'] === coId));
  const y = thisYear(), billed = sum(bills, b => b.billed), paid = sum(pays, p => p['Amount (USD)']);
  const ids = new Set(lic.map(l => l['Record ID']));
  return {
    c, lic, bills, pays, cl, quotas: snap.insights.quotas.filter(q => q.coId === coId),
    vehicles: t.licenceVehicles.filter(v => ids.has(v['Licence Record ID'])), insp: t.inspections.filter(i => i['Company ID'] === coId),
    cor: t.correspondence.filter(x => x['Company ID'] === coId), issues: t.issues.filter(i => String(i['Record'] || '').includes(coId) || String(i['Issue Found'] || '').toLowerCase().includes(String(c['Company Name'] || '').toLowerCase().slice(0, 12))),
    active: lic.filter(l => licState(l) === 'Active').length, expired: lic.filter(l => licState(l) === 'Expired').length,
    kgYear: sum(cl.filter(x => yearOf(x.date) === y), x => x.kg), kgAll: sum(cl, x => x.kg), billed, paid, balance: billed - paid,
  };
}

/** who would get a reminder e-mail (same rule as the server's weekly reminders) */
export function reminderPlan(snap) {
  const I = snap.insights;
  return snap.tables.companies.map(c => {
    const id = c['Company ID'], lic = I.alerts.filter(a => a.coId === id), bills = I.bills.filter(b => b.coId === id && !b.isPaid && b.age !== null && b.age > 30);
    return { c, lic, bills, owed: sum(bills, b => b.out), email: String(c['Email'] || '').trim(), phone: String(c['Phone'] || '').trim(), on: !/^no$/i.test(String(c['Send reminders?'] || '').trim()) };
  }).filter(g => g.lic.length || g.bills.length).sort(by(g => g.owed, true));
}
