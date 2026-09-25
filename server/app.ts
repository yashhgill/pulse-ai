import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppVars, Env } from './lib/env';
import { hashPassword, newId, signJwt, verifyJwt, verifyPassword } from './lib/auth';
import { LlmError } from './lib/llm';
import { advance, audit, dispatch, kindLabel, timeline, type IncidentRow } from './lib/dispatch';
import { novaReply } from './lib/nova';

type C = Context<{ Bindings: Env; Variables: AppVars }>;
const app = new Hono<{ Bindings: Env; Variables: AppVars }>().basePath('/api');

const secret = (env: Env) => env.JWT_SECRET || 'dev-only-secret-change-me';
const bad = (msg: string, status: 400 | 401 | 403 | 404 | 409 = 400): never => { throw new HTTPException(status, { message: msg }); };
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const bool = (v: unknown) => (v ? 1 : 0);
const J = <T>(s: unknown, d: T): T => { try { return s ? JSON.parse(String(s)) as T : d; } catch { return d; } };

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof LlmError) return c.json({ error: err.message }, err.status as 502);
  console.error(err);
  return c.json({ error: 'Something went wrong on our side.' }, 500);
});

app.get('/health', async c => {
  const users = await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<number>('n');
  return c.json({
    ok: true, runtime: c.env.APP_RUNTIME ?? 'cloudflare', users,
    ai: c.env.LLM_PROVIDER === 'mock' ? 'mock' : c.env.GROQ_API_KEY ? 'groq' : 'not configured',
    sms: c.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'simulated', mers999: 'simulated', time: new Date().toISOString(),
  });
});

// ── Auth ────────────────────────────────────────────────────────────────────
const isAdminEmail = (env: Env, email: string) => (env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(email);

app.post('/auth/register', async c => {
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 120), email = str(b.email, 160).toLowerCase(), password = typeof b.password === 'string' ? b.password : '';
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter your name and a valid email.');
  if (password.length < 8) bad('Password must be at least 8 characters.');
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) bad('An account with this email already exists. Sign in instead.', 409);
  const id = newId();
  const role = isAdminEmail(c.env, email) ? 'admin' : 'member';
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)').bind(id, name, email, await hashPassword(password), role),
    // a gentle starter routine the user can edit
    c.env.DB.prepare('INSERT INTO medications (id,user_id,name,dose,time) VALUES (?,?,?,?,?)').bind(newId(), id, 'Drink water', '2 glasses', '09:00'),
    c.env.DB.prepare('INSERT INTO medications (id,user_id,name,dose,time) VALUES (?,?,?,?,?)').bind(newId(), id, 'Evening walk', '20 minutes', '18:30'),
  ]);
  await audit(c.env, id, 'system', 'Account created');
  return c.json({ token: await signJwt({ sub: id, email, role, name }, secret(c.env)), user: { id, name, email, role } }, 201);
});

app.post('/auth/login', async c => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 160).toLowerCase();
  const row = await c.env.DB.prepare('SELECT id,name,role,password_hash FROM users WHERE email=?').bind(email).first<{ id: string; name: string; role: string; password_hash: string }>();
  if (!row || !(await verifyPassword(String(b.password ?? ''), row.password_hash))) bad('Email or password is incorrect.', 401);
  let role = row!.role;
  if (role === 'member' && isAdminEmail(c.env, email)) { role = 'admin'; await c.env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(row!.id).run(); }
  return c.json({ token: await signJwt({ sub: row!.id, email, role, name: row!.name }, secret(c.env)), user: { id: row!.id, name: row!.name, email, role } });
});

const requireUser = async (c: C, next: Next) => {
  const h = c.req.header('authorization') ?? '';
  const p = h.startsWith('Bearer ') ? await verifyJwt<{ sub: string; email: string; role: string; name: string }>(h.slice(7), secret(c.env)) : null;
  if (!p) bad('Please sign in again.', 401);
  c.set('user', { id: p!.sub, email: p!.email, role: p!.role, name: p!.name });
  await next();
};
const requireDispatcher = async (c: C, next: Next) => {
  if (!['dispatcher', 'admin'].includes(c.get('user').role)) bad('Dispatchers only.', 403);
  await next();
};
for (const p of ['/me', '/me/*', '/contacts', '/contacts/*', '/meds', '/meds/*', '/vitals', '/vitals/*', '/incidents', '/incidents/*', '/nova/*', '/appointments', '/appointments/*', '/audit']) app.use(p, requireUser);
app.use('/dispatch/*', requireUser, requireDispatcher);
app.use('/admin/*', requireUser, async (c, next) => { if (c.get('user').role !== 'admin') bad('Admins only.', 403); await next(); });

