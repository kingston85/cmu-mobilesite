import { useMemo, useState } from 'react';
import { Header, Card, Row, Empty, Pill, Chips, Actions, Bars, Legend, HBars, Donut, Meter, Stat } from './ui';
import { dashboard, aging, reminderPlan } from '../lib/reports';
import { fmtD, money, money0, mtFmt, kgFmt, pct, thisYear, MON } from '../lib/util';
import { telLink, waLink, mailLink, openLink } from '../lib/device';
import { admin } from '../lib/api';

/* ---------------- dashboard: KPI cards, charts, year view */
export function Dashboard({ snap, go }) {
  const years = [...new Set(snap.tables.clearances.map(c => String(c['Clearance Date'] || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const [year, setYear] = useState(thisYear());
  const D = useMemo(() => dashboard(snap, year), [snap, year]);
  const [view, setView] = useState('mt');
  const labels = MON.map(m => m[0]);
  return (<>
    <Header title="Dashboard" sub={`CMU ${year} · all figures from the registers`} back={() => go(-1)} />
    {years.length > 1 && <Chips value={String(year)} onChange={y => setYear(Number(y))} options={[...new Set([String(thisYear()), ...years])].map(y => [y, y])} />}
    <div className="grid g4">
      <Stat value={D.companies} label="Companies" onClick={() => go('list', { kind: 'companies' })} />
      <Stat value={D.licNumbered} label="Licences / certs numbered" sub={`${D.licPending} pending`} onClick={() => go('list', { kind: 'licences' })} />
      <Stat value={D.clearances} label="Clearances" sub={mtFmt(D.totalMt) + ' MT'} onClick={() => go('list', { kind: 'clearances' })} />
      <Stat value={D.openIssues} label="Open data issues" tone={D.openIssues ? 'orange' : 'green'} onClick={() => go('list', { kind: 'issues', filter: 'open' })} />
      <Stat value={money0(D.billed)} label="US$ billed" onClick={() => go('list', { kind: 'bills' })} />
      <Stat value={money0(D.paid)} label="US$ paid" tone="green" onClick={() => go('list', { kind: 'payments' })} />
      <Stat value={money0(D.outstanding)} label={`US$ outstanding (${D.unpaid.length})`} tone="red" onClick={() => go('list', { kind: 'bills', filter: 'unpaid' })} />
      <Stat value={pct(D.billed ? D.paid / D.billed : null)} label="Paid ÷ billed" />
    </div>
    <Card title={`Monthly activity ${year}`}>
      <Chips value={view} onChange={setView} options={[['mt', 'Cleared MT'], ['clr', 'Clearances'], ['money', 'Billed vs paid'], ['lic', 'Licences']]} />
      {view === 'mt' && <Bars labels={labels} series={[{ values: D.months.map(m => m.mt), cls: 'b0' }]} />}
      {view === 'clr' && <Bars labels={labels} series={[{ values: D.months.map(m => m.clr), cls: 'b2' }]} />}
      {view === 'lic' && <Bars labels={labels} series={[{ values: D.months.map(m => m.lic), cls: 'b3' }]} />}
      {view === 'money' && <><Bars labels={labels} series={[{ values: D.months.map(m => m.billed), cls: 'b1' }, { values: D.months.map(m => m.paid), cls: 'b0' }]} /><Legend items={[['b1', 'Billed'], ['b0', 'Paid']]} /></>}
      {(D.nodate.clr + D.nodate.pays + D.nodate.lic) > 0 && <p className="muted small">Date not recorded: {D.nodate.clr} clearances ({mtFmt(D.nodate.mt)} MT), {D.nodate.pays} payments (US${money0(D.nodate.paid)}), {D.nodate.lic} licences.</p>}
    </Card>
    <Card title="Licences & certificates by category">
      {D.cats.map(c => <div key={c.cat} className="catrow" onClick={() => go('list', { kind: 'licences' })}>
        <div className="linehead"><b>{c.cat}</b><small>{c.total}</small></div>
        <span className="stack">{[['ok', c.active], ['bad', c.expired], ['info', c.noExpiry], ['warn', c.pending]].map(([k, v]) => v ? <i key={k} className={k} style={{ flex: v }} /> : null)}</span></div>)}
      <Legend items={[['ok', 'Active'], ['bad', 'Expired'], ['info', 'No expiry recorded'], ['warn', 'Pending – no licence no.']]} />
    </Card>
    <Card title="Bills – payment status">
      <Donut center={String(snap.insights.bills.length)} sub="bills" parts={[{ label: 'Paid', value: D.payStatus.Paid.n, cls: 'ok', text: `${D.payStatus.Paid.n} · US$${money0(D.payStatus.Paid.amt)}` },
        { label: 'Part paid', value: D.payStatus['Part paid'].n, cls: 'warn', text: `${D.payStatus['Part paid'].n} · US$${money0(D.payStatus['Part paid'].amt)}` }, { label: 'No payment', value: D.payStatus.Unpaid.n, cls: 'bad', text: `${D.payStatus.Unpaid.n} · US$${money0(D.payStatus.Unpaid.amt)}` }]} />
    </Card>
    <Card title="Clearances by chemical (top 12, MT)">
      <HBars rows={D.chems.slice(0, 12).map(c => ({ label: c.chem, value: c.kg / 1000 }))} fmt={v => mtFmt(v)} onRow={r => go('list', { kind: 'clearances' })} />
      <p className="muted small">{D.chems.length} standard chemical names · {kgFmt(D.totKg)} kg in total</p>
    </Card>
    <Card title="Outstanding bills">{D.unpaid.slice(0, 10).map(b => <button key={b.no} className="row" onClick={() => go('detail', { kind: 'bills', id: b.no })}>{b.co} · US${money(b.out)}<small>{b.no} · {b.status}{b.age !== null ? ` · ${b.age} days` : ''}</small></button>)}
      {!D.unpaid.length && <Empty>All bills paid.</Empty>}</Card>
    <Actions><button onClick={() => go('doc', { doc: 'YEAR' })}>📘 Annual report PDF</button><button onClick={() => go('doc', { doc: 'MONTH' })}>📅 Monthly report PDF</button></Actions>
  </>);
}

/* ---------------- insights: licences to renew, bills to collect */
export function Insights({ snap, go }) {
  const I = snap.insights, A = aging(I.bills);
  const [tab, setTab] = useState('lic');
  return (<>
    <Header title="Insights & alerts" sub={`Licences expiring within ${I.ahead || 60} days, or expired in the last ${I.after || 30}`} back={() => go(-1)} />
    <div className="grid g4">
      <Stat value={I.alerts.filter(a => a.days < 0).length} label="Expired, not renewed" tone="red" onClick={() => setTab('lic')} />
      <Stat value={I.alerts.filter(a => a.days >= 0 && a.days <= 30).length} label="Expire ≤ 30 days" tone="orange" onClick={() => setTab('lic')} />
      <Stat value={A.unpaid.filter(b => b.age > 30).length} label="Bills unpaid > 30 d" tone="red" onClick={() => setTab('bills')} />
      <Stat value={money0(A.total)} label="US$ outstanding" onClick={() => setTab('bills')} />
    </div>
    <Chips value={tab} onChange={setTab} options={[['lic', `Licences (${I.alerts.length})`], ['bills', `Unpaid bills (${A.unpaid.length})`]]} />
    {tab === 'lic' && (I.alerts.length ? I.alerts.map(a => <Row key={a.id} title={a.co} sub={`${a.type} · ${a.no || 'no number'} · ${fmtD(a.expiry)}`} badge={<Pill tone={a.days < 0 ? 'bad' : 'warn'}>{a.days < 0 ? `expired ${-a.days} d` : `${a.days} d left`}</Pill>} onClick={() => go('detail', { kind: 'licences', id: a.id })} />)
      : <Empty>No licence needs renewing in this window.</Empty>)}
    {tab === 'bills' && <><Card title="Aging (days since the bill date)">{A.rows.map(r => <div className="kv" key={r.label}><span>{r.label}</span><b>{r.n} · US${money(r.out)}</b></div>)}
      <div className="kv"><span><b>TOTAL</b></span><b>{A.unpaid.length} · US${money(A.total)}</b></div></Card>
      {A.unpaid.map(b => <Row key={b.no} title={`${b.no} · ${b.co}`} sub={`${b.type || b.purpose} · ${fmtD(b.date) || 'no date'}${b.age !== null ? ' · ' + b.age + ' d' : ''}`} right={'US$' + money(b.out)} badge={<Pill tone={b.paid > 0 ? 'warn' : 'bad'}>{b.paid > 0 ? 'Part' : 'Unpaid'}</Pill>} onClick={() => go('detail', { kind: 'bills', id: b.no })} />)}</>}
    <Actions><button className="primary" onClick={() => go('doc', { doc: 'INSIGHTS' })}>🖨 Insights PDF</button><button onClick={() => go('reminders')}>📇 Reminders</button></Actions>
  </>);
}

/* ---------------- import quotas */
export function Quotas({ snap, go, coId }) {
  const [f, setF] = useState('problems');
  const all = snap.insights.quotas.filter(q => !coId || q.coId === coId);
  const rows = all.filter(q => f === 'all' || (f === 'problems' ? q.status !== 'OK' && q.status !== 'No quantity on licence' : f === 'active' ? q.active : q.status === 'No quantity on licence'));
  const notOn = (snap.insights.notOn || []).filter(x => !coId || snap.tables.clearances.some(c => c['Record ID'] === x.id && c['Company ID'] === coId));
  return (<>
    <Header title="Import quotas" sub={coId ? snap.tables.companies.find(c => c['Company ID'] === coId)?.['Company Name'] : 'CIL licensed quantities vs clearances'} back={() => go(-1)} />
    <div className="grid g4">
      <Stat value={all.filter(q => q.status === 'OVER QUOTA').length} label="Over quota" tone="red" />
      <Stat value={all.filter(q => /Near/.test(q.status)).length} label="Near limit (80%+)" tone="orange" />
      <Stat value={notOn.length} label="Cleared, not on licence" tone="orange" />
      <Stat value={coId ? '–' : snap.insights.noLic || 0} label="Lines without a valid CIL" />
    </div>
    <Chips value={f} onChange={setF} options={[['problems', 'Over / near'], ['active', 'Active licences'], ['noqty', 'No quantity'], ['all', 'All']]} />
    {rows.map((q, i) => <Card key={i} tone={q.status === 'OVER QUOTA' ? 'bad' : /Near/.test(q.status) ? 'warn' : ''}>
      <div className="linehead"><b>{q.chem}</b><Pill tone={q.status === 'OVER QUOTA' ? 'bad' : /Near/.test(q.status) ? 'warn' : q.limit === null ? '' : 'ok'}>{q.status}</Pill></div>
      <small className="muted">{q.co} · <button className="link" onClick={() => go('detail', { kind: 'licences', id: q.lic })}>{q.lic}</button> {q.licNo}{q.active ? '' : ' · expired'}</small>
      {q.limit !== null && <><Meter pct={q.pct || 0} tone={q.pct > 1 ? 'bad' : q.pct >= 0.8 ? 'warn' : 'ok'} /><small>{kgFmt(q.used)} of {kgFmt(q.limit)} kg{q.perMonth ? ' per month (highest month)' : ''} · {pct(q.pct)}</small></>}
    </Card>)}
    {!rows.length && <Empty>Nothing in this view.</Empty>}
    {notOn.length > 0 && <Card title="Cleared but not on the company's licence" tone="warn">{notOn.map(x => <button key={x.id} className="row" onClick={() => go('detail', { kind: 'clearances', id: x.cln })}>{x.chem} · {kgFmt(x.kg)} kg<small>{x.cln} · {x.co} · {fmtD(x.date)} · licence {x.lic} {x.licNo}</small></button>)}</Card>}
    <Actions><button className="primary" onClick={() => go('doc', { doc: 'QUOTA' })}>🖨 Quota tracker PDF</button></Actions>
  </>);
}

/* ---------------- contacts & reminders */
export function Reminders({ snap, go, session, flash, isAdmin, online }) {
  const plan = useMemo(() => reminderPlan(snap), [snap]);
  const [busy, setBusy] = useState(false);
  const server = snap.server || {};
  const text = g => `Dear ${g.c['Contact Person'] || 'Sir/Madam'},\n\nThis is a reminder from the Chemical Management Unit (CMU) of the Environmental Protection Agency of Liberia concerning ${g.c['Company Name']}:\n\n` +
    (g.lic.length ? 'Licences / certificates to renew:\n' + g.lic.map(a => `• ${a.type}${a.no ? ' (' + a.no + ')' : ''} – ${a.days < 0 ? 'expired on' : 'expires on'} ${fmtD(a.expiry)}`).join('\n') + '\n\n' : '') +
    (g.bills.length ? 'Bills not yet paid:\n' + g.bills.map(b => `• ${b.no}${b.ref ? ' (' + b.ref + ')' : ''} of ${fmtD(b.date)} – US$${money(b.out)} outstanding`).join('\n') + '\n\n' : '') +
    'Please contact the ERRS Department / CMU of the EPA to regularise the above. If you have already done so, please disregard this message.\n\nEnvironmental Protection Agency of Liberia – ERRS / CMU';
  const sendAll = async () => {
    const n = plan.filter(g => g.email && g.on).length;
    if (!n) return flash('No company with an e-mail needs a reminder.');
    if (!confirm(`Send ${n} reminder e-mail(s) now from the CMU database account?`)) return;
    setBusy(true); try { const r = await admin(session, 'run', { feature: 'reminders' }); flash(r.result); } catch (e) { flash(e.message); } setBusy(false);
  };
  return (<>
    <Header title="Contacts & reminders" sub="Companies with licences to renew or bills unpaid > 30 days" back={() => go(-1)} />
    <Card tone="info"><p className="small">Weekly reminder e-mails from the database: <b>{server.reminders ? 'ON (Mondays 8:00)' : 'OFF'}</b>. {isAdmin ? 'Switch them in More ▸ Admin.' : 'An admin can switch them on.'}</p>
      {!session.demo && isAdmin && <button className="wide" disabled={busy || !online} onClick={sendAll}>{busy ? 'Sending…' : '📧 Send all e-mail reminders now'}</button>}</Card>
    {plan.map(g => <Card key={g.c['Company ID']} tone={g.bills.length ? 'bad' : 'warn'}>
      <div className="linehead"><button className="link left" onClick={() => go('detail', { kind: 'companies', id: g.c['Company ID'] })}><b>{g.c['Company Name']}</b></button>{g.owed > 0 && <Pill tone="bad">US${money0(g.owed)}</Pill>}</div>
      <small className="muted">{[g.lic.length && `${g.lic.length} licence(s) to renew`, g.bills.length && `${g.bills.length} bill(s) unpaid`, g.email || 'no e-mail', g.phone].filter(Boolean).join(' · ')}{!g.on && ' · reminders off'}</small>
      <Actions>
        {g.email && <button onClick={() => openLink(mailLink(g.email, `EPA Liberia – CMU reminder for ${g.c['Company Name']}`, text(g)))}>✉️ E-mail</button>}
        {g.phone && <button onClick={() => openLink(waLink(g.phone, text(g)))}>💬 WhatsApp</button>}
        {g.phone && <button onClick={() => openLink(telLink(g.phone))}>📞 Call</button>}
        {!g.email && !g.phone && <button onClick={() => go('detail', { kind: 'companies', id: g.c['Company ID'] })}>Add contact details</button>}
      </Actions>
    </Card>)}
    {!plan.length && <Empty>No company needs a reminder.</Empty>}
  </>);
}
