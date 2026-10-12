import { useMemo, useState } from 'react';
import { Header, Card, Field, Combo, Select, Pill, Row, Empty, Actions } from './ui';
import { money, amountInWords, feeLine, eq, daysUntil, suggestChem, matches, by } from '../lib/util';
import { scanQR } from '../lib/device';
import { verifyCode, isOnline } from '../lib/api';
import { rowsOf } from './Records';
import { AddChem } from './Forms';

/* ---------------- check a printed licence / clearance / bill */
function idFromCode(code) {
  const s = String(code || '');
  const m = s.match(/[?&]id=([^&]+)/) || s.toUpperCase().match(/((?:LIC|CLN)-\d{3,}|BN-\d{4}-\d{3,})-[0-9A-F]{10}\b/);
  return m ? decodeURIComponent(m[1]).toUpperCase() : '';
}
const kindOf = id => (/^CLN/.test(id) ? 'clearances' : /^BN-/.test(id) ? 'bills' : 'licences');
export function Verify({ session, snap, go, flash }) {
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = async c => {
    c = String(c || code).trim(); if (!c) return;
    setCode(c); setBusy(true); setRes(null);
    try {
      if (session.demo || !(await isOnline())) throw Object.assign(new Error('offline'), { offline: true });
      setRes(await verifyCode(session, c));
    } catch (e) {
      if (e.server) flash(e.message);
      const id = idFromCode(c), k = kindOf(id);
      const local = id && rowsOf(snap, k).find(r => eq(k === 'licences' ? r['Record ID'] : r.no, id)) ? { kind: k, id } : null;
      // offline: the code can still be compared with the codes downloaded at the last sync
      const want = id && (snap.codes[k === 'licences' ? 'licence' : k === 'clearances' ? 'clearance' : 'bill'] || {})[id];
      const tok = (String(c).match(/[?&]t=([0-9A-Fa-f]+)/) || [])[1] || (String(c).toUpperCase().match(/-([0-9A-F]{10})\b/) || [])[1];
      setRes({ offline: true, id, local, match: want && tok ? want.endsWith(String(tok).toUpperCase()) : null });
    }
    setBusy(false);
  };
  const scan = async () => { try { const c = await scanQR(); if (c) check(c); } catch (e) { if (!/cancel/i.test(e.message || '')) flash('Scanner: ' + (e.message || e)); } };
  const rec = res && res.genuine ? rowsOf(snap, kindOf(res.id)).find(r => eq(kindOf(res.id) === 'licences' ? r['Record ID'] : r.no, res.id)) : null;
  return (<>
    <Header title="Check a document" sub="Licences, clearance letters and bills carry a CMU QR code" back={() => go(-1)} />
    <button className="primary wide big" onClick={scan} disabled={busy}>📷 Scan the QR code</button>
    <div className="card form">
      <Field label="…or type the code" hint='Printed under the QR code, e.g. LIC-067-1A2B3C4D5E'><input value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" /></Field>
      <button className="wide" disabled={busy || !code.trim()} onClick={() => check()}>{busy ? 'Checking…' : 'Check'}</button>
    </div>
    {res && res.genuine && <Card tone={res.valid ? 'ok' : 'warn'}>
      <h3 className="verdict">✔ GENUINE – {res.status}</h3>
      {res.lines.map((l, i) => <p key={i} className="vline">{l}</p>)}
      {rec && rec['Expiry Date'] && (() => { const d = daysUntil(rec['Expiry Date']); return <p><Pill tone={d < 0 ? 'bad' : d <= 60 ? 'warn' : 'ok'}>{d < 0 ? 'Expired' : d + ' days left'}</Pill></p>; })()}
      <button className="link" onClick={() => go('detail', { kind: kindOf(res.id), id: res.id })}>Open the record</button>
    </Card>}
    {res && !res.offline && !res.genuine && <Card tone="bad"><h3 className="verdict">✖ NOT RECOGNISED</h3><p>{res.message}</p><p className="small">Keep the document and report it to the CMU.</p></Card>}
    {res && res.offline && <Card tone={res.match === false ? 'bad' : 'warn'}><h3 className="verdict">{res.match === true ? '✔ Code matches the downloaded copy' : res.match === false ? '✖ Code does not match' : 'No network – authenticity not checked'}</h3>
      <p>{res.match === true ? 'The code matches the verification code downloaded at the last sync. Check again online for today\'s status.' : res.match === false ? 'This code is not the one the database issued for this record. Treat the document as suspicious.' : 'The genuineness check needs the server.'}
        {' '}{res.local ? 'The record exists in the downloaded copy.' : res.id ? `${res.id} is not in the downloaded copy.` : 'This is not a CMU code.'}</p>
      {res.local && <button className="link" onClick={() => go('detail', res.local)}>Open {res.id}</button>}</Card>}
  </>);
}

