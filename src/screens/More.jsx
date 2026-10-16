// More: account & connection, uploads (outbox), settings, admin tools, officers, help.
import { useEffect, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Btn, Card, Icon, IconBtn, Text, Num, Select, Toggle, Seg, Chips, Note, Row, Badge, KV, Empty, Sect, Sheet, Loading, confirm, alertBox, prompt, useBusy } from '../components/ui';
import { ago, fmtDT, usd, money } from '../lib/logic';
import { TYPES } from '../lib/records';
import { notifyPermission, openUrl } from '../lib/device';
import { db } from '../lib/db';

const Screen = ({ title, sub, right, children }) => <><Bar title={title} sub={sub} right={right} /><main className="main noNav"><div className="wrap">{children}</div></main></>;

export function MoreHub() {
  const { session, role, pending, lastSync, sync, T, isAdmin, S, online } = useApp(), nav = useNav();
  const problems = pending.filter(p => ['confirm', 'conflict', 'error'].includes(p.status)).length;
  return (
    <>
      <Bar back={false} title="More" />
      <main className="main"><div className="wrap">
        <Card>
          <div className="flex" style={{ gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--navy)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700 }}>{(session?.user?.name || '?').slice(0, 1).toUpperCase()}</div>
            <div className="grow"><div className="b" style={{ fontSize: 17 }}>{session?.user?.name || 'Officer'}</div><div className="small muted">{session?.demo ? 'Sample data' : `${role}${session?.token ? ' · signed in' : ''} · ${online ? 'online' : 'offline'}`}</div><div className="tiny faint">Synced {ago(lastSync)}</div></div>
            <IconBtn n="sync" label="Sync now" onClick={() => sync()} />
          </div>
        </Card>
        <div className="list">
          <Row icon="upload" iconTone={problems ? 'amber' : ''} t1="Uploads" t2={pending.length ? `${pending.length} waiting${problems ? ` · ${problems} need attention` : ''}` : 'Everything is uploaded'} right={pending.length ? <Badge tone={problems ? 'amber' : 'accent'}>{pending.length}</Badge> : ''} onClick={() => nav.go('outbox')} />
          <Row icon="key" t1="Account & connection" t2={session?.demo ? 'Using sample data – connect your database' : session?.token ? 'Signed in with PIN' : 'Connected with the database link'} onClick={() => nav.go('account')} />
          <Row icon="gear" t1="Settings" t2="Theme, sync, reminders, app lock, printing" onClick={() => nav.go('settings')} />
          {isAdmin ? <Row icon="lock" t1="Admin tools" t2="Backups, reminders, calendar, email log, officers, Claude" onClick={() => nav.go('admin')} /> : null}
          <Row icon="file" t1="Saved documents" t2="Official PDFs on this phone" onClick={() => nav.go('documents')} />
          <Row icon="history" t1="Activity log" onClick={() => nav.go('activity')} />
          <Row icon="book" t1="Help & about" t2="What the app does, set-up, tips" onClick={() => nav.go('help')} />
        </div>
        <Sect>On this phone</Sect>
        <Card><KV items={[['Companies', T.companies.length], ['Licences', T.licences.length], ['Clearance lines', T.clearances.length], ['Bill lines', T.bills.length], ['Payments', T.payments.length], ['Inspections', (T.inspections || []).length], ['Database API', S.version || '–'], ['App', 'CMU Database 2.0']]} /></Card>
      </div></main>
    </>
  );
}

