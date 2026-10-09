// The registers of the sheet as phone lists: search, filter chips, sort, export (CSV / Excel / PDF), open a record.
import { useMemo, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Chips, Icon, IconBtn, Row, Badge, Empty, Sheet, useBusy } from '../components/ui';
import { alertBadge } from './Home';
import { money, usd, fmtD, num, str, toDate, today, days, clearanceGroups, searchAll, trim } from '../lib/logic';
import { exportCsv, exportXlsx, registerPdf } from '../lib/exporter';

const licTone = x => (x.Status === 'Expired' ? 'red' : x.Status === 'Active' ? 'green' : 'amber');
export function licBadge(l, D) {
  const a = D.licences.find(x => x.id === l['Record ID']);
  if (a && a.expiry && !a.renewed && a.days <= D.ahead && a.days >= -9999) return a.days < 0 ? <Badge tone="red">Expired</Badge> : alertBadge(a);
  if (a && a.renewed && a.days < 0) return <Badge>Renewed</Badge>;
  return <Badge tone={licTone(l)}>{String(l.Status || '').replace(' – no licence no.', '').replace(' – expiry not recorded', '')}</Badge>;
}
export function billBadge(b) {
  if (b.isPaid) return <Badge tone="green">Paid</Badge>;
  if (b.paid > 0) return <Badge tone="amber">Part paid</Badge>;
  return <Badge tone={b.age > 60 ? 'red' : 'orange'}>Unpaid</Badge>;
}
const cols = rows => { const ks = []; rows.slice(0, 50).forEach(r => Object.keys(r).forEach(k => { if (!k.startsWith('_') && !ks.includes(k)) ks.push(k); })); return ks.map(k => ({ label: k, get: r => r[k] })); };

