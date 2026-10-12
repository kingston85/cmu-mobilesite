import { useMemo, useState } from 'react';
import { Header, Card, KV, Row, Empty, Pill, licTone, Chips, Actions, Sheet } from './ui';
import { fmtD, money, num, daysUntil, matches, groupClearances, eq, kgFmt, by, pct, fmtWhen, today } from '../lib/util';
import { toCsv, shareCsv, telLink, waLink, mailLink, openLink, sharePdf } from '../lib/device';
import { licState, profile } from '../lib/reports';
import { licenceKind, DOC_KINDS, registerDoc } from '../lib/docs';
import { renderPdf } from '../lib/pdf';
import { presetFrom, renewPreset, FORM_LABEL, fromAi as fromAiLazy } from './Forms';

/* ---------------- every register on the phone */
export const KINDS = {
  companies: { label: 'Companies', icon: '🏢', key: 'Company ID', outbox: 'company', group: 'Registers', sub: 'Every registered company' },
  licences: { label: 'Licences & Certificates', icon: '📜', key: 'Record ID', outbox: 'licence', group: 'Registers', sub: 'Issued, pending and expired' },
  licenceChemicals: { label: 'Licence Chemicals', icon: '⚗️', key: 'Licence Record ID', group: 'Registers', sub: 'Chemicals named on licences', ro: true },
  licenceVehicles: { label: 'Licence Vehicles', icon: '🚚', key: 'Licence Record ID', group: 'Registers', sub: 'Transport licence vehicles', ro: true },
  licenceEffluent: { label: 'Licence Effluent', icon: '💧', key: 'Licence Record ID', group: 'Registers', sub: 'EDL limits and conditions', ro: true },
  clearances: { label: 'Chemical Clearances', icon: '🧪', key: 'no', outbox: 'clearance', group: 'Registers', sub: 'Every cleared consignment' },
  bills: { label: 'Bills & Invoices', icon: '🧾', key: 'no', outbox: 'bill', group: 'Registers', sub: 'One entry per Bill No.' },
  payments: { label: 'Payments & Receipts', icon: '💵', key: 'Record ID', outbox: 'payment', group: 'Registers', sub: 'Every payment received' },
  issues: { label: 'Notes & Issues', icon: '📌', key: 'Issue #', outbox: 'issue', group: 'Registers', sub: 'Data issues to follow up' },
  correspondence: { label: 'Correspondence', icon: '✉️', key: 'Record ID', outbox: 'correspondence', group: 'Registers', sub: 'Reminder letters, violation notices' },
  inspections: { label: 'Field Inspections', icon: '🔍', key: 'Inspection ID', outbox: 'inspection', group: 'Registers', sub: 'GPS + photos' },
  inbox: { label: 'Document Inbox', icon: '📥', key: 'File ID', group: 'Admin', sub: 'Documents read by Claude', ro: true },
  fees: { label: 'Fee Schedule', icon: '💲', key: 'Service', group: 'Admin', sub: 'Services, fees, letter wording', ro: true },
  hazards: { label: 'Chemical Hazards', icon: '☣️', key: 'name', group: 'Admin', sub: 'Chemical list · HMIS ratings · fee categories', ro: true, outbox: 'chemical' },
  activity: { label: 'Activity Log', icon: '🕘', key: 'When', group: 'Admin', sub: 'Who saved, changed or deleted', ro: true },
};
const KIND_OF = { companies: 'company', licences: 'licence', clearances: 'clearance', bills: 'bill', payments: 'payment', issues: 'issue', correspondence: 'correspondence', inspections: 'inspection' };
export function rowsOf(snap, kind) {
  const t = snap.tables;
  if (kind === 'clearances') return groupClearances(t.clearances);
  if (kind === 'bills') return [...snap.insights.bills].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)));
  if (kind === 'fees') return [...(snap.config.fees || []).map(f => ({ ...f, _bt: false })), ...(snap.config.billTypes || []).map(b => ({ ...b, Service: 'Bill type: ' + b['Bill Type'], _bt: true }))];
  if (kind === 'hazards') return snap.hazards.rows;
  if (kind === 'activity') return snap.activity || [];
  if (kind === 'inbox') return [...(t.inbox || [])].reverse();
  return t[kind] || [];
}
export const idOf = (kind, r) => (kind === 'licenceChemicals' || kind === 'licenceVehicles' || kind === 'licenceEffluent' ? r['Licence Record ID'] : r[KINDS[kind].key]);
const OUTBOX_TITLE = {
  company: d => d.name, licence: d => `${d.company} – ${d.type || d.category}`, clearance: d => `${d.company} – ${(d.lines || []).length} chemical(s)`, bill: d => `${d.company} – US$${money((d.lines || []).reduce((a, l) => a + num(l.amount), 0))}`,
  payment: d => `${d.bill || d.company} – US$${money(d.amount)}`, inspection: d => `${d.site}${d.company ? ' – ' + d.company : ''}`, issue: d => d.issue, correspondence: d => `${d.type} – ${d.company}`,
  delete: d => `Delete ${d.id}`, chemical: d => `Add ${d.name} to the chemical list`, inboxReject: d => 'Reject document',
};
export const outboxTitle = o => (o.data.id && o.type !== 'delete' ? `Edit ${o.data.id}: ` : '') + String((OUTBOX_TITLE[o.type] || (() => o.type))(o.data) || '').slice(0, 90);
export function OutPill({ o }) {
  const m = { queued: ['warn', 'Waiting to upload'], confirm: ['warn', 'Needs your OK'], error: ['bad', 'Error'], ok: ['ok', o.resultId ? 'Saved ' + o.resultId : 'Saved'] }[o.status] || ['', o.status];
  return <Pill tone={m[0]}>{m[1]}</Pill>;
}
const statusTone = s => (/^active/i.test(s) ? 'ok' : /expired/i.test(s) ? 'bad' : /pending/i.test(s) ? 'warn' : '');
export function display(kind, r) {
  switch (kind) {
    case 'companies': return { title: r['Company Name'], sub: [r['Company ID'], r['Sector / Activity'], r['Location']].filter(Boolean).join(' · ') };
    case 'licences': {
      const d = daysUntil(r['Expiry Date']), s = licState(r);
      return { title: `${r['Licence / Certificate Type'] || r['Licence Category']}`, sub: [r['Record ID'], r['Company Name'], r['Licence / Certificate No.'], r['Expiry Date'] && 'expires ' + fmtD(r['Expiry Date'])].filter(Boolean).join(' · '),
        badge: <Pill tone={d === null ? statusTone(s) : licTone(d)}>{d !== null && d >= 0 && d <= 60 ? `${d} d left` : s}</Pill> };
    }
    case 'licenceChemicals': return { title: r['Trade or IUPAC Name'], sub: [r['Licence Record ID'], r['Company'], r['EPA Registration No.']].filter(Boolean).join(' · '), right: r['Stipulated Qty'] !== '' ? `${kgFmt(r['Stipulated Qty'])} ${r['Unit'] || ''}` : '' };
    case 'licenceVehicles': return { title: `${r['Vehicle Type'] || 'Vehicle'} · ${r['Vehicle Registration No.'] || ''}`, sub: [r['Licence Record ID'], r['Company'], r['EPA Registration No.']].filter(Boolean).join(' · ') };
    case 'licenceEffluent': return { title: `${r['Section']}: ${r['Field 1']}`, sub: [r['Licence Record ID'], r['Company'], r['Field 2'], r['Field 3']].filter(Boolean).join(' · ') };
    case 'clearances': return { title: `${r.no} · ${r.co}`, sub: `${r.lines.length} chemical(s) · ${kgFmt(r.kg)} kg · ${fmtD(r.date)}`, badge: r.billNo ? <Pill tone="info">{r.billNo}</Pill> : null };
    case 'bills': return { title: `${r.no} · ${r.co}`, sub: [r.type || r.purpose, fmtD(r.date)].filter(Boolean).join(' · '), right: 'US$' + money(r.billed),
      badge: <Pill tone={r.isPaid ? 'ok' : r.age > 30 ? 'bad' : 'warn'}>{r.isPaid ? 'Paid' : 'Owes ' + money(r.out)}</Pill> };
    case 'payments': return { title: r['Company Name'] || r['Name as Recorded'], sub: [r['Record ID'], r['Receipt No.'] && 'Rcpt ' + r['Receipt No.'], fmtD(r['Payment Date']), r['Bill No.'] || 'company account'].filter(Boolean).join(' · '), right: 'US$' + money(r['Amount (USD)']) };
    case 'inspections': return { title: r['Site / Facility'], sub: [r['Inspection ID'], r['Company'], fmtD(r['Inspection Date'])].filter(Boolean).join(' · '),
      badge: r['Compliance'] ? <Pill tone={r['Compliance'] === 'Compliant' ? 'ok' : r['Compliance'] === 'Non-compliant' ? 'bad' : 'warn'}>{r['Compliance']}</Pill> : null };
    case 'issues': return { title: String(r['Issue Found'] || '').slice(0, 90), sub: [r['Issue #'], r['Register'], r['Record']].filter(Boolean).join(' · '), badge: <Pill tone={/^open/i.test(r['Follow-up Status']) ? 'warn' : 'ok'}>{String(r['Follow-up Status'] || '—').slice(0, 18)}</Pill> };
    case 'correspondence': return { title: `${r['Type']} · ${r['Company Name'] || r['Name as Recorded']}`, sub: [r['Record ID'], r['Description'], fmtD(r['Date'])].filter(Boolean).join(' · ') };
    case 'inbox': return { title: r['File name'], sub: [r['Type'], r['Company'], fmtD(r['Received'])].filter(Boolean).join(' · '), badge: <Pill tone={r['Status'] === 'Approved' ? 'ok' : r['Status'] === 'Rejected' ? '' : /Not read|attention/.test(r['Status']) ? 'bad' : 'warn'}>{r['Status']}</Pill> };
    case 'fees': return r._bt ? { title: r.Service, sub: String(r['Opening Paragraph'] || '').slice(0, 90) } : { title: r['Service'], sub: [r['Bill Group'], r['Notes']].filter(Boolean).join(' · '), right: r['Suggested Fee (USD)'] !== '' ? 'US$' + money(r['Suggested Fee (USD)']) : '' };
    case 'hazards': return { title: r.name, sub: [r.cas, r.cat || 'no fee category', r.hmis !== '' ? 'HMIS ' + r.hmis : 'HMIS missing'].filter(Boolean).join(' · ') };
    case 'activity': return { title: `${r['Action']} · ${r['Record'] || r['Register']}`, sub: [fmtWhen(r['When']), r['Who'], r['Details']].filter(Boolean).join(' · ') };
    default: return { title: '' };
  }
}

