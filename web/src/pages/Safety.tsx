import { useState } from 'react';
import { Car, Footprints, HeartCrack, PauseCircle, Phone, Plus, Smartphone, Siren, Trash2 } from 'lucide-react';
import { Gauge, PageHead, Panel, Pill, Spark, Toggle } from '../components/ui';
import { uid, useStore } from '../lib/store';
import { SCENARIOS, THRESHOLD_HIGH, THRESHOLD_LOW } from '../lib/sensorFusion';
import type { ScenarioId, SensorKey } from '../lib/types';

const CHANNELS: { key: SensorKey; label: string; unit: string; min: number; max: number; color: string; src: string }[] = [
  { key: 'accel', label: 'Accelerometer', unit: 'g', min: 0, max: 10, color: 'var(--red)', src: 'Phone IMU' },
  { key: 'gyro', label: 'Gyroscope', unit: 'rad/s', min: 0, max: 8, color: 'var(--amber)', src: 'Phone IMU' },
  { key: 'speed', label: 'GPS speed', unit: 'km/h', min: 0, max: 80, color: 'var(--blue)', src: 'Phone GPS' },
  { key: 'hr', label: 'Heart rate', unit: 'bpm', min: 35, max: 135, color: 'var(--red)', src: 'Watch PPG' },
  { key: 'spo2', label: 'SpO₂', unit: '%', min: 85, max: 100, color: 'var(--teal)', src: 'Watch PPG' },
  { key: 'motion', label: 'Wrist motion', unit: '', min: 0, max: 1, color: 'var(--green)', src: 'Watch IMU' },
];

const ICONS: Record<ScenarioId, React.ReactNode> = {
  fall: <Footprints size={18} />, crash: <Car size={18} />, faint: <HeartCrack size={18} />,
  drop: <Smartphone size={18} />, still: <PauseCircle size={18} />,
};

const FLOW = [
  { id: 'detect', label: 'Incident detected', note: 'Sensor fusion ≥ 60%' },
  { id: 'checking', label: '“Are you okay?”', note: '10 s check-in' },
  { id: 'escalating', label: 'Escalation', note: '30 s final warning' },
  { id: 'locating', label: 'Confirm location', note: 'GPS + Wi-Fi fix' },
  { id: 'alerted', label: 'Alert sent', note: '999 · contacts · health' },
];

