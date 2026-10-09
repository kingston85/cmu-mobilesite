// Made-up sample data for "Try with sample data": fictional companies, realistic structure. Nothing is sent anywhere.
import { iso } from './logic';

let seed = 20261009;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return iso(x); };
const p3 = n => String(n).padStart(3, '0');

export const LISTS = {
  categories: ['Chemical Registration (CRL)', 'Chemical Importation (CIL)', 'Effluent Discharge (EDL)', 'Dewatering & Sedimentation Pond', 'Fumigation', 'Chemical Transportation'],
  types: ['Chemical Registration', 'Chemical Importation', 'Effluent Discharge', 'Effluent Discharge & Retention Pond', 'Underground Mine Dewatering & Sedimentation Pond License', 'Fumigation Certificate', 'Fumigation Service Provider Accreditation', 'Annual Chemical Transportation License'],
  units: ['kg', 'MT', 'L', 'pcs'],
  chemicals: ['Acetic Acid', 'Activated Carbon', 'Ammonium Nitrate', 'Calcium Hypochlorite', 'Caustic Soda (Sodium Hydroxide)', 'Copper Sulphate', 'Cypermethrin', 'Deltamethrin', 'Diesel Fuel Additive',
    'Explosives (Emulsion)', 'Ferric Chloride', 'Glyphosate', 'Hydrated Lime', 'Hydrochloric Acid', 'Hydrogen Peroxide', 'Imidacloprid', 'Lead Nitrate', 'Methyl Bromide', 'Nitric Acid', 'Phosphine (Aluminium Phosphide)',
    'Polyacrylamide Flocculant', 'Sodium Cyanide', 'Sodium Metabisulphite', 'Sodium Nitrate', 'Sulphuric Acid', 'Paint & Solvents', 'Laboratory Reagents (assorted)', 'Other / Unspecified'],
  sectors: ['Agriculture', 'Beverages', 'Chemical / Fumigation', 'Chemical Importation', 'Construction', 'Distributor', 'Energy', 'Explosives', 'Fumigation', 'Manufacturing', 'Manufacturing (Paint)', 'Mining', 'Palm Plantation', 'Quarry', 'Rubber Plantation', 'Transportation', 'Wholesaler'],
  purposes: ['Chemical Registration License', 'Chemical Importation License', 'Chemical Registration & Importation License', 'Effluent Discharge License', 'Chemical Clearance', 'Chemical Transportation License', 'Fumigation Certificate', 'Penalty / Fine', 'Other'],
  recordGroups: ['Form entry', 'Jan–Jul audit record', 'Aug–Dec receipts', 'Upload receipts log'],
  parameters: ['pH', 'Biological Oxygen Demand (BOD₅)', 'Chemical Oxygen Demand (COD)', 'Turbidity', 'Oil and Grease', 'Total Suspended Solids', 'Total Dissolved Solids', 'WAD Cyanide', 'Free Cyanide', 'Total Cyanide', 'Temperature', 'Arsenic (As)', 'Cadmium (Cd)', 'Copper (Cu)', 'Iron (Fe)', 'Lead (Pb)', 'Mercury (Hg)', 'Zinc (Zn)', 'Sulphate'],
  effUnits: ['mg/L', 'NTU', '-', '°C', 'µS/cm', 'pH units', 'm³/day', 'MPN/100mL', 'CFU/100mL'],
  schedules: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Bi-annually', 'Annually'],
  billTypes: [
    { type: 'Licence – New Application', group: 'Licence', feeTable: true }, { type: 'Licence – Renewal', group: 'Licence', feeTable: true }, { type: 'Licence – Renewal Reminder', group: 'Licence', feeTable: true },
    { type: 'Chemical Clearance', group: 'Clearance', feeTable: false }, { type: 'Fumigation', group: 'Fumigation', feeTable: false }, { type: 'Chemical Transportation', group: 'Transportation', feeTable: false },
    { type: 'Penalty / Other', group: 'Other', feeTable: true }],
  services: [
    { service: 'Annual Chemical Registration License', group: 'Licence', fee: 1500, notes: '' }, { service: 'Chemical Importation License', group: 'Licence', fee: null, notes: 'Fee assessed case by case' },
    { service: 'Annual Effluent Discharge License', group: 'Licence', fee: 3050, notes: '' }, { service: 'Effluent Discharge and Dewatering License', group: 'Licence', fee: null, notes: '' },
    { service: 'Underground Mine Dewatering and Retention License', group: 'Licence', fee: null, notes: '' }, { service: 'Chemical Clearance', group: 'Clearance', fee: null, notes: 'Fee assessed case by case' },
    { service: 'Fumigation Certificate', group: 'Fumigation', fee: 275, notes: '' }, { service: 'Fumigation Service Provider Accreditation', group: 'Fumigation', fee: null, notes: '' },
    { service: 'Chemical Transportation License', group: 'Transportation', fee: null, notes: 'Depends on number of trucks' }, { service: 'Penalty / Fine', group: 'Other', fee: null, notes: '' }, { service: 'Other Service', group: 'Other', fee: null, notes: '' }],
  signatories: [{ key: 'Executive Director', name: '(sample) Executive Director', title: 'EXECUTIVE DIRECTOR/CEO' }, { key: 'Deputy Executive Director for Technical Services', name: '(sample) Deputy ED', title: 'DEPUTY EXECUTIVE DIRECTOR FOR TECHNICAL SERVICES' }],
  offices: [],
  hazardCats: [['Petrochemicals', 'kg', 0.05], ['Agrochemicals', 'kg', 0.15], ['Explosives', 'MT', 1.875], ['Laboratory Chemicals', 'kg', 0.05], ['Industrial Chemicals Class A', 'kg', 0.5], ['Industrial Chemicals Class B', 'kg', 0.4], ['Sodium Cyanide', 'MT', 6.5]].map(c => ({ name: c[0], basis: c[1], rate: c[2] })),
  hazardIndex: [[0, 1], [1, 1.5], [2, 2], [3, 2.5], [4, 3]].map(x => ({ hmis: x[0], hi: x[1] })),
  issueStatus: ['Open', 'Open – confirm', 'Verified', 'Closed'],
  registers: ['Companies', 'Licences & Certificates', 'Licence Chemicals', 'Chemical Clearances', 'Bills & Invoices', 'Payments & Receipts', 'Notes & Issues', 'Mobile Inspections'],
  corrTypes: ['Reminder Letter', 'Violation Notice', 'Shutdown Notice', 'Warning Letter', 'Compliance Order', 'Other'],
};
const HZ = { 'Sodium Cyanide': [4, 'Sodium Cyanide', '143-33-9'], 'Explosives (Emulsion)': [3, 'Explosives', ''], 'Ammonium Nitrate': [3, 'Explosives', '6484-52-2'], 'Caustic Soda (Sodium Hydroxide)': [3, 'Industrial Chemicals Class A', '1310-73-2'],
  'Sulphuric Acid': [3, 'Industrial Chemicals Class A', '7664-93-9'], 'Hydrochloric Acid': [3, 'Industrial Chemicals Class A', '7647-01-0'], 'Nitric Acid': [3, 'Industrial Chemicals Class A', '7697-37-2'], 'Hydrated Lime': [2, 'Industrial Chemicals Class B', '1305-62-0'],
  'Activated Carbon': [1, 'Industrial Chemicals Class B', '7440-44-0'], 'Lead Nitrate': [3, 'Industrial Chemicals Class A', '10099-74-8'], 'Copper Sulphate': [2, 'Industrial Chemicals Class B', '7758-98-7'], 'Glyphosate': [2, 'Agrochemicals', '1071-83-6'],
  'Cypermethrin': [2, 'Agrochemicals', '52315-07-8'], 'Deltamethrin': [2, 'Agrochemicals', '52918-63-5'], 'Imidacloprid': [2, 'Agrochemicals', '138261-41-3'], 'Methyl Bromide': [3, 'Agrochemicals', '74-83-9'],
  'Phosphine (Aluminium Phosphide)': [4, 'Agrochemicals', '20859-73-8'], 'Diesel Fuel Additive': [1, 'Petrochemicals', ''], 'Laboratory Reagents (assorted)': [2, 'Laboratory Chemicals', ''], 'Calcium Hypochlorite': [3, 'Industrial Chemicals Class B', '7778-54-3'],
  'Polyacrylamide Flocculant': [1, 'Industrial Chemicals Class B', '9003-05-8'], 'Hydrogen Peroxide': [3, 'Industrial Chemicals Class A', '7722-84-1'], 'Sodium Metabisulphite': [2, 'Industrial Chemicals Class B', '7681-57-4'] };