/* ---------------- the registers */
export function Records({ snap, go }) {
  const groups = ['Registers', 'Admin'];
  return (<>
    <Header title="Registers" sub="All saved records · ⇅ sort & download any of them" />
    <div className="tiles">
      <button className="tile" onClick={() => go('find')}><i>🔎</i><b>Find</b><small>Any record in any register</small></button>
      <button className="tile" onClick={() => go('reports')}><i>📊</i><b>Reports</b><small>Monthly, annual, quotas…</small></button>
    </div>
    {groups.map(g => <div key={g}><h2 className="sect">{g}</h2>
      {Object.entries(KINDS).filter(([, K]) => K.group === g).map(([k, K]) => (
        <Row key={k} icon={K.icon} title={K.label} sub={K.sub} right={<b>{rowsOf(snap, k).length}</b>} onClick={() => go('list', { kind: k })} />))}</div>)}
  </>);
}

const FILTERS = {
  licences: [['all', 'All'], ['soon', 'Expiring ≤60 d'], ['expired', 'Expired'], ['active', 'Active'], ['pending', 'Pending'], ['noexp', 'No expiry'], ['CIL', 'CIL'], ['CRL', 'CRL'], ['EDL', 'EDL']],
  bills: [['all', 'All'], ['unpaid', 'Unpaid'], ['old', 'Unpaid > 30 d'], ['part', 'Part-paid'], ['paid', 'Paid']],
  inspections: [['all', 'All'], ['nc', 'Non-compliant'], ['minor', 'Minor issues'], ['ok', 'Compliant']],
  issues: [['all', 'All'], ['open', 'Open'], ['closed', 'Closed']],
  clearances: [['all', 'All'], ['month', 'This month'], ['year', 'This year'], ['nobill', 'Not billed']],
  payments: [['all', 'All'], ['year', 'This year'], ['nobill', 'No Bill No.']],
  inbox: [['all', 'All'], ['open', 'To check'], ['done', 'Approved'], ['rej', 'Rejected']],
  hazards: [['all', 'All'], ['missing', 'HMIS or category missing']],
  companies: [['all', 'All'], ['noemail', 'No e-mail'], ['nolic', 'No licence']],
};
function filt(kind, f, r, snap) {
  if (f === 'all') return true;
  const ym = today().slice(0, 7), y = today().slice(0, 4);
  if (kind === 'licences') {
    const d = daysUntil(r['Expiry Date']), s = licState(r);
    if (['CIL', 'CRL', 'EDL'].includes(f)) return licenceKind(r).startsWith(f);
    return f === 'soon' ? d !== null && d >= 0 && d <= 60 : f === 'expired' ? s === 'Expired' : f === 'active' ? s === 'Active' : f === 'pending' ? s === 'Pending' : s === 'No expiry recorded';
  }
  if (kind === 'bills') return f === 'paid' ? r.isPaid : f === 'old' ? !r.isPaid && r.age > 30 : f === 'part' ? !r.isPaid && r.paid > 0 : !r.isPaid;
  if (kind === 'inspections') return f === 'nc' ? r['Compliance'] === 'Non-compliant' : f === 'ok' ? r['Compliance'] === 'Compliant' : r['Compliance'] === 'Minor issues';
  if (kind === 'issues') return f === 'open' ? /^open/i.test(r['Follow-up Status']) || !r['Follow-up Status'] : !/^open/i.test(r['Follow-up Status']) && r['Follow-up Status'];
  if (kind === 'clearances') return f === 'month' ? String(r.date).startsWith(ym) : f === 'year' ? String(r.date).startsWith(y) : !r.billNo;
  if (kind === 'payments') return f === 'year' ? String(r['Payment Date']).startsWith(y) : !r['Bill No.'];
  if (kind === 'inbox') return f === 'open' ? ['To review', 'Needs attention', 'Not read'].includes(r['Status']) : f === 'done' ? r['Status'] === 'Approved' : r['Status'] === 'Rejected';
  if (kind === 'hazards') return r.hmis === '' || !r.cat;
  if (kind === 'companies') return f === 'noemail' ? !String(r['Email'] || '').trim() : !snap.tables.licences.some(l => l['Company ID'] === r['Company ID']);
  return true;
}
const SORTS = {
  companies: [['name', 'Name', r => r['Company Name']], ['id', 'ID', r => r['Company ID']]],
  licences: [['exp', 'Expiry', r => r['Expiry Date'] || '9'], ['id', 'Newest', r => r['Record ID'], true], ['co', 'Company', r => r['Company Name']]],
  clearances: [['date', 'Newest', r => r.date || '', true], ['kg', 'Largest', r => r.kg, true], ['co', 'Company', r => r.co]],
  bills: [['date', 'Newest', r => r.date || '', true], ['out', 'Most owed', r => r.out, true], ['co', 'Company', r => r.co]],
  payments: [['date', 'Newest', r => r['Payment Date'] || '', true], ['amt', 'Largest', r => num(r['Amount (USD)']), true], ['co', 'Company', r => r['Company Name']]],
};
export function List({ kind, initialFilter, snap, outbox, go, flash }) {
  const K = KINDS[kind];
  const [q, setQ] = useState('');
  const [f, setF] = useState(initialFilter || 'all');
  const [sort, setSort] = useState(SORTS[kind] ? SORTS[kind][0][0] : '');
  const [n, setN] = useState(80);
  const [out, setOut] = useState(false);
  const all = useMemo(() => rowsOf(snap, kind), [snap, kind]);
  const rows = useMemo(() => {
    let x = all.filter(r => filt(kind, f, r, snap) && matches(kind === 'clearances' ? { ...r, lines: r.lines.map(l => l['Chemical as Recorded'] + ' ' + l['Chemical (Standard)'] + ' ' + l['B/L / Invoice / AWB No.']).join(' ') } : r, q));
    const s = (SORTS[kind] || []).find(z => z[0] === sort); if (s) x = [...x].sort(by(s[2], s[3]));
    return x;
  }, [all, kind, f, q, sort, snap]);
  const waiting = outbox.filter(o => o.type === K.outbox && o.status !== 'ok');
  const flat = () => (kind === 'clearances' ? snap.tables.clearances.filter(r => rows.some(g => g.no === r['Clearance No.'])) : kind === 'bills' ? snap.tables.bills.filter(r => rows.some(b => b.no === r['Bill No.'])) : rows);
  const cols = data => Object.keys(data[0] || {}).filter(c => !c.startsWith('_') && typeof (data[0] || {})[c] !== 'object').map(c => ({ label: c, value: r => r[c] }));
  const csv = async () => { const d = flat(); try { await shareCsv(`CMU_${K.label.replace(/\W+/g, '_')}.csv`, toCsv(d, cols(d))); } catch (e) { flash(e.message); } };
  const pdf = async () => {
    const d = flat(), c = cols(d).slice(0, 10);
    try { flash('Making the PDF…'); const m = registerDoc(K.label, c, d); await sharePdf(m.filename, await renderPdf(m)); } catch (e) { flash(e.message); }
  };
  const add = K.outbox && (!K.ro || kind === 'hazards') ? () => go('form', { form: K.outbox }) : null;
  return (<>
    <Header title={K.label} sub={`${rows.length} of ${all.length}`} back={() => go(-1)} right={<button className="ghost small" onClick={() => setOut(true)}>⇅ ⤓</button>} />
    <input className="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
    {FILTERS[kind] && <Chips value={f} onChange={setF} options={FILTERS[kind]} />}
    {waiting.map(o => <Card key={o.cid} tone="warn"><div className="linehead"><b>{outboxTitle(o)}</b><OutPill o={o} /></div><small className="muted">Made on this phone · {fmtWhen(o.created)}</small></Card>)}
    {rows.slice(0, n).map((r, i) => { const d = display(kind, r); const id = idOf(kind, r);
      return <Row key={id + '|' + i} title={d.title} sub={d.sub} right={d.right} badge={d.badge} onClick={() => go('detail', { kind, id, row: ['activity', 'licenceChemicals', 'licenceVehicles', 'licenceEffluent', 'fees', 'hazards'].includes(kind) ? r : undefined })} />; })}
    {rows.length > n && <button className="wide" onClick={() => setN(n + 150)}>Show more ({rows.length - n} left)</button>}
    {!rows.length && !waiting.length && <Empty>Nothing found.</Empty>}
    {add && <button className="fab" onClick={add} aria-label="New">＋</button>}
    {out && <Sheet title="Sort & download" onClose={() => setOut(false)}>
      {SORTS[kind] && <><p className="muted small">Sort by</p><Chips value={sort} onChange={x => { setSort(x); setOut(false); }} options={SORTS[kind].map(s => [s[0], s[1]])} /></>}
      <p className="muted small">Download the {rows.length} record(s) shown</p>
      <Actions><button onClick={() => { setOut(false); csv(); }}>⤓ CSV (Excel)</button><button onClick={() => { setOut(false); pdf(); }}>⤓ PDF table</button></Actions>
    </Sheet>}
  </>);
}

