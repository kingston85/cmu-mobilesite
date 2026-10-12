import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { getMeta, getSnapshot, saveSnapshot, outboxAll, pendingCount, queue, EMPTY_SNAP } from './lib/store';
import { connect, sync, isOnline, checkItem } from './lib/api';
import { loadSession, saveSession, clearSession } from './lib/device';
import { fmtD, fmtWhen, money, money0, mtFmt, MON } from './lib/util';
import { dashboard } from './lib/reports';
import { Header, Card, Pill, Bars, Stat } from './screens/ui';
import { Records, List, Detail, Search, KINDS } from './screens/Records';
import { FORMS, FORM_LABEL } from './screens/Forms';
import { Verify, Fee, Standardise } from './screens/Tools';
import { PrintHub, PickRecord, DocView, ReportsHub, Profiles } from './screens/Docs';
import { Dashboard, Insights, Quotas, Reminders } from './screens/Reports';
import { ClaudeChat, ReadDoc } from './screens/Claude';
import { SyncScreen, More, Admin, Doctor, Help, APP_VERSION } from './screens/More';

export default function App() {
  const [session, setSession] = useState(undefined);
  const [snap, setSnap] = useState(EMPTY_SNAP);
  const [hasSnap, setHasSnap] = useState(false);
  const [outbox, setOutbox] = useState([]);
  const [pending, setPending] = useState(0);
  const [stack, setStack] = useState([{ screen: 'home' }]);
  const [online, setOnline] = useState(true);
  const [sy, setSy] = useState({ busy: false, msg: '', error: '', last: null });
  const [toast, setToast] = useState('');

  const view = stack.at(-1);
  const go = (screen, params = {}) => {
    if (screen === -1) return setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
    setStack(s => [...s, { screen, params }]); window.scrollTo(0, 0);
  };
  const back = () => go(-1);
  const tab = screen => { setStack([{ screen }]); window.scrollTo(0, 0); };
  const flash = m => { setToast(m); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 4000); };
  const isAdmin = !!session && (session.demo || !(snap.server && snap.server.pinSet) || !!session.pin);

  const reload = useCallback(async () => {
    const s = await getSnapshot();
    if (s) { setSnap(s); setHasSnap(true); } else { setSnap(EMPTY_SNAP); setHasSnap(false); }
    setOutbox(await outboxAll());
    setPending(await pendingCount());
    const last = await getMeta('lastSync');
    setSy(x => ({ ...x, last }));
  }, []);

  const signOut = useCallback(async msg => { await clearSession(); setSession(null); setStack([{ screen: 'home' }]); if (msg) flash(msg); }, []);

  const runSync = useCallback(async (quiet = false) => {
    if (!session) return;
    setSy(x => ({ ...x, busy: true, msg: 'Starting…', error: '' }));
    try {
      const r = await sync(session, msg => setSy(x => ({ ...x, msg })));
      const parts = [r.sent && `${r.sent} record(s) uploaded`, r.photos && `${r.photos} photo(s)`, r.confirm && `${r.confirm} need your OK`, r.errors && `${r.errors} with errors`].filter(Boolean);
      setSy(x => ({ ...x, busy: false, msg: parts.length ? parts.join(', ') : 'Registers up to date' }));
      if (r.confirm || r.errors) flash('Some records need attention – see Sync.');
      else if (!quiet) flash('Sync complete');
    } catch (e) {
      setSy(x => ({ ...x, busy: false, error: e.message }));
      if (!quiet) flash(e.message);
    }
    reload();
  }, [session, reload]);

  /** a form was filled: ask the server for warnings (when online), then keep it on the phone and upload */
  const submit = useCallback(async (type, data, photos = []) => {
    let force = false;
    if ((type === 'delete' || data.id) && !isAdmin) { alert('Editing and deleting need the Admin PIN. Enter it in More ▸ Settings.'); return false; }
    if (!session.demo && (await isOnline())) {
      try {
        const r = await checkItem(session, { type, data });
        if (r.warnings && r.warnings.length) {
          if (!confirm('Please check:\n\n• ' + r.warnings.join('\n• ') + '\n\nSave anyway?')) return false;
          force = true;
        }
      } catch (e) {
        if (e.server) { alert(e.message); return false; }      // the server said no (e.g. company not registered)
      }
    }
    await queue(type, data, photos, force);
    if (type === 'chemical') {      // show the new name in every drop-down straight away (the next sync brings the server's copy)
      const s = await getSnapshot();
      if (s) {
        const nm = String(data.name).trim(), have = (s.lists.chemicals || []).some(c => c.toLowerCase() === nm.toLowerCase());
        if (!have) s.lists.chemicals = [...(s.lists.chemicals || []), nm];
        const rows = s.hazards.rows || [], h = rows.find(r => r.name.toLowerCase() === nm.toLowerCase());
        const patch = { name: nm, cas: data.cas || '', hmis: data.hmis === '' || data.hmis == null ? '' : Number(data.hmis), cat: data.cat || '', notes: data.notes || '' };
        s.hazards.rows = h ? rows.map(r => (r === h ? { ...r, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== '')) } : r)) : [...rows, patch];
        await saveSnapshot(s);
      }
    }
    await reload();
    const what = type === 'delete' ? `Delete of ${data.id}` : (FORM_LABEL[type] || type) + (data.id ? ` ${data.id} (changes)` : '');
    if (session.demo) { flash(`${what} kept on the phone (sample mode – nothing is uploaded)`); return true; }
    const on = await isOnline();
    flash(`${what} saved on the phone${on ? ' – uploading…' : ' – it will upload when you have a signal'}`);
    if (on) runSync(true);
    return true;
  }, [session, reload, runSync, isAdmin]);

  useEffect(() => { loadSession().then(s => setSession(s || null)); }, []);
  useEffect(() => { if (session) { reload().then(() => runSync(true)); } }, [session && session.apiUrl, session && session.demo]); // eslint-disable-line

  const syncRef = useRef(runSync); syncRef.current = runSync;
  useEffect(() => {
    isOnline().then(setOnline);
    let h;
    Network.addListener('networkStatusChange', st => { setOnline(st.connected); if (st.connected) syncRef.current(true); }).then(x => (h = x)).catch(() => {});
    const t = setInterval(() => syncRef.current(true), 15 * 60 * 1000);      // keep the copy fresh while the app is open
    return () => { h?.remove(); clearInterval(t); };
  }, []);
  const stackRef = useRef(stack); stackRef.current = stack;
  useEffect(() => {
    let h;
    CapApp.addListener('backButton', () => { if (stackRef.current.length > 1) setStack(s => s.slice(0, -1)); else CapApp.exitApp(); }).then(x => (h = x)).catch(() => {});
    return () => h?.remove();
  }, []);

  if (session === undefined) return <div className="splash"><div className="logo">CMU</div></div>;
  if (!session) return <Login onDone={async s => { await saveSession(s); setSession(s); }} />;

  const ctx = { session, setSession, snap, outbox, pending, online, go, back, tab, flash, reload, runSync, sy, submit, isAdmin, signOut };
  const p = view.params || {};
  let body;
  if (!hasSnap && !['more', 'sync', 'help'].includes(view.screen)) body = <FirstSync {...ctx} />;
  else switch (view.screen) {
    case 'find': body = <Search {...ctx} />; break;
    case 'records': body = <Records {...ctx} />; break;
    case 'list': body = <List key={p.kind + (p.filter || '')} {...ctx} kind={p.kind} initialFilter={p.filter} />; break;
    case 'detail': body = <Detail key={p.kind + p.id} {...ctx} kind={p.kind} id={p.id} row={p.row} />; break;
    case 'form': { const F = FORMS[p.form]; body = <F key={JSON.stringify(p).slice(0, 200)} {...ctx} preset={p.preset || {}} />; break; }
    case 'new': body = <NewMenu {...ctx} />; break;
    case 'verify': body = <Verify {...ctx} />; break;
    case 'fee': body = <Fee key={JSON.stringify(p.lines || '')} {...ctx} lines={p.lines} clearance={p.clearance} />; break;
    case 'standardise': body = <Standardise {...ctx} />; break;
    case 'print': body = <PrintHub {...ctx} />; break;
    case 'pick': body = <PickRecord {...ctx} doc={p.doc} />; break;
    case 'doc': body = <DocView key={p.doc + p.id} {...ctx} doc={p.doc} id={p.id} />; break;
    case 'reports': body = <ReportsHub {...ctx} />; break;
    case 'dashboard': body = <Dashboard {...ctx} />; break;
    case 'insights': body = <Insights {...ctx} />; break;
    case 'quotas': body = <Quotas {...ctx} coId={p.coId} />; break;
    case 'profiles': body = <Profiles {...ctx} />; break;
    case 'reminders': body = <Reminders {...ctx} />; break;
    case 'claude': body = <ClaudeChat {...ctx} />; break;
    case 'read': body = <ReadDoc {...ctx} />; break;
    case 'sync': body = <SyncScreen {...ctx} />; break;
    case 'more': body = <More {...ctx} />; break;
    case 'admin': body = <Admin {...ctx} />; break;
    case 'doctor': body = <Doctor {...ctx} />; break;
    case 'help': body = <Help {...ctx} />; break;
    default: body = <Home {...ctx} />;
  }
  const root = stack[0].screen;
  return (
    <div className="app">
      {session.demo && <div className="banner demo">SAMPLE DATA – practice mode, nothing is saved to the CMU Database</div>}
      {!online && !session.demo && <div className="banner offline">Offline – using the copy from {fmtWhen(sy.last)}{pending ? ` · ${pending} waiting to upload` : ''}</div>}
      {online && sy.busy && <div className="banner busy">{sy.msg}</div>}
      <main>{body}</main>
      <nav className="tabs">
        {[['home', 'Home', '⌂'], ['records', 'Registers', '☰'], ['new', 'New', '＋'], ['claude', 'Claude', '✨'], ['more', 'More', '⋯']].map(([k, l, ic]) => (
          <button key={k} className={(root === k ? 'on' : '') + (k === 'new' ? ' newtab' : '')} onClick={() => tab(k)}><span className="ic">{ic}</span>{l}{k === 'more' && pending > 0 && <b className="badge">{pending}</b>}</button>
        ))}
      </nav>
      {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
    </div>
  );
}

