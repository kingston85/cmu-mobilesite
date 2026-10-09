// Claude on the phone: ask about the registers, or photograph / attach a document and get the matching form filled in.
// The phone sends the question to the CMU Database (MobileAPI.gs), which calls Claude with the database tools; the
// API key and the monthly budget stay in the sheet.
import { useEffect, useRef, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Btn, Card, Icon, IconBtn, Note, Seg, Select, Text, KV, Badge, Sheet, Row, useBusy, confirm } from '../components/ui';
import { Ring } from '../components/charts';
import { pickDocument, prefGet, prefSet } from '../lib/device';
import { usd, money } from '../lib/logic';

const QUICK = [
  ['Licences to renew', 'Which licences or certificates expire in the next 60 days, or expired recently without being renewed? Group them by company and say what each company should do.'],
  ['Unpaid bills', 'Which bills are unpaid and how old are they? Give the aging (0-30, 31-60, 61-90, over 90 days) with totals and name the five largest debtors.'],
  ['Quota check', 'Use quota_status: which companies are over or near their licensed import quantities, which cleared chemicals are not on their licence, and which clearances had no valid importation licence? Most serious first.'],
  ['Data check', 'Do a data-quality check of the CMU registers. Look for duplicate or near-duplicate companies; records with missing key fields; licences whose expiry date is before the issue date; clearances with a quantity but no unit; bills without a Bill Ref. No.; payments not linked to a bill or larger than the bill; IDs used twice. List each problem with the record ID, most important first, at most 25 items.'],
  ['Standardise names', 'Find clearance lines whose "Chemical (Standard)" is "Other / Unspecified" or blank, and use standardise_chemicals to suggest the right standard name for each (with the record ID). Do not change anything; list the suggestions.'],
  ['Monthly summary', "Write a short summary of this month's CMU activity: licences issued, clearances (number and MT), bills and payments (US$), compared with last month. End with three points for management."],
  ['Price a consignment', 'Calculate the chemical importation fee for the attached document (or the chemicals I list) with calculate_fee. Show each line (rate × hazard index × quantity), the total in figures and words, and list any chemical whose HMIS rating or fee category is missing – do not guess those.'],
  ['Read document → form', 'Read the attached document. First say what kind of document it is and list every field you can read, marking anything unclear. Then prepare the matching CMU record with draft_record. Do not say it is saved.'],
];
const FORM_OF = { clearance: 'clearance', licence: 'licence', payment: 'payment', bill: 'bill', company: 'company' };

export default function Assistant({ mode: m0 }) {
  const { session, online, S, prefs, setPref } = useApp();
  const [mode, setMode] = useState(m0 || 'chat');
  const ready = !session?.demo && online;
  return (
    <>
      <Bar title="Claude" sub={S.claude?.installed === false ? 'Not installed in the database' : S.claude?.budget ? `This month ${usd(S.claude.spent || 0)} of ${usd(S.claude.budget)}` : 'Assistant for the CMU Database'} />
      <main className="main noNav"><div className="wrap">
        <Seg value={mode} onChange={setMode} options={[{ value: 'chat', label: 'Ask Claude' }, { value: 'doc', label: 'Read a document' }]} />
        {session?.demo ? <Note kind="warn">Claude works with your real CMU Database (it is not available with sample data).</Note> : !online ? <Note kind="warn" icon="cloudOff">Claude needs a network connection.</Note> : null}
        {S.claude && S.claude.installed && !S.claude.hasKey ? <Note kind="warn">No Anthropic API key is saved in the database yet (desktop: Claude ▸ Settings, or Admin ▸ Claude on the phone).</Note> : null}
        {mode === 'chat' ? <Chat ready={ready} /> : <DocReader ready={ready} />}
      </div></main>
    </>
  );
}

