import { useMemo, useState } from 'react';
import { Header, Card, Field, Combo, Select, Seg } from './ui';
import { today, money, num, isNum, eq, toKg, kgFmt, similarCompanies, suggestChem, groupClearances, addDays, parts } from '../lib/util';
import { getGps, takePhoto } from '../lib/device';

/* ================================================================ presets: a saved record → the form, for editing */
export function presetFrom(kind, snap, id) {
  const t = snap.tables;
  if (kind === 'companies' || kind === 'company') {
    const c = t.companies.find(r => r['Company ID'] === id); if (!c) return null;
    return { form: 'company', preset: { id, name: c['Company Name'], sector: c['Sector / Activity'], location: c['Location'], other: c['Other Names Recorded'], contact: c['Contact Person'], title: c['Contact Title'], phone: c['Phone'], email: c['Email'], remind: c['Send reminders?'] } };
  }
  if (kind === 'licences' || kind === 'licence') {
    const l = t.licences.find(r => r['Record ID'] === id); if (!l) return null;
    return { form: 'licence', preset: { id, ...licencePreset(snap, l) } };
  }
  if (kind === 'clearances' || kind === 'clearance') {
    const g = groupClearances(t.clearances.filter(r => r['Clearance No.'] === id))[0]; if (!g) return null;
    return { form: 'clearance', preset: { id, company: g.co, date: g.date, eta: g.eta, ref: g.ref, bl: g.bl, remarks: g.remarks, billNo: g.billNo,
      lines: g.lines.map(l => ({ rec: l['Chemical as Recorded'], std: l['Chemical (Standard)'], qty: l['Qty as Recorded'], unit: l['Unit'], bl: l['B/L / Invoice / AWB No.'] === g.bl ? '' : l['B/L / Invoice / AWB No.'] })) } };
  }
  if (kind === 'bills' || kind === 'bill') {
    const b = snap.insights.bills.find(x => x.no === id), ls = t.bills.filter(r => r['Bill No.'] === id); if (!b) return null;
    return { form: 'bill', preset: { id, company: b.co, date: b.date, type: b.type, ref: b.ref, contact: b.contact, title: b.title, location: b.location, activity: (ls[0] || {})['Activity'], linked: b.linked,
      lines: ls.map(l => ({ service: l['Purpose / Licence Billed'], details: l['Chemical'], amount: l['Amount Billed (USD)'] })) } };
  }
  if (kind === 'payments' || kind === 'payment') {
    const p = t.payments.find(r => r['Record ID'] === id); if (!p) return null;
    return { form: 'payment', preset: { id, bill: p['Bill No.'], company: p['Company Name'], amount: p['Amount (USD)'], date: p['Payment Date'], receipt: p['Receipt No.'], purpose: p['Purpose / Services'], group: p['Record Group'], remarks: p['Remarks'] } };
  }
  if (kind === 'issues' || kind === 'issue') {
    const i = t.issues.find(r => r['Issue #'] === id); if (!i) return null;
    return { form: 'issue', preset: { id, register: i['Register'], record: i['Record'], source: i['Source'], issue: i['Issue Found'], action: i['Action Taken'], status: i['Follow-up Status'] } };
  }
  if (kind === 'inspections' || kind === 'inspection') {
    const i = t.inspections.find(r => r['Inspection ID'] === id); if (!i) return null;
    return { form: 'inspection', preset: { id, company: i['Company'], site: i['Site / Facility'], date: i['Inspection Date'], type: i['Inspection Type'], linked: i['Linked Record'], compliance: i['Compliance'], findings: i['Findings'],
      actions: i['Actions Required'], followUp: i['Follow-up Date'], lat: i['Latitude'], lng: i['Longitude'], acc: i['GPS Accuracy (m)'], inspector: i['Inspector'] } };
  }
  if (kind === 'correspondence') {
    const c = t.correspondence.find(r => r['Record ID'] === id); if (!c) return null;
    return { form: 'correspondence', preset: { id, company: c['Company Name'] || c['Name as Recorded'], type: c['Type'], activity: c['Activity'], description: c['Description'], ref: c['EPA Reference No.'], date: c['Date'] } };
  }
  return null;
}
export function licencePreset(snap, l) {
  const t = snap.tables, id = l['Record ID'], eff = t.licenceEffluent.filter(e => e['Licence Record ID'] === id), set = k => (eff.find(e => e['Section'] === 'Setting' && eq(e['Field 1'], k)) || {})['Field 2'] || '';
  return { company: l['Company Name'], category: l['Licence Category'], type: l['Licence / Certificate Type'], location: l['Location'], appDate: l['Application Date'], respDate: l['Response Date'], ref: l['Reference Code'],
    no: l['Licence / Certificate No.'], issued: l['Date Issued'], expiry: l['Expiry Date'], remarks: l['Remarks'], billNo: l['Bill No.'], asRecorded: l['Name as Recorded'],
    chems: t.licenceChemicals.filter(c => c['Licence Record ID'] === id).map(c => ({ name: c['Trade or IUPAC Name'], reg: c['EPA Registration No.'], type: c['Type'], qty: c['Stipulated Qty'], unit: c['Unit'], cons: c['Consignment Ref. (BL/IPD No.)'] })),
    vehicles: t.licenceVehicles.filter(v => v['Licence Record ID'] === id).map(v => ({ type: v['Vehicle Type'], reg: v['Vehicle Registration No.'], epa: v['EPA Registration No.'] })),
    eff: { water: set('Receiving water'), volume: set('Max. volume (m³/day)'), point: set('Discharge point'),
      limits: eff.filter(e => e['Section'] === 'Limit').map(e => ({ param: e['Field 1'], unit: e['Field 2'], limit: e['Field 3'], sample: e['Field 4'], schedule: e['Field 5'], stage: e['Field 6'] })),
      coords: eff.filter(e => e['Section'] === 'Coordinate').map(e => ({ table: e['Field 1'], vertex: e['Field 2'], e: e['Field 3'], n: e['Field 4'] })),
      sources: eff.filter(e => e['Section'] === 'Source').map(e => ({ source: e['Field 1'], unit: e['Field 2'], x: e['Field 3'], y: e['Field 4'] })) } };
}
/** renew: same licence, next year, no number yet */
export function renewPreset(snap, l) {
  const p = licencePreset(snap, l), y = (parts(l['Expiry Date']) || parts(today())).y + 1;
  return { ...p, no: '', ref: '', billNo: '', appDate: today(), respDate: '', issued: `${y}-01-01`, expiry: `${y}-12-31`, remarks: `Renewal of ${l['Record ID']}${l['Licence / Certificate No.'] ? ' (' + l['Licence / Certificate No.'] + ')' : ''}`,
    chems: p.chems.map(c => ({ ...c, cons: '' })) };
}
/** what Claude read / filled → the app's form fields */
export function fromAi(form, d = {}) {
  if (form === 'company') return { name: d.name || d.company || '', sector: d.sector || '', location: d.location || '', other: d.other_names || '', contact: d.contact_person || '', title: d.contact_title || '', phone: d.phone || '', email: d.email || '' };
  if (form === 'licence') return { company: d.company || '', category: d.category || '', type: d.type || '', location: d.location || '', appDate: d.application_date || '', respDate: d.response_date || '', ref: d.reference_code || '',
    no: d.licence_no || '', issued: d.date_issued || '', expiry: d.expiry_date || '', remarks: d.remarks || '',
    chems: (d.chemicals || []).map(c => ({ name: c.name || '', reg: c.epa_registration_no || '', type: c.type || '', qty: c.quantity ?? '', unit: c.unit || '', cons: c.consignment_ref || '' })) };
  if (form === 'clearance') return { company: d.company || '', date: d.date || '', ref: d.epa_ref || '', bl: d.bl_no || '', remarks: d.remarks || '', eta: d.eta || '',
    lines: (d.lines || []).map(l => ({ rec: l.chemical_as_recorded || l.chemical_standard || '', std: l.chemical_standard || '', qty: l.quantity ?? '', unit: l.unit || '', bl: l.bl_no || '' })) };
  if (form === 'bill') return { company: d.company || '', date: d.date || '', type: d.bill_type || '', ref: d.bill_ref || '', contact: d.contact_person || '', title: d.contact_title || '', lines: (d.lines || []).map(l => ({ service: l.service || '', details: l.details || '', amount: l.amount ?? '' })) };
  if (form === 'payment') return { bill: d.bill_no || '', company: d.company || '', amount: d.amount ?? '', date: d.date || '', receipt: d.receipt_no || '', purpose: d.purpose || '', remarks: d.remarks || '' };
  if (form === 'issue') return { register: d.register || '', record: d.record || '', issue: d.issue || '', action: d.action || '' };
  return d;
}

