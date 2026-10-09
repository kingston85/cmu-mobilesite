// Record shapes: register rows (as in the sheet) <-> form data (what the phone edits and uploads),
// and the "overlay" that shows records saved on the phone (not uploaded yet) inside the registers straight away.
import { str, trim, num, isNum, iso, nextId, billStatus, eqi } from './logic';

export const TYPES = {
  company: { label: 'Company', reg: 'Companies', idCol: 'Company ID', icon: 'building' },
  licence: { label: 'Licence / certificate', reg: 'Licences & Certificates', idCol: 'Record ID', icon: 'badge' },
  clearance: { label: 'Chemical clearance', reg: 'Chemical Clearances', idCol: 'Clearance No.', icon: 'flask' },
  bill: { label: 'Bill', reg: 'Bills & Invoices', idCol: 'Bill No.', icon: 'receipt' },
  payment: { label: 'Payment', reg: 'Payments & Receipts', idCol: 'Record ID', icon: 'cash' },
  issue: { label: 'Data issue', reg: 'Notes & Issues', idCol: 'Issue #', icon: 'flag' },
  correspondence: { label: 'Correspondence', reg: 'Correspondence', idCol: 'Record ID', icon: 'mail' },
  inspection: { label: 'Field inspection', reg: 'Mobile Inspections', idCol: 'Inspection ID', icon: 'pin' },
  contact: { label: 'Company contact', reg: 'Company Contacts', idCol: 'Company ID', icon: 'user' },
  hazard: { label: 'Chemical hazard', reg: 'Chemical Hazards', idCol: 'name', icon: 'warn' },
};

export const EFF_SETTINGS = ['Receiving water', 'Max. volume (m³/day)', 'Discharge point / facility'];

/* ------------------------------------------------------------------ empty forms */
export const blank = {
  company: () => ({ name: '', sector: '', location: '', other: '' }),
  licence: () => ({ company: '', category: '', type: '', location: '', applicationDate: '', responseDate: '', refCode: '', licNo: '', issued: '', expiry: '', remarks: '',
    chemicals: [], vehicles: [], effluent: { settings: EFF_SETTINGS.map(item => ({ item, value: '' })), limits: [], coords: [], sources: [] } }),
  clearance: () => ({ company: '', date: iso(new Date()), ref: '', bl: '', remarks: '', eta: '', lines: [{ rec: '', std: '', qty: '', unit: 'kg', bl: '' }] }),
  bill: () => ({ company: '', date: iso(new Date()), type: '', ref: '', contact: '', title: '', location: '', activity: '', linked: '', lines: [{ service: '', details: '', amount: '' }] }),
  payment: () => ({ bill: '', company: '', amount: '', date: iso(new Date()), receipt: '', remarks: '', purpose: '' }),
  issue: () => ({ register: '', record: '', issue: '', action: '', status: 'Open' }),
  correspondence: () => ({ company: '', type: '', activity: '', description: '', ref: '', date: iso(new Date()) }),
  inspection: () => ({ company: '', site: '', date: iso(new Date()), type: 'Routine inspection', linked: '', compliance: '', findings: '', actions: '', followUp: '', lat: null, lng: null, acc: null }),
  contact: () => ({ coId: '', company: '', person: '', email: '', phone: '', send: true }),
  hazard: () => ({ name: '', cas: '', h: '', f: '', p: '', hmis: '', cat: '', notes: '', sds: '' }),
};

