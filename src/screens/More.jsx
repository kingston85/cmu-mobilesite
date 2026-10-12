import { useEffect, useState } from 'react';
import { Header, Card, Row, Empty, Field, Select, Actions, Pill, Seg } from './ui';
import { db, wipe } from '../lib/store';
import { admin, connect } from '../lib/api';
import { saveSession } from '../lib/device';
import { fmtWhen, money } from '../lib/util';
import { OutPill, outboxTitle, KINDS, rowsOf } from './Records';
import { FORM_LABEL } from './Forms';

export const APP_VERSION = '2.0.0';

/* ---------------- sync */
export function SyncScreen({ outbox, pending, online, sy, runSync, reload, flash, go }) {
  const act = async (o, how) => {
    if (how === 'discard') { if (!confirm('Delete this from the phone? It has not been saved in the database.')) return; await db.outbox.delete(o.cid); await db.photos.where('inspectionCid').equals(o.cid).delete(); }
    else await db.outbox.update(o.cid, { status: 'queued', force: how === 'force' });
    await reload(); if (how !== 'discard') runSync(true); else flash('Deleted');
  };
  const waiting = outbox.filter(o => o.status !== 'ok'), sent = outbox.filter(o => o.status === 'ok');
  return (<>
    <Header title="Sync" sub="Phone ⇄ CMU Database (Google Sheet)" back={() => go(-1)} />
    <Card>
      <div className="kv"><span>Network</span><b>{online ? 'Online' : 'Offline'}</b></div>
      <div className="kv"><span>Waiting to upload</span><b>{pending}</b></div>
      <div className="kv"><span>Registers downloaded</span><b>{fmtWhen(sy.last)}</b></div>
      {sy.msg && !sy.busy && !sy.error && <p className="ok">{sy.msg}</p>}
      {sy.error && <p className="err">{sy.error}</p>}
      <button className="primary wide" disabled={sy.busy || !online} onClick={() => runSync()}>{sy.busy ? sy.msg : 'Sync now'}</button>
    </Card>
    {waiting.length > 0 && <h2 className="sect">Made on this phone</h2>}
    {waiting.map(o => (
      <Card key={o.cid} tone={o.status === 'confirm' ? 'warn' : o.status === 'error' ? 'bad' : ''}>
        <div className="linehead"><b>{FORM_LABEL[o.type] || o.type}{o.data.id && o.type !== 'delete' ? ' (edit)' : ''}</b><OutPill o={o} /></div>
        <p className="small">{outboxTitle(o)}</p>
        <p className="muted small">Made {fmtWhen(o.created)}</p>
        {o.status === 'confirm' && <><ul className="warns">{(o.warnings || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
          <div className="quick"><button className="primary" onClick={() => act(o, 'force')}>Save anyway</button><button className="danger" onClick={() => act(o, 'discard')}>Delete</button></div></>}
        {o.status === 'error' && <><p className="err">{o.error}</p><div className="quick"><button onClick={() => act(o, 'retry')}>Try again</button><button className="danger" onClick={() => act(o, 'discard')}>Delete</button></div></>}
      </Card>
    ))}
    {sent.length > 0 && <Card title={`Uploaded recently (${sent.length})`}>{sent.slice(0, 40).map(o => <div className="kv" key={o.cid}><span>{FORM_LABEL[o.type]} · {outboxTitle(o)}</span><b>{o.resultId}</b></div>)}</Card>}
    {!outbox.length && <Empty>Nothing made on this phone yet.</Empty>}
  </>);
}

/* ---------------- more */
export function More({ session, setSession, snap, go, pending, signOut, flash, reload, isAdmin }) {
  const [pin, setPin] = useState('');
  const [name, setName] = useState(session.user.name);
  const unlock = async () => {
    try { await admin({ ...session, pin }, 'unlock', { pin }); const s = { ...session, pin }; await saveSession(s); setSession(s); setPin(''); flash('Admin PIN accepted – editing and admin settings are open on this phone'); }
    catch (e) { flash(e.message); }
  };
  const lock = async () => { const s = { ...session, pin: '' }; await saveSession(s); setSession(s); flash('Admin PIN removed from this phone'); };
  const rename = async () => { const s = { ...session, user: { ...session.user, name: name.trim() || session.user.name } }; await saveSession(s); setSession(s); flash('Name saved'); };
  const out = async () => { if (session.demo) { await wipe(); await reload(); return signOut(); } if (pending && !confirm(`${pending} record(s) have not been uploaded yet. Disconnect anyway? They stay on this phone.`)) return; signOut(); };
  const erase = async () => { if (!confirm('Erase all CMU data on this phone? Records not yet uploaded will be lost.')) return; await wipe(); await reload(); flash('Phone data erased'); };
  const srv = snap.server || {};
  return (<>
    <Header title="More" sub={`${session.user.name}${isAdmin ? ' · admin' : ''}`} />
    <h2 className="sect">Work</h2>
    <Row icon="⟳" title="Sync" sub={pending ? `${pending} waiting to upload` : 'Everything uploaded'} onClick={() => go('sync')} />
    <Row icon="🖨️" title="Print" sub="CRL, CIL, EDL, clearance and bill letters" onClick={() => go('print')} />
    <Row icon="📊" title="Reports & tools" sub="Dashboard, insights, monthly / annual report, quotas" onClick={() => go('reports')} />
    <Row icon="🔎" title="Check a document" sub="Scan the QR code on a licence, letter or bill" onClick={() => go('verify')} />
    <Row icon="💲" title="Fee calculator" sub="Qp = R × Hi × Qi" onClick={() => go('fee')} />
    <Row icon="🏷️" title="Standardise chemical names" onClick={() => go('standardise')} />
    <Row icon="📇" title="Contacts & reminders" onClick={() => go('reminders')} />
    <Row icon="🕘" title="Activity log" sub="Who saved, changed or deleted" onClick={() => go('list', { kind: 'activity' })} />
    <h2 className="sect">Settings</h2>
    <Card>
      <Field label="Your name (shown on the Activity Log)"><div className="inrow"><input value={name} onChange={e => setName(e.target.value)} /><button onClick={rename}>Save</button></div></Field>
      <div className="kv"><span>Connected to</span><b className="pre small">{session.demo ? 'Sample data (practice)' : session.apiUrl.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '…/').slice(0, 42)}</b></div>
      <div className="kv"><span>Database version</span><b>{srv.version || '–'}</b></div>
      {!session.demo && <>
        <div className="kv"><span>Admin PIN</span><b>{srv.pinSet ? (isAdmin ? 'Entered on this phone' : 'Needed to edit / delete') : 'Not set – every phone can edit'}</b></div>
        {srv.pinSet && !session.pin && <Field label="Enter the Admin PIN"><div className="inrow"><input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} /><button onClick={unlock} disabled={!pin}>Unlock</button></div></Field>}
        {session.pin && <button className="wide" onClick={lock}>Remove the PIN from this phone</button>}
      </>}
    </Card>
    {!session.demo && <Row icon="🛠" title="Admin" sub="Claude, reminders, calendar, backups, Document Inbox, PIN" onClick={() => go('admin')} />}
    <Row icon="🩺" title="Check everything" sub="Database and phone status" onClick={() => go('doctor')} />
    <Row icon="❓" title="User manual" sub="How everything works" onClick={() => go('help')} />
    <button className="wide" onClick={out}>{session.demo ? 'Leave sample mode' : 'Disconnect'}</button>
    <button className="danger wide" onClick={erase}>Erase data on this phone</button>
    <p className="muted small center">CMU Database v{APP_VERSION} · EPA Liberia · ERRS · Chemical Management Unit</p>
  </>);
}

