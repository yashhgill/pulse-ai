import { useState } from 'react';
import { CalendarCheck, Clock, MapPin, Star } from 'lucide-react';
import { PageHead, Panel, Pill } from '../components/ui';
import { useStore } from '../lib/store';
import { CLINICS } from '../lib/data';
import type { Appointment } from '../lib/types';

const SYMPTOMS = ['Fever', 'Sore throat', 'Cough', 'Headache', 'Dizziness', 'Stomach ache', 'Rash', 'Follow-up'];

export function Care() {
  const s = useStore();
  const [picked, setPicked] = useState<string[]>(['Fever', 'Sore throat']);
  const [note, setNote] = useState('Started yesterday evening, 38.2°C this morning.');
  const [clinicId, setClinicId] = useState(CLINICS[0].id);
  const [slot, setSlot] = useState(CLINICS[0].slots[0]);
  const [done, setDone] = useState<Appointment | null>(null);
  const clinic = CLINICS.find(c => c.id === clinicId)!;
  const today = new Date().toISOString().slice(0, 10);

  const toggle = (x: string) => setPicked(p => p.includes(x) ? p.filter(y => y !== x) : [...p, x]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    let a: Appointment;
    try { a = await s.book({ clinicId, clinicName: clinic.name, date: today, time: slot, reason: [...picked, note].filter(Boolean).join('; ') }); }
    catch (e) { s.setError((e as Error).message); setBusy(false); return; }
    setBusy(false);
    setDone(a);
    s.say(`Done. I've sent your request to ${clinic.name} for ${slot}. They'll confirm in a moment.`, 'appointment');
  };
  const live = done ? s.appointments.find(a => a.id === done.id) ?? done : null;

  return (
    <div className="page">
      <PageHead kicker="MediLink integration" title="Book a clinic"
        sub="Nova turns what you told it into a structured request, finds MediLink clinics near you, and sends it straight to the clinic's queue." />

      <div className="care">
        <div className="stack-lg">
          <Panel kicker="Step 1" title="What's wrong?">
            <div className="chips">
              {SYMPTOMS.map(x => <button key={x} className={`chip ${picked.includes(x) ? 'chip--on' : ''}`} onClick={() => toggle(x)} aria-pressed={picked.includes(x)}>{x}</button>)}
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} aria-label="Notes for the clinic" />
          </Panel>

          <Panel kicker="Step 2" title="Choose a clinic" right={<span className="muted small"><MapPin size={12} /> Near {s.user.home}</span>}>
            <ul className="clinics">
              {CLINICS.map(c => (
                <li key={c.id}>
                  <button className={`clinic ${c.id === clinicId ? 'is-on' : ''}`} disabled={!c.medilink} onClick={() => { setClinicId(c.id); setSlot(c.slots[0]); }}>
                    <div>
                      <b>{c.name}</b>
                      <span>{c.area} · {c.distanceKm} km · <Star size={11} /> {c.rating}</span>
                      <span className="clinic__tags">{c.specialties.join(' · ')}</span>
                    </div>
                    {c.medilink ? <Pill tone="info">MediLink · {c.slots.length} slots</Pill> : <Pill tone="mute">Walk-in A&amp;E</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel kicker="Step 3" title="Pick a time today">
            <div className="chips">
              {clinic.slots.map(t => <button key={t} className={`chip ${t === slot ? 'chip--on' : ''}`} onClick={() => setSlot(t)}><Clock size={12} /> {t}</button>)}
            </div>
            <button className="btn btn--primary btn--wide" onClick={submit} disabled={!picked.length}>
              <CalendarCheck size={18} /> Send request to {clinic.name.split(' ').slice(0, 2).join(' ')} · {slot}
            </button>
          </Panel>
        </div>

        <div className="stack-lg">
          <Panel kicker="What the clinic receives" title={live ? `Request ${live.ref}` : 'Request preview'}
            right={live ? <Pill tone={live.status === 'confirmed' ? 'ok' : 'warn'}>{live.status}</Pill> : undefined}>
            <pre className="code">{JSON.stringify({
              resourceType: 'Appointment',
              status: live?.status === 'confirmed' ? 'booked' : 'proposed',
              identifier: live?.ref ?? 'ML-pending',
              start: `${today}T${slot}:00+08:00`,
              participant: [
                { actor: { display: s.user.name }, status: 'accepted' },
                { actor: { display: clinic.name }, status: live?.status === 'confirmed' ? 'accepted' : 'needs-action' },
              ],
              reasonCode: picked.map(p => ({ text: p })),
              comment: note,
              supportingInformation: { hr_bpm: Math.round(s.live.hr), spo2_pct: Math.round(s.live.spo2), source: 'Pulse wearable' },
            }, null, 2)}</pre>
            <p className="muted small">FHIR R4 <code>Appointment</code> resource, the format MediLink exchanges with clinic EHRs.</p>
          </Panel>

          <Panel kicker="Upcoming" title="Appointments">
            {s.appointments.length === 0 && <p className="muted small">None yet. Book one on the left.</p>}
            <ul className="appts">
              {s.appointments.map(a => (
                <li key={a.id}>
                  <time>{a.time}</time>
                  <div><b>{a.clinicName}</b><span>{a.reason}</span></div>
                  <Pill tone={a.status === 'confirmed' ? 'ok' : 'warn'}>{a.status}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