/* ------------------------------------------------------------------ register rows -> form data (to edit a record) */
export function toForm(type, T, id) {
  const S = v => str(v);
  switch (type) {
    case 'company': { const r = T.companies.find(x => x['Company ID'] === id); return r && { name: S(r['Company Name']), sector: S(r['Sector / Activity']), location: S(r['Location']), other: S(r['Other Names Recorded']) }; }
    case 'licence': {
      const r = T.licences.find(x => x['Record ID'] === id); if (!r) return null;
      const ef = (T.licenceEffluent || []).filter(x => x['Licence Record ID'] === id);
      const sec = s => ef.filter(x => x['Section'] === s).sort((a, b) => num(a['Line']) - num(b['Line']));
      const settings = EFF_SETTINGS.map((item, i) => { const x = sec('Setting').find(y => num(y['Line']) === i + 1); return { item, value: x ? S(x['Field 2']) : '' }; });
      return {
        company: S(r['Company Name']), category: S(r['Licence Category']), type: S(r['Licence / Certificate Type']), location: S(r['Location']),
        applicationDate: S(r['Application Date']), responseDate: S(r['Response Date']), refCode: S(r['Reference Code']), licNo: S(r['Licence / Certificate No.']),
        issued: S(r['Date Issued']), expiry: S(r['Expiry Date']), remarks: S(r['Remarks']),
        chemicals: T.licenceChemicals.filter(x => x['Licence Record ID'] === id).map(x => ({ name: S(x['Trade or IUPAC Name']), epaReg: S(x['EPA Registration No.']), type: S(x['Type']), qty: S(x['Stipulated Qty']), unit: S(x['Unit']), consignment: S(x['Consignment Ref. (BL/IPD No.)']) })),
        vehicles: (T.licenceVehicles || []).filter(x => x['Licence Record ID'] === id).map(x => ({ type: S(x['Vehicle Type']), reg: S(x['Vehicle Registration No.']), epaReg: S(x['EPA Registration No.']) })),
        effluent: { settings,
          limits: sec('Limit').map(x => ({ param: S(x['Field 1']), unit: S(x['Field 2']), limit: S(x['Field 3']), sample: S(x['Field 4']), schedule: S(x['Field 5']), stage: S(x['Field 6']) })),
          coords: sec('Coordinate').map(x => ({ table: S(x['Field 1']), vertex: S(x['Field 2']), easting: S(x['Field 3']), northing: S(x['Field 4']) })),
          sources: sec('Source').map(x => ({ source: S(x['Field 1']), unit: S(x['Field 2']), x: S(x['Field 3']), y: S(x['Field 4']) })) },
      };
    }
    case 'clearance': {
      const ls = T.clearances.filter(x => x['Clearance No.'] === id); if (!ls.length) return null; const r = ls[0];
      return { company: S(r['Company Name']), date: S(r['Clearance Date']), ref: S(r['Clearance Ref. No.']), bl: S(r['B/L / Invoice / AWB No.']), remarks: S(r['Remarks']), eta: S(r['ETA']),
        lines: ls.map(x => ({ id: S(x['Record ID']), rec: S(x['Chemical as Recorded']), std: S(x['Chemical (Standard)']), qty: S(x['Qty as Recorded']), unit: S(x['Unit']), bl: S(x['B/L / Invoice / AWB No.']) })) };
    }
    case 'bill': {
      const ls = T.bills.filter(x => x['Bill No.'] === id); if (!ls.length) return null; const r = ls[0];
      return { company: S(r['Company Name']), date: S(r['Bill Date']), type: S(r['Bill Type']), ref: S(r['Bill Ref. No.']), contact: S(r['Contact Person']), title: S(r['Contact Title']),
        location: S(r['Location']), activity: S(r['Activity']), linked: S(r['Linked Record']),
        lines: ls.map(x => ({ id: S(x['Bill ID']), service: S(x['Purpose / Licence Billed']), details: S(x['Chemical']), amount: S(x['Amount Billed (USD)']) })) };
    }
    case 'payment': { const r = T.payments.find(x => x['Record ID'] === id); return r && { bill: S(r['Bill No.']), company: S(r['Company Name']), amount: S(r['Amount (USD)']), date: S(r['Payment Date']), receipt: S(r['Receipt No.']), remarks: S(r['Remarks']), purpose: S(r['Purpose / Services']) }; }
    case 'issue': { const r = (T.issues || []).find(x => String(x['Issue #']) === String(id)); return r && { register: S(r['Register']), record: S(r['Record']), issue: S(r['Issue Found']), action: S(r['Action Taken']), status: S(r['Follow-up Status']), source: S(r['Source']) }; }
    case 'correspondence': { const r = (T.correspondence || []).find(x => x['Record ID'] === id); return r && { company: S(r['Company Name']), type: S(r['Type']), activity: S(r['Activity']), description: S(r['Description']), ref: S(r['EPA Reference No.']), date: S(r['Date Issued']) }; }
    case 'inspection': { const r = (T.inspections || []).find(x => x['Inspection ID'] === id); return r && { company: S(r['Company']), site: S(r['Site / Facility']), date: S(r['Inspection Date']), type: S(r['Inspection Type']), linked: S(r['Linked Record']), compliance: S(r['Compliance']), findings: S(r['Findings']), actions: S(r['Actions Required']), followUp: S(r['Follow-up Date']), lat: r['Latitude'] === '' ? null : r['Latitude'], lng: r['Longitude'] === '' ? null : r['Longitude'], acc: r['GPS Accuracy (m)'] === '' ? null : r['GPS Accuracy (m)'] }; }
    case 'contact': { const c = T.companies.find(x => x['Company ID'] === id); const r = (T.contacts || []).find(x => x['Company ID'] === id) || {}; return { coId: id, company: c ? c['Company Name'] : S(r['Company Name']), person: S(r['Contact Person']), email: S(r['Email (several: separate with ;)']), phone: S(r['Phone']), send: !/^no$/i.test(S(r['Send reminders?'])) }; }
    case 'hazard': { const r = (T.hazards || []).find(x => eqi(x.name, id)); return r ? { name: r.name, cas: S(r.cas), h: S(r.h), f: S(r.f), p: S(r.p), hmis: S(r.hmis), cat: S(r.cat), notes: S(r.notes), sds: S(r.sds) } : { ...blank.hazard(), name: id }; }
  }
  return null;
}
/** the rows the record had when it was opened (sent with an update so the server can spot desktop changes) */
export function baseOf(type, T, id) {
  switch (type) {
    case 'company': return T.companies.find(x => x['Company ID'] === id);
    case 'licence': return T.licences.find(x => x['Record ID'] === id);
    case 'clearance': return T.clearances.filter(x => x['Clearance No.'] === id);
    case 'bill': return T.bills.filter(x => x['Bill No.'] === id);
    case 'payment': return T.payments.find(x => x['Record ID'] === id);
    case 'issue': return (T.issues || []).find(x => String(x['Issue #']) === String(id));
    case 'correspondence': return (T.correspondence || []).find(x => x['Record ID'] === id);
    default: return null;
  }
}

