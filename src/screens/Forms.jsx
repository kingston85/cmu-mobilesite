// Forms for every register (add + edit), with the desktop forms' checks live: duplicates, quotas, hazard & fee estimate,
// bill types/services/suggested fees, receipt and balance checks, GPS + photos. Also the step-by-step bill wizard.
import { useEffect, useMemo, useState } from 'react';
import { useApp, useNav } from '../lib/store';
import { Bar, Btn, Card, Icon, IconBtn, Text, Num, DateIn, Select, Picker, PickSheet, Toggle, Seg, Note, Row, Badge, KV, confirm, alertBox, useBusy } from '../components/ui';
import { blank, toForm, EFF_SETTINGS, TYPES } from '../lib/records';
import { money, usd, fmtD, num, str, trim, eqi, iso, today, toDate, dupSimilar, stdChem, lineHazard, feeCalc, quotaWarnings, typeFor, feeFor, groupOfType, servicesForType, billLineFor, billStatus, amountInWords, BILL_KINDS, NEW, clrKg, aiUnit, svcFor } from '../lib/logic';
import { getGps, takePhoto } from '../lib/device';

const upd = (set, k) => v => set(d => ({ ...d, [k]: v }));
const setLine = (set, key, i, k) => v => set(d => ({ ...d, [key]: d[key].map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
const addLine = (set, key, obj) => set(d => ({ ...d, [key]: [...(d[key] || []), obj] }));
const delLine = (set, key, i) => set(d => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }));
const effUpd = (set, key, i, k) => v => set(d => ({ ...d, effluent: { ...d.effluent, [key]: d.effluent[key].map((l, j) => (j === i ? { ...l, [k]: v } : l)) } }));
const effAdd = (set, key, obj) => set(d => ({ ...d, effluent: { ...d.effluent, [key]: [...(d.effluent[key] || []), obj] } }));
const effDel = (set, key, i) => set(d => ({ ...d, effluent: { ...d.effluent, [key]: d.effluent[key].filter((_, j) => j !== i) } }));

/** a Claude draft (fill_form field names) → this app's form data */
export function fromAi(form, x = {}, L = {}) {
  const S = v => (v === undefined || v === null ? '' : String(v)), D = v => { const d = toDate(v); return d ? iso(d) : S(v); };
  const std = (rec, s) => { if (s && (L.chemicals || []).includes(s)) return s; const m = stdChem(rec || s, L.chemicals || [], 1)[0]; return m && m.score >= 0.75 ? m.name : (L.chemicals || []).includes('Other / Unspecified') ? 'Other / Unspecified' : ''; };
  switch (form) {
    case 'company': return { ...blank.company(), name: S(x.name || x.company), sector: S(x.sector), location: S(x.location), other: S(x.other_names) };
    case 'licence': return { ...blank.licence(), company: S(x.company), category: S(x.category), type: S(x.type), location: S(x.location), applicationDate: D(x.application_date), responseDate: D(x.response_date), refCode: S(x.reference_code),
      licNo: S(x.licence_no), issued: D(x.date_issued), expiry: D(x.expiry_date), remarks: S(x.remarks),
      chemicals: (x.chemicals || []).map(c => ({ name: S(c.name), epaReg: S(c.epa_registration_no), type: S(c.type), qty: S(c.quantity), unit: aiUnit(c.unit), consignment: S(c.consignment_ref) })) };
    case 'clearance': return { ...blank.clearance(), company: S(x.company), date: D(x.date) || iso(today()), ref: S(x.epa_ref), bl: S(x.bl_no), remarks: S(x.remarks), eta: D(x.eta),
      lines: (x.lines || []).slice(0, 20).map(l => ({ rec: S(l.chemical_as_recorded || l.chemical_standard), std: std(l.chemical_as_recorded, l.chemical_standard), qty: S(l.quantity), unit: aiUnit(l.unit) || 'kg', bl: S(l.bl_no) })) };
    case 'bill': return { ...blank.bill(), company: S(x.company), date: D(x.date) || iso(today()), type: S(x.bill_type), ref: S(x.bill_ref), contact: S(x.contact_person), title: S(x.contact_title),
      lines: (x.lines || []).slice(0, 10).map(l => ({ service: S(l.service), details: S(l.details), amount: S(l.amount) })) };
    case 'payment': return { ...blank.payment(), bill: S(x.bill_no), company: S(x.company), amount: S(x.amount), date: D(x.date) || iso(today()), receipt: S(x.receipt_no), remarks: S(x.remarks), purpose: S(x.purpose) };
    case 'issue': return { ...blank.issue(), register: S(x.register), record: S(x.record), issue: S(x.issue), action: S(x.action), status: S(x.status) || 'Open' };
    case 'inspection': return { ...blank.inspection(), company: S(x.company), site: S(x.site), date: D(x.date) || iso(today()), type: S(x.type) || 'Routine inspection', compliance: S(x.compliance), findings: S(x.findings), actions: S(x.actions), followUp: D(x.follow_up) };
    default: return blank[form] ? blank[form]() : {};
  }
}

/* ------------------------------------------------------------------ the form screen */
export function FormScreen({ type, op = 'create', id, prefill, fromIds, feeLines, inboxFid, draft }) {
  const { T, L, precheck, save, toast, canEdit } = useApp(), nav = useNav();
  const init = useMemo(() => {
    if (op === 'update') return toForm(type, T, id) || blank[type]();
    let d = { ...blank[type](), ...(draft ? fromAi(type, draft, L) : {}), ...(prefill || {}) };
    if (type === 'contact' && id) d = toForm('contact', T, id);
    if (type === 'hazard' && id) d = toForm('hazard', T, id);
    if (type === 'bill' && fromIds?.length) {
      const ls = fromIds.map(x => billLineFor(T, x, L.services)).filter(Boolean);
      if (ls.length) {
        d.company = ls[0].company; d.location = d.location || ls[0].location; d.linked = fromIds.join(', ');
        d.type = d.type || typeFor(ls[0].service, L.services);
        d.lines = ls.map(l => ({ service: l.service, details: l.details, amount: l.amount === null ? '' : String(l.amount) }));
        if (feeLines?.total && ls.length === 1 && ls[0].service === 'Chemical Clearance') { d.lines[0].amount = String(feeLines.total); d.lines[0].details += ' – fee per RI/C&E-002-04/20'; }
        const co = T.companies.find(c => eqi(c['Company Name'], d.company)); if (co && !d.activity) d.activity = co['Sector / Activity'] || '';
      }
    }
    if (type === 'bill' && d.company && !d.contact) { const prev = T.bills.filter(b => eqi(b['Company Name'], d.company) && b['Contact Person']).sort((a, b) => (toDate(b['Bill Date']) || 0) - (toDate(a['Bill Date']) || 0))[0]; if (prev) { d.contact = prev['Contact Person']; d.title = prev['Contact Title']; } }
    return d;
  }, []);   // eslint-disable-line
  const [d, set] = useState(init);
  const [photos, setPhotos] = useState([]);
  const [busy, run] = useBusy();
  const dirty = JSON.stringify(d) !== JSON.stringify(init) || photos.length;
  const leave = async () => { if (!dirty || await confirm({ title: 'Discard changes?', message: 'What you typed on this form will be lost.', ok: 'Discard', danger: true })) nav.back(); };
  const submit = () => run(async () => {
    const recId = type === 'contact' ? d.coId : type === 'hazard' ? d.name : id;
    const c = precheck(type, op, recId, d);
    if (c.error) { await alertBox({ title: 'Please check', message: c.error }); return; }
    if (c.warnings?.length && !(await confirm({ title: 'Please check', message: 'Save anyway?', list: c.warnings, ok: 'Save anyway', okKind: 'accent' }))) return;
    const opx = type === 'contact' || type === 'hazard' ? 'update' : op;
    const r = await save(type, opx, recId, d, { photos, inboxFid, force: !!c.warnings?.length });
    toast(op === 'create' ? `${TYPES[type].label} saved${r.tempId ? ' as ' + r.tempId : ''}` : 'Changes saved', 'ok');
    const view = { company: 'company', licence: 'licence', clearance: 'clearance', bill: 'bill', payment: 'payment', issue: 'issue', inspection: 'inspection', correspondence: 'correspondence' }[type];
    if (op === 'create' && view && r.tempId) nav.replace(view, { id: r.tempId }); else nav.back();
  });
  const Body = { company: CompanyForm, licence: LicenceForm, clearance: ClearanceForm, bill: BillForm, payment: PaymentForm, issue: IssueForm, correspondence: CorrForm, inspection: InspectionForm, contact: ContactForm, hazard: HazardForm }[type];
  const title = (op === 'create' && !['contact', 'hazard'].includes(type) ? 'New ' : 'Edit ') + TYPES[type].label.toLowerCase();
  return (
    <>
      <Bar title={title} sub={op === 'update' ? id : inboxFid ? 'From the Document Inbox' : draft ? 'Filled by Claude – please check' : TYPES[type].reg} onBack={leave} />
      <main className="main noNav"><div className="wrap">
        {!canEdit ? <Note kind="warn">Your account is view-only – changes cannot be saved.</Note> : null}
        {draft || inboxFid ? <Note icon="sparkle">Filled in from a document. Check every value against the document before saving – nothing is saved until you tap Save.</Note> : null}
        <Body d={d} set={set} op={op} id={id} photos={photos} setPhotos={setPhotos} />
      </div></main>
      <div className="stickybar"><Btn kind="ghost" onClick={leave}>Cancel</Btn><Btn kind="accent" icon="check" disabled={busy || !canEdit} onClick={submit}>{busy ? 'Saving…' : op === 'create' && !['contact', 'hazard'].includes(type) ? 'Save new' : 'Save'}</Btn></div>
    </>
  );
}

const companyOpts = T => T.companies.map(c => ({ value: c['Company Name'], label: c['Company Name'], sub: [c['Company ID'], c['Sector / Activity']].filter(Boolean).join(' · '), keys: c['Other Names Recorded'] + ' ' + c['Company ID'] }));
function CompanyPick({ value, onChange, req = true, free = false, label = 'Company' }) {
  const { T } = useApp(), nav = useNav();
  const known = !value || T.companies.some(c => eqi(c['Company Name'], value));
  return <Picker label={label} req={req} value={value} onChange={onChange} options={companyOpts(T)} free={free} title="Choose a company"
    warn={!known && !free ? 'Not a registered company – register it first.' : !known && free ? 'Not registered – it will be saved with the name only.' : ''} hint={!value ? <span>Not in the list? <a onClick={() => nav.go('form', { type: 'company', op: 'create' })}>Register a company</a></span> : null} />;
}
function LineHead({ n, onDel, children }) { return <div className="ln"><span className="grow">{children || 'Line ' + n}</span>{onDel ? <button className="ib" style={{ width: 30, height: 30 }} onClick={onDel} aria-label="Remove line"><Icon n="trash" s={16} /></button> : null}</div>; }

/* ------------------------------------------------------------------ company */
function CompanyForm({ d, set, id }) {
  const { T, L } = useApp(), nav = useNav();
  const sim = useMemo(() => (trim(d.name).length >= 3 ? dupSimilar(T.companies, d.name, 4, id) : []), [d.name, T.companies, id]);
  const exact = T.companies.find(c => eqi(c['Company Name'], d.name) && c['Company ID'] !== id);
  return (
    <>
      <Text label="Company name" req value={d.name} onChange={upd(set, 'name')} err={exact ? `Already registered as ${exact['Company ID']}` : ''} hint="The official name, as on the registration documents." />
      {sim.length && !exact ? <Note kind="warn"><b>Possible duplicate</b> – similar companies are already registered:<ul>{sim.map(s => <li key={s.id}><a onClick={() => nav.go('company', { id: s.id })}>{s.id} {s.name}</a> ({Math.round(s.score * 100)}%)</li>)}</ul></Note> : null}
      <Picker label="Sector / activity" value={d.sector} onChange={upd(set, 'sector')} options={L.sectors} free />
      <Text label="Location" value={d.location} onChange={upd(set, 'location')} hint="Street / town, county" />
      <Text label="Other names recorded" area value={d.other} onChange={upd(set, 'other')} hint="Other spellings used on documents, separated by ;" />
    </>
  );
}

/* ------------------------------------------------------------------ licence */
const defaultType = (cat, types) => { const m = { 'Chemical Registration (CRL)': 'Chemical Registration', 'Chemical Importation (CIL)': 'Chemical Importation', 'Effluent Discharge (EDL)': 'Effluent Discharge', 'Chemical Transportation': 'Annual Chemical Transportation License', 'Fumigation': 'Fumigation Certificate' }[cat]; return types.includes(m) ? m : ''; };
function LicenceForm({ d, set, id }) {
  const { T, L } = useApp();
  const dupNo = trim(d.licNo) ? T.licences.filter(l => eqi(l['Licence / Certificate No.'], d.licNo) && l['Record ID'] !== id) : [];
  const iss = toDate(d.issued), exp = toDate(d.expiry);
  const isChem = /\(CRL\)|\(CIL\)/i.test(d.category), isCil = /\(CIL\)/i.test(d.category), isEdl = /EDL|Effluent|Dewater/i.test(d.category + ' ' + d.type), isRp = /Retention|Dewater/i.test(d.type), isTr = /Transport/i.test(d.category);
  const [sec, setSec] = useState('main');
  const units = [...new Set([...L.units, 'kg/month', 'MT/month', 'L/month', 'cylinders'])];
  return (
    <>
      <Seg value={sec} onChange={setSec} options={[{ value: 'main', label: 'Details' }, { value: 'chem', label: `Chemicals ${d.chemicals.filter(c => trim(c.name)).length || ''}` }, ...(isTr || d.vehicles.length ? [{ value: 'veh', label: `Vehicles ${d.vehicles.length || ''}` }] : []), ...(isEdl ? [{ value: 'eff', label: 'Effluent' }] : [])]} />
      {sec === 'main' ? <>
        <CompanyPick value={d.company} onChange={v => { const co = T.companies.find(c => c['Company Name'] === v); set(x => ({ ...x, company: v, location: x.location || (co ? co['Location'] : '') })); }} />
        <Select label="Licence category" req value={d.category} onChange={v => set(x => ({ ...x, category: v, type: x.type || defaultType(v, L.types) }))} options={L.categories} />
        <Select label="Licence / certificate type" req value={d.type} onChange={upd(set, 'type')} options={L.types} />
        <Text label="Location" value={d.location} onChange={upd(set, 'location')} hint="Site address" />
        <div className="grid2"><DateIn label="Application date" value={d.applicationDate} onChange={upd(set, 'applicationDate')} /><DateIn label="Response date" value={d.responseDate} onChange={upd(set, 'responseDate')} /></div>
        <Text label="Reference code" value={d.refCode} onChange={upd(set, 'refCode')} hint="e.g. ED/EPA-01/075/26/RL" />
        <Text label="Licence / certificate No." value={d.licNo} onChange={upd(set, 'licNo')} warn={dupNo.length ? `Already on ${dupNo.map(l => l['Record ID']).join(', ')}` : ''} hint="Leave blank if not yet issued (status = Pending)" />
        <div className="grid2"><DateIn label="Date issued" value={d.issued} onChange={v => set(x => ({ ...x, issued: v, expiry: x.expiry || (v ? iso(new Date(new Date(v).getFullYear(), 11, 31)) : '') }))} />
          <DateIn label="Expiry date" value={d.expiry} onChange={upd(set, 'expiry')} warn={iss && exp && exp < iss ? 'Expiry is before the issue date' : ''} /></div>
        <Text label="Remarks" area value={d.remarks} onChange={upd(set, 'remarks')} />
        {isChem && !d.chemicals.length ? <Note>Add the chemicals on this licence under <b>Chemicals</b>{isCil ? ' – with the stipulated quantities, they become the import quotas.' : '.'}</Note> : null}
      </> : null}
      {sec === 'chem' ? <>
        <div className="small muted mb">{isCil ? 'Stipulated quantity + unit = the import quota checked on every clearance (use “/month” units for monthly quotas).' : 'Chemicals listed on the licence (they print in the PRODUCT INFORMATION table).'}</div>
        {d.chemicals.map((c, i) => (
          <div key={i} className="lineitem">
            <LineHead n={i + 1} onDel={() => delLine(set, 'chemicals', i)} />
            <Picker label="Trade or IUPAC name" req value={c.name} onChange={setLine(set, 'chemicals', i, 'name')} options={L.chemicals} free title="Chemical" />
            <div className="grid2"><Text label="EPA registration No." value={c.epaReg} onChange={setLine(set, 'chemicals', i, 'epaReg')} /><Text label="Type" value={c.type} onChange={setLine(set, 'chemicals', i, 'type')} /></div>
            <div className="grid2"><Num label="Stipulated qty" value={c.qty} onChange={setLine(set, 'chemicals', i, 'qty')} /><Picker label="Unit" value={c.unit} onChange={setLine(set, 'chemicals', i, 'unit')} options={units} free /></div>
            <Text label="Consignment ref. (BL / IPD No.)" value={c.consignment} onChange={setLine(set, 'chemicals', i, 'consignment')} />
          </div>))}
        <Btn kind="line" block icon="plus" onClick={() => addLine(set, 'chemicals', { name: '', epaReg: '', type: '', qty: '', unit: isCil ? 'kg' : '', consignment: '' })}>Add a chemical</Btn>
      </> : null}
      {sec === 'veh' ? <>
        {d.vehicles.map((v, i) => (
          <div key={i} className="lineitem"><LineHead n={i + 1} onDel={() => delLine(set, 'vehicles', i)}>Vehicle {i + 1}</LineHead>
            <Text label="Vehicle type" value={v.type} onChange={setLine(set, 'vehicles', i, 'type')} placeholder="e.g. Heavy Duty Truck" />
            <div className="grid2"><Text label="Registration No." value={v.reg} onChange={setLine(set, 'vehicles', i, 'reg')} /><Text label="EPA registration No." value={v.epaReg} onChange={setLine(set, 'vehicles', i, 'epaReg')} /></div>
          </div>))}
        <Btn kind="line" block icon="plus" onClick={() => addLine(set, 'vehicles', { type: 'Heavy Duty Truck', reg: '', epaReg: '' })}>Add a vehicle</Btn>
      </> : null}
      {sec === 'eff' ? <>
        <Card title="Effluent settings">{d.effluent.settings.map((s, i) => <Text key={i} label={s.item || EFF_SETTINGS[i]} value={s.value} onChange={effUpd(set, 'settings', i, 'value')} hint={i === 0 ? 'Used in Conditions 1–2 of the printed EDL, e.g. “the estuary”' : ''} />)}</Card>
        <div className="sect">Discharge limits (only the parameters this licence needs)</div>
        {d.effluent.limits.map((l, i) => (
          <div key={i} className="lineitem"><LineHead n={i + 1} onDel={() => effDel(set, 'limits', i)} />
            <Picker label="Parameter" req value={l.param} onChange={effUpd(set, 'limits', i, 'param')} options={L.parameters} free />
            <div className="grid2"><Picker label="Unit" value={l.unit} onChange={effUpd(set, 'limits', i, 'unit')} options={L.effUnits} free /><Text label="Limit" value={l.limit} onChange={effUpd(set, 'limits', i, 'limit')} /></div>
            <div className="grid2"><Text label="Sample type" value={l.sample} onChange={effUpd(set, 'limits', i, 'sample')} placeholder="Grab / Composite" /><Select label="Testing schedule" value={l.schedule} onChange={effUpd(set, 'limits', i, 'schedule')} options={L.schedules} /></div>
            {isRp ? <Text label="Discharge stage (retention pond)" value={l.stage} onChange={effUpd(set, 'limits', i, 'stage')} /> : null}
          </div>))}
        {d.effluent.limits.length < 20 ? <Btn kind="line" block icon="plus" onClick={() => effAdd(set, 'limits', { param: '', unit: 'mg/L', limit: '', sample: '', schedule: 'Monthly', stage: '' })}>Add a limit</Btn> : null}
        {isRp ? <>
          <div className="sect">Geo-reference (Tables 1A / 1B)</div>
          {d.effluent.coords.map((c, i) => <div key={i} className="lineitem"><LineHead n={i + 1} onDel={() => effDel(set, 'coords', i)} /><div className="grid2"><Select label="Table" value={c.table} onChange={effUpd(set, 'coords', i, 'table')} options={['1A', '1B']} /><Text label="Vertex" value={c.vertex} onChange={effUpd(set, 'coords', i, 'vertex')} /></div>
            <div className="grid2"><Num label="Easting" value={c.easting} onChange={effUpd(set, 'coords', i, 'easting')} /><Num label="Northing" value={c.northing} onChange={effUpd(set, 'coords', i, 'northing')} /></div></div>)}
          <Btn kind="line" block icon="pin" onClick={() => effAdd(set, 'coords', { table: '1A', vertex: String.fromCharCode(65 + d.effluent.coords.length), easting: '', northing: '' })}>Add a vertex</Btn>
          <div className="sect">Discharge sources (Table 1B / 2)</div>
          {d.effluent.sources.map((s, i) => <div key={i} className="lineitem"><LineHead n={i + 1} onDel={() => effDel(set, 'sources', i)} /><Text label="Discharge source" value={s.source} onChange={effUpd(set, 'sources', i, 'source')} /><Text label="Receiving unit" value={s.unit} onChange={effUpd(set, 'sources', i, 'unit')} />
            <div className="grid2"><Num label="X" value={s.x} onChange={effUpd(set, 'sources', i, 'x')} /><Num label="Y" value={s.y} onChange={effUpd(set, 'sources', i, 'y')} /></div></div>)}
          {d.effluent.sources.length < 6 ? <Btn kind="line" block icon="plus" onClick={() => effAdd(set, 'sources', { source: '', unit: '', x: '', y: '' })}>Add a source</Btn> : null}
        </> : null}
      </> : null}
    </>
  );
}

/* ------------------------------------------------------------------ clearance */
function ClearanceForm({ d, set }) {
  const { T, L } = useApp();
  const co = T.companies.find(c => eqi(c['Company Name'], d.company));
  const lines = d.lines;
  const qw = useMemo(() => { try { return co ? quotaWarnings(T, d.company, co['Company ID'], d.date, lines.filter(l => !l.id)) : []; } catch { return []; } }, [T, co, d.company, d.date, lines]);
  const fee = useMemo(() => feeCalc(lines.filter(l => (trim(l.rec) || trim(l.std)) && trim(l.qty) !== '').map(l => ({ chemical: l.rec || l.std, chemical_standard: l.std && !/other/i.test(l.std) ? l.std : '', quantity: l.qty, unit: l.unit })), T.hazards || [], L.chemicals, L.hazardCats, L.hazardIndex), [lines, T.hazards, L]);
  const kg = lines.reduce((a, l) => a + num(clrKg(l.qty, l.unit)), 0);
  const lics = co ? T.licences.filter(l => l['Company ID'] === co['Company ID'] && /CIL|Importation/i.test(l['Licence Category'] + l['Licence / Certificate Type'])) : [];
  const licChems = co ? [...new Set(T.licenceChemicals.filter(x => lics.some(l => l['Record ID'] === x['Licence Record ID'])).map(x => x['Trade or IUPAC Name']))] : [];
  return (
    <>
      <CompanyPick value={d.company} onChange={upd(set, 'company')} />
      {co ? <div className="statusline" style={{ marginTop: -6 }}><Icon n="badge" s={14} /> {lics.length ? `${lics.length} importation licence(s): ${lics.map(l => l['Licence / Certificate No.'] || l['Record ID']).join(', ')}` : 'No Chemical Importation Licence on record'}</div> : null}
      <div className="grid2"><DateIn label="Clearance date" req value={d.date} onChange={upd(set, 'date')} /><DateIn label="ETA" value={d.eta} onChange={upd(set, 'eta')} allowText /></div>
      <Text label="EPA Ref. No." value={d.ref} onChange={upd(set, 'ref')} hint="EPA letter number, e.g. ED/EPA-01/388/26/RL (needed on the printed letter)" />
      <Text label="B/L / Invoice / AWB No." value={d.bl} onChange={upd(set, 'bl')} hint="Default for all lines – type a different one on a line if needed" />
      <Text label="Remarks" value={d.remarks} onChange={upd(set, 'remarks')} hint="Applies to all lines" />
      <div className="sect">Chemicals ({lines.length}/20)<span className="sp" />{kg ? <span className="nowrap">{money(kg / 1000, 3)} MT</span> : null}</div>
      {lines.map((l, i) => {
        const sug = !l.std && trim(l.rec).length > 2 ? stdChem(l.rec, L.chemicals, 2) : [];
        const hz = lineHazard(l.std, l.qty, l.unit, T.hazards || [], L.hazardCats);
        return (
          <div key={i} className="lineitem">
            <LineHead n={i + 1} onDel={lines.length > 1 ? () => delLine(set, 'lines', i) : null}>{`Line ${i + 1}${l.id ? ' · ' + l.id : ''}`}</LineHead>
            <Picker label="Chemical as recorded" value={l.rec} onChange={v => set(x => ({ ...x, lines: x.lines.map((y, j) => (j === i ? { ...y, rec: v, std: y.std || (stdChem(v, L.chemicals, 1)[0]?.score >= 0.85 ? stdChem(v, L.chemicals, 1)[0].name : '') } : y)) }))}
              options={[...licChems, ...L.chemicals].filter((v, k, a) => a.indexOf(v) === k)} free title="Chemical (as written on the document)" />
            <Picker label="Chemical (standard)" value={l.std} onChange={setLine(set, 'lines', i, 'std')} options={L.chemicals} title="Standard chemical name" />
            {sug.length ? <div className="chips" style={{ marginTop: -6 }}>{sug.map(s => <button key={s.name} className="chip" onClick={() => setLine(set, 'lines', i, 'std')(s.name)}>✨ {s.name} <span className="n">{Math.round(s.score * 100)}%</span></button>)}</div> : null}
            <div className="grid2"><Num label="Quantity" req value={l.qty} onChange={setLine(set, 'lines', i, 'qty')} /><Select label="Unit" req value={l.unit} onChange={setLine(set, 'lines', i, 'unit')} options={L.units} /></div>
            <Text label="B/L / invoice No. (blank = same as above)" value={l.bl} onChange={setLine(set, 'lines', i, 'bl')} />
            {hz ? <div className="small" style={{ margin: '-4px 2px 8px', color: hz.level === 'bad' ? 'var(--red)' : hz.level === 'warn' ? 'var(--amber)' : 'var(--muted)' }}>⚗ {hz.text}</div> : null}
          </div>
        );
      })}
      {lines.length < 20 ? <Btn kind="line" block icon="plus" onClick={() => addLine(set, 'lines', { rec: '', std: '', qty: '', unit: 'kg', bl: '' })}>Add a chemical</Btn> : null}
      {qw.length ? <Note kind="warn"><b>Licence quota check</b><ul>{qw.map((w, i) => <li key={i}>{w}</li>)}</ul></Note> : co && lines.some(l => trim(l.qty)) ? <Note kind="ok">Licence quota check: no problem found.</Note> : null}
      {fee.lines.length ? <Card title="Fee estimate (RI/C&E-002-04/20)">
        <div className="flex between"><span className="muted small">Qp = R × Hi × Qi</span><b style={{ fontSize: 18 }}>{fee.total ? usd(fee.total) : '–'}</b></div>
        {fee.missing ? <div className="small" style={{ color: 'var(--amber)' }}>{fee.missing} line(s) need an HMIS rating / fee category in Chemical Hazards.</div> : null}
      </Card> : null}
    </>
  );
}

/* ------------------------------------------------------------------ bill */
function BillForm({ d, set, id }) {
  const { T, D, L } = useApp();
  const co = T.companies.find(c => eqi(c['Company Name'], d.company));
  const info = useMemo(() => { if (!co) return null; const bs = D.bills.filter(b => b.coId === co['Company ID'] && b.no !== id); return { n: bs.length, billed: bs.reduce((a, b) => a + b.billed, 0), out: bs.reduce((a, b) => a + (b.isPaid ? 0 : b.out), 0) }; }, [co, D, id]);
  const svcs = servicesForType(d.type, L.billTypes, L.services);
  const total = d.lines.reduce((a, l) => a + num(l.amount), 0);
  const refUsed = trim(d.ref) ? T.bills.find(b => eqi(b['Bill Ref. No.'], d.ref) && b['Bill No.'] !== id) : null;
  const g = groupOfType(d.type, L.billTypes);
  const [pickRec, setPickRec] = useState(false);
  const recs = co ? [...T.licences.filter(l => l['Company ID'] === co['Company ID']).map(l => ({ value: l['Record ID'], label: `${l['Record ID']} – ${l['Licence / Certificate Type'] || l['Licence Category']}`, sub: (l['Licence / Certificate No.'] || 'no licence no.') + (T.bills.some(b => String(b['Linked Record']).includes(l['Record ID'])) ? ' · already billed' : '') })),
    ...[...new Set(T.clearances.filter(c => c['Company ID'] === co['Company ID']).map(c => c['Clearance No.']))].map(n => ({ value: n, label: n + ' – clearance', sub: T.bills.some(b => String(b['Linked Record']).includes(n)) ? 'already billed' : '' }))] : [];
  const pickCompany = v => { const c = T.companies.find(x => x['Company Name'] === v); const prev = T.bills.filter(b => eqi(b['Company Name'], v) && b['Contact Person']).sort((a, b) => (toDate(b['Bill Date']) || 0) - (toDate(a['Bill Date']) || 0))[0];
    set(x => ({ ...x, company: v, location: c ? c['Location'] : x.location, activity: x.activity || (c ? c['Sector / Activity'] : ''), contact: x.contact || (prev ? prev['Contact Person'] : ''), title: x.title || (prev ? prev['Contact Title'] : '') })); };
  return (
    <>
      <CompanyPick value={d.company} onChange={pickCompany} />
      {info ? <div className="statusline" style={{ marginTop: -6 }}>{co['Company ID']} · {info.n} previous bill(s) · billed {usd(info.billed)} · outstanding {usd(info.out)}</div> : null}
      <div className="grid2"><DateIn label="Bill date" req value={d.date} onChange={upd(set, 'date')} /><Select label="Bill type" req value={d.type} onChange={upd(set, 'type')} options={L.billTypes.map(b => ({ value: b.type, label: b.type }))} /></div>
      <Text label="Bill Ref. No." value={d.ref} onChange={upd(set, 'ref')} err={refUsed ? `Already used on ${refUsed['Bill No.']} – each bill needs its own reference` : ''} hint="EPA letter reference, e.g. ED/EPA-01/03336/26/RL" />
      <div className="grid2"><Text label="Contact person" value={d.contact} onChange={upd(set, 'contact')} placeholder="e.g. Mr. Isaac Bestman" /><Text label="Position / title" value={d.title} onChange={upd(set, 'title')} placeholder="e.g. General Manager" /></div>
      <div className="grid2"><Text label="Location" value={d.location} onChange={upd(set, 'location')} /><Text label="Activity" value={d.activity} onChange={upd(set, 'activity')} /></div>
      <Text label="Linked record(s)" value={d.linked} onChange={upd(set, 'linked')} hint="LIC-### / CLN-### – links the bill to the licence or clearance" />
      <div className="sect">Services ({d.lines.length}/10)<span className="sp" /><span className="nowrap">{usd(total)}</span></div>
      {d.lines.map((l, i) => {
        const sg = feeFor(l.service, L.services), lg = l.service ? groupOfType(typeFor(l.service, L.services), L.billTypes) : '';
        return (
          <div key={i} className="lineitem">
            <LineHead n={i + 1} onDel={d.lines.length > 1 ? () => delLine(set, 'lines', i) : null}>{`Line ${i + 1}${l.id ? ' · ' + l.id : ''}`}</LineHead>
            <Picker label="Service" req value={l.service} onChange={v => set(x => ({ ...x, type: x.type || typeFor(v, L.services), lines: x.lines.map((y, j) => (j === i ? { ...y, service: v, amount: y.amount || (feeFor(v, L.services) ?? '') + '' } : y)) }))}
              options={svcs.map(s => ({ value: s.service, label: s.service, sub: [s.fee !== null ? 'suggested ' + usd(s.fee) : '', s.notes].filter(Boolean).join(' · ') }))} free warn={g && lg && g !== lg ? `This is a ${lg} service but the bill type is ${g}` : ''} />
            <Text label="Details / chemical(s)" value={l.details} onChange={setLine(set, 'lines', i, 'details')} />
            <Num label="Amount (US$)" req value={l.amount} onChange={setLine(set, 'lines', i, 'amount')} hint={sg !== null && num(l.amount) !== sg ? `Suggested fee ${usd(sg)}` : ''} />
          </div>
        );
      })}
      {d.lines.length < 10 ? <div className="btns"><Btn kind="line" icon="plus" onClick={() => addLine(set, 'lines', { service: '', details: '', amount: '' })}>Add a service</Btn>
        {co && recs.length ? <Btn kind="line" icon="link" onClick={() => setPickRec(true)}>Add a saved record</Btn> : null}</div> : null}
      {pickRec ? <PickSheet title="Bill a licence or clearance" opts={recs} onClose={() => setPickRec(false)} onPick={id => { setPickRec(false); const l = billLineFor(T, id, L.services); if (!l) return;
        const lg = groupOfType(typeFor(l.service, L.services), L.billTypes); if (g && lg && g !== lg) { alertBox({ title: 'Different bill type', message: `${l.service} cannot go on a ${d.type} bill. Save or clear this bill first.` }); return; }
        set(x => ({ ...x, type: x.type || typeFor(l.service, L.services), linked: x.linked ? x.linked + ', ' + id : id, lines: [...x.lines.filter(y => trim(y.service)), { service: l.service, details: l.details, amount: l.amount === null ? '' : String(l.amount) }] })); }} /> : null}
      <Card title="Total"><div className="flex between"><span className="muted">US$</span><b style={{ fontSize: 22 }}>{money(total)}</b></div>{total > 0 ? <div className="small muted mt">{amountInWords(total)} UNITED STATES DOLLARS</div> : null}</Card>
    </>
  );
}

/* ------------------------------------------------------------------ payment */
function PaymentForm({ d, set, id }) {
  const { T, D, L } = useApp();
  const opts = useMemo(() => [...D.bills].sort((a, b) => (a.isPaid - b.isPaid) || (b.date || 0) - (a.date || 0)).map(b => ({ value: b.no, label: `${b.no} – ${b.co}`, sub: `${b.isPaid ? 'paid' : 'outstanding ' + usd(b.out)} · ${b.type || b.purpose.join(', ')}`, keys: b.ref })), [D]);
  const st = d.bill ? billStatus(T, d.bill) : null;
  const own = id ? T.payments.find(p => p['Record ID'] === id) : null;
  const bal = st ? st.bal + (own && own['Bill No.'] === st.bn ? num(own['Amount (USD)']) : 0) : 0;
  const recUsed = trim(d.receipt) ? T.payments.find(p => eqi(p['Receipt No.'], d.receipt) && p['Record ID'] !== id) : null;
  return (
    <>
      <Picker label="Bill No. (paying for)" value={d.bill} onChange={v => { const s = billStatus(T, v); set(x => ({ ...x, bill: v, company: v ? s.co : x.company, amount: x.amount || (s.bal ? String(Math.round(s.bal * 100) / 100) : ''), purpose: x.purpose || s.purpose })); }} options={opts} title="Choose the bill"
        hint={!d.bill ? 'Leave empty for a payment on the company account (not linked to a bill).' : ''} />
      {!d.bill ? <CompanyPick value={d.company} onChange={upd(set, 'company')} label="Company (payment on the company account)" /> : null}
      {st && st.co ? <Card><KV items={[['Company', st.co], ['Billed', usd(st.billed)], ['Paid so far', usd(st.paid - (own && own['Bill No.'] === st.bn ? num(own['Amount (USD)']) : 0))], ['Balance', <b key="b">{usd(bal)}</b>], ['For', st.purpose]]} /></Card> : null}
      <div className="grid2"><Num label="Amount (US$)" req value={d.amount} onChange={upd(set, 'amount')} warn={st && num(d.amount) > bal + 0.005 ? `More than the balance ${usd(bal)}` : ''} /><DateIn label="Payment date" req value={d.date} onChange={upd(set, 'date')} /></div>
      <Text label="Receipt No." value={d.receipt} onChange={upd(set, 'receipt')} warn={recUsed ? `Already recorded on ${recUsed['Record ID']}` : ''} hint="From the payment slip / receipt" />
      <Picker label="Purpose / services" req={!d.bill} value={d.purpose} onChange={upd(set, 'purpose')} options={L.purposes} free />
      <Text label="Remarks" area value={d.remarks} onChange={upd(set, 'remarks')} />
      {num(d.amount) > 0 ? <div className="small muted">{amountInWords(d.amount)} UNITED STATES DOLLARS</div> : null}
    </>
  );
}

/* ------------------------------------------------------------------ issue, correspondence, inspection, contact, hazard */
function IssueForm({ d, set }) {
  const { L } = useApp();
  return (<>
    <Select label="Register" value={d.register} onChange={upd(set, 'register')} options={L.registers.length ? L.registers : ['Companies', 'Licences & Certificates', 'Chemical Clearances', 'Bills & Invoices', 'Payments & Receipts']} />
    <Text label="Record(s)" value={d.record} onChange={upd(set, 'record')} placeholder="e.g. LIC-029, CLN-141" />
    <Text label="Issue found" req area value={d.issue} onChange={upd(set, 'issue')} />
    <Text label="Action taken" area value={d.action} onChange={upd(set, 'action')} />
    <Select label="Follow-up status" value={d.status} onChange={upd(set, 'status')} options={L.issueStatus} />
  </>);
}
function CorrForm({ d, set }) {
  const { L } = useApp();
  return (<>
    <CompanyPick value={d.company} onChange={upd(set, 'company')} />
    <Picker label="Type" req value={d.type} onChange={upd(set, 'type')} options={L.corrTypes?.length ? L.corrTypes : ['Reminder Letter', 'Violation Notice', 'Shutdown Notice', 'Other']} free />
    <Text label="Activity" value={d.activity} onChange={upd(set, 'activity')} placeholder="e.g. Transportation" />
    <Text label="Description" area value={d.description} onChange={upd(set, 'description')} />
    <div className="grid2"><Text label="EPA reference No." value={d.ref} onChange={upd(set, 'ref')} /><DateIn label="Date issued" value={d.date} onChange={upd(set, 'date')} /></div>
  </>);
}
const INSP_TYPES = ['Routine inspection', 'Licence application site visit', 'Follow-up inspection', 'Complaint investigation', 'Clearance verification (port)', 'Fumigation check', 'Effluent sampling', 'Chemical storage audit', 'Transport (vehicle) check', 'Emergency / spill response'];
function InspectionForm({ d, set, photos, setPhotos }) {
  const { T } = useApp();
  const [busy, run] = useBusy();
  const co = T.companies.find(c => eqi(c['Company Name'], d.company));
  const recs = co ? [...T.licences.filter(l => l['Company ID'] === co['Company ID']).map(l => ({ value: l['Record ID'], label: `${l['Record ID']} – ${l['Licence / Certificate Type'] || l['Licence Category']}` })),
    ...[...new Set(T.clearances.filter(c => c['Company ID'] === co['Company ID']).map(c => c['Clearance No.']))].map(n => ({ value: n, label: n + ' – clearance' }))] : [];
  return (<>
    <CompanyPick value={d.company} onChange={v => { const c = T.companies.find(x => x['Company Name'] === v); set(x => ({ ...x, company: v, site: x.site || (c ? c['Location'] : '') })); }} req={false} free />
    <Text label="Site / facility" req value={d.site} onChange={upd(set, 'site')} />
    <div className="grid2"><DateIn label="Inspection date" req value={d.date} onChange={upd(set, 'date')} /><Picker label="Type" value={d.type} onChange={upd(set, 'type')} options={INSP_TYPES} free /></div>
    {recs.length ? <Picker label="Linked record" value={d.linked} onChange={upd(set, 'linked')} options={recs} free /> : <Text label="Linked record" value={d.linked} onChange={upd(set, 'linked')} />}
    <div className="field"><label>Compliance</label><Seg value={d.compliance} onChange={upd(set, 'compliance')} options={['Compliant', 'Partly compliant', 'Not compliant', 'Not assessed']} /></div>
    <Text label="Findings" area value={d.findings} onChange={upd(set, 'findings')} />
    <Text label="Actions required" area value={d.actions} onChange={upd(set, 'actions')} />
    <DateIn label="Follow-up date" value={d.followUp} onChange={upd(set, 'followUp')} />
    <Card title="Location (GPS)">
      {d.lat !== null && d.lat !== '' && d.lat !== undefined ? <div className="flex between"><span><b>{d.lat}, {d.lng}</b><div className="small muted">± {d.acc} m</div></span><Btn sm kind="ghost" onClick={() => set(x => ({ ...x, lat: null, lng: null, acc: null }))}>Clear</Btn></div> : <div className="small muted mb">Stand at the site and capture the position.</div>}
      <Btn block kind="line" icon="pin" disabled={busy} onClick={() => run(async () => { const g = await getGps(); set(x => ({ ...x, ...g })); }, 'Position captured')}>{busy ? 'Getting the GPS position…' : 'Capture GPS position'}</Btn>
    </Card>
    <Card title={`Photos (${photos.length})`}>
      <div className="small muted mb">Uploaded to Google Drive (folder “CMU Inspection Photos”) with the inspection.</div>
      <div className="flex wrap2" style={{ flexWrap: 'wrap' }}>{photos.map((p, i) => <div key={i} style={{ position: 'relative' }}><img src={'data:image/jpeg;base64,' + p.data} alt="" style={{ width: 86, height: 86, objectFit: 'cover', borderRadius: 10 }} /><button className="ib" style={{ position: 'absolute', top: -6, right: -6, width: 28, height: 28, background: 'var(--surface)', borderRadius: 14 }} onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}><Icon n="close" s={14} /></button></div>)}</div>
      <Btn block kind="line" icon="camera" className="mt" onClick={() => run(async () => { const b = await takePhoto('Inspection photo', 1280); if (b) setPhotos(ps => [...ps, { data: b, taken: new Date().toISOString() }]); })}>Add a photo</Btn>
    </Card>
  </>);
}
function ContactForm({ d, set }) {
  return (<>
    <Note>Contact for <b>{d.company}</b> ({d.coId}). Used for the weekly email reminders, calls, WhatsApp and the Gmail email log.</Note>
    <Text label="Contact person" value={d.person} onChange={upd(set, 'person')} />
    <Text label="Email (several: separate with ;)" type="email" value={d.email} onChange={upd(set, 'email')} />
    <Text label="Phone" type="tel" value={d.phone} onChange={upd(set, 'phone')} placeholder="+231 …" />
    <Toggle label="Send reminders" sub="Weekly email reminders about licences to renew and unpaid bills" value={d.send} onChange={upd(set, 'send')} />
  </>);
}
function HazardForm({ d, set }) {
  const { L } = useApp();
  return (<>
    <Note kind="warn">Take the HMIS ratings from the chemical’s Safety Data Sheet (SDS / MSDS) – never guess them. They drive the fee estimate (Qp = R × Hi × Qi).</Note>
    <Text label="Chemical (standard)" value={d.name} onChange={upd(set, 'name')} disabled={!!d.name && L.chemicals.includes(d.name)} />
    <Text label="CAS No." value={d.cas} onChange={upd(set, 'cas')} />
    <div className="grid3"><Num label="Health" value={d.h} onChange={upd(set, 'h')} /><Num label="Flammability" value={d.f} onChange={upd(set, 'f')} /><Num label="Physical" value={d.p} onChange={upd(set, 'p')} /></div>
    <Select label="HMIS rating used for the fee (0–4)" value={String(d.hmis)} onChange={upd(set, 'hmis')} options={['0', '1', '2', '3', '4']} hint={d.h !== '' ? `Highest of the three: ${Math.max(num(d.h), num(d.f), num(d.p))}` : ''} />
    <Select label="Fee category" value={d.cat} onChange={upd(set, 'cat')} options={(L.hazardCats || []).map(c => ({ value: c.name, label: `${c.name} – US$${c.rate} per ${c.basis}` }))} />
    <Text label="Main hazards / handling notes" area value={d.notes} onChange={upd(set, 'notes')} />
    <Text label="SDS source & date" value={d.sds} onChange={upd(set, 'sds')} />
  </>);
}

