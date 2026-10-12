import { useEffect, useMemo, useState } from 'react';
import { Header, Card, Field, Select, Seg, Row, Empty, Actions, Chips } from './ui';
import { licenceDoc, clearanceDoc, billDoc, monthlyDoc, annualDoc, insightsDoc, quotaDoc, profileDoc, licenceKind, DOC_KINDS, signatories, billAddressee } from '../lib/docs';
import { presetFrom } from './Forms';
import { renderPdf, qrDataUrl } from '../lib/pdf';
import { sharePdf, keepPdf } from '../lib/device';
import { saveToDrive, isOnline } from '../lib/api';
import { ARMS, EPA } from '../lib/logos';
import { fmtD, money, matches, today, num, groupClearances } from '../lib/util';
import { rowsOf, display } from './Records';

/* ---------------- Print: pick a document type, then the record */
const PRINTS = [
  ['CRL', '🖨️', 'CRL Licence', 'Chemical Registration'], ['CIL', '🖨️', 'CIL Licence', 'Chemical Importation'], ['EDL', '🖨️', 'EDL Licence', 'Effluent Discharge'],
  ['EDLRP', '🖨️', 'EDL – Retention Pond', 'Effluent Discharge (pond)'], ['CERT', '🖨️', 'Other certificates', 'Fumigation, transport, dewatering'],
  ['CLR', '🖨️', 'Clearance Letter', 'Chemical clearance'], ['BILL', '🖨️', 'Bill Letter', 'Fee assessment / invoice'],
];
export function PrintHub({ go }) {
  return (<>
    <Header title="Print" sub="Certificates and letters (QR-verified)" back={() => go(-1)} />
    <div className="tiles">{PRINTS.map(([k, i, l, s]) => <button key={k} className="tile" onClick={() => go('pick', { doc: k })}><i>{i}</i><b>{l}</b><small>{s}</small></button>)}</div>
    <p className="muted small">Every printed document carries a QR code. Anyone who scans it sees from the live database whether it is genuine and still valid.</p>
  </>);
}
export function PickRecord({ doc, snap, go }) {
  const [q, setQ] = useState('');
  const kind = doc === 'CLR' ? 'clearances' : doc === 'BILL' ? 'bills' : 'licences';
  const rows = useMemo(() => rowsOf(snap, kind).filter(r => (kind !== 'licences' || licenceKind(r) === doc || (doc === 'EDLRP' && licenceKind(r) === 'EDL')) && matches(r, q)), [snap, kind, doc, q]);
  return (<>
    <Header title={DOC_KINDS[doc]} sub="Choose the record to print" back={() => go(-1)} />
    <input className="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
    {rows.slice(0, 150).map(r => { const d = display(kind, r), id = kind === 'licences' ? r['Record ID'] : r.no; return <Row key={id} title={d.title} sub={d.sub} badge={d.badge} right={d.right} onClick={() => go('doc', { doc, id })} />; })}
    {!rows.length && <Empty>No {kind} of this type.</Empty>}
  </>);
}

