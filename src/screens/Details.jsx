// Record screens: company 360°, licence, clearance, bill, payment, issue, inspection, correspondence — with every action
// the desktop has (edit, delete, official print with QR, create bill, record payment, renew, profile, share).
import { useMemo, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Btn, Card, Icon, IconBtn, Row, Badge, KV, Empty, Note, Sheet, Seg, Select, Toggle, Text, Meter, confirm, alertBox, useBusy, Kpi } from '../components/ui';
import { Donut, HBars } from '../components/charts';
import { alertBadge, ageBadge } from './Home';
import { licBadge, billBadge } from './Registers';
import { money, usd, fmtD, num, str, trim, toDate, iso, days, today, amountInWords, companyProfile, lineHazard, feeCalc, billLineFor, billedAlready, topN, eqi, clearanceGroups } from '../lib/logic';
import { profilePdf, recordPdf } from '../lib/exporter';
import { contactLink, openUrl, saveToDocuments, saveAndShare, shareText } from '../lib/device';
import { db, uuid } from '../lib/db';

/* ------------------------------------------------------------------ shared */
/** a record opened under its provisional number (saved offline) is found again under the number the database gave it */
function useRid(id) {
  const { outbox } = useApp();
  const ok = outbox.find(o => o.status === 'ok' && o.tempId && o.tempId === id && o.resultId && o.resultId !== id);
  return ok ? ok.resultId : id;
}
function Missing({ what }) { return <><Bar title={what} /><main className="main noNav"><div className="wrap"><Empty icon="search" title="Record not found">It may have been deleted, or the registers need a sync.</Empty></div></main></>; }
export function useDelete() {
  const { precheck, save, toast } = useApp(), nav = useNav();
  return async (type, id, label) => {
    const c = precheck(type, 'delete', id, {});
    if (c.error) return alertBox({ title: 'Cannot delete', message: c.error });
    const ok = await confirm({ title: `Delete ${id}?`, message: `${label || id} will be permanently deleted from the register${c.warnings?.length ? '' : '.'}`, list: c.warnings, ok: 'Delete', danger: true });
    if (!ok) return;
    await save(type, 'delete', id, {}, { force: !!c.warnings?.length });
    toast(`${id} deleted`, 'ok'); nav.back();
  };
}
/** the official letter from the database's print page (with QR), saved on the phone and shared */
export function OfficialPdf({ kind, id, extra = {}, onClose, title }) {
  const { server, L, prefs, setPref, toast } = useApp();
  const [sig, setSig] = useState(prefs.signatory || '');
  const [lh, setLh] = useState(prefs.letterhead !== false);
  const [sal, setSal] = useState('');
  const [busy, run] = useBusy();
  const [done, setDone] = useState(null);
  const make = () => run(async () => {
    setPref('signatory', sig); setPref('letterhead', lh);
    const r = await server('pdf', { kind, id, signatory: sig || undefined, letterhead: lh, salutation: kind === 'bill' && sal ? sal : undefined, ...extra });
    await db.docs.put({ id: uuid(), kind, ref: id || extra.month || extra.year || extra.company || '', name: r.name, base64: r.base64, url: r.url, created: new Date().toISOString() });
    let uri = ''; try { uri = await saveToDocuments(r.name, r.base64); } catch { /* web */ }
    setDone({ ...r, uri });
    if (r.warnings) toast('Check: ' + r.warnings, 'warn', 6000); else toast('PDF ready', 'ok');
  });
  const letter = ['licence', 'clearance', 'bill'].includes(kind);
  return (
    <Sheet title={title || 'Official PDF'} onClose={onClose}>
      {!done ? <>
        <div className="small muted mb">Made by the CMU Database itself from its print page{letter ? ' – the same letter as on the desktop, with the QR verification code' : ''}. Needs a network connection.</div>
        {letter ? <>
          <Select label="Signed by" value={sig} onChange={setSig} options={L.signatories.map(s => ({ value: s.key, label: `${s.key}${s.name ? ' – ' + s.name : ''}` }))} placeholder="As set on the print page" />
          <Toggle label="Print the letterhead and logos" value={lh} onChange={setLh} />
          {kind === 'bill' ? <Text label="Salutation (optional)" value={sal} onChange={setSal} placeholder="e.g. Dear Mr. Kollie" /> : null}
        </> : null}
        <Btn block kind="accent" icon="pdf" disabled={busy} onClick={make}>{busy ? 'Making the PDF… (up to a minute)' : 'Make the PDF'}</Btn>
      </> : <>
        <Note kind="ok">{done.name} is ready{done.uri ? ' and saved in Documents ▸ CMU Database' : ''}. A copy is also in the database’s Drive folder “CMU Database – Print Output”.</Note>
        <div className="btns">
          <Btn icon="share" onClick={() => saveAndShare(done.name, done.base64, 'application/pdf', { base64: true })}>Share / print</Btn>
          {done.url ? <Btn kind="ghost" icon="link" onClick={() => openUrl(done.url)}>Open in Drive</Btn> : null}
        </div>
      </>}
    </Sheet>
  );
}
function MoreMenu({ items, onClose }) {
  return <Sheet title="More actions" onClose={onClose}><div className="list">{items.filter(Boolean).map(([ic, t, fn, s, tone]) => <Row key={t} icon={ic} iconTone={tone} t1={t} t2={s} onClick={() => { onClose(); fn(); }} />)}</div></Sheet>;
}
const Actions = ({ children }) => <div className="stickybar">{children}</div>;
const pendingNote = r => (r && r._pending ? <Note icon="upload">Saved on this phone – waiting to upload{r._status === 'confirm' ? ' (needs your OK in More ▸ Uploads)' : r._status === 'conflict' ? ' (changed on the desktop – see More ▸ Uploads)' : r._status === 'error' ? ' (problem – see More ▸ Uploads)' : ''}.</Note> : null);