/* ------------------------------------------------------------------ account */
export function Account() {
  const { session, signIn, signOutAdmin, connect, disconnect, server, toast, startDemo, sync } = useApp(), nav = useNav();
  const [email, setEmail] = useState(''), [pin, setPin] = useState('');
  const [url, setUrl] = useState(session?.apiUrl || ''), [who, setWho] = useState(session?.user?.name || '');
  const [busy, run] = useBusy();
  const ping = () => run(async () => { const r = await server('ping'); alertBox({ title: 'Connected ✔', message: `Database API ${r.version}\nSigned in as ${r.user.name} (${r.user.role})\nServer time ${fmtDT(r.serverTime)}` }); });
  return (
    <Screen title="Account & connection">
      {session?.demo ? <Note icon="sparkle">You are using sample data. Connect to your CMU Database below – the sample data is then removed from the phone.</Note> : null}
      <Card title="Database connection">
        <Text label="Database link (/exec)" value={url} onChange={setUrl} placeholder="https://script.google.com/macros/s/…/exec" />
        <Text label="Your name" value={who} onChange={setWho} />
        <div className="btns">
          <Btn kind="accent" icon="link" disabled={busy || !url.trim() || !who.trim()} onClick={() => run(async () => { if (session?.demo) await disconnect(false); await connect(url.trim(), who.trim()); setTimeout(() => sync(), 200); nav.back(); }, 'Connected')}>{session?.apiUrl ? 'Reconnect' : 'Connect'}</Btn>
          {!session?.demo && session?.apiUrl ? <Btn kind="ghost" icon="check" disabled={busy} onClick={ping}>Test</Btn> : null}
        </div>
      </Card>
      {!session?.demo ? <Card title="Sign in with email + PIN">
        {session?.token ? <><Note kind="ok">Signed in as <b>{session.user.email}</b> ({session.user.role}).</Note><Btn kind="ghost" onClick={() => run(signOutAdmin, 'Signed out')}>Sign out</Btn></> : <>
          <div className="small muted mb">Needed for admin tools (and for everyone when sign-in is switched on in MobileAPI.gs). The PIN is on the hidden sheet “Mobile Users”.</div>
          <Text label="Email" type="email" value={email} onChange={setEmail} /><Text label="PIN" type="password" inputMode="numeric" value={pin} onChange={setPin} />
          <Btn kind="accent" icon="key" disabled={busy || !email || !pin} onClick={() => run(async () => { await signIn(email.trim(), pin.trim()); setTimeout(() => sync({ quiet: true }), 200); }, 'Signed in')}>Sign in</Btn></>}
      </Card> : null}
      <Card title="Leave">
        <div className="btns">
          {!session?.demo ? <Btn kind="ghost" onClick={async () => { if (await confirm({ title: 'Try the sample data?', message: 'The downloaded registers are replaced by made-up sample data on this phone. Records waiting to upload are lost.', ok: 'Use sample data', danger: true })) run(startDemo); }}>Use sample data</Btn> : null}
          <Btn kind="red" icon="close" onClick={async () => { if (await confirm({ title: 'Disconnect this phone?', message: 'The downloaded registers and any records waiting to upload are removed from this phone.', ok: 'Disconnect', danger: true })) run(() => disconnect(false)); }}>Disconnect</Btn>
        </div>
      </Card>
    </Screen>
  );
}