/* ================================================================ shared */
function useForm(init) {
  const [v, setV] = useState(init);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  return { v, set, setV, err, setErr, busy, setBusy };
}
function Bar({ title, back, onSave, busy, sub }) {
  return <Header title={title} sub={sub} back={back} right={<button className="ghost small strong" disabled={busy} onClick={onSave}>{busy ? '…' : 'Save'}</button>} />;
}
function Done({ busy, onSave, label = 'Save' }) {
  return <button className="primary wide big" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : label}</button>;
}
const need = (v, keys) => Object.fromEntries(keys.filter(k => !String(v[k] ?? '').trim()).map(k => [k, 'Required']));
const Inbox = ({ preset }) => (preset && preset.inboxId ? <p className="infobox">📥 Filled from a document read by Claude{preset.aiConf ? ` (confidence ${Math.round(preset.aiConf * 100)}%)` : ''}. Check every value against the document before saving.{preset.aiIssues && preset.aiIssues.length ? <><br /><b>Claude noted:</b> {preset.aiIssues.join(' • ')}</> : null}</p>
  : preset && preset.fromClaude ? <p className="infobox">✨ Filled by Claude – nothing is saved until you check it and tap Save.</p> : null);
const coNames = snap => snap.tables.companies.map(c => c['Company Name']);
const coFix = (snap, name) => coNames(snap).find(n => eq(n, name)) || name;
/** a list of lines with add / remove */
function Lines({ title, items, setItems, blank, max, render, addLabel }) {
  const upd = (i, k, x) => { const patch = typeof k === 'object' ? k : { [k]: x }; setItems(items.map((l, j) => (j === i ? { ...l, ...patch } : l))); };
  return (<>
    {items.map((l, i) => (
      <div className="line" key={i}>
        <div className="linehead"><b>{title} {i + 1}</b>{items.length > 1 && <button type="button" className="ghost small" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>}</div>
        {render(l, (k, x) => upd(i, k, x), i)}
      </div>))}
    {items.length < max && <button type="button" className="wide" onClick={() => setItems([...items, blank()])}>{addLabel || `+ Add ${title.toLowerCase()}`}</button>}
  </>);
}