// ── Profile ─────────────────────────────────────────────────────────────────
async function profile(env: Env, uid: string) {
  const [user, contacts, meds, appts] = await Promise.all([
    env.DB.prepare('SELECT id,name,email,role,phone,blood,allergies,conditions,home_address,home_lat,home_lng,consent_location,consent_health,consent_contacts FROM users WHERE id=?').bind(uid).first(),
    env.DB.prepare('SELECT id,name,relation,phone,is_primary FROM contacts WHERE user_id=? ORDER BY is_primary DESC, created_at').bind(uid).all(),
    env.DB.prepare('SELECT id,name,dose,time,taken_on FROM medications WHERE user_id=? ORDER BY time').bind(uid).all(),
    env.DB.prepare("SELECT id,clinic_name,date,time,reason,ref,CASE WHEN status='requested' AND created_at < datetime('now','-3 seconds') THEN 'confirmed' ELSE status END status FROM appointments WHERE user_id=? ORDER BY created_at DESC LIMIT 10").bind(uid).all(),
  ]);
  if (!user) bad('Account not found.', 404);
  const today = new Date().toISOString().slice(0, 10);
  return { user, contacts: contacts.results, meds: (meds.results as { taken_on: string | null }[]).map(m => ({ ...m, taken: m.taken_on === today })), appointments: appts.results };
}

app.get('/me', async c => c.json(await profile(c.env, c.get('user').id)));

app.put('/me', async c => {
  const b = await c.req.json();
  const u = c.get('user');
  await c.env.DB.prepare(`UPDATE users SET name=COALESCE(NULLIF(?,''),name), phone=?, blood=?, allergies=?, conditions=?, home_address=?, home_lat=?, home_lng=?,
      consent_location=?, consent_health=?, consent_contacts=? WHERE id=?`)
    .bind(str(b.name, 120), str(b.phone, 40), str(b.blood, 8), str(b.allergies, 200), str(b.conditions, 200), str(b.home_address, 200), num(b.home_lat), num(b.home_lng),
      bool(b.consent_location), bool(b.consent_health), bool(b.consent_contacts), u.id).run();
  await audit(c.env, u.id, 'system', `Profile & consent updated (location ${b.consent_location ? 'on' : 'off'}, health ${b.consent_health ? 'on' : 'off'}, contacts ${b.consent_contacts ? 'on' : 'off'})`);
  return c.json(await profile(c.env, u.id));
});

app.post('/contacts', async c => {
  const b = await c.req.json();
  const name = str(b.name, 80), phone = str(b.phone, 30);
  if (!name || !/^[+\d][\d\s-]{6,}$/.test(phone)) bad('Enter a name and a phone number like +60 12-345 6789.');
  const uid = c.get('user').id;
  const count = await c.env.DB.prepare('SELECT COUNT(*) n FROM contacts WHERE user_id=?').bind(uid).first<number>('n');
  if ((count ?? 0) >= 5) bad('Up to 5 emergency contacts.');
  const id = newId();
  await c.env.DB.prepare('INSERT INTO contacts (id,user_id,name,relation,phone,is_primary) VALUES (?,?,?,?,?,?)').bind(id, uid, name, str(b.relation, 40), phone, count ? 0 : 1).run();
  await audit(c.env, uid, 'system', `Emergency contact added: ${name}`);
  return c.json({ id }, 201);
});

