// Tools of the sheet on the phone: fee calculator, quota tracker, insights & aging, monthly / annual reports, analytics,
// QR document check, duplicate check, chemical-name standardiser, chemical hazards, amount in words, data check,
// activity log, saved documents, company contacts & reminders, email log.
import { useEffect, useMemo, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Btn, Card, Icon, IconBtn, Text, Num, Select, Picker, Seg, Chips, Note, Row, Badge, KV, Empty, Kpi, Meter, Sect, Toggle, Loading, confirm, alertBox, useBusy } from '../components/ui';
import { Bars, HBars, Donut, Ring } from '../components/charts';
import { alertBadge, ageBadge } from './Home';
import { money, usd, usd0, fmtD, fmtDT, num, str, trim, eqi, iso, today, toDate, MON, MONTHS, feeCalc, dupSimilar, stdChem, amountInWords, monthlyReport, annualFigures, chartData, yearsIn, dataCheck, topN, insData, quoKg, aiUnit, ago } from '../lib/logic';
import { monthlyPdf, annualPdf, quotaPdf, insightsPdf, dataCheckPdf, feePdf, exportXlsx } from '../lib/exporter';
import { OfficialPdf } from './Details';
import { scanQR, saveAndShare, openUrl, shareText } from '../lib/device';
import { db } from '../lib/db';

const Screen = ({ title, sub, right, children, noNav = true }) => <><Bar title={title} sub={sub} right={right} /><main className={'main' + (noNav ? ' noNav' : '')}><div className="wrap">{children}</div></main></>;

/* ------------------------------------------------------------------ hub */
export function ToolsHub() {
  const nav = useNav(), { D, Q, T, isAdmin } = useApp();
  const open = (T.inbox || []).filter(x => ['To review', 'Needs attention', 'Not read'].includes(x.status)).length;
  const groups = [
    ['Work tools', [['calc', 'Fee calculator', 'RI/C&E-002-04/20 · Qp = R × Hi × Qi', 'fee'], ['qr', 'Check a document', 'Scan the QR on a licence, letter or bill', 'verify'], ['sparkle', 'Ask Claude', 'Questions, documents → forms', 'assistant'],
      ['inbox', 'Document Inbox', open ? `${open} to review` : 'Documents read by Claude', 'inbox'], ['dup', 'Duplicate company check', 'Before registering a company', 'dupcheck'], ['wand', 'Standardise chemical names', 'Free text → standard names', 'stdnames'],
      ['warn', 'Chemical hazards', 'HMIS ratings & fee categories', 'hazards'], ['receipt', 'Fee schedule', 'Services, suggested fees, bill types', 'feeschedule'], ['words', 'Amount in words & units', 'For letters; kg ⇄ MT', 'words']]],
    ['Monitoring', [['bell', 'Insights & alerts', `${D.alerts.length} licence alerts · ${D.unpaid.length} unpaid bills`, 'insights'], ['scale', 'Import quota tracker', `${Q.rows.filter(x => x.status === 'OVER QUOTA').length} over · ${Q.rows.filter(x => x.status.startsWith('Near')).length} near limit`, 'quota'],
      ['chart', 'Analytics', 'Charts by month, type, company, chemical', 'analytics'], ['shield', 'Data health check', 'Duplicates, missing fields, mismatches', 'datacheck']]],
    ['Reports', [['calendar', 'Monthly report', 'Summary, lists, PDF', 'monthly'], ['book', 'Annual report', 'Key figures, compliance, PDF', 'annual'], ['file', 'Saved documents', 'PDFs made or downloaded on this phone', 'documents']]],
    ['Contacts & follow-up', [['users', 'Company contacts', 'Emails and phones for reminders', 'contacts'], ['mail', 'Email reminders', 'Who gets a reminder, send now', 'reminders'], ['history', 'Activity log', 'Every save, change and delete', 'activity'], ['mail', 'Email log', 'Emails with companies (Gmail)', 'emails']]],
  ];
  return (
    <>
      <Bar back={false} title="Tools" sub="Everything from the CMU Database menu" />
      <main className="main"><div className="wrap">
        {groups.map(([g, items]) => <div key={g}><Sect>{g}</Sect><div className="list">{items.map(([ic, t, s, r]) => <Row key={t} icon={ic} t1={t} t2={s} onClick={() => nav.go(r)} />)}</div></div>)}
        {isAdmin ? <><Sect>Admin</Sect><div className="list"><Row icon="lock" t1="Admin tools" t2="Backups, reminders, calendar, officers, Claude" onClick={() => nav.go('admin')} /></div></> : null}
      </div></main>
    </>
  );
}

