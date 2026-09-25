/**
 * Emergency escalation, enforced on the server so an incident still escalates
 * if the phone dies or the app is closed:
 *   checking (0–10 s) → escalating (10–40 s) → alerted
 * A response from the user cancels it; "I need help" alerts immediately.
 *
 * Dispatch targets:
 *   - MERS 999: ALWAYS simulated. Real 999 integration needs authorisation
 *     from the Malaysian government; Pulse never calls it in this build.
 *   - Emergency contacts: real SMS via Twilio when TWILIO_* secrets are set,
 *     otherwise recorded as simulated.
 */
import type { Env } from './env';

export const CHECK_S = 10;
export const ESCALATE_S = 30;

export interface IncidentRow {
  id: string; user_id: string; kind: string; label: string | null; confidence: number | null; contributions: string;
  stage: string; conscious: number | null; lat: number | null; lng: number | null; accuracy_m: number | null;
  vitals: string | null; speed: number; created_at: string; alerted_at: string | null; ack_by: string | null; ack_at: string | null; resolved_at: string | null; notes: string | null;
}

export function timeline(inc: IncidentRow, now = Date.now()) {
  const elapsed = ((now - Date.parse(inc.created_at)) / 1000) * (inc.speed || 1);
  const checkLeft = Math.max(0, CHECK_S - elapsed);
  const escalateLeft = Math.max(0, CHECK_S + ESCALATE_S - elapsed);
  const due = elapsed >= CHECK_S + ESCALATE_S ? 'alerted' : elapsed >= CHECK_S ? 'escalating' : 'checking';
  return { elapsed, due, secondsLeft: Math.ceil((due === 'checking' ? checkLeft : escalateLeft) / (inc.speed || 1)), countdown: Math.ceil(due === 'checking' ? checkLeft : escalateLeft) };
}

/** Move an open incident forward according to its timeline. Idempotent. */
export async function advance(env: Env, inc: IncidentRow): Promise<IncidentRow> {
  if (inc.stage !== 'checking' && inc.stage !== 'escalating') return inc;
  const { due } = timeline(inc);
  if (due === inc.stage) return inc;
  if (due === 'escalating') {
    const r = await env.DB.prepare("UPDATE incidents SET stage='escalating' WHERE id=? AND stage='checking'").bind(inc.id).run();
    if (r.meta.changes) await audit(env, inc.user_id, 'safety', `Incident ${inc.id.slice(0, 8)}: no response after ${CHECK_S} s → escalating`);
    return { ...inc, stage: 'escalating' };
  }
  return dispatch(env, inc, false);
}

/** Send the alert. Guarded so it runs exactly once per incident. */
export async function dispatch(env: Env, inc: IncidentRow, conscious: boolean): Promise<IncidentRow> {
  const r = await env.DB.prepare("UPDATE incidents SET stage='alerted', alerted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), conscious=? WHERE id=? AND stage IN ('checking','escalating')")
    .bind(conscious ? 1 : 0, inc.id).run();
  if (!r.meta.changes) return (await env.DB.prepare('SELECT * FROM incidents WHERE id=?').bind(inc.id).first<IncidentRow>())!;

  const user = await env.DB.prepare('SELECT name, phone, blood, allergies, consent_contacts FROM users WHERE id=?').bind(inc.user_id).first<{ name: string; phone: string | null; blood: string | null; allergies: string | null; consent_contacts: number }>();
  const contacts = (await env.DB.prepare('SELECT name, phone FROM contacts WHERE user_id=? ORDER BY is_primary DESC').bind(inc.user_id).all<{ name: string; phone: string }>()).results;
  const where = inc.lat != null ? `https://maps.google.com/?q=${inc.lat},${inc.lng}` : 'location unavailable';
  const who = user?.name ?? 'A Pulse user';
  const what = kindLabel(inc.kind);

  await note(env, inc.id, 'mers999', 'MERS 999 (sandbox)', 'simulated', `${what}; ${conscious ? 'conscious' : 'unresponsive'}; ${where}`);
  if (user?.consent_contacts) {
    const body = `PULSE ALERT: ${who} may need help (${what}${conscious ? ', asked for help' : ', not responding'}). Location: ${where}. This is an automated message from Pulse AI.`;
    for (const c of contacts) {
      const res = await sendSms(env, c.phone, body);
      await note(env, inc.id, 'sms', `${c.name} ${c.phone}`, res.status, res.detail);
    }
  }
  await audit(env, inc.user_id, 'dispatch', `Incident ${inc.id.slice(0, 8)} alerted: MERS 999 (simulated) + ${user?.consent_contacts ? contacts.length : 0} contact(s)`);
  return (await env.DB.prepare('SELECT * FROM incidents WHERE id=?').bind(inc.id).first<IncidentRow>())!;
}

async function sendSms(env: Env, to: string, body: string): Promise<{ status: 'sent' | 'failed' | 'simulated'; detail: string }> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) return { status: 'simulated', detail: 'Twilio not configured' };
  const e164 = to.replace(/[^\d+]/g, '').replace(/^0/, '+60');
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: e164, From: env.TWILIO_FROM, Body: body }),
    });
    const j = await r.json() as { sid?: string; message?: string };
    return r.ok ? { status: 'sent', detail: j.sid ?? 'ok' } : { status: 'failed', detail: j.message ?? String(r.status) };
  } catch (e) { return { status: 'failed', detail: (e as Error).message }; }
}

async function note(env: Env, incidentId: string, channel: string, target: string, status: string, detail: string) {
  await env.DB.prepare('INSERT INTO notifications (incident_id,channel,target,status,detail) VALUES (?,?,?,?,?)').bind(incidentId, channel, target, status, detail.slice(0, 300)).run();
}

export async function audit(env: Env, userId: string | null, kind: string, text: string) {
  try { await env.DB.prepare('INSERT INTO audit (user_id,kind,text) VALUES (?,?,?)').bind(userId, kind, text.slice(0, 300)).run(); } catch { /* never break a request */ }
}

export function kindLabel(k: string) {
  return ({ fall: 'possible fall', crash: 'possible vehicle collision', syncope: 'possible fainting', inactivity: 'unusual inactivity', manual_sos: 'manual SOS', conversation: 'reported symptoms' } as Record<string, string>)[k] ?? k;
}
