// Phone storage (IndexedDB through Dexie): the last copy of the registers, records waiting to upload, photos, cached PDFs.
import Dexie from 'dexie';

export const db = new Dexie('cmu-database-v2');
db.version(1).stores({
  meta: 'key',
  outbox: 'cid, status, type, created',     // queued | confirm | conflict | error | ok
  photos: 'id, ownerCid, uploaded',
  docs: 'id, kind, created',                // PDFs made on / downloaded to the phone
});

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });

export async function getMeta(key, fallback = null) { const r = await db.meta.get(key); return r ? r.value : fallback; }
export const setMeta = (key, value) => db.meta.put({ key, value });

export const EMPTY = {
  tables: { companies: [], licences: [], licenceChemicals: [], licenceVehicles: [], licenceEffluent: [], clearances: [], bills: [], payments: [], issues: [],
    correspondence: [], inspections: [], contacts: [], hazards: [], activity: [], inbox: [], emails: [] },
  lists: { categories: [], types: [], units: ['kg', 'MT', 'L', 'pcs'], chemicals: [], sectors: [], purposes: [], recordGroups: [], parameters: [], effUnits: [], schedules: [],
    billTypes: [], services: [], signatories: [], offices: [], hazardCats: [], hazardIndex: [], issueStatus: ['Open', 'Verified', 'Closed'], registers: [], corrTypes: [] },
  settings: {},
};
export const getSnapshot = () => getMeta('snapshot', null);
export const saveSnapshot = s => setMeta('snapshot', s);

export async function queue(item, photos = []) {
  const cid = item.cid || uuid();
  await db.transaction('rw', db.outbox, db.photos, async () => {
    await db.outbox.put({ status: 'queued', created: new Date().toISOString(), force: false, ...item, cid });
    for (const p of photos) await db.photos.put({ id: uuid(), ownerCid: cid, data: p.data, taken: p.taken || new Date().toISOString(), uploaded: 0 });
  });
  return cid;
}
export const outboxAll = () => db.outbox.orderBy('created').toArray();
export const updateItem = (cid, patch) => db.outbox.update(cid, patch);
export const removeItem = async cid => { await db.outbox.delete(cid); await db.photos.where('ownerCid').equals(cid).delete(); };
export async function wipe() { await db.delete(); await db.open(); }
