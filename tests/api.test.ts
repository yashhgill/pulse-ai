/** End-to-end API tests on a fresh SQLite DB with the mock LLM.  npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import app from '../server/app';
import { SqliteD1 } from '../server/lib/sqlite-d1';
import type { Env } from '../server/lib/env';

const db = new SqliteD1(join(mkdtempSync(join(tmpdir(), 'pulse-')), 't.db'));
db.migrate(resolve('migrations'));
const env: Env = { DB: db as unknown as D1Database, JWT_SECRET: 't', LLM_PROVIDER: 'mock', ADMIN_EMAILS: 'ops@pulse.my' };

let token = '';
async function call(method: string, path: string, body?: unknown, auth = token) {
  const res = await app.fetch(new Request(`http://t/api${path}`, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, body: await res.json() as any };
}
const ageIncident = (id: string, seconds: number) =>
  (db as any).prepare(`UPDATE incidents SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-${seconds} seconds') WHERE id=?`).bind(id).run();

test('health reports simulated dispatch', async () => {
  const h = await call('GET', '/health', undefined, '');
  assert.equal(h.body.mers999, 'simulated');
  assert.equal(h.body.sms, 'simulated');
});

test('register, profile, contacts, consent', async () => {
  const r = await call('POST', '/auth/register', { name: 'Aina Sofea', email: 'aina@pulse.my', password: 'password123' }, '');
  assert.equal(r.status, 201);
  token = r.body.token;
  assert.equal((await call('GET', '/dispatch/incidents')).status, 403);
  const p = await call('PUT', '/me', { phone: '+60 12-000 0000', blood: 'O+', allergies: 'Penicillin', home_lat: 2.27, home_lng: 102.28, consent_location: true, consent_health: true, consent_contacts: true });
  assert.equal(p.body.user.blood, 'O+');
  assert.equal((await call('POST', '/contacts', { name: 'Mum', relation: 'Mother', phone: '+60 12-345 6789' })).status, 201);
  assert.equal((await call('POST', '/contacts', { name: 'X', phone: 'abc' })).status, 400);
  const me = await call('GET', '/me');
  assert.equal(me.body.contacts[0].is_primary, 1);
  assert.equal(me.body.meds.length, 2);
});

test('incident escalates on the server and alerts contacts', async () => {
  const i = await call('POST', '/incidents', { kind: 'fall', label: 'Fall at home', confidence: 0.72, contributions: [{ label: 'Impact 4.8g', weight: 0.26 }], lat: 2.2701, lng: 102.2835, vitals: { hr: 96, spo2: 97 } });
  assert.equal(i.status, 201);
  assert.equal(i.body.stage, 'checking');
  assert.ok(i.body.countdown > 0);
  await ageIncident(i.body.id, 12);
  assert.equal((await call('GET', '/incidents/current')).body.stage, 'escalating');
  await ageIncident(i.body.id, 45);
  const cur = await call('GET', '/incidents/current');
  assert.equal(cur.body.stage, 'alerted');
  assert.equal(cur.body.conscious, 0);
  const channels = cur.body.notifications.map((n: any) => n.channel);
  assert.deepEqual(channels.sort(), ['mers999', 'sms']);
  assert.ok(cur.body.notifications.every((n: any) => n.status === 'simulated'));
  // idempotent: reading again does not notify twice
  assert.equal((await call('GET', '/incidents/current')).body.notifications.length, 2);
  await call('POST', `/incidents/${i.body.id}/close`);
});

test('user can cancel, or ask for help immediately', async () => {
  const a = await call('POST', '/incidents', { kind: 'crash', confidence: 0.99 });
  const ok = await call('POST', `/incidents/${a.body.id}/respond`, { response: 'okay' });
  assert.equal(ok.body.stage, 'cancelled');
  const b = await call('POST', '/incidents', { kind: 'syncope', confidence: 0.6 });
  const help = await call('POST', `/incidents/${b.body.id}/respond`, { response: 'help' });
  assert.equal(help.body.stage, 'alerted');
  assert.equal(help.body.conscious, 1);
  await call('POST', `/incidents/${b.body.id}/close`);
  const sos = await call('POST', '/incidents', { kind: 'manual_sos' });
  assert.equal(sos.body.stage, 'alerted');
});

test('dispatcher console sees alerts with medical ID and can close them', async () => {
  const r = await call('POST', '/auth/register', { name: 'Ops', email: 'ops@pulse.my', password: 'password123' }, '');
  const ops = r.body.token;
  const list = await call('GET', '/dispatch/incidents', undefined, ops);
  assert.equal(list.status, 200);
  const top = list.body[0];
  assert.equal(top.stage, 'alerted');
  assert.equal(top.medical.allergies, 'Penicillin');
  assert.equal(top.contacts[0].name, 'Mum');
  await call('POST', `/dispatch/incidents/${top.id}/ack`, {}, ops);
  await call('POST', `/dispatch/incidents/${top.id}/resolve`, { notes: 'Ambulance on scene.' }, ops);
  const after = await call('GET', '/dispatch/incidents', undefined, ops);
  assert.ok(after.body.find((x: any) => x.id === top.id).resolved_at);
  const st = await call('GET', '/admin/stats', undefined, ops);
  assert.ok(st.body.incidents >= 4);
});

test('Nova chat classifies before the LLM', async () => {
  const r = await call('POST', '/nova/chat', { text: 'I have chest pain', hr: 110, spo2: 95 });
  assert.equal(r.body.urgency, 'critical');
  assert.equal(r.body.state, 'emergency');
  assert.equal(r.body.pipeline.length, 6);
  const h = await call('GET', '/nova/history');
  assert.equal(h.body.length, 2);
});

test('vitals, meds, appointments, audit', async () => {
  assert.equal((await call('POST', '/vitals', { samples: [{ hr: 70, spo2: 98 }, { hr: 74, spo2: 97 }] })).body.stored, 2);
  assert.ok((await call('GET', '/vitals/summary')).body.last.hr);
  const me = await call('GET', '/me');
  await call('PUT', `/meds/${me.body.meds[0].id}`, { taken: true });
  assert.equal((await call('GET', '/me')).body.meds.find((m: any) => m.id === me.body.meds[0].id).taken, true);
  const a = await call('POST', '/appointments', { clinic_id: 'k1', clinic_name: 'Klinik Sejahtera', time: '10:30', reason: 'Fever' });
  assert.match(a.body.ref, /^ML-\d{6}$/);
  const log = await call('GET', '/audit');
  assert.ok(log.body.some((e: any) => e.kind === 'dispatch'));
});