/* ---------------- find anything */
export function Search({ snap, go }) {
  const [q, setQ] = useState('');
  const res = useMemo(() => {
    if (q.trim().length < 2) return [];
    const out = [];
    for (const k of ['companies', 'licences', 'clearances', 'bills', 'payments', 'issues', 'correspondence', 'inspections', 'licenceChemicals', 'licenceVehicles']) {
      for (const r of rowsOf(snap, k)) {
        const hay = k === 'clearances' ? { ...r, lines: r.lines.map(l => l['Chemical as Recorded'] + ' ' + l['Chemical (Standard)'] + ' ' + l['B/L / Invoice / AWB No.']).join(' ') } : r;
        if (matches(hay, q)) out.push({ k, r });
        if (out.length > 120) break;
      }
    }
    return out;
  }, [q, snap]);
  return (<>
    <Header title="Find" sub="Companies, licences, clearances, bills, payments, B/L, receipts…" back={() => go(-1)} />
    <input className="search big" autoFocus placeholder="Name, ID, licence No., B/L, receipt No.…" value={q} onChange={e => setQ(e.target.value)} />
    {res.map(({ k, r }, i) => { const d = display(k, r); return <Row key={i} icon={KINDS[k].icon} title={d.title} sub={d.sub} right={d.right} badge={d.badge} onClick={() => go('detail', { kind: k, id: idOf(k, r), row: k.startsWith('licence') && k !== 'licences' ? r : undefined })} />; })}
    {q.trim().length >= 2 && !res.length && <Empty>No match.</Empty>}
  </>);
}