/* ================================================================ Company */
export function CompanyForm({ snap, submit, back, preset = {} }) {
  const F = useForm({ name: '', sector: '', location: '', other: '', contact: '', title: '', phone: '', email: '', remind: 'Yes', ...preset });
  const edit = !!preset.id;
  const exact = snap.tables.companies.find(c => eq(c['Company Name'], F.v.name) && c['Company ID'] !== preset.id);
  const similar = !edit && F.v.name.trim().length >= 4 && !exact ? similarCompanies(snap.tables.companies, F.v.name) : [];
  const save = async () => {
    const e = need(F.v, ['name']); if (exact) e.name = 'Already registered as ' + exact['Company ID'];
    F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('company', F.v); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Register company'} back={back} onSave={save} busy={F.busy} />
    <Inbox preset={preset} />
    <div className="card form">
      <Field label="Company name" req err={F.err.name}><input value={F.v.name} onChange={e => F.set('name', e.target.value)} /></Field>
      {similar.length > 0 && <p className="warnbox">Similar names already registered: {similar.map(s => `${s.name} (${s.id})`).join(', ')}. Check it is not the same company.</p>}
      <Field label="Sector / activity"><Combo id="sec" value={F.v.sector} onChange={x => F.set('sector', x)} options={snap.lists.sectors} /></Field>
      <Field label="Location"><input value={F.v.location} onChange={e => F.set('location', e.target.value)} /></Field>
      <Field label="Other names recorded" hint="Abbreviations or other spellings, separated by ;"><input value={F.v.other} onChange={e => F.set('other', e.target.value)} /></Field>
    </div>
    <h2 className="sect">Contact & reminders</h2>
    <div className="card form">
      <div className="two">
        <Field label="Contact person"><input value={F.v.contact} onChange={e => F.set('contact', e.target.value)} placeholder="e.g. Mr. Isaac Bestman" /></Field>
        <Field label="Position / title"><input value={F.v.title} onChange={e => F.set('title', e.target.value)} placeholder="e.g. General Manager" /></Field>
      </div>
      <Field label="Phone"><input type="tel" value={F.v.phone} onChange={e => F.set('phone', e.target.value)} placeholder="+231 …" /></Field>
      <Field label="Email" hint="Several: separate with ;"><input type="email" value={F.v.email} onChange={e => F.set('email', e.target.value)} autoCapitalize="off" /></Field>
      <Field label="Send reminder e-mails?"><Seg value={F.v.remind || 'Yes'} onChange={x => F.set('remind', x)} options={[['Yes', 'Yes'], ['No', 'No']]} /></Field>
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Register company'} />
    </div>
  </>);
}

