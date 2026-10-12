// Phone storage: the last copy of the registers (for offline use) + records waiting to upload + the Claude conversation.
import Dexie from 'dexie';

export const db = new Dexie('cmu-mobile');
db.version(1).stores({
  meta: 'key',
  outbox: 'cid, status, type, created',   // records made on the phone: queued | confirm | error | ok
  photos: 'id, inspectionCid, uploaded',
});

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

export async function getMeta(key, fallback = null) {
  const r = await db.meta.get(key);
  return r ? r.value : fallback;
}
export const setMeta = (key, value) => db.meta.put({ key, value });

export const EMPTY_SNAP = {
  tables: { companies: [], licences: [], licenceChemicals: [], licenceVehicles: [], licenceEffluent: [], clearances: [], bills: [], payments: [], issues: [], correspondence: [], inspections: [], inbox: [] },
  codes: { licence: {}, clearance: {}, bill: {} },
  activity: [],
  insights: { alerts: [], bills: [], quotas: [], notOn: [], noLic: 0, ahead: 60, after: 30 },
  lists: { chemicals: [], units: ['kg', 'MT', 'L', 'pcs'], sectors: [], purposes: [], categories: [], types: [], billTypes: [], groups: [], inspectionTypes: [], compliance: ['Compliant', 'Minor issues', 'Non-compliant'],
    corTypes: [], vehicleTypes: [], registers: [], issueStatus: ['Open', 'Verified', 'Closed'], params: [], effUnits: [], schedules: [] },
  hazards: { rows: [], cats: [], hi: [] },
  config: { fees: [], billTypes: [], signatories: [], settings: {} },
  server: {},
};
/** a snapshot from an older server version gets the missing parts */
export function normalise(s) {
  if (!s) return s;
  const out = { ...EMPTY_SNAP, ...s };
  out.tables = { ...EMPTY_SNAP.tables, ...(s.tables || {}) };
  out.insights = { ...EMPTY_SNAP.insights, ...(s.insights || {}) };
  out.lists = { ...EMPTY_SNAP.lists, ...(s.lists || {}) };
  out.config = { ...EMPTY_SNAP.config, ...(s.config || {}) };
  out.codes = { ...EMPTY_SNAP.codes, ...(s.codes || {}) };
  return out;
}
export const getSnapshot = async () => normalise(await getMeta('snapshot', null));
export const saveSnapshot = s => setMeta('snapshot', s);

export async function queue(type, data, photos = [], force = false) {
  const cid = uuid();
  await db.transaction('rw', db.outbox, db.photos, async () => {
    await db.outbox.put({ cid, type, data, created: new Date().toISOString(), status: 'queued', force });
    for (const p of photos) await db.photos.put({ id: uuid(), inspectionCid: cid, data: p.data, taken: p.taken, uploaded: 0 });
  });
  return cid;
}
export const outboxAll = () => db.outbox.orderBy('created').reverse().toArray();
export const pendingCount = async () =>
  (await db.outbox.where('status').anyOf('queued', 'confirm', 'error').count()) + (await db.photos.where('uploaded').equals(0).count());

export async function wipe() { await db.delete(); await db.open(); }