/* ------------------------------------------------------------------ bill wizard (Bill_New) */
export function BillWizard({ company }) {
  const { T, L, D } = useApp(), nav = useNav();
  const [kind, setKind] = useState(null);
  const [renew, setRenew] = useState(null);
  const K = BILL_KINDS.find(k => k.k === kind);
  const start = (link) => {
    let lt = K.lt; if (renew && K.renew && !K.renewNoType) lt = 'Licence – Renewal';
    if (link) return nav.replace('form', { type: 'bill', op: 'create', fromIds: [link], prefill: { type: lt } });
    const lines = K.svc.map((s, i) => ({ service: s, details: i === 0 && K.details ? K.details : '', amount: (feeFor(s, L.services) ?? '') + '' }));
    nav.replace('form', { type: 'bill', op: 'create', prefill: { type: lt, lines, company: company || '' } });
  };
  const linkable = K && K.link === 'LIC' ? T.licences.filter(l => (!company || eqi(l['Company Name'], company)) && svcFor(l['Licence Category'], l['Licence / Certificate Type']) === K.svc[0])
    .sort((a, b) => String(b['Record ID']).localeCompare(String(a['Record ID']))).map(l => ({ id: l['Record ID'], t1: l['Company Name'], t2: `${l['Record ID']} · ${l['Licence / Certificate No.'] || 'no licence no.'}`, billed: T.bills.some(b => String(b['Linked Record']).includes(l['Record ID'])) }))
    : K && K.link === 'CLN' ? [...new Set(T.clearances.filter(c => !company || eqi(c['Company Name'], company)).map(c => c['Clearance No.']))].sort().reverse().map(n => { const c = T.clearances.find(x => x['Clearance No.'] === n); return { id: n, t1: c['Company Name'], t2: `${n} · ${fmtD(c['Clearance Date'])}`, billed: T.bills.some(b => String(b['Linked Record']).includes(n)) }; }) : [];
  const step = !K ? 1 : K.renew && renew === null ? 2 : 3;
  return (
    <>
      <Bar title="Create new bill" sub={`Step ${step} of 3${company ? ' · ' + company : ''}`} onBack={() => (step === 1 ? nav.back() : step === 2 ? setKind(null) : K.renew ? setRenew(null) : setKind(null))} />
      <main className="main noNav"><div className="wrap">
        {step === 1 ? <><div className="sect">What kind of bill?</div><div className="list">{BILL_KINDS.map(k => <Row key={k.k} icon={k.link === 'CLN' ? 'flask' : k.k === 6 ? 'drop' : k.k === 8 ? 'truck' : k.k === 9 ? 'flag' : 'badge'} t1={k.label} t2={k.svc.map(s => s + (feeFor(s, L.services) !== null ? ` (${usd(feeFor(s, L.services))})` : '')).join(' + ')} onClick={() => setKind(k.k)} />)}</div></> : null}
        {step === 2 ? <><div className="sect">{K.label}</div><div className="list"><Row icon="refresh" t1="Renewal" t2={K.renewNoType ? 'Renewal of the licence' : 'Renewal letter (Licence – Renewal)'} onClick={() => setRenew(true)} /><Row icon="plus" t1="New application" t2="New application letter" onClick={() => setRenew(false)} /></div></> : null}
        {step === 3 ? <>
          <div className="sect">{K.label}{renew ? ' – renewal' : ''}</div>
          {K.link ? <><div className="small muted mb">Optional: link the saved {K.link === 'CLN' ? 'clearance' : 'licence'} – the company, service, details and fee are filled in, and the record is marked as billed.</div>
            <div className="list" style={{ maxHeight: '50vh', overflowY: 'auto' }}>{linkable.slice(0, 80).map(x => <Row key={x.id} icon={K.link === 'CLN' ? 'flask' : 'badge'} t1={x.t1} t2={x.t2} right={x.billed ? <Badge tone="amber">billed</Badge> : ''} onClick={() => start(x.id)} />)}
              {!linkable.length ? <div className="empty small">No matching saved record.</div> : null}</div></> : null}
          <Btn block kind={K.link ? 'line' : 'accent'} icon="chev" onClick={() => start(null)}>{K.link ? 'Continue without a link' : 'Continue'}</Btn>
        </> : null}
      </div></main>
    </>
  );
}