/* ================================================================ Licence / certificate */
const blankChem = () => ({ name: '', reg: '', type: '', qty: '', unit: 'kg', cons: '' });
const blankLimit = () => ({ param: '', unit: 'mg/L', limit: '', sample: '', schedule: '', stage: '' });
export function LicenceForm({ snap, submit, back, preset = {}, go }) {
  const thisY = new Date().getFullYear();
  const F = useForm({ company: '', category: '', type: '', location: '', appDate: '', respDate: '', ref: '', no: '', issued: `${thisY}-01-01`, expiry: `${thisY}-12-31`, remarks: '', billNo: '',
    ...preset, chems: preset.chems && preset.chems.length ? preset.chems : [], vehicles: preset.vehicles || [],
    eff: { water: '', volume: '', point: '', limits: [], coords: [], sources: [], ...(preset.eff || {}) } });
  const edit = !!preset.id, c = `${F.v.category} ${F.v.type}`;
  const isCil = /importation|CIL/i.test(c), isChem = isCil || /registration|CRL/i.test(c), isEdl = /effluent|EDL|dewatering|pond/i.test(c), isRp = /pond/i.test(c), isTr = /transport/i.test(c);
  const setEff = (k, x) => F.setV(o => ({ ...o, eff: { ...o.eff, [k]: x } }));
  const co = snap.tables.companies.find(r => eq(r['Company Name'], F.v.company));
  const save = async () => {
    const e = need(F.v, ['company', 'category', 'type']);
    if (F.v.company && !co) e.company = 'Not registered – register the company first';
    F.setErr(e); if (Object.keys(e).length) return window.scrollTo(0, 0);
    F.setBusy(true);
    const d = { ...F.v, company: coFix(snap, F.v.company), chems: F.v.chems.filter(x => x.name.trim()), vehicles: F.v.vehicles.filter(x => x.type || x.reg) };
    const ok = await submit('licence', d); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Licence / certificate'} sub="CRL · CIL · EDL · permits" back={back} onSave={save} busy={F.busy} />
    <Inbox preset={preset} />
    <div className="card form">
      <Field label="Company" req err={F.err.company}><Combo id="lco" value={F.v.company} onChange={x => { F.set('company', x); const r = snap.tables.companies.find(q => eq(q['Company Name'], x)); if (r && !F.v.location) F.set('location', r['Location'] || ''); }} options={coNames(snap)} /></Field>
      <div className="two">
        <Field label="Licence category" req err={F.err.category}><Select value={F.v.category} onChange={x => F.set('category', x)} options={snap.lists.categories} /></Field>
        <Field label="Licence / certificate type" req err={F.err.type}><Select value={F.v.type} onChange={x => F.set('type', x)} options={snap.lists.types} /></Field>
      </div>
      <Field label="Location" hint="Site address"><input value={F.v.location} onChange={e => F.set('location', e.target.value)} /></Field>
      <div className="two">
        <Field label="Application date"><input type="date" value={F.v.appDate} onChange={e => F.set('appDate', e.target.value)} /></Field>
        <Field label="Response date"><input type="date" value={F.v.respDate} onChange={e => F.set('respDate', e.target.value)} /></Field>
      </div>
      <Field label="Reference code" hint="e.g. ED/EPA-01/075/26/RL"><input value={F.v.ref} onChange={e => F.set('ref', e.target.value)} /></Field>
      <Field label="Licence / certificate No." hint="Leave blank if not yet issued (status = Pending)"><input value={F.v.no} onChange={e => F.set('no', e.target.value)} /></Field>
      <div className="two">
        <Field label="Date issued"><input type="date" value={F.v.issued} onChange={e => F.set('issued', e.target.value)} /></Field>
        <Field label="Expiry date"><input type="date" value={F.v.expiry} onChange={e => F.set('expiry', e.target.value)} /></Field>
      </div>
      {F.v.issued && F.v.expiry && F.v.expiry < F.v.issued && <p className="warnbox">The expiry date is before the issue date.</p>}
      <Field label="Remarks"><textarea rows={2} value={F.v.remarks} onChange={e => F.set('remarks', e.target.value)} /></Field>
    </div>
    {(isChem || F.v.chems.length > 0) && <><h2 className="sect">Chemicals on this licence ({F.v.chems.length})</h2>
      <div className="card form">
        <p className="muted small">{isCil ? 'CIL: name, EPA registration No., stipulated quantity, unit and consignment ref. – used for the import quota check.' : 'CRL: name, EPA registration No. and type.'}</p>
        <Lines title="Chemical" items={F.v.chems} setItems={x => F.set('chems', x)} blank={blankChem} max={50} render={(l, u) => (<>
          <Field label="Trade or IUPAC name"><Combo id="lchem" value={l.name} onChange={x => u('name', x)} options={snap.lists.chemicals} /></Field>
          <AddChem name={l.name} snap={snap} go={go} />
          <div className="two"><Field label="EPA registration No."><input value={l.reg} onChange={e => u('reg', e.target.value)} /></Field><Field label="Type"><input value={l.type} onChange={e => u('type', e.target.value)} /></Field></div>
          {isCil && <div className="two"><Field label="Stipulated qty"><input inputMode="decimal" value={l.qty} onChange={e => u('qty', e.target.value)} /></Field>
            <Field label="Unit"><Select value={l.unit} onChange={x => u('unit', x)} options={['kg', 'MT', 'L', 'kg/month', 'MT/month', 'pcs', 'Bottles']} blank={null} /></Field></div>}
          {isCil && <Field label="Consignment ref. (BL/IPD No.)"><input value={l.cons} onChange={e => u('cons', e.target.value)} placeholder="To Be Provided" /></Field>}
        </>)} />
        {!F.v.chems.length && <button type="button" className="wide" onClick={() => F.set('chems', [blankChem()])}>+ Add chemical</button>}
      </div></>}
    {(isTr || F.v.vehicles.length > 0) && <><h2 className="sect">Vehicles ({F.v.vehicles.length})</h2>
      <div className="card form">
        <Lines title="Vehicle" items={F.v.vehicles} setItems={x => F.set('vehicles', x)} blank={() => ({ type: '', reg: '', epa: '' })} max={60} render={(l, u) => (<>
          <Field label="Vehicle type"><Combo id="vt" value={l.type} onChange={x => u('type', x)} options={snap.lists.vehicleTypes} /></Field>
          <div className="two"><Field label="Registration No."><input value={l.reg} onChange={e => u('reg', e.target.value.toUpperCase())} /></Field><Field label="EPA registration No."><input value={l.epa} onChange={e => u('epa', e.target.value)} /></Field></div>
        </>)} />
        {!F.v.vehicles.length && <button type="button" className="wide" onClick={() => F.set('vehicles', [{ type: '', reg: '', epa: '' }])}>+ Add vehicle</button>}
      </div></>}
    {isEdl && <><h2 className="sect">Effluent details (EDL)</h2>
      <div className="card form">
        <Field label="Receiving water" hint='Printed in conditions 1–2, e.g. "the estuary"'><input value={F.v.eff.water} onChange={e => setEff('water', e.target.value)} /></Field>
        <div className="two"><Field label="Max. volume (m³/day)"><input inputMode="decimal" value={F.v.eff.volume} onChange={e => setEff('volume', e.target.value)} /></Field>
          <Field label="Discharge point / facility"><input value={F.v.eff.point} onChange={e => setEff('point', e.target.value)} placeholder="in a containment tank" /></Field></div>
        <h4>Discharge limits ({F.v.eff.limits.length})</h4>
        <Lines title="Limit" items={F.v.eff.limits} setItems={x => setEff('limits', x)} blank={blankLimit} max={20} render={(l, u) => (<>
          <Field label="Parameter"><Combo id="par" value={l.param} onChange={x => u('param', x)} options={snap.lists.params} /></Field>
          <div className="two"><Field label="Unit"><Combo id="eu" value={l.unit} onChange={x => u('unit', x)} options={snap.lists.effUnits} /></Field><Field label="Limit"><input value={l.limit} onChange={e => u('limit', e.target.value)} /></Field></div>
          <div className="two"><Field label="Sample type"><input value={l.sample} onChange={e => u('sample', e.target.value)} placeholder="Grab / Composite" /></Field>
            <Field label="Testing schedule"><Select value={l.schedule} onChange={x => u('schedule', x)} options={snap.lists.schedules} /></Field></div>
          {isRp && <Field label="Discharge stage" hint="e.g. Detox Unit I & II to TSF-II – one table per stage"><input value={l.stage} onChange={e => u('stage', e.target.value)} /></Field>}
        </>)} />
        {!F.v.eff.limits.length && <button type="button" className="wide" onClick={() => setEff('limits', [blankLimit()])}>+ Add limit</button>}
        {isRp && <><h4>Geo-reference – Tables 1A / 1B ({F.v.eff.coords.length})</h4>
          <Lines title="Point" items={F.v.eff.coords} setItems={x => setEff('coords', x)} blank={() => ({ table: '1A', vertex: '', e: '', n: '' })} max={20} render={(l, u) => (<>
            <div className="two"><Field label="Table"><Select value={l.table} onChange={x => u('table', x)} options={['1A', '1B']} blank={null} /></Field><Field label="Vertex"><input value={l.vertex} onChange={e => u('vertex', e.target.value)} /></Field></div>
            <div className="two"><Field label="Easting"><input inputMode="decimal" value={l.e} onChange={e => u('e', e.target.value)} /></Field><Field label="Northing"><input inputMode="decimal" value={l.n} onChange={e => u('n', e.target.value)} /></Field></div>
          </>)} />
          {!F.v.eff.coords.length && <button type="button" className="wide" onClick={() => setEff('coords', [{ table: '1A', vertex: 'A', e: '', n: '' }])}>+ Add coordinate</button>}
          <h4>Discharge sources – Table 2 ({F.v.eff.sources.length})</h4>
          <Lines title="Source" items={F.v.eff.sources} setItems={x => setEff('sources', x)} blank={() => ({ source: '', unit: '', x: '', y: '' })} max={6} render={(l, u) => (<>
            <div className="two"><Field label="Discharge source"><input value={l.source} onChange={e => u('source', e.target.value)} /></Field><Field label="Receiving unit"><input value={l.unit} onChange={e => u('unit', e.target.value)} /></Field></div>
            <div className="two"><Field label="X (Table 1B)"><input inputMode="decimal" value={l.x} onChange={e => u('x', e.target.value)} /></Field><Field label="Y (Table 1B)"><input inputMode="decimal" value={l.y} onChange={e => u('y', e.target.value)} /></Field></div>
          </>)} />
          {!F.v.eff.sources.length && <button type="button" className="wide" onClick={() => setEff('sources', [{ source: '', unit: '', x: '', y: '' }])}>+ Add source</button>}</>}
      </div></>}
    <div className="card form"><Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save licence'} /></div>
  </>);
}