function Chat({ ready }) {
  const { server, prefs, setPref } = useApp(), nav = useNav();
  const [msgs, setMsgs] = useState([]);
  const [hist, setHist] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, run] = useBusy();
  const [usage, setUsage] = useState(null);
  const end = useRef(null);
  useEffect(() => { prefGet('aiChat', null).then(v => { if (v) { setMsgs(v.msgs || []); setHist(v.hist || []); } }); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); prefSet('aiChat', { msgs: msgs.slice(-40), hist: hist.slice(-16) }); }, [msgs, hist]);
  const send = (q = text) => {
    q = q.trim(); if (!q || busy) return;
    const f = file; setText(''); setFile(null);
    setMsgs(ms => [...ms, { role: 'user', text: (f ? '📎 ' + f.name + '\n' : '') + q }]);
    run(async () => {
      try {
        const r = await server('ai', { history: hist, message: q, file: f || undefined, model: prefs.aiModel || undefined });
        setHist(r.history || []); setUsage(r.usage);
        setMsgs(ms => [...ms, { role: 'assistant', text: r.reply, drafts: r.drafts || [], tools: r.tools || [] }]);
      } catch (e) { setMsgs(ms => [...ms, { role: 'error', text: e.message }]); }
    });
  };
  const attach = src => run(async () => setFile(await pickDocument(src)));
  return (
    <>
      {!msgs.length ? <Card><div className="small muted mb">Ask about companies, licences, clearances, bills, payments or quotas – Claude looks at the live registers. Tell it what to record and it fills the form for you to check and save. Attach a photo or PDF with 📎.</div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>{QUICK.map(([l, p]) => <button key={l} className="chip" disabled={!ready} onClick={() => { if (/attached/.test(p) && !file) return attach('camera'); send(p); }}>{l}</button>)}</div></Card> : null}
      <div className="chat">
        {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="msg-u">{m.text}</div> : m.role === 'error' ? <Note key={i} kind="err">{m.text}</Note> : (
          <div key={i} className="msg-a">{m.text}
            {m.drafts?.map((d, k) => <div key={k} className="note ok" style={{ marginTop: 10, marginBottom: 0 }}><Icon n="sparkle" s={18} /><div className="grow"><b>{d.form} form filled</b>{d.warnings?.length ? <div className="small">{d.warnings.join(' • ')}</div> : null}
              <Btn sm kind="green" className="mt" icon="edit" onClick={() => nav.go('form', { type: d.form, op: 'create', draft: d.data })}>Open and check</Btn></div></div>)}
          </div>))}
        {busy ? <div className="msg-a"><span className="spin" style={{ width: 16, height: 16, borderWidth: 2, verticalAlign: -3 }} /> {file ? 'Reading the document…' : 'Thinking…'}</div> : null}
        <div ref={end} />
      </div>
      {usage ? <div className="tiny faint" style={{ margin: '4px 2px' }}>{String(usage.model || '').replace('claude-', '')} · {usd(usage.cost || 0)} · month {usd(usage.month || 0)}{usage.budget ? ' of ' + usd(usage.budget) : ''}</div> : null}
      {file ? <div className="note"><Icon n="attach" s={18} /><div className="grow small">{file.name}</div><button className="ib" onClick={() => setFile(null)}><Icon n="close" s={16} /></button></div> : null}
      <div className="composer">
        <button className="ib" disabled={!ready} onClick={async () => { const c = await confirm({ title: 'Attach', message: 'Take a photo of the document, or choose a PDF / image file?', ok: 'Take photo', cancel: 'Choose file' }); attach(c ? 'camera' : 'file'); }} aria-label="Attach"><Icon n="attach" /></button>
        <textarea className="in" value={text} placeholder="e.g. Record US$1,600 from LIPFOCO, receipt 4471, for BN-2026-021" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn accent" style={{ minHeight: 46, padding: '0 14px' }} disabled={!ready || busy || !text.trim()} onClick={() => send()}><Icon n="send" s={18} /></button>
      </div>
      <div className="flex between tiny faint"><span>Model</span><select className="in" style={{ minHeight: 32, padding: '4px 30px 4px 8px', width: 'auto', fontSize: 12 }} value={prefs.aiModel || 'auto'} onChange={e => setPref('aiModel', e.target.value)}>
        <option value="auto">Auto (cheapest)</option><option value="claude-sonnet-5-5">Sonnet 5.5</option><option value="claude-opus-5-5">Opus 5.5</option><option value="claude-haiku-4-5-20251001">Haiku 4.5</option></select>
        {msgs.length ? <button className="btn link sm" onClick={() => { setMsgs([]); setHist([]); }}>New conversation</button> : null}</div>
    </>
  );
}

