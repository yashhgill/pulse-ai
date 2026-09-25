import { PageHead, Panel, Pill } from '../components/ui';

const ROWS: { area: string; demo: string; prod: string; status: 'live' | 'sim' | 'next' }[] = [
  { area: 'Nova UI + state machine', demo: 'React, 11 states, drives every surface', prod: 'Same, art swapped to Rive rig', status: 'live' },
  { area: 'Voice', demo: 'Browser speech-to-text + text-to-speech', prod: 'Huawei SIS (ASR/TTS) with wake word', status: 'live' },
  { area: 'Conversation pipeline', demo: 'Rule-based classifier + urgency scoring', prod: 'Classifier → LLM grounded on MOH/WHO sources', status: 'sim' },
  { area: 'Sensor fusion', demo: 'Weighted scoring over synthetic 5 Hz streams', prod: 'On-device model on real IMU + wearable data', status: 'sim' },
  { area: 'Escalation protocol', demo: '10 s → 30 s → locate → alert, cancellable', prod: 'Same logic, server-side with retries + audit', status: 'live' },
  { area: 'Emergency dispatch', demo: 'Sandbox payload, nothing is called', prod: 'Authorised MERS 999 integration', status: 'next' },
  { area: 'MediLink booking', demo: 'FHIR Appointment built client-side', prod: 'MediLink API → clinic EHR queue', status: 'sim' },
  { area: 'Auth + health data', demo: 'Single demo user in memory', prod: 'IAM login, RDS (encrypted), PDPA consent log', status: 'next' },
];

export function Architecture() {
  return (
    <div className="page">
      <PageHead kicker="System design" title="How Pulse is built"
        sub="What this prototype runs today on Huawei Cloud, and what each piece becomes in production." />

      <Panel kicker="Logical architecture" title="Pulse AI">
        <div className="arch">
          <div className="arch__top">PULSE AI</div>
          <div className="arch__row">
            <div className="arch__box arch__box--nova"><b>Nova AI</b><span>Voice · chat · personality</span></div>
            <div className="arch__box arch__box--health"><b>Health Engine</b><span>Vitals · sleep · meds · history</span></div>
            <div className="arch__box arch__box--safety"><b>Safety Engine</b><span>Fall · crash · inactivity</span></div>
          </div>
          <div className="arch__core"><b>Pulse Core</b><span>Event bus · state machine · consent · audit</span></div>
          <div className="arch__row arch__row--5">
            {['Emergency services', 'MediLink clinics', 'Health data', 'Location engine', 'Notifications'].map(x => <div key={x} className="arch__leaf">{x}</div>)}
          </div>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel kicker="Deployed now" title="Huawei Cloud">
          <ol className="deploy">
            <li><b>Browser</b><span>Chrome on laptop / phone</span></li>
            <li><b>Elastic IP</b><span>Public address bound to the ECS</span></li>
            <li><b>Security group</b><span>Inbound 80 / 443, SSH from admin IP only</span></li>
            <li><b>ECS · Ubuntu 22.04</b><span>Nginx serves the Vite production build from <code>/var/www/pulse</code></span></li>
          </ol>
        </Panel>
        <Panel kicker="Next phase" title="Huawei Cloud services to add">
          <ul className="checklist">
            <li><span>API Gateway + ECS / CCE</span><b>Pulse Core API</b></li>
            <li><span>RDS for MySQL</span><b>Users, contacts, consent</b></li>
            <li><span>DCS Redis</span><b>Live sensor windows, sessions</b></li>
            <li><span>OBS</span><b>Nova assets, reports</b></li>
            <li><span>ModelArts</span><b>Train the fall model</b></li>
            <li><span>SIS</span><b>Speech in / out</b></li>
          </ul>
        </Panel>
      </div>

      <Panel kicker="Honest scope" title="What's real in this demo">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Area</th><th>In this demo</th><th>Production</th><th>Status</th></tr></thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.area}>
                  <td>{r.area}</td><td>{r.demo}</td><td>{r.prod}</td>
                  <td><Pill tone={r.status === 'live' ? 'ok' : r.status === 'sim' ? 'warn' : 'mute'}>{r.status === 'live' ? 'Working' : r.status === 'sim' ? 'Simulated' : 'Planned'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