/* ================================================================ Clearance */
const blankLine = () => ({ rec: '', std: '', qty: '', unit: 'kg', bl: '' });
export function ClearanceForm({ snap, submit, back, preset = {}, go }) {
  const F = useForm({ company: '', date: today(), eta: '', ref: '', bl: '', remarks: '', ...preset, lines: preset.lines && preset.lines.length ? preset.lines : [blankLine()] });
  const edit = !!preset.id;
  const co = snap.tables.companies.find(r => eq(r['Company Name'], F.v.company));
  const totKg = F.v.lines.reduce((a, l) => a + (toKg(l.qty, l.unit) || 0), 0);
  // quota hint from the downloaded copy (the server checks again before saving)
  const q = co ? snap.insights.quotas.filter(x => x.coId === co['Company ID'] && x.active) : [];
  const save = async () => {
    const e = need(F.v, ['company', 'date']);
    if (F.v.company && !co) e.company = 'Not registered – register the company first';
    if (!F.v.lines.some(l => (l.rec || l.std).trim())) e.lines = 'Add at least one chemical';
    F.setErr(e); if (Object.keys(e).length) return window.scrollTo(0, 0);
    F.setBusy(true);
    const d = { ...F.v, company: co['Company Name'], lines: F.v.lines.filter(l => (l.rec || l.std).trim()).map(l => ({ ...l, rec: l.rec || l.std })) };
    const ok = await submit('clearance', d); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Chemical clearance'} sub="One clearance, up to 20 chemicals" back={back} onSave={save} busy={F.busy} />
    <Inbox preset={preset} />
    <div className="card form">
      <Field label="Company" req err={F.err.company}><Combo id="cco" value={F.v.company} onChange={x => F.set('company', x)} options={coNames(snap)} /></Field>
      <div className="two">
        <Field label="Clearance date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
        <Field label="ETA"><input type="date" value={F.v.eta} onChange={e => F.set('eta', e.target.value)} /></Field>
      </div>
      <Field label="EPA clearance ref. No." hint="e.g. ED/EPA-01/0067/26/RL"><input value={F.v.ref} onChange={e => F.set('ref', e.target.value)} /></Field>
      <Field label="B/L / invoice / AWB No." hint="Used for every line unless a line has its own"><input value={F.v.bl} onChange={e => F.set('bl', e.target.value)} /></Field>
      <Field label="Remarks"><textarea rows={2} value={F.v.remarks} onChange={e => F.set('remarks', e.target.value)} /></Field>
    </div>
    {q.length > 0 && <p className="infobox">Licensed quotas for this company: {q.slice(0, 4).map(x => `${x.chem} ${x.limit === null ? '(no qty)' : Math.round((x.pct || 0) * 100) + '% used'}`).join(' · ')}</p>}
    <h2 className="sect">Chemicals ({F.v.lines.length}/20){F.err.lines && <span className="err"> – {F.err.lines}</span>}</h2>
    <div className="card form">
      <Lines title="Chemical" items={F.v.lines} setItems={x => F.set('lines', x)} blank={blankLine} max={20} render={(l, u) => {
        const sug = l.rec && !l.std ? suggestChem(snap.lists.chemicals, l.rec, 1)[0] : null;
        return (<>
          <Field label="Chemical as recorded" hint="Exactly as on the invoice / B/L"><input value={l.rec} onChange={e => u('rec', e.target.value)} /></Field>
          <Field label="Chemical (standard)"><Combo id="cstd" value={l.std} onChange={x => u('std', x)} options={snap.lists.chemicals} /></Field>
          <AddChem name={l.std} snap={snap} go={go} />
          {sug && sug.score >= 0.5 && <button type="button" className="link left" onClick={() => u('std', sug.name)}>Use “{sug.name}”?</button>}
          <div className="two"><Field label="Quantity"><input inputMode="decimal" value={l.qty} onChange={e => u('qty', e.target.value)} /></Field>
            <Field label="Unit"><Select value={l.unit} onChange={x => u('unit', x)} options={snap.lists.units.length ? snap.lists.units : ['kg', 'MT', 'L', 'pcs']} blank={null} /></Field></div>
          <Field label="B/L for this line (if different)"><input value={l.bl} onChange={e => u('bl', e.target.value)} /></Field>
        </>);
      }} />
      <div className="kv"><span>Total</span><b>{kgFmt(totKg)} kg · {kgFmt(totKg / 1000)} MT</b></div>
      {go && <button type="button" className="wide" onClick={() => go('fee', { lines: F.v.lines.filter(l => l.std).map(l => ({ std: l.std, qty: l.qty, unit: l.unit, hmis: '', cat: '' })) })}>💲 Fee estimate for these chemicals</button>}
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save clearance'} />
    </div>
  </>);
}

