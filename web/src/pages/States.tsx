import { Nova } from '../components/Nova';
import { PageHead, Panel, timeAgo } from '../components/ui';
import { useStore } from '../lib/store';
import { NOVA_STATES } from '../lib/types';
import type { NovaState } from '../lib/types';

const LINES: Record<NovaState, string> = {
  idle: "I'm here and watching your vitals.",
  listening: "I'm listening…",
  thinking: 'Let me check your vitals and history…',
  talking: 'Here’s what I found.',
  happy: 'Great job, you hit your step goal!',
  concerned: 'Your heart rate is higher than usual. How are you feeling?',
  sleeping: 'Sleep tracking on. Good night.',
  appointment: "I've booked your appointment for tomorrow at 10:30 AM.",
  fall_detected: "I've detected a possible fall. Are you okay?",
  emergency: 'Help is on the way. Stay with me.',
  safe: "Glad you're okay. I'll keep watching.",
};

export function States() {
  const s = useStore();
  return (
    <div className="page">
      <PageHead kicker="NovaStateMachine" title="Nova's states"
        sub="Pulse Core sets Nova's state; every surface renders it. Tap a state to drive Nova the way the backend would." />

      <div className="states">
        {NOVA_STATES.map(st => (
          <button key={st} className={`state ${s.nova === st ? 'is-on' : ''}`} onClick={() => s.say(LINES[st], st)}>
            <Nova state={st} size={96} />
            <code>{st}</code>
          </button>
        ))}
      </div>

      <div className="grid-2">
        <Panel kicker="Backend call" title="What Pulse Core sends">
          <pre className="code">{`// Pulse Core → client (WebSocket)
nova.state = "${s.nova}";
nova.speak(${JSON.stringify(s.novaLine)});`}</pre>
        </Panel>
        <Panel kicker="Audit log" title="Event stream">
          <ul className="feed feed--tall">
            {s.log.map(e => <li key={e.id} className={`feed__${e.kind}`}><span>{e.text}</span><time>{timeAgo(e.at)}</time></li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