/* ------------------------------------------------------------------ overlay: pending records shown in the registers */
const coIdOf = (T, name) => { const c = T.companies.find(x => eqi(x['Company Name'], name)); return c ? c['Company ID'] : ''; };
function rowsFor(type, d, id, T, pend) {
  const P = { _pending: true, _cid: pend.cid, _status: pend.status, _op: pend.op };
  const src = 'Saved on this phone';
  switch (type) {
    case 'company': return { companies: [{ ...P, 'Company ID': id, 'Company Name': trim(d.name), 'Sector / Activity': d.sector, 'Location': d.location, 'Other Names Recorded': d.other }] };
    case 'licence': {
      const coId = coIdOf(T, d.company);
      const out = { licences: [{ ...P, 'Record ID': id, 'Company ID': coId, 'Company Name': d.company, 'Name as Recorded': d.company, 'Licence Category': d.category, 'Licence / Certificate Type': d.type, 'Location': d.location,
        'Application Date': d.applicationDate, 'Response Date': d.responseDate, 'Reference Code': d.refCode, 'Licence / Certificate No.': d.licNo, 'Date Issued': d.issued, 'Expiry Date': d.expiry, 'Remarks': d.remarks, 'Source': src }] };
      if (d.chemicals) out.licenceChemicals = d.chemicals.filter(c => trim(c.name)).map(c => ({ ...P, 'Licence Record ID': id, 'Trade or IUPAC Name': c.name, 'EPA Registration No.': c.epaReg, 'Type': c.type, 'Stipulated Qty': isNum(c.qty) ? num(c.qty) : c.qty, 'Unit': c.unit, 'Consignment Ref. (BL/IPD No.)': c.consignment }));
      if (d.vehicles) out.licenceVehicles = d.vehicles.filter(v => trim(v.type) || trim(v.reg)).map(v => ({ ...P, 'Licence Record ID': id, 'Vehicle Type': v.type, 'Vehicle Registration No.': v.reg, 'EPA Registration No.': v.epaReg }));
      if (d.effluent) {
        const e = d.effluent, ef = [], add = (s, ln, f) => ef.push({ ...P, 'Licence Record ID': id, Section: s, Line: ln, 'Field 1': f[0] || '', 'Field 2': f[1] || '', 'Field 3': f[2] || '', 'Field 4': f[3] || '', 'Field 5': f[4] || '', 'Field 6': f[5] || '' });
        (e.settings || []).forEach((s, i) => { if (trim(s.value)) add('Setting', i + 1, [s.item, s.value]); });
        (e.limits || []).filter(l => trim(l.param)).forEach((l, i) => add('Limit', i + 1, [l.param, l.unit, l.limit, l.sample, l.schedule, l.stage]));
        (e.coords || []).filter(c => [c.table, c.vertex, c.easting, c.northing].some(trim)).forEach((c, i) => add('Coordinate', i + 1, [c.table, c.vertex, c.easting, c.northing]));
        (e.sources || []).filter(s => trim(s.source)).forEach((s, i) => add('Source', i + 1, [s.source, s.unit, s.x, s.y]));
        out.licenceEffluent = ef;
      }
      return out;
    }
    case 'clearance': {
      const coId = coIdOf(T, d.company); let n = 0;
      return { clearances: (d.lines || []).filter(l => trim(l.rec) || trim(l.std)).map(l => ({ ...P, 'Record ID': l.id || `${id}·${++n}`, 'Clearance No.': id, 'Company ID': coId, 'Company Name': d.company,
        'Chemical as Recorded': trim(l.rec) || l.std, 'Chemical (Standard)': l.std, 'Qty as Recorded': isNum(l.qty) ? num(l.qty) : l.qty, 'Unit': l.unit, 'B/L / Invoice / AWB No.': trim(l.bl) || d.bl,
        'Clearance Ref. No.': d.ref, 'Clearance Date': d.date, 'Remarks': d.remarks, 'ETA': d.eta, 'Source': src })) };
    }
    case 'bill': {
      const coId = coIdOf(T, d.company); let n = 0;
      return { bills: (d.lines || []).filter(l => trim(l.service)).map(l => ({ ...P, 'Bill ID': l.id || `${id}·${++n}`, 'Bill No.': id, 'Company ID': coId, 'Company Name': d.company, 'Name as Recorded': d.company,
        'Purpose / Licence Billed': l.service, 'Chemical': l.details, 'Amount Billed (USD)': num(l.amount), 'Bill Date': d.date, 'Bill Type': d.type, 'Bill Ref. No.': d.ref, 'Contact Person': d.contact,
        'Contact Title': d.title, 'Location': d.location, 'Activity': d.activity, 'Linked Record': d.linked, 'Source': src })) };
    }
    case 'payment': {
      const st = trim(d.bill) ? billStatus(T, d.bill) : { bn: '', co: d.company, coId: coIdOf(T, d.company), purpose: '' };
      return { payments: [{ ...P, 'Record ID': id, 'Company ID': st.coId, 'Company Name': st.co, 'Name as Recorded': st.co, 'Purpose / Services': d.purpose || st.purpose, 'Amount (USD)': num(d.amount),
        'Payment Date': d.date, 'Receipt No.': d.receipt, 'Record Group': 'Form entry', 'Remarks': d.remarks, 'Source': src, 'Bill No.': st.bn }] };
    }
    case 'issue': return { issues: [{ ...P, 'Issue #': id, Register: d.register, Record: d.record, Source: d.source || src, 'Issue Found': d.issue, 'Action Taken': d.action, 'Follow-up Status': d.status }] };
    case 'correspondence': return { correspondence: [{ ...P, 'Record ID': id, 'Company ID': coIdOf(T, d.company), 'Company Name': d.company, 'Name as Recorded': d.company, Type: d.type, Activity: d.activity, Description: d.description, 'EPA Reference No.': d.ref, 'Date Issued': d.date }] };
    case 'inspection': return { inspections: [{ ...P, 'Inspection ID': id, 'Inspection Date': d.date, 'Company ID': coIdOf(T, d.company), Company: d.company, 'Site / Facility': d.site, 'Inspection Type': d.type,
      'Linked Record': d.linked, Compliance: d.compliance, Findings: d.findings, 'Actions Required': d.actions, 'Follow-up Date': d.followUp, Latitude: d.lat ?? '', Longitude: d.lng ?? '', 'GPS Accuracy (m)': d.acc ?? '', Photos: '', Inspector: 'this phone', Recorded: '' }] };
    case 'contact': return { contacts: [{ ...P, 'Company ID': d.coId, 'Company Name': d.company, 'Contact Person': d.person, 'Email (several: separate with ;)': d.email, Phone: d.phone, 'Send reminders?': d.send ? 'Yes' : 'No' }] };
    case 'hazard': return { hazards: [{ ...P, name: d.name, cas: d.cas, h: d.h, f: d.f, p: d.p, hmis: d.hmis, cat: d.cat, notes: d.notes, sds: d.sds }] };
  }
  return {};
}
const KEYS = {   // how each table's rows belong to a record
  company: { companies: 'Company ID' },
  licence: { licences: 'Record ID', licenceChemicals: 'Licence Record ID', licenceVehicles: 'Licence Record ID', licenceEffluent: 'Licence Record ID' },
  clearance: { clearances: 'Clearance No.' }, bill: { bills: 'Bill No.' }, payment: { payments: 'Record ID' }, issue: { issues: 'Issue #' },
  correspondence: { correspondence: 'Record ID' }, inspection: { inspections: 'Inspection ID' }, contact: { contacts: 'Company ID' }, hazard: { hazards: 'name' },
};
const PRE = { company: ['companies', 'Company ID', 'CMU-'], licence: ['licences', 'Record ID', 'LIC-'], clearance: ['clearances', 'Clearance No.', 'CLN-'], payment: ['payments', 'Record ID', 'PAY-'],
  issue: ['issues', 'Issue #', 'ISS-'], correspondence: ['correspondence', 'Record ID', 'COR-'], inspection: ['inspections', 'Inspection ID', 'INS-'] };
export function provisionalId(type, T) {
  if (type === 'bill') return nextId(T.bills, 'Bill No.', 'BN-' + new Date().getFullYear() + '-');
  const p = PRE[type]; return p ? nextId(T[p[0]] || [], p[1], p[2]) : '';
}
/** tables + pending items → what the phone shows */
export function applyPending(T, items) {
  let out = { ...T };
  for (const it of items) {
    if (it.status === 'ok') continue;
    const keys = KEYS[it.type]; if (!keys) continue;
    const id = it.op === 'create' ? (it.tempId || provisionalId(it.type, out)) : it.id;
    const idOf = it.type === 'contact' ? it.data.coId : it.type === 'hazard' ? it.data.name : id;
    for (const [tbl, col] of Object.entries(keys)) {
      if (it.op === 'create' && !(it.type === 'contact' || it.type === 'hazard')) continue;
      out[tbl] = (out[tbl] || []).filter(r => String(r[col]).toLowerCase() !== String(idOf).toLowerCase() || r._pending);
    }
    if (it.op === 'delete') continue;
    const rows = rowsFor(it.type, it.data, idOf, out, it);
    for (const [tbl, rs] of Object.entries(rows)) out[tbl] = [...(out[tbl] || []), ...rs];
  }
  return out;
}
