import { Activity, CalendarDays, Droplets, Footprints, HeartPulse, MessageCircle, Moon, ShieldCheck, Thermometer } from 'lucide-react';
import { Nova } from '../components/Nova';
import { Panel, Pill, Spark, timeAgo } from '../components/ui';
import { useStore } from '../lib/store';
import { SLEEP } from '../lib/data';

export function Overview() {
  const s = useStore();
  const hr = s.frames.map(f => f.hr);
  const spo2 = s.frames.map(f => f.spo2);
  const nextMed = s.meds.find(m => !m.taken);
  const appt = s.appointments[0];

  return (
    <div className="page">
      <div className="hero">
        <div className="hero__text">
          <p className="kicker">Good {greeting()}, {s.user.name}</p>
          <h1>Nova is watching out for you.</h1>
          <p className="hero__sub">Phone and watch are streaming. Fall and crash detection is armed, and Nova can book a MediLink clinic or call for help if you can't.</p>
          <div className="hero__bubble">
            <span className="hero__bubble-name">Nova</span>
            {s.novaLine}
          </div>
          <div className="row">
            <button className="btn btn--primary" onClick={() => s.go('nova')}><MessageCircle size={18} /> Talk to Nova</button>
            <button className="btn btn--outline" onClick={() => s.go('safety')}><ShieldCheck size={18} /> Test the Safety Engine</button>
          </div>
        </div>
        <Nova state={s.nova} size={240} onClick={() => s.say(`Hi ${s.user.name}! Your heart rate is ${Math.round(s.live.hr)} and everything looks steady.`, 'happy')} />
      </div>

      <div className="stats">
        <Stat icon={<HeartPulse size={16} />} label="Heart rate" value={Math.round(s.live.hr)} unit="bpm" tone="red">
          <Spark values={hr} min={40} max={130} color="var(--red)" height={40} />
        </Stat>
        <Stat icon={<Droplets size={16} />} label="Blood oxygen" value={s.live.spo2.toFixed(0)} unit="%" tone="teal">
          <Spark values={spo2} min={85} max={100} color="var(--teal)" height={40} />
        </Stat>
        <Stat icon={<Thermometer size={16} />} label="Skin temp" value="36.6" unit="°C" tone="amber" note="Normal range" />
        <Stat icon={<Footprints size={16} />} label="Steps today" value="6,420" unit="" tone="green" note="Goal 8,000 · 80%" />
      </div>

      <div className="grid-3">
        <Panel kicker="Safety" title="Protection status" right={<Pill tone={s.phase === 'idle' || s.phase === 'cancelled' ? 'ok' : 'bad'}>{s.phase === 'idle' || s.phase === 'cancelled' ? 'Armed' : 'Incident'}</Pill>}>
          <ul className="checklist">
            <li><span>Fall detection</span><b>Phone + watch</b></li>
            <li><span>Crash detection</span><b>Driving mode auto</b></li>
            <li><span>Location sharing</span><b>{s.consent.location ? 'Consented' : 'Off'}</b></li>
            <li><span>Emergency contacts</span><b>{s.contacts.length} people</b></li>
          </ul>
        </Panel>

        <Panel kicker="Today" title="Care plan">
          <ul className="checklist">
            <li><span><Moon size={14} /> Sleep</span><b>{SLEEP.total} · score {SLEEP.score}</b></li>
            <li><span><Activity size={14} /> Next medication</span><b>{nextMed ? `${nextMed.name} · ${nextMed.time}` : 'All taken'}</b></li>
            <li><span><CalendarDays size={14} /> Appointment</span><b>{appt ? `${appt.time} · ${appt.status}` : 'None booked'}</b></li>
          </ul>
          <button className="btn btn--text" onClick={() => s.go('care')}>Book with MediLink →</button>
        </Panel>

        <Panel kicker="Activity" title="Recent events">
          <ul className="feed">
            {s.log.slice(0, 5).map(e => (
              <li key={e.id} className={`feed__${e.kind}`}>
                <span>{e.text}</span><time>{timeAgo(e.at)}</time>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, unit, tone, note, children }: {
  icon: React.ReactNode; label: string; value: string | number; unit: string; tone: string; note?: string; children?: React.ReactNode;
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__label">{icon}{label}</div>
      <div className="stat__value">{value}<small>{unit}</small></div>
      {children ?? <div className="stat__note">{note}</div>}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
