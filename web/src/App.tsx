import { useCallback, useEffect, useState } from 'react';
import { Activity, Blocks, LogOut, Radio, CalendarDays, HeartPulse, LayoutDashboard, MessageCircle, MonitorSmartphone, ShieldCheck, Siren, Sparkles } from 'lucide-react';
import { EmergencyOverlay } from './components/Emergency';
import { Pill } from './components/ui';
import { StoreProvider, useStore } from './lib/store';
import type { MeResponse, Page } from './lib/store';
import { api, tokenStore } from './lib/api';
import { Auth } from './pages/Auth';
import { Dispatch } from './pages/Dispatch';
import { Overview } from './pages/Overview';
import { NovaChat } from './pages/NovaChat';
import { Health } from './pages/Health';
import { Safety } from './pages/Safety';
import { Care } from './pages/Care';
import { Devices } from './pages/Devices';
import { States } from './pages/States';
import { Architecture } from './pages/Architecture';

const NAV: { id: Page; label: string; icon: React.ReactNode; group: 'app' | 'demo' | 'ops' }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} />, group: 'app' },
  { id: 'nova', label: 'Ask Nova', icon: <MessageCircle size={18} />, group: 'app' },
  { id: 'health', label: 'Health', icon: <HeartPulse size={18} />, group: 'app' },
  { id: 'safety', label: 'Safety', icon: <ShieldCheck size={18} />, group: 'app' },
  { id: 'care', label: 'Appointments', icon: <CalendarDays size={18} />, group: 'app' },
  { id: 'dispatch', label: 'Dispatch', icon: <Radio size={18} />, group: 'ops' },
  { id: 'devices', label: 'Devices', icon: <MonitorSmartphone size={18} />, group: 'demo' },
  { id: 'states', label: 'Nova states', icon: <Sparkles size={18} />, group: 'demo' },
  { id: 'architecture', label: 'Architecture', icon: <Blocks size={18} />, group: 'demo' },
];

function Shell() {
  const s = useStore();
  const incident = s.phase !== 'idle' && s.phase !== 'cancelled';
  const ops = s.me.role !== 'member';
  const tabs = ops ? NAV.filter(n => n.group === 'ops') : NAV.filter(n => n.group === 'app');
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand__mark"><Activity size={18} /></span>
          <span className="brand__name">Pulse<b>AI</b></span>
        </div>
        <nav>
          {ops && <><p className="side__group">Operations</p>
          {NAV.filter(n => n.group === 'ops').map(n => (
            <button key={n.id} className={`navlink ${s.page === n.id ? 'is-on' : ''}`} onClick={() => s.go(n.id)}>{n.icon}<span>{n.label}</span></button>
          ))}</>}
          <p className="side__group">App</p>
          {NAV.filter(n => n.group === 'app').map(n => (
            <button key={n.id} className={`navlink ${s.page === n.id ? 'is-on' : ''}`} onClick={() => s.go(n.id)}>{n.icon}<span>{n.label}</span></button>
          ))}
          <p className="side__group">Demo</p>
          {NAV.filter(n => n.group === 'demo').map(n => (
            <button key={n.id} className={`navlink ${s.page === n.id ? 'is-on' : ''}`} onClick={() => s.go(n.id)}>{n.icon}<span>{n.label}</span></button>
          ))}
        </nav>
        <div className="side__foot">
          <div className="dev"><span className="dot dot--ok" />Phone · streaming</div>
          <div className="dev"><span className="dot dot--ok" />Watch · {Math.round(s.live.hr)} bpm</div>
          <p className="side__note">Signed in as {s.me.email}{ops ? ` · ${s.me.role}` : ''}</p>
          <button className="navlink" onClick={s.logout}><LogOut size={18} /><span>Sign out</span></button>
          <p className="side__note">Simulated sensors · MERS 999 simulated</p>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__status">
            {incident ? <Pill tone="bad">Incident in progress</Pill> : <Pill tone="ok">Protection armed</Pill>}
            <span className="muted small hide-sm">Nova: <code>{s.nova}</code></span>
          </div>
          <div className="row">
          <button className="btn btn--ghost btn--sm show-sm" onClick={s.logout} aria-label="Sign out"><LogOut size={16} /></button>
          <button className="btn btn--danger btn--sm" onClick={s.triggerManualSOS} disabled={incident}><Siren size={16} /> SOS</button>
          </div>
        </header>

        <main>
          {s.page === 'overview' && <Overview />}
          {s.page === 'nova' && <NovaChat />}
          {s.page === 'health' && <Health />}
          {s.page === 'safety' && <Safety />}
          {s.page === 'care' && <Care />}
          {s.page === 'devices' && <Devices />}
          {s.page === 'states' && <States />}
          {s.page === 'architecture' && <Architecture />}
          {s.page === 'dispatch' && ops && <Dispatch />}
        </main>
        {s.error && <div className="toast" role="alert" onClick={() => s.setError(null)}>{s.error} · tap to dismiss</div>}
      </div>

      <nav className="tabbar" aria-label="Sections">
        {tabs.map(n => (
          <button key={n.id} className={s.page === n.id ? 'is-on' : ''} onClick={() => s.go(n.id)}>{n.icon}<span>{n.label}</span></button>
        ))}
      </nav>

      <EmergencyOverlay />
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<'loading' | 'out' | 'in'>(tokenStore.get() ? 'loading' : 'out');
  const load = useCallback(() => {
    setState('loading');
    api<MeResponse>('/me').then(r => { setMe(r); setState('in'); }).catch(() => { tokenStore.set(null); setState('out'); });
  }, []);
  useEffect(() => { if (tokenStore.get()) load(); }, [load]);
  useEffect(() => { const f = () => { setMe(null); setState('out'); }; window.addEventListener('auth:logout', f); return () => window.removeEventListener('auth:logout', f); }, []);
  if (state === 'loading') return <div className="boot"><Activity size={28} /></div>;
  if (state === 'out' || !me) return <Auth onAuthed={load} />;
  return <StoreProvider key={me.user.id} initial={me} onLogout={() => { setMe(null); setState('out'); }}><Shell /></StoreProvider>;
}
