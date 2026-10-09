// Document Inbox: files saved in the inbox folder (Drive / Dropbox / OneDrive / web link / this phone) are read by Claude;
// an officer checks each one here, opens the filled form, saves it – and the inbox row turns Approved.
import { useMemo, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Btn, Card, Icon, IconBtn, Note, Row, Badge, KV, Sheet, Chips, Empty, prompt, confirm, useBusy } from '../components/ui';
import { Ring } from '../components/charts';
import { fmtDT } from '../lib/logic';
import { pickDocument, openUrl } from '../lib/device';

const OPEN = ['To review', 'Needs attention', 'Not read'];
const tone = s => (s === 'To review' ? 'blue' : s === 'Needs attention' ? 'amber' : s === 'Not read' ? 'red' : s === 'Approved' ? 'green' : '');

export default function Inbox({ fid }) {
  const { T, server, session, canEdit, toast, sync } = useApp(), nav = useNav();
  const [items, setItems] = useState(null);
  const [f, setF] = useState('open');
  const [cur, setCur] = useState(fid || null);
  const [busy, run] = useBusy();
  const list = items || T.inbox || [];
  const shown = list.filter(x => (f === 'open' ? OPEN.includes(x.status) : f === 'done' ? !OPEN.includes(x.status) : true));
  const refresh = () => run(async () => setItems((await server('inbox', { op: 'list' })).items));
  const runNow = () => run(async () => { const r = await server('inbox', { op: 'run' }); toast(r.message, 'ok', 6000); setItems((await server('inbox', { op: 'list' })).items); });
  const upload = async () => {
    const cam = await confirm({ title: 'Add a document', message: 'Take a photo, or choose a PDF / image file? Claude reads it straight away.', ok: 'Take photo', cancel: 'Choose file' });
    run(async () => { const file = await pickDocument(cam ? 'camera' : 'file'); const r = await server('inbox', { op: 'upload', file, readNow: true }); toast(r.message, 'ok'); setItems((await server('inbox', { op: 'list' })).items); });
  };
  const it = list.find(x => x.fid === cur);
  return (
    <>
      <Bar title="Document Inbox" sub={`${list.filter(x => OPEN.includes(x.status)).length} to review`} right={!session?.demo ? <><IconBtn n="refresh" label="Refresh" onClick={refresh} /><IconBtn n="sync" label="Check the inbox now" onClick={runNow} /></> : null} />
      <main className="main noNav"><div className="wrap">
        <Note>Documents saved in the inbox folder (Google Drive “CMU Inbox”, Dropbox, OneDrive or the web link) are read by Claude every 10 minutes. Check each one, open the filled form and save it.</Note>
        {canEdit && !session?.demo ? <Btn block kind="accent" icon="camera" disabled={busy} onClick={upload}>{busy ? 'Working…' : 'Add a document from this phone'}</Btn> : null}
        <div className="mt" />
        <Chips value={f} onChange={setF} options={[{ value: 'open', label: 'To review', n: list.filter(x => OPEN.includes(x.status)).length }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All', n: list.length }]} />
        {shown.length ? <div className="list">{shown.map(x => <Row key={x.fid} icon={x.type === 'clearance' ? 'flask' : x.type === 'licence' ? 'badge' : x.type === 'payment' ? 'cash' : 'file'} t1={x.summary || x.name} t2={[x.type, x.company].filter(Boolean).join(' · ') || x.name} t3={`${x.source} · ${fmtDT(x.when)}${x.record ? ' · ' + x.record : ''}`} right={<Badge tone={tone(x.status)}>{x.status}</Badge>} onClick={() => setCur(x.fid)} />)}</div>
          : <Empty icon="inbox" title={f === 'open' ? 'Nothing to review' : 'Nothing here'} />}
      </div></main>
      {it ? <InboxItem it={it} onClose={() => setCur(null)} onChanged={refresh} /> : null}
    </>
  );
}

function InboxItem({ it, onClose, onChanged }) {
  const { server, canEdit, toast } = useApp(), nav = useNav();
  const [busy, run] = useBusy();
  const flat = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x, i) => [`${k} ${i + 1}`, typeof x === 'object' ? Object.values(x).filter(y => y !== '' && y != null).join(' · ') : String(x)]) : typeof v === 'object' && v ? flat(v, k + '.') : [[pre + k.replace(/_/g, ' '), String(v)]]));
  const open = OPEN.includes(it.status);
  const type = ['clearance', 'licence', 'payment'].includes(it.type) ? it.type : null;
  const reject = async () => { const reason = await prompt({ title: 'Reject this document?', message: 'It is moved to CMU Inbox ▸ Rejected. Reason (optional):', ok: 'Reject', placeholder: 'e.g. duplicate, not a CMU document' }); if (reason === null) return; run(async () => { await server('inbox', { op: 'reject', fid: it.fid, reason }); toast('Rejected', 'ok'); onClose(); onChanged(); }); };
  const reread = () => run(async () => { await server('inbox', { op: 'reread', fid: it.fid }); toast('Read again', 'ok'); onChanged(); });
  const choose = async () => { const t = await prompt({ title: 'Which form?', message: 'Type clearance, licence or payment', ok: 'Open', value: it.type || 'clearance' }); if (t && ['clearance', 'licence', 'payment'].includes(t.trim().toLowerCase())) { onClose(); nav.go('form', { type: t.trim().toLowerCase(), op: 'create', draft: it.data, inboxFid: it.fid }); } };
  return (
    <Sheet title={it.name} onClose={onClose} full foot={open && canEdit ? <>
      <Btn kind="ghost" icon="close" disabled={busy} onClick={reject}>Reject</Btn>
      {type ? <Btn kind="green" icon="edit" onClick={() => { onClose(); nav.go('form', { type, op: 'create', draft: it.data, inboxFid: it.fid }); }}>Fill the {type} form</Btn> : <Btn icon="edit" onClick={choose}>Choose a form</Btn>}
    </> : null}>
      <div className="flex" style={{ gap: 12, alignItems: 'center', marginBottom: 10 }}><Ring pct={it.conf} color={it.conf >= 0.8 ? '#70AD47' : '#E0A800'} /><div><Badge tone={tone(it.status)}>{it.status}</Badge><div className="b mt">{it.summary}</div><div className="small muted">{it.source} · {fmtDT(it.when)}</div></div></div>
      {it.notes ? <Note kind={it.status === 'To review' ? '' : 'warn'}>{it.notes}</Note> : null}
      {it.record ? <Note kind="ok">Saved as <a onClick={() => { onClose(); nav.go(it.type === 'clearance' ? 'clearance' : it.type === 'licence' ? 'licence' : 'payment', { id: it.record }); }}>{it.record}</a>{it.checkedBy ? ' by ' + it.checkedBy : ''}.</Note> : null}
      <Card title="What Claude read"><KV items={[['Type', it.type], ['Company', it.company], ...flat(it.data)]} /></Card>
      <div className="btns">{it.url ? <Btn kind="ghost" icon="eye" onClick={() => openUrl(it.url)}>Open the file</Btn> : null}{open && canEdit ? <Btn kind="ghost" icon="refresh" disabled={busy} onClick={reread}>Read again</Btn> : null}</div>
    </Sheet>
  );
}