/* ---------------- one record */
export function Detail(ctx) {
  const { kind, id, row, snap, go, flash, submit, session, isAdmin } = ctx;
  const t = snap.tables;
  const r = row || rowsOf(snap, kind).find(x => idOf(kind, x) === id);
  if (!r) return (<><Header title={id} back={() => go(-1)} /><Empty>This record is not in the downloaded copy. Sync to download the latest registers.</Empty></>);
  const edit = () => { const p = presetFrom(kind, snap, id); if (p) go('form', p); };
  const del = async () => {
    if (!confirm(`Delete ${id} from the CMU database?${kind === 'licences' ? ' Its chemicals, vehicles and effluent details are deleted too.' : ''}\n\nThis cannot be undone.`)) return;
    if (await submit('delete', { kind: KIND_OF[kind], id })) go(-1);
  };
  const manage = KIND_OF[kind] && <><h2 className="sect">Manage</h2><Actions>
    <button onClick={edit}>✏️ Edit</button><button className="danger" onClick={del}>🗑 Delete</button></Actions>
    {!isAdmin && <p className="muted small">Editing and deleting need the Admin PIN (More ▸ Settings) when one is set.</p>}</>;
  const go2 = (k, i) => () => go('detail', { kind: k, id: i });
  const coLink = coId => (coId ? { 'Company ID': go2('companies', coId), 'Company Name': go2('companies', coId), Company: go2('companies', coId) } : {});
  if (kind === 'companies') return <CompanyDetail {...ctx} c={r} edit={edit} del={del} />;
  if (kind === 'licences') {
    const chems = t.licenceChemicals.filter(c => c['Licence Record ID'] === id), veh = t.licenceVehicles.filter(c => c['Licence Record ID'] === id), eff = t.licenceEffluent.filter(c => c['Licence Record ID'] === id);
    const d = daysUntil(r['Expiry Date']), k = licenceKind(r), bill = r['Bill No.'] && snap.insights.bills.find(b => b.no === r['Bill No.']);
    const q = snap.insights.quotas.filter(x => x.lic === id);
    return (<>
      <Header title={r['Licence / Certificate Type'] || r['Licence Category']} sub={`${id} · ${r['Company Name']}`} back={() => go(-1)} />
      <Card tone={d === null ? '' : licTone(d)}><div className="linehead"><b>{r['Licence / Certificate No.'] || 'No licence number yet'}</b><Pill tone={d === null ? statusTone(licState(r)) : licTone(d)}>{d === null ? licState(r) : d < 0 ? `Expired ${-d} d ago` : `${d} days left`}</Pill></div>
        <KV row={r} skip={['Verification Code']} link={{ ...coLink(r['Company ID']), ...(bill ? { 'Bill No.': go2('bills', bill.no) } : {}) }} /></Card>
      <h2 className="sect">Print</h2>
      <Actions><button className="primary" onClick={() => go('doc', { doc: k, id })}>🖨 {DOC_KINDS[k]}</button>
        {k === 'EDL' && <button onClick={() => go('doc', { doc: 'EDLRP', id })}>Retention-pond format</button>}
        {k === 'EDLRP' && <button onClick={() => go('doc', { doc: 'EDL', id })}>Standard EDL format</button>}</Actions>
      <h2 className="sect">Next steps</h2>
      <Actions>
        <button onClick={() => go('form', { form: 'bill', preset: { company: r['Company Name'], type: 'Licence – New Application', linked: id, lines: [{ service: billService(snap, r), details: r['Licence / Certificate No.'] || '', amount: suggested(snap, billService(snap, r)) }] } })}>🧾 Create bill</button>
        <button onClick={() => go('form', { form: 'licence', preset: renewPreset(snap, r) })}>🔁 Renew</button>
        {/CIL|importation/i.test(r['Licence Category']) && <button onClick={() => go('form', { form: 'clearance', preset: { company: r['Company Name'] } })}>🧪 New clearance</button>}
      </Actions>
      {chems.length > 0 && <Card title={`Chemicals (${chems.length})`}>{chems.map((c, i) => { const qq = q.find(x => eq(x.chem, c['Trade or IUPAC Name']));
        return <div className="kv" key={i}><span>{c['Trade or IUPAC Name']}<small className="muted"> {c['EPA Registration No.']}</small></span><b>{c['Stipulated Qty'] !== '' ? `${kgFmt(c['Stipulated Qty'])} ${c['Unit'] || ''}` : c['Type'] || ''}{qq && qq.limit ? ` · ${pct(qq.pct)} used` : ''}</b></div>; })}</Card>}
      {veh.length > 0 && <Card title={`Vehicles (${veh.length})`}>{veh.map((v, i) => <div className="kv" key={i}><span>{v['Vehicle Type']}</span><b>{v['Vehicle Registration No.']} {v['EPA Registration No.'] && '· ' + v['EPA Registration No.']}</b></div>)}</Card>}
      {eff.length > 0 && <Card title="Effluent details">{eff.map((e, i) => <div className="kv" key={i}><span>{e['Section']}: {e['Field 1']}</span><b>{[e['Field 2'], e['Field 3'], e['Field 5'], e['Field 6']].filter(Boolean).join(' · ')}</b></div>)}</Card>}
      {manage}
    </>);
  }
  if (kind === 'clearances') {
    const bill = r.billNo && snap.insights.bills.find(b => b.no === r.billNo);
    return (<>
      <Header title={r.no} sub={r.co} back={() => go(-1)} />
      <Card><div className="kv"><span>Company</span><button className="link" onClick={go2('companies', r.coId)}>{r.co}</button></div>
        <div className="kv"><span>Date</span><b>{fmtD(r.date)}</b></div>{r.eta && <div className="kv"><span>ETA</span><b>{fmtD(r.eta)}</b></div>}
        <div className="kv"><span>EPA Ref. No.</span><b>{r.ref || '–'}</b></div><div className="kv"><span>B/L / Invoice</span><b>{r.bl || '–'}</b></div>
        <div className="kv"><span>Total</span><b>{kgFmt(r.kg)} kg · {kgFmt(r.kg / 1000)} MT</b></div>
        {bill && <div className="kv"><span>Bill</span><button className="link" onClick={go2('bills', bill.no)}>{bill.no} · {bill.status}</button></div>}
        {r.remarks && <p className="small muted">{r.remarks}</p>}</Card>
      <Card title={`Chemicals (${r.lines.length})`}>{r.lines.map(l => <div className="kv" key={l['Record ID']}><span>{l['Chemical as Recorded']}{l['Chemical (Standard)'] && l['Chemical (Standard)'] !== l['Chemical as Recorded'] && <small className="muted"> → {l['Chemical (Standard)']}</small>}</span>
        <b>{l['Qty (kg)'] !== '' ? kgFmt(l['Qty (kg)']) + ' kg' : `${l['Qty as Recorded']} ${l['Unit']}`}</b></div>)}</Card>
      <Actions><button className="primary" onClick={() => go('doc', { doc: 'CLR', id: r.no })}>🖨 Clearance letter</button>
        <button onClick={() => go('fee', { lines: r.lines.filter(l => l['Chemical (Standard)']).map(l => ({ std: l['Chemical (Standard)'], qty: l['Qty as Recorded'], unit: l['Unit'], hmis: '', cat: '' })), clearance: r })}>💲 Fee estimate</button>
        {!r.billNo && <button onClick={() => go('form', { form: 'bill', preset: { company: r.co, type: 'Chemical Clearance', linked: r.no, lines: [{ service: 'Chemical Clearance', details: r.lines.map(l => l['Chemical (Standard)'] || l['Chemical as Recorded']).filter((x, i, a) => a.indexOf(x) === i).join(', '), amount: '' }] } })}>🧾 Create bill</button>}</Actions>
      {manage}
    </>);
  }
  if (kind === 'bills') {
    const lines = t.bills.filter(x => x['Bill No.'] === r.no), pays = t.payments.filter(p => eq(p['Bill No.'], r.no));
    return (<>
      <Header title={r.no} sub={r.co} back={() => go(-1)} />
      <Card tone={r.isPaid ? 'ok' : r.age > 30 ? 'bad' : 'warn'}>
        <div className="kv"><span>Company</span><button className="link" onClick={go2('companies', r.coId)}>{r.co}</button></div>
        <div className="kv"><span>Bill type</span><b>{r.type || '–'}</b></div><div className="kv"><span>Bill ref. No.</span><b>{r.ref || '–'}</b></div>
        <div className="kv"><span>Date</span><b>{fmtD(r.date)}{r.age !== null ? ` · ${r.age} days ago` : ''}</b></div>
        <div className="kv"><span>Billed</span><b>US${money(r.billed)}</b></div><div className="kv"><span>Paid</span><b>US${money(r.paid)}</b></div>
        <div className="kv"><span>Outstanding</span><b className="big">US${money(r.out)}</b></div><div className="kv"><span>Status</span><b>{r.status}</b></div>
        {r.linked && <div className="kv"><span>Linked record</span><b>{r.linked.split(/[,;\s]+/).map(x => <button key={x} className="link" onClick={go2(/^CLN/.test(x) ? 'clearances' : 'licences', x)}>{x} </button>)}</b></div>}
        {r.contact && <div className="kv"><span>Contact</span><b>{[r.contact, r.title].filter(Boolean).join(', ')}</b></div>}</Card>
      <Card title={`Services (${lines.length})`}>{lines.map(l => <div className="kv" key={l['Bill ID']}><span>{l['Purpose / Licence Billed']}{l['Chemical'] && <small className="muted"> · {l['Chemical']}</small>}</span><b>US${money(l['Amount Billed (USD)'])}</b></div>)}</Card>
      {pays.length > 0 && <Card title="Payments on this bill">{pays.map(p => <div className="kv" key={p['Record ID']}><button className="link left" onClick={go2('payments', p['Record ID'])}>{p['Record ID']} · {fmtD(p['Payment Date'])} · rcpt {p['Receipt No.'] || '–'}</button><b>US${money(p['Amount (USD)'])}</b></div>)}</Card>}
      {/company account/.test(r.status) && <p className="infobox">Part of this bill is covered by payments recorded for the company without a Bill No. (company account).</p>}
      <Actions><button className="primary" onClick={() => go('doc', { doc: 'BILL', id: r.no })}>🖨 Bill letter</button>
        {!r.isPaid && <button onClick={() => go('form', { form: 'payment', preset: { bill: r.no } })}>💵 Record payment</button>}</Actions>
      {manage}
    </>);
  }
  if (kind === 'inbox') return <InboxDetail {...ctx} r={r} />;
  const title = display(kind, r).title;
  return (<>
    <Header title={String(title).slice(0, 40)} sub={KINDS[kind].label} back={() => go(-1)} />
    <Card><KV row={r} skip={['_bt']} link={{ ...coLink(r['Company ID']), ...(r['Licence Record ID'] ? { 'Licence Record ID': go2('licences', r['Licence Record ID']) } : {}), ...(r['Bill No.'] && kind === 'payments' ? { 'Bill No.': go2('bills', r['Bill No.']) } : {}) }} /></Card>
    {kind === 'inspections' && r['Latitude'] && <Actions><button onClick={() => openLink(`https://www.google.com/maps?q=${r['Latitude']},${r['Longitude']}`)}>🗺 Open in Maps</button></Actions>}
    {kind === 'inspections' && r['Photos'] && <Card title="Photos">{String(r['Photos']).split('\n').map((u, i) => <a key={i} className="link" href={u} target="_blank" rel="noreferrer">Photo {i + 1} </a>)}</Card>}
    {kind === 'hazards' && <Actions><button onClick={() => go('fee', { lines: [{ std: r.name, qty: '', unit: 'kg', hmis: '', cat: '' }] })}>💲 Fee estimate</button>
      <button onClick={() => go('form', { form: 'chemical', preset: { name: r.name, cas: r.cas, hmis: r.hmis === '' ? '' : String(r.hmis), cat: r.cat, notes: '' } })}>✏️ HMIS / fee category</button></Actions>}
    {manage}
  </>);
}
function billService(snap, l) {
  const c = `${l['Licence Category']} ${l['Licence / Certificate Type']}`, fees = (snap.config.fees || []).map(f => f['Service']);
  const pick = re => fees.find(f => re.test(f)) || '';
  if (/retention|dewater/i.test(c)) return pick(/Dewatering/i) || pick(/Effluent/i);
  if (/effluent|EDL/i.test(c)) return pick(/Effluent Discharge License/i);
  if (/importation|CIL/i.test(c)) return pick(/Importation/i);
  if (/registration|CRL/i.test(c)) return pick(/Registration/i);
  if (/fumigation/i.test(c)) return pick(/accreditation/i.test(c) ? /Accreditation/i : /Fumigation Certificate/i);
  if (/transport/i.test(c)) return pick(/Transportation/i);
  return '';
}
const suggested = (snap, s) => { const f = (snap.config.fees || []).find(x => eq(x['Service'], s)); return f && f['Suggested Fee (USD)'] !== '' ? f['Suggested Fee (USD)'] : ''; };

