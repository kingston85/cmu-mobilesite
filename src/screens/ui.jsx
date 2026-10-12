import { fmtD, money0 } from '../lib/util';

export function Header({ title, sub, back, right }) {
  return (
    <header className="top">
      {back && <button className="ghost" onClick={back} aria-label="Back">‹</button>}
      <div className="grow"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {right}
    </header>
  );
}
export const Card = ({ title, children, tone, className = '', right }) => (
  <section className={`card ${tone ? 'tone-' + tone : ''} ${className}`}>{title && <div className="linehead"><h3>{title}</h3>{right}</div>}{children}</section>
);
export function Pill({ tone, children }) { return <span className={`pill ${tone || ''}`}>{children}</span>; }

const DATE_COL = /Date$|^ETA$|^Expiry|^Received$|^When$|^Checked on$/;
/** every filled field of a register row */
export function KV({ row, skip = [], link }) {
  return Object.entries(row).filter(([k, v]) => v !== '' && v !== null && v !== undefined && !skip.includes(k) && typeof v !== 'object').map(([k, v]) => (
    <div className="kv" key={k}>
      <span>{k}</span>
      {link && link[k] ? <button className="link" onClick={link[k]}>{String(v)}</button>
        : /^https?:\/\//.test(String(v)) ? <a className="link" href={String(v).split('\n')[0]} target="_blank" rel="noreferrer">open</a>
        : <b className={String(v).length > 40 ? 'pre' : ''}>{DATE_COL.test(k) ? fmtD(v) : typeof v === 'number' && /USD|Amount|Fee/.test(k) ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : String(v)}</b>}
    </div>
  ));
}
export function Row({ title, sub, right, onClick, badge, icon }) {
  return (
    <button className="card listrow" onClick={onClick}>
      {icon && <span className="ricon">{icon}</span>}
      <span className="grow"><b>{title || '(no name)'}</b>{sub && <small>{sub}</small>}</span>
      {badge}{right !== undefined && right !== null && <span className="right">{right}</span>}
    </button>
  );
}
export function Empty({ children }) { return <p className="empty">{children}</p>; }
export function Field({ label, req, children, err, hint }) {
  return (
    <label className={err ? 'bad' : ''}>{label}{req && <em> *</em>}{children}
      {hint && !err && <small className="hint">{hint}</small>}{err && <small className="err">{err}</small>}</label>
  );
}
/** pick from a long list with typing (datalist) */
export function Combo({ id, value, onChange, options, placeholder }) {
  return (<>
    <input list={id} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Type to search…'} autoComplete="off" />
    <datalist id={id}>{(options || []).slice(0, 800).map(o => <option key={o} value={o} />)}</datalist>
  </>);
}
export function Select({ value, onChange, options, blank = '—' }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
      {blank !== null && <option value="">{blank}</option>}
      {(options || []).map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Chips({ value, onChange, options }) {
  return <div className="chips">{options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Seg({ value, onChange, options }) {
  return <div className="seg">{options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function licTone(days) { return days === null ? '' : days < 0 ? 'bad' : days <= 60 ? 'warn' : 'ok'; }
export function Actions({ children }) { return <div className="actions">{children}</div>; }
export function Stat({ value, label, tone, onClick, sub }) {
  return <button className="stat" onClick={onClick}><b className={tone ? 'c-' + tone : ''}>{value}</b><span>{label}</span>{sub && <small>{sub}</small>}</button>;
}
export function Sheet({ title, onClose, children }) {
  return <div className="modal" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()}><div className="linehead"><h3>{title}</h3><button className="ghost small" onClick={onClose}>Close</button></div>{children}</div></div>;
}

/* ---------------- charts (plain SVG, no library) */
const shortNum = v => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)));
/** vertical bars; series: [{name, values, cls}] side by side */
export function Bars({ labels, series, height = 150, fmt = shortNum, onBar }) {
  const n = labels.length, k = series.length, mx = Math.max(1, ...series.flatMap(s => s.values)), W = 320, H = height, top = 14, bot = 18, gw = W / n, bw = (gw * 0.72) / k;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      <line x1="0" x2={W} y1={H - bot} y2={H - bot} className="axis" />
      {labels.map((l, i) => <g key={i} onClick={() => onBar && onBar(i)}>
        {series.map((s, j) => { const v = s.values[i] || 0, h = (v / mx) * (H - top - bot); const x = i * gw + gw * 0.14 + j * bw;
          return <g key={j}><rect x={x} y={H - bot - h} width={bw - 1} height={Math.max(h, v ? 1 : 0)} rx="1.5" className={'cbar ' + (s.cls || 'b' + j)} />
            {k === 1 && v > 0 && <text x={x + bw / 2} y={H - bot - h - 3} className="val">{fmt(v)}</text>}</g>; })}
        <text x={i * gw + gw / 2} y={H - 5} className="lab">{l}</text>
      </g>)}
    </svg>
  );
}
export function Legend({ items }) { return <div className="legend">{items.map(([cls, l]) => <span key={l}><i className={'sw ' + cls} />{l}</span>)}</div>; }
/** horizontal bars with labels */
export function HBars({ rows, fmt = money0, onRow }) {
  const mx = Math.max(1, ...rows.map(r => r.value));
  return <div className="hbars">{rows.map((r, i) => (
    <button key={i} className="hb" onClick={() => onRow && onRow(r)}>
      <span className="hl">{r.label}</span><span className="ht"><i className={r.cls || ''} style={{ width: `${(r.value / mx) * 100}%` }} /></span><b>{fmt(r.value)}</b>
    </button>))}</div>;
}
/** donut with legend; parts: [{label, value, cls}] */
export function Donut({ parts, center, sub }) {
  const tot = parts.reduce((a, p) => a + p.value, 0) || 1, R = 42, C = 2 * Math.PI * R; let off = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 110 110"><circle cx="55" cy="55" r={R} className="track" />
        {parts.map((p, i) => { const len = (p.value / tot) * C, el = <circle key={i} cx="55" cy="55" r={R} className={'seg ' + p.cls} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 55 55)" />; off += len; return el; })}
        <text x="55" y="53" className="dc">{center}</text><text x="55" y="68" className="ds">{sub}</text>
      </svg>
      <div className="dleg">{parts.map(p => <span key={p.label}><i className={'sw ' + p.cls} />{p.label} <b>{p.text ?? p.value}</b></span>)}</div>
    </div>
  );
}
export function Meter({ pct, tone }) { return <span className="bar"><i className={tone} style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }} /></span>; }