function DocReader({ ready }) {
  const { server, toast, canEdit } = useApp(), nav = useNav();
  const [file, setFile] = useState(null);
  const [hint, setHint] = useState('');
  const [res, setRes] = useState(null);
  const [busy, run] = useBusy();
  const pick = src => run(async () => { setRes(null); setFile(await pickDocument(src)); });
  const read = () => run(async () => setRes(await server('aiDoc', { file, hint })));
  const toInbox = () => run(async () => { const r = await server('inbox', { op: 'upload', file, readNow: true }); toast(r.message, 'ok'); nav.go('inbox'); });
  const flat = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x, i) => [`${k} ${i + 1}`, typeof x === 'object' ? Object.values(x).filter(y => y !== '' && y !== null && y !== undefined).join(' · ') : String(x)]) : typeof v === 'object' && v ? flat(v, k + '.') : [[pre + k.replace(/_/g, ' '), String(v)]]));
  return (
    <>
      <Card><div className="small muted mb">Photograph or attach an invoice, bill of lading, licence application, licence, receipt or bank slip. Claude reads it and fills the matching form; you check it and tap Save. Nothing is saved without you.</div>
        <div className="btns"><Btn icon="camera" disabled={!ready || busy} onClick={() => pick('camera')}>Take a photo</Btn><Btn kind="ghost" icon="file" disabled={!ready || busy} onClick={() => pick('file')}>PDF / image</Btn></div></Card>
      {file ? <Card title={file.name}>
        {/^image\//.test(file.mime) ? <img src={`data:${file.mime};base64,${file.data}`} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 10, background: 'var(--chip)' }} /> : <div className="flex"><Icon n="pdf" s={30} /><span className="small muted">PDF · {money(file.data.length * 0.75 / 1024, 0)} KB</span></div>}
        <Text label="What is it? (optional)" value={hint} onChange={setHint} placeholder="e.g. commercial invoice for a clearance" />
        <div className="btns"><Btn kind="accent" icon="sparkle" disabled={!ready || busy} onClick={read}>{busy ? 'Claude is reading…' : 'Read with Claude'}</Btn><Btn kind="ghost" icon="inbox" disabled={!ready || busy} onClick={toInbox}>Send to Document Inbox</Btn></div>
      </Card> : null}
      {res ? <Card title={`${res.docType === 'other' ? 'Not a CMU document?' : res.docType[0].toUpperCase() + res.docType.slice(1)} – ${res.summary || ''}`}>
        <div className="flex" style={{ alignItems: 'center', gap: 12 }}><Ring pct={res.confidence} color={res.confidence >= 0.8 ? '#70AD47' : '#E0A800'} /><div className="small muted">Claude’s confidence that the values are complete and correct. {res.confidence < 0.8 ? 'Check carefully.' : ''}</div></div>
        {res.issues?.length ? <Note kind="warn"><b>Check</b><ul>{res.issues.map((x, i) => <li key={i}>{x}</li>)}</ul></Note> : null}
        <KV items={flat(res.data)} />
        {FORM_OF[res.docType] && canEdit ? <Btn block kind="green" className="mt" icon="edit" onClick={() => nav.go('form', { type: FORM_OF[res.docType], op: 'create', draft: res.data })}>Open the filled {res.docType} form</Btn> : null}
        {res.usage ? <div className="tiny faint mt">{usd(res.usage.cost || 0)} · month {usd(res.usage.month || 0)}{res.usage.budget ? ' of ' + usd(res.usage.budget) : ''}</div> : null}
      </Card> : null}
    </>
  );
}