const COMPANIES = [
  ['Riverstone Gold Mining Inc.', 'Mining', 'Kokoya District, Bong County', 'Riverstone; Riverstone Gold'], ['Lofa Hills Mineral Resources', 'Mining', 'Voinjama, Lofa County', 'Lofa Hills; LHMR'],
  ['Atlantic Rubber Plantations', 'Rubber Plantation', 'Harbel, Margibi County', 'Atlantic Rubber'], ['Cestos Palm Oil Ltd.', 'Palm Plantation', 'Greenville, Sinoe County', 'Cestos Palm'],
  ['Mesurado Paints & Coatings', 'Manufacturing (Paint)', 'Bushrod Island, Monrovia', 'Mesurado Paints'], ['Bong Quarry Works', 'Quarry', 'Gbarnga, Bong County', ''],
  ['Capitol Agro Supplies', 'Agriculture', 'Red Light, Paynesville', 'Capitol Agro'], ['SafeHarbour Fumigation Services', 'Fumigation', 'Freeport of Monrovia', 'SafeHarbour'],
  ['Northern Explosives Liberia', 'Explosives', 'Yekepa, Nimba County', 'NEL'], ['Duport Chemical Distributors', 'Distributor', 'Duport Road, Paynesville', 'Duport Chemicals'],
  ['Sinkor Beverages Company', 'Beverages', '18th Street, Sinkor', 'Sinkor Beverages'], ['Grand Bassa Haulage', 'Transportation', 'Buchanan, Grand Bassa', 'GB Haulage'],
  ['Kakata Plastics Inc.', 'Manufacturing', 'Kakata, Margibi County', ''], ['Gbarpolu Gold Exploration', 'Mining', 'Bopolu, Gbarpolu County', 'GGE'],
  ['Westcoast Energy Liberia', 'Energy', 'Bushrod Island, Monrovia', 'Westcoast Energy'], ['Montserrado Water Treatment Co.', 'Chemical Importation', 'White Plains, Montserrado', 'MWTC'],
  ['St. Paul Construction Group', 'Construction', 'Bomi Highway, Montserrado', 'St Paul Construction'], ['Cape Mount Mining Corp.', 'Mining', 'Robertsport, Grand Cape Mount', 'Cape Mount Mining; CMMC'],
  ['Unity Wholesale Chemicals', 'Wholesaler', 'Waterside, Monrovia', 'Unity Wholesale'], ['Nimba Iron Ore Logistics', 'Transportation', 'Ganta, Nimba County', 'NIOL'],
  ['Pleebo Rubber Estate', 'Rubber Plantation', 'Pleebo, Maryland County', ''], ['Harper Agro-Chem Traders', 'Agriculture', 'Harper, Maryland County', 'Harper Agro'],
];