/* ---------------- one document: options, preview, PDF */
export function DocView({ doc, id, snap, session, go, flash, online, submit }) {
  const sigs = signatories(snap);
  const bill0 = doc === 'BILL' ? snap.insights.bills.find(x => x.no === id) : null, to0 = bill0 ? billAddressee(snap, bill0) : {};
  const [o, setO] = useState({ letterhead: true, qr: true, signer: '', deadline: /^yes$/i.test(String((snap.config.settings || {})['Payment deadline line on bills'] || '')), ym: prevMonth(), year: new Date().getFullYear(), target: '', contact: to0.contact || '', title: to0.title || '', address: to0.address || '' });
  const set = (k, v) => setO(x => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState('');
  const model = useMemo(() => {
    const opt = { ...o, signer: o.signer || undefined };
    switch (doc) {
      case 'CLR': return clearanceDoc(snap, session, id, opt);
      case 'BILL': return billDoc(snap, session, id, opt);
      case 'PROFILE': return profileDoc(snap, session, id);
      case 'MONTH': return monthlyDoc(snap, session, o.ym);
      case 'YEAR': return annualDoc(snap, session, Number(o.year), num(o.target));
      case 'INSIGHTS': return insightsDoc(snap, session);
      case 'QUOTA': return quotaDoc(snap, session);
      default: { const l = snap.tables.licences.find(x => x['Record ID'] === id); return l ? licenceDoc(snap, session, l, doc, opt) : null; }
    }
  }, [doc, id, snap, session, o]);
  if (!model) return (<><Header title="Document" back={() => go(-1)} /><Empty>The record was not found – sync and try again.</Empty></>);
  const isLetter = ['CLR', 'BILL', 'CRL', 'CIL', 'EDL', 'EDLRP', 'CERT'].includes(doc);
  const make = async how => {
    setBusy(how);
    try {
      const b64 = await renderPdf(model);
      if (how === 'share') await sharePdf(model.filename, b64);
      else if (how === 'keep') { const u = await keepPdf(model.filename, b64); flash(u ? 'Saved in Documents/CMU on this phone' : 'Downloaded'); }
      else if (how === 'drive') {
        if (!(await isOnline())) throw new Error('No network – try again with a signal.');
        const r = await saveToDrive(session, { name: model.filename, base64: b64, record: model.record || '' });
        flash('Saved in the Drive folder “CMU Documents”'); if (r.url) window.open(r.url, '_system');
      }
    } catch (e) { flash(e.message); }
    setBusy('');
  };
  const missing = isLetter && doc !== 'CLR' && doc !== 'BILL' ? licenceWarnings(snap, doc, id) : doc === 'BILL' ? billWarnings(snap, id) : [];
  return (<>
    <Header title={DOC_KINDS[doc] || model.title} sub={model.title} back={() => go(-1)} />
    <Card className="form">
      {isLetter && <>
        {sigs.length > 0 && <Field label="Signed by"><Select value={o.signer} onChange={v => set('signer', v)} options={sigs.map(s => ({ value: s['Signatory'], label: `${s['Signatory']} – ${s['Name']}` }))} blank="(default)" /></Field>}
        <div className="two">
          <Field label="Letterhead"><Seg value={o.letterhead ? 'y' : 'n'} onChange={v => set('letterhead', v === 'y')} options={[['y', 'Print it'], ['n', 'Pre-printed paper']]} /></Field>
          <Field label="QR code"><Seg value={o.qr ? 'y' : 'n'} onChange={v => set('qr', v === 'y')} options={[['y', 'Yes'], ['n', 'No']]} /></Field>
        </div>
        {doc === 'BILL' && <Field label="72-hour payment line"><Seg value={o.deadline ? 'y' : 'n'} onChange={v => set('deadline', v === 'y')} options={[['n', 'No'], ['y', 'Yes']]} /></Field>}
        {doc === 'BILL' && <>
          <h4>Addressed to</h4>
          <div className="two">
            <Field label="Contact person" hint="e.g. Mr. Isaac Bestman"><input value={o.contact} onChange={e => set('contact', e.target.value)} /></Field>
            <Field label="Position / title" hint="e.g. General Manager"><input value={o.title} onChange={e => set('title', e.target.value)} /></Field>
          </div>
          <Field label="Address" hint="Each line on its own row"><textarea rows={2} value={o.address} onChange={e => set('address', e.target.value)} /></Field>
          {bill0 && (o.contact !== (bill0.contact || '') || o.title !== (bill0.title || '') || o.address !== (bill0.location || '')) && submit &&
            <button type="button" className="link left" onClick={async () => { const p = presetFrom('bills', snap, id); if (!p) return; p.preset = { ...p.preset, contact: o.contact, title: o.title, location: o.address.replace(/\n/g, ', ') }; if (await submit('bill', p.preset)) flash('The addressee is saved on the bill'); }}>Save this addressee on the bill</button>}
          {!o.contact && <p className="warnbox">No contact person on this bill or the company – the letter starts with the company name. Type the name and position above, or add them to the company (Company ▸ Edit).</p>}
        </>}
        {doc === 'BILL' && <Field label="Salutation (optional)"><input value={o.salutation || ''} onChange={e => set('salutation', e.target.value)} placeholder="Dear Sir/Madam:" /></Field>}
      </>}
      {doc === 'MONTH' && <Field label="Report month"><input type="month" value={o.ym} onChange={e => set('ym', e.target.value)} /></Field>}
      {doc === 'YEAR' && <div className="two"><Field label="Report year"><input type="number" value={o.year} onChange={e => set('year', e.target.value)} /></Field>
        <Field label="Revenue target (US$, optional)"><input inputMode="decimal" value={o.target} onChange={e => set('target', e.target.value)} /></Field></div>}
      {missing.length > 0 && <p className="warnbox">{missing.join(' ')}</p>}
      {session.demo && <p className="infobox">Sample mode: the QR code is not verifiable.</p>}
      <Actions>
        <button className="primary" disabled={!!busy} onClick={() => make('share')}>{busy === 'share' ? 'Making the PDF…' : '🖨 Print / share PDF'}</button>
        <button disabled={!!busy} onClick={() => make('keep')}>{busy === 'keep' ? '…' : '⤓ Save on phone'}</button>
        {!session.demo && <button disabled={!!busy || !online} onClick={() => make('drive')}>{busy === 'drive' ? '…' : '☁ Save to Drive'}</button>}
      </Actions>
    </Card>
    <h2 className="sect">Preview</h2>
    <Preview model={model} />
  </>);
}
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function licenceWarnings(snap, doc, id) {
  const l = snap.tables.licences.find(x => x['Record ID'] === id), w = [];
  if (!l) return w;
  if (!l['Licence / Certificate No.']) w.push('No licence number yet.');
  if (!l['Date Issued'] || !l['Expiry Date']) w.push('Issue or expiry date missing.');
  if ((doc === 'CRL' || doc === 'CIL') && !snap.tables.licenceChemicals.some(c => c['Licence Record ID'] === id)) w.push('No chemicals on this licence – add them with Edit.');
  if ((doc === 'EDL' || doc === 'EDLRP') && !snap.tables.licenceEffluent.some(c => c['Licence Record ID'] === id)) w.push('No effluent details (receiving water, limits) – add them with Edit.');
  return w;
}
function billWarnings(snap, no) { const b = snap.insights.bills.find(x => x.no === no); return b && !b.ref ? ['No Bill Ref. No. – add it with Edit.'] : []; }

/** the document on screen – same model as the PDF */
export function Preview({ model }) {
  const [qr, setQr] = useState({});
  useEffect(() => {
    let live = true;
    model.blocks.filter(b => b.t === 'sign' && b.qr).forEach(b => qrDataUrl(b.qr.text).then(u => live && setQr(x => ({ ...x, [b.qr.text]: u }))));
    return () => { live = false; };
  }, [model]);
  const f = model.font === 'times' ? 'serif' : 'sans';
  return (
    <div className={`paper ${f}${model.landscape ? ' land' : ''}`}>
      {model.blocks.map((b, i) => {
        switch (b.t) {
          case 'letterhead': return <div key={i} className="lh"><img src={ARMS} alt="" /><div><b>{b.lines[0]}</b><b className="g">{b.lines[1]}</b>{b.lines.slice(2).map((x, j) => <span key={j}>{x}</span>)}</div><img src={EPA} alt="" /></div>;
          case 'office': return <div key={i} className="office"><b>{b.office}</b><span>{b.contact}</span></div>;
          case 'rhead': return <div key={i} className="rh"><small>ENVIRONMENTAL PROTECTION AGENCY OF LIBERIA</small><small className="m">{b.sub}</small><h2>{b.title}</h2></div>;
          case 'section': return <h4 key={i} className="sec">{b.text}</h4>;
          case 'text': return <p key={i} style={{ textAlign: b.align || 'left', fontWeight: b.bold ? 700 : 400, fontStyle: b.italic ? 'italic' : 'normal', fontSize: (b.size || 11) / 11 + 'em', marginLeft: (b.indent || 0) * 1.2, marginBottom: (b.gap ?? 2) * 1.6, textDecoration: b.underline ? 'underline' : 'none', whiteSpace: 'pre-wrap' }}>{b.text}</p>;
          case 'list': return <ol key={i} className="dl" style={{ marginLeft: (b.indent || 0) * 1.2 }}>{b.items.map(([n, x], j) => <li key={j}><span>{n}</span><p>{x}</p></li>)}</ol>;
          case 'table': return <div key={i} className="tw" style={{ marginLeft: (b.indent || 0) * 1.2 }}><table><thead><tr>{b.head.map((h, j) => <th key={j} style={{ width: (b.widths || [])[j] + '%' }}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.length ? b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={{ textAlign: (b.align || [])[k] || 'left' }}>{c}</td>)}</tr>) : <tr><td colSpan={b.head.length} className="muted">—</td></tr>}</tbody>
            {b.foot && <tfoot><tr>{b.foot.map((c, k) => <td key={k} style={{ textAlign: (b.align || [])[k] || 'left' }}>{c}</td>)}</tr></tfoot>}</table></div>;
          case 'kv': return <div key={i} className="pkv">{b.rows.map(([k, v], j) => <div key={j}><span>{k}</span><b>{v}</b></div>)}</div>;
          case 'twocol': return <div key={i} className="two2" style={{ fontWeight: b.bold ? 700 : 400 }}><span>{b.left}</span><span>{b.right}</span></div>;
          case 'sign': return <div key={i} className={'sig' + (b.left ? ' left' : '')}><div className="who"><span>_____________________________</span><b>{b.name}</b><small>{b.title}</small></div>
            {b.qr && <div className="qr">{qr[b.qr.text] ? <img src={qr[b.qr.text]} alt="QR" /> : <i />}<small>{b.qr.code ? 'Scan to verify · ' + b.qr.code : 'sample'}</small></div>}</div>;
          case 'chart': { const mx = Math.max(1, ...b.series[0]); return <div key={i} className="pchart"><small>{b.title}</small><div>{b.series[0].map((v, j) => <span key={j} title={String(v)}><i style={{ height: (v / mx) * 100 + '%' }} /><em>{b.labels[j]}</em></span>)}</div></div>; }
          case 'gap': return <div key={i} style={{ height: (b.h || 3) * 1.6 }} />;
          default: return null;
        }
      })}
    </div>
  );
}

