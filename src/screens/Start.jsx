// First screen (connect to the CMU Database) and the PIN lock.
import { useState } from 'react';
import { useApp } from '../lib/store';
import { Btn, Icon, Text, Note, Seg, useBusy } from '../components/ui';
import { tap, buzz } from '../lib/device';

export function Connect() {
  const { connect, signIn, startDemo } = useApp();
  const [mode, setMode] = useState('link');
  const [url, setUrl] = useState('');
  const [who, setWho] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [busy, run] = useBusy();
  const okUrl = /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url.trim());
  return (
    <div className="splash">
      <div className="logo"><img src="./logo-mark.png" alt="" width="70" height="70" /></div>
      <h1>CMU Database</h1>
      <p style={{ marginTop: 6 }}>EPA Liberia · ERRS Department · Chemical Management Unit. Companies, licences, clearances, bills, payments and inspections – on your phone, online or offline.</p>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="bd" style={{ paddingTop: 14 }}>
          <Seg value={mode} onChange={setMode} options={[{ value: 'link', label: 'Connect' }, { value: 'pin', label: 'Sign in with PIN' }]} />
          <Text label="Database link (web app /exec URL)" value={url} onChange={setUrl} placeholder="https://script.google.com/macros/s/…/exec" hint="From the CMU Database sheet: Extensions ▸ Apps Script ▸ Deploy ▸ Manage deployments ▸ Web app URL." />
          {mode === 'link'
            ? <Text label="Your name (shown in the Activity Log)" value={who} onChange={setWho} placeholder="e.g. Sahr Emmanuel" />
            : <><Text label="Email" type="email" value={email} onChange={setEmail} /><Text label="PIN" type="password" inputMode="numeric" value={pin} onChange={setPin} hint="Given by a CMU admin (sheet “Mobile Users”)." /></>}
          {url && !okUrl ? <Note kind="warn">The link should start with https://script.google.com/ and end with /exec.</Note> : null}
          <Btn block kind="accent" disabled={busy || !okUrl || (mode === 'link' ? !who.trim() : !email || !pin)} icon="link"
            onClick={() => run(() => (mode === 'link' ? connect(url.trim(), who.trim()) : signIn(email.trim(), pin.trim(), url.trim())))}>{busy ? 'Connecting…' : 'Connect'}</Btn>
          <div className="hr" />
          <Btn block kind="ghost" icon="sparkle" disabled={busy} onClick={() => run(startDemo)}>Try with sample data</Btn>
          <div className="small muted mt center">Sample data is made up and never leaves the phone.</div>
        </div>
      </div>
      <div className="small" style={{ opacity: .7, marginTop: 'auto', paddingTop: 16, textAlign: 'center' }}>Version 2.0 · works with MobileAPI.gs v2</div>
    </div>
  );
}

export function Lock() {
  const { prefs, setLocked } = useApp();
  const [code, setCode] = useState('');
  const [bad, setBad] = useState(false);
  const press = k => {
    tap(); setBad(false);
    if (k === '⌫') return setCode(c => c.slice(0, -1));
    const n = (code + k).slice(0, 8); setCode(n);
    if (n.length >= String(prefs.lockPin).length) {
      if (n === String(prefs.lockPin)) { buzz('success'); setLocked(false); setCode(''); }
      else { buzz('error'); setBad(true); setTimeout(() => setCode(''), 250); }
    }
  };
  return (
    <div className="splash" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className="logo" style={{ marginTop: 30 }}><Icon n="lock" s={40} /></div>
      <h1 style={{ fontSize: 22 }}>CMU Database is locked</h1>
      <p>{bad ? 'Wrong PIN – try again' : 'Enter your app PIN'}</p>
      <div className="pindots">{String(prefs.lockPin).split('').map((_, i) => <i key={i} className={i < code.length ? 'on' : ''} />)}</div>
      <div className="pinpad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k ? <button key={i} onClick={() => press(k)}>{k}</button> : <span key={i} />)}</div>
    </div>
  );
}
