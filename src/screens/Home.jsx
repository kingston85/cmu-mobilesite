// Home: the day's picture – KPIs, licences to renew, money to collect, quotas, charts, recent activity.
import { useMemo } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Card, Icon, IconBtn, Kpi, Row, Badge, Note, Sect } from '../components/ui';
import { Bars, HBars } from '../components/charts';
import { money, usd, usd0, fmtD, ago, MON, chartData, today, toDate, num } from '../lib/logic';

export function alertBadge(x) {
  if (x.days < 0) return <Badge tone="red">Expired {-x.days} d ago</Badge>;
  if (x.days === 0) return <Badge tone="red">Expires today</Badge>;
  if (x.days <= 30) return <Badge tone="orange">{x.days} days left</Badge>;
  return <Badge tone="amber">{x.days} days left</Badge>;
}
export function ageBadge(b) {
  if (b.age === null) return <Badge>no date</Badge>;
  return <Badge tone={b.age > 90 ? 'red' : b.age > 60 ? 'orange' : b.age > 30 ? 'amber' : ''}>{b.age} days</Badge>;
}

export default function Home() {
  const { T, D, Q, session, lastSync, pending, online, sync, syncState, S, canEdit } = useApp();
  const nav = useNav();
  const yr = today().getFullYear();
  const C = useMemo(() => chartData(T, D, yr), [T, D, yr]);
  const k = useMemo(() => {
    const active = D.licences.filter(x => x.expiry && x.days >= 0).length;
    const kgY = T.clearances.reduce((a, c) => { const d = toDate(c['Clearance Date']); return a + (d && d.getFullYear() === yr ? num(c['Qty (kg)']) : 0); }, 0);
    const paidY = C.paid.reduce((a, x) => a + x, 0), billedY = C.billed.reduce((a, x) => a + x, 0);
    return { active, kgY, paidY, billedY, out: D.unpaid.reduce((a, b) => a + b.out, 0), exp: D.alerts.filter(x => x.days < 0).length, soon: D.alerts.filter(x => x.days >= 0).length };
  }, [T, D, C, yr]);
  const quotaWarn = Q.rows.filter(x => x.active && (x.status === 'OVER QUOTA' || x.status.startsWith('Near')));
  const inboxOpen = (T.inbox || []).filter(x => ['To review', 'Needs attention', 'Not read'].includes(x.status));
  const name = (session?.user?.name || '').split(' ')[0];
  const debtors = useMemo(() => { const m = {}; D.unpaid.forEach(b => { m[b.co] = (m[b.co] || 0) + b.out; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => ({ name: n, value: v })); }, [D]);
  const problems = pending.filter(p => ['confirm', 'conflict', 'error'].includes(p.status));
  return (
    <>
      <Bar back={false} title="CMU Database" sub={`${name ? 'Hello, ' + name + ' · ' : ''}${session?.demo ? 'sample data' : 'synced ' + ago(lastSync)}`}
        right={<><IconBtn n="search" label="Search everything" onClick={() => nav.go('search')} /><IconBtn n="sync" label="Sync now" onClick={() => sync()} /></>} />
      <main className="main">
        <div className="hero">
          <div className="kpis" style={{ marginBottom: 0 }}>
            <Kpi l="Licences to renew" v={k.exp + k.soon} s={`${k.exp} expired · ${k.soon} within ${D.ahead} d`} tone={k.exp ? 'red' : k.soon ? 'amber' : 'green'} onClick={() => nav.go('insights')} />
            <Kpi l="Outstanding" v={usd0(k.out)} s={`${D.unpaid.length} unpaid bill(s)`} tone={k.out ? 'orange' : 'green'} onClick={() => nav.go('insights', { tab: 'bills' })} />
            <Kpi l={'Collected ' + yr} v={usd0(k.paidY)} s={`of ${usd0(k.billedY)} billed`} tone="green" onClick={() => nav.go('analytics')} />
            <Kpi l={'Cleared ' + yr} v={money(k.kgY / 1000, 1) + ' MT'} s={`${T.companies.length} companies · ${k.active} active licences`} onClick={() => nav.go('registers', { reg: 'clearances' })} />
          </div>
        </div>
        <div className="wrap">
          {session?.demo ? <Note icon="sparkle">You are using <b>sample data</b> (made up, stays on this phone). Connect to your CMU Database under More ▸ Connection.</Note> : null}
          {!online && !session?.demo ? <Note kind="warn" icon="cloudOff">Offline – you can keep working. {pending.length ? pending.length + ' record(s) will upload' : 'Records will upload'} when the signal returns.</Note> : null}
          {syncState.error && online && !session?.demo ? <Note kind="err">Last sync failed: {syncState.error}</Note> : null}
          {problems.length ? <button className="note warn" style={{ width: '100%', border: 0, textAlign: 'left' }} onClick={() => nav.go('outbox')}><Icon n="warn" s={18} /><div className="grow"><b>{problems.length} record(s) need your attention</b> – a warning to confirm, a desktop change or an error. Tap to review.</div></button> : null}
          {pending.length && !problems.length ? <div className="statusline"><Icon n="upload" s={15} /> {pending.length} record(s) waiting to upload {online ? '…' : '(offline)'}</div> : null}

          <div className="actions" style={{ marginBottom: 14 }}>
            {[['flask', 'Clearance', () => nav.go('form', { type: 'clearance', op: 'create' }), ''], ['receipt', 'New bill', () => nav.go('billWizard'), 'o'],
              ['cash', 'Payment', () => nav.go('form', { type: 'payment', op: 'create' }), 'g'], ['qr', 'Check QR', () => nav.go('verify'), ''],
              ['calc', 'Fee calc', () => nav.go('fee'), 'a'], ['sparkle', 'Read doc', () => nav.go('assistant', { mode: 'doc' }), 'o'], ['pin', 'Inspection', () => nav.go('form', { type: 'inspection', op: 'create' }), 'g'], ['chart', 'Reports', () => nav.go('monthly'), '']]
              .map(([ic, l, fn, t]) => <button key={l} className={'act ' + t} onClick={fn} disabled={!canEdit && ['Clearance', 'New bill', 'Payment', 'Inspection'].includes(l)}><span className="ai"><Icon n={ic} s={21} /></span>{l}</button>)}
          </div>

          {inboxOpen.length ? <Card title={`Document Inbox · ${inboxOpen.length} to review`} more="Open" onMore={() => nav.go('inbox')} pad={false}>
            <div>{inboxOpen.slice(0, 3).map(x => <Row key={x.fid} icon="inbox" t1={x.summary || x.name} t2={[x.type, x.company].filter(Boolean).join(' · ')} right={<Badge tone={x.status === 'To review' ? 'blue' : 'amber'}>{x.status}</Badge>} onClick={() => nav.go('inbox', { fid: x.fid })} />)}</div>
          </Card> : null}

          <Card title="Licences to renew" more={D.alerts.length ? `All ${D.alerts.length}` : ''} onMore={() => nav.go('insights')} pad={false}>
            {D.alerts.length ? D.alerts.slice(0, 5).map(x => <Row key={x.id} icon="badge" iconTone={x.days < 0 ? 'red' : x.days <= 30 ? 'orange' : 'amber'} t1={x.co} t2={`${x.type || x.cat}${x.no ? ' · ' + x.no : ''}`} t3={'Expires ' + fmtD(x.expiry)} right={alertBadge(x)} onClick={() => nav.go('licence', { id: x.id })} />)
              : <div className="bd small muted">Nothing to renew in the next {D.ahead} days. ✔</div>}
          </Card>

          <Card title="Money to collect" more="Details" onMore={() => nav.go('insights', { tab: 'bills' })}>
            <div className="grid2" style={{ marginBottom: 10 }}>
              {D.aging.filter(a => a.bucket !== 'Date not recorded' || a.n).map(a => (
                <div key={a.bucket} style={{ background: a.bucket.startsWith('Over') ? 'var(--red-bg)' : a.bucket.startsWith('61') ? 'var(--orange-bg)' : a.bucket.startsWith('31') ? 'var(--amber-bg)' : 'var(--chip)', borderRadius: 12, padding: '8px 10px' }}>
                  <div className="tiny b muted">{a.bucket}</div><div className="b" style={{ fontSize: 17 }}>{usd0(a.amt)}</div><div className="tiny muted">{a.n} bill(s)</div>
                </div>))}
            </div>
            {debtors.length ? <><div className="small b muted mb">Largest balances</div><HBars items={debtors} fmt={v => usd0(v)} color="var(--accent)" /></> : <div className="small muted">No unpaid bills. ✔</div>}
          </Card>

          {quotaWarn.length ? <Card title="Import quotas" more="Tracker" onMore={() => nav.go('quota')} pad={false}>
            {quotaWarn.slice(0, 4).map((x, i) => <Row key={i} icon="scale" iconTone={x.status === 'OVER QUOTA' ? 'red' : 'amber'} t1={`${x.ch.name}`} t2={`${x.lic.co} · ${x.lic.id}`} right={<Badge tone={x.status === 'OVER QUOTA' ? 'red' : 'amber'}>{Math.round((x.pct || 0) * 100)}%</Badge>} onClick={() => nav.go('licence', { id: x.lic.id })} />)}
          </Card> : null}

          <Card title={`Billed vs collected ${yr} (US$)`} more="Analytics" onMore={() => nav.go('analytics')}>
            <Bars labels={MON.map(m => m[0])} series={[{ name: 'Billed', values: C.billed, color: '#2F75B5' }, { name: 'Collected', values: C.paid, color: '#70AD47' }]} />
          </Card>

          <Card title="Top chemicals cleared (MT)" more="More" onMore={() => nav.go('analytics')}>
            <HBars items={C.byCh.slice(0, 5)} fmt={v => money(v, 1)} />
          </Card>

          <Sect right={<button className="btn link sm" onClick={() => nav.go('activity')}>Activity log</button>}>Recent activity</Sect>
          <div className="list">
            {(T.activity || []).slice(0, 6).map((a, i) => <Row key={i} icon={/delet/i.test(a.action) ? 'trash' : /updat|chang/i.test(a.action) ? 'edit' : /pdf|print/i.test(a.action) ? 'pdf' : 'check'} t1={`${a.action}${a.record ? ' · ' + a.record : ''}`} t2={a.details || a.register} t3={`${a.who} · ${ago(a.when)}`} />)}
            {!(T.activity || []).length ? <div className="empty small">No activity yet.</div> : null}
          </div>
          <div className="small faint center" style={{ marginTop: 18 }}>{S.version ? `Database API ${S.version}` : ''}</div>
        </div>
      </main>
    </>
  );
}
