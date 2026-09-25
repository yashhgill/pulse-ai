import { useEffect, useRef, useState } from 'react';
import { BookOpen, Mic, Send, Volume2, VolumeX } from 'lucide-react';
import { Nova } from '../components/Nova';
import { PageHead, Pill } from '../components/ui';
import { uid, useStore } from '../lib/store';
import { SUGGESTIONS } from '../lib/nova';
import { api } from '../lib/api';
import type { NovaResult } from '../lib/nova';
import { useSpeech } from '../lib/useSpeech';
import type { ChatMessage, NovaAction, Urgency } from '../lib/types';

const TONE: Record<Urgency, 'bad' | 'warn' | 'info' | 'mute' | 'ok'> = {
  critical: 'bad', high: 'warn', moderate: 'warn', low: 'info', none: 'mute',
};

export function NovaChat() {
  const s = useStore();
  const [msgs, setMsgs] = useState<ChatMessage[]>([
    { id: 'hello', role: 'nova', text: `Hey ${s.me.name.split(' ')[0]}. Tell me how you're feeling, ask a health question, or say "book a clinic". Try the mic too.` },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<ChatMessage['pipeline']>();
  const [step, setStep] = useState(-1);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs, busy]);

  const send = (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setText('');
    setMsgs(m => [...m, { id: uid(), role: 'user', text: q }]);
    setBusy(true);
    s.setNova('thinking', 'message received');
    const started = Date.now();
    api<NovaResult & { ai?: boolean }>('/nova/chat', { body: { text: q, hr: Math.round(s.live.hr), spo2: Math.round(s.live.spo2) } })
      .then(r => {
        setTrace(r.pipeline);
        setStep(-1);
        r.pipeline!.forEach((_, i) => setTimeout(() => setStep(i), 120 * i));
        const wait = Math.max(0, 120 * r.pipeline!.length + 150 - (Date.now() - started));
        setTimeout(() => {
          setMsgs(m => [...m, { id: uid(), role: 'nova', text: r.text, urgency: r.urgency, actions: r.actions, sources: r.sources, pipeline: r.pipeline }]);
          s.say(r.text, r.state);
          setBusy(false);
          if (r.urgency === 'critical') setTimeout(() => s.startCheckIn('Nova conversation', `Classifier: ${q.slice(0, 40)}`), 900);
        }, wait);
      })
      .catch(e => {
        setMsgs(m => [...m, { id: uid(), role: 'nova', text: `I couldn't reach the server (${(e as Error).message}). If this is an emergency, press SOS or call 999.` }]);
        s.setNova('idle', 'chat failed');
        setBusy(false);
      });
  };

  const speech = useSpeech(send);

  const act = (a: NovaAction) => {
    if (a.type === 'emergency') s.triggerManualSOS();
    else if (a.type === 'book') s.go('care');
    else if (a.type === 'health') s.go('health');
    else if (a.type === 'safe') s.say("Okay. I'll stay close. Tell me if anything changes.", 'safe');
    else if (a.type === 'breathing') {
      s.say('Breathe in slowly for four… hold for four… and out for six. Let’s do that three more times together.', 'talking');
      setMsgs(m => [...m, { id: uid(), role: 'nova', text: 'Breathe in for 4 · hold for 4 · out for 6. Repeat 4 times. I’m watching your heart rate while you do it.' }]);
    }
  };

  return (
    <div className="page">
      <PageHead kicker="Nova AI" title="Talk to Nova"
        sub="Every message runs through the same pipeline as production: understand, safety classifier, vitals, recent events, urgency, then action."
        right={
          <button className="btn btn--outline" onClick={() => s.setVoice(!s.voice)}>
            {s.voice ? <Volume2 size={16} /> : <VolumeX size={16} />} Nova voice {s.voice ? 'on' : 'off'}
          </button>
        }
      />

      <div className="chat">
        <div className="chat__main">
          <div className="chat__log">
            {msgs.map(m => (
              <div key={m.id} className={`msg msg--${m.role}`}>
                {m.role === 'nova' && <span className="msg__who">Nova{m.urgency && m.urgency !== 'none' && <Pill tone={TONE[m.urgency]}>{m.urgency}</Pill>}</span>}
                <p>{m.text}</p>
                {m.sources && (
                  <div className="msg__sources"><BookOpen size={12} /> {m.sources.join(' · ')}</div>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="msg__actions">
                    {m.actions.map(a => <button key={a.label} className={`chip ${a.type === 'emergency' ? 'chip--danger' : ''}`} onClick={() => act(a)}>{a.label}</button>)}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="msg msg--nova msg--typing"><i /><i /><i /></div>}
            <div ref={end} />
          </div>

          <div className="chat__suggest">
            {SUGGESTIONS.map(q => <button key={q} className="chip" onClick={() => send(q)} disabled={busy}>{q}</button>)}
          </div>

          <form className="composer" onSubmit={e => { e.preventDefault(); send(text); }}>
            <input value={speech.listening ? speech.interim || 'Listening…' : text} onChange={e => setText(e.target.value)} placeholder="Hey Nova, I feel…" aria-label="Message Nova" />
            <button type="button" className={`btn btn--icon ${speech.listening ? 'btn--rec' : ''}`} onClick={speech.listening ? speech.stop : speech.start} title={speech.reason ?? 'Speak to Nova'} aria-label="Speak to Nova"><Mic size={18} /></button>
            <button type="submit" className="btn btn--primary btn--icon" aria-label="Send"><Send size={18} /></button>
          </form>
          {speech.error && <p className="hint">{speech.error}</p>}
        </div>

        <aside className="chat__side">
          <Nova state={s.nova} size={190} />
          <p className="chat__state"><code>nova.state = "{s.nova}"</code></p>
          <div className="trace">
            <p className="kicker">Pipeline trace</p>
            {!trace && <p className="muted small">Send a message to see each stage run.</p>}
            <ol>
              {trace?.map((t, i) => (
                <li key={t.name} className={i <= step ? 'on' : ''}>
                  <b>{t.name}</b><span>{t.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