/* ---------------- fee estimate (Qp = R × Hi × Qi) */
const blank = () => ({ std: '', qty: '', unit: 'kg', hmis: '', cat: '' });
export function Fee({ snap, go, lines: preset, clearance }) {
  const [lines, setLines] = useState(preset && preset.length ? preset : [blank()]);
  const H = snap.hazards;
  const set = (i, k, v) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const calc = lines.map(l => (l.std ? feeLine(H, l) : null));
  const total = calc.reduce((a, c) => a + (c && c.fee ? c.fee : 0), 0);
  const ok = calc.filter(Boolean).every(c => c.fee !== null);
  return (<>
    <Header title="Fee calculator" sub="RI/C&E-002-04/20 · Qp = R × Hi × Qi" back={() => go(-1)} />
    {!H.rows.length && <p className="warnbox">The Chemical Hazards table has not been downloaded yet – sync first.</p>}
    {lines.map((l, i) => {
      const c = calc[i];
      return (
        <div className="card form" key={i}>
          <div className="linehead"><b>Chemical {i + 1}</b>{lines.length > 1 && <button className="ghost small" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>Remove</button>}</div>
          <Field label="Chemical (Standard)"><Combo id="fchem" value={l.std} onChange={v => set(i, 'std', v)} options={H.rows.map(r => r.name)} /></Field>
          <div className="two">
            <Field label="Quantity"><input inputMode="decimal" value={l.qty} onChange={e => set(i, 'qty', e.target.value)} /></Field>
            <Field label="Unit"><Select value={l.unit} onChange={v => set(i, 'unit', v)} options={['kg', 'L', 'MT']} blank={null} /></Field>
          </div>
          {c && (c.hmis === null || !c.catName || !H.cats.some(x => eq(x[0], c.catName))) && <div className="two">
            <Field label="HMIS rating (from the SDS)"><Select value={l.hmis} onChange={v => set(i, 'hmis', v)} options={['0', '1', '2', '3', '4']} /></Field>
            <Field label="Fee category"><Select value={l.cat} onChange={v => set(i, 'cat', v)} options={H.cats.map(x => x[0])} /></Field>
          </div>}
          {c && <p className={c.fee !== null ? 'okbox' : 'warnbox'}>
            {c.row ? `HMIS ${c.hmis ?? '—'} · ${c.catName || 'no category'}${c.row.notes ? ' · ' + c.row.notes : ''}` : 'Not in the Chemical Hazards list.'}<br />
            {c.fee !== null ? <b>{c.working}</b> : c.note}</p>}
          {c && !c.row && <AddChem name={l.std} snap={snap} go={go} />}
        </div>
      );
    })}
    <button className="wide" onClick={() => setLines(ls => [...ls, blank()])}>+ Add chemical</button>
    <Card tone="info"><div className="kv"><span>Estimated total</span><b className="big">US${money(total)}</b></div>
      {total > 0 && <p className="small">{amountInWords(total)} UNITED STATES DOLLARS</p>}
      <p className="small muted">Estimate from the Chemical Hazards sheet as downloaded at the last sync. Rates: {H.cats.map(c => `${c[0]} US$${c[2]}/${c[1]}`).join(' · ')}.</p></Card>
    {total > 0 && ok && clearance && <button className="primary wide" onClick={() => go('form', { form: 'bill', preset: { company: clearance.co, type: 'Chemical Clearance', linked: clearance.no,
      lines: [{ service: 'Chemical Clearance', details: lines.filter(l => l.std).map(l => `${l.std} ${l.qty} ${l.unit}`).join(', '), amount: Math.round(total * 100) / 100 }] } })}>🧾 Bill this amount</button>}
  </>);
}

/* ---------------- standard chemical names (clearance lines "Other / Unspecified" or not standardised) */
export function Standardise({ snap, go }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => snap.tables.clearances.filter(r => !r['Chemical (Standard)'] || /other|unspecified/i.test(r['Chemical (Standard)']))
    .map(r => ({ r, s: suggestChem(snap.lists.chemicals.filter(c => !/other/i.test(c)), r['Chemical as Recorded'], 2) })).filter(x => matches(x.r, q)).sort(by(x => x.s[0] ? x.s[0].score : 0, true)), [snap, q]);
  return (<>
    <Header title="Standardise names" sub="Clearance lines without a standard chemical name" back={() => go(-1)} />
    <input className="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
    {rows.map(({ r, s }) => <Card key={r['Record ID']}>
      <div className="linehead"><b>{r['Chemical as Recorded']}</b><small>{r['Record ID']}</small></div>
      <small className="muted">{r['Clearance No.']} · {r['Company Name']} · now: {r['Chemical (Standard)'] || 'blank'}</small>
      <p className="small">Suggested: {s.filter(x => x.score >= 0.3).map(x => `${x.name} (${Math.round(x.score * 100)}%)`).join(', ') || 'no close match'}</p>
      <button className="link left" onClick={() => go('detail', { kind: 'clearances', id: r['Clearance No.'] })}>Open {r['Clearance No.']} to edit</button>
    </Card>)}
    {!rows.length && <Empty>Every clearance line has a standard name.</Empty>}
  </>);
}