/* ---------------- admin (needs the PIN once one is set) */
export function Admin({ session, setSession, snap, go, flash, runSync, isAdmin, online }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState('');
  const [ai, setAi] = useState({ key: '', model: '', budget: '' });
  const [newPin, setNewPin] = useState('');
  const [notify, setNotify] = useState('');
  const [days, setDays] = useState({ a: snap.config.settings['Alert: days before expiry'] || 60, b: snap.config.settings['Alert: days after expiry'] || 30 });
  const load = async () => { try { const r = await admin(session, 'status'); setSt(r); setAi(a => ({ ...a, model: r.server.aiModel, budget: r.server.aiBudget || '' })); } catch (e) { flash(e.message); } };
  useEffect(() => { if (online) load(); }, []); // eslint-disable-line
  const run = async (label, op, extra) => { setBusy(label); try { const r = await admin(session, op, extra); flash(r.result || 'Done'); await load(); runSync(true); } catch (e) { flash(e.message); } setBusy(''); };
  if (!isAdmin) return (<><Header title="Admin" back={() => go(-1)} /><Card tone="warn"><p>The admin settings need the Admin PIN. Enter it in More ▸ Settings.</p></Card></>);
  const s = st ? st.server : snap.server || {};
  const tog = (f, label, sub) => <div className="kv"><span>{label}<small className="muted"><br />{sub}</small></span>
    <button className={s[f] ? 'primary' : ''} disabled={!!busy || !online} onClick={() => run(f, 'toggle', { feature: f, on: !s[f] })}>{busy === f ? '…' : s[f] ? 'ON' : 'OFF'}</button></div>;
  return (<>
    <Header title="Admin" sub={s.sheet || 'CMU database'} back={() => go(-1)} right={<button className="ghost small" onClick={load}>⟳</button>} />
    {!online && <p className="warnbox">Admin settings need a network connection.</p>}
    <Card title="✨ Claude (Anthropic API)">
      <div className="kv"><span>API key</span><b>{s.ai ? 'saved' : 'not set'}</b></div>
      <div className="kv"><span>Spent this month</span><b>US${(s.aiSpent || 0).toFixed(2)}{s.aiBudget ? ` of US$${s.aiBudget}` : ' (no cap)'}</b></div>
      <div className="form">
        <Field label={s.ai ? 'New API key (leave empty to keep)' : 'API key'} hint="console.anthropic.com ▸ API keys – it is stored in the database script, never on the phones"><input type="password" value={ai.key} onChange={e => setAi({ ...ai, key: e.target.value })} placeholder="sk-ant-…" autoCapitalize="off" /></Field>
        <Field label="Model"><Select value={ai.model} onChange={v => setAi({ ...ai, model: v })} options={(st ? st.models : [['auto', 'Auto']]).map(([v, l]) => ({ value: v, label: l }))} blank={null} /></Field>
        <Field label="Monthly budget (US$) – Claude stops when it is reached" hint="Empty = no cap"><input inputMode="decimal" value={ai.budget} onChange={e => setAi({ ...ai, budget: e.target.value })} /></Field>
        <button className="primary wide" disabled={!!busy || !online} onClick={() => run('ai', 'ai', ai).then(() => setAi(a => ({ ...a, key: '' })))}>{busy === 'ai' ? 'Checking the key…' : 'Save Claude settings'}</button>
      </div>
    </Card>
    <Card title="Automatic jobs (run by the database)">
      {tog('reminders', '📧 Weekly reminder e-mails', 'Mondays 8:00 – companies with an e-mail and licences to renew or bills unpaid > 30 days')}
      {tog('calendar', '📅 Calendar of licence expiries', 'Google Calendar "CMU licence expiries", with e-mail reminders 30 days before')}
      {tog('backup', '💾 Weekly backups', 'Fridays 18:00 – a copy of the sheet in Drive ▸ CMU Backups (last 12 kept)')}
      {tog('inbox', '📥 Document Inbox folder', 'Every 10 min: files dropped in Drive ▸ CMU Inbox are read by Claude')}
      <Actions>
        <button disabled={!!busy || !online} onClick={() => confirm('Send the reminder e-mails now?') && run('r1', 'run', { feature: 'reminders' })}>{busy === 'r1' ? '…' : 'Send reminders now'}</button>
        <button disabled={!!busy || !online} onClick={() => run('r2', 'run', { feature: 'backup' })}>{busy === 'r2' ? '…' : 'Back up now'}</button>
        <button disabled={!!busy || !online} onClick={() => run('r3', 'run', { feature: 'calendar' })}>{busy === 'r3' ? '…' : 'Update calendar'}</button>
        <button disabled={!!busy || !online} onClick={() => run('r4', 'run', { feature: 'inbox' })}>{busy === 'r4' ? '…' : 'Read inbox folder now'}</button>
        <button disabled={!!busy || !online} onClick={async () => {
          setBusy('chem');
          try { const d = await admin(session, 'chemSync', { apply: false }); setBusy('');
            if (!d.added.length) return flash('Every chemical in the database is already on the drop-down list.');
            if (!confirm(`${d.added.length} chemical name(s) used in the clearances and licences are not on the drop-down list:\n\n${d.added.slice(0, 40).join('\n')}${d.added.length > 40 ? '\n…' : ''}\n\nAdd them all?`)) return;
            await run('chem', 'chemSync', { apply: true });
          } catch (e) { flash(e.message); setBusy(''); }
        }}>{busy === 'chem' ? '…' : 'Add missing chemicals to the list'}</button>
      </Actions>
      <Field label="E-mail me when the inbox gets new documents"><div className="inrow"><input type="email" value={notify} onChange={e => setNotify(e.target.value)} placeholder="name@epa.gov.lr" /><button onClick={() => run('n', 'notify', { email: notify })}>Save</button></div></Field>
    </Card>
    <Card title="Alerts">
      <div className="two"><Field label="Days before expiry"><input inputMode="numeric" value={days.a} onChange={e => setDays({ ...days, a: e.target.value })} /></Field>
        <Field label="Days after expiry"><input inputMode="numeric" value={days.b} onChange={e => setDays({ ...days, b: e.target.value })} /></Field></div>
      <button className="wide" disabled={!!busy || !online} onClick={async () => { await run('d1', 'setting', { key: 'Alert: days before expiry', value: days.a }); await run('d2', 'setting', { key: 'Alert: days after expiry', value: days.b }); }}>Save alert window</button>
    </Card>
    <Card title="🔑 Admin PIN">
      <p className="small muted">{s.pinSet ? 'A PIN is set. Officers enter it in More ▸ Settings to edit / delete records.' : 'No PIN: every phone with the link can edit and delete records. Set one to protect them.'}</p>
      <Field label="New PIN (4–8 digits, empty = remove)"><div className="inrow"><input type="password" inputMode="numeric" value={newPin} onChange={e => setNewPin(e.target.value)} /><button disabled={!online} onClick={async () => {
        if (!newPin && !confirm('Remove the Admin PIN? Every phone will be able to edit and delete.')) return;
        await run('pin', 'setPin', { newPin }); const sess = { ...session, pin: newPin }; await saveSession(sess); setSession(sess); setNewPin('');
      }}>Save</button></div></Field>
    </Card>
  </>);
}