export function Safety() {
  const s = useStore();
  const busy = s.phase !== 'idle' && s.phase !== 'cancelled';
  const fusion = s.lastFusion;
  const phaseIndex = s.phase === 'idle' || s.phase === 'cancelled' ? (s.activeScenario ? 0 : -1) : FLOW.findIndex(f => f.id === s.phase);

  return (
    <div className="page">
      <PageHead kicker="Pulse Safety Engine" title="Fall & crash detection"
        sub="Six live sensor channels feed the fusion engine. Pick a scenario to inject it into the stream and watch Nova decide."
        right={<div className="row">
          <Toggle on={s.demoFast} onChange={s.setDemoFast} label="Fast timers (demo)" />
          <button className="btn btn--danger" onClick={s.triggerManualSOS} disabled={busy}><Siren size={18} /> SOS</button>
        </div>}
      />

      <div className="scenarios">
        {SCENARIOS.map(sc => (
          <button key={sc.id} className={`scenario ${s.activeScenario === sc.id ? 'is-on' : ''}`} onClick={() => s.runScenario(sc.id)} disabled={busy || !!s.activeScenario}>
            <span className="scenario__icon">{ICONS[sc.id]}</span>
            <b>{sc.label}</b>
            <span>{sc.blurb}</span>
            <em>{sc.expect}</em>
          </button>
        ))}
      </div>

      <div className="safety-grid">
        <Panel kicker="Live stream · 5 Hz · last 20 s" title="Sensor channels" right={s.activeScenario ? <Pill tone="warn">Injecting: {SCENARIOS.find(x => x.id === s.activeScenario)?.label}</Pill> : <Pill tone="ok">Normal</Pill>}>
          <div className="channels">
            {CHANNELS.map(c => {
              const vals = s.frames.map(f => f[c.key]);
              const v = vals[vals.length - 1];
              return (
                <div className="channel" key={c.key}>
                  <div className="channel__head">
                    <span>{c.label}<small>{c.src}</small></span>
                    <b>{c.key === 'motion' ? `${Math.round(v * 100)}%` : v.toFixed(c.key === 'accel' || c.key === 'gyro' ? 1 : 0)}<small>{c.unit}</small></b>
                  </div>
                  <Spark values={vals} min={c.min} max={c.max} color={c.color} height={46} />
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel kicker="Sensor fusion engine" title="Confidence score">
          <Gauge value={fusion?.confidence ?? 0} label={fusion ? fusion.incident === 'none' ? 'no incident' : fusion.incident : 'waiting for event'} />
          <div className="bands">
            <span className={fusion && fusion.confidence < THRESHOLD_LOW ? 'on' : ''}>&lt; 30% ignore</span>
            <span className={fusion && fusion.confidence >= THRESHOLD_LOW && fusion.confidence < THRESHOLD_HIGH ? 'on' : ''}>30–60% gentle check</span>
            <span className={fusion && fusion.confidence >= THRESHOLD_HIGH ? 'on' : ''}>≥ 60% emergency protocol</span>
          </div>
          <ul className="contrib">
            {!fusion && <li className="muted">Run a scenario to see which signals contributed.</li>}
            {fusion?.contributions.map((c, i) => (
              <li key={i}><span>{c.label}</span><span className="bar"><i style={{ width: `${Math.min(100, (c.weight / 0.35) * 100)}%` }} /></span><b>+{Math.round(c.weight * 100)}</b></li>
            ))}
            {fusion && fusion.contributions.length > 0 && fusion.confidence < 0.2 && <li className="muted">Watch still moving and HR normal → phone-drop veto (×0.3)</li>}
          </ul>
        </Panel>
      </div>

      <Panel kicker="Emergency protocol" title="Escalation flow">
        <ol className="flow">
          {FLOW.map((f, i) => (
            <li key={f.id} className={i < phaseIndex ? 'done' : i === phaseIndex ? 'now' : ''}>
              <b>{f.label}</b><span>{f.note}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">Response at any step (“I'm okay” by tap or voice) cancels. If the user is conscious and asks for help, Pulse skips to dispatch and keeps a live voice line with Nova. Dispatch here targets a sandbox endpoint; real MERS 999 integration needs authorisation, verified location and legal review.</p>
      </Panel>

      <div className="grid-2">
        <Contacts />
        <Panel kicker="Privacy" title="Consent">
          <div className="stack">
            <Toggle on={s.consent.location} onChange={v => s.setConsent('location', v)} label="Share live location during an emergency" />
            <Toggle on={s.consent.health} onChange={v => s.setConsent('health', v)} label="Share blood type, allergies and vitals with responders" />
            <Toggle on={s.consent.contacts} onChange={v => s.setConsent('contacts', v)} label="Notify my emergency contacts" />
          </div>
          <p className="muted small">Stored per user, logged with a timestamp, revocable at any time (PDPA 2010).</p>
        </Panel>
      </div>
    </div>
  );
}

function Contacts() {
  const s = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rel, setRel] = useState('Friend');
  const [err, setErr] = useState('');
  const add = async () => {
    if (!name.trim() || !phone.trim()) return;
    setErr('');
    try { await s.addContact({ name: name.trim(), phone: phone.trim(), relation: rel }); setName(''); setPhone(''); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <Panel kicker="People Nova will call" title="Emergency contacts">
      <ul className="contacts">
        {s.contacts.map(c => (
          <li key={c.id}>
            <span className="avatar">{c.name.slice(0, 1)}</span>
            <div><b>{c.name}</b><span>{c.relation} · {c.phone}</span></div>
            {c.primary ? <Pill tone="info">Primary</Pill> : (
              <button className="btn btn--icon btn--ghost" aria-label={`Remove ${c.name}`} onClick={() => s.removeContact(c.id)}><Trash2 size={16} /></button>
            )}
          </li>
        ))}
      </ul>
      <div className="addrow">
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} aria-label="Contact name" />
        <input placeholder="+60 1x-xxx xxxx" value={phone} onChange={e => setPhone(e.target.value)} aria-label="Phone" />
        <select value={rel} onChange={e => setRel(e.target.value)} aria-label="Relation">
          {['Friend', 'Partner', 'Sibling', 'Parent', 'Housemate', 'Colleague'].map(r => <option key={r}>{r}</option>)}
        </select>
        <button className="btn btn--outline" onClick={add}><Plus size={16} /> Add</button>
      </div>
      {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}
      <p className="muted small"><Phone size={12} /> Contacts get an SMS with your live location link and a call from Pulse.</p>
    </Panel>
  );
}