/* ------------------------------------------------------------------ outbox */
const ST = { queued: ['Waiting to upload', 'blue'], confirm: ['Needs your OK', 'amber'], conflict: ['Changed on the desktop', 'orange'], error: ['Problem', 'red'], ok: ['Uploaded', 'green'] };
function describe(it) {
  const d = it.data || {}, t = TYPES[it.type]?.label || it.type;
  const what = d.company || d.name || d.bill || d.site || d.issue || it.id || '';
  return `${it.op === 'create' ? 'New' : it.op === 'update' ? 'Change to' : 'Delete'} ${t.toLowerCase()}${it.id ? ' ' + it.id : it.tempId ? ' (' + it.tempId + ')' : ''}${what && what !== it.id ? ' – ' + String(what).slice(0, 60) : ''}`;
}
export function Outbox() {
  const { outbox, resolve, sync, online, syncState } = useApp(), nav = useNav();
  const [cur, setCur] = useState(null);
  const groups = ['confirm', 'conflict', 'error', 'queued', 'ok'].map(s => [s, outbox.filter(o => o.status === s).sort((a, b) => (b.sentAt || b.created).localeCompare(a.sentAt || a.created))]).filter(g => g[1].length);
  const it = outbox.find(o => o.cid === cur);
  const edit = it => { setCur(null); const view = it.op === 'create' ? it.tempId : it.id; nav.go('form', { type: it.type, op: 'update', id: view }); };
  return (
    <Screen title="Uploads" sub={online ? 'Records go to the database automatically' : 'Offline – they go when the signal returns'} right={<IconBtn n="sync" label="Upload now" onClick={() => sync()} />}>
      {syncState.busy ? <Note icon="sync">{syncState.msg}</Note> : null}
      {!groups.length ? <Empty icon="check" title="Nothing to upload">Records you save on the phone appear here until the database has them.</Empty> : null}
      {groups.map(([s, xs]) => <div key={s}><Sect>{ST[s][0]} ({xs.length})</Sect><div className="list">{xs.map(o => <Row key={o.cid} icon={TYPES[o.type]?.icon} iconTone={ST[s][1] === 'blue' ? '' : ST[s][1] === 'green' ? 'ok' : ST[s][1]} t1={describe(o)}
        t2={s === 'ok' ? `Saved as ${o.resultId} · ${fmtDT(o.sentAt)}` : o.error || (o.warnings || []).join(' • ') || 'Saved on the phone ' + fmtDT(o.created)} onClick={() => setCur(o.cid)} />)}</div></div>)}
      {it ? <Sheet title={describe(it)} onClose={() => setCur(null)}>
        <Badge tone={ST[it.status][1]}>{ST[it.status][0]}</Badge>
        {it.status === 'confirm' ? <Note kind="warn"><b>The database asks:</b><ul>{(it.warnings || []).map((w, i) => <li key={i}>{w}</li>)}</ul></Note> : null}
        {it.status === 'error' ? <Note kind="err">{it.error}</Note> : null}
        {it.status === 'conflict' ? <><Note kind="warn">{it.error || 'This record was changed on the desktop after you opened it.'} Choose whether your version should replace it.</Note>
          {it.current ? <Card title="Now in the database">{(Array.isArray(it.current) ? it.current : [it.current]).slice(0, 5).map((r, i) => <div key={i} className="small" style={{ marginBottom: 6 }}>{Object.entries(r).filter(([k, v]) => v !== '' && !/Source|Company Total|Status/.test(k)).slice(0, 10).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>)}</Card> : null}</> : null}
        {it.status === 'ok' ? <Note kind="ok">Uploaded as {it.resultId} on {fmtDT(it.sentAt)}.</Note> : null}
        <div className="btns mt">
          {it.status === 'confirm' ? <Btn kind="accent" onClick={() => { resolve(it.cid, 'force'); setCur(null); }}>Save anyway</Btn> : null}
          {it.status === 'conflict' ? <Btn kind="accent" onClick={() => { resolve(it.cid, 'force'); setCur(null); }}>Replace with mine</Btn> : null}
          {it.status === 'error' ? <Btn onClick={() => { resolve(it.cid, 'retry'); setCur(null); }}>Try again</Btn> : null}
          {it.status !== 'ok' && it.op !== 'delete' ? <Btn kind="ghost" icon="edit" onClick={() => edit(it)}>Edit</Btn> : null}
          {it.status !== 'ok' ? <Btn kind="red" icon="trash" onClick={async () => { if (await confirm({ title: 'Discard this?', message: 'It will not be uploaded.', ok: 'Discard', danger: true })) { resolve(it.cid, 'discard'); setCur(null); } }}>Discard</Btn> : null}
        </div>
      </Sheet> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ settings */
export function Settings() {
  const { prefs, setPref, L, toast, session } = useApp();
  const [busy, run] = useBusy();
  const setPin = async () => {
    const p = await prompt({ title: 'App PIN', message: '4–8 digits. The app asks for it when it opens and after it was in the background.', inputMode: 'numeric', ok: 'Next' });
    if (p === null) return; if (!/^\d{4,8}$/.test(p)) return alertBox({ title: 'PIN not set', message: 'Use 4 to 8 digits.' });
    const p2 = await prompt({ title: 'Repeat the PIN', inputMode: 'numeric', ok: 'Set PIN' });
    if (p2 !== p) return alertBox({ title: 'PIN not set', message: 'The two PINs are different.' });
    setPref('lockPin', p); toast('App PIN set', 'ok');
  };
  const days = prefs.notifyDays || [30, 7, 0];
  return (
    <Screen title="Settings">
      <Sect>Look</Sect>
      <Card><Seg value={prefs.theme} onChange={v => setPref('theme', v)} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /><Toggle label="Compact text" value={prefs.compact} onChange={v => setPref('compact', v)} /></Card>
      <Sect>Sync</Sect>
      <Card><Select label="Sync automatically every" value={String(prefs.autoSync)} onChange={v => setPref('autoSync', Number(v))} options={[{ value: '0', label: 'Only when I tap sync (and on start)' }, { value: '5', label: '5 minutes' }, { value: '10', label: '10 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }]} />
        <div className="small muted">The app also syncs when it opens, when the network comes back and right after you save a record.</div></Card>
      <Sect>Reminders on this phone</Sect>
      <Card>
        <Toggle label="Licence and bill reminders" sub="Phone notifications at 08:00 before a licence expires, 30 days after an unpaid bill, and a Monday summary" value={prefs.notify} onChange={async v => { if (v) await notifyPermission(); setPref('notify', v); }} />
        {prefs.notify ? <><div className="small b muted mb">Remind me before expiry</div><div className="chips">{[60, 30, 14, 7, 3, 0].map(n => <button key={n} className={'chip' + (days.includes(n) ? ' on' : '')} onClick={() => setPref('notifyDays', days.includes(n) ? days.filter(x => x !== n) : [...days, n].sort((a, b) => b - a))}>{n ? n + ' days' : 'on the day'}</button>)}</div></> : null}
      </Card>
      <Sect>Insights window</Sect>
      <Card><div className="grid2"><Num label="Expiring within (days)" value={String(prefs.insAhead)} onChange={v => setPref('insAhead', Math.max(1, Number(v) || 60))} /><Num label="Expired within (days)" value={String(prefs.insBack)} onChange={v => setPref('insBack', Math.max(0, Number(v) || 0))} /></div></Card>
      <Sect>Printing</Sect>
      <Card><Select label="Default signatory" value={prefs.signatory} onChange={v => setPref('signatory', v)} options={L.signatories.map(s => ({ value: s.key, label: s.key }))} placeholder="As set on the print page" /><Toggle label="Print letterhead and logos" value={prefs.letterhead !== false} onChange={v => setPref('letterhead', v)} /></Card>
      <Sect>Security</Sect>
      <Card>
        {prefs.lockPin ? <><Note kind="ok">App PIN is on.</Note><Select label="Lock after the app is in the background for" value={String(prefs.lockAfter || 2)} onChange={v => setPref('lockAfter', Number(v))} options={['1', '2', '5', '15', '60'].map(x => ({ value: x, label: x + ' min' }))} />
          <div className="btns"><Btn kind="ghost" onClick={setPin}>Change PIN</Btn><Btn kind="ghost" onClick={async () => { if (await confirm({ title: 'Remove the app PIN?', ok: 'Remove', danger: true })) setPref('lockPin', ''); }}>Remove PIN</Btn></div></>
          : <><div className="small muted mb">Protect the registers on this phone with a PIN.</div><Btn icon="lock" onClick={setPin}>Set an app PIN</Btn></>}
      </Card>
      <Sect>Storage</Sect>
      <Card><div className="btns"><Btn kind="ghost" onClick={() => run(async () => { await db.docs.clear(); }, 'Saved documents removed')}>Remove saved PDFs</Btn></div></Card>
    </Screen>
  );
}

/* ------------------------------------------------------------------ admin */
export function Admin() {
  const { S, server, isAdmin, toast, reloadSnap, sync, session } = useApp(), nav = useNav();
  const [st, setSt] = useState(S);
  const [busy, run] = useBusy();
  const [claude, setClaude] = useState(false);
  const act = (op, extra = {}, conf) => async () => { if (conf && !(await confirm(conf))) return; run(async () => { const r = await server('admin', { op, ...extra }); toast(r.message || 'Done', 'ok', 5000); const s = await server('admin', { op: 'status' }); setSt(s.settings); sync({ quiet: true }); }); };
  useEffect(() => { if (isAdmin && !session?.demo) run(async () => setSt((await server('admin', { op: 'status' })).settings)); }, []);   // eslint-disable-line
  if (!isAdmin) return <Screen title="Admin tools"><Note kind="warn">Only a CMU admin can use these tools. Sign in with an admin email + PIN under More ▸ Account.</Note></Screen>;
  const R = st.reminders || {};
  return (
    <Screen title="Admin tools" sub={st.version ? 'Database API ' + st.version : ''}>
      {session?.demo ? <Note kind="warn">Admin tools work with your real database only.</Note> : null}
      {busy ? <Note icon="sync">Working…</Note> : null}
      <Sect>Backups</Sect>
      <div className="list">
        <Row icon="download" t1="Back up now" t2={`Full copy in “CMU Backups” · last: ${st.lastBackup || 'none yet'}`} onClick={act('backup', {}, { title: 'Make a backup now?', message: 'A full copy of the CMU Database goes to the Drive folder “CMU Backups” (the newest 12 are kept).', ok: 'Back up' })} />
        <Row icon="calendar" t1={`Weekly backups: ${st.backupsOn === false ? 'OFF' : 'ON'}`} t2="Sundays about 22:00" onClick={act(st.backupsOn === false ? 'backupsOn' : 'backupsOff')} />
      </div>
      <Sect>Email reminders to companies</Sect>
      <div className="list">
        <Row icon="mail" t1={`Weekly reminders: ${R.on ? 'ON' : 'OFF'}`} t2={`Mondays · licences within ${R.licDays || 30} d, bills older than ${R.billDays || 30} d`} onClick={act(R.on ? 'remOff' : 'remOn', {}, { title: R.on ? 'Switch reminders OFF?' : 'Switch reminders ON?', message: R.on ? '' : 'Every Monday about 08:00 reminder emails go out from the database owner’s Gmail.', ok: 'Yes' })} />
        <Row icon="eye" t1="Preview / send now" t2="See who would get an email" onClick={() => nav.go('reminders')} />
        <Row icon="gear" t1="Reminder settings" t2={`Copy to: ${R.cc || '–'}`} onClick={async () => { const ld = await prompt({ title: 'Licences expiring within (days)', value: String(R.licDays || 30), inputMode: 'numeric' }); if (ld === null) return; const bd = await prompt({ title: 'Bills unpaid for more than (days)', value: String(R.billDays || 30), inputMode: 'numeric' }); if (bd === null) return; const cc = await prompt({ title: 'Send a copy of every reminder to', value: R.cc || '' }); if (cc === null) return; act('remSettings', { licDays: ld, billDays: bd, cc, sign: R.sign })(); }} />
        <Row icon="users" t1="Company contacts" t2="Email addresses for reminders" onClick={() => nav.go('contacts')} />
      </div>
      <Sect>Google Calendar & Gmail</Sect>
      <div className="list">
        <Row icon="calendar" t1={`Calendar sync: ${st.calendarOn ? 'ON' : 'OFF'}`} t2={st.calLast || 'Licence expiries + bill follow-ups as calendar events'} onClick={act(st.calendarOn ? 'calOff' : 'calOn')} />
        {st.calendarOn ? <Row icon="refresh" t1="Update the calendar now" onClick={act('calSync')} /> : null}
        <Row icon="mail" t1={`Email log: ${st.mailOn ? 'ON' : 'OFF'}`} t2="Logs emails with companies (from the owner’s Gmail)" onClick={act(st.mailOn ? 'mailOff' : 'mailOn', {}, st.mailOn ? null : { title: 'Log emails with companies?', message: 'Every morning the database reads the owner’s Gmail for emails to or from the addresses in Company Contacts and lists date, subject and the first lines on the sheet “Email Log”.', ok: 'Switch on' })} />
        {st.mailOn ? <Row icon="refresh" t1="Log new emails now" onClick={act('mailSync')} /> : null}
      </div>
      <Sect>Database</Sect>
      <div className="list">
        <Row icon="refresh" t1="Refresh the sheet’s Insights, charts and Quota Tracker" onClick={act('refresh')} />
        <Row icon="inbox" t1={`Document Inbox – automatic reading: ${st.inboxPolling ? 'ON' : 'OFF'}`} t2="Every 10 minutes" onClick={act('inboxPolling', { on: !st.inboxPolling })} />
        <Row icon="warn" t1="Chemical Hazards" t2="HMIS ratings and fee categories" onClick={() => nav.go('hazards')} />
        <Row icon="sparkle" t1="Claude" t2={st.claude?.installed ? `${st.claude.hasKey ? 'Key saved' : 'No key'} · ${st.claude.model} · ${usd(st.claude.spent || 0)} this month${st.claude.budget ? ' of ' + usd(st.claude.budget) : ''}` : 'Claude.gs not installed'} onClick={() => setClaude(true)} />
      </div>
      <Sect>Phones</Sect>
      <div className="list">
        <Row icon="users" t1="Officers & PINs" t2="Who can sign in on a phone, and their role" onClick={() => nav.go('officers')} />
        <Row icon="lock" iconTone="red" t1="Sign out all phones" t2="Every phone that signed in with a PIN must sign in again" onClick={act('resetTokens', {}, { title: 'Sign out all phones?', ok: 'Sign out all', danger: true })} />
      </div>
      {claude ? <ClaudeSettings st={st} onClose={() => setClaude(false)} onSaved={s => setSt(s)} /> : null}
    </Screen>
  );
}
function ClaudeSettings({ st, onClose, onSaved }) {
  const { server, toast } = useApp();
  const [key, setKey] = useState(''), [model, setModel] = useState(st.claude?.model || 'auto'), [budget, setBudget] = useState(st.claude?.budget ? String(st.claude.budget) : '');
  const [busy, run] = useBusy();
  return (
    <Sheet title="Claude settings" onClose={onClose}>
      <Text label="Anthropic API key" type="password" value={key} onChange={setKey} placeholder={st.claude?.hasKey ? 'A key is saved – leave blank to keep it' : 'sk-ant-…'} hint="console.anthropic.com ▸ API keys. Stored in the database’s script settings, never on the phone." />
      <Select label="Model" value={model} onChange={setModel} options={[{ value: 'auto', label: 'Auto – cheapest (Haiku for look-ups, Sonnet 5.5 for the rest)' }, { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }, { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' }, { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }, { value: 'claude-fable-5-1', label: 'Claude Fable 5.1' }]} />
      <Num label="Monthly budget (US$)" value={budget} onChange={setBudget} hint="Claude stops when it is reached. Empty = no cap." />
      <Btn block kind="accent" disabled={busy} onClick={() => run(async () => { const r = await server('admin', { op: 'claude', key, model, budget }); toast(r.message, 'ok'); onSaved(r.settings); onClose(); })}>{busy ? 'Saving (testing the key)…' : 'Save'}</Btn>
    </Sheet>
  );
}
export function Officers() {
  const { server, toast } = useApp();
  const [users, setUsers] = useState(null);
  const [cur, setCur] = useState(null);
  const [busy, run] = useBusy();
  useEffect(() => { run(async () => setUsers((await server('admin', { op: 'users' })).users)); }, []);   // eslint-disable-line
  const save = u => run(async () => { const r = await server('admin', { op: 'userSave', user: u }); setUsers(r.users); setCur(null); toast('Saved', 'ok'); });
  return (
    <Screen title="Officers & PINs" right={<IconBtn n="plus" label="Add" onClick={() => setCur({ email: '', name: '', role: 'staff', pin: '', active: true, isNew: true })} />}>
      <Note>Officers sign in on a phone with their email + PIN. Roles: <b>admin</b> (everything), <b>staff</b> (add, change, delete records), <b>viewer</b> (read only).</Note>
      {!users ? <Loading /> : <div className="list">{users.map(u => <Row key={u.email} icon="user" iconTone={u.active ? '' : 'red'} t1={u.name || u.email} t2={`${u.email} · ${u.role}${u.hasPin ? '' : ' · no PIN'}`} t3={u.lastSync ? 'Last sync ' + u.lastSync : ''} right={<Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'active' : 'off'}</Badge>} onClick={() => setCur({ ...u, pin: '' })} />)}</div>}
      {cur ? <Sheet title={cur.isNew ? 'Add an officer' : cur.email} onClose={() => setCur(null)}>
        {cur.isNew ? <Text label="Email" type="email" value={cur.email} onChange={v => setCur(c => ({ ...c, email: v }))} /> : null}
        <Text label="Name" value={cur.name} onChange={v => setCur(c => ({ ...c, name: v }))} />
        <Select label="Role" value={cur.role} onChange={v => setCur(c => ({ ...c, role: v }))} options={['admin', 'staff', 'viewer']} />
        <Text label={cur.isNew ? 'PIN (4–8 digits)' : 'New PIN (leave blank to keep)'} inputMode="numeric" value={cur.pin} onChange={v => setCur(c => ({ ...c, pin: v }))} />
        <Toggle label="Active" sub="Switch off to block a lost phone" value={cur.active} onChange={v => setCur(c => ({ ...c, active: v }))} />
        <div className="btns"><Btn kind="accent" disabled={busy} onClick={() => save(cur)}>Save</Btn>{!cur.isNew ? <Btn kind="ghost" disabled={busy} onClick={() => save({ ...cur, signOut: true })}>Sign out this officer</Btn> : null}
          {!cur.isNew ? <Btn kind="red" disabled={busy} onClick={async () => { if (await confirm({ title: 'Remove ' + cur.email + '?', ok: 'Remove', danger: true })) save({ ...cur, remove: true }); }}>Remove</Btn> : null}</div>
      </Sheet> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ help */
export function Help() {
  const items = [
    ['Registers', 'Companies, Licences & Certificates (with chemicals, vehicles and effluent details), Chemical Clearances (CLN with up to 20 chemicals), Bills & Invoices (BN with up to 10 services), Payments & Receipts, Notes & Issues, Correspondence and Field Inspections – search, filter, sort and export to Excel, CSV or PDF.'],
    ['Add, change, delete', 'Every form of the sheet is on the phone, with the same checks: duplicate companies, licence numbers used twice, import quotas, bill references, payment above the balance, receipts recorded twice. IDs (CMU-, LIC-, CLN-, BN-, PAY-) are given by the database when the record uploads.'],
    ['Offline', 'Everything is kept on the phone. Records you save offline appear in the registers straight away (marked “waiting to upload”) and upload when the signal returns. If a record was changed on the desktop in the meantime, the app asks which version to keep.'],
    ['Printing', 'Print ▸ Official PDF makes the letter on the database’s own print page – CRL, CIL, EDL, EDL & Retention Pond licences, clearance letters and bill letters, with the QR verification code – and saves it on the phone and in Drive. Reports (monthly, annual, company profile, quota tracker, insights) can be made on the phone (offline) or by the database.'],
    ['Bills', 'Create a bill with the wizard (CRL, CIL, CRL + CIL, EDL, dewatering, fumigation, clearance, transport, other – new or renewal), or from a licence or clearance (Create bill). Services and suggested fees come from the Fee Schedule; the total is written in words.'],
    ['Fees', 'The fee calculator applies RI/C&E-002-04/20 (Qp = R × Hi × Qi) with the HMIS ratings and fee categories of the Chemical Hazards sheet; per-kg categories in kg, Explosives and Sodium Cyanide in metric tons.'],
    ['Claude', 'Ask questions about the registers, or photograph a document: Claude reads it and fills the matching form for you to check and save. The API key and the monthly budget stay in the database (Claude.gs).'],
    ['QR check', 'Scan the QR code of a printed licence, clearance letter or bill: the database says whether it is genuine and still valid.'],
    ['Reminders', 'The phone reminds you before licences expire and when bills are unpaid for 30 days. Admins can run the weekly email reminders to companies, the Google Calendar sync and the Gmail email log from the phone.'],
    ['Set-up', '1. Add MobileAPI.gs to the CMU Database’s Apps Script (below Code.gs and Claude.gs), run MOB_Setup. 2. Deploy ▸ Web app (Execute as: Me, Who has access: Anyone), copy the /exec link. 3. Paste the link in the app with your name. Admins: give yourself a PIN on the sheet “Mobile Users”.'],
  ];
  return (
    <Screen title="Help & about" sub="CMU Database 2.0">
      <Card><div className="flex" style={{ gap: 14 }}><img src="./logo-mark.png" alt="" width="54" height="54" style={{ background: 'var(--navy)', borderRadius: 14 }} /><div><div className="b">CMU Database for Android</div><div className="small muted">EPA Liberia · ERRS Department · Chemical Management Unit</div><div className="tiny faint">Version 2.0 · for the CMU DATABASE Google Sheet with MobileAPI.gs v2</div></div></div></Card>
      {items.map(([t, s]) => <Card key={t} title={t}><div className="small">{s}</div></Card>)}
    </Screen>
  );
}
