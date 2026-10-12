import { useEffect, useRef, useState } from 'react';
import { Header, Card, Field, Select, Empty, Pill, Actions, Row } from './ui';
import { askClaude, readDocument, isOnline } from '../lib/api';
import { getMeta, setMeta } from '../lib/store';
import { pickDocument, scanDocumentPhoto } from '../lib/device';
import { fromAi, FORM_LABEL } from './Forms';
import { money, fmtD } from '../lib/util';
import { display } from './Records';

const QUICK = [
  ['Read document → form', 'doc', 'Read the attached document. First say what kind of document it is and list every field you can read (company, dates, reference numbers, B/L or invoice numbers, each chemical with quantity and unit exactly as written, amounts, receipt numbers), marking anything unclear. Then fill the matching CMU form with fill_form. Do not save – tell me to check the form and tap Save.'],
  ['Price a consignment', 'fee', 'Calculate the chemical importation fee for the attached document (or the chemicals I list) with calculate_fee. Show each line (rate × hazard index × quantity), the total in figures and words, and list any chemical whose HMIS rating or fee category is missing – do not guess those.'],
  ['Data check', '', 'Do a data-quality check of the CMU registers. Look for: duplicate or near-duplicate companies; records with missing key fields (company, dates, licence numbers, quantities, units); licences whose expiry date is before the issue date; clearances with a quantity but no unit, or zero quantity; bills without a Bill Ref. No.; payments not linked to a bill or larger than the bill; IDs used twice. List each problem with the record ID, most important first, at most 25 items, then a one-line summary.'],
  ['Licences to renew', '', 'Which licences or certificates expire in the next 60 days, or expired recently without being renewed? Group them by company and say what each company should do.'],
  ['Unpaid bills', '', 'Which bills are unpaid and how old are they? Give the aging (0-30, 31-60, 61-90, over 90 days) with totals and name the five largest debtors.'],
  ['Quota check', '', 'Use quota_status: which companies are over or near their licensed import quantities, which cleared chemicals are not on their licence, and which clearances had no valid importation licence? Most serious first.'],
  ['Standardise names', '', 'Find clearance lines whose "Chemical (Standard)" is "Other / Unspecified" or blank, and use standardise_chemicals to suggest the right standard name for each (with the record ID). Do not change anything; list the suggestions.'],
  ['Monthly summary', '', 'Write a short summary of this month\'s CMU activity: licences issued, clearances (number and MT), bills and payments (US$), compared with last month. End with three points for management.'],
];
const MODELS = [['', 'Model: as set by the admin'], ['auto', 'Auto (cheapest)'], ['claude-sonnet-5-5', 'Sonnet 5.5 – balanced'], ['claude-opus-5-5', 'Opus 5.5 – most capable'], ['claude-haiku-4-5-20251001', 'Haiku 4.5 – fastest']];

export function ClaudeChat({ session, snap, go, flash, online }) {
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('');
  const end = useRef(null);
  useEffect(() => { getMeta('claudeChat', []).then(m => setMsgs(m || [])); }, []);
  useEffect(() => { setMeta('claudeChat', msgs.slice(-40)); end.current && end.current.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  const server = snap.server || {};
  const attach = async how => { try { setFile(how === 'cam' ? await scanDocumentPhoto() : await pickDocument()); } catch (e) { if (!/cancel/i.test(e.message)) flash(e.message); } };
  const send = async (text, needFile) => {
    text = String(text || q).trim(); if (!text || busy) return;
    if (needFile && !file) { flash('Attach the document first (📎 or 📷).'); return; }
    if (session.demo) { flash('Claude needs your CMU database (not sample mode).'); return; }
    if (!(await isOnline())) { flash('Claude needs a network connection.'); return; }
    const hist = msgs.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: 'user', content: (file ? `📎 ${file.name}\n` : '') + text }]); setQ(''); setBusy(true);
    const f = file; setFile(null);
    try {
      const r = await askClaude(session, hist, text, f, model);
      setMsgs(m => [...m, { role: 'assistant', content: r.reply, forms: r.forms || [], usage: r.usage }]);
    } catch (e) { setMsgs(m => [...m, { role: 'error', content: e.message }]); }
    setBusy(false);
  };
  return (<>
    <Header title="✨ Ask Claude" sub="Questions, documents, data checks" right={<button className="ghost small" onClick={() => { if (confirm('Start a new conversation?')) setMsgs([]); }}>New</button>} />
    {!session.demo && !server.ai && <Card tone="warn"><p className="small">Claude is not set up on the database yet. An admin adds the Anthropic API key in More ▸ Admin (or in the sheet: Claude ▸ Settings).</p></Card>}
    <Actions><button className="primary" onClick={() => go('read')}>📄 Read a document into a form</button><button onClick={() => go('list', { kind: 'inbox', filter: 'open' })}>📥 Document Inbox ({(snap.tables.inbox || []).filter(r => ['To review', 'Needs attention', 'Not read'].includes(r['Status'])).length})</button></Actions>
    {!msgs.length && <Card><p>Ask about the database in plain words, or tell Claude what to record – it opens the form filled in for you to check and save. For example:</p>
      <ul className="small"><li>“Record US$1,600 from LIPFOCO, receipt 4471, for BN-2026-021”</li><li>“Which companies cleared sodium cyanide this year?”</li><li>“Summarise Bea Mountain’s licences and bills”</li></ul></Card>}
    <div className="chat">
      {msgs.map((m, i) => <div key={i} className={'msg ' + m.role}>
        <div className="bubble">{m.content}</div>
        {(m.forms || []).map((f, j) => <div key={j} className="formcard"><b>✨ {FORM_LABEL[f.form] || f.form} form filled</b>{(f.warnings || []).length > 0 && <small className="warns">{f.warnings.join(' • ')}</small>}
          <button className="primary" onClick={() => go('form', { form: f.form, preset: { ...fromAi(f.form, f.data), fromClaude: true } })}>Open the form to check and save</button></div>)}
        {m.usage && <small className="cost">{String(m.usage.model || '').replace('claude-', '').replace('-20251001', '')} · US${(m.usage.cost || 0).toFixed(3)} · month US${(m.usage.month || 0).toFixed(2)}{m.usage.budget ? ' of ' + m.usage.budget : ''}</small>}
      </div>)}
      {busy && <div className="msg assistant"><div className="bubble dots">{file ? 'Reading the document' : 'Thinking'}</div></div>}
      <div ref={end} />
    </div>
    <div className="quickp">{QUICK.map(([l, k, p]) => <button key={l} onClick={() => send(p, k === 'doc')} disabled={busy}>{l}</button>)}</div>
    <div className="composer card">
      {file && <div className="att">📎 {file.name} <button className="ghost small" onClick={() => setFile(null)}>✕</button></div>}
      <textarea rows={3} value={q} onChange={e => setQ(e.target.value)} placeholder="Ask Claude… e.g. Record US$1,600 from LIPFOCO, receipt 4471, for BN-2026-021" />
      <div className="linehead"><span><button className="ghost" onClick={() => attach('file')} aria-label="Attach">📎</button><button className="ghost" onClick={() => attach('cam')} aria-label="Photo">📷</button></span>
        <Select value={model} onChange={setModel} options={MODELS.slice(1).map(([v, l]) => ({ value: v, label: l }))} blank={MODELS[0][1]} />
        <button className="primary" disabled={busy || !q.trim() || !online} onClick={() => send()}>Send</button></div>
    </div>
  </>);
}

