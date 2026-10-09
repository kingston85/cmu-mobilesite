// UI kit: icons, app bar, buttons, inputs, searchable pickers, sheets, dialogs, toast, tiles, list rows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { pushOverlay } from '../lib/overlay';
import { useApp, useNav } from '../lib/store';
import { tap } from '../lib/device';

/* ------------------------------------------------------------------ icons (24×24 stroke icons) */
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  plus: 'M12 5v14M5 12h14', tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  more: 'M4 6h16M4 12h16M4 18h16', back: 'M15 18l-6-6 6-6', close: 'M18 6 6 18M6 6l12 12', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M21 4v5h-5M3 20v-5h5', check: 'M20 6 9 17l-5-5', chev: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18',
  badge: 'M12 2l2.4 1.6 2.9-.2.9 2.8 2.4 1.7-1 2.7 1 2.8-2.4 1.6-.9 2.8-2.9-.2L12 22l-2.4-1.6-2.9.2-.9-2.8-2.4-1.6 1-2.8-1-2.7L5.8 7l.9-2.8 2.9.2zM9 12l2 2 4-4',
  flask: 'M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7 15h10',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3', cash: 'M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v.01M18 15v.01',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5', mail: 'M3 5h18v14H3zM3 6l9 7 9-7', pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7',
  warn: 'M12 3 2 20h20zM12 9v5M12 17v.01', info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.01', bell: 'M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4M6 6h1M17 6h1M6 17h1', camera: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6', pdf: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 15h2a1.5 1.5 0 0 0 0-3H8v5M13 12v5h1.5a2.5 2.5 0 0 0 0-5zM18 12h-2v5M16 14.5h1.5',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z', share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3', copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', pie: 'M12 3v9h9a9 9 0 1 1-9-9zM15 3.4A9 9 0 0 1 20.6 9H15z', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  calc: 'M5 3h14v18H5zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01', scale: 'M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0zM8 21h8',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  sort: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4', download: 'M12 3v12M7 10l5 5 5-5M5 21h14', upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z', shield: 'M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6z', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  key: 'M14 10a5 5 0 1 0-4.9 4H11v2h2v2h3v-3l-2.1-2.1A5 5 0 0 0 14 10zM8 9v.01', gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  cloud: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z', cloudOff: 'M3 3l18 18M7 18a5 5 0 0 1-1.6-9.7M10 6.3A6 6 0 0 1 19 10a4 4 0 0 1 1.9 7.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  whatsapp: 'M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9c0 3 3 6 6 6l1.2-1.2-2-1-1 .9a5 5 0 0 1-2.9-2.9l.9-1-1-2z', map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z', hash: 'M5 9h14M5 15h14M10 3 8 21M16 3l-2 18',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5', truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2', moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z', send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  attach: 'M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8', star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', refresh: 'M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M20 4v4h-4M4 20v-4h4',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M5 21 16 10l-2-2L3 19zM19 13v2M18 14h2', target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11v2',
  dup: 'M8 8h12v12H8zM4 16V4h12', words: 'M4 7V5h16v2M9 19h6M12 5v14', convert: 'M7 7h13l-4-4M17 17H4l4 4',
};
export function Icon({ n, s = 22, w = 2, style, className }) {
  const d = P[n] || P.info;
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">{d.split(/(?=M)/).map((x, i) => <path key={i} d={x} />)}</svg>;
}

/* ------------------------------------------------------------------ app bar */
export function Bar({ title, sub, back = true, right, children, onBack }) {
  const nav = useNav(), { syncState, online, session } = useApp();
  return (
    <header className="bar">
      {back && nav.stack.length > 1 ? <button className="ib" onClick={() => { tap(); (onBack || nav.back)(); }} aria-label="Back"><Icon n="back" /></button> : <span style={{ width: 8 }} />}
      {children || <h1>{title}{sub ? <small>{sub}</small> : null}</h1>}
      {right}
      {session && !session.demo && (syncState.busy || !online) ? <span className={'syncdot ' + (syncState.busy ? 'busy' : 'off')} title={syncState.busy ? 'Syncing' : 'Offline'} style={{ marginRight: 8 }} /> : null}
      {syncState.busy ? <div className="progress"><i /></div> : null}
    </header>
  );
}