app.delete('/contacts/:id', async c => {
  await c.env.DB.prepare('DELETE FROM contacts WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

app.post('/meds', async c => {
  const b = await c.req.json();
  if (!str(b.name)) bad('Give the reminder a name.');
  const id = newId();
  await c.env.DB.prepare('INSERT INTO medications (id,user_id,name,dose,time) VALUES (?,?,?,?,?)').bind(id, c.get('user').id, str(b.name, 80), str(b.dose, 60), str(b.time, 5)).run();
  return c.json({ id }, 201);
});

app.put('/meds/:id', async c => {
  const b = await c.req.json();
  await c.env.DB.prepare('UPDATE medications SET taken_on=? WHERE id=? AND user_id=?').bind(b.taken ? new Date().toISOString().slice(0, 10) : null, c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

app.delete('/meds/:id', async c => {
  await c.env.DB.prepare('DELETE FROM medications WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

// ── Vitals (phone / watch ingestion) ────────────────────────────────────────
app.post('/vitals', async c => {
  const b = await c.req.json();
  const list = (Array.isArray(b.samples) ? b.samples : [b]).slice(0, 60);
  const uid = c.get('user').id;
  const stmts = list.filter((s: Record<string, unknown>) => num(s.hr) != null || num(s.spo2) != null)
    .map((s: Record<string, unknown>) => c.env.DB.prepare('INSERT INTO vitals (user_id,hr,spo2,temp,steps,source) VALUES (?,?,?,?,?,?)').bind(uid, num(s.hr), num(s.spo2), num(s.temp), num(s.steps), str(s.source, 20) || 'watch'));
  if (stmts.length) await c.env.DB.batch(stmts);
  // keep the table small: last 24 h only
  await c.env.DB.prepare("DELETE FROM vitals WHERE user_id=? AND at < datetime('now','-1 day')").bind(uid).run();
  return c.json({ stored: stmts.length });
});

app.get('/vitals/summary', async c => {
  const uid = c.get('user').id;
  const r = await c.env.DB.prepare("SELECT strftime('%H', at) h, ROUND(AVG(hr)) hr, ROUND(AVG(spo2),1) spo2, COUNT(*) n FROM vitals WHERE user_id=? AND at > datetime('now','-1 day') GROUP BY h ORDER BY MIN(at)").bind(uid).all();
  const last = await c.env.DB.prepare('SELECT hr,spo2,temp,steps,at FROM vitals WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(uid).first();
  return c.json({ hourly: r.results, last });
});

// ── Incidents ───────────────────────────────────────────────────────────────
const KINDS = ['fall', 'crash', 'syncope', 'inactivity', 'manual_sos', 'conversation'];

async function incidentView(env: Env, inc: IncidentRow) {
  const notes = (await env.DB.prepare('SELECT channel,target,status,detail,at FROM notifications WHERE incident_id=? ORDER BY id').bind(inc.id).all()).results;
  const t = timeline(inc);
  return {
    id: inc.id, kind: inc.kind, kindLabel: kindLabel(inc.kind), label: inc.label, confidence: inc.confidence, contributions: J(inc.contributions, []),
    stage: inc.stage, conscious: inc.conscious, lat: inc.lat, lng: inc.lng, accuracy_m: inc.accuracy_m, vitals: J(inc.vitals, null),
    created_at: inc.created_at, alerted_at: inc.alerted_at, ack_at: inc.ack_at, ack_by: inc.ack_by, resolved_at: inc.resolved_at, notes: inc.notes,
    countdown: inc.stage === 'checking' || inc.stage === 'escalating' ? t.countdown : 0, speed: inc.speed, notifications: notes,
  };
}

app.post('/incidents', async c => {
  const b = await c.req.json();
  const u = c.get('user');
  const kind = KINDS.includes(b.kind) ? b.kind : 'manual_sos';
  const open = await c.env.DB.prepare("SELECT * FROM incidents WHERE user_id=? AND stage IN ('checking','escalating','alerted') AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(u.id).first<IncidentRow>();
  if (open && open.stage !== 'alerted') return c.json(await incidentView(c.env, await advance(c.env, open)));
  const prof = await c.env.DB.prepare('SELECT consent_location, home_lat, home_lng FROM users WHERE id=?').bind(u.id).first<{ consent_location: number; home_lat: number | null; home_lng: number | null }>();
  const useLoc = prof?.consent_location;
  const lat = useLoc ? num(b.lat) ?? prof?.home_lat ?? null : null;
  const lng = useLoc ? num(b.lng) ?? prof?.home_lng ?? null : null;
  const id = newId();
  const speed = Math.min(5, Math.max(1, Number(b.speed) || 1));
  await c.env.DB.prepare('INSERT INTO incidents (id,user_id,kind,label,confidence,contributions,lat,lng,accuracy_m,vitals,speed,conscious) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, u.id, kind, str(b.label, 80) || kindLabel(kind), num(b.confidence), JSON.stringify(Array.isArray(b.contributions) ? b.contributions.slice(0, 12) : []),
      lat, lng, useLoc ? num(b.accuracy_m) : null, b.vitals ? JSON.stringify(b.vitals).slice(0, 500) : null, speed, kind === 'manual_sos' ? 1 : null).run();
  await audit(c.env, u.id, 'safety', `${str(b.label, 80) || kindLabel(kind)} detected · confidence ${Math.round((num(b.confidence) ?? 1) * 100)}% → Nova check-in`);
  let inc = (await c.env.DB.prepare('SELECT * FROM incidents WHERE id=?').bind(id).first<IncidentRow>())!;
  if (kind === 'manual_sos') inc = await dispatch(c.env, inc, true);
  return c.json(await incidentView(c.env, inc), 201);
});

app.get('/incidents/current', async c => {
  const inc = await c.env.DB.prepare("SELECT * FROM incidents WHERE user_id=? AND resolved_at IS NULL AND stage != 'cancelled' ORDER BY created_at DESC LIMIT 1").bind(c.get('user').id).first<IncidentRow>();
  if (!inc) return c.json(null);
  return c.json(await incidentView(c.env, await advance(c.env, inc)));
});

app.get('/incidents', async c => {
  const r = await c.env.DB.prepare('SELECT * FROM incidents WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(c.get('user').id).all<IncidentRow>();
  return c.json(await Promise.all(r.results.map(i => incidentView(c.env, i))));
});

async function ownIncident(c: C) {
  const inc = await c.env.DB.prepare('SELECT * FROM incidents WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).first<IncidentRow>();
  if (!inc) bad('Incident not found.', 404);
  return advance(c.env, inc!);
}

app.post('/incidents/:id/respond', async c => {
  const b = await c.req.json();
  const inc = await ownIncident(c);
  if (b.response === 'help') {
    const out = inc.stage === 'alerted' ? inc : await dispatch(c.env, inc, true);
    await audit(c.env, inc.user_id, 'safety', 'User is conscious and asked for help');
    return c.json(await incidentView(c.env, out));
  }
  if (inc.stage === 'alerted') {
    await c.env.DB.prepare("UPDATE incidents SET notes=COALESCE(notes,'') || 'User later reported they are okay. ' WHERE id=?").bind(inc.id).run();
    await audit(c.env, inc.user_id, 'safety', 'User reported okay after help was alerted; dispatcher informed');
  } else {
    await c.env.DB.prepare("UPDATE incidents SET stage='cancelled', conscious=1, resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(inc.id).run();
    await audit(c.env, inc.user_id, 'safety', 'User responded “I’m okay” → alert cancelled');
  }
  return c.json(await incidentView(c.env, (await c.env.DB.prepare('SELECT * FROM incidents WHERE id=?').bind(inc.id).first<IncidentRow>())!));
});

app.post('/incidents/:id/close', async c => {
  const inc = await ownIncident(c);
  await c.env.DB.prepare("UPDATE incidents SET resolved_at=COALESCE(resolved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), stage=CASE WHEN stage IN ('checking','escalating') THEN 'cancelled' ELSE stage END WHERE id=?").bind(inc.id).run();
  return c.json({ ok: true });
});

// ── Nova ────────────────────────────────────────────────────────────────────
app.post('/nova/chat', async c => {
  const b = await c.req.json();
  const text = str(b.text, 600);
  if (!text) bad('Say something to Nova.');
  const u = c.get('user');
  const [hist, lastInc] = await Promise.all([
    c.env.DB.prepare('SELECT role,text FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 6').bind(u.id).all<{ role: string; text: string }>(),
    c.env.DB.prepare("SELECT kind, created_at FROM incidents WHERE user_id=? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') ORDER BY created_at DESC LIMIT 1").bind(u.id).first<{ kind: string; created_at: string }>(),
  ]);
  const t0 = Date.now();
  const r = await novaReply(c.env, text, {
    name: u.name.split(' ')[0], hr: Math.round(num(b.hr) ?? 72), spo2: Math.round(num(b.spo2) ?? 98),
    lastIncident: lastInc ? `${kindLabel(lastInc.kind)} at ${lastInc.created_at.slice(11, 16)} UTC` : null,
    history: hist.results.reverse(),
  });
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO messages (user_id,role,text) VALUES (?,?,?)').bind(u.id, 'user', text),
    c.env.DB.prepare('INSERT INTO messages (user_id,role,text,urgency) VALUES (?,?,?,?)').bind(u.id, 'nova', r.text, r.urgency),
  ]);
  await audit(c.env, u.id, 'nova', `Chat · urgency ${r.urgency} · ${r.ai ? 'AI' : 'template'} · ${Date.now() - t0} ms`);
  return c.json(r);
});

app.get('/nova/history', async c => {
  const r = await c.env.DB.prepare('SELECT role,text,urgency,at FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 30').bind(c.get('user').id).all();
  return c.json(r.results.reverse());
});

// ── Appointments (MediLink) ─────────────────────────────────────────────────
app.post('/appointments', async c => {
  const b = await c.req.json();
  if (!str(b.clinic_id) || !str(b.time)) bad('Pick a clinic and a time.');
  const id = newId();
  const ref = 'ML-' + Math.floor(100000 + Math.random() * 899999);
  await c.env.DB.prepare('INSERT INTO appointments (id,user_id,clinic_id,clinic_name,date,time,reason,ref) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, c.get('user').id, str(b.clinic_id, 20), str(b.clinic_name, 120), str(b.date, 10) || new Date().toISOString().slice(0, 10), str(b.time, 5), str(b.reason, 400), ref).run();
  await audit(c.env, c.get('user').id, 'booking', `MediLink request ${ref} · ${str(b.clinic_name, 120)} ${str(b.time, 5)}`);
  return c.json({ id, ref, status: 'requested' }, 201);
});

app.get('/audit', async c => {
  const r = await c.env.DB.prepare('SELECT id,kind,text,at FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 60').bind(c.get('user').id).all();
  return c.json(r.results);
});

// ── Dispatcher console (simulated emergency operations centre) ──────────────
app.get('/dispatch/incidents', async c => {
  const open = await c.env.DB.prepare("SELECT * FROM incidents WHERE stage IN ('checking','escalating') ").all<IncidentRow>();
  for (const i of open.results) await advance(c.env, i);
  const r = await c.env.DB.prepare("SELECT i.*, u.name user_name, u.phone user_phone, u.blood, u.allergies, u.conditions, u.consent_health FROM incidents i JOIN users u ON u.id=i.user_id WHERE i.created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days') ORDER BY CASE WHEN i.stage='alerted' AND i.resolved_at IS NULL THEN 0 WHEN i.stage IN ('checking','escalating') THEN 1 ELSE 2 END, i.created_at DESC LIMIT 50").all<IncidentRow & Record<string, unknown>>();
  const out = await Promise.all(r.results.map(async i => ({
    ...(await incidentView(c.env, i)),
    user: { name: i.user_name, phone: i.user_phone },
    medical: i.consent_health ? { blood: i.blood, allergies: i.allergies, conditions: i.conditions } : null,
    contacts: (await c.env.DB.prepare('SELECT name,relation,phone FROM contacts WHERE user_id=?').bind(i.user_id).all()).results,
  })));
  return c.json(out);
});

app.post('/dispatch/incidents/:id/ack', async c => {
  const u = c.get('user');
  await c.env.DB.prepare("UPDATE incidents SET ack_by=?, ack_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND ack_at IS NULL").bind(u.name, c.req.param('id')).run();
  const inc = await c.env.DB.prepare('SELECT user_id FROM incidents WHERE id=?').bind(c.req.param('id')).first<{ user_id: string }>();
  if (inc) await audit(c.env, inc.user_id, 'dispatch', `Dispatcher ${u.name} acknowledged the alert: responders assigned (simulated)`);
  return c.json({ ok: true });
});

app.post('/dispatch/incidents/:id/resolve', async c => {
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare("UPDATE incidents SET stage=CASE WHEN stage IN ('checking','escalating') THEN 'cancelled' ELSE 'resolved' END, resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), notes=COALESCE(notes,'') || ? WHERE id=?")
    .bind(str(b.notes, 300), c.req.param('id')).run();
  const inc = await c.env.DB.prepare('SELECT user_id FROM incidents WHERE id=?').bind(c.req.param('id')).first<{ user_id: string }>();
  if (inc) await audit(c.env, inc.user_id, 'dispatch', 'Incident closed by dispatcher');
  return c.json({ ok: true });
});

app.get('/admin/stats', async c => {
  const one = (sql: string) => c.env.DB.prepare(sql).first<number>('n');
  const [users, incidents, alerted, cancelled, chats, appts, sms] = await Promise.all([
    one('SELECT COUNT(*) n FROM users'), one('SELECT COUNT(*) n FROM incidents'), one("SELECT COUNT(*) n FROM incidents WHERE alerted_at IS NOT NULL"),
    one("SELECT COUNT(*) n FROM incidents WHERE stage='cancelled'"), one("SELECT COUNT(*) n FROM messages WHERE role='user'"), one('SELECT COUNT(*) n FROM appointments'),
    one("SELECT COUNT(*) n FROM notifications WHERE channel='sms' AND status='sent'"),
  ]);
  return c.json({ users, incidents, alerted, cancelled, falseAlarmRate: incidents ? Math.round(((cancelled ?? 0) / incidents) * 100) : 0, chats, appts, sms });
});

app.all('*', c => c.json({ error: 'Not found' }, 404));

export default app;