/* ================================================================ Bill (multi-service) */
const blankSvc = () => ({ service: '', details: '', amount: '' });
export function BillForm({ snap, submit, back, preset = {} }) {
  const F = useForm({ company: '', date: today(), type: '', ref: '', contact: '', title: '', location: '', activity: '', linked: '', ...preset, lines: preset.lines && preset.lines.length ? preset.lines : [blankSvc()] });
  const edit = !!preset.id, fees = snap.config.fees || [], bts = snap.config.billTypes || [];
  const bt = bts.find(b => eq(b['Bill Type'], F.v.type));
  const group = bt ? bt['Bill Group'] : '';
  const services = fees.filter(f => !group || group === 'Other' || eq(f['Bill Group'], group) || eq(f['Bill Group'], 'Other')).map(f => f['Service']);
  const fee = s => fees.find(f => eq(f['Service'], s));
  const co = snap.tables.companies.find(r => eq(r['Company Name'], F.v.company));
  const total = F.v.lines.reduce((a, l) => a + num(l.amount), 0);
  const pickCo = x => {
    const r = snap.tables.companies.find(q => eq(q['Company Name'], x));
    F.setV(o => ({ ...o, company: x, ...(r && !edit ? { contact: o.contact || r['Contact Person'] || '', title: o.title || r['Contact Title'] || '', location: o.location || r['Location'] || '', activity: o.activity || r['Sector / Activity'] || '' } : {}) }));
  };
  const save = async () => {
    const e = need(F.v, ['company', 'date', 'type']);
    if (F.v.company && !co) e.company = 'Not registered – register the company first';
    const ls = F.v.lines.filter(l => l.service.trim());
    if (!ls.length) e.lines = 'Add at least one service'; else if (ls.some(l => !(num(l.amount) > 0))) e.lines = 'Every service needs an amount';
    F.setErr(e); if (Object.keys(e).length) return window.scrollTo(0, 0);
    F.setBusy(true); const ok = await submit('bill', { ...F.v, company: co['Company Name'], lines: ls }); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'New bill'} sub="One Bill No., up to 10 services" back={back} onSave={save} busy={F.busy} />
    <Inbox preset={preset} />
    <div className="card form">
      <Field label="Company" req err={F.err.company}><Combo id="bco" value={F.v.company} onChange={pickCo} options={coNames(snap)} /></Field>
      <div className="two">
        <Field label="Bill date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
        <Field label="Bill type" req err={F.err.type}><Select value={F.v.type} onChange={x => F.set('type', x)} options={bts.map(b => b['Bill Type'])} /></Field>
      </div>
      {bt && <p className="muted small">Letter wording: “{String(bt['Opening Paragraph']).slice(0, 110)}…”</p>}
      <Field label="Bill ref. No." hint="EPA letter reference, e.g. ED/EPA-01/03336/26/RL"><input value={F.v.ref} onChange={e => F.set('ref', e.target.value)} /></Field>
      <div className="two">
        <Field label="Contact person" hint="As it should appear on the letter"><input value={F.v.contact} onChange={e => F.set('contact', e.target.value)} /></Field>
        <Field label="Position / title" hint="or Mr./Mrs./Dr."><input value={F.v.title} onChange={e => F.set('title', e.target.value)} /></Field>
      </div>
      <div className="two">
        <Field label="Location"><input value={F.v.location} onChange={e => F.set('location', e.target.value)} /></Field>
        <Field label="Activity"><input value={F.v.activity} onChange={e => F.set('activity', e.target.value)} /></Field>
      </div>
      <Field label="Linked record(s)" hint="LIC-### / CLN-### this bill is for"><input value={F.v.linked} onChange={e => F.set('linked', e.target.value.toUpperCase())} /></Field>
    </div>
    <h2 className="sect">Services ({F.v.lines.length}/10){F.err.lines && <span className="err"> – {F.err.lines}</span>}</h2>
    <div className="card form">
      <Lines title="Service" items={F.v.lines} setItems={x => F.set('lines', x)} blank={blankSvc} max={10} render={(l, u) => {
        const f = fee(l.service);
        return (<>
          <Field label="Service"><Select value={l.service} onChange={x => { const s = fee(x); u(s && isNum(s['Suggested Fee (USD)']) && !l.amount ? { service: x, amount: s['Suggested Fee (USD)'] } : { service: x }); }} options={services.length ? services : snap.lists.purposes} /></Field>
          <Field label="Details / chemical(s)"><input value={l.details} onChange={e => u('details', e.target.value)} /></Field>
          <Field label="Amount (US$)" hint={f ? (isNum(f['Suggested Fee (USD)']) ? `Suggested fee US$${money(f['Suggested Fee (USD)'])}` : f['Notes'] || '') : ''}><input inputMode="decimal" value={l.amount} onChange={e => u('amount', e.target.value)} /></Field>
        </>);
      }} />
      <div className="kv"><span>Total</span><b className="big">US${money(total)}</b></div>
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save bill'} />
    </div>
  </>);
}