function CompanyDetail({ snap, c, go, edit, del, isAdmin }) {
  const P = profile(snap, c['Company ID']);
  const [tab, setTab] = useState('lic');
  const id = c['Company ID'];
  const g = (k, i) => () => go('detail', { kind: k, id: i });
  const msg = `Dear ${c['Contact Person'] || 'Sir/Madam'},\n\nThis is the Chemical Management Unit (CMU) of the EPA Liberia concerning ${c['Company Name']}.\n\n`;
  return (<>
    <Header title={c['Company Name']} sub={[id, c['Sector / Activity']].filter(Boolean).join(' · ')} back={() => go(-1)} />
    <div className="grid g4">
      <div className="stat"><b>{P.lic.length}</b><span>Licences ({P.active} active)</span></div>
      <div className="stat"><b>{P.cl.length}</b><span>Clearances · {kgFmt(P.kgAll / 1000)} MT</span></div>
      <div className="stat"><b>{money(P.billed).replace(/\.\d\d$/, '')}</b><span>US$ billed</span></div>
      <div className="stat"><b className={P.balance > 0.005 ? 'c-red' : 'c-green'}>{money(P.balance).replace(/\.\d\d$/, '')}</b><span>US$ balance</span></div>
    </div>
    <Card>
      <div className="kv"><span>Location</span><b>{c['Location'] || '–'}</b></div>
      {c['Other Names Recorded'] && <div className="kv"><span>Other names</span><b>{c['Other Names Recorded']}</b></div>}
      <div className="kv"><span>Contact</span><b>{[c['Contact Person'], c['Contact Title']].filter(Boolean).join(', ') || '–'}</b></div>
      <div className="kv"><span>Phone</span><b>{c['Phone'] || '–'}</b></div><div className="kv"><span>Email</span><b>{c['Email'] || '–'}</b></div>
      <div className="kv"><span>Reminders</span><b>{/^no$/i.test(c['Send reminders?']) ? 'Off' : c['Email'] ? 'On' : 'No e-mail'}{c['Last reminder sent'] ? ' · last ' + fmtD(c['Last reminder sent']) : ''}</b></div>
      <Actions>
        {c['Phone'] && <button onClick={() => openLink(telLink(c['Phone']))}>📞 Call</button>}
        {c['Phone'] && <button onClick={() => openLink(waLink(c['Phone'], msg))}>💬 WhatsApp</button>}
        {c['Email'] && <button onClick={() => openLink(mailLink(c['Email'], `EPA Liberia – CMU: ${c['Company Name']}`, msg))}>✉️ E-mail</button>}
      </Actions>
    </Card>
    <h2 className="sect">New for this company</h2>
    <div className="tiles t3">
      <button className="tile" onClick={() => go('form', { form: 'licence', preset: { company: c['Company Name'], location: c['Location'] } })}><i>📜</i><b>Licence</b></button>
      <button className="tile" onClick={() => go('form', { form: 'clearance', preset: { company: c['Company Name'] } })}><i>🧪</i><b>Clearance</b></button>
      <button className="tile" onClick={() => go('form', { form: 'bill', preset: { company: c['Company Name'], contact: c['Contact Person'], title: c['Contact Title'], location: c['Location'], activity: c['Sector / Activity'] } })}><i>🧾</i><b>Bill</b></button>
      <button className="tile" onClick={() => go('form', { form: 'payment', preset: { company: c['Company Name'] } })}><i>💵</i><b>Payment</b></button>
      <button className="tile" onClick={() => go('form', { form: 'inspection', preset: { company: c['Company Name'], site: c['Location'] } })}><i>🔍</i><b>Inspection</b></button>
      <button className="tile" onClick={() => go('form', { form: 'correspondence', preset: { company: c['Company Name'], activity: c['Sector / Activity'] } })}><i>✉️</i><b>Letter / notice</b></button>
    </div>
    <Actions><button className="primary" onClick={() => go('doc', { doc: 'PROFILE', id })}>🏷 Company profile (PDF)</button><button onClick={() => go('quotas', { coId: id })}>⚖️ Quotas</button></Actions>
    <Chips value={tab} onChange={setTab} options={[['lic', `Licences ${P.lic.length}`], ['bills', `Bills ${P.bills.length}`], ['pays', `Payments ${P.pays.length}`], ['clr', `Clearances ${P.cl.length}`], ['more', `More ${P.insp.length + P.cor.length + P.vehicles.length}`]]} />
    {tab === 'lic' && (P.lic.length ? P.lic.map(l => { const d = display('licences', l); return <Row key={l['Record ID']} title={d.title} sub={d.sub} badge={d.badge} onClick={g('licences', l['Record ID'])} />; }) : <Empty>No licences on record.</Empty>)}
    {tab === 'bills' && (P.bills.length ? P.bills.map(b => { const d = display('bills', b); return <Row key={b.no} title={b.no} sub={d.sub} right={d.right} badge={d.badge} onClick={g('bills', b.no)} />; }) : <Empty>No bills on record.</Empty>)}
    {tab === 'pays' && (P.pays.length ? P.pays.map(p => { const d = display('payments', p); return <Row key={p['Record ID']} title={p['Purpose / Services'] || p['Record ID']} sub={d.sub} right={d.right} onClick={g('payments', p['Record ID'])} />; }) : <Empty>No payments on record.</Empty>)}
    {tab === 'clr' && (P.cl.length ? P.cl.map(x => { const d = display('clearances', x); return <Row key={x.no} title={x.no} sub={d.sub} badge={d.badge} onClick={g('clearances', x.no)} />; }) : <Empty>No clearances on record.</Empty>)}
    {tab === 'more' && <>{P.insp.map(i => <Row key={i['Inspection ID']} icon="🔍" title={i['Site / Facility']} sub={[i['Inspection ID'], fmtD(i['Inspection Date']), i['Compliance']].join(' · ')} onClick={g('inspections', i['Inspection ID'])} />)}
      {P.cor.map(x => <Row key={x['Record ID']} icon="✉️" title={x['Type']} sub={[x['Record ID'], x['Description']].join(' · ')} onClick={g('correspondence', x['Record ID'])} />)}
      {P.vehicles.map((v, i) => <Row key={i} icon="🚚" title={`${v['Vehicle Type']} ${v['Vehicle Registration No.']}`} sub={v['Licence Record ID']} onClick={g('licences', v['Licence Record ID'])} />)}
      {!P.insp.length && !P.cor.length && !P.vehicles.length && <Empty>No inspections, letters or vehicles.</Empty>}</>}
    <h2 className="sect">Manage</h2>
    <Actions><button onClick={edit}>✏️ Edit company</button><button className="danger" onClick={del}>🗑 Delete</button></Actions>
    {!isAdmin && <p className="muted small">Editing and deleting need the Admin PIN when one is set.</p>}
  </>);
}

