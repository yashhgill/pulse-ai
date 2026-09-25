import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Headphones, MapPin, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { PageHead, Panel, Pill } from '../components/ui';
import { MiniMap } from '../components/Emergency';

interface Row {
  id: string; kind: string; kindLabel: string; label: string | null; stage: string; confidence: number | null; conscious: number | null;
  lat: number | null; lng: number | null; created_at: string; ack_by: string | null; resolved_at: string | null; countdown: number;
  vitals: { hr?: number; spo2?: number } | null;
  notifications: { channel: string; target: string; status: string }[];
  user: { name: string; phone: string | null };
  medical: { blood: string | null; allergies: string | null; conditions: string | null } | null;
  contacts: { name: string; relation: string | null; phone: string }[];
}
interface Stats { users: number; incidents: number; alerted: number; cancelled: number; falseAlarmRate: number; chats: number; appts: number; sms: number }

const TONE: Record<string, 'bad' | 'warn' | 'ok' | 'mute' | 'info'> = { alerted: 'bad', escalating: 'warn', checking: 'warn', cancelled: 'mute', resolved: 'ok' };
const ago = (iso: string) => { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

export function Dispatch() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api<Row[]>('/dispatch/incidents'), api<Stats>('/admin/stats')]);
      setRows(r); setStats(s); setErr('');
      setSel(cur => cur ?? r[0]?.id ?? null);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); }, [load]);

  const cur = rows.find(r => r.id === sel) ?? null;
  const act = async (path: string, body: unknown = {}) => { if (!cur) return; await api(`/dispatch/incidents/${cur.id}/${path}`, { body }); setNotes(''); load(); };
  const live = rows.filter(r => !r.resolved_at && (r.stage === 'alerted' || r.stage === 'checking' || r.stage === 'escalating')).length;

  return (
    <div className="page">
      <PageHead kicker="Dispatcher console" title="Live incidents"
        sub="Every incident from Pulse users in the last 48 hours. Alerts appear here the moment the escalation timer runs out. Refreshes every 3 s."
        right={<button className="btn btn--outline" onClick={load}><RefreshCw size={16} /> Refresh</button>} />
      {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}

      {stats && (
        <div className="kpis">
          <div><span>Open now</span><b>{live}</b></div>
          <div><span>Incidents</span><b>{stats.incidents}</b></div>
          <div><span>Alerts sent</span><b>{stats.alerted}</b></div>
          <div><span>Cancelled by user</span><b>{stats.falseAlarmRate}%</b></div>
          <div><span>Users</span><b>{stats.users}</b></div>
          <div><span>Real SMS sent</span><b>{stats.sms}</b></div>
        </div>
      )}

      <div className="dispatch">
        <ul className="dispatch__list">
          {rows.length === 0 && <li className="muted small">No incidents yet. Trigger one from a member account (Devices → Fall) and it will appear here.</li>}
          {rows.map(r => (
            <li key={r.id}>
              <button className={`dispatch__row ${r.id === sel ? 'is-on' : ''}`} onClick={() => setSel(r.id)}>
                <div className="row between"><b>{r.user.name}</b><Pill tone={r.resolved_at ? 'ok' : TONE[r.stage] ?? 'mute'}>{r.resolved_at ? 'closed' : r.stage}</Pill></div>
                <span className="muted small">{r.label ?? r.kindLabel} · {ago(r.created_at)}{r.stage === 'checking' || r.stage === 'escalating' ? ` · ${r.countdown}s` : ''}</span>
              </button>
            </li>
          ))}
        </ul>

        {cur && (
          <Panel kicker={`${cur.kindLabel} · ${new Date(cur.created_at).toLocaleTimeString()}`} title={cur.user.name}
            right={<Pill tone={cur.resolved_at ? 'ok' : TONE[cur.stage] ?? 'mute'}>{cur.resolved_at ? 'closed' : cur.stage}</Pill>}>
            <div className="stack">
              {cur.lat != null && cur.lng != null
                ? <MiniMap lat={cur.lat} lng={cur.lng} label="Reported location" height={180} />
                : <p className="muted small"><MapPin size={12} /> Location withheld (no consent)</p>}
              <dl className="medid">
                <div><dt>Responsive</dt><dd>{cur.conscious == null ? 'Unknown' : cur.conscious ? 'Yes, asked for help' : 'No response'}</dd></div>
                <div><dt>Confidence</dt><dd>{cur.confidence != null ? `${Math.round(cur.confidence * 100)}%` : '–'}</dd></div>
                <div><dt>Vitals at detection</dt><dd>{cur.vitals?.hr ? `${cur.vitals.hr} bpm · SpO₂ ${cur.vitals.spo2}%` : '–'}</dd></div>
                <div><dt>Phone</dt><dd>{cur.user.phone || '–'}</dd></div>
                {cur.medical ? <>
                  <div><dt>Blood</dt><dd>{cur.medical.blood || '–'}</dd></div>
                  <div><dt>Allergies</dt><dd>{cur.medical.allergies || '–'}</dd></div>
                  <div><dt>Conditions</dt><dd>{cur.medical.conditions || '–'}</dd></div>
                </> : <div><dt>Medical ID</dt><dd>Withheld (no consent)</dd></div>}
              </dl>
              <div>
                <h4 className="kicker">Notified</h4>
                <ul className="sos__recips sos__recips--light">
                  {cur.notifications.map((n, i) => <li key={i}><b>{n.channel === 'mers999' ? 'MERS 999' : n.target}</b><span>{n.channel}</span><i>{n.status}</i></li>)}
                  {!cur.notifications.length && <li><span className="muted">Nothing sent yet</span></li>}
                </ul>
              </div>
              <div>
                <h4 className="kicker">Emergency contacts</h4>
                <ul className="sos__recips sos__recips--light">{cur.contacts.map(c => <li key={c.phone}><b>{c.name}</b><span>{c.relation}</span><a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></li>)}</ul>
              </div>
              {!cur.resolved_at && (
                <div className="stack">
                  <textarea rows={2} placeholder="Notes, e.g. Ambulance from Hospital Melaka, ETA 8 min" value={notes} onChange={e => setNotes(e.target.value)} />
                  <div className="row">
                    <button className="btn btn--primary" disabled={!!cur.ack_by} onClick={() => act('ack')}><Headphones size={16} /> {cur.ack_by ? `Acknowledged by ${cur.ack_by}` : 'Acknowledge & assign'}</button>
                    <button className="btn btn--outline" onClick={() => act('resolve', { notes })}><CheckCircle2 size={16} /> Close incident</button>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