/* ================================================================ Payment */
export function PaymentForm({ snap, submit, back, preset = {} }) {
  const F = useForm({ bill: '', company: '', amount: '', date: today(), receipt: '', purpose: '', group: 'Mobile app', remarks: '', ...preset });
  const edit = !!preset.id;
  const [mode, setMode] = useState(preset.bill || !preset.company ? 'bill' : 'account');
  const bills = useMemo(() => [...snap.insights.bills].sort((a, b) => Number(a.isPaid) - Number(b.isPaid) || String(b.date).localeCompare(String(a.date))), [snap]);
  const b = bills.find(x => eq(x.no, F.v.bill));
  const ownAmt = edit ? num(preset.amount) : 0, outstanding = b ? b.out + (b.no === preset.bill ? ownAmt : 0) : 0;
  const dupRcpt = F.v.receipt && snap.tables.payments.find(p => eq(p['Receipt No.'], F.v.receipt) && p['Record ID'] !== preset.id);
  const save = async () => {
    const e = need(F.v, ['amount', 'date']);
    if (mode === 'bill' && !b) e.bill = 'Choose the bill';
    if (mode === 'account' && !snap.tables.companies.some(c => eq(c['Company Name'], F.v.company))) e.company = 'Choose a registered company';
    if (!(num(F.v.amount) > 0)) e.amount = 'Must be above 0';
    F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('payment', { ...F.v, bill: mode === 'bill' ? b.no : '', company: mode === 'bill' ? b.co : coFix(snap, F.v.company) }); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Record payment'} back={back} onSave={save} busy={F.busy} />
    <Inbox preset={preset} />
    <div className="card form">
      <Seg value={mode} onChange={setMode} options={[['bill', 'Against a bill'], ['account', 'Company account']]} />
      <div className="mt" />
      {mode === 'bill' ? <Field label="Bill" req err={F.err.bill}>
        <Combo id="bills" value={F.v.bill} onChange={x => F.set('bill', x.split(' ')[0])} options={bills.map(x => `${x.no} · ${x.co} · ${x.isPaid ? 'paid' : 'owes US$' + money(x.out)}`)} placeholder="Type the Bill No. or company" />
      </Field> : <Field label="Company" req err={F.err.company} hint="A payment not linked to a bill: it is applied to the company's oldest bills"><Combo id="pco" value={F.v.company} onChange={x => F.set('company', x)} options={coNames(snap)} /></Field>}
      {mode === 'bill' && b && <p className={b.isPaid && !edit ? 'okbox' : 'infobox'}>{b.co}<br />Billed US${money(b.billed)} · paid US${money(b.paid)} · <b>outstanding US${money(outstanding)}</b>{b.purpose && <><br /><small>{b.purpose}</small></>}</p>}
      <div className="two">
        <Field label="Amount (US$)" req err={F.err.amount}><input inputMode="decimal" value={F.v.amount} onChange={e => F.set('amount', e.target.value)} /></Field>
        <Field label="Payment date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
      </div>
      {b && !edit && !F.v.amount && outstanding > 0 && <button type="button" className="link left" onClick={() => F.set('amount', String(outstanding))}>Fill the full balance (US${money(outstanding)})</button>}
      {b && num(F.v.amount) > outstanding + 0.005 && <p className="warnbox">More than the outstanding balance of US${money(outstanding)}.</p>}
      <Field label="Receipt No."><input value={F.v.receipt} onChange={e => F.set('receipt', e.target.value)} /></Field>
      {dupRcpt && <p className="warnbox">Receipt {F.v.receipt} is already recorded on {dupRcpt['Record ID']}.</p>}
      <Field label="Purpose / services" hint="Taken from the bill if empty"><input value={F.v.purpose} onChange={e => F.set('purpose', e.target.value)} /></Field>
      <Field label="Record group"><Select value={F.v.group} onChange={x => F.set('group', x)} options={snap.lists.groups.length ? snap.lists.groups : ['Mobile app']} blank={null} /></Field>
      <Field label="Remarks"><textarea rows={2} value={F.v.remarks} onChange={e => F.set('remarks', e.target.value)} /></Field>
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save payment'} />
    </div>
  </>);
}

/* ================================================================ Field inspection (GPS + photos) */
export function InspectionForm({ snap, submit, back, flash, preset = {}, session }) {
  const F = useForm({ company: '', site: '', date: today(), type: '', linked: '', compliance: '', findings: '', actions: '', followUp: '', lat: '', lng: '', acc: '', inspector: session ? session.user.name : '', ...preset });
  const edit = !!preset.id;
  const [photos, setPhotos] = useState([]);
  const [gpsBusy, setGpsBusy] = useState(false);
  const gps = async () => {
    setGpsBusy(true);
    try { const g = await getGps(); F.setV(o => ({ ...o, lat: g.lat, lng: g.lng, acc: g.gps_accuracy_m })); flash(`Location captured (±${g.gps_accuracy_m} m)`); }
    catch (e) { flash('Could not get the location: ' + e.message); }
    setGpsBusy(false);
  };
  const photo = async () => { try { const d = await takePhoto(); if (d) setPhotos(p => [...p, { data: d, taken: new Date().toISOString() }]); } catch (e) { if (!/cancel/i.test(e.message)) flash(e.message); } };
  const save = async () => {
    const e = need(F.v, ['site', 'date']); F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('inspection', { ...F.v, company: coFix(snap, F.v.company) }, photos); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Field inspection'} back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Company"><Combo id="cos2" value={F.v.company} onChange={x => F.set('company', x)} options={coNames(snap)} /></Field>
      <Field label="Site / facility" req err={F.err.site}><input value={F.v.site} onChange={e => F.set('site', e.target.value)} /></Field>
      <div className="two">
        <Field label="Date" req err={F.err.date}><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
        <Field label="Type"><Select value={F.v.type} onChange={x => F.set('type', x)} options={snap.lists.inspectionTypes} /></Field>
      </div>
      <Field label="Linked record" hint="Licence, clearance or bill number, if any"><input value={F.v.linked} onChange={e => F.set('linked', e.target.value.toUpperCase())} /></Field>
      <Field label="Compliance"><Seg value={F.v.compliance} onChange={x => F.set('compliance', x)} options={snap.lists.compliance.map(c => [c, c])} /></Field>
      <Field label="Findings"><textarea rows={4} value={F.v.findings} onChange={e => F.set('findings', e.target.value)} /></Field>
      <Field label="Actions required"><textarea rows={3} value={F.v.actions} onChange={e => F.set('actions', e.target.value)} /></Field>
      <div className="two">
        <Field label="Follow-up date"><input type="date" value={F.v.followUp} onChange={e => F.set('followUp', e.target.value)} /></Field>
        <Field label="Inspector"><input value={F.v.inspector} onChange={e => F.set('inspector', e.target.value)} /></Field>
      </div>
      <div className="gps"><span>GPS location</span>
        {F.v.lat ? <b>{F.v.lat}, {F.v.lng} (±{F.v.acc} m)</b> : <small className="muted">not captured</small>}
        <button type="button" onClick={gps} disabled={gpsBusy}>{gpsBusy ? 'Locating…' : F.v.lat ? 'Capture again' : '📍 Capture GPS'}</button></div>
      <div className="gps"><span>Photos ({photos.length}{edit ? ' new' : ''})</span>
        <div className="photos">{photos.map((p, i) => <img key={i} src={`data:image/jpeg;base64,${p.data}`} alt="" onClick={() => confirm('Remove this photo?') && setPhotos(ps => ps.filter((_, j) => j !== i))} />)}</div>
        {!edit && <button type="button" onClick={photo}>📷 Add photo</button>}</div>
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save inspection'} />
    </div>
  </>);
}