/* ---------------- check everything (system doctor) */
export function Doctor({ session, snap, outbox, sy, go, online }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (!session.demo && online) admin(session, 'status').then(setSt).catch(e => setErr(e.message)); }, []); // eslint-disable-line
  const t = snap.tables, H = snap.hazards;
  const checks = [
    ['Server reachable', session.demo ? 'sample mode' : st ? 'OK – v' + st.server.version : err || (online ? 'checking…' : 'offline'), !!st || session.demo],
    ['Registers downloaded', fmtWhen(sy.last), !!sy.last],
    ['Records waiting / with problems', `${outbox.filter(o => o.status === 'queued').length} / ${outbox.filter(o => o.status === 'confirm' || o.status === 'error').length}`, !outbox.some(o => o.status === 'error')],
    ['Chemical Hazards with HMIS + category', `${H.rows.filter(r => r.hmis !== '' && r.cat).length} of ${H.rows.length}`, H.rows.every(r => r.hmis !== '' && r.cat)],
    ['Licences with verification codes', `${Object.keys(snap.codes.licence || {}).length} of ${t.licences.length}`, Object.keys(snap.codes.licence || {}).length === t.licences.length],
    ['Companies with an e-mail (reminders)', `${t.companies.filter(c => c['Email']).length} of ${t.companies.length}`, true],
    ['Bills without a Bill Ref. No.', snap.insights.bills.filter(b => !b.ref).length, !snap.insights.bills.some(b => !b.ref)],
    ['Clearance lines without a standard name', t.clearances.filter(r => !r['Chemical (Standard)'] || /other/i.test(r['Chemical (Standard)'])).length, true],
    ['Claude set up', snap.server && snap.server.ai ? 'yes' : 'no', !!(snap.server && snap.server.ai)],
  ];
  return (<>
    <Header title="Check everything" back={() => go(-1)} />
    <Card>{checks.map(([k, v, ok]) => <div className="kv" key={k}><span>{k}</span><b>{v} {ok ? '✔' : '⚠'}</b></div>)}</Card>
    {st && <Card title="Sheets in the database">{Object.entries(st.counts).map(([k, v]) => <div className="kv" key={k}><span>{k}</span><b>{v}</b></div>)}</Card>}
    <Card title="On this phone">{Object.entries(KINDS).map(([k, K]) => <div className="kv" key={k}><span>{K.icon} {K.label}</span><b>{rowsOf(snap, k).length}</b></div>)}</Card>
  </>);
}

