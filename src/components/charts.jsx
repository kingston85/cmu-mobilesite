// Small SVG charts (no library): grouped bars, horizontal bars, donut, sparkline. They follow the light / dark theme.
import { money } from '../lib/logic';

export const PALETTE = ['#2F75B5', '#70AD47', '#D97757', '#E0A800', '#7030A0', '#1F9E89', '#C0392B', '#8C6D46', '#5B9BD5', '#A5A5A5'];
const short = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(Math.abs(n) >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n * 10) / 10));

export function Bars({ labels, series, height = 170, fmt = short, onBar }) {
  const W = 340, H = height, pl = 34, pb = 20, pt = 8, w = W - pl - 4, h = H - pb - pt;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const gw = w / labels.length, bw = Math.max(2, (gw * 0.72) / series.length);
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map(f => <g key={f}><line x1={pl} x2={W - 4} y1={pt + h - f * h} y2={pt + h - f * h} stroke="var(--border)" strokeWidth="1" /><text x={pl - 4} y={pt + h - f * h + 3} fontSize="9" textAnchor="end" fill="var(--faint)">{fmt(nice * f)}</text></g>)}
        {labels.map((lb, i) => (
          <g key={i}>
            {series.map((s, k) => { const v = s.values[i] || 0, bh = (v / nice) * h; return <rect key={k} x={pl + i * gw + gw * 0.14 + k * bw} y={pt + h - bh} width={bw - 1} height={Math.max(0, bh)} rx="2" fill={s.color || PALETTE[k]} onClick={onBar ? () => onBar(i, k) : undefined}><title>{`${lb} – ${s.name}: ${money(v)}`}</title></rect>; })}
            <text x={pl + i * gw + gw / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--muted)">{lb}</text>
          </g>
        ))}
      </svg>
      {series.length > 1 ? <div className="legend">{series.map((s, k) => <span key={k}><i style={{ background: s.color || PALETTE[k] }} />{s.name}</span>)}</div> : null}
    </div>
  );
}
export function HBars({ items, fmt = v => money(v, 1), color, max: mx, onClick }) {
  const max = mx || Math.max(1, ...items.map(x => x.value));
  if (!items.length) return <div className="small muted">No data yet.</div>;
  return <div>{items.map((x, i) => (
    <div key={i} className="hbar" onClick={onClick ? () => onClick(x) : undefined} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="hl"><span>{x.name}</span><span className="b nowrap">{fmt(x.value)}{x.share !== undefined ? <span className="muted small"> · {Math.round(x.share * 100)}%</span> : null}</span></div>
      <div className="track"><div className="fill" style={{ width: (x.value / max) * 100 + '%', background: x.color || color || PALETTE[i % PALETTE.length] }} /></div>
    </div>
  ))}</div>;
}
export function Donut({ items, size = 150, center, sub, fmt = v => money(v, 0) }) {
  const tot = items.reduce((a, x) => a + x.value, 0) || 1, r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex" style={{ alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} viewBox="0 0 140 140" style={{ flex: `0 0 ${size}px` }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--chip)" strokeWidth="18" />
        {items.map((x, i) => { const len = (x.value / tot) * c; const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={x.color || PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{x.name}: {fmt(x.value)}</title></circle>; off += len; return el; })}
        <text x="70" y="68" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--text)">{center}</text>
        <text x="70" y="84" textAnchor="middle" fontSize="9.5" fill="var(--muted)">{sub}</text>
      </svg>
      <div className="grow small">{items.map((x, i) => <div key={i} className="flex between" style={{ marginBottom: 4 }}><span className="flex" style={{ minWidth: 0 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: x.color || PALETTE[i % PALETTE.length], flex: '0 0 10px' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span></span><b className="nowrap">{fmt(x.value)}</b></div>)}</div>
    </div>
  );
}
export function Spark({ values, color = '#9BC2E6', w = 110, h = 30 }) {
  const max = Math.max(1, ...values), step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
export function Ring({ pct, size = 64, color = '#70AD47', label }) {
  const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
  return <svg width={size} height={size} viewBox="0 0 64 64"><circle cx="32" cy="32" r={r} fill="none" stroke="var(--chip)" strokeWidth="7" />
    <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${p * c} ${c}`} transform="rotate(-90 32 32)" strokeLinecap="round" />
    <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">{label ?? Math.round(p * 100) + '%'}</text></svg>;
}