export function useRegisters() {
  const { T, D } = useApp();
  return useMemo(() => {
    const now = today(), yr = now.getFullYear();
    const groups = clearanceGroups(T);
    const bal = {}; D.bills.forEach(b => { bal[b.coId] = (bal[b.coId] || 0) + (b.isPaid ? 0 : b.out); });
    return {
      companies: {
        title: 'Companies', icon: 'building', items: T.companies, id: r => r['Company ID'], open: 'company',
        hay: r => [r['Company ID'], r['Company Name'], r['Other Names Recorded'], r['Location'], r['Sector / Activity']].join(' '),
        row: r => ({ t1: r['Company Name'], t2: [r['Company ID'], r['Sector / Activity']].filter(Boolean).join(' · '), t3: r['Location'], right: bal[r['Company ID']] ? <b style={{ color: 'var(--accent-dk)' }}>{usd(bal[r['Company ID']])}</b> : <span className="small muted">{r['Licences (No.)']} lic.</span> }),
        filters: [{ value: 'all', label: 'All' }, { value: 'owing', label: 'Owing money', f: r => bal[r['Company ID']] > 0 }, ...[...new Set(T.companies.map(c => c['Sector / Activity']).filter(Boolean))].sort().map(s => ({ value: 's:' + s, label: s, f: r => r['Sector / Activity'] === s }))],
        sorts: [['Name', (a, b) => str(a['Company Name']).localeCompare(str(b['Company Name']))], ['Newest', (a, b) => str(b['Company ID']).localeCompare(str(a['Company ID']))], ['Balance', (a, b) => (bal[b['Company ID']] || 0) - (bal[a['Company ID']] || 0)], ['Billed', (a, b) => num(b['Total Billed (USD)']) - num(a['Total Billed (USD)'])], ['Cleared (kg)', (a, b) => num(b['Total Cleared (kg)']) - num(a['Total Cleared (kg)'])]],
        lines: items => items,
      },
      licences: {
        title: 'Licences & Certificates', icon: 'badge', items: T.licences, id: r => r['Record ID'], open: 'licence',
        hay: r => [r['Record ID'], r['Company Name'], r['Licence / Certificate No.'], r['Licence Category'], r['Licence / Certificate Type'], r['Reference Code']].join(' '),
        row: r => ({ t1: r['Company Name'], t2: [r['Record ID'], r['Licence / Certificate Type'] || r['Licence Category']].filter(Boolean).join(' · '), t3: [r['Licence / Certificate No.'], r['Expiry Date'] ? 'exp. ' + fmtD(r['Expiry Date']) : ''].filter(Boolean).join(' · '), right: licBadge(r, D) }),
        filters: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active', f: r => r.Status === 'Active' }, { value: 'soon', label: `Expiring ≤ ${D.ahead} d`, f: r => { const e = toDate(r['Expiry Date']); return e && days(e, now) >= 0 && days(e, now) <= D.ahead; } },
          { value: 'expired', label: 'Expired', f: r => r.Status === 'Expired' }, { value: 'pending', label: 'Pending', f: r => /^Pending|^Issued/.test(r.Status) },
          ...[...new Set(T.licences.map(l => l['Licence Category']).filter(Boolean))].map(c => ({ value: 'c:' + c, label: c.replace(/ \(.*\)/, '') + (c.match(/\((\w+)\)/) ? ' (' + c.match(/\((\w+)\)/)[1] + ')' : ''), f: r => r['Licence Category'] === c }))],
        sorts: [['Expiry', (a, b) => (toDate(a['Expiry Date']) || 9e15) - (toDate(b['Expiry Date']) || 9e15)], ['Newest', (a, b) => str(b['Record ID']).localeCompare(str(a['Record ID']))], ['Company', (a, b) => str(a['Company Name']).localeCompare(str(b['Company Name']))], ['Issued', (a, b) => (toDate(b['Date Issued']) || 0) - (toDate(a['Date Issued']) || 0)]],
        lines: items => items,
      },
      clearances: {
        title: 'Chemical Clearances', icon: 'flask', items: groups, id: g => g.no, open: 'clearance',
        hay: g => [g.no, g.co, g.ref, g.bls.join(' '), g.lines.map(l => [l['Record ID'], l['Chemical as Recorded'], l['Chemical (Standard)']].join(' ')).join(' ')].join(' '),
        row: g => ({ t1: g.co, t2: `${g.no} · ${g.lines.length} chemical${g.lines.length > 1 ? 's' : ''}${g.ref ? ' · ' + g.ref : ''}`, t3: g.lines.map(l => l['Chemical (Standard)'] || l['Chemical as Recorded']).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', '),
          right: <><b>{money(g.kg / 1000, 2)} MT</b><span className="small muted">{fmtD(g.date)}</span></>, pending: g.pending }),
        filters: [{ value: 'all', label: 'All' }, { value: '30', label: 'Last 30 days', f: g => { const d = toDate(g.date); return d && days(now, d) <= 30; } }, { value: 'yr', label: 'This year', f: g => { const d = toDate(g.date); return d && d.getFullYear() === yr; } },
          { value: 'noref', label: 'No EPA Ref.', f: g => !trim(g.ref) }, { value: 'other', label: 'Unmatched names', f: g => g.lines.some(l => !trim(l['Chemical (Standard)']) || /other/i.test(l['Chemical (Standard)'])) }],
        sorts: [['Newest', (a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0) || str(b.no).localeCompare(str(a.no))], ['Quantity', (a, b) => b.kg - a.kg], ['Company', (a, b) => str(a.co).localeCompare(str(b.co))], ['Number', (a, b) => str(b.no).localeCompare(str(a.no))]],
        lines: items => items.flatMap(g => g.lines),
      },
      bills: {
        title: 'Bills & Invoices', icon: 'receipt', items: D.bills, id: b => b.no, open: 'bill',
        hay: b => [b.no, b.co, b.ref, b.type, b.purpose.join(' '), b.lines.map(l => l['Bill ID']).join(' ')].join(' '),
        row: b => ({ t1: b.co, t2: `${b.no} · ${b.type || b.purpose.join(', ')}`, t3: `${fmtD(b.date)}${b.ref ? ' · ' + b.ref : ''}`, right: <><b>{usd(b.billed)}</b>{billBadge(b)}</>, pending: b.lines.some(l => l._pending) }),
        filters: [{ value: 'all', label: 'All' }, { value: 'unpaid', label: 'Not fully paid', f: b => !b.isPaid }, { value: 'old', label: 'Unpaid > 30 d', f: b => !b.isPaid && b.age > 30 }, { value: 'paid', label: 'Paid', f: b => b.isPaid },
          ...[...new Set(D.bills.map(b => b.type).filter(Boolean))].map(t => ({ value: 't:' + t, label: t, f: b => b.type === t }))],
        sorts: [['Newest', (a, b) => (b.date || 0) - (a.date || 0) || str(b.no).localeCompare(str(a.no))], ['Outstanding', (a, b) => (b.isPaid ? 0 : b.out) - (a.isPaid ? 0 : a.out)], ['Amount', (a, b) => b.billed - a.billed], ['Oldest unpaid', (a, b) => (b.isPaid ? -1 : b.age || 0) - (a.isPaid ? -1 : a.age || 0)]],
        lines: items => items.flatMap(b => b.lines),
      },
      payments: {
        title: 'Payments & Receipts', icon: 'cash', items: T.payments, id: r => r['Record ID'], open: 'payment',
        hay: r => [r['Record ID'], r['Company Name'], r['Receipt No.'], r['Bill No.'], r['Purpose / Services'], r['Record Group']].join(' '),
        row: r => ({ t1: r['Company Name'], t2: `${r['Record ID']} · Receipt ${r['Receipt No.'] || '–'}${r['Bill No.'] ? ' · ' + r['Bill No.'] : ''}`, t3: r['Purpose / Services'], right: <><b style={{ color: 'var(--ok)' }}>{usd(r['Amount (USD)'])}</b><span className="small muted">{fmtD(r['Payment Date'])}</span></> }),
        filters: [{ value: 'all', label: 'All' }, { value: 'yr', label: 'This year', f: r => toDate(r['Payment Date'])?.getFullYear() === yr }, { value: '30', label: 'Last 30 days', f: r => { const d = toDate(r['Payment Date']); return d && days(now, d) <= 30; } },
          { value: 'nobill', label: 'Not linked to a bill', f: r => !trim(r['Bill No.']) }, { value: 'norec', label: 'No receipt no.', f: r => !trim(r['Receipt No.']) }],
        sorts: [['Newest', (a, b) => (toDate(b['Payment Date']) || 0) - (toDate(a['Payment Date']) || 0)], ['Amount', (a, b) => num(b['Amount (USD)']) - num(a['Amount (USD)'])], ['Company', (a, b) => str(a['Company Name']).localeCompare(str(b['Company Name']))]],
        lines: items => items,
      },
      chemicals: {
        title: 'Licence Chemicals', icon: 'layers', items: T.licenceChemicals, id: r => r['Licence Record ID'], open: 'licence',
        hay: r => [r['Licence Record ID'], r['Licence No.'], r['Company'], r['Trade or IUPAC Name'], r['EPA Registration No.']].join(' '),
        row: r => ({ t1: r['Trade or IUPAC Name'], t2: `${r['Company']} · ${r['Licence Record ID']}`, t3: [r['EPA Registration No.'], r['Type']].filter(Boolean).join(' · '), right: r['Stipulated Qty'] !== '' ? <b>{money(r['Stipulated Qty'], 0)} {r['Unit']}</b> : '' }),
        filters: [{ value: 'all', label: 'All' }, { value: 'qty', label: 'With quota', f: r => trim(r['Stipulated Qty']) !== '' }],
        sorts: [['Chemical', (a, b) => str(a['Trade or IUPAC Name']).localeCompare(str(b['Trade or IUPAC Name']))], ['Company', (a, b) => str(a['Company']).localeCompare(str(b['Company']))]], lines: items => items,
      },
      vehicles: {
        title: 'Licence Vehicles', icon: 'truck', items: T.licenceVehicles || [], id: r => r['Licence Record ID'], open: 'licence',
        hay: r => Object.values(r).join(' '), row: r => ({ t1: `${r['Vehicle Type'] || 'Vehicle'} ${r['Vehicle Registration No.'] || ''}`, t2: `${r['Company']} · ${r['Licence Record ID']}`, t3: r['EPA Registration No.'] }),
        filters: [{ value: 'all', label: 'All' }], sorts: [['Company', (a, b) => str(a['Company']).localeCompare(str(b['Company']))]], lines: items => items,
      },
      issues: {
        title: 'Notes & Issues', icon: 'flag', items: T.issues || [], id: r => String(r['Issue #']), open: 'issue',
        hay: r => Object.values(r).join(' '), row: r => ({ t1: r['Issue Found'], t2: `${r['Issue #']} · ${r['Register']}${r['Record'] ? ' · ' + r['Record'] : ''}`, right: <Badge tone={/open/i.test(r['Follow-up Status']) ? 'amber' : /clos/i.test(r['Follow-up Status']) ? 'green' : 'blue'}>{r['Follow-up Status'] || '–'}</Badge> }),
        filters: [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open', f: r => /open/i.test(r['Follow-up Status']) }, { value: 'closed', label: 'Closed', f: r => /clos|verif/i.test(r['Follow-up Status']) }],
        sorts: [['Newest', (a, b) => str(b['Issue #']).localeCompare(str(a['Issue #']), undefined, { numeric: true })], ['Register', (a, b) => str(a['Register']).localeCompare(str(b['Register']))]], lines: items => items,
      },
      correspondence: {
        title: 'Correspondence', icon: 'mail', items: T.correspondence || [], id: r => r['Record ID'], open: 'correspondence',
        hay: r => Object.values(r).join(' '), row: r => ({ t1: r['Company Name'], t2: `${r['Record ID']} · ${r['Type']}`, t3: r['Description'], right: <span className="small muted">{fmtD(r['Date Issued'])}</span> }),
        filters: [{ value: 'all', label: 'All' }, ...[...new Set((T.correspondence || []).map(r => r.Type).filter(Boolean))].map(t => ({ value: 't:' + t, label: t, f: r => r.Type === t }))],
        sorts: [['Newest', (a, b) => (toDate(b['Date Issued']) || 0) - (toDate(a['Date Issued']) || 0)]], lines: items => items,
      },
      inspections: {
        title: 'Field Inspections', icon: 'pin', items: T.inspections || [], id: r => r['Inspection ID'], open: 'inspection',
        hay: r => Object.values(r).join(' '), row: r => ({ t1: r['Company'] || r['Site / Facility'], t2: `${r['Inspection ID']} · ${r['Site / Facility']}`, t3: `${fmtD(r['Inspection Date'])} · ${r['Inspection Type'] || ''}`,
          right: r['Compliance'] ? <Badge tone={/^compliant/i.test(r['Compliance']) ? 'green' : /non/i.test(r['Compliance']) ? 'red' : 'amber'}>{r['Compliance']}</Badge> : '' }),
        filters: [{ value: 'all', label: 'All' }, { value: 'follow', label: 'Follow-up due', f: r => { const d = toDate(r['Follow-up Date']); return d && days(d, now) <= 14; } }, { value: 'non', label: 'Not compliant', f: r => /non|part/i.test(r['Compliance']) }],
        sorts: [['Newest', (a, b) => (toDate(b['Inspection Date']) || 0) - (toDate(a['Inspection Date']) || 0)]], lines: items => items,
      },
    };
  }, [T, D]);
}
export const REG_ORDER = [['companies', 'Companies'], ['licences', 'Licences'], ['clearances', 'Clearances'], ['bills', 'Bills'], ['payments', 'Payments'], ['inspections', 'Inspections'], ['issues', 'Issues'], ['correspondence', 'Letters'], ['chemicals', 'Lic. chemicals'], ['vehicles', 'Vehicles']];

