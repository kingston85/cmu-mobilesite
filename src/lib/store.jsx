// App state: session, preferences, the registers (downloaded copy + records waiting to upload), sync, navigation helpers.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { db, getSnapshot, saveSnapshot, getMeta, setMeta, queue, outboxAll, updateItem, removeItem, wipe, EMPTY, uuid } from './db';
const addPhotos = async (cid, photos) => { for (const p of photos || []) await db.photos.put({ id: uuid(), ownerCid: cid, data: p.data, taken: p.taken || new Date().toISOString(), uploaded: 0 }); };
import { applyPending, provisionalId, baseOf } from './records';
import { enrich, insData, quotaData, dupSimilar, quotaWarnings, billStatus, eqi, trim, num, toDate, days, fmtD, usd, iso } from './logic';
import { sync as runSync, isSyncing } from './sync';
import { api, isOnline } from './api';
import { prefGet, prefSet, prefDel, scheduleReminders, buzz } from './device';
import { overlayBack } from './overlay';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const DEFAULT_PREFS = { theme: 'system', autoSync: 10, notify: true, notifyDays: [30, 7, 0], insAhead: 60, insBack: 30, lockPin: '', lockAfter: 2,
  signatory: '', letterhead: true, compact: false, lastTab: 'home', aiModel: 'auto', startScreen: 'home' };

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [snap, setSnap] = useState(EMPTY);
  const [outbox, setOutbox] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [syncState, setSyncState] = useState({ busy: false, msg: '', error: '' });
  const [online, setOnline] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);
  const [locked, setLocked] = useState(false);
  const bgAt = useRef(0);

  const toast = useCallback((text, kind = 'info', ms = 3200) => { setToastMsg({ text, kind, id: Date.now() }); if (kind === 'error') buzz('error'); setTimeout(() => setToastMsg(t => (t && Date.now() - t.id >= ms - 50 ? null : t)), ms); }, []);
  const reloadOutbox = useCallback(async () => setOutbox(await outboxAll()), []);
  const reloadSnap = useCallback(async () => { const s = await getSnapshot(); setSnap(s ? { ...EMPTY, ...s, tables: { ...EMPTY.tables, ...s.tables }, lists: { ...EMPTY.lists, ...s.lists } } : EMPTY); setLastSync(await getMeta('lastSync')); }, []);

  /* ---------- start-up */
  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([prefGet('session'), prefGet('prefs')]);
      const P = { ...DEFAULT_PREFS, ...(p || {}) };
      setPrefs(P); setSession(s);
      if (P.lockPin) setLocked(true);
      await reloadSnap(); await reloadOutbox();
      setOnline(await isOnline());
      setReady(true);
    })();
    const h1 = Network.addListener('networkStatusChange', st => setOnline(st.connected));
    const h2 = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) bgAt.current = Date.now();
      else if (bgAt.current) { setPrefs(P => { if (P.lockPin && Date.now() - bgAt.current > (P.lockAfter || 2) * 60000) setLocked(true); return P; }); setResumeTick(t => t + 1); }
    });
    return () => { h1.then(h => h.remove()).catch(() => {}); h2.then(h => h.remove()).catch(() => {}); };
  }, [reloadSnap, reloadOutbox]);
  const [resumeTick, setResumeTick] = useState(0);

  /* ---------- theme */
  useEffect(() => {
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.compact = prefs.compact ? '1' : '0';
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => { StatusBar.setStyle({ style: dark ? Style.Dark : Style.Dark }).catch(() => {}); StatusBar.setBackgroundColor({ color: dark ? '#0F1E2E' : '#1F4E78' }).catch(() => {}); }).catch(() => {});
    };
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)'); mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [prefs.theme, prefs.compact]);

  const setPref = useCallback(async (k, v) => { setPrefs(p => { const n = { ...p, [k]: v }; prefSet('prefs', n); return n; }); }, []);

  /* ---------- derived data */
  const raw = snap.tables;
  const T = useMemo(() => enrich(applyPending(raw, outbox)), [raw, outbox]);
  const L = snap.lists;
  const S = snap.settings || {};
  const D = useMemo(() => insData(T, prefs.insAhead || 60, prefs.insBack || 30), [T, prefs.insAhead, prefs.insBack]);
  const Q = useMemo(() => { try { return quotaData(T); } catch { return { lics: [], rows: [], notOn: [], noLic: [] }; } }, [T]);
  const pending = outbox.filter(o => o.status !== 'ok');
  const role = session?.demo ? 'admin' : session?.user?.role || 'viewer';
  const canEdit = role === 'admin' || role === 'staff';
  const isAdmin = role === 'admin';
  const allowDelete = S.allowDelete !== false;

  /* ---------- sync */
  const sync = useCallback(async (opts = {}) => {
    if (!session) return null;
    if (isSyncing()) return null;
    setSyncState({ busy: true, msg: 'Starting…', error: '' });
    try {
      const r = await runSync(session, msg => setSyncState(s => ({ ...s, msg })), opts);
      await reloadSnap(); await reloadOutbox();
      if (r?.user && !session.demo && (r.user.role !== session.user?.role || r.user.name !== session.user?.name)) {
        const ns = { ...session, user: { ...session.user, ...r.user } }; setSession(ns); prefSet('session', ns);
      }
      setSyncState({ busy: false, msg: '', error: '' });
      if (!opts.quiet) {
        const parts = [];
        if (r.sent) parts.push(`${r.sent} uploaded`); if (r.photos) parts.push(`${r.photos} photo(s)`);
        if (r.confirm) parts.push(`${r.confirm} need your OK`); if (r.conflict) parts.push(`${r.conflict} changed on the desktop`); if (r.errors) parts.push(`${r.errors} with problems`);
        toast(parts.length ? parts.join(' · ') : 'Up to date', r.errors || r.conflict || r.confirm ? 'warn' : 'ok');
      }
      return r;
    } catch (e) {
      setSyncState({ busy: false, msg: '', error: e.message });
      if (e.code === 'auth') { toast('Signed out – sign in again (More ▸ Account).', 'error', 5000); }
      else if (!opts.quiet) toast(e.message, 'warn', 4500);
      await reloadOutbox();
      return null;
    }
  }, [session, reloadSnap, reloadOutbox, toast]);

  // automatic sync: on start, when the network comes back, when the app returns to the front, and every few minutes
  useEffect(() => { if (ready && session && online) sync({ quiet: true }); }, [ready, session?.apiUrl, session?.demo, online, resumeTick]);   // eslint-disable-line
  useEffect(() => {
    if (!session || !prefs.autoSync) return;
    const t = setInterval(() => { if (online) sync({ quiet: true }); }, Math.max(2, prefs.autoSync) * 60000);
    return () => clearInterval(t);
  }, [session, prefs.autoSync, online, sync]);

  /* ---------- reminders on the phone (licence expiries, bills to follow up) */
  useEffect(() => {
    if (!ready || !prefs.notify) return;
    const list = [], at8 = (d, off) => { const x = new Date(d); x.setDate(x.getDate() - off); x.setHours(8, 0, 0, 0); return x; };
    D.licences.forEach(x => {
      if (!x.expiry || x.renewed || x.days < 0) return;
      (prefs.notifyDays || [30, 7, 0]).forEach(off => list.push({ at: at8(x.expiry, off), title: off ? `Licence expires in ${off} days` : 'Licence expires today',
        body: `${x.co} – ${x.type || x.cat}${x.no ? ' ' + x.no : ''} (${fmtD(x.expiry)})`, extra: { kind: 'licence', id: x.id } }));
    });
    D.unpaid.forEach(b => { if (!b.date) return; const due = new Date(b.date); due.setDate(due.getDate() + 30); list.push({ at: at8(due, 0), title: 'Bill unpaid for 30 days', body: `${b.co} – ${b.no} ${usd(b.out)} outstanding`, extra: { kind: 'bill', id: b.no } }); });
    const mon = new Date(); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(8, 5, 0, 0);
    const exp = D.alerts.filter(x => x.days < 0).length, soon = D.alerts.filter(x => x.days >= 0 && x.days <= 30).length, over30 = D.unpaid.filter(b => b.age > 30).length;
    if (exp || soon || over30) list.push({ at: mon, title: 'CMU weekly summary', body: `${exp} expired, ${soon} expiring within 30 days · ${over30} bills unpaid > 30 days`, extra: { kind: 'home' } });
    list.sort((a, b) => a.at - b.at);
    scheduleReminders(list);
  }, [ready, D, prefs.notify, prefs.notifyDays]);

  /* ---------- connect / sign in / out */
  const connect = useCallback(async (apiUrl, who) => {
    apiUrl = trim(apiUrl);
    const r = await api.login(apiUrl, { who, device: navigator.userAgent.slice(0, 60) });
    const s = { apiUrl, token: r.token || '', user: r.user || { name: who, role: 'staff' }, open: !!r.open, version: r.version };
    setSession(s); await prefSet('session', s);
    return s;
  }, []);
  const signIn = useCallback(async (email, pin, apiUrl) => {
    const url = apiUrl || session?.apiUrl;
    const r = await api.login(url, { email, pin, device: navigator.userAgent.slice(0, 60) });
    const s = { apiUrl: url, token: r.token, user: r.user, open: !!r.open, version: r.version };
    setSession(s); await prefSet('session', s);
    return s;
  }, [session]);
  const signOutAdmin = useCallback(async () => {
    if (!session) return;
    const s = { ...session, token: '', user: { name: session.user?.name, role: session.open ? 'staff' : 'viewer' } };
    setSession(s); await prefSet('session', s);
  }, [session]);
  const disconnect = useCallback(async (keepData = false) => {
    await prefDel('session'); setSession(null);
    if (!keepData) { await wipe(); setSnap(EMPTY); setOutbox([]); setLastSync(null); }
  }, []);
  const startDemo = useCallback(async () => {
    const { sampleSnapshot } = await import('./sample');
    await wipe();
    await saveSnapshot(sampleSnapshot()); await setMeta('lastSync', new Date().toISOString());
    const s = { demo: true, apiUrl: '', token: '', user: { name: 'Sample officer', role: 'admin' } };
    setSession(s); await prefSet('session', s);
    await reloadSnap(); await reloadOutbox();
  }, [reloadSnap, reloadOutbox]);

  /* ---------- checks before saving (offline copies of the server checks; the server checks again on upload) */
  const precheck = useCallback((type, op, id, d) => {
    const w = [], err = s => ({ error: s });
    if (op === 'delete') {
      if (type === 'company') { const n = ['licences', 'clearances', 'bills', 'payments', 'correspondence'].reduce((a, k) => a + (T[k] || []).filter(r => r['Company ID'] === id).length, 0); if (n) return err(`${id} is used by ${n} record(s) – it cannot be deleted.`); }
      if (type === 'bill') { const st = billStatus(T, id); if (st.paid > 0) w.push(`${usd(st.paid)} in payments is linked to ${id}.`); }
      return { warnings: w };
    }
    switch (type) {
      case 'company': {
        if (!trim(d.name)) return err('Company name is required.');
        const ex = T.companies.find(c => eqi(c['Company Name'], d.name) && c['Company ID'] !== id); if (ex) return err(`"${d.name}" is already registered as ${ex['Company ID']}.`);
        dupSimilar(T.companies, d.name, 3, id).forEach(s => w.push(`Similar company already registered: ${s.id} ${s.name} (${Math.round(s.score * 100)}% similar)`));
        break;
      }
      case 'licence': {
        if (!trim(d.company) || !trim(d.category) || !trim(d.type)) return err('Company, licence category and type are required.');
        if (!T.companies.some(c => eqi(c['Company Name'], d.company))) return err(`Company "${d.company}" is not registered. Register it first.`);
        const i = toDate(d.issued), e = toDate(d.expiry); if (i && e && e < i) w.push('Expiry date is before the issue date.');
        if (trim(d.licNo)) { const dup = T.licences.filter(l => eqi(l['Licence / Certificate No.'], d.licNo) && l['Record ID'] !== id); if (dup.length) w.push(`Licence No. ${d.licNo} is already on ${dup.map(l => l['Record ID']).join(', ')}.`); }
        if ((d.chemicals || []).some(c => !trim(c.name) && (trim(c.qty) || trim(c.epaReg)))) return err('A chemical line has details but no Trade or IUPAC Name.');
        const nch = (d.chemicals || []).filter(c => trim(c.name)).length; if (nch && !/\(CRL\)|\(CIL\)/i.test(d.category)) w.push(`${nch} chemical line(s) are entered but the category is not CRL or CIL.`);
        break;
      }
      case 'clearance': {
        if (!trim(d.company)) return err('Company is required.');
        const co = T.companies.find(c => eqi(c['Company Name'], d.company)); if (!co) return err(`Company "${d.company}" is not registered. Register it first.`);
        if (!toDate(d.date)) return err('Clearance date is missing or not valid.');
        const lines = (d.lines || []).filter(l => trim(l.rec) || trim(l.std));
        if (!lines.length) return err('Add at least one chemical line.');
        if (lines.length > 20) return err('A clearance can have at most 20 chemical lines.');
        if (lines.some(l => trim(l.qty) === '' || !trim(l.unit))) return err('Every chemical line needs a quantity and a unit.');
        try { quotaWarnings(T, d.company, co['Company ID'], d.date, lines.filter(l => !l.id)).forEach(x => w.push(x)); } catch { /* ignore */ }
        break;
      }
      case 'bill': {
        if (!trim(d.company) || !trim(d.type)) return err('Company and bill type are required.');
        if (!toDate(d.date)) return err('Bill date is missing or not valid.');
        const lines = (d.lines || []).filter(l => trim(l.service));
        if (!lines.length) return err('Add at least one service line.');
        if (lines.length > 10) return err('A bill can have at most 10 service lines.');
        if (lines.some(l => trim(l.amount) === '' || isNaN(Number(String(l.amount).replace(/,/g, ''))))) return err('Every service line needs an amount in US$.');
        if (trim(d.ref)) { const u = T.bills.find(b => eqi(b['Bill Ref. No.'], d.ref) && b['Bill No.'] !== id); if (u) return err(`Bill Ref. No. ${d.ref} is already used on ${u['Bill No.']}.`); }
        String(d.linked || '').split(/\s*,\s*/).filter(Boolean).forEach(rec => { if (T.bills.some(b => b['Bill No.'] !== id && String(b['Linked Record']).toUpperCase().includes(rec.toUpperCase()))) w.push(`${rec} has already been billed.`); });
        break;
      }
      case 'payment': {
        if (!(num(d.amount) > 0)) return err('The amount must be above 0.');
        if (!toDate(d.date)) return err('Payment date is missing or not valid.');
        if (trim(d.receipt)) { const r = T.payments.find(p => eqi(p['Receipt No.'], d.receipt) && p['Record ID'] !== id); if (r) w.push(`Receipt No. ${d.receipt} is already recorded (${r['Record ID']}).`); }
        if (!trim(d.bill)) {
          if (!T.companies.some(c => eqi(c['Company Name'], d.company))) return err('Choose the bill being paid, or a registered company (payment on the company account).');
          if (!trim(d.purpose)) return err('Purpose / services is required.');
          break;
        }
        const st = billStatus(T, d.bill); if (!st.co) return err(`Bill No. "${d.bill || ''}" was not found.`);
        let bal = st.bal; if (op === 'update') { const p = T.payments.find(x => x['Record ID'] === id); if (p && p['Bill No.'] === st.bn) bal += num(p['Amount (USD)']); }
        if (num(d.amount) > bal + 0.005) w.push(`Amount ${usd(d.amount)} is more than the outstanding balance ${usd(bal)} on ${st.bn}.`);
        break;
      }
      case 'issue': if (!trim(d.issue)) return err('Describe the issue found.'); break;
      case 'correspondence': if (!T.companies.some(c => eqi(c['Company Name'], d.company))) return err('Choose a registered company.'); if (!trim(d.type)) return err('Type is required.'); break;
      case 'inspection': if (!trim(d.site)) return err('Site / facility is required.'); if (!toDate(d.date)) return err('Inspection date is missing or not valid.'); break;
      case 'contact': if (trim(d.email) && !/^[^@\s]+@[^@\s]+\.[^@\s]+/.test(String(d.email).split(/[;,\s]+/)[0])) return err('The email address does not look valid.'); break;
      case 'hazard': for (const k of ['h', 'f', 'p', 'hmis']) if (trim(d[k]) !== '' && !(num(d[k]) >= 0 && num(d[k]) <= 4)) return err('HMIS values must be 0 – 4.'); break;
      default: break;
    }
    return { warnings: w };
  }, [T]);

  /* ---------- save (queue + upload in the background) */
  const save = useCallback(async (type, op, id, data, { photos = [], inboxFid, force = false } = {}) => {
    if (!canEdit) throw new Error('Your account is view-only.');
    // changing or deleting something that has not been uploaded yet: change the waiting item instead
    const mine = pending.find(o => o.op === 'create' && o.tempId && o.tempId === id && o.type === type);
    let cid, tempId = mine ? mine.tempId : '';
    if (mine && op === 'update') { await updateItem(mine.cid, { data, status: 'queued', error: '', warnings: [] }); cid = mine.cid; await addPhotos(cid, photos); }
    else if (mine && op === 'delete') { await removeItem(mine.cid); await reloadOutbox(); return { cid: null, removed: true }; }
    else {
      const sameUpd = op === 'update' ? pending.find(o => o.op === 'update' && o.type === type && o.id === id) : null;
      if (sameUpd) { await updateItem(sameUpd.cid, { data, status: 'queued', error: '', warnings: [] }); cid = sameUpd.cid; await addPhotos(cid, photos); }
      else {
        const base = op !== 'create' ? baseOf(type, raw, id) : null;
        tempId = op === 'create' ? provisionalId(type, T) : '';
        cid = await queue({ type, op, id: op === 'create' ? '' : id, data, base, inboxFid, force, tempId }, photos);
      }
    }
    await reloadOutbox();
    buzz('success');
    if (online || session?.demo) setTimeout(() => sync({ quiet: false }), 150);
    return { cid, tempId: tempId || id };
  }, [canEdit, pending, raw, T, online, session, sync, reloadOutbox]);
  const resolve = useCallback(async (cid, action) => {          // outbox decisions
    if (action === 'discard') await removeItem(cid);
    else if (action === 'force') await updateItem(cid, { status: 'queued', force: true, error: '' });
    else if (action === 'retry') await updateItem(cid, { status: 'queued', error: '' });
    await reloadOutbox();
    if (action !== 'discard' && online) setTimeout(() => sync(), 100);
  }, [reloadOutbox, online, sync]);

  /* ---------- server calls that need a signal */
  const server = useCallback(async (fn, ...args) => {
    if (session?.demo) throw new Error('Not available with sample data – connect to your CMU Database first (More ▸ Connection).');
    if (!(await isOnline())) throw new Error('This needs a network connection.');
    return api[fn](session, ...args);
  }, [session]);

  const value = {
    ready, session, prefs, setPref, snap, raw, T, L, S, D, Q, outbox, pending, lastSync, syncState, online, role, canEdit, isAdmin, allowDelete,
    toast, toastMsg, setToastMsg, sync, save, resolve, precheck, server, connect, signIn, signOutAdmin, disconnect, startDemo, reloadSnap, reloadOutbox,
    locked, setLocked, setSession: async s => { setSession(s); await prefSet('session', s); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ navigation (a simple stack with the Android back button) */
const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);
export function NavProvider({ children, root = 'home' }) {
  const [stack, setStack] = useState([{ name: root, params: {}, key: 1 }]);
  const k = useRef(1);
  const go = useCallback((name, params = {}) => setStack(s => [...s, { name, params, key: ++k.current }]), []);
  const back = useCallback(() => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const replace = useCallback((name, params = {}) => setStack(s => [...s.slice(0, -1), { name, params, key: ++k.current }]), []);
  const tab = useCallback(name => setStack([{ name, params: {}, key: ++k.current }]), []);
  const backHandler = useRef(null);
  useEffect(() => {
    const h = CapApp.addListener('backButton', () => {
      if (overlayBack()) return;          // a sheet / dialog closed itself
      setStack(s => { if (s.length > 1) return s.slice(0, -1); if (s[0].name !== 'home') return [{ name: 'home', params: {}, key: ++k.current }]; CapApp.minimizeApp().catch(() => {}); return s; });
    });
    return () => { h.then(x => x.remove()).catch(() => {}); };
  }, []);
  const top = stack[stack.length - 1];
  return <NavCtx.Provider value={{ stack, top, go, back, replace, tab, backHandler }}>{children}</NavCtx.Provider>;
}
export { iso, days };