/* ------------------------------------------------------------------ company */
export function CompanyView({ id: id0 }) {
  const id = useRid(id0);
  const { T, D, Q, canEdit, allowDelete, isAdmin } = useApp(), nav = useNav(), del = useDelete();
  const P = useMemo(() => companyProfile(T, id, D, Q), [T, id, D, Q]);
  const [tab, setTab] = useState('lic');
  const [menu, setMenu] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [busy, run] = useBusy();
  if (!P) return <Missing what="Company" />;
  const c = P.co, ct = P.contact || {};
  const email = ct['Email (several: separate with ;)'], phone = ct['Phone'];
  const groups = clearanceGroups({ clearances: P.clr });
  return (
    <>
      <Bar title={P.name} sub={`${id} · ${c['Sector / Activity'] || 'company'}`} right={<IconBtn n="more" label="More" onClick={() => setMenu(true)} />} />
      <main className="main noNav">
        <div className="hero" style={{ paddingTop: 10 }}>
          <div className="kpis" style={{ marginBottom: 0 }}>
            <Kpi l="Balance" v={usd(P.balance > 0 ? P.balance : 0)} s={`${usd(P.billed)} billed · ${usd(P.paid)} paid`} tone={P.outstanding > 0 ? 'orange' : 'green'} onClick={() => setTab('bills')} />
            <Kpi l="Licences" v={P.lic.length} s={`${P.active} active · ${P.expired} expired`} tone={P.expired ? 'red' : 'green'} onClick={() => setTab('lic')} />
            <Kpi l="Cleared this year" v={money(P.kgYr / 1000, 1) + ' MT'} s={`${money(P.kgAll / 1000, 1)} MT all records`} onClick={() => setTab('clr')} />
            <Kpi l="Quotas" v={P.quotas.length} s={`${P.quotas.filter(q => q.status === 'OVER QUOTA').length} over · ${P.quotas.filter(q => q.status.startsWith('Near')).length} near`} tone={P.quotas.some(q => q.status === 'OVER QUOTA') ? 'red' : ''} onClick={() => setTab('quota')} />
          </div>
        </div>
        <div className="wrap">
          {pendingNote(c)}
          <Card title="Details" right={canEdit ? <button className="more" onClick={() => nav.go('form', { type: 'company', op: 'update', id })}>Edit</button> : null}>
            <KV items={[['Company ID', id], ['Sector / activity', c['Sector / Activity']], ['Location', c['Location']], ['Other names', c['Other Names Recorded']]]} />
          </Card>
          <Card title="Contact" right={<button className="more" onClick={() => nav.go('form', { type: 'contact', op: 'update', id })}>{ct['Contact Person'] || email || phone ? 'Edit' : 'Add'}</button>}>
            {ct['Contact Person'] || email || phone ? <KV items={[['Person', ct['Contact Person']], ['Email', email], ['Phone', phone], ['Reminders', ct['Send reminders?'] || 'Yes'], ['Last reminder', fmtD(ct['Last reminder sent'])]]} /> : <div className="small muted">No contact yet – add one for reminders, calls and WhatsApp.</div>}
            <div className="btns mt">
              {phone ? <Btn sm kind="ghost" icon="phone" onClick={() => contactLink('call', phone)}>Call</Btn> : null}
              {phone ? <Btn sm kind="ghost" icon="whatsapp" onClick={() => contactLink('whatsapp', phone)}>WhatsApp</Btn> : null}
              {email ? <Btn sm kind="ghost" icon="mail" onClick={() => contactLink('mail', String(email).split(/[;,\s]+/)[0])}>Email</Btn> : null}
              {c['Location'] ? <Btn sm kind="ghost" icon="map" onClick={() => contactLink('map', c['Location'] + ', Liberia')}>Map</Btn> : null}
            </div>
          </Card>
          {canEdit ? <div className="actions" style={{ marginBottom: 12 }}>
            {[['badge', 'Licence', () => nav.go('form', { type: 'licence', op: 'create', prefill: { company: P.name, location: c['Location'] } })], ['flask', 'Clearance', () => nav.go('form', { type: 'clearance', op: 'create', prefill: { company: P.name } }), ''],
              ['receipt', 'Bill', () => nav.go('billWizard', { company: P.name }), 'o'], ['pin', 'Inspection', () => nav.go('form', { type: 'inspection', op: 'create', prefill: { company: P.name, site: c['Location'] } }), 'g']]
              .map(([ic, l, fn, t]) => <button key={l} className={'act ' + (t || '')} onClick={fn}><span className="ai"><Icon n={ic} s={20} /></span>New {l.toLowerCase()}</button>)}
          </div> : null}
          <div className="chips">{[['lic', `Licences ${P.lic.length}`], ['bills', `Bills ${P.bills.length}`], ['pays', `Payments ${P.pays.length}`], ['clr', `Clearances ${groups.length}`], ['quota', `Quotas ${P.quotas.length}`], ['insp', `Inspections ${P.inspections.length}`], ['corr', `Letters ${P.correspondence.length}`], ['mail', `Emails ${P.emails.length}`]]
            .map(([k, l]) => <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === 'lic' ? <div className="list">{P.lic.length ? P.lic.map(x => { const r = T.licences.find(l => l['Record ID'] === x.id) || {}; return <Row key={x.id} icon="badge" t1={x.type || x.cat} t2={`${x.id}${x.no ? ' · ' + x.no : ''}`} t3={x.expiry ? 'Expires ' + fmtD(x.expiry) : x.status} right={licBadge(r, D)} pending={r._pending} onClick={() => nav.go('licence', { id: x.id })} />; }) : <Empty icon="badge" title="No licences" />}</div> : null}
          {tab === 'bills' ? <div className="list">{P.bills.length ? P.bills.map(b => <Row key={b.no} icon="receipt" t1={`${b.no} · ${usd(b.billed)}`} t2={b.type || b.purpose.join(', ')} t3={fmtD(b.date) + (b.isPaid ? '' : ' · outstanding ' + usd(b.out))} right={billBadge(b)} onClick={() => nav.go('bill', { id: b.no })} />) : <Empty icon="receipt" title="No bills" />}</div> : null}
          {tab === 'pays' ? <div className="list">{P.pays.length ? P.pays.map(p => <Row key={p['Record ID']} icon="cash" t1={`${usd(p['Amount (USD)'])} · ${fmtD(p['Payment Date'])}`} t2={`${p['Record ID']} · Receipt ${p['Receipt No.'] || '–'} · ${p['Bill No.'] || 'no bill'}`} t3={p['Purpose / Services']} pending={p._pending} onClick={() => nav.go('payment', { id: p['Record ID'] })} />) : <Empty icon="cash" title="No payments" />}</div> : null}
          {tab === 'clr' ? <>
            {Object.keys(P.byChem).length ? <Card title="Quantity by chemical (MT)"><HBars items={topN(P.byChem, 8).map(x => ({ ...x, value: x.value / 1000 }))} fmt={v => money(v, 2)} /></Card> : null}
            <div className="list">{groups.length ? groups.sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0)).map(g => <Row key={g.no} icon="flask" t1={`${g.no} · ${money(g.kg / 1000, 2)} MT`} t2={g.lines.map(l => l['Chemical (Standard)'] || l['Chemical as Recorded']).join(', ')} t3={fmtD(g.date)} pending={g.pending} onClick={() => nav.go('clearance', { id: g.no })} />) : <Empty icon="flask" title="No clearances" />}</div>
          </> : null}
          {tab === 'quota' ? <div className="list">{P.quotas.length ? P.quotas.map((x, i) => <div key={i} className="row" style={{ display: 'block' }}><div className="flex between"><span className="t1">{x.ch.name}</span><Badge tone={x.status === 'OVER QUOTA' ? 'red' : x.status.startsWith('Near') ? 'amber' : x.status === 'OK' ? 'green' : ''}>{x.status}</Badge></div>
            <div className="t2 small muted">{x.lic.id} {x.lic.no} · {money(x.basis)} of {x.ch.limit === null ? '–' : money(x.ch.limit)} kg{x.ch.perMonth ? ' per month' : ''}</div>{x.pct !== null ? <div className="mt"><Meter pct={x.pct} /></div> : null}</div>) : <Empty icon="scale" title="No import quotas" >Quotas come from the chemicals and quantities on Chemical Importation Licences.</Empty>}</div> : null}
          {tab === 'insp' ? <div className="list">{P.inspections.length ? P.inspections.map(i => <Row key={i['Inspection ID']} icon="pin" t1={i['Site / Facility']} t2={`${i['Inspection ID']} · ${fmtD(i['Inspection Date'])}`} t3={i['Findings']} right={i['Compliance'] ? <Badge>{i['Compliance']}</Badge> : ''} onClick={() => nav.go('inspection', { id: i['Inspection ID'] })} />) : <Empty icon="pin" title="No inspections" />}</div> : null}
          {tab === 'corr' ? <div className="list">{P.correspondence.length ? P.correspondence.map(r => <Row key={r['Record ID']} icon="mail" t1={r['Type']} t2={`${r['Record ID']} · ${fmtD(r['Date Issued'])}`} t3={r['Description']} onClick={() => nav.go('correspondence', { id: r['Record ID'] })} />) : <Empty icon="mail" title="No letters">Reminder letters, violation and shutdown notices.</Empty>}</div> : null}
          {tab === 'mail' ? <div className="list">{P.emails.length ? P.emails.map((e, i) => <Row key={i} icon="mail" t1={e.subject} t2={`${e.dir} · ${fmtD(e.date)}`} t3={e.snippet} />) : <Empty icon="mail" title="No emails logged">Switch on the Gmail email log in Admin.</Empty>}</div> : null}
        </div>
      </main>
      {menu ? <MoreMenu onClose={() => setMenu(false)} items={[
        ['pdf', 'Company profile (PDF on the phone)', () => run(() => profilePdf(P)), 'Works offline'],
        ['print', 'Company profile (official, from the database)', () => setPdf(true), 'Same as Company Profile ▸ Save as PDF'],
        canEdit && ['edit', 'Edit company', () => nav.go('form', { type: 'company', op: 'update', id })],
        ['user', 'Edit contact', () => nav.go('form', { type: 'contact', op: 'update', id })],
        ['share', 'Share summary', () => shareText(P.name, `${P.name} (${id})\n${c['Sector / Activity'] || ''} – ${c['Location'] || ''}\nLicences: ${P.lic.length} (${P.active} active)\nBilled ${usd(P.billed)} · Paid ${usd(P.paid)} · Balance ${usd(P.balance)}`)],
        canEdit && allowDelete && ['trash', 'Delete company', () => del('company', id, P.name), 'Only if no record uses it', 'red'],
      ]} /> : null}
      {pdf ? <OfficialPdf kind="profile" extra={{ company: P.name }} title="Company profile – official PDF" onClose={() => setPdf(false)} /> : null}
      {busy ? <div className="toast">Making the PDF…</div> : null}
    </>
  );
}

