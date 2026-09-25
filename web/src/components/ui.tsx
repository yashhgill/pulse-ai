import type { ReactNode } from 'react';

export function Panel({ title, kicker, right, children, className = '' }: {
  title?: string; kicker?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="panel__head">
          <div>
            {kicker && <p className="kicker">{kicker}</p>}
            {title && <h3>{title}</h3>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHead({ kicker, title, sub, right }: { kicker: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {sub && <p className="pagehead__sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Line chart over a fixed domain. Values outside the domain are clamped. */
export function Spark({ values, min, max, color = 'var(--teal)', height = 56, fill = true, threshold }: {
  values: number[]; min: number; max: number; color?: string; height?: number; fill?: boolean; threshold?: number;
}) {
  const w = 300;
  const h = height;
  const pad = 4;
  const n = Math.max(values.length - 1, 1);
  const y = (v: number) => pad + (h - pad * 2) * (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min));
  const pts = values.map((v, i) => `${(i / n) * w},${y(v)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} className="spark__grid" />)}
      {threshold !== undefined && <line x1="0" x2={w} y1={y(threshold)} y2={y(threshold)} className="spark__threshold" />}
      {fill && <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity=".12" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={w} cy={y(last)} r="3.5" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Gauge({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const r = 52;
  const c = Math.PI * r; // half circle
  const tone = value >= 0.6 ? 'var(--red)' : value >= 0.3 ? 'var(--amber)' : 'var(--green)';
  return (
    <div className="gauge">
      <svg viewBox="0 0 128 76">
        <path d="M12 68 A52 52 0 0 1 116 68" className="gauge__track" />
        <path d="M12 68 A52 52 0 0 1 116 68" stroke={tone} className="gauge__value"
          strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <div className="gauge__read">
        <strong style={{ color: tone }}>{pct}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'mute'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      <span className="toggle__track"><span className="toggle__knob" /></span>
      <span className="toggle__label">{label}</span>
    </label>
  );
}

export function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
