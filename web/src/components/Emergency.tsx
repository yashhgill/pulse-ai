import { CheckCircle2, MapPin, Mic, PhoneCall, ShieldAlert, X } from 'lucide-react';
import { CHECK_TOTAL, ESCALATE_TOTAL, useStore } from '../lib/store';
import { useSpeech } from '../lib/useSpeech';
import { Nova } from './Nova';

export function MiniMap({ lat, lng, label, height = 180 }: { lat: number; lng: number; label?: string; height?: number }) {
  const s = useStore();
  return (
    <div className="minimap" style={{ height }}>
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="320" height="180" className="map__land" />
        <path d="M0 150 C60 140 90 170 160 160 S260 120 320 138 V180 H0Z" className="map__water" />
        <g className="map__road">
          <path d="M-10 40 L330 70" /><path d="M60 -10 L110 190" /><path d="M200 -10 L180 190" />
          <path d="M-10 118 C80 100 200 110 330 96" />
        </g>
        <g className="map__road map__road--minor">
          <path d="M0 20 L140 30" /><path d="M240 0 L300 180" /><path d="M20 80 L300 50" /><path d="M130 0 L150 180" />
        </g>
        <circle cx="160" cy="84" r="34" className="map__acc" />
        <circle cx="160" cy="84" r="7" className="map__dot" />
      </svg>
      <div className="minimap__label">
        <MapPin size={14} /> {label ?? s.user.home} · {lat.toFixed(4)}, {lng.toFixed(4)} · <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer">open map</a>
      </div>
    </div>
  );
}