export default function Registers({ reg: start, filter: f0, q: q0 }) {
  const nav = useNav(), { pending } = useApp();
  const R = useRegisters();
  const [reg, setReg] = useState(start || 'licences');
  const [q, setQ] = useState(q0 || '');
  const [filter, setFilter] = useState(f0 || 'all');
  const [sortI, setSortI] = useState(0);
  const [menu, setMenu] = useState(false);
  const [limit, setLimit] = useState(80);
  const [busy, run] = useBusy();
  const def = R[reg];
  const list = useMemo(() => {
    const k = q.trim().toLowerCase(), ff = def.filters.find(x => x.value === filter)?.f;
    let xs = def.items.filter(r => (!ff || ff(r)) && (!k || def.hay(r).toLowerCase().includes(k)));
    const s = def.sorts[sortI] || def.sorts[0]; if (s) xs = [...xs].sort(s[1]);
    return xs;
  }, [def, q, filter, sortI]);
  const counts = useMemo(() => Object.fromEntries(def.filters.map(x => [x.value, x.f ? def.items.filter(x.f).length : def.items.length])), [def]);
  const switchReg = r => { setReg(r); setFilter('all'); setSortI(0); setLimit(80); };
  const lines = def.lines(list), C = cols(lines);
  return (
    <>
      <Bar back={nav.stack.length > 1} right={<><IconBtn n="sort" label="Sort" onClick={() => setSortI(i => (i + 1) % def.sorts.length)} /><IconBtn n="download" label="Export" onClick={() => setMenu(true)} /></>}>
        <div className="search"><Icon n="search" s={18} /><input placeholder={`Search ${def.title.toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)} />{q ? <button className="ib" style={{ color: '#fff' }} onClick={() => setQ('')}><Icon n="close" s={16} /></button> : null}</div>
      </Bar>
      <main className="main">
        <div className="wrap">
          <Chips value={reg} onChange={switchReg} options={REG_ORDER.map(([v, l]) => ({ value: v, label: l, n: R[v].items.length }))} />
          <Chips value={filter} onChange={v => { setFilter(v); setLimit(80); }} options={def.filters.map(x => ({ value: x.value, label: x.label, n: counts[x.value] }))} />
          <div className="statusline"><span className="grow">{list.length} {def.title.toLowerCase()} · sorted by {def.sorts[sortI]?.[0].toLowerCase()}</span>{pending.length ? <span className="tag-pending">{pending.length} waiting to upload</span> : null}</div>
          {list.length ? <div className="list">{list.slice(0, limit).map((r, i) => { const x = def.row(r); return <Row key={def.id(r) + ':' + i} icon={def.icon} {...x} pending={x.pending || r._pending} onClick={() => nav.go(def.open, { id: def.id(r) })} />; })}</div>
            : <Empty icon={def.icon} title="Nothing here">{q ? 'No record matches your search.' : 'No records in this view.'}</Empty>}
          {list.length > limit ? <button className="btn ghost block" onClick={() => setLimit(l => l + 150)}>Show more ({list.length - limit})</button> : null}
        </div>
      </main>
      {menu ? <Sheet title={`Export ${list.length} ${def.title.toLowerCase()}`} onClose={() => setMenu(false)}>
        <div className="small muted mb">Exports the records in the current view (search and filter applied), with every column of the register.</div>
        <div className="list">
          <Row icon="file" t1="Excel workbook (.xlsx)" t2="Opens in Excel / Google Sheets" onClick={() => run(() => exportXlsx(def.title, [{ name: def.title, cols: C, rows: lines }])).then(() => setMenu(false))} />
          <Row icon="file" t1="CSV file" t2="For any spreadsheet program" onClick={() => run(() => exportCsv(def.title, C, lines)).then(() => setMenu(false))} />
          <Row icon="pdf" t1="PDF table" t2="Print-ready list" onClick={() => run(() => registerPdf(def.title, C.filter(c => !/Source|Name as Recorded|Key|Line|Company Total|Payment Status/.test(c.label)).slice(0, 11), lines)).then(() => setMenu(false))} />
        </div>
        {busy ? <div className="small muted">Preparing…</div> : null}
      </Sheet> : null}
    </>
  );
}

export function GlobalSearch() {
  const { T } = useApp(), nav = useNav();
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchAll(T, q, 80), [T, q]);
  const icon = { company: 'building', licence: 'badge', clearance: 'flask', bill: 'receipt', payment: 'cash', issue: 'flag', inspection: 'pin', correspondence: 'mail' };
  return (
    <>
      <Bar><div className="search"><Icon n="search" s={18} /><input autoFocus placeholder="Company, licence no., B/L, receipt, chemical…" value={q} onChange={e => setQ(e.target.value)} /></div></Bar>
      <main className="main noNav"><div className="wrap">
        {!q ? <div className="note">Search every register at once: company names and other spellings, record IDs, licence and reference numbers, B/L and invoice numbers, receipt numbers, chemicals.</div> : null}
        {q && !hits.length ? <Empty icon="search" title="No match" /> : null}
        {hits.length ? <div className="list">{hits.map((h, i) => <Row key={i} icon={icon[h.kind]} t1={h.title || h.id} t2={h.sub} t3={h.kind} onClick={() => nav.go(h.kind, { id: h.id })} />)}</div> : null}
      </div></main>
    </>
  );
}