export function sampleSnapshot() {
  seed = 20261009;
  const companies = COMPANIES.map((c, i) => ({ 'Company ID': 'CMU-' + p3(i + 1), 'Company Name': c[0], 'Sector / Activity': c[1], Location: c[2], 'Other Names Recorded': c[3] }));
  const licences = [], licenceChemicals = [], licenceVehicles = [], licenceEffluent = [];
  let L = 0;
  const addLic = (co, cat, type, issuedOff, expOff, extra = {}) => {
    const id = 'LIC-' + p3(++L), no = extra.no ?? `EPA/${cat.match(/\((\w+)\)/)?.[1] || 'LIC'}-${p3(L)}/26`;
    licences.push({ 'Record ID': id, 'Company ID': co['Company ID'], 'Company Name': co['Company Name'], 'Name as Recorded': co['Company Name'], 'Licence Category': cat, 'Licence / Certificate Type': type,
      Location: co.Location, 'Application Date': d(issuedOff - int(10, 40)), 'Response Date': d(issuedOff - int(1, 8)), 'Reference Code': `ED/EPA-01/${p3(100 + L)}/26/RL`, 'Licence / Certificate No.': no,
      'Date Issued': issuedOff === null ? '' : d(issuedOff), 'Expiry Date': expOff === null ? '' : d(expOff), Remarks: extra.remarks || '', Source: 'Sample data', 'Bill No.': '' });
    return id;
  };
  companies.forEach((co, i) => {
    const crl = addLic(co, 'Chemical Registration (CRL)', 'Chemical Registration', -int(120, 280), [-12, 5, 18, 26, 44, 58, 85, 140][i % 8] + (i > 8 ? 60 : 0));
    const chems = ['Mining', 'Explosives'].includes(co['Sector / Activity']) ? ['Sodium Cyanide', 'Hydrated Lime', 'Activated Carbon', 'Caustic Soda (Sodium Hydroxide)', 'Explosives (Emulsion)'] :
      ['Agriculture', 'Palm Plantation', 'Rubber Plantation'].includes(co['Sector / Activity']) ? ['Glyphosate', 'Cypermethrin', 'Imidacloprid', 'Deltamethrin'] :
      co['Sector / Activity'] === 'Fumigation' ? ['Methyl Bromide', 'Phosphine (Aluminium Phosphide)'] : ['Sulphuric Acid', 'Hydrochloric Acid', 'Calcium Hypochlorite', 'Paint & Solvents', 'Hydrogen Peroxide'];
    chems.slice(0, int(2, 4)).forEach((ch, k) => licenceChemicals.push({ 'Licence Record ID': crl, 'Licence No.': '', Company: '', 'Trade or IUPAC Name': ch, 'EPA Registration No.': `EPA-CR-${p3(i + 1)}-${p3(k + 1)}`, Type: ch.includes('ide') ? 'Pesticide' : 'Industrial', 'Stipulated Qty': '', Unit: '', 'Consignment Ref. (BL/IPD No.)': '' }));
    if (i % 3 !== 2) {
      const cil = addLic(co, 'Chemical Importation (CIL)', 'Chemical Importation', -int(300, 340), int(-5, 200));
      chems.slice(0, 3).forEach((ch, k) => licenceChemicals.push({ 'Licence Record ID': cil, 'Licence No.': '', Company: '', 'Trade or IUPAC Name': ch, 'EPA Registration No.': `EPA-CI-${p3(i + 1)}-${p3(k + 1)}`, Type: '',
        'Stipulated Qty': ch === 'Sodium Cyanide' || ch.startsWith('Explosives') ? int(60, 240) : int(15, 70) * 1000, Unit: ch === 'Sodium Cyanide' || ch.startsWith('Explosives') ? 'MT' : 'kg', 'Consignment Ref. (BL/IPD No.)': `BL-${int(1000, 9999)}` }));
    }
    if (co['Sector / Activity'] === 'Mining' && i % 2 === 0) {
      const edl = addLic(co, 'Effluent Discharge (EDL)', 'Effluent Discharge', -int(60, 200), int(10, 300));
      [['Setting', 1, 'Receiving water', 'the Farmington River'], ['Setting', 2, 'Max. volume (m³/day)', String(int(2, 40) * 50)]].forEach(s => licenceEffluent.push({ 'Licence Record ID': edl, Section: s[0], Line: s[1], 'Field 1': s[2], 'Field 2': s[3], 'Field 3': '', 'Field 4': '', 'Field 5': '', 'Field 6': '' }));
      [['pH', 'pH units', '6.0 – 9.0', 'Grab', 'Daily'], ['WAD Cyanide', 'mg/L', '0.5', 'Composite', 'Daily'], ['Total Suspended Solids', 'mg/L', '50', 'Composite', 'Weekly'], ['Lead (Pb)', 'mg/L', '0.1', 'Grab', 'Monthly']]
        .forEach((l, k) => licenceEffluent.push({ 'Licence Record ID': edl, Section: 'Limit', Line: k + 1, 'Field 1': l[0], 'Field 2': l[1], 'Field 3': l[2], 'Field 4': l[3], 'Field 5': l[4], 'Field 6': '' }));
    }
    if (co['Sector / Activity'] === 'Transportation' || i === 9) {
      const tr = addLic(co, 'Chemical Transportation', 'Annual Chemical Transportation License', -int(30, 120), int(60, 250));
      for (let k = 1; k <= 3; k++) licenceVehicles.push({ 'Licence Record ID': tr, 'Licence No.': '', Company: '', 'Vehicle Type': 'Heavy Duty Truck', 'Vehicle Registration No.': `TR-${int(1000, 9999)}`, 'EPA Registration No.': `EPA/CTP-${p3(i)}/T${k}` });
    }
    if (co['Sector / Activity'] === 'Fumigation') addLic(co, 'Fumigation', 'Fumigation Service Provider Accreditation', -40, 320);
  });
  addLic(companies[12], 'Chemical Registration (CRL)', 'Chemical Registration', null, null, { no: '', remarks: 'Application received – awaiting inspection' });

  const clearances = []; let R = 0, C = 0;
  for (let n = 0; n < 34; n++) {
    const co = companies[[0, 1, 13, 17, 8, 2, 3, 6, 9, 15, 4, 18, 0, 1, 17, 21][n % 16]];
    const cln = 'CLN-' + p3(++C), date = d(-int(2, 300)), lic = licenceChemicals.filter(x => licences.find(l => l['Record ID'] === x['Licence Record ID'] && l['Company ID'] === co['Company ID']));
    const names = lic.length ? lic.map(x => x['Trade or IUPAC Name']) : ['Sulphuric Acid', 'Hydrated Lime'];
    const nl = int(1, 3), bl = `MSCU${int(100000, 999999)}`;
    for (let k = 0; k < nl; k++) {
      const ch = names[(n + k) % names.length], unit = ch === 'Sodium Cyanide' || ch.startsWith('Explosives') ? 'MT' : pick(['kg', 'kg', 'MT', 'L']);
      const qty = unit === 'MT' ? int(5, 60) : unit === 'L' ? int(200, 4000) : int(500, 25000);
      clearances.push({ 'Record ID': 'CLR-' + p3(++R), 'Clearance No.': cln, 'Company ID': co['Company ID'], 'Company Name': co['Company Name'], 'Chemical as Recorded': ch + (k === 1 && n % 4 === 0 ? ' (technical grade)' : ''),
        'Chemical (Standard)': LISTS.chemicals.includes(ch) ? ch : 'Other / Unspecified', 'Qty as Recorded': qty, Unit: unit, 'Qty (kg)': '', 'Qty (MT)': '', 'B/L / Invoice / AWB No.': bl,
        'Clearance Ref. No.': n % 5 === 4 ? '' : `ED/EPA-01/0${5100 + n}/26/RL`, 'Clearance Date': date, Remarks: '', Source: 'Sample data', ETA: d(-int(0, 300)), 'Bill No.': '' });
    }
  }
  const bills = [], payments = []; let B = 0, BI = 0, P = 0;
  const billFor = (co, off, type, lines, ref, paidShare) => {
    const bn = `BN-${new Date().getFullYear()}-${p3(++B)}`;
    lines.forEach(([svc, det, amt]) => bills.push({ 'Bill ID': 'BIL-' + p3(++BI), 'Bill No.': bn, 'Company ID': co['Company ID'], 'Company Name': co['Company Name'], 'Name as Recorded': co['Company Name'], Activity: co['Sector / Activity'],
      Location: co.Location, 'Purpose / Licence Billed': svc, Chemical: det, 'Amount Billed (USD)': amt, 'Bill Date': d(off), 'Company Total Billed (USD)': '', 'Company Total Paid (USD)': '', 'Payment Status': '',
      Source: 'Sample data', 'Bill Ref. No.': ref, 'Contact Person': pick(['Mr. James Kollie', 'Mrs. Musu Kamara', 'Mr. Alfred Toe', 'Ms. Comfort Johnson']), 'Contact Title': pick(['General Manager', 'HSE Manager', 'Country Director']),
      'Bill Type': type, 'Paid on this Bill (USD)': '', 'Bill Status': '', 'Linked Record': '' }));
    const tot = lines.reduce((a, l) => a + l[2], 0);
    if (paidShare > 0) {
      const parts = paidShare === 1 && rnd() > 0.6 ? [tot * 0.5, tot * 0.5] : [Math.round(tot * paidShare * 100) / 100];
      parts.forEach((amt, k) => payments.push({ 'Record ID': 'PAY-' + p3(++P), 'Company ID': co['Company ID'], 'Company Name': co['Company Name'], 'Name as Recorded': co['Company Name'], 'Purpose / Services': lines.map(l => l[0]).join(', '),
        'Amount (USD)': Math.round(amt * 100) / 100, 'Payment Date': d(off + int(3, 25) + k * 10), 'Receipt No.': String(4400 + P * 7), 'Record Group': 'Form entry', Remarks: '', Source: 'Sample data', 'Bill No.': bn }));
    }
    return bn;
  };
  companies.slice(0, 20).forEach((co, i) => {
    billFor(co, -int(15, 260), i % 4 === 0 ? 'Licence – Renewal' : 'Licence – New Application', [['Annual Chemical Registration License', 'Licence renewal', 1500]].concat(i % 3 === 0 ? [['Chemical Importation License', 'Per RI/C&E-002-04/20', int(8, 60) * 100]] : []),
      `ED/EPA-01/0${3300 + i}/26/RL`, [1, 1, 0.5, 0, 1, 1, 0][i % 7]);
    if (i % 3 === 1) billFor(co, -int(5, 120), 'Chemical Clearance', [['Chemical Clearance', `${int(1, 3)} chemical line(s)`, int(4, 45) * 100]], `ED/EPA-01/0${3400 + i}/26/RL`, [0, 1, 0.4][i % 3]);
  });
  billFor(companies[7], -20, 'Fumigation', [['Fumigation Certificate', '40ft container – rice', 275]], 'ED/EPA-01/03511/26/RL', 0);
  billFor(companies[11], -75, 'Chemical Transportation', [['Chemical Transportation License', 'for a total of 3 trucks', 600]], 'ED/EPA-01/03512/26/RL', 0);
  const hazards = LISTS.chemicals.map(n => ({ name: n, cas: HZ[n]?.[2] || '', h: HZ[n] ? Math.min(4, HZ[n][0]) : '', f: HZ[n] ? int(0, 3) : '', p: HZ[n] ? int(0, 2) : '', hmis: HZ[n] ? HZ[n][0] : '', cat: HZ[n]?.[1] || '', notes: HZ[n] ? 'See SDS' : '', sds: HZ[n] ? 'Sample SDS 2026' : '' }));
  const issues = [
    { 'Issue #': 'ISS-001', Register: 'Licences & Certificates', Record: 'LIC-004', Source: 'Scanned licences p.4', 'Issue Found': 'Licence number on the scan differs from the register.', 'Action Taken': 'Register kept; asked the company for a copy.', 'Follow-up Status': 'Open – confirm' },
    { 'Issue #': 'ISS-002', Register: 'Chemical Clearances', Record: 'CLN-007', Source: 'Clearance letters p.12', 'Issue Found': 'Quantity unreadable on one line.', 'Action Taken': 'Entered with remark.', 'Follow-up Status': 'Open' },
    { 'Issue #': 'ISS-003', Register: 'Companies', Record: 'CMU-014', Source: 'Receipts log', 'Issue Found': 'Company recorded under two spellings.', 'Action Taken': 'Merged; other name added.', 'Follow-up Status': 'Closed' }];
  const correspondence = [{ 'Record ID': 'COR-001', 'Company ID': 'CMU-012', 'Company Name': companies[11]['Company Name'], 'Name as Recorded': companies[11]['Company Name'], Type: 'Violation Notice', Activity: 'Transportation', Description: 'Transport of chemicals without a valid transportation licence', 'EPA Reference No.': 'ED/EPA-01/0999/26/RL', 'Date Issued': d(-33) }];
  const inspections = [
    { 'Inspection ID': 'INS-001', 'Inspection Date': d(-12), 'Company ID': 'CMU-001', Company: companies[0]['Company Name'], 'Site / Facility': 'Processing plant & tailings dam', 'Inspection Type': 'Routine inspection', 'Linked Record': 'LIC-003', Compliance: 'Partly compliant', Findings: 'Cyanide store well secured; effluent sampling log incomplete for 2 weeks.', 'Actions Required': 'Complete the sampling log; submit monthly lab results.', 'Follow-up Date': d(18), Latitude: 6.9871, Longitude: -9.6123, 'GPS Accuracy (m)': 8, Photos: '', Inspector: 'Sample officer', Recorded: '' },
    { 'Inspection ID': 'INS-002', 'Inspection Date': d(-40), 'Company ID': 'CMU-008', Company: companies[7]['Company Name'], 'Site / Facility': 'Freeport warehouse 3', 'Inspection Type': 'Fumigation check', 'Linked Record': '', Compliance: 'Compliant', Findings: 'PPE and gas monitors available.', 'Actions Required': '', 'Follow-up Date': '', Latitude: 6.3421, Longitude: -10.7957, 'GPS Accuracy (m)': 12, Photos: '', Inspector: 'Sample officer', Recorded: '' }];
  const contacts = companies.map((c, i) => ({ 'Company ID': c['Company ID'], 'Company Name': c['Company Name'], 'Contact Person': i % 3 ? 'Mr. Sample Contact ' + (i + 1) : '', 'Email (several: separate with ;)': i % 3 ? `info@company${i + 1}.example` : '', Phone: i % 3 ? '+231 77' + int(1000000, 9999999) : '', 'Send reminders?': 'Yes', 'Last reminder sent': '' }));
  const activity = [{ when: d(0) + 'T08:00', who: 'sample (desktop)', action: 'Saved new', register: 'Chemical Clearances', record: 'CLN-034', details: 'Sample data' }];
  const inbox = [{ fid: 'sample-1', name: 'Invoice_INV-2231.pdf', source: 'Google Drive', type: 'clearance', company: companies[0]['Company Name'], summary: 'Invoice INV-2231: 24 MT sodium cyanide, B/L MSCU771234', status: 'To review', conf: 0.92, notes: '', record: '', when: d(0) + 'T07:40',
    data: { company: companies[0]['Company Name'], date: d(-1), epa_ref: '', bl_no: 'MSCU771234', lines: [{ chemical_as_recorded: 'Sodium Cyanide briquettes 98%', chemical_standard: 'Sodium Cyanide', quantity: 24, unit: 'MT', bl_no: 'MSCU771234' }] }, url: '' }];
  return {
    tables: { companies, licences, licenceChemicals, licenceVehicles, licenceEffluent, clearances, bills, payments, issues, correspondence, inspections, contacts, hazards, activity, inbox, emails: [] },
    lists: LISTS,
    settings: { version: 'sample', insAhead: 60, insBack: 30, allowDelete: true, open: true, reminders: { on: false, licDays: 30, billDays: 30, cc: '', sign: 'Chemical Management Unit, EPA Liberia' }, claude: { installed: false } },
    user: { name: 'Sample officer', role: 'admin', email: 'sample' },
  };
}
