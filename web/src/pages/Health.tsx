import { useState } from 'react';
import { Check, Pill as PillIcon } from 'lucide-react';
import { PageHead, Panel, Pill } from '../components/ui';
import { useStore } from '../lib/store';
import { HR_24H, SLEEP, STEPS_WEEK } from '../lib/data';

export function Health() {
  const s = useStore();
  return (
    <div className="page">
      <PageHead kicker="Health Engine" title="Your health"
        sub="Vitals, sleep, activity and medication from your phone and watch, in one place Nova can reason over." />

      <div className="grid-2">
        <Panel kicker="Last 24 hours" title="Heart rate" right={<Pill tone="ok">Resting 57 bpm</Pill>}>
          <HrChart />
        </Panel>
        <Panel kicker="Last night" title={`Sleep · ${SLEEP.total}`} right={<Pill tone="ok">Score {SLEEP.score}</Pill>}>
          <SleepBar />
          <p className="muted small">Deep sleep was 20% of the night, inside the healthy 13–23% range for adults.</p>
        </Panel>
      </div>

      <div className="grid-3">
        <Panel kicker="This week" title="Steps" right={<Pill tone="warn">Goal 8,000</Pill>}>
          <StepsChart />
        </Panel>

        <Panel kicker="Reminders" title="Medication today">
          <ul className="meds">
            {s.meds.map(m => (
              <li key={m.id} className={m.taken ? 'taken' : ''}>
                <button className="check" onClick={() => { s.toggleMed(m.id); if (!m.taken) s.say(`Nice. ${m.name} logged.`, 'happy'); }} aria-label={`Mark ${m.name} ${m.taken ? 'not taken' : 'taken'}`}>
                  {m.taken ? <Check size={14} /> : <PillIcon size={14} />}
                </button>
                <div><b>{m.name}</b><span>{m.dose}</span></div>
                <time>{m.time}</time>
              </li>
            ))}
          </ul>
        </Panel>

        <MedicalId />
      </div>
    </div>
  );
}

function HrChart() {
  const w = 560, h = 180, l = 34, b = 22, t = 8;
  const min = 40, max = 120;
  const x = (i: number) => l + (i / 23) * (w - l - 8);
  const y = (v: number) => t + (h - t - b) * (1 - (v - min) / (max - min));
  const pts = HR_24H.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const peak = HR_24H.indexOf(Math.max(...HR_24H));
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Hourly average heart rate">
      {[40, 60, 80, 100, 120].map(v => (
        <g key={v}>
          <line x1={l} x2={w - 8} y1={y(v)} y2={y(v)} className="chart__grid" />
          <text x={l - 6} y={y(v) + 4} className="chart__label" textAnchor="end">{v}</text>
        </g>
      ))}
      {[0, 6, 12, 18, 23].map(i => (
        <text key={i} x={x(i)} y={h - 6} className="chart__label" textAnchor={i === 23 ? 'end' : i === 0 ? 'start' : 'middle'}>{String(i).padStart(2, '0')}:00</text>
      ))}
      <polygon points={`${x(0)},${y(min)} ${pts} ${x(23)},${y(min)}`} className="chart__area" />
      <polyline points={pts} className="chart__line" />
      <circle cx={x(peak)} cy={y(HR_24H[peak])} r="4" className="chart__dot" />
      <text x={x(peak)} y={y(HR_24H[peak]) - 10} className="chart__label chart__label--strong" textAnchor="middle">{HR_24H[peak]} bpm · evening run</text>
    </svg>
  );
}

function SleepBar() {
  const total = SLEEP.stages.reduce((s, x) => s + x.mins, 0);
  return (
    <div className="sleep">
      <div className="sleep__bar">
        {SLEEP.stages.map(st => <span key={st.name} className={`sleep--${st.name.toLowerCase()}`} style={{ flex: st.mins }} title={`${st.name} ${st.mins} min`} />)}
      </div>
      <ul className="sleep__legend">
        {SLEEP.stages.map(st => (
          <li key={st.name}><i className={`sleep--${st.name.toLowerCase()}`} />{st.name}<b>{Math.floor(st.mins / 60)}h {st.mins % 60}m</b><span>{Math.round((st.mins / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

function StepsChart() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = 14000;
  const track = 140; // px available for bars
  const px = (v: number) => (v / max) * track;
  return (
    <div className="bars">
      <span className="bars__goal" style={{ bottom: 22 + px(8000) }} aria-hidden />
      {STEPS_WEEK.map((v, i) => (
        <div key={i} className={`bars__col ${i === STEPS_WEEK.length - 1 ? 'is-today' : ''}`}>
          <span className="bars__val">{(v / 1000).toFixed(1)}k</span>
          <i style={{ height: px(v) }} />
          <span className="bars__day">{days[i]}</span>
        </div>
      ))}
    </div>
  );
}

function MedicalId() {
  const s = useStore();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ phone: '', blood: '', allergies: '', conditions: '', home_address: '' });
  const [busy, setBusy] = useState(false);
  const open = () => { setF({ phone: s.me.phone ?? '', blood: s.me.blood ?? '', allergies: s.me.allergies ?? '', conditions: s.me.conditions ?? '', home_address: s.me.home_address ?? '' }); setEdit(true); };
  const useHere = () => navigator.geolocation?.getCurrentPosition(p => s.saveProfile({ home_lat: p.coords.latitude, home_lng: p.coords.longitude }).catch(() => {}));
  const save = async () => { setBusy(true); try { await s.saveProfile(f); setEdit(false); } catch { /* shown by store */ } finally { setBusy(false); } };
  return (
    <Panel kicker="Shared only in emergencies" title="Medical ID" right={!edit && <button className="btn btn--outline btn--sm" onClick={open}>Edit</button>}>
      {!edit ? (
        <dl className="medid">
          <div><dt>Name</dt><dd>{s.user.fullName}</dd></div>
          <div><dt>Phone</dt><dd>{s.me.phone || 'Not set'}</dd></div>
          <div><dt>Blood type</dt><dd>{s.user.blood}</dd></div>
          <div><dt>Allergies</dt><dd>{s.user.allergies}</dd></div>
          <div><dt>Conditions</dt><dd>{s.user.conditions}</dd></div>
          <div><dt>Home</dt><dd>{s.user.home}</dd></div>
        </dl>
      ) : (
        <div className="form">
          <label>Phone<input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+60 12-345 6789" /></label>
          <label>Blood type<select value={f.blood} onChange={e => setF({ ...f, blood: e.target.value })}>{['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b} value={b}>{b || 'Unknown'}</option>)}</select></label>
          <label>Allergies<input value={f.allergies} onChange={e => setF({ ...f, allergies: e.target.value })} placeholder="e.g. Penicillin" /></label>
          <label>Conditions<input value={f.conditions} onChange={e => setF({ ...f, conditions: e.target.value })} placeholder="e.g. Asthma" /></label>
          <label>Home address<input value={f.home_address} onChange={e => setF({ ...f, home_address: e.target.value })} placeholder="Ayer Keroh, Melaka" /></label>
          <div className="row">
            <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn btn--outline" onClick={useHere}>Use my location as home</button>
            <button className="btn btn--ghost" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      )}
    </Panel>
  );
}