/* ------------------------------------------------------------------ buttons */
export const Btn = ({ kind = '', sm, block, icon, children, className, ...p }) => (
  <button {...p} className={['btn', kind, sm && 'sm', block && 'block', className].filter(Boolean).join(' ')} onClick={e => { tap(); p.onClick?.(e); }}>{icon ? <Icon n={icon} s={sm ? 16 : 19} /> : null}{children}</button>
);
export const IconBtn = ({ n, label, dot, ...p }) => <button className="ib" aria-label={label} title={label} {...p} onClick={e => { tap(); p.onClick?.(e); }}><Icon n={n} />{dot ? <span className="dot" /> : null}</button>;

/* ------------------------------------------------------------------ fields */
export function Field({ label, req, hint, warn, err, children }) {
  return <div className="field">{label ? <label>{label}{req ? <span className="req"> *</span> : null}</label> : null}{children}{err ? <div className="err">{err}</div> : warn ? <div className="warn">⚠ {warn}</div> : hint ? <div className="hint">{hint}</div> : null}</div>;
}
export function Text({ label, req, hint, warn, err, value, onChange, area, type = 'text', inputMode, placeholder, disabled, autoFocus, maxLength }) {
  const C = area ? 'textarea' : 'input';
  return <Field {...{ label, req, hint, warn, err }}><C className="in" type={area ? undefined : type} inputMode={inputMode} value={value ?? ''} placeholder={placeholder} disabled={disabled} autoFocus={autoFocus} maxLength={maxLength}
    onChange={e => onChange(e.target.value)} rows={area ? 3 : undefined} /></Field>;
}
export const Num = p => <Text {...p} type="text" inputMode="decimal" />;
export function DateIn({ label, req, hint, warn, err, value, onChange, allowText }) {
  const isDate = !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
  const [text, setText] = useState(!isDate);
  return (
    <Field {...{ label, req, hint, warn, err }}>
      <div className="flex">
        {text ? <input className="in" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="e.g. N/A" /> : <input className="in" type="date" value={isDate ? value || '' : ''} onChange={e => onChange(e.target.value)} />}
        {allowText ? <button type="button" className="btn ghost sm" onClick={() => setText(t => !t)}>{text ? 'Date' : 'Text'}</button> : null}
      </div>
    </Field>
  );
}
export function Select({ label, req, hint, warn, err, value, onChange, options, placeholder = 'Choose…' }) {
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  return <Field {...{ label, req, hint, warn, err }}><select className="in" value={value ?? ''} onChange={e => onChange(e.target.value)}><option value="">{placeholder}</option>
    {value && !opts.some(o => o.value === value) ? <option value={value}>{value}</option> : null}{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
}
export function Toggle({ label, sub, value, onChange }) {
  return <div className="toggle"><div className="grow"><div className="b" style={{ fontSize: 14.5 }}>{label}</div>{sub ? <div className="small muted">{sub}</div> : null}</div>
    <button type="button" className={'sw' + (value ? ' on' : '')} onClick={() => { tap(); onChange(!value); }} aria-pressed={!!value} /></div>;
}
export function Seg({ value, onChange, options }) {
  return <div className="seg">{options.map(o => { const v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label; return <button key={v} className={value === v ? 'on' : ''} onClick={() => { tap(); onChange(v); }}>{l}</button>; })}</div>;
}
export function Chips({ value, onChange, options }) {
  return <div className="chips">{options.map(o => <button key={o.value} className={'chip' + (value === o.value ? ' on' : '')} onClick={() => { tap(); onChange(o.value); }}>{o.label}{o.n !== undefined ? <span className="n">{o.n}</span> : null}</button>)}</div>;
}
/** searchable picker in a bottom sheet (companies, chemicals, bills…); free text allowed when `free` */
export function Picker({ label, req, hint, warn, err, value, onChange, options, placeholder = 'Choose…', free, title, render, sub }) {
  const [open, setOpen] = useState(false);
  const opts = useMemo(() => options.map(o => (typeof o === 'string' ? { value: o, label: o } : o)), [options]);
  const cur = opts.find(o => o.value === value);
  return (
    <Field {...{ label, req, hint, warn, err }}>
      <button type="button" className="in picker" onClick={() => { tap(); setOpen(true); }}>
        <span className={'v' + (value ? '' : ' ph')}>{value ? (cur ? cur.label : value) : placeholder}</span>
        {sub && cur?.sub ? <span className="small muted">{cur.sub}</span> : null}<Icon n="down" s={16} />
      </button>
      {open ? <PickSheet title={title || label} opts={opts} value={value} free={free} render={render} onClose={() => setOpen(false)} onPick={v => { onChange(v); setOpen(false); }} /> : null}
    </Field>
  );
}
export function PickSheet({ title, opts, value, free, onPick, onClose, render }) {
  const [q, setQ] = useState('');
  const k = q.trim().toLowerCase();
  const hits = (k ? opts.filter(o => (o.label + ' ' + (o.sub || '') + ' ' + (o.keys || '')).toLowerCase().includes(k)) : opts).slice(0, 300);
  return (
    <Sheet title={title} onClose={onClose} full>
      <div className="search"><Icon n="search" s={18} /><input autoFocus placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />{q ? <button className="ib" onClick={() => setQ('')}><Icon n="close" s={16} /></button> : null}</div>
      {free && k && !opts.some(o => o.label.toLowerCase() === k) ? <button className="row" onClick={() => onPick(q.trim())}><span className="ic"><Icon n="plus" s={18} /></span><span className="tx"><span className="t1">Use “{q.trim()}”</span><span className="t2">Not in the list</span></span></button> : null}
      <div className="list">
        {value ? <button className="row" onClick={() => onPick('')}><span className="tx"><span className="t1 muted">— Clear —</span></span></button> : null}
        {hits.map(o => (
          <button key={o.value} className="row" onClick={() => { tap(); onPick(o.value); }}>
            {render ? render(o) : <span className="tx"><span className="t1" style={{ whiteSpace: 'normal' }}>{o.label}</span>{o.sub ? <span className="t2">{o.sub}</span> : null}</span>}
            {o.value === value ? <Icon n="check" s={18} style={{ color: 'var(--green-2)' }} /> : null}
          </button>
        ))}
        {!hits.length ? <div className="empty small">No match.</div> : null}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ sheets & dialogs */
export function Sheet({ title, onClose, children, full, foot }) {
  useEffect(() => pushOverlay(onClose), [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={'sheet' + (full ? ' full' : '')} role="dialog" aria-label={title}>
        <div className="grab" />
        <div className="sh"><h3>{title}</h3><button className="ib" onClick={onClose} aria-label="Close"><Icon n="close" /></button></div>
        <div className="sb">{children}</div>
        {foot ? <div className="stickybar">{foot}</div> : null}
      </div>
    </>
  );
}
let dialogSet = null;
export function DialogHost() {
  const [d, setD] = useState(null);
  dialogSet = setD;
  const [val, setVal] = useState('');
  useEffect(() => { if (d) setVal(d.value || ''); }, [d]);
  useEffect(() => (d ? pushOverlay(() => { d.resolve(d.prompt ? null : false); setD(null); }) : undefined), [d]);
  if (!d) return null;
  const done = v => { d.resolve(v); setD(null); };
  return (
    <>
      <div className="scrim top" onClick={() => done(d.prompt ? null : false)} />
      <div className="dialog" role="alertdialog">
        {d.title ? <h3>{d.title}</h3> : null}
        {d.message ? <div className="msg">{d.message}</div> : null}
        {d.list?.length ? <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14 }}>{d.list.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul> : null}
        {d.prompt ? <input className="in mt" autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder={d.placeholder} inputMode={d.inputMode} /> : null}
        <div className="btns">
          {d.alert ? null : <Btn kind="ghost" onClick={() => done(d.prompt ? null : false)}>{d.cancel || 'Cancel'}</Btn>}
          <Btn kind={d.danger ? 'red' : d.okKind || ''} onClick={() => done(d.prompt ? val : true)}>{d.ok || 'OK'}</Btn>
        </div>
      </div>
    </>
  );
}
export const confirm = o => new Promise(resolve => dialogSet?.({ ...o, resolve }));
export const alertBox = o => new Promise(resolve => dialogSet?.({ ok: 'OK', ...o, alert: true, resolve }));
export const prompt = o => new Promise(resolve => dialogSet?.({ ...o, prompt: true, resolve }));

export function Toast() {
  const { toastMsg, setToastMsg } = useApp();
  if (!toastMsg) return null;
  return <div className={'toast ' + (toastMsg.kind || '')} onClick={() => setToastMsg(null)}>{toastMsg.kind === 'ok' ? <Icon n="check" s={18} /> : toastMsg.kind === 'error' || toastMsg.kind === 'warn' ? <Icon n="warn" s={18} /> : null}<span>{toastMsg.text}</span></div>;
}

/* ------------------------------------------------------------------ content blocks */
export const Card = ({ title, more, onMore, right, children, className = '', pad = true }) => (
  <div className={'card ' + className}>
    {title ? <div className="hd"><h3>{title}</h3>{right}{more ? <button className="more" onClick={onMore}>{more}</button> : null}</div> : null}
    {pad ? <div className="bd">{children}</div> : children}
  </div>
);
export const Kpi = ({ l, v, s, tone, onClick }) => <button className={'kpi ' + (tone || '')} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}><span className="bar2" /><div className="l">{l}</div><div className="v">{v}</div>{s ? <div className="s">{s}</div> : null}</button>;
export const Badge = ({ tone = '', children }) => <span className={'badge ' + tone}>{children}</span>;
export function Row({ icon, iconTone, t1, t2, t3, right, onClick, pending, children }) {
  const style = iconTone ? { background: `var(--${iconTone}-bg)`, color: `var(--${iconTone})` } : undefined;
  return (
    <button className={'row' + (pending ? ' pend' : '')} onClick={onClick ? () => { tap(); onClick(); } : undefined} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {icon ? <span className="ic" style={style}><Icon n={icon} s={20} /></span> : null}
      <span className="tx"><span className="t1">{t1}</span>{t2 ? <span className="t2">{t2}</span> : null}{t3 ? <span className="t3">{t3}</span> : null}{pending ? <span className="tag-pending">⏳ waiting to upload</span> : null}</span>
      {right !== undefined ? <span className="rt">{right}</span> : null}
      {children}
      {onClick ? <Icon n="chev" s={16} style={{ color: 'var(--faint)', flex: '0 0 auto' }} /> : null}
    </button>
  );
}
export const Empty = ({ icon = 'inbox', title, children }) => <div className="empty"><Icon n={icon} s={40} /><div className="b" style={{ color: 'var(--text)' }}>{title}</div>{children ? <div className="small mt">{children}</div> : null}</div>;
export const Note = ({ kind = '', icon, children }) => <div className={'note ' + kind}><Icon n={icon || (kind === 'ok' ? 'check' : kind ? 'warn' : 'info')} s={18} /><div className="grow">{children}</div></div>;
export const Loading = ({ text = 'Loading…' }) => <div className="loading"><span className="spin" /><span className="small">{text}</span></div>;
export const Sect = ({ children, right }) => <div className="sect"><span>{children}</span><span className="sp" />{right}</div>;
export function KV({ items }) {
  return <dl className="kv">{items.filter(x => x && x[1] !== undefined && x[1] !== null && x[1] !== '').map(([k, v], i) => <FragmentKV key={i} k={k} v={v} />)}</dl>;
}
const FragmentKV = ({ k, v }) => <><dt>{k}</dt><dd>{v}</dd></>;
export function Meter({ pct }) {
  const p = Math.max(0, Math.min(1, pct || 0)), tone = pct > 1.0000001 ? 'red' : pct >= 0.8 ? 'amber' : '';
  return <div className={'meter ' + tone}><i style={{ width: Math.round(p * 100) + '%' }} /></div>;
}
/** run an async action with a busy flag and error toast */
export function useBusy() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg, 'ok'); return r; } catch (e) { if (e?.message !== 'cancelled') toast(e.message || String(e), 'error', 5000); return undefined; } finally { if (live.current) setBusy(false); }
  };
  return [busy, run];
}