/* ---------------- Reports hub */
export function ReportsHub({ go, snap }) {
  const items = [['dashboard', '📊', 'Dashboard', 'KPI cards, charts, year view'], ['insights', '🔔', 'Insights & Alerts', 'Expiring licences, unpaid bills'],
    ['doc:MONTH', '📅', 'Monthly Report', 'One page per month · PDF'], ['doc:YEAR', '📘', 'Annual Report', 'The year in figures · PDF'],
    ['quotas', '⚖️', 'Quota Tracker', 'Imports against licensed quantities'], ['profiles', '🏷️', 'Company Profile', 'Everything about one company'],
    ['reminders', '📇', 'Contacts & Reminders', 'Who is owed a reminder'], ['print', '🖨️', 'Print', 'Certificates and letters']];
  return (<>
    <Header title="Reports & tools" sub="Figures, alerts and documents" back={() => go(-1)} />
    <div className="tiles">{items.map(([k, i, l, s]) => <button key={k} className="tile" onClick={() => (k.startsWith('doc:') ? go('doc', { doc: k.slice(4) }) : go(k))}><i>{i}</i><b>{l}</b><small>{s}</small></button>)}</div>
  </>);
}
export function Profiles({ snap, go }) {
  const [q, setQ] = useState('');
  const rows = snap.tables.companies.filter(c => matches(c, q));
  return (<>
    <Header title="Company profile" sub="Pick a company" back={() => go(-1)} />
    <input className="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
    {rows.slice(0, 200).map(c => <Row key={c['Company ID']} title={c['Company Name']} sub={[c['Company ID'], c['Sector / Activity']].filter(Boolean).join(' · ')} onClick={() => go('detail', { kind: 'companies', id: c['Company ID'] })} />)}
  </>);
}