/* ---------------- connect (no sign-in) */
function Login({ onDone }) {
  const [apiUrl, setApiUrl] = useState('');
  const [who, setWho] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr('');
    const url = apiUrl.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return setErr('Paste the CMU web app link – it starts with https://script.google.com/ and ends with /exec');
    if (!who.trim()) return setErr('Type your name – it is shown on the Activity Log.');
    setBusy(true);
    try { onDone(await connect(url, who.trim())); } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const demo = () => onDone({ apiUrl: '', demo: true, user: { name: who.trim() || 'Demo officer', email: 'demo', role: 'staff' } });
  return (
    <div className="login">
      <div className="brand"><div className="logo">CMU</div><h1>CMU Database</h1><p>Chemical Management Unit · EPA Liberia · ERRS</p></div>
      <form onSubmit={submit} className="card form">
        <label>CMU Database link<input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" /></label>
        <label>Your name<input value={who} onChange={e => setWho(e.target.value)} placeholder="Shown on the Activity Log" /></label>
        {err && <p className="err">{err}</p>}
        <button className="primary wide" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
        <p className="muted small">The link is the Web app URL of the CMU DATABASE sheet (Apps Script ▸ Deploy, with MobileAPI.gs installed).</p>
      </form>
      <button className="wide" onClick={demo}>▶ Try with sample data</button>
      <p className="muted small center">Practice mode with made-up companies. Nothing is sent anywhere.</p>
      <p className="muted small center">v{APP_VERSION}</p>
    </div>
  );
}

