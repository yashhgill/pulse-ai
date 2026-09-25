import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { baselineFrame, fuse, SCENARIOS, THRESHOLD_HIGH, THRESHOLD_LOW } from './sensorFusion';
import { api, tokenStore } from './api';
import type {
  Appointment, Contact, EmergencyPhase, FusionResult, Incident, LogEvent, Me,
  Medication, NovaState, ScenarioId, SensorFrame, ServerIncident,
} from './types';

export type Page = 'overview' | 'nova' | 'health' | 'safety' | 'care' | 'devices' | 'states' | 'architecture' | 'dispatch';

const TICK_MS = 200;          // 5 Hz sensor stream
const BUFFER = 100;           // 20 s of history
const CHECK_SECONDS = 10;     // "Are you okay?"
const ESCALATE_SECONDS = 30;  // second warning

export const uid = () => Math.random().toString(36).slice(2, 10);

interface Store {
  me: Me;
  user: { name: string; fullName: string; blood: string; allergies: string; conditions: string; home: string; lat: number; lng: number; ic: string };
  logout: () => void;
  saveProfile: (patch: Partial<Me>) => Promise<void>;

  page: Page;
  go: (p: Page) => void;

  nova: NovaState;
  setNova: (s: NovaState, reason?: string) => void;
  novaLine: string;
  say: (line: string, state?: NovaState) => void;
  voice: boolean;
  setVoice: (v: boolean) => void;

  frames: SensorFrame[];
  live: SensorFrame;
  lastFusion: FusionResult | null;
  runScenario: (id: ScenarioId) => void;
  activeScenario: ScenarioId | null;

  phase: EmergencyPhase;
  countdown: number;
  incident: Incident | null;
  respondOkay: () => void;
  respondNeedHelp: () => void;
  skipAhead: () => void;
  closeEmergency: () => void;
  triggerManualSOS: () => void;
  startCheckIn: (label: string, reason: string) => void;
  demoFast: boolean;
  setDemoFast: (v: boolean) => void;

  consent: { location: boolean; health: boolean; contacts: boolean };
  setConsent: (k: 'location' | 'health' | 'contacts', v: boolean) => void;
  contacts: Contact[];
  addContact: (c: { name: string; phone: string; relation: string }) => Promise<void>;
  removeContact: (id: string) => Promise<void>;

  meds: Medication[];
  toggleMed: (id: string) => void;
  appointments: Appointment[];
  book: (a: Omit<Appointment, 'id' | 'ref' | 'status'>) => Promise<Appointment>;

  log: LogEvent[];
  push: (kind: LogEvent['kind'], text: string) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('store missing');
  return s;
};

function initialFrames(): SensorFrame[] {
  const out: SensorFrame[] = [];
  let prev: SensorFrame | undefined;
  const now = Date.now();
  for (let i = BUFFER; i > 0; i--) { prev = baselineFrame(now - i * TICK_MS, prev); out.push(prev); }
  return out;
}

const KIND_TO_SCENARIO: Record<string, ScenarioId> = { fall: 'fall', crash: 'crash', syncope: 'faint', inactivity: 'still', manual_sos: 'fall', conversation: 'faint' };
const SCENARIO_TO_KIND: Record<ScenarioId, string> = { fall: 'fall', crash: 'crash', faint: 'syncope', still: 'inactivity', drop: 'fall' };

function fromServer(i: ServerIncident): Incident {
  return {
    id: i.id, scenario: KIND_TO_SCENARIO[i.kind] ?? 'fall', label: i.label ?? i.kindLabel,
    result: { confidence: i.confidence ?? 1, incident: (i.kind === 'syncope' ? 'syncope' : i.kind === 'crash' ? 'crash' : i.kind === 'inactivity' ? 'inactivity' : i.kind === 'fall' ? 'fall' : 'none'), contributions: i.contributions.map(c => ({ key: (c.key ?? 'motion') as never, label: c.label, weight: c.weight })) },
    startedAt: Date.parse(i.created_at), conscious: i.conscious == null ? null : !!i.conscious,
    lat: i.lat, lng: i.lng, notifications: i.notifications, ackBy: i.ack_by,
  };
}

/** Best-effort real GPS fix (only used when the user consented to location sharing). */
function locate(): Promise<{ lat: number; lng: number; accuracy_m: number } | null> {
  return new Promise(res => {
    if (!('geolocation' in navigator)) return res(null);
    const t = setTimeout(() => res(null), 2500);
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }); },
      () => { clearTimeout(t); res(null); }, { enableHighAccuracy: true, timeout: 2200, maximumAge: 60000 });
  });
}

