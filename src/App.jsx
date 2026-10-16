import { useEffect, useState } from 'react';
import { AppProvider, NavProvider, useApp, useNav } from './lib/store';
import { DialogHost, Toast, Icon, Sheet, Loading } from './components/ui';
import { onNotificationTap, tap } from './lib/device';
import { Connect, Lock } from './screens/Start';
import Home from './screens/Home';
import Registers, { GlobalSearch } from './screens/Registers';
import { CompanyView, LicenceView, ClearanceView, BillView, PaymentView, IssueView, InspectionView, CorrespondenceView } from './screens/Details';
import { FormScreen, BillWizard } from './screens/Forms';
import * as Tools from './screens/Tools';
import Assistant from './screens/Assistant';
import Inbox from './screens/Inbox';
import * as More from './screens/More';

const ROUTES = {
  home: Home, registers: Registers, search: GlobalSearch,
  company: CompanyView, licence: LicenceView, clearance: ClearanceView, bill: BillView, payment: PaymentView, issue: IssueView, inspection: InspectionView, correspondence: CorrespondenceView,
  form: FormScreen, billWizard: BillWizard,
  tools: Tools.ToolsHub, fee: Tools.FeeCalc, quota: Tools.Quota, insights: Tools.Insights, monthly: Tools.Monthly, annual: Tools.Annual, analytics: Tools.Analytics,
  verify: Tools.Verify, dupcheck: Tools.DupCheck, stdnames: Tools.StdNames, hazards: Tools.Hazards, words: Tools.Words, datacheck: Tools.DataCheck, activity: Tools.Activity,
  documents: Tools.Documents, feeschedule: Tools.FeeSchedule, contacts: Tools.Contacts, reminders: Tools.Reminders, emails: Tools.Emails,
  assistant: Assistant, inbox: Inbox,
  more: More.MoreHub, settings: More.Settings, account: More.Account, outbox: More.Outbox, admin: More.Admin, officers: More.Officers, help: More.Help,
};
const TABS = [['home', 'home', 'Home'], ['registers', 'list', 'Registers'], ['add', 'plus', ''], ['tools', 'tools', 'Tools'], ['more', 'more', 'More']];

function AddSheet({ onClose }) {
  const nav = useNav(), { canEdit } = useApp();
  const go = (n, p) => { onClose(); nav.go(n, p); };
  const items = [
    ['flask', 'Chemical clearance', 'Up to 20 chemicals, quota check', () => go('form', { type: 'clearance', op: 'create' })],
    ['badge', 'Licence / certificate', 'CRL, CIL, EDL, transport, fumigation', () => go('form', { type: 'licence', op: 'create' })],
    ['receipt', 'Bill', 'Step-by-step bill wizard', () => go('billWizard')],
    ['cash', 'Payment', 'Against a bill, receipt check', () => go('form', { type: 'payment', op: 'create' })],
    ['building', 'Company', 'With duplicate check', () => go('form', { type: 'company', op: 'create' })],
    ['pin', 'Field inspection', 'GPS + photos', () => go('form', { type: 'inspection', op: 'create' })],
    ['mail', 'Correspondence', 'Reminder, violation, shutdown notice', () => go('form', { type: 'correspondence', op: 'create' })],
    ['flag', 'Data issue', 'Notes & Issues log', () => go('form', { type: 'issue', op: 'create' })],
    ['sparkle', 'Read a document', 'Photo / PDF → filled form (Claude)', () => go('assistant', { mode: 'doc' })],
  ];
  return (
    <Sheet title="Add a record" onClose={onClose}>
      {!canEdit ? <div className="note warn">Your account is view-only.</div> : null}
      <div className="list">{items.map(([ic, t, s, fn]) => <button key={t} className="row" disabled={!canEdit} onClick={() => { tap(); fn(); }}><span className="ic"><Icon n={ic} s={20} /></span><span className="tx"><span className="t1">{t}</span><span className="t2">{s}</span></span><Icon n="chev" s={16} /></button>)}</div>
    </Sheet>
  );
}

function Shell() {
  const { ready, session, locked, pending } = useApp();
  const nav = useNav();
  const [adding, setAdding] = useState(false);
  useEffect(() => onNotificationTap(x => { if (x.kind === 'licence') nav.go('licence', { id: x.id }); else if (x.kind === 'bill') nav.go('bill', { id: x.id }); else nav.tab('home'); }), [nav]);
  if (!ready) return <div className="splash"><Loading text="Opening the CMU Database…" /></div>;
  if (!session) return <Connect />;
  if (locked) return <Lock />;
  const { top } = nav, Screen = ROUTES[top.name] || Home;
  const rootTab = nav.stack[0].name, showNav = nav.stack.length === 1 || ['registers', 'tools', 'more'].includes(top.name) && nav.stack.length === 1;
  return (
    <div className="app">
      <Screen key={top.key} {...top.params} />
      {showNav ? (
        <nav className="nav">
          {TABS.map(([k, ic, lb]) => k === 'add'
            ? <button key={k} className="fab" onClick={() => { tap(); setAdding(true); }} aria-label="Add a record"><span className="c"><Icon n="plus" s={26} w={2.4} /></span></button>
            : <button key={k} className={rootTab === k ? 'on' : ''} onClick={() => { tap(); nav.tab(k); }}><Icon n={ic} />{lb}{k === 'more' && pending.length ? <span className="dot">{pending.length}</span> : null}</button>)}
        </nav>
      ) : null}
      {adding ? <AddSheet onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavProvider>
        <Shell />
        <DialogHost />
        <Toast />
      </NavProvider>
    </AppProvider>
  );
}
