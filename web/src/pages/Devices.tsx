import { Car, Home, Smartphone, Watch } from 'lucide-react';
import { Nova } from '../components/Nova';
import { PageHead } from '../components/ui';
import { useStore } from '../lib/store';
import type { ScenarioId } from '../lib/types';

export function Devices() {
  const s = useStore();
  const busy = (s.phase !== 'idle' && s.phase !== 'cancelled') || !!s.activeScenario;
  const alarm = s.nova === 'emergency' || s.nova === 'fall_detected';
  const now = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });

  const Sim = ({ id, label }: { id: ScenarioId; label: string }) => (
    <button className="btn btn--outline btn--sm" disabled={busy} onClick={() => s.runScenario(id)}>{label}</button>
  );

  return (
    <div className="page">
      <PageHead kicker="Nova everywhere" title="One Nova, every device"
        sub="The same Pulse Core state drives Nova on the phone, the watch, in the car and at home. Trigger an event from any device and watch the rest follow." />

      <div className="devices">
        <figure className="device">
          <div className="phone">
            <div className="phone__notch" />
            <div className="phone__time">{now}</div>
            <div className={`phone__note ${alarm ? 'is-alarm' : ''}`}>
              <b>Pulse · Nova</b>
              <span>{s.novaLine}</span>
            </div>
            <Nova state={s.nova} size={120} />
            <div className="phone__cta">“Hey Nova”</div>
          </div>
          <figcaption><Smartphone size={16} /> Phone <Sim id="drop" label="Drop phone" /></figcaption>
        </figure>

        <figure className="device">
          <div className={`watch ${alarm ? 'is-alarm' : ''}`}>
            <div className="watch__face">
              <Nova state={s.nova} size={84} />
              <b>{alarm ? 'Are you okay?' : `${Math.round(s.live.hr)} bpm`}</b>
              {alarm ? (
                <div className="watch__btns"><button onClick={s.respondOkay}>I'm OK</button><button className="sos" onClick={s.respondNeedHelp}>SOS</button></div>
              ) : <span>SpO₂ {s.live.spo2.toFixed(0)}%</span>}
            </div>
          </div>
          <figcaption><Watch size={16} /> Smartwatch <Sim id="fall" label="Simulate fall" /></figcaption>
        </figure>

        <figure className="device">
          <div className={`car ${alarm ? 'is-alarm' : ''}`}>
            <div className="car__speed"><b>{Math.round(s.live.speed)}</b><span>km/h</span></div>
            <div className="car__screen">
              <Nova state={s.nova} size={70} />
              <p>{alarm && s.incident?.scenario === 'crash' ? 'Nova detected a collision. Are you responsive?' : s.novaLine}</p>
            </div>
          </div>
          <figcaption><Car size={16} /> Vehicle <Sim id="crash" label="Simulate crash" /></figcaption>
        </figure>

        <figure className="device">
          <div className="speaker">
            <div className={`speaker__ring ${s.nova !== 'idle' ? 'is-on' : ''} ${alarm ? 'is-alarm' : ''}`} />
            <div className="speaker__body"><Nova state={s.nova} size={80} /></div>
            <p>{s.novaLine}</p>
          </div>
          <figcaption><Home size={16} /> Home speaker <Sim id="still" label="Long inactivity" /></figcaption>
        </figure>
      </div>
    </div>
  );
}