function InboxDetail({ r, snap, go, submit }) {
  let data = {}; try { data = JSON.parse(r['Data'] || '{}'); } catch { /* ignore */ }
  const type = r['Type'];
  const open = ['To review', 'Needs attention', 'Not read'].includes(r['Status']);
  const review = form => go('form', { form, preset: { ...fromAiLazy(form, data), inboxId: r['File ID'], aiConf: r['Confidence'], aiIssues: r['Notes'] ? String(r['Notes']).split(' • ') : [] } });
  const reject = async () => { const why = prompt('Why is this document rejected? (e.g. duplicate, not a CMU document)'); if (why === null) return; if (await submit('inboxReject', { fid: r['File ID'], reason: why })) go(-1); };
  return (<>
    <Header title={r['File name']} sub="Document Inbox" back={() => go(-1)} />
    <Card tone={open ? 'warn' : r['Status'] === 'Approved' ? 'ok' : ''}><KV row={r} skip={['Data', 'File ID']} /></Card>
    {Object.keys(data).length > 0 && <Card title="What Claude read"><pre className="json">{JSON.stringify(data, null, 1)}</pre></Card>}
    {open && <><h2 className="sect">Check and save</h2><Actions>
      {['clearance', 'licence', 'payment', 'bill', 'company'].includes(type) && <button className="primary" onClick={() => review(type)}>Open the {FORM_LABEL[type].toLowerCase()} form</button>}
      {type !== 'clearance' && <button onClick={() => review('clearance')}>As a clearance</button>}
      {type !== 'licence' && <button onClick={() => review('licence')}>As a licence</button>}
      {type !== 'payment' && <button onClick={() => review('payment')}>As a payment</button>}
      <button className="danger" onClick={reject}>Reject</button></Actions>
      <p className="muted small">The form opens filled in; nothing is saved until you check it and tap Save. The inbox row then turns Approved.</p></>}
  </>);
}