/* ------------------------------------------------------------------ fee calculator */
export function FeeCalc({ clearance }) {
  const { T, L, isAdmin } = useApp(), nav = useNav();
  const init = clearance ? T.clearances.filter(c => c['Clearance No.'] === clearance).map(c => ({ chemical: c['Chemical as Recorded'], std: /other/i.test(c['Chemical (Standard)']) ? '' : c['Chemical (Standard)'], qty: str(c['Qty as Recorded']), unit: c['Unit'], cat: '', hmis: '' })) : [{ chemical: '', std: '', qty: '', unit: 'kg', cat: '', hmis: '' }];
  const [items, setItems] = useState(init);
  const [company, setCompany] = useState(clearance ? T.clearances.find(c => c['Clearance No.'] === clearance)?.['Company Name'] || '' : '');
  const [busy, run] = useBusy();
  const res = useMemo(() => feeCalc(items.filter(i => trim(i.chemical) || trim(i.std)).map(i => ({ chemical: i.chemical || i.std, chemical_standard: i.std, quantity: i.qty, unit: i.unit, category: i.cat, hmis: i.hmis })), T.hazards || [], L.chemicals, L.hazardCats, L.hazardIndex), [items, T.hazards, L]);
  const setI = (i, k) => v => setItems(xs => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Screen title="Fee calculator" sub="RI/C&E-002-04/20 · Qp = R × Hi × Qi" right={<IconBtn n="pdf" label="PDF" onClick={() => run(() => feePdf(res, { company, ref: clearance }))} />}>
      <Card><div className="flex between"><div><div className="small muted">Total fee</div><div style={{ fontSize: 28, fontWeight: 800 }}>{usd(res.total)}</div></div><Ring pct={res.lines.length ? (res.lines.length - res.missing) / res.lines.length : 0} label={`${res.lines.length - res.missing}/${res.lines.length}`} /></div>
        {res.words ? <div className="small muted mt">{res.words} UNITED STATES DOLLARS</div> : null}
        {res.missing ? <div className="small mt" style={{ color: 'var(--amber)' }}>{res.missing} line(s) without a fee: add the HMIS rating (from the SDS) and fee category{isAdmin ? ' in Chemical Hazards' : ''}, or choose them below.</div> : null}</Card>
      <Picker label="Company (optional, for the worksheet)" value={company} onChange={setCompany} options={T.companies.map(c => c['Company Name'])} free />
      {items.map((it, i) => { const ln = res.lines[items.slice(0, i).filter(x => trim(x.chemical) || trim(x.std)).length]; const has = trim(it.chemical) || trim(it.std); return (
        <div key={i} className="lineitem">
          <div className="ln"><span className="grow">Chemical {i + 1}</span>{items.length > 1 ? <button className="ib" style={{ width: 30, height: 30 }} onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}><Icon n="trash" s={16} /></button> : null}</div>
          <Picker label="Chemical" value={it.chemical} onChange={v => setItems(xs => xs.map((x, j) => (j === i ? { ...x, chemical: v, std: x.std || (stdChem(v, L.chemicals, 1)[0]?.score >= 0.75 ? stdChem(v, L.chemicals, 1)[0].name : '') } : x)))} options={L.chemicals} free />
          <Picker label="Standard name (for the hazard table)" value={it.std} onChange={setI(i, 'std')} options={L.chemicals} />
          <div className="grid2"><Num label="Quantity" value={it.qty} onChange={setI(i, 'qty')} /><Select label="Unit" value={it.unit} onChange={setI(i, 'unit')} options={['kg', 'MT', 'L', 'g']} /></div>
          <div className="grid2"><Select label="Fee category" value={it.cat} onChange={setI(i, 'cat')} options={(L.hazardCats || []).map(c => c.name)} placeholder={ln?.category ? `From table: ${ln.category}` : 'From the hazard table'} />
            <Select label="HMIS (0–4)" value={it.hmis} onChange={setI(i, 'hmis')} options={['0', '1', '2', '3', '4']} placeholder={ln && ln.hmis !== null && !it.hmis ? `From table: ${ln.hmis}` : 'From the hazard table'} /></div>
          {has && ln ? (ln.fee !== null ? <div className="flex between small"><span className="muted">{ln.working}</span><b>{usd(ln.fee)}</b></div> : <div className="small" style={{ color: 'var(--amber)' }}>{ln.note}</div>) : null}
          {has && it.std && isAdmin ? <button className="btn link sm" onClick={() => nav.go('form', { type: 'hazard', op: 'update', id: it.std })}>Edit hazard rating of {it.std}</button> : null}
        </div>); })}
      <Btn kind="line" block icon="plus" onClick={() => setItems(xs => [...xs, { chemical: '', std: '', qty: '', unit: 'kg', cat: '', hmis: '' }])}>Add a chemical</Btn>
      <Card title="Rates (Table 2) and hazard index (Table 1)" className="mt">
        <table className="tbl"><thead><tr><th>Category</th><th className="n">Rate R</th><th>per</th></tr></thead><tbody>{(L.hazardCats || []).map(c => <tr key={c.name}><td>{c.name}</td><td className="n">{c.rate}</td><td>{c.basis === 'MT' ? 'metric ton' : 'kg / litre'}</td></tr>)}</tbody></table>
        <div className="small muted mt">Hazard index Hi: HMIS 0 → 1, 1 → 1.5, 2 → 2, 3 → 2.5, 4 → 3. Explosives and Sodium Cyanide are charged per metric ton; all other categories per kg (litres count as kg).</div>
      </Card>
      <div className="btns"><Btn icon="pdf" onClick={() => run(() => feePdf(res, { company, ref: clearance }))} disabled={busy}>Fee worksheet PDF</Btn>
        {res.total > 0 ? <Btn kind="accent" icon="receipt" onClick={() => nav.go('form', { type: 'bill', op: 'create', prefill: { company, type: 'Chemical Clearance', linked: clearance || '', lines: [{ service: 'Chemical Clearance', details: res.lines.filter(l => l.fee !== null).map(l => `${l.standard} ${money(l.quantity, 0)} ${l.unit}`).join('; ').slice(0, 250), amount: String(res.total) }] } })}>Bill this</Btn> : null}</div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ quota tracker */
export function Quota() {
  const { Q } = useApp(), nav = useNav();
  const [tab, setTab] = useState('use');
  const [f, setF] = useState('all');
  const [busy, run] = useBusy();
  const [pdf, setPdf] = useState(false);
  const rows = Q.rows.filter(x => f === 'all' || (f === 'over' && x.status === 'OVER QUOTA') || (f === 'near' && x.status.startsWith('Near')) || (f === 'active' && x.active));
  return (
    <Screen title="Import quota tracker" sub="CIL quantities vs clearances" right={<><IconBtn n="pdf" label="PDF" onClick={() => run(() => quotaPdf(Q))} /><IconBtn n="print" label="Official PDF" onClick={() => setPdf(true)} /></>}>
      <div className="kpis">
        <Kpi l="Over quota" v={Q.rows.filter(x => x.status === 'OVER QUOTA').length} tone="red" onClick={() => { setTab('use'); setF('over'); }} />
        <Kpi l="Near limit" v={Q.rows.filter(x => x.status.startsWith('Near')).length} tone="amber" onClick={() => { setTab('use'); setF('near'); }} />
        <Kpi l="Not on licence" v={Q.notOn.length} tone={Q.notOn.length ? 'orange' : 'green'} onClick={() => setTab('noton')} />
        <Kpi l="No valid CIL" v={Q.noLic.length} tone={Q.noLic.length ? 'orange' : 'green'} onClick={() => setTab('nolic')} />
      </div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'use', label: 'Quota use' }, { value: 'noton', label: 'Not on licence' }, { value: 'nolic', label: 'No valid CIL' }]} />
      {tab === 'use' ? <>
        <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', n: Q.rows.length }, { value: 'active', label: 'Active licences' }, { value: 'over', label: 'Over quota' }, { value: 'near', label: 'Near limit' }]} />
        {rows.length ? <div className="list">{rows.map((x, i) => (
          <button key={i} className="row" style={{ display: 'block' }} onClick={() => nav.go('licence', { id: x.lic.id })}>
            <div className="flex between"><span className="t1" style={{ whiteSpace: 'normal' }}>{x.ch.name}{x.ch.perMonth ? ' (per month)' : ''}</span><Badge tone={x.status === 'OVER QUOTA' ? 'red' : x.status.startsWith('Near') ? 'amber' : x.status === 'OK' ? 'green' : ''}>{x.status}{x.active ? '' : ' · expired'}</Badge></div>
            <div className="t2">{x.lic.co} · {x.lic.id} {x.lic.no}</div>
            <div className="flex between small mt"><span>{money(x.basis)} kg cleared{x.month ? ` (highest ${x.month})` : ''}</span><span className="b">{x.ch.limit === null ? 'no quantity' : `of ${money(x.ch.limit)} kg · ${Math.round(x.pct * 100)}%`}</span></div>
            {x.pct !== null ? <div className="mt"><Meter pct={x.pct} /></div> : null}
          </button>))}</div> : <Empty icon="scale" title="Nothing to show">Quotas come from the chemicals and stipulated quantities on Chemical Importation Licences.</Empty>}
      </> : null}
      {tab === 'noton' ? (Q.notOn.length ? <div className="list">{Q.notOn.map((x, i) => <Row key={i} icon="flask" iconTone="orange" t1={x.line.rec || x.line.std} t2={`${x.line.co} · ${x.line.no} · ${money(x.line.kg)} kg · ${fmtD(x.line.date)}`} t3={`Licence checked: ${x.lic.id} ${x.lic.no}`} onClick={() => nav.go('clearance', { id: x.line.no })} />)}</div> : <Empty icon="check" title="None">Every cleared chemical matches a chemical on the company's licence.</Empty>) : null}
      {tab === 'nolic' ? (Q.noLic.length ? <div className="list">{Q.noLic.map((x, i) => <Row key={i} icon="flask" iconTone="amber" t1={x.rec || x.std} t2={`${x.co} · ${x.no} · ${money(x.kg)} kg`} t3={fmtD(x.date)} onClick={() => nav.go('clearance', { id: x.no })} />)}</div> : <Empty icon="check" title="None" />) : null}
      <div className="small muted mt">A clearance counts against a licence when it is for the same company, dated within the licence period, and the chemical name matches. Fix a wrong match by correcting “Chemical (Standard)” on the clearance. Quotas “per month” are compared with the busiest month.</div>
      {pdf ? <OfficialPdf kind="quota" title="Quota Tracker – official PDF" onClose={() => setPdf(false)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ insights & alerts */
export function Insights({ tab: t0 }) {
  const { D, prefs, setPref, T } = useApp(), nav = useNav();
  const [tab, setTab] = useState(t0 || 'lic');
  const [busy, run] = useBusy();
  const [pdf, setPdf] = useState(false);
  return (
    <Screen title="Insights & alerts" sub="Licences to renew · bills to collect" right={<><IconBtn n="pdf" label="PDF" onClick={() => run(() => insightsPdf(D))} /><IconBtn n="print" label="Official PDF" onClick={() => setPdf(true)} /></>}>
      <div className="kpis">
        <Kpi l="Expired, not renewed" v={D.alerts.filter(x => x.days < 0).length} tone="red" />
        <Kpi l="Expire ≤ 30 days" v={D.alerts.filter(x => x.days >= 0 && x.days <= 30).length} tone="orange" />
        <Kpi l={`Expire 31–${D.ahead} days`} v={D.alerts.filter(x => x.days > 30).length} tone="amber" />
        <Kpi l="Outstanding" v={usd0(D.unpaid.reduce((a, b) => a + b.out, 0))} s={`${D.unpaid.filter(b => b.age > 30).length} bills > 30 days`} tone="orange" />
      </div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'lic', label: `Licences ${D.alerts.length}` }, { value: 'bills', label: `Unpaid bills ${D.unpaid.length}` }, { value: 'set', label: 'Window' }]} />
      {tab === 'lic' ? (D.alerts.length ? <div className="list">{D.alerts.map(x => <Row key={x.id} icon="badge" iconTone={x.days < 0 ? 'red' : x.days <= 30 ? 'orange' : 'amber'} t1={x.co} t2={`${x.id} · ${x.type || x.cat}${x.no ? ' · ' + x.no : ''}`} t3={'Expiry ' + fmtD(x.expiry)} right={alertBadge(x)} onClick={() => nav.go('licence', { id: x.id })} />)}</div> : <Empty icon="check" title="Nothing to renew in this window" />) : null}
      {tab === 'bills' ? <>
        <Card title="Aging (days since the bill date)"><table className="tbl"><thead><tr><th>Age</th><th className="n">Bills</th><th className="n">Outstanding</th></tr></thead>
          <tbody>{D.aging.filter(a => a.bucket !== 'Date not recorded' || a.n).map(a => <tr key={a.bucket}><td>{a.bucket}</td><td className="n">{a.n}</td><td className="n">{money(a.amt)}</td></tr>)}</tbody>
          <tfoot><tr><td>TOTAL</td><td className="n">{D.unpaid.length}</td><td className="n">{money(D.unpaid.reduce((a, b) => a + b.out, 0))}</td></tr></tfoot></table></Card>
        {D.unpaid.length ? <div className="list">{D.unpaid.map(b => <Row key={b.no} icon="receipt" iconTone={b.age > 90 ? 'red' : b.age > 60 ? 'orange' : b.age > 30 ? 'amber' : ''} t1={b.co} t2={`${b.no} · ${b.type || b.purpose.join(', ')}`} t3={`${fmtD(b.date)} · ${b.status}${b.companyAcct ? ' – check the company account' : ''}`} right={<><b>{usd(b.out)}</b>{ageBadge(b)}</>} onClick={() => nav.go('bill', { id: b.no })} />)}</div> : <Empty icon="check" title="No unpaid bills" />}
      </> : null}
      {tab === 'set' ? <Card>
        <Num label="Licences expiring within (days)" value={String(prefs.insAhead)} onChange={v => setPref('insAhead', Math.max(1, num(v) || 60))} />
        <Num label="…and expired within the last (days)" value={String(prefs.insBack)} onChange={v => setPref('insBack', Math.max(0, num(v)))} />
        <div className="small muted">Same as the blue numbers on the Insights sheet. A licence is “renewed” when the same company holds a later licence of the same type.</div>
      </Card> : null}
      {pdf ? <OfficialPdf kind="insights" title="Insights – official PDF" onClose={() => setPdf(false)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ monthly report */
export function Monthly() {
  const { T, session } = useApp(), nav = useNav();
  const now = today();
  const months = Array.from({ length: 24 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { value: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; });
  const [m, setM] = useState(months[0].value);
  const [y, mo] = m.split('-').map(Number);
  const R = useMemo(() => monthlyReport(T, y, mo), [T, y, mo]);
  const [busy, run] = useBusy();
  const [pdf, setPdf] = useState(false);
  return (
    <Screen title="Monthly report" sub={R.label} right={<IconBtn n="print" label="Official PDF" onClick={() => setPdf(true)} />}>
      <Select label="Report month" value={m} onChange={setM} options={months} placeholder="Choose a month" />
      <Card title="1. Summary" pad={false}><div className="bd"><table className="tbl"><thead><tr><th>Item</th><th className="n">{MON[mo]}</th><th className="n">Year to date</th></tr></thead>
        <tbody>{R.summary.map(s => <tr key={s[0]}><td>{s[0]}</td><td className="n">{money(s[1], s[3])}</td><td className="n">{money(s[2], s[3])}</td></tr>)}</tbody></table>
        <div className="small mt"><b>Billed minus received to the end of {R.label}:</b> {usd(R.outstanding)}</div></div></Card>
      <Card title={`2. Licences & certificates issued (${R.licences.length})`} pad={false}>{R.licences.length ? R.licences.map(x => <Row key={x.id} icon="badge" t1={x.co} t2={`${x.id} · ${x.type || x.cat} · ${x.no}`} t3={`Issued ${fmtD(x.issued)} · expires ${fmtD(x.expiry)}`} onClick={() => nav.go('licence', { id: x.id })} />) : <div className="bd small muted">None this month.</div>}</Card>
      <Card title={`3. Chemical clearances (${new Set(R.clearances.map(c => c.no)).size} · ${money(R.clrKg / 1000, 3)} MT)`} pad={false}>{R.clearances.length ? R.clearances.map((c, i) => <Row key={i} icon="flask" t1={`${c.chem} · ${money(c.kg)} kg`} t2={`${c.no} · ${c.co}`} t3={fmtD(c.date)} onClick={() => nav.go('clearance', { id: c.no })} />) : <div className="bd small muted">None this month.</div>}</Card>
      <Card title={`4. Bills issued (${usd(R.billed)})`} pad={false}>{R.bills.length ? R.bills.map(b => <Row key={b.no} icon="receipt" t1={`${b.co} · ${usd(b.billed)}`} t2={`${b.no} · ${b.type || b.purpose.join(', ')}`} t3={fmtD(b.date)} onClick={() => nav.go('bill', { id: b.no })} />) : <div className="bd small muted">None this month.</div>}</Card>
      <Card title={`5. Payments received (${usd(R.received)})`} pad={false}>{R.payments.length ? R.payments.map(p => <Row key={p.id} icon="cash" t1={`${p.co} · ${usd(p.amt)}`} t2={`${p.id} · receipt ${p.rec || '–'} · ${p.bill || 'no bill'}`} t3={fmtD(p.date)} onClick={() => nav.go('payment', { id: p.id })} />) : <div className="bd small muted">None this month.</div>}</Card>
      <Card title={`6. Licences expiring in ${R.nextLabel}`} pad={false}>{R.expiringNext.length ? R.expiringNext.map(x => <Row key={x.id} icon="badge" iconTone="amber" t1={x.co} t2={`${x.id} · ${x.type || x.cat}`} t3={'Expires ' + fmtD(x.expiry)} onClick={() => nav.go('licence', { id: x.id })} />) : <div className="bd small muted">None.</div>}</Card>
      <Card title={`7. Bills unpaid > 30 days (${R.old30.length})`} pad={false}>{R.old30.length ? R.old30.map(b => <Row key={b.no} icon="receipt" iconTone="orange" t1={`${b.co} · ${usd(b.out)}`} t2={`${b.no} · ${b.type}`} right={ageBadge(b)} onClick={() => nav.go('bill', { id: b.no })} />) : <div className="bd small muted">None.</div>}</Card>
      <div className="btns"><Btn icon="pdf" disabled={busy} onClick={() => run(() => monthlyPdf(R, session?.user?.name))}>PDF on the phone</Btn><Btn kind="ghost" icon="print" onClick={() => setPdf(true)}>Official PDF</Btn></div>
      {pdf ? <OfficialPdf kind="monthly" extra={{ month: `${y}-${String(mo + 1).padStart(2, '0')}` }} title={'Monthly report ' + R.label} onClose={() => setPdf(false)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ annual report */
export function Annual() {
  const { T, D, Q, session } = useApp();
  const years = yearsIn(T);
  const [y, setY] = useState(String(years[0]));
  const [target, setTarget] = useState('');
  const F = useMemo(() => annualFigures(T, +y, D, Q), [T, y, D, Q]), Pv = useMemo(() => annualFigures(T, +y - 1, D, Q), [T, y, D, Q]);
  const [busy, run] = useBusy();
  const [pdf, setPdf] = useState(false);
  const ch = (a, b) => (b ? <Badge tone={a >= b ? 'green' : 'red'}>{a >= b ? '+' : ''}{Math.round(((a - b) / b) * 100)}%</Badge> : null);
  return (
    <Screen title={'Annual report ' + y} sub={+y === D.today.getFullYear() ? 'Year to date' : ''} right={<IconBtn n="print" label="Official PDF" onClick={() => setPdf(true)} />}>
      <div className="grid2"><Select label="Year" value={y} onChange={setY} options={years.map(String)} /><Num label="Revenue target (US$)" value={target} onChange={setTarget} /></div>
      <div className="kpis">
        <Kpi l="Received" v={usd0(F.paid)} s={<>{ch(F.paid, Pv.paid)} vs {+y - 1}</>} tone="green" />
        <Kpi l="Billed" v={usd0(F.billed)} s={<>{ch(F.billed, Pv.billed)} vs {+y - 1}</>} />
        <Kpi l="Collection rate" v={F.billed ? Math.round((F.paid / F.billed) * 100) + '%' : '–'} s={target ? `${Math.round((F.paid / num(target)) * 100)}% of target` : 'received ÷ billed'} tone="amber" />
        <Kpi l="Cleared" v={money(F.kg / 1000, 1) + ' MT'} s={`${F.clr} clearances · ${F.lic} licences`} />
      </div>
      <Card title="Month by month (US$)"><Bars labels={MON.map(m => m[0])} series={[{ name: 'Billed', values: F.months.map(m => m.billed), color: '#2F75B5' }, { name: 'Received', values: F.months.map(m => m.paid), color: '#70AD47' }]} /></Card>
      <Card title="Key figures" pad={false}><div className="bd"><table className="tbl"><thead><tr><th></th><th className="n">{y}</th><th className="n">{+y - 1}</th></tr></thead><tbody>
        {[['Licences & certificates issued', F.lic, Pv.lic, 0], ['Clearances (Clearance Nos.)', F.clr, Pv.clr, 0], ['Quantity cleared (MT)', F.kg / 1000, Pv.kg / 1000, 3], ['Bills issued', F.billsN, Pv.billsN, 0], ['Amount billed (US$)', F.billed, Pv.billed, 2], ['Amount received (US$)', F.paid, Pv.paid, 2]]
          .map(r => <tr key={r[0]}><td>{r[0]}</td><td className="n">{money(r[1], r[3])}</td><td className="n">{money(r[2], r[3])}</td></tr>)}</tbody></table>
        <div className="small mt"><b>Billed minus received to the end of {y}:</b> {usd(F.outstanding)}</div></div></Card>
      <Card title="Licences by category" pad={false}><div className="bd"><table className="tbl"><thead><tr><th>Category</th><th className="n">Issued</th><th className="n">Active</th><th className="n">Expired*</th></tr></thead><tbody>{Object.keys(F.cats).sort().map(k => <tr key={k}><td>{k}</td><td className="n">{F.cats[k][0]}</td><td className="n">{F.cats[k][1]}</td><td className="n">{F.cats[k][2]}</td></tr>)}</tbody></table><div className="tiny muted mt">* expired and not renewed</div></div></Card>
      <Card title="Top 10 importers (MT)"><HBars items={topN(F.byCo).map(x => ({ ...x, value: x.value / 1000 }))} fmt={v => money(v, 2)} /></Card>
      <Card title="Top 10 chemicals (MT)"><HBars items={topN(F.byChem).map(x => ({ ...x, value: x.value / 1000 }))} fmt={v => money(v, 2)} /></Card>
      <Card title="Revenue by bill type"><Donut items={topN(F.byType, 7)} center={usd0(F.billed)} sub="billed" fmt={v => usd0(v)} /></Card>
      <Card title="Compliance indicators"><KV items={[['Licences renewed on time', F.renewDue ? `${Math.round((F.renewOnTime / F.renewDue) * 100)}% (${F.renewOnTime} of ${F.renewDue})` : 'n/a'], ['Bills paid in full within 30 days', F.billsN ? `${Math.round((F.paid30 / F.billsN) * 100)}% (${F.paid30} of ${F.billsN})` : 'n/a'],
        ['Average days to full payment', F.avgDays === null ? 'n/a' : `${Math.round(F.avgDays)} days (${F.paidBills} bills)`], ['Chemicals cleared above quota', F.overQuota], ['Lines not on the CIL', F.notOn], ['Lines without a valid CIL', F.noLic], ['Open data issues', F.issuesOpen]]} /></Card>
      <div className="btns"><Btn icon="pdf" disabled={busy} onClick={() => run(() => annualPdf(F, Pv, D.today, num(target), session?.user?.name))}>PDF on the phone</Btn><Btn kind="ghost" icon="print" onClick={() => setPdf(true)}>Official PDF</Btn></div>
      {pdf ? <OfficialPdf kind="annual" extra={{ year: +y, target: target || undefined }} title={'Annual report ' + y} onClose={() => setPdf(false)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ analytics */
export function Analytics() {
  const { T, D } = useApp(), nav = useNav();
  const years = yearsIn(T);
  const [y, setY] = useState(years[0]);
  const C = useMemo(() => chartData(T, D, y), [T, D, y]);
  const lastM = y === today().getFullYear() ? today().getMonth() : 11;
  const cum = (xs) => xs.reduce((a, x, i) => [...a, i > lastM ? 0 : (a[i - 1] || 0) + x], []);
  const totB = C.billed.reduce((a, x) => a + x, 0), totP = C.paid.reduce((a, x) => a + x, 0);
  const statusCounts = (() => { const m = { Active: 0, Expired: 0, Pending: 0 }; T.licences.forEach(l => { const k = /^Active/.test(l.Status) ? 'Active' : /^Expired/.test(l.Status) ? 'Expired' : 'Pending'; m[k]++; }); return Object.entries(m).map(([name, value], i) => ({ name, value, color: ['#70AD47', '#C0392B', '#E0A800'][i] })); })();
  return (
    <Screen title="Analytics" sub={String(y)}>
      <Chips value={y} onChange={setY} options={years.map(v => ({ value: v, label: String(v) }))} />
      <div className="kpis"><Kpi l="Billed" v={usd0(totB)} /><Kpi l="Collected" v={usd0(totP)} s={totB ? Math.round((totP / totB) * 100) + '% of billed' : ''} tone="green" /></div>
      <Card title="Billed vs collected by month (US$)"><Bars labels={MON.map(m => m[0])} series={[{ name: 'Billed', values: C.billed, color: '#2F75B5' }, { name: 'Collected', values: C.paid, color: '#70AD47' }]} /></Card>
      <Card title="Cumulative (US$)"><Bars labels={MON.map(m => m[0])} series={[{ name: 'Billed', values: cum(C.billed), color: '#9BC2E6' }, { name: 'Collected', values: cum(C.paid), color: '#A9D18E' }]} /></Card>
      <Card title="Quantity cleared by month (MT)"><Bars labels={MON.map(m => m[0])} series={[{ name: 'MT', values: C.kgMonth, color: '#D97757' }]} /></Card>
      <Card title="Amount billed by bill type"><Donut items={C.byType} center={usd0(totB)} sub="billed" fmt={v => usd0(v)} /></Card>
      <Card title="Top 10 importers (MT)"><HBars items={C.byCo} fmt={v => money(v, 1)} onClick={x => { const c = T.companies.find(k => k['Company Name'] === x.name); if (c) nav.go('company', { id: c['Company ID'] }); }} /></Card>
      <Card title="Top 10 chemicals cleared (MT)"><HBars items={C.byCh} fmt={v => money(v, 1)} color="#C55A11" /></Card>
      <Card title="Licences issued by category"><HBars items={C.licByCat} fmt={v => String(v)} color="#2F75B5" /></Card>
      <Card title="Licence status today"><Donut items={statusCounts} center={T.licences.length} sub="licences" fmt={v => String(v)} /></Card>
      <Card title="Companies by sector"><HBars items={C.bySector} fmt={v => String(v)} color="#7030A0" /></Card>
    </Screen>
  );
}

/* ------------------------------------------------------------------ QR verification */
export function Verify() {
  const { server, T } = useApp(), nav = useNav();
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const [busy, run] = useBusy();
  const check = c => run(async () => { setRes(null); const r = await server('verify', c); setRes(r); });
  const scan = () => run(async () => { const c = await scanQR(); if (!c) return; setCode(c); const r = await server('verify', c); setRes(r); });
  const open = () => { if (!res?.id) return; nav.go(res.kind === 'clearance' ? 'clearance' : res.kind === 'bill' ? 'bill' : 'licence', { id: res.id }); };
  return (
    <Screen title="Check a document" sub="QR code on licences, clearance letters and bills">
      {res ? <div className={'verdict ' + (!res.genuine ? 'bad' : res.valid === false ? 'mid' : 'good')}>
        <Icon n={res.genuine ? 'shield' : 'warn'} s={36} />
        <h2>{res.genuine ? `Genuine – ${res.status}` : 'NOT RECOGNISED'}</h2>
        <div className="small">{res.genuine ? 'Issued from the CMU Database and checked against the live register.' : res.message}</div>
      </div> : null}
      {res?.genuine ? <Card title={res.id}>{res.lines.map((l, i) => <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>{l}</div>)}
        {T.licences.some(l => l['Record ID'] === res.id) || T.clearances.some(c => c['Clearance No.'] === res.id) || T.bills.some(b => b['Bill No.'] === res.id) ? <Btn block kind="line" className="mt" icon="eye" onClick={open}>Open the record</Btn> : null}</Card> : null}
      <Btn block kind="accent" icon="qr" disabled={busy} onClick={scan}>{busy ? 'Checking…' : 'Scan the QR code'}</Btn>
      <div className="sect">Or type the code</div>
      <Text value={code} onChange={setCode} placeholder="e.g. LIC-067-1A2B3C4D5E" hint="The code printed after “Code” under the QR, or the link from the QR." />
      <Btn block disabled={busy || !code.trim()} onClick={() => check(code.trim())}>Check</Btn>
      <div className="small muted mt">The check needs a signal: the code is verified by the database itself (a forged code cannot pass). Every check is written to the Activity Log.</div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ duplicate check + standardise names */
export function DupCheck() {
  const { T } = useApp(), nav = useNav();
  const [q, setQ] = useState('');
  const hits = useMemo(() => (trim(q).length >= 3 ? dupSimilar(T.companies, q, 10) : []), [q, T.companies]);
  const exact = T.companies.find(c => eqi(c['Company Name'], q));
  return (
    <Screen title="Duplicate company check" sub="Same check as Register Company">
      <Text value={q} onChange={setQ} placeholder="Type a company name as written on a document" autoFocus />
      {exact ? <Note kind="err">Exact match: <a onClick={() => nav.go('company', { id: exact['Company ID'] })}>{exact['Company ID']} {exact['Company Name']}</a></Note> : null}
      {hits.length ? <div className="list">{hits.map(s => <Row key={s.id} icon="building" t1={s.name} t2={s.id} right={<Badge tone={s.score >= 0.9 ? 'red' : 'amber'}>{Math.round(s.score * 100)}%</Badge>} onClick={() => nav.go('company', { id: s.id })} />)}</div>
        : trim(q).length >= 3 && !exact ? <Note kind="ok">No similar company is registered.</Note> : null}
      {trim(q).length >= 3 && !exact ? <Btn block kind="accent" icon="plus" onClick={() => nav.go('form', { type: 'company', op: 'create', prefill: { name: trim(q) } })}>Register “{trim(q)}”</Btn> : null}
      <div className="small muted mt">Ignores words like Inc, Ltd, Corporation, Liberia; compares letter pairs (catches typos such as “Bea Mountian Minning”) and the other names recorded for each company.</div>
    </Screen>
  );
}
export function StdNames() {
  const { T, L, canEdit, save, toast } = useApp(), nav = useNav();
  const [txt, setTxt] = useState('');
  const unmatched = useMemo(() => T.clearances.filter(c => !trim(c['Chemical (Standard)']) || /other \/ unspecified/i.test(c['Chemical (Standard)'])), [T.clearances]);
  const res = useMemo(() => txt.split('\n').map(trim).filter(Boolean).slice(0, 50).map(n => ({ name: n, s: stdChem(n, L.chemicals, 3) })), [txt, L.chemicals]);
  const fix = async (c, std) => {
    const lines = T.clearances.filter(x => x['Clearance No.'] === c['Clearance No.']);
    const h = lines[0];
    await save('clearance', 'update', c['Clearance No.'], { company: h['Company Name'], date: h['Clearance Date'], ref: h['Clearance Ref. No.'], bl: '', remarks: h['Remarks'], eta: h['ETA'],
      lines: lines.map(l => ({ id: l['Record ID'], rec: l['Chemical as Recorded'], std: l['Record ID'] === c['Record ID'] ? std : l['Chemical (Standard)'], qty: str(l['Qty as Recorded']), unit: l['Unit'], bl: l['B/L / Invoice / AWB No.'] })) });
    toast(`${c['Record ID']} → ${std}`, 'ok');
  };
  return (
    <Screen title="Standardise chemical names" sub="Free text → standard names">
      <Text area label="Chemical names (one per line)" value={txt} onChange={setTxt} placeholder={'Caustic soda flakes 99%\nNaCN briquettes\n…'} />
      {res.map(r => <Card key={r.name} title={r.name}>{r.s.length ? r.s.map(s => <div key={s.name} className="flex between small" style={{ padding: '3px 0' }}><span>{s.name}</span><Badge tone={s.score >= 0.75 ? 'green' : 'amber'}>{Math.round(s.score * 100)}%</Badge></div>) : <div className="small muted">No close standard name.</div>}</Card>)}
      <Sect>Clearance lines without a standard name ({unmatched.length})</Sect>
      {unmatched.slice(0, 60).map(c => { const s = stdChem(c['Chemical as Recorded'], L.chemicals, 2); return (
        <Card key={c['Record ID']} title={c['Chemical as Recorded']} more={c['Clearance No.']} onMore={() => nav.go('clearance', { id: c['Clearance No.'] })}>
          <div className="small muted mb">{c['Record ID']} · {c['Company Name']}</div>
          <div className="btns">{s.map(x => <Btn key={x.name} sm kind={x.score >= 0.75 ? '' : 'ghost'} disabled={!canEdit} onClick={() => fix(c, x.name)}>{x.name} ({Math.round(x.score * 100)}%)</Btn>)}{!s.length ? <span className="small muted">No suggestion – set it on the clearance.</span> : null}</div>
        </Card>); })}
    </Screen>
  );
}

/* ------------------------------------------------------------------ chemical hazards */
export function Hazards() {
  const { T, L, isAdmin } = useApp(), nav = useNav();
  const [q, setQ] = useState(''), [f, setF] = useState('all');
  const rows = (T.hazards || []).filter(r => (!q || (r.name + ' ' + r.cas + ' ' + r.cat).toLowerCase().includes(q.toLowerCase())) && (f === 'all' || (f === 'missing' && (trim(r.hmis) === '' || !r.cat)) || (f === 'done' && trim(r.hmis) !== '' && r.cat)));
  return (
    <Screen title="Chemical hazards" sub="HMIS ratings & fee categories">
      <Note kind="warn">HMIS ratings come from each chemical’s Safety Data Sheet – never guessed. {isAdmin ? 'Tap a chemical to edit it.' : 'Admins can edit them.'}</Note>
      <div className="search"><Icon n="search" s={18} /><input placeholder="Search chemicals…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', n: (T.hazards || []).length }, { value: 'missing', label: 'Missing rating / category', n: (T.hazards || []).filter(r => trim(r.hmis) === '' || !r.cat).length }, { value: 'done', label: 'Complete' }]} />
      <div className="list">{rows.map(r => <Row key={r.name} icon="warn" iconTone={trim(r.hmis) === '' ? '' : num(r.hmis) >= 3 ? 'red' : num(r.hmis) >= 2 ? 'amber' : 'ok'} t1={r.name} t2={[r.cas, r.cat].filter(Boolean).join(' · ') || 'no fee category'} t3={r.notes}
        right={trim(r.hmis) !== '' ? <Badge tone={num(r.hmis) >= 3 ? 'red' : num(r.hmis) >= 2 ? 'amber' : 'green'}>HMIS {r.hmis}</Badge> : <Badge>–</Badge>} pending={r._pending} onClick={isAdmin ? () => nav.go('form', { type: 'hazard', op: 'update', id: r.name }) : undefined} />)}</div>
      {!rows.length ? <Empty icon="warn" title="No chemicals" /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ amount in words + unit converter */
export function Words() {
  const [amt, setAmt] = useState('');
  const [q, setQ] = useState(''), [u, setU] = useState('kg');
  const kg = quoKg(q, u);
  return (
    <Screen title="Amount in words & units">
      <Card title="Amount in words (for bill letters)"><Num label="Amount (US$)" value={amt} onChange={setAmt} />
        {num(amt) > 0 ? <><div className="b">{amountInWords(amt)} UNITED STATES DOLLARS</div><div className="small muted mt">({usd(amt)})</div><Btn sm kind="ghost" className="mt" icon="copy" onClick={() => navigator.clipboard?.writeText(`${amountInWords(amt)} UNITED STATES DOLLARS (${usd(amt)})`)}>Copy</Btn></> : null}</Card>
      <Card title="Quantity converter"><div className="grid2"><Num label="Quantity" value={q} onChange={setQ} /><Select label="Unit" value={u} onChange={setU} options={['kg', 'MT', 'g', 'L']} /></div>
        {kg !== null ? <KV items={[['Kilograms', money(kg, 3) + ' kg'], ['Metric tons', money(kg / 1000, 4) + ' MT'], ['Fee basis', 'Explosives & Sodium Cyanide per MT; all other categories per kg (1 L counted as 1 kg)']]} /> : <div className="small muted">Type a quantity.</div>}</Card>
    </Screen>
  );
}

/* ------------------------------------------------------------------ data health check */
export function DataCheck() {
  const { T } = useApp(), nav = useNav();
  const items = useMemo(() => dataCheck(T), [T]);
  const [f, setF] = useState(0);
  const [busy, run] = useBusy();
  const open = i => { const id = String(i.id).split(',')[0].trim(); const k = /^LIC/.test(id) ? 'licence' : /^CL[NR]/.test(id) ? (/^CLR/.test(id) ? null : 'clearance') : /^BN/.test(id) ? 'bill' : /^PAY/.test(id) ? 'payment' : /^CMU/.test(id) ? 'company' : null;
    if (/^CLR/.test(id)) { const c = T.clearances.find(x => x['Record ID'] === id); if (c) nav.go('clearance', { id: c['Clearance No.'] }); } else if (k) nav.go(k, { id }); };
  const shown = items.filter(i => !f || i.sev === f);
  return (
    <Screen title="Data health check" sub={`${items.length} item(s) found`} right={<IconBtn n="pdf" label="PDF" onClick={() => run(() => dataCheckPdf(items))} />}>
      <Chips value={f} onChange={setF} options={[{ value: 0, label: 'All', n: items.length }, { value: 1, label: 'High', n: items.filter(i => i.sev === 1).length }, { value: 2, label: 'Medium', n: items.filter(i => i.sev === 2).length }, { value: 3, label: 'Low', n: items.filter(i => i.sev === 3).length }]} />
      {shown.length ? <div className="list">{shown.slice(0, 200).map((i, k) => <Row key={k} icon={i.sev === 1 ? 'warn' : 'info'} iconTone={i.sev === 1 ? 'red' : i.sev === 2 ? 'amber' : ''} t1={i.text} t2={`${i.sheet} · ${i.id}`} onClick={() => open(i)} />)}</div> : <Empty icon="check" title="No problems found" />}
      <div className="small muted mt">Checks duplicates, IDs used twice, missing companies, dates, units and references, licences that expire before they are issued, payments above the bill or not linked, receipt numbers recorded twice. For a deeper review ask Claude: “Do a data-quality check”.</div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ activity log */
export function Activity() {
  const { T, server, session } = useApp();
  const [rows, setRows] = useState(T.activity || []);
  const [q, setQ] = useState('');
  const [busy, run] = useBusy();
  const more = () => run(async () => { const r = await server('log', 1500); setRows(r.rows); });
  const shown = rows.filter(a => !q || Object.values(a).join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen title="Activity log" sub={`${rows.length} entries`} right={!session?.demo ? <IconBtn n="download" label="Load more" onClick={more} /> : null}>
      <div className="search"><Icon n="search" s={18} /><input placeholder="Search who, what, record…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="list">{shown.slice(0, 400).map((a, i) => <Row key={i} icon={/delet/i.test(a.action) ? 'trash' : /updat|chang/i.test(a.action) ? 'edit' : /pdf|print/i.test(a.action) ? 'pdf' : /sign|login/i.test(a.action) ? 'key' : 'check'} t1={`${a.action}${a.record ? ' · ' + a.record : ''}`} t2={[a.register, a.details].filter(Boolean).join(' – ')} t3={`${a.who} · ${fmtDT(a.when)}`} />)}</div>
      {busy ? <Loading /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ saved documents */
export function Documents() {
  const [docs, setDocs] = useState(null);
  const load = async () => setDocs(await db.docs.orderBy('created').reverse().toArray());
  useEffect(() => { load(); }, []);
  return (
    <Screen title="Saved documents" sub="Official PDFs made on this phone">
      {!docs ? <Loading /> : docs.length ? <div className="list">{docs.map(d => <Row key={d.id} icon="pdf" t1={d.name} t2={`${d.kind} · ${fmtDT(d.created)}`} onClick={() => saveAndShare(d.name, d.base64, 'application/pdf', { base64: true })}>
        <button className="ib" onClick={async e => { e.stopPropagation(); if (await confirm({ title: 'Remove from the phone?', message: d.name, ok: 'Remove', danger: true })) { await db.docs.delete(d.id); load(); } }}><Icon n="trash" s={18} /></button></Row>)}</div>
        : <Empty icon="file" title="No documents yet">Official letters and reports you make (Print ▸ Official PDF) are kept here, so you can share them again offline.</Empty>}
    </Screen>
  );
}

/* ------------------------------------------------------------------ contacts, reminders, email log */
export function Contacts() {
  const { T } = useApp(), nav = useNav();
  const [q, setQ] = useState(''), [f, setF] = useState('all');
  const byId = Object.fromEntries((T.contacts || []).map(c => [c['Company ID'], c]));
  const rows = T.companies.map(c => ({ c, k: byId[c['Company ID']] || {} })).filter(({ c, k }) => (!q || (c['Company Name'] + ' ' + (k['Contact Person'] || '') + ' ' + (k['Email (several: separate with ;)'] || '')).toLowerCase().includes(q.toLowerCase()))
    && (f === 'all' || (f === 'no' && !k['Email (several: separate with ;)']) || (f === 'yes' && k['Email (several: separate with ;)'])));
  return (
    <Screen title="Company contacts" sub="Emails & phones for reminders">
      <div className="search"><Icon n="search" s={18} /><input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', n: T.companies.length }, { value: 'no', label: 'No email', n: T.companies.filter(c => !byId[c['Company ID']]?.['Email (several: separate with ;)']).length }, { value: 'yes', label: 'With email' }]} />
      <div className="list">{rows.map(({ c, k }) => <Row key={c['Company ID']} icon="user" t1={c['Company Name']} t2={[k['Contact Person'], k['Email (several: separate with ;)'], k['Phone']].filter(Boolean).join(' · ') || 'no contact yet'}
        right={/^no$/i.test(k['Send reminders?']) ? <Badge>no reminders</Badge> : ''} pending={k._pending} onClick={() => nav.go('form', { type: 'contact', op: 'update', id: c['Company ID'] })} />)}</div>
    </Screen>
  );
}
export function Reminders() {
  const { S, server, isAdmin, toast, session } = useApp();
  const [plan, setPlan] = useState(null);
  const [busy, run] = useBusy();
  const R = S.reminders || {};
  const load = () => run(async () => setPlan(await server('admin', { op: 'remPreview' })));
  useEffect(() => { if (!session?.demo) load(); }, []);   // eslint-disable-line
  const send = async () => { if (!(await confirm({ title: 'Send reminders now?', message: `${plan.plan.length} email(s) go out from the database owner's Gmail.`, ok: 'Send' }))) return; run(async () => { const r = await server('admin', { op: 'remSend' }); toast(r.message, 'ok', 5000); load(); }); };
  return (
    <Screen title="Email reminders" sub={R.on ? 'Weekly reminders ON (Mondays)' : 'Weekly reminders OFF'}>
      <Note>Every Monday (when ON), companies with a licence expiring within {R.licDays || 30} days or a bill unpaid for more than {R.billDays || 30} days get a polite email. {R.last ? 'Last run: ' + R.last : ''}</Note>
      {session?.demo ? <Note kind="warn">Not available with sample data.</Note> : null}
      {busy && !plan ? <Loading text="Working out who would get a reminder…" /> : null}
      {plan ? <>
        <Sect>Would be emailed now ({plan.plan.length})</Sect>
        <div className="list">{plan.plan.map(g => <Row key={g.coId || g.co} icon="mail" t1={g.co} t2={g.to} t3={`${g.lic.length} licence(s) · ${g.bills.length} bill(s)${g.bills.length ? ' · ' + usd(g.bills.reduce((a, b) => a + b.out, 0)) : ''}`} />)}{!plan.plan.length ? <div className="empty small">Nobody right now.</div> : null}</div>
        {plan.missing.length ? <><Sect>Need a reminder but no email on file ({plan.missing.length})</Sect><div className="list">{plan.missing.map(g => <Row key={g.coId || g.co} icon="user" iconTone="amber" t1={g.co} t2={`${g.lic.length} licence(s) · ${g.bills.length} bill(s)`} />)}</div></> : null}
        {isAdmin && plan.plan.length ? <Btn block kind="accent" icon="send" disabled={busy} onClick={send}>Send these {plan.plan.length} email(s) now</Btn> : null}
        {isAdmin ? <div className="btns mt"><Btn kind="ghost" onClick={() => run(async () => { const r = await server('admin', { op: R.on ? 'remOff' : 'remOn' }); toast(r.message, 'ok'); })}>{R.on ? 'Switch weekly reminders OFF' : 'Switch weekly reminders ON'}</Btn></div> : <div className="small muted mt">Only an admin can send or switch reminders.</div>}
      </> : null}
    </Screen>
  );
}
export function Emails() {
  const { T } = useApp();
  const [q, setQ] = useState('');
  const rows = (T.emails || []).filter(e => !q || Object.values(e).join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen title="Email log" sub="Emails with companies (from Gmail)">
      <div className="search"><Icon n="search" s={18} /><input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} /></div>
      {rows.length ? <div className="list">{rows.map((e, i) => <Row key={i} icon="mail" iconTone={e.dir === 'Received' ? '' : 'ok'} t1={e.subject || '(no subject)'} t2={`${e.co} · ${e.dir}`} t3={`${fmtD(e.date)} · ${e.snippet}`} />)}</div>
        : <Empty icon="mail" title="No emails logged">An admin can switch on the Gmail email log in Admin tools.</Empty>}
    </Screen>
  );
}

/* ------------------------------------------------------------------ fee schedule (read-only copy of the Fee Schedule sheet) */
export function FeeSchedule() {
  const { L } = useApp();
  const groups = [...new Set(L.services.map(s => s.group))];
  return (
    <Screen title="Fee schedule" sub="Services, suggested fees and bill types">
      {groups.map(g => <Card key={g} title={g} pad={false}>{L.services.filter(s => s.group === g).map(s => <Row key={s.service} icon="receipt" t1={s.service} t2={s.notes} right={s.fee !== null && s.fee !== undefined ? <b>{usd(s.fee)}</b> : <span className="small muted">case by case</span>} />)}</Card>)}
      <Sect>Bill types (letter wording)</Sect>
      <div className="list">{L.billTypes.map(b => <Row key={b.type} icon="file" t1={b.type} t2={`${b.group} services${b.feeTable ? ' · fee table on the letter' : ''}`} />)}</div>
      <div className="small muted mt">The fee schedule and letter wording are kept on the sheet “Fee Schedule” (desktop, admins).</div>
    </Screen>
  );
}