/* ---------------- user manual */
export function Help({ go }) {
  const S = [
    ['Getting started', 'Connect with the database link (Apps Script ▸ Deploy ▸ Web app ▸ /exec) and your name. The first sync downloads every register; after that the app works offline and uploads what you record when there is a signal (automatically, or Sync).'],
    ['Daily work', 'Tap ＋ (New) for a company, licence, clearance (up to 20 chemicals), bill (up to 10 services), payment, inspection, data issue or letter. The phone checks duplicates; the database checks again before saving (similar companies, import quotas, licence numbers used twice, payments above the balance, receipts used twice). When a check finds something you decide: Save anyway or Delete (Sync screen).'],
    ['Editing and deleting', 'Open any record ▸ Edit or Delete. When an Admin PIN is set, enter it once in More ▸ Settings. Every change is on the Activity Log with your name.'],
    ['Licences', 'A licence keeps its chemicals (CRL/CIL), vehicles (transport) and effluent details (EDL: receiving water, volume, discharge point, limits; retention pond: coordinates and sources). From a licence: Print, Create bill, Renew (copies it to next year).'],
    ['Printing', 'Print ▸ choose the document ▸ the record. Choose the signatory, letterhead (or pre-printed paper) and QR code. “Print / share PDF” opens Android’s share sheet: print, WhatsApp, e-mail, Drive. Every document carries a QR code; anyone who scans it sees the live status from the database.'],
    ['Checking a document', 'More ▸ Check a document ▸ scan the QR code (or type the code under it). Online the database confirms it is genuine and still valid; offline the code is compared with the copy on the phone.'],
    ['Bills and payments', 'The Bill Type decides the letter wording (Fee Schedule). A payment can be against a Bill No. or to the company account (applied to the oldest bills). Outstanding amounts, aging and the reminders follow from that.'],
    ['Reports', 'Reports ▸ Dashboard (charts), Insights & alerts, Monthly report, Annual report, Quota tracker, Company profile – all as PDF, computed on the phone from the last sync.'],
    ['Claude', 'Claude tab: ask in plain words (“which bills are unpaid over 90 days?”), or attach a PDF / photo. “Read a document” fills the right form from an invoice, B/L, licence application or receipt – you check and save. Nothing is ever saved by Claude itself. Costs are capped by the monthly budget set by the admin.'],
    ['Document Inbox', 'Documents read by Claude (from the phone or dropped in the Drive folder CMU Inbox) are listed with their status. Open one ▸ open the form ▸ Save – the row turns Approved; or Reject it.'],
    ['Reminders', 'Contacts & reminders lists companies with licences to renew or bills unpaid > 30 days, with e-mail / WhatsApp / call buttons. The database can also send weekly reminder e-mails (Admin).'],
    ['Admin', 'Claude API key, model and budget; weekly reminders; Google Calendar of expiries; weekly backups; the Document Inbox folder; alert window; Admin PIN. The same options are in the sheet menus CMU Database and Claude.'],
  ];
  return (<>
    <Header title="User manual" sub="CMU Database – Android app" back={() => go(-1)} />
    {S.map(([h, p]) => <Card key={h} title={h}><p className="small">{p}</p></Card>)}
  </>);
}