interface MeResponse { user: Me; contacts: { id: string; name: string; relation: string | null; phone: string; is_primary: number }[]; meds: { id: string; name: string; dose: string | null; time: string | null; taken: boolean }[]; appointments: { id: string; clinic_name: string; date: string; time: string; reason: string | null; ref: string; status: 'requested' | 'confirmed' }[] }

export function StoreProvider({ initial, onLogout, children }: { initial: MeResponse; onLogout: () => void; children: ReactNode }) {
  const [me, setMe] = useState<Me>(initial.user);
  const [page, setPage] = useState<Page>(initial.user.role === 'member' ? 'overview' : 'dispatch');
  const [nova, setNovaRaw] = useState<NovaState>('idle');
  const [novaLine, setNovaLine] = useState(`Hi ${initial.user.name.split(' ')[0]}, I'm Nova. I'm watching your vitals and I'm ready if anything happens.`);
  const [voice, setVoice] = useState(false);
  const [frames, setFrames] = useState<SensorFrame[]>(initialFrames);
  const [lastFusion, setLastFusion] = useState<FusionResult | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioId | null>(null);
  const [phase, setPhase] = useState<EmergencyPhase>('idle');
  const [countdown, setCountdown] = useState(0);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [demoFast, setDemoFast] = useState(true);
  const [contacts, setContactsState] = useState<Contact[]>([]);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scenarioRef = useRef<{ id: ScenarioId; start: number } | null>(null);
  const phaseRef = useRef<EmergencyPhase>('idle');
  phaseRef.current = phase;
  const incidentRef = useRef<Incident | null>(null);
  incidentRef.current = incident;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const lastStage = useRef<string>('');

  const applyMe = useCallback((r: MeResponse) => {
    setMe(r.user);
    setContactsState(r.contacts.map(c => ({ id: c.id, name: c.name, relation: c.relation ?? '', phone: c.phone, primary: !!c.is_primary })));
    setMeds(r.meds.map(m => ({ id: m.id, name: m.name, dose: m.dose ?? '', time: m.time ?? '', taken: m.taken })));
    setAppointments(r.appointments.map(a => ({ id: a.id, clinicId: '', clinicName: a.clinic_name, date: a.date, time: a.time, reason: a.reason ?? '', ref: a.ref, status: a.status })));
  }, []);
  useEffect(() => { applyMe(initial); }, [initial, applyMe]);

  const loadLog = useCallback(async () => {
    try {
      const rows = await api<{ id: number; kind: LogEvent['kind']; text: string; at: string }[]>('/audit');
      setLog(rows.map(r => ({ id: String(r.id), kind: r.kind, text: r.text, at: Date.parse(r.at.endsWith('Z') ? r.at : r.at.replace(' ', 'T') + 'Z') })));
    } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => { loadLog(); const id = setInterval(loadLog, 15000); return () => clearInterval(id); }, [loadLog]);

  const push = useCallback((kind: LogEvent['kind'], text: string) => {
    setLog(l => [{ id: uid(), at: Date.now(), kind, text }, ...l].slice(0, 80));
  }, []);

  const speak = useCallback((line: string) => {
    if (!voiceRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.02; u.pitch = 1.15;
    const v = window.speechSynthesis.getVoices().find(v => /en-(GB|US|AU)/.test(v.lang) && /female|samantha|karen|serena|google uk english female/i.test(v.name));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }, []);

  const novaRef = useRef(nova);
  const setNova = useCallback((s: NovaState, reason?: string) => {
    if (novaRef.current !== s) push('nova', `nova.state = "${s}"${reason ? ` · ${reason}` : ''}`);
    novaRef.current = s;
    setNovaRaw(s);
  }, [push]);

  const say = useCallback((line: string, state?: NovaState) => {
    setNovaLine(line);
    if (state) setNova(state);
    speak(line);
  }, [setNova, speak]);

  // ── Sensor stream (simulated phone + watch) ───────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const sc = scenarioRef.current;
      if (sc) {
        const holding = phaseRef.current !== 'idle' && phaseRef.current !== 'cancelled';
        if (Date.now() - sc.start > 4000 && !holding) { scenarioRef.current = null; setActiveScenario(null); }
      }
      const active = scenarioRef.current;
      setFrames(prev => {
        const last = prev[prev.length - 1];
        let f = baselineFrame(Date.now(), last);
        if (active) f = SCENARIOS.find(s => s.id === active.id)!.shape(f, Date.now() - active.start);
        const next = prev.length >= BUFFER ? prev.slice(1) : prev.slice();
        next.push(f);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Upload a vitals sample every 15 s (what a paired watch would do)
  useEffect(() => {
    const id = setInterval(() => {
      const f = framesRef.current.slice(-25);
      const avg = (k: 'hr' | 'spo2') => f.reduce((s, x) => s + x[k], 0) / f.length;
      api('/vitals', { body: { hr: Math.round(avg('hr')), spo2: Math.round(avg('spo2') * 10) / 10, source: 'watch' } }).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Incident sync: the server owns the escalation timeline ───────────────
  const applyIncident = useCallback((i: ServerIncident | null) => {
    if (!i) return;
    setIncident(fromServer(i));
    setCountdown(i.countdown);
    const stage = i.stage === 'resolved' ? 'alerted' : i.stage;
    if (stage !== lastStage.current) {
      lastStage.current = stage;
      if (stage === 'escalating') say("I haven't heard from you. If you don't respond in 30 seconds, I will alert emergency services and your contacts.", 'emergency');
      if (stage === 'alerted') say(i.conscious ? "I'm getting help now. Stay with me and keep talking to me." : 'Help is on the way. I have shared your location and health summary. Stay still if you can.', 'emergency');
      if (stage === 'cancelled') say("Glad you're okay. I'll keep an eye on you for the next hour.", 'safe');
    }
    setPhase(stage as EmergencyPhase);
  }, [say]);

  useEffect(() => {
    if (phase !== 'checking' && phase !== 'escalating' && phase !== 'alerted') return;
    const id = setInterval(async () => {
      try { applyIncident(await api<ServerIncident | null>('/incidents/current')); } catch { /* keep last state */ }
    }, phase === 'alerted' ? 4000 : 1000);
    return () => clearInterval(id);
  }, [phase, applyIncident]);

  // Resume an open incident after a reload
  useEffect(() => { api<ServerIncident | null>('/incidents/current').then(i => { if (i && i.stage !== 'cancelled') applyIncident(i); }).catch(() => {}); }, [applyIncident]);

  const createIncident = useCallback(async (body: Record<string, unknown>, opening: string, state: NovaState) => {
    const busy = phaseRef.current !== 'idle' && phaseRef.current !== 'cancelled';
    if (busy) return;
    const loc = me.consent_location ? await locate() : null;
    const f = framesRef.current[framesRef.current.length - 1];
    try {
      const i = await api<ServerIncident>('/incidents', { body: { ...body, ...(loc ?? {}), vitals: { hr: Math.round(f.hr), spo2: Math.round(f.spo2) }, speed: demoFast ? 3 : 1 } });
      lastStage.current = '';
      say(opening, state);
      applyIncident(i);
      loadLog();
    } catch (e) { setError((e as Error).message); }
  }, [me.consent_location, demoFast, say, applyIncident, loadLog]);

  const runScenario = useCallback((id: ScenarioId) => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'cancelled') return;
    const def = SCENARIOS.find(s => s.id === id)!;
    scenarioRef.current = { id, start: Date.now() };
    setActiveScenario(id);
    setPhase('idle');
    push('safety', `Scenario injected: ${def.label}`);
    setTimeout(() => {
      const result = fuse(framesRef.current.slice(-15));
      setLastFusion(result);
      if (result.confidence >= THRESHOLD_HIGH) {
        createIncident({ kind: SCENARIO_TO_KIND[id], label: def.label, confidence: result.confidence, contributions: result.contributions },
          id === 'crash' ? 'Nova detected a collision. Are you responsive?' : 'I think you may have fallen. Are you okay?', 'fall_detected');
      } else if (result.confidence >= THRESHOLD_LOW) {
        push('safety', `${def.label} · confidence ${(result.confidence * 100).toFixed(0)}% → gentle check-in`);
        say("I noticed you've been still for a while. Are you okay? Tap me if you're fine.", 'concerned');
      } else {
        push('safety', `${def.label} · confidence ${(result.confidence * 100).toFixed(0)}% → ignored`);
        say('That looked like your phone was dropped. Your watch says you are fine, so I ignored it.', 'safe');
      }
    }, 2600);
  }, [createIncident, push, say]);

  const respond = useCallback(async (response: 'okay' | 'help') => {
    const inc = incidentRef.current;
    if (!inc) return;
    try { applyIncident(await api<ServerIncident>(`/incidents/${inc.id}/respond`, { body: { response } })); loadLog(); }
    catch (e) { setError((e as Error).message); }
    if (response === 'okay') { scenarioRef.current = null; setActiveScenario(null); }
  }, [applyIncident, loadLog]);
  const respondOkay = useCallback(() => { respond('okay'); }, [respond]);
  const respondNeedHelp = useCallback(() => { respond('help'); }, [respond]);

  /** Demo helper: ask the server for the next stage now by re-reading after a short wait. */
  const skipAhead = useCallback(() => { setDemoFast(true); }, []);

  const closeEmergency = useCallback(() => {
    const inc = incidentRef.current;
    if (inc) api(`/incidents/${inc.id}/close`, { body: {} }).catch(() => {});
    setPhase('idle');
    setIncident(null);
    lastStage.current = '';
    scenarioRef.current = null; setActiveScenario(null);
    setNova('idle', 'incident closed');
    loadLog();
  }, [setNova, loadLog]);

  const triggerManualSOS = useCallback(() => {
    createIncident({ kind: 'manual_sos', label: 'Manual SOS', confidence: 1, contributions: [{ key: 'motion', label: 'Manual SOS pressed', weight: 1 }] }, 'SOS received. Getting help to you now.', 'emergency');
  }, [createIncident]);

  const startCheckIn = useCallback((label: string, reason: string) => {
    createIncident({ kind: 'conversation', label, confidence: 0.9, contributions: [{ key: 'hr', label: reason, weight: 0.9 }] }, 'That sounds serious. Are you okay? Tell me if you need help.', 'fall_detected');
  }, [createIncident]);

  const saveProfile = useCallback(async (patch: Partial<Me>) => {
    const next = { ...me, ...patch };
    try { applyMe(await api<MeResponse>('/me', { method: 'PUT', body: next })); loadLog(); }
    catch (e) { setError((e as Error).message); throw e; }
  }, [me, applyMe, loadLog]);

  const consent = useMemo(() => ({ location: !!me.consent_location, health: !!me.consent_health, contacts: !!me.consent_contacts }), [me]);
  const setConsent = useCallback((k: 'location' | 'health' | 'contacts', v: boolean) => {
    saveProfile({ [`consent_${k}`]: v ? 1 : 0 } as Partial<Me>).catch(() => {});
  }, [saveProfile]);

  const refreshMe = useCallback(async () => { applyMe(await api<MeResponse>('/me')); }, [applyMe]);
  const addContact = useCallback(async (c: { name: string; phone: string; relation: string }) => {
    await api('/contacts', { body: c }); await refreshMe(); loadLog();
  }, [refreshMe, loadLog]);
  const removeContact = useCallback(async (id: string) => { await api(`/contacts/${id}`, { method: 'DELETE' }); await refreshMe(); }, [refreshMe]);

  const toggleMed = useCallback((id: string) => {
    setMeds(ms => ms.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
    const m = meds.find(x => x.id === id);
    api(`/meds/${id}`, { method: 'PUT', body: { taken: !m?.taken } }).catch(() => {});
  }, [meds]);

  const book = useCallback(async (a: Omit<Appointment, 'id' | 'ref' | 'status'>) => {
    const r = await api<{ id: string; ref: string; status: 'requested' }>('/appointments', { body: { clinic_id: a.clinicId, clinic_name: a.clinicName, date: a.date, time: a.time, reason: a.reason } });
    const appt: Appointment = { ...a, id: r.id, ref: r.ref, status: 'requested' };
    setAppointments(x => [appt, ...x]);
    loadLog();
    setTimeout(() => { refreshMe().catch(() => {}); loadLog(); }, 3500);
    return appt;
  }, [loadLog, refreshMe]);

  const logout = useCallback(() => { tokenStore.set(null); onLogout(); }, [onLogout]);
  const go = useCallback((p: Page) => { setPage(p); window.scrollTo({ top: 0 }); }, []);

  const user = useMemo(() => ({
    name: me.name.split(' ')[0], fullName: me.name, blood: me.blood || 'Not set', allergies: me.allergies || 'None recorded',
    conditions: me.conditions || 'None recorded', home: me.home_address || 'Home location not set',
    lat: me.home_lat ?? 2.2701, lng: me.home_lng ?? 102.2835, ic: 'Not stored',
  }), [me]);

  const value = useMemo<Store>(() => ({
    me, user, logout, saveProfile,
    page, go, nova, setNova, novaLine, say, voice, setVoice,
    frames, live: frames[frames.length - 1], lastFusion, runScenario, activeScenario,
    phase, countdown, incident, respondOkay, respondNeedHelp, skipAhead, closeEmergency, triggerManualSOS, startCheckIn,
    demoFast, setDemoFast, consent, setConsent, contacts, addContact, removeContact,
    meds, toggleMed, appointments, book, log, push, error, setError,
  }), [me, user, logout, saveProfile, page, go, nova, setNova, novaLine, say, voice, frames, lastFusion, runScenario, activeScenario,
    phase, countdown, incident, respondOkay, respondNeedHelp, skipAhead, closeEmergency, triggerManualSOS, startCheckIn,
    demoFast, consent, setConsent, contacts, addContact, removeContact, meds, toggleMed, appointments, book, log, push, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { MeResponse };
export const CHECK_TOTAL = CHECK_SECONDS;
export const ESCALATE_TOTAL = ESCALATE_SECONDS;