/* ================================================================ Notes & Issues */
export function IssueForm({ snap, submit, back, preset = {} }) {
  const F = useForm({ register: '', record: '', issue: '', action: '', status: 'Open', ...preset });
  const edit = !!preset.id;
  const save = async () => {
    const e = need(F.v, ['issue']); F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('issue', F.v); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Report a data issue'} back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Register"><Select value={F.v.register} onChange={x => F.set('register', x)} options={snap.lists.registers} /></Field>
      <Field label="Record" hint="ID of the record, e.g. LIC-067"><input value={F.v.record} onChange={e => F.set('record', e.target.value.toUpperCase())} /></Field>
      <Field label="Issue found" req err={F.err.issue}><textarea rows={4} value={F.v.issue} onChange={e => F.set('issue', e.target.value)} /></Field>
      <Field label="Action taken"><textarea rows={2} value={F.v.action} onChange={e => F.set('action', e.target.value)} /></Field>
      <Field label="Follow-up status"><Combo id="ist" value={F.v.status} onChange={x => F.set('status', x)} options={snap.lists.issueStatus} /></Field>
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save'} />
    </div>
  </>);
}

/* ================================================================ Correspondence (reminder letters, violation / shutdown notices) */
export function CorrespondenceForm({ snap, submit, back, preset = {} }) {
  const F = useForm({ company: '', type: '', activity: '', description: '', ref: '', date: today(), ...preset });
  const edit = !!preset.id;
  const save = async () => {
    const e = need(F.v, ['type', 'description']); F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('correspondence', { ...F.v, company: coFix(snap, F.v.company) }); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title={edit ? `Edit ${preset.id}` : 'Correspondence'} sub="Letters and notices to companies" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Company"><Combo id="corco" value={F.v.company} onChange={x => { F.set('company', x); const r = snap.tables.companies.find(q => eq(q['Company Name'], x)); if (r && !F.v.activity) F.set('activity', r['Sector / Activity'] || ''); }} options={coNames(snap)} /></Field>
      <div className="two">
        <Field label="Type" req err={F.err.type}><Combo id="cort" value={F.v.type} onChange={x => F.set('type', x)} options={snap.lists.corTypes} /></Field>
        <Field label="Date"><input type="date" value={F.v.date} onChange={e => F.set('date', e.target.value)} /></Field>
      </div>
      <Field label="Activity"><input value={F.v.activity} onChange={e => F.set('activity', e.target.value)} /></Field>
      <Field label="Description" req err={F.err.description}><textarea rows={4} value={F.v.description} onChange={e => F.set('description', e.target.value)} /></Field>
      <Field label="EPA reference No."><input value={F.v.ref} onChange={e => F.set('ref', e.target.value)} /></Field>
      <Done busy={F.busy} onSave={save} label={edit ? 'Save changes' : 'Save'} />
    </div>
  </>);
}

/* ================================================================ Add a chemical to the standard list (and its HMIS rating / fee category) */
export function ChemicalForm({ snap, submit, back, preset = {} }) {
  const F = useForm({ name: '', cas: '', hmis: '', cat: '', notes: '', ...preset });
  const list = snap.lists.chemicals || [];
  const exact = list.find(c => eq(c, F.v.name));
  const near = F.v.name.trim().length >= 4 && !exact ? suggestChem(list, F.v.name, 3).filter(x => x.score >= 0.7) : [];
  const save = async () => {
    const e = need(F.v, ['name']); F.setErr(e); if (Object.keys(e).length) return;
    F.setBusy(true); const ok = await submit('chemical', F.v); F.setBusy(false); if (ok) back();
  };
  return (<>
    <Bar title="Add a chemical" sub="To the standard chemical list (drop-downs) and Chemical Hazards" back={back} onSave={save} busy={F.busy} />
    <div className="card form">
      <Field label="Chemical name (standard)" req err={F.err.name} hint="As it should appear in every drop-down, e.g. Sodium Bicarbonate"><input value={F.v.name} onChange={e => F.set('name', e.target.value)} /></Field>
      {exact && <p className="infobox">“{exact}” is already on the list – saving only adds the hazard details below.</p>}
      {near.length > 0 && <p className="warnbox">Similar names already on the list: {near.map(x => x.name).join(', ')}. Use one of them if it is the same chemical.</p>}
      <Field label="CAS No."><input value={F.v.cas} onChange={e => F.set('cas', e.target.value)} placeholder="e.g. 144-55-8" /></Field>
      <div className="two">
        <Field label="HMIS rating for the fee (0–4)" hint="From the Safety Data Sheet – never guessed"><Select value={String(F.v.hmis)} onChange={x => F.set('hmis', x)} options={['0', '1', '2', '3', '4']} /></Field>
        <Field label="Fee category"><Select value={F.v.cat} onChange={x => F.set('cat', x)} options={(snap.hazards.cats || []).map(c => c[0])} /></Field>
      </div>
      <Field label="Hazards / handling notes"><textarea rows={2} value={F.v.notes} onChange={e => F.set('notes', e.target.value)} /></Field>
      <Done busy={F.busy} onSave={save} label="Add to the chemical list" />
    </div>
  </>);
}
/** shown under a chemical field when the name typed is not on the list */
export function AddChem({ name, snap, go }) {
  const n = String(name || '').trim();
  if (n.length < 3 || (snap.lists.chemicals || []).some(c => eq(c, n)) || !go) return null;
  return <button type="button" className="link left" onClick={() => go('form', { form: 'chemical', preset: { name: n } })}>➕ “{n}” is not on the chemical list – add it</button>;
}

export const FORMS = { company: CompanyForm, licence: LicenceForm, clearance: ClearanceForm, bill: BillForm, payment: PaymentForm, inspection: InspectionForm, issue: IssueForm, correspondence: CorrespondenceForm, chemical: ChemicalForm };
export const FORM_LABEL = { company: 'Company', licence: 'Licence', clearance: 'Clearance', bill: 'Bill', payment: 'Payment', inspection: 'Inspection', issue: 'Data issue', correspondence: 'Correspondence', chemical: 'Chemical', delete: 'Delete', inboxReject: 'Document rejected' };
export { addDays };