export function EmergencyOverlay() {
  const s = useStore();
  const speech = useSpeech(text => {
    if (/(okay|ok|fine|alright|i'?m good|cancel)/i.test(text)) s.respondOkay();
    else if (/(help|hurt|pain|ambulance|can'?t)/i.test(text)) s.respondNeedHelp();
  });

  if (s.phase === 'idle' || !s.incident) return null;
  const inc = s.incident;
  const total = s.phase === 'checking' ? CHECK_TOTAL : s.phase === 'escalating' ? ESCALATE_TOTAL : 1;
  const frac = Math.max(0, s.countdown) / total;
  const live = s.live;

  const waiting = s.phase === 'checking' || s.phase === 'escalating';

  return (
    <div className={`sos sos--${s.phase}`} role="alertdialog" aria-modal="true" aria-label="Emergency">
      <div className="sos__card">
        <div className="sos__top">
          <span className="sos__tag"><ShieldAlert size={14} /> Safety Engine · {inc.label}</span>
          <span className="sos__sandbox">MERS 999 simulated · SMS live if Twilio is set</span>
        </div>

        {waiting && (
          <div className="sos__grid">
            <div className="sos__nova">
              <Nova state={s.nova} size={170} />
            </div>
            <div>
              <h2>{s.phase === 'checking' ? (inc.scenario === 'crash' ? 'Collision detected. Are you responsive?' : 'Are you okay?') : 'No response. Alerting help soon.'}</h2>
              <p className="sos__line">“{s.novaLine}”</p>
              <div className="sos__timer">
                <svg viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" className="sos__timer-track" />
                  <circle cx="60" cy="60" r="52" className="sos__timer-val" style={{ strokeDasharray: `${2 * Math.PI * 52 * frac} 999` }} />
                </svg>
                <div><strong>{Math.max(0, s.countdown)}</strong><span>{s.phase === 'checking' ? '10 s check-in' : '30 s final warning'}</span></div>
              </div>
              <div className="sos__actions">
                <button className="btn btn--ghost-light" onClick={s.respondOkay}><X size={18} /> I'm okay</button>
                <button className="btn btn--danger" onClick={s.respondNeedHelp}><PhoneCall size={18} /> I need help</button>
                <button className="btn btn--icon-light" onClick={speech.listening ? speech.stop : speech.start} title={speech.reason ?? 'Answer by voice'} aria-label="Answer by voice">
                  <Mic size={18} className={speech.listening ? 'rec' : ''} />
                </button>
              </div>
              {(speech.interim || speech.error) && <p className="sos__hint">{speech.interim || speech.error}</p>}
              <div className="sos__why">
                <span>Why Nova thinks so · {(inc.result.confidence * 100).toFixed(0)}% confidence</span>
                <ul>{inc.result.contributions.map((c, i) => <li key={i}>{c.label}<b>+{Math.round(c.weight * 100)}</b></li>)}</ul>
              </div>
            </div>
          </div>
        )}

        {s.phase === 'alerted' && (
          <div className="sos__alerted">
            <div className="sos__alerted-head">
              <Nova state="emergency" size={110} />
              <div>
                <h2>Help has been alerted</h2>
                <p className="sos__line">“{s.novaLine}”</p>
                <p className="sos__meta">{inc.conscious ? 'User conscious: live voice line kept open with Nova' : 'User unresponsive: location + health packet sent automatically'}</p>
              </div>
            </div>
            <div className="sos__cols">
              <div>
                <h4>Live location</h4>
                <MiniMap lat={inc.lat ?? s.user.lat} lng={inc.lng ?? s.user.lng} label={inc.lat ? 'Live GPS fix' : s.user.home} height={170} />
              </div>
              <div>
                <h4>Sent to</h4>
                <ul className="sos__recips">
                  {(inc.notifications ?? []).map((n, i) => (
                    <li key={i}><b>{n.channel === 'mers999' ? 'MERS 999' : n.target}</b><span>{n.channel === 'mers999' ? 'Emergency dispatch' : 'SMS with live location'} · {n.detail}</span><i>{n.status}</i></li>
                  ))}
                  {!(inc.notifications ?? []).length && <li><b>Sending…</b><span>Waiting for the server</span><i>…</i></li>}
                  <li><b>Pulse dispatch console</b><span>{inc.ackBy ? `Acknowledged by ${inc.ackBy}` : 'Waiting for a dispatcher to acknowledge'}</span><i>{inc.ackBy ? 'ack' : 'open'}</i></li>
                </ul>
                <h4>Health summary</h4>
                <dl className="sos__health">
                  <div><dt>Blood</dt><dd>{s.user.blood}</dd></div>
                  <div><dt>Allergies</dt><dd>{s.user.allergies}</dd></div>
                  <div><dt>Heart rate</dt><dd>{Math.round(live.hr)} bpm</dd></div>
                  <div><dt>SpO₂</dt><dd>{live.spo2.toFixed(0)}%</dd></div>
                </dl>
              </div>
            </div>
            <details className="sos__packet">
              <summary>Alert payload sent to dispatch</summary>
              <pre>{JSON.stringify({
                incident_id: inc.id,
                type: inc.result.incident === 'none' ? 'manual_sos' : inc.result.incident,
                confidence: Number(inc.result.confidence.toFixed(2)),
                detected_at: new Date(inc.startedAt).toISOString(),
                user_responsive: inc.conscious ?? false,
                location: s.consent.location ? { lat: inc.lat ?? s.user.lat, lng: inc.lng ?? s.user.lng } : 'withheld (no consent)',
                health: s.consent.health ? { blood_type: s.user.blood, allergies: s.user.allergies, hr_bpm: Math.round(live.hr), spo2_pct: Number(live.spo2.toFixed(0)) } : 'withheld (no consent)',
                notify: (inc.notifications ?? []).map(n => `${n.channel}:${n.target}`),
              }, null, 2)}</pre>
            </details>
            <div className="sos__actions">
              <button className="btn btn--ghost-light" onClick={s.closeEmergency}>Close incident</button>
            </div>
          </div>
        )}

        {s.phase === 'cancelled' && (
          <div className="sos__center">
            <CheckCircle2 size={56} className="sos__ok" />
            <h2>Alert cancelled</h2>
            <p>“{s.novaLine}”</p>
            <button className="btn btn--primary" onClick={s.closeEmergency}>Back to Pulse</button>
          </div>
        )}
      </div>
    </div>
  );
}