function FirstSync({ sy, runSync, online }) {
  return (<>
    <Header title="CMU Database" />
    <Card title="Download the registers">
      <p>The first time, the phone needs a signal to download the companies, licences, clearances, bills and payments. After that it works offline.</p>
      {sy.error && <p className="err">{sy.error}</p>}
      <button className="primary wide" disabled={sy.busy || !online} onClick={() => runSync()}>{sy.busy ? sy.msg : online ? 'Download now' : 'Waiting for a signal…'}</button>
    </Card>
  </>);
}

/* ---------------- home: the Main Menu */
function Home({ session, snap, outbox, pending, go, sy, runSync }) {
  const D = useMemo(() => dashboard(snap), [snap]);
  const ins = snap.insights;
  const attention = outbox.filter(o => o.status === 'confirm' || o.status === 'error');
  const over = ins.quotas.filter(q => q.status === 'OVER QUOTA' && q.active);
  const old = D.unpaid.filter(b => b.age > 30);
  const inbox = (snap.tables.inbox || []).filter(r => ['To review', 'Needs attention', 'Not read'].includes(r['Status'])).length;
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (<>
    <header className="top hero">
      <div className="grow"><h1>CMU Database</h1><p>{date} · {session.user.name}</p></div>
      <button className="ghost" onClick={() => go('find')} aria-label="Find">⌕</button>
      <button className="ghost" onClick={() => runSync()} disabled={sy.busy} aria-label="Sync">{sy.busy ? '…' : '⟳'}</button>
    </header>
    <button className="syncline" onClick={() => go('sync')}>
      <span className={`dot ${pending ? 'warn' : 'ok'}`} />{pending ? `${pending} waiting to upload` : 'Everything uploaded'} · updated {fmtWhen(sy.last)}
    </button>
    {attention.length > 0 && <Card tone="warn"><b>{attention.length} record(s) need your attention</b> <button className="link" onClick={() => go('sync')}>Open Sync</button></Card>}
    <div className="grid g4">
      <Stat value={D.expSoon.length} label="Licences expiring" sub={`next 30 days · ${D.expired.length} expired`} tone="orange" onClick={() => go('insights')} />
      <Stat value={money0(D.outstanding)} label="US$ unpaid bills" sub={`${D.unpaid.filter(b => b.paid === 0).length} with no payment`} tone="red" onClick={() => go('list', { kind: 'bills', filter: 'unpaid' })} />
      <Stat value={D.clrMonth.length} label="Clearances this month" sub={`${mtFmt(D.clrMonth.reduce((a, c) => a + c.kg, 0) / 1000)} MT cleared`} tone="green" onClick={() => go('list', { kind: 'clearances', filter: 'month' })} />
      <Stat value={D.openIssues} label="Open data issues" sub={`of ${D.issues} logged`} onClick={() => go('list', { kind: 'issues', filter: 'open' })} />
    </div>
    <h2 className="sect">Daily work</h2>
    <div className="tiles">
      <button className="tile accent" onClick={() => go('form', { form: 'bill' })}><i>🧾</i><b>New bill</b><small>Bill letter for a company</small></button>
      <button className="tile" onClick={() => go('form', { form: 'payment' })}><i>💵</i><b>Record payment</b><small>Receipt against a bill</small></button>
      <button className="tile" onClick={() => go('form', { form: 'clearance' })}><i>🧪</i><b>Clearance</b><small>Up to 20 chemicals</small></button>
      <button className="tile" onClick={() => go('form', { form: 'licence' })}><i>📜</i><b>Licence</b><small>CRL · CIL · EDL · permits</small></button>
      <button className="tile" onClick={() => go('form', { form: 'company' })}><i>🏢</i><b>Register company</b><small>Checks duplicates</small></button>
      <button className="tile" onClick={() => go('find')}><i>🔎</i><b>Find / print</b><small>Any record in any register</small></button>
    </div>
    <h2 className="sect">Field & documents</h2>
    <div className="tiles">
      <button className="tile accent2" onClick={() => go('read')}><i>📄</i><b>Read a document</b><small>Claude fills the form{inbox ? ` · ${inbox} in inbox` : ''}</small></button>
      <button className="tile" onClick={() => go('verify')}><i>🔎</i><b>Check a document</b><small>Scan the QR code</small></button>
      <button className="tile" onClick={() => go('form', { form: 'inspection' })}><i>🔍</i><b>Field inspection</b><small>GPS + photos</small></button>
      <button className="tile" onClick={() => go('print')}><i>🖨️</i><b>Print</b><small>CRL · CIL · EDL · letters</small></button>
      <button className="tile" onClick={() => go('fee')}><i>💲</i><b>Fee calculator</b><small>R × Hi × Qi</small></button>
      <button className="tile" onClick={() => go('quotas')}><i>⚖️</i><b>Import quotas</b><small>{over.length ? `${over.length} over quota` : 'Licensed quantities'}</small></button>
    </div>
    <h2 className="sect">Reports</h2>
    <Card title={`Cleared ${new Date().getFullYear()} (MT by month)`} right={<button className="link" onClick={() => go('dashboard')}>Dashboard</button>}>
      <Bars labels={MON.map(m => m[0])} series={[{ values: D.months.map(m => m.mt), cls: 'b0' }]} height={120} />
    </Card>
    <div className="tiles t3">
      <button className="tile" onClick={() => go('insights')}><i>🔔</i><b>Insights</b></button>
      <button className="tile" onClick={() => go('doc', { doc: 'MONTH' })}><i>📅</i><b>Monthly</b></button>
      <button className="tile" onClick={() => go('doc', { doc: 'YEAR' })}><i>📘</i><b>Annual</b></button>
      <button className="tile" onClick={() => go('profiles')}><i>🏷️</i><b>Company profile</b></button>
      <button className="tile" onClick={() => go('reminders')}><i>📇</i><b>Reminders</b></button>
      <button className="tile" onClick={() => go('claude')}><i>✨</i><b>Ask Claude</b></button>
    </div>
    {D.expired.length + D.expSoon.length > 0 && <Card title={`Licences to renew (${D.expSoon.length + D.expired.length})`} tone="warn">
      {[...D.expired, ...D.expSoon].slice(0, 6).map(a => <button key={a.id} className="row" onClick={() => go('detail', { kind: 'licences', id: a.id })}>
        {a.co} <Pill tone={a.days < 0 ? 'bad' : 'warn'}>{a.days < 0 ? `expired ${-a.days} d ago` : `${a.days} d left`}</Pill><small>{a.type} · {a.no} · {fmtD(a.expiry)}</small></button>)}
    </Card>}
    {old.length > 0 && <Card title={`Bills unpaid > 30 days (${old.length})`} tone="bad">
      {old.slice(0, 6).map(b => <button key={b.no} className="row" onClick={() => go('detail', { kind: 'bills', id: b.no })}>{b.co} · US${money(b.out)}<small>{b.no} · {b.age} days</small></button>)}
    </Card>}
  </>);
}

function NewMenu({ go }) {
  const items = [['bill', '🧾', 'Bill', 'Multi-service bill letter'], ['payment', '💵', 'Payment', 'Against a bill or the company account'], ['clearance', '🧪', 'Clearance', 'One clearance, up to 20 chemicals'],
    ['licence', '📜', 'Licence / certificate', 'With chemicals, vehicles, effluent'], ['company', '🏢', 'Company', 'Checks duplicates'], ['inspection', '🔍', 'Field inspection', 'GPS + photos'],
    ['issue', '📌', 'Data issue', 'Notes & Issues'], ['correspondence', '✉️', 'Letter / notice', 'Reminder, violation, shutdown']];
  return (<>
    <Header title="New record" sub="Saved on the phone, uploaded when there is a signal" />
    <button className="tile accent2 wide1" onClick={() => go('read')}><i>📄</i><b>Read a document into a form</b><small>Photo or PDF of an invoice, B/L, licence application, receipt – Claude fills the form</small></button>
    <div className="tiles">{items.map(([k, i, l, s]) => <button key={k} className="tile" onClick={() => go('form', { form: k })}><i>{i}</i><b>{l}</b><small>{s}</small></button>)}</div>
  </>);
}
