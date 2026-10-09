// Upload what was recorded on the phone, then download the registers. Safe to call often: only one run at a time.
import { api, isOnline } from './api';
import { db, saveSnapshot, setMeta, getSnapshot, EMPTY } from './db';
import { applyPending, provisionalId } from './records';

let running = null;
export function sync(session, progress = () => {}, opts = {}) {
  if (!running) running = run(session, progress, opts).finally(() => { running = null; });
  return running;
}
export const isSyncing = () => !!running;

async function run(s, progress, { pushOnly = false } = {}) {
  if (s.demo) return demoRun(progress);
  if (!(await isOnline())) throw new Error('No network – everything is kept on this phone and will upload when the signal returns.');
  const out = { sent: 0, photos: 0, confirm: 0, conflict: 0, errors: 0 };
  // 1  upload, oldest first (so a new company goes before its licence or clearance)
  if (s.user?.role !== 'viewer') {
    const items = (await db.outbox.where('status').equals('queued').toArray()).sort((a, b) => a.created.localeCompare(b.created));
    for (let i = 0; i < items.length; i += 10) {
      const batch = items.slice(i, i + 10);
      progress(`Uploading ${Math.min(i + 10, items.length)} of ${items.length}…`);
      const res = await api.push(s, batch.map(b => ({ cid: b.cid, type: b.type, op: b.op, id: b.id, data: b.data, base: b.base, force: !!b.force, inboxFid: b.inboxFid })));
      for (const r of res.results) {
        await db.outbox.update(r.cid, { status: r.status, warnings: r.warnings || [], error: r.error || '', current: r.current || null, resultId: r.id || '', sentAt: r.status === 'ok' ? new Date().toISOString() : '' });
        out[r.status === 'ok' ? 'sent' : r.status === 'confirm' ? 'confirm' : r.status === 'conflict' ? 'conflict' : 'errors']++;
      }
    }
    // 2  inspection photos, once their inspection is on the server
    const photos = await db.photos.where('uploaded').equals(0).toArray();
    for (const [n, p] of photos.entries()) {
      const owner = await db.outbox.get(p.ownerCid);
      if (!owner) { await db.photos.delete(p.id); continue; }
      if (owner.status !== 'ok') continue;
      progress(`Uploading photo ${n + 1} of ${photos.length}…`);
      const r = await api.photo(s, { id: p.id, inspectionCid: p.ownerCid, inspectionId: owner.resultId || owner.id, base64: p.data, taken: p.taken });
      await db.photos.update(p.id, { uploaded: 1, url: r.url, data: '' });
      out.photos++;
    }
  }
  if (pushOnly) return out;
  // 3  download the registers
  progress('Downloading the registers…');
  const snap = await api.pull(s);
  await saveSnapshot({ tables: snap.tables, lists: snap.lists, settings: { ...snap.settings, allowDelete: snap.allowDelete, open: snap.open }, user: snap.user, serverTime: snap.serverTime });
  await setMeta('lastSync', new Date().toISOString());
  await tidy();
  out.user = snap.user;
  return out;
}
/** keep the last 40 uploaded items as history */
async function tidy() {
  const done = (await db.outbox.where('status').equals('ok').toArray()).sort((a, b) => (b.sentAt || b.created).localeCompare(a.sentAt || a.created));
  for (const d of done.slice(40)) await db.outbox.delete(d.cid);
}

/* ------------------------------------------------------------------ sample-data mode: everything stays on the phone */
async function demoRun(progress) {
  progress('Saving (sample data – nothing leaves the phone)…');
  let snap = (await getSnapshot()) || { ...EMPTY };
  const items = (await db.outbox.where('status').equals('queued').toArray()).sort((a, b) => a.created.localeCompare(b.created));
  let sent = 0;
  for (const it of items) {
    const id = it.op === 'create' ? provisionalId(it.type, snap.tables) : it.id;
    const t = applyPending(snap.tables, [{ ...it, tempId: id, status: 'queued' }]);
    const clean = {};
    for (const [k, rows] of Object.entries(t)) clean[k] = Array.isArray(rows) ? rows.map(r => { if (!r || !r._pending) return r; const { _pending, _cid, _status, _op, ...rest } = r; return rest; }) : rows;
    // clearance / bill line IDs for new lines
    const fix = (rows, idCol, pre) => { let mx = 0; rows.forEach(r => { const m = String(r[idCol] || '').match(new RegExp('^' + pre + '(\\d+)$')); if (m) mx = Math.max(mx, +m[1]); });
      return rows.map(r => (String(r[idCol] || '').includes('·') ? { ...r, [idCol]: pre + String(++mx).padStart(3, '0') } : r)); };
    clean.clearances = fix(clean.clearances, 'Record ID', 'CLR-');
    clean.bills = fix(clean.bills, 'Bill ID', 'BIL-');
    clean.activity = [{ when: new Date().toISOString().slice(0, 16), who: 'sample (mobile)', action: it.op === 'create' ? 'Saved new' : it.op === 'update' ? 'Updated' : 'Deleted', register: it.type, record: id, details: '' }, ...(clean.activity || [])];
    snap = { ...snap, tables: clean };
    await db.outbox.update(it.cid, { status: 'ok', resultId: id, sentAt: new Date().toISOString() });
    sent++;
  }
  await saveSnapshot(snap);
  await setMeta('lastSync', new Date().toISOString());
  await tidy();
  return { sent, photos: 0, confirm: 0, conflict: 0, errors: 0, demo: true };
}