/* ------------------------------------------------------------------ licence */
export const printableLicence = l => /\(CIL\)|\(CRL\)/i.test(l['Licence Category']) || !l['Licence Category'] || /Retention/i.test(l['Licence / Certificate Type']) || /\(EDL\)|Effluent/i.test(l['Licence Category']);
export function LicenceView({ id: id0 }) {
  const id = useRid(id0);
  const { T, D, Q, L, canEdit, allowDelete } = useApp(), nav = useNav(), del = useDelete();
  const [menu, setMenu] = useState(false), [pdf, setPdf] = useState(false);
  const [busy, run] = useBusy();
  const l = T.licences.find(x => x['Record ID'] === id);
  if (!l) return <Missing what="Licence" />;
  const a = D.licences.find(x => x.id === id) || {};
  const chems = T.licenceChemicals.filter(x => x['Licence Record ID'] === id), veh = (T.licenceVehicles || []).filter(x => x['Licence Record ID'] === id), eff = (T.licenceEffluent || []).filter(x => x['Licence Record ID'] === id);
  const quotas = Q.rows.filter(x => x.lic.id === id);
  const bills = D.bills.filter(b => b.linked.toUpperCase().includes(id.toUpperCase()));
  const sec = s => eff.filter(x => x.Section === s).sort((p, q) => num(p.Line) - num(q.Line));
  const renew = () => nav.go('form', { type: 'licence', op: 'create', prefill: { company: l['Company Name'], category: l['Licence Category'], type: l['Licence / Certificate Type'], location: l['Location'],
    applicationDate: iso(today()), issued: '', expiry: '', remarks: `Renewal of ${id}${l['Licence / Certificate No.'] ? ' (' + l['Licence / Certificate No.'] + ')' : ''}`,
    chemicals: chems.map(x => ({ name: x['Trade or IUPAC Name'], epaReg: x['EPA Registration No.'], type: x['Type'], qty: str(x['Stipulated Qty']), unit: x['Unit'], consignment: '' })),
    vehicles: veh.map(v => ({ type: v['Vehicle Type'], reg: v['Vehicle Registration No.'], epaReg: v['EPA Registration No.'] })) } });
  const makeBill = async () => {
    if (billedAlready(T, id) && !(await confirm({ title: 'Already billed', message: `${id} has already been billed. Create another bill line for it?`, ok: 'Continue' }))) return;
    nav.go('form', { type: 'bill', op: 'create', fromIds: [id] });
  };
  const status = a.expiry ? (a.days < 0 ? (a.renewed ? 'Renewed' : `Expired ${-a.days} day(s) ago`) : `Valid – ${a.days} day(s) left`) : l.Status;
  const tone = a.expiry ? (a.days < 0 ? (a.renewed ? 'mid' : 'bad') : a.days <= 60 ? 'mid' : 'good') : 'mid';
  return (
    <>
      <Bar title={l['Company Name']} sub={`${id} · ${l['Licence Category'] || 'Licence'}`} right={<IconBtn n="more" label="More" onClick={() => setMenu(true)} />} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(l)}
        <div className={'verdict ' + tone}><Icon n={tone === 'good' ? 'check' : 'warn'} s={30} /><h2>{status}</h2><div className="small">{l['Licence / Certificate Type']}{l['Licence / Certificate No.'] ? ' · ' + l['Licence / Certificate No.'] : ''}</div></div>
        <Card title="Licence / certificate">
          <KV items={[['Company', <a key="c" onClick={() => nav.go('company', { id: l['Company ID'] })}>{l['Company Name']}</a>], ['Category', l['Licence Category']], ['Type', l['Licence / Certificate Type']], ['Licence No.', l['Licence / Certificate No.']],
            ['Reference code', l['Reference Code']], ['Location', l['Location']], ['Application date', fmtD(l['Application Date'])], ['Response date', fmtD(l['Response Date'])], ['Date issued', fmtD(l['Date Issued'])], ['Expiry date', fmtD(l['Expiry Date'])],
            ['Status', l.Status], ['Remarks', l['Remarks']], ['Source', l['Source']]]} />
        </Card>
        {chems.length || /\(CRL\)|\(CIL\)/i.test(l['Licence Category']) ? <Card title={`Chemicals (${chems.length})`} pad={false}>
          {chems.length ? chems.map((x, i) => { const q = quotas.find(r => r.ch.name === x['Trade or IUPAC Name']); return (
            <div key={i} className="row" style={{ display: 'block' }}>
              <div className="flex between"><span className="t1" style={{ whiteSpace: 'normal' }}>{x['Trade or IUPAC Name']}</span>{x['Stipulated Qty'] !== '' ? <b className="nowrap">{money(x['Stipulated Qty'], 0)} {x['Unit']}</b> : null}</div>
              <div className="t2">{[x['EPA Registration No.'], x['Type'], x['Consignment Ref. (BL/IPD No.)']].filter(Boolean).join(' · ')}</div>
              {q && q.ch.limit !== null ? <div className="mt"><div className="flex between small"><span className="muted">Cleared {money(q.basis)} kg{q.ch.perMonth ? ' (busiest month)' : ''}</span><Badge tone={q.status === 'OVER QUOTA' ? 'red' : q.status.startsWith('Near') ? 'amber' : 'green'}>{Math.round(q.pct * 100)}%</Badge></div><Meter pct={q.pct} /></div> : null}
            </div>); }) : <div className="bd small muted">No chemicals recorded on this licence.</div>}
        </Card> : null}
        {veh.length ? <Card title={`Vehicles (${veh.length})`} pad={false}>{veh.map((v, i) => <Row key={i} icon="truck" t1={`${v['Vehicle Type']} ${v['Vehicle Registration No.']}`} t2={v['EPA Registration No.']} />)}</Card> : null}
        {eff.length ? <Card title="Effluent details (EDL)">
          {sec('Setting').length ? <KV items={sec('Setting').map(x => [x['Field 1'], x['Field 2']])} /> : null}
          {sec('Limit').length ? <><div className="small b muted mt mb">Discharge limits</div><div className="tscroll"><table className="tbl"><thead><tr><th>Parameter</th><th>Unit</th><th>Limit</th><th>Sample</th><th>Schedule</th><th>Stage</th></tr></thead>
            <tbody>{sec('Limit').map((x, i) => <tr key={i}><td>{x['Field 1']}</td><td>{x['Field 2']}</td><td>{x['Field 3']}</td><td>{x['Field 4']}</td><td>{x['Field 5']}</td><td>{x['Field 6']}</td></tr>)}</tbody></table></div></> : null}
          {sec('Coordinate').length ? <><div className="small b muted mt mb">Geo-reference</div><table className="tbl"><thead><tr><th>Table</th><th>Vertex</th><th>Easting</th><th>Northing</th></tr></thead><tbody>{sec('Coordinate').map((x, i) => <tr key={i}><td>{x['Field 1']}</td><td>{x['Field 2']}</td><td>{x['Field 3']}</td><td>{x['Field 4']}</td></tr>)}</tbody></table></> : null}
          {sec('Source').length ? <><div className="small b muted mt mb">Discharge sources</div><table className="tbl"><thead><tr><th>Source</th><th>Receiving unit</th><th>X</th><th>Y</th></tr></thead><tbody>{sec('Source').map((x, i) => <tr key={i}><td>{x['Field 1']}</td><td>{x['Field 2']}</td><td>{x['Field 3']}</td><td>{x['Field 4']}</td></tr>)}</tbody></table></> : null}
        </Card> : null}
        <Card title="Bills for this licence" pad={false}>{bills.length ? bills.map(b => <Row key={b.no} icon="receipt" t1={`${b.no} · ${usd(b.billed)}`} t2={b.type} right={billBadge(b)} onClick={() => nav.go('bill', { id: b.no })} />) : <div className="bd small muted">Not billed yet.{canEdit ? ' Use “Create bill”.' : ''}</div>}</Card>
      </div></main>
      <Actions>
        {canEdit ? <Btn kind="ghost" icon="edit" onClick={() => nav.go('form', { type: 'licence', op: 'update', id })}>Edit</Btn> : null}
        {printableLicence(l) ? <Btn icon="print" onClick={() => setPdf(true)}>Print</Btn> : canEdit ? <Btn icon="receipt" onClick={makeBill}>Create bill</Btn> : null}
      </Actions>
      {menu ? <MoreMenu onClose={() => setMenu(false)} items={[
        canEdit && ['receipt', 'Create bill', makeBill, 'Adds a bill line with the service and suggested fee'],
        canEdit && ['refresh', 'Renew', renew, 'New licence for the same company, type and chemicals'],
        printableLicence(l) && ['print', 'Official licence PDF', () => setPdf(true), 'From the print page, with QR code'],
        ['pdf', 'Record summary PDF', () => run(() => recordPdf(`Licence ${id} – ${l['Company Name']}`, [{ kv: [['Company', l['Company Name']], ['Category', l['Licence Category']], ['Type', l['Licence / Certificate Type']], ['Licence No.', l['Licence / Certificate No.']], ['Reference', l['Reference Code']], ['Issued', fmtD(l['Date Issued'])], ['Expires', fmtD(l['Expiry Date'])], ['Status', l.Status], ['Remarks', l['Remarks']]] },
          chems.length && { title: 'CHEMICALS', table: { head: ['Trade / IUPAC name', 'EPA Reg. No.', 'Type', 'Qty', 'Unit', 'Consignment'], body: chems.map(x => [x['Trade or IUPAC Name'], x['EPA Registration No.'], x['Type'], str(x['Stipulated Qty']), x['Unit'], x['Consignment Ref. (BL/IPD No.)']]) } }].filter(Boolean))), 'Works offline'],
        ['building', 'Open company', () => nav.go('company', { id: l['Company ID'] })],
        ['share', 'Share', () => shareText(`Licence ${id}`, `${l['Company Name']}\n${l['Licence / Certificate Type'] || l['Licence Category']}\nLicence No.: ${l['Licence / Certificate No.'] || '–'}\nIssued ${fmtD(l['Date Issued']) || '–'} · Expires ${fmtD(l['Expiry Date']) || '–'}\nStatus: ${status}`)],
        canEdit && allowDelete && ['trash', 'Delete licence', () => del('licence', id, `${l['Company Name']} – ${l['Licence / Certificate Type'] || ''} (and its chemicals, vehicles and effluent details)`), '', 'red'],
      ]} /> : null}
      {pdf ? <OfficialPdf kind="licence" id={id} title={`Print ${id}`} onClose={() => setPdf(false)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ clearance */
export function ClearanceView({ id: id0 }) {
  const id = useRid(id0);
  const { T, Q, L, canEdit, allowDelete } = useApp(), nav = useNav(), del = useDelete();
  const [menu, setMenu] = useState(false), [pdf, setPdf] = useState(false);
  const [busy, run] = useBusy();
  const lines = T.clearances.filter(x => x['Clearance No.'] === id);
  const fee = useMemo(() => feeCalc(lines.filter(l => trim(l['Qty as Recorded']) !== '').map(l => ({ chemical: l['Chemical as Recorded'], chemical_standard: l['Chemical (Standard)'] && !/other/i.test(l['Chemical (Standard)']) ? l['Chemical (Standard)'] : '', quantity: l['Qty as Recorded'], unit: l['Unit'] })), T.hazards || [], L.chemicals, L.hazardCats, L.hazardIndex), [lines, T.hazards, L]);
  if (!lines.length) return <Missing what="Clearance" />;
  const h = lines[0], kg = lines.reduce((a, l) => a + num(l['Qty (kg)']), 0);
  const qRows = Q.rows.filter(x => x.ch.lines.some(ln => ln.no === id)), notOn = Q.notOn.filter(x => x.line.no === id), noLic = Q.noLic.filter(x => x.no === id);
  const bills = T.bills.filter(b => String(b['Linked Record']).toUpperCase().includes(id)).map(b => b['Bill No.']).filter((v, i, a) => a.indexOf(v) === i);
  const makeBill = async () => {
    if (billedAlready(T, id) && !(await confirm({ title: 'Already billed', message: `${id} has already been billed. Create another bill line for it?`, ok: 'Continue' }))) return;
    nav.go('form', { type: 'bill', op: 'create', fromIds: [id], prefill: { type: 'Chemical Clearance' }, feeLines: fee.total > 0 ? fee : null });
  };
  return (
    <>
      <Bar title={h['Company Name']} sub={`${id} · ${lines.length} chemical line(s)`} right={<IconBtn n="more" label="More" onClick={() => setMenu(true)} />} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(h)}
        <div className="kpis">
          <Kpi l="Total" v={money(kg / 1000, 3) + ' MT'} s={money(kg, 0) + ' kg (kg & MT lines)'} />
          <Kpi l="Fee estimate" v={fee.total ? usd(fee.total) : '–'} s={fee.missing ? `${fee.missing} line(s) need HMIS / category` : 'RI/C&E-002-04/20'} tone={fee.missing ? 'amber' : 'green'} onClick={() => nav.go('fee', { clearance: id })} />
        </div>
        {notOn.length || noLic.length || qRows.some(x => x.status === 'OVER QUOTA') ? <Note kind="warn"><b>Licence / quota check</b><ul>
          {qRows.filter(x => x.status === 'OVER QUOTA').map((x, i) => <li key={'q' + i}>{x.ch.name}: {money(x.basis)} kg of {money(x.ch.limit)} kg ({Math.round(x.pct * 100)}%) on {x.lic.id}</li>)}
          {notOn.map((x, i) => <li key={'n' + i}>{x.line.rec || x.line.std} is not on licence {x.lic.id} {x.lic.no}</li>)}
          {noLic.length ? <li>No Chemical Importation Licence valid on {fmtD(h['Clearance Date'])} for {noLic.length} line(s)</li> : null}</ul></Note> : null}
        <Card title="Clearance">
          <KV items={[['Company', <a key="c" onClick={() => nav.go('company', { id: h['Company ID'] })}>{h['Company Name']}</a>], ['Clearance No.', id], ['Clearance date', fmtD(h['Clearance Date'])], ['EPA Ref. No.', h['Clearance Ref. No.'] || <span className="muted">– none (needed on the letter)</span>],
            ['ETA', toDate(h['ETA']) ? fmtD(h['ETA']) : h['ETA']], ['Remarks', h['Remarks']], ['Bill(s)', bills.join(', ')], ['Source', h['Source']]]} />
        </Card>
        <Card title="Chemicals" pad={false}>
          {lines.map((l, i) => { const hz = lineHazard(l['Chemical (Standard)'], l['Qty as Recorded'], l['Unit'], T.hazards || [], L.hazardCats); return (
            <div key={i} className="row" style={{ display: 'block' }}>
              <div className="flex between"><span className="t1" style={{ whiteSpace: 'normal' }}>{l['Chemical as Recorded']}</span><b className="nowrap">{money(l['Qty as Recorded'], String(l['Qty as Recorded']).includes('.') ? 3 : 0)} {l['Unit']}</b></div>
              <div className="t2">{l['Record ID']} · {l['Chemical (Standard)'] || <span style={{ color: 'var(--amber)' }}>no standard name</span>}{l['B/L / Invoice / AWB No.'] ? ' · B/L ' + l['B/L / Invoice / AWB No.'] : ''}</div>
              {hz ? <div className="small" style={{ marginTop: 3, color: hz.level === 'bad' ? 'var(--red)' : hz.level === 'warn' ? 'var(--amber)' : 'var(--muted)' }}>{hz.text}</div> : null}
            </div>); })}
        </Card>
      </div></main>
      <Actions>
        {canEdit ? <Btn kind="ghost" icon="edit" onClick={() => nav.go('form', { type: 'clearance', op: 'update', id })}>Edit</Btn> : null}
        <Btn icon="print" onClick={() => setPdf(true)}>Print letter</Btn>
      </Actions>
      {menu ? <MoreMenu onClose={() => setMenu(false)} items={[
        canEdit && ['receipt', 'Create bill', makeBill, 'Clearance bill with the fee estimate'],
        ['print', 'Official clearance letter (PDF)', () => setPdf(true), 'With QR code'],
        ['calc', 'Fee calculation', () => nav.go('fee', { clearance: id })],
        ['pdf', 'Record summary PDF', () => run(() => recordPdf(`Clearance ${id} – ${h['Company Name']}`, [{ kv: [['Company', h['Company Name']], ['Date', fmtD(h['Clearance Date'])], ['EPA Ref. No.', h['Clearance Ref. No.']], ['ETA', h['ETA']], ['Total', money(kg) + ' kg']] },
          { title: 'CHEMICALS', table: { head: ['Record', 'As recorded', 'Standard', 'Qty', 'Unit', 'B/L'], body: lines.map(l => [l['Record ID'], l['Chemical as Recorded'], l['Chemical (Standard)'], str(l['Qty as Recorded']), l['Unit'], l['B/L / Invoice / AWB No.']]) } }])), 'Works offline'],
        canEdit && ['copy', 'Copy as a new clearance', () => nav.go('form', { type: 'clearance', op: 'create', prefill: { company: h['Company Name'], date: iso(today()), lines: lines.map(l => ({ rec: l['Chemical as Recorded'], std: l['Chemical (Standard)'], qty: '', unit: l['Unit'], bl: '' })) } })],
        canEdit && allowDelete && ['trash', 'Delete clearance', () => del('clearance', id, `${h['Company Name']} – ${lines.length} chemical line(s)`), '', 'red'],
      ]} /> : null}
      {pdf ? <OfficialPdf kind="clearance" id={id} title={`Clearance letter ${id}`} onClose={() => setPdf(false)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ bill */
export function BillView({ id: id0 }) {
  const id = useRid(id0);
  const { T, D, canEdit, allowDelete } = useApp(), nav = useNav(), del = useDelete();
  const [menu, setMenu] = useState(false), [pdf, setPdf] = useState(false);
  const [busy, run] = useBusy();
  const b = D.bills.find(x => x.no === id);
  if (!b) return <Missing what="Bill" />;
  const pays = T.payments.filter(p => p['Bill No.'] === id);
  const contact = (T.contacts || []).find(c => c['Company ID'] === b.coId) || {};
  const phone = contact['Phone'];
  const reminder = `Dear ${b.contact || contact['Contact Person'] || 'Sir / Madam'},\n\nThis is a courtesy reminder from the Chemical Management Unit, EPA Liberia: bill ${b.no}${b.ref ? ' (Ref. ' + b.ref + ')' : ''} dated ${fmtD(b.date)} for ${b.co} has an outstanding balance of ${usd(b.out)}.\n\nKindly settle it and share the receipt so we can update our records. If you have already paid, please disregard this message.\n\nChemical Management Unit, ERRS Department, EPA Liberia`;
  return (
    <>
      <Bar title={b.co} sub={`${id} · ${b.type || 'Bill'}`} right={<IconBtn n="more" label="More" onClick={() => setMenu(true)} />} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(b.lines[0])}
        <div className={'verdict ' + (b.isPaid ? 'good' : b.paid > 0 ? 'mid' : 'bad')}>
          <div className="small b">{b.isPaid ? 'PAID' : b.paid > 0 ? 'PART PAID' : 'UNPAID'}{b.companyAcct ? ' (company account)' : ''}</div>
          <h2>{usd(b.billed)}</h2><div className="small">{b.isPaid ? 'Fully paid' : `Outstanding ${usd(b.out)}`}{b.age !== null ? ` · ${b.age} days since the bill date` : ''}</div>
        </div>
        <Card title="Bill">
          <KV items={[['Company', <a key="c" onClick={() => nav.go('company', { id: b.coId })}>{b.co}</a>], ['Bill No.', id], ['Bill date', fmtD(b.date)], ['Bill type', b.type || <span style={{ color: 'var(--red)' }}>missing – the letter cannot print</span>], ['Bill Ref. No.', b.ref],
            ['Contact', [b.contact, b.title].filter(Boolean).join(', ')], ['Location', b.lines[0]['Location']], ['Activity', b.lines[0]['Activity']], ['Linked record(s)', b.linked], ['Paid on this bill', usd(b.paid)], ['Status', b.status]]} />
        </Card>
        <Card title="Services" pad={false}>
          <div className="bd" style={{ paddingTop: 4 }}><table className="tbl"><thead><tr><th>Service</th><th className="n">US$</th></tr></thead>
            <tbody>{b.lines.map((l, i) => <tr key={i}><td><b>{l['Purpose / Licence Billed']}</b>{l['Chemical'] ? <div className="small muted">{l['Chemical']}</div> : null}<div className="tiny faint">{l['Bill ID']}</div></td><td className="n">{money(l['Amount Billed (USD)'])}</td></tr>)}</tbody>
            <tfoot><tr><td>TOTAL</td><td className="n">{money(b.billed)}</td></tr></tfoot></table>
            <div className="small muted mt"><b>In words:</b> {amountInWords(b.billed)} UNITED STATES DOLLARS</div></div>
        </Card>
        <Card title={`Payments (${pays.length})`} pad={false}>
          {pays.length ? pays.map(p => <Row key={p['Record ID']} icon="cash" t1={`${usd(p['Amount (USD)'])} · ${fmtD(p['Payment Date'])}`} t2={`${p['Record ID']} · Receipt ${p['Receipt No.'] || '–'}`} pending={p._pending} onClick={() => nav.go('payment', { id: p['Record ID'] })} />) : <div className="bd small muted">No payment linked to this bill yet.</div>}
        </Card>
      </div></main>
      <Actions>
        {canEdit && !b.isPaid ? <Btn kind="green" icon="cash" onClick={() => nav.go('form', { type: 'payment', op: 'create', prefill: { bill: id, amount: String(b.out), purpose: b.purpose.join(', ') } })}>Record payment</Btn> : null}
        <Btn icon="print" onClick={() => setPdf(true)}>Print bill</Btn>
      </Actions>
      {menu ? <MoreMenu onClose={() => setMenu(false)} items={[
        ['print', 'Official bill letter (PDF)', () => setPdf(true), 'From the Print Bill page'],
        canEdit && ['edit', 'Edit bill', () => nav.go('form', { type: 'bill', op: 'update', id })],
        !b.isPaid && phone && ['whatsapp', 'Send reminder by WhatsApp', () => window.open('https://wa.me/' + String(phone).replace(/[^\d]/g, '') + '?text=' + encodeURIComponent(reminder), '_system')],
        !b.isPaid && ['share', 'Share payment reminder', () => shareText('Payment reminder ' + id, reminder)],
        ['pdf', 'Record summary PDF', () => run(() => recordPdf(`Bill ${id} – ${b.co}`, [{ kv: [['Company', b.co], ['Bill date', fmtD(b.date)], ['Type', b.type], ['Ref.', b.ref], ['Total', usd(b.billed)], ['Paid', usd(b.paid)], ['Outstanding', usd(b.out)]] },
          { title: 'SERVICES', table: { head: ['Service', 'Details', 'US$'], body: b.lines.map(l => [l['Purpose / Licence Billed'], l['Chemical'], money(l['Amount Billed (USD)'])]), opts: { foot: ['TOTAL', '', money(b.billed)] } } }, { text: 'In words: ' + amountInWords(b.billed) + ' UNITED STATES DOLLARS' }])), 'Works offline'],
        canEdit && allowDelete && ['trash', 'Delete bill', () => del('bill', id, `${b.co} – ${b.lines.length} line(s), ${usd(b.billed)}`), pays.length ? 'Payments are linked!' : '', 'red'],
      ]} /> : null}
      {pdf ? <OfficialPdf kind="bill" id={id} title={`Bill letter ${id}`} onClose={() => setPdf(false)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ payment, issue, inspection, correspondence */
export function PaymentView({ id: id0 }) {
  const id = useRid(id0);
  const { T, canEdit, allowDelete } = useApp(), nav = useNav(), del = useDelete();
  const p = T.payments.find(x => x['Record ID'] === id);
  if (!p) return <Missing what="Payment" />;
  return (
    <>
      <Bar title={usd(p['Amount (USD)'])} sub={`${id} · ${p['Company Name']}`} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(p)}
        <Card title="Payment / receipt"><KV items={[['Company', <a key="c" onClick={() => nav.go('company', { id: p['Company ID'] })}>{p['Company Name']}</a>], ['Amount', usd(p['Amount (USD)'])], ['In words', amountInWords(p['Amount (USD)'])], ['Payment date', fmtD(p['Payment Date'])],
          ['Receipt No.', p['Receipt No.']], ['For bill', p['Bill No.'] ? <a key="b" onClick={() => nav.go('bill', { id: p['Bill No.'] })}>{p['Bill No.']}</a> : '–'], ['Purpose', p['Purpose / Services']], ['Record group', p['Record Group']], ['Remarks', p['Remarks']], ['Source', p['Source']]]} /></Card>
      </div></main>
      <Actions>
        {canEdit ? <Btn kind="ghost" icon="edit" onClick={() => nav.go('form', { type: 'payment', op: 'update', id })}>Edit</Btn> : null}
        <Btn kind="ghost" icon="share" onClick={() => shareText('Payment ' + id, `Payment received – EPA Liberia CMU\n${p['Company Name']}\n${usd(p['Amount (USD)'])} on ${fmtD(p['Payment Date'])}\nReceipt No. ${p['Receipt No.'] || '–'} · Bill ${p['Bill No.'] || '–'}\n${p['Purpose / Services'] || ''}`)}>Share</Btn>
        {canEdit && allowDelete ? <Btn kind="red" icon="trash" onClick={() => del('payment', id, `${p['Company Name']} – ${usd(p['Amount (USD)'])}`)} /> : null}
      </Actions>
    </>
  );
}
export function IssueView({ id: id0 }) {
  const id = useRid(id0);
  const { T, canEdit, allowDelete, save, toast } = useApp(), nav = useNav(), del = useDelete();
  const r = (T.issues || []).find(x => String(x['Issue #']) === String(id));
  if (!r) return <Missing what="Issue" />;
  const close = async () => { await save('issue', 'update', id, { register: r.Register, record: r.Record, issue: r['Issue Found'], action: r['Action Taken'], status: 'Closed', source: r.Source }); toast('Marked closed', 'ok'); };
  return (
    <>
      <Bar title={`Issue ${id}`} sub={r['Register']} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(r)}
        <Card title="Data issue"><KV items={[['Register', r['Register']], ['Record', r['Record']], ['Source', r['Source']], ['Issue found', r['Issue Found']], ['Action taken', r['Action Taken']], ['Follow-up status', r['Follow-up Status']]]} /></Card>
        {String(r['Record'] || '').split(/[,;\s]+/).filter(x => /^(LIC|CLN|CLR|BN|BIL|PAY|CMU)-/i.test(x)).map(x => <Btn key={x} kind="line" sm icon="link" onClick={() => nav.go(/^LIC/i.test(x) ? 'licence' : /^CL/i.test(x) ? 'clearance' : /^(BN|BIL)/i.test(x) ? 'bill' : /^PAY/i.test(x) ? 'payment' : 'company', { id: x.toUpperCase() })}>{x}</Btn>)}
      </div></main>
      <Actions>
        {canEdit ? <Btn kind="ghost" icon="edit" onClick={() => nav.go('form', { type: 'issue', op: 'update', id })}>Edit</Btn> : null}
        {canEdit && !/clos/i.test(r['Follow-up Status']) ? <Btn kind="green" icon="check" onClick={close}>Close</Btn> : null}
        {canEdit && allowDelete ? <Btn kind="red" icon="trash" onClick={() => del('issue', id)} /> : null}
      </Actions>
    </>
  );
}
export function InspectionView({ id: id0 }) {
  const id = useRid(id0);
  const { T, canEdit, allowDelete } = useApp(), nav = useNav(), del = useDelete();
  const r = (T.inspections || []).find(x => x['Inspection ID'] === id);
  if (!r) return <Missing what="Inspection" />;
  const photos = String(r['Photos'] || '').split(/\s+/).filter(x => /^https?:/.test(x));
  const has = r['Latitude'] !== '' && r['Latitude'] !== undefined;
  return (
    <>
      <Bar title={r['Company'] || r['Site / Facility']} sub={`${id} · ${fmtD(r['Inspection Date'])}`} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(r)}
        <Card title="Field inspection"><KV items={[['Company', r['Company']], ['Site / facility', r['Site / Facility']], ['Type', r['Inspection Type']], ['Linked record', r['Linked Record']], ['Compliance', r['Compliance']], ['Findings', r['Findings']], ['Actions required', r['Actions Required']],
          ['Follow-up date', fmtD(r['Follow-up Date'])], ['GPS', has ? `${r['Latitude']}, ${r['Longitude']} (±${r['GPS Accuracy (m)']} m)` : ''], ['Inspector', r['Inspector']], ['Recorded', r['Recorded']]]} /></Card>
        {has ? <Btn kind="line" block icon="map" onClick={() => openUrl(`https://www.google.com/maps/search/?api=1&query=${r['Latitude']},${r['Longitude']}`)}>Open the location in Maps</Btn> : null}
        {photos.length ? <Card title={`Photos (${photos.length})`} pad={false}>{photos.map((u, i) => <Row key={i} icon="camera" t1={`Photo ${i + 1}`} t2="Google Drive" onClick={() => openUrl(u)} />)}</Card> : null}
      </div></main>
      <Actions>
        {canEdit ? <Btn kind="ghost" icon="edit" onClick={() => nav.go('form', { type: 'inspection', op: 'update', id })}>Edit</Btn> : null}
        {canEdit && allowDelete ? <Btn kind="red" icon="trash" onClick={() => del('inspection', id)} /> : null}
      </Actions>
    </>
  );
}
export function CorrespondenceView({ id: id0 }) {
  const id = useRid(id0);
  const { T, canEdit, allowDelete } = useApp(), nav = useNav(), del = useDelete();
  const r = (T.correspondence || []).find(x => x['Record ID'] === id);
  if (!r) return <Missing what="Correspondence" />;
  return (
    <>
      <Bar title={r['Type'] || 'Correspondence'} sub={`${id} · ${r['Company Name']}`} />
      <main className="main noNav"><div className="wrap">
        {pendingNote(r)}
        <Card title="Correspondence"><KV items={[['Company', <a key="c" onClick={() => nav.go('company', { id: r['Company ID'] })}>{r['Company Name']}</a>], ['Type', r['Type']], ['Activity', r['Activity']], ['Description', r['Description']], ['EPA Reference No.', r['EPA Reference No.']], ['Date issued', fmtD(r['Date Issued'])]]} /></Card>
      </div></main>
      <Actions>
        {canEdit ? <Btn kind="ghost" icon="edit" onClick={() => nav.go('form', { type: 'correspondence', op: 'update', id })}>Edit</Btn> : null}
        {canEdit && allowDelete ? <Btn kind="red" icon="trash" onClick={() => del('correspondence', id)} /> : null}
      </Actions>
    </>
  );
}