/* ---------------- read a document (photo / PDF) → the right form, via the Document Inbox */
export function ReadDoc({ session, go, flash, online }) {
  const [file, setFile] = useState(null);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const pick = async how => { try { setFile(how === 'cam' ? await scanDocumentPhoto() : await pickDocument()); setRes(null); } catch (e) { if (!/cancel/i.test(e.message)) flash(e.message); } };
  const read = async () => {
    if (session.demo) return flash('Reading documents needs your CMU database (not sample mode).');
    setBusy(true);
    try { setRes(await readDocument(session, file, hint)); } catch (e) { flash(e.message); }
    setBusy(false);
  };
  const open = form => go('form', { form, preset: { ...fromAi(form, res.data), inboxId: res.fid, aiConf: res.confidence, aiIssues: res.issues } });
  return (<>
    <Header title="Read a document" sub="Invoice, B/L, licence application, receipt…" back={() => go(-1)} />
    <Card className="form">
      <p className="small">Claude reads the document and fills the matching form – clearance, licence, payment, bill or company. You check it and save. The file is kept in the Drive folder <b>CMU Inbox</b> and listed on the Document Inbox.</p>
      <Actions><button className="primary" onClick={() => pick('cam')}>📷 Take a photo</button><button onClick={() => pick('file')}>📎 Choose PDF / image</button></Actions>
      {file && <p className="okbox">📎 {file.name}{file.size ? ` (${Math.round(file.size / 1024)} KB)` : ''}</p>}
      <Field label="Note for Claude (optional)" hint="e.g. “this is a CIL application” or “payment for BN-2026-021”"><input value={hint} onChange={e => setHint(e.target.value)} /></Field>
      <button className="primary wide big" disabled={!file || busy || !online} onClick={read}>{busy ? 'Claude is reading…' : online ? 'Read it' : 'Needs a network connection'}</button>
    </Card>
    {res && <Card tone={res.confidence >= 0.6 ? 'ok' : 'warn'} title={`${FORM_LABEL[res.type] || 'Other document'} · ${Math.round((res.confidence || 0) * 100)}% sure`}>
      <p><b>{res.company || 'Company not found'}</b><br />{res.summary}</p>
      {(res.issues || []).length > 0 && <ul className="warns">{res.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      <Actions>
        {['clearance', 'licence', 'payment', 'bill', 'company'].includes(res.type) && <button className="primary" onClick={() => open(res.type)}>Open the {FORM_LABEL[res.type].toLowerCase()} form</button>}
        {res.type !== 'clearance' && <button onClick={() => open('clearance')}>As a clearance</button>}
        {res.type !== 'licence' && <button onClick={() => open('licence')}>As a licence</button>}
        {res.type !== 'payment' && <button onClick={() => open('payment')}>As a payment</button>}
      </Actions>
    </Card>}
  </>);
}
