/**
 * PULSE CORE — Nova conversation pipeline (prototype)
 *
 * Every message passes through the same stages the production service will use:
 *   speech/text → safety classifier → vitals check → recent events →
 *   urgency assessment → response + actions → Nova state
 * Replies here are rule-based so the demo is deterministic and offline.
 * In production the response stage is an LLM grounded on vetted sources
 * (MOH Malaysia CPGs, WHO, NHS) with the classifier running first.
 */
import type { ChatMessage, NovaAction, NovaState, PipelineStep, Urgency } from '../../web/src/lib/types';

interface Context {
  hr: number;
  spo2: number;
  lastIncident: string | null;
  name: string;
}

interface Rule {
  urgency: Urgency;
  match: RegExp;
  label: string;
  reply: (ctx: Context) => string;
  actions: NovaAction[];
  state: NovaState;
  sources?: string[];
}

const RULES: Rule[] = [
  {
    urgency: 'critical',
    label: 'possible cardiac / respiratory emergency',
    match: /(chest pain|can'?t breathe|cannot breathe|heart attack|stroke|face (is )?droop|unconscious|bleeding (a lot|heavily)|overdose|i fell|i'?ve fallen|accident|crash)/i,
    reply: c => `This could be an emergency, ${c.name}. I'm starting the safety check now. Your heart rate is ${c.hr} bpm and SpO₂ ${c.spo2}%. If you can, sit or lie down somewhere safe. Tell me if you want me to alert help right away.`,
    actions: [{ type: 'emergency', label: 'Get help now' }, { type: 'safe', label: "I'm okay" }],
    state: 'emergency',
    sources: ['MOH Malaysia — CPG Management of Acute ST-Elevation MI', 'Malaysian Emergency Response Services (MERS 999)'],
  },
  {
    urgency: 'high',
    label: 'pre-syncope symptoms',
    match: /(faint|going to pass out|dizzy|light.?headed|room is spinning|palpitation|heart racing)/i,
    reply: c => `Let's be careful. Please sit down now, or lie down with your legs raised. Your heart rate right now is ${c.hr} bpm and SpO₂ is ${c.spo2}%, which ${c.spo2 >= 95 ? 'looks stable' : 'is lower than usual'}. Have you eaten or had water in the last few hours? If you pass out, I'll start the fall check automatically.`,
    actions: [{ type: 'breathing', label: 'Guide me to breathe' }, { type: 'book', label: 'See a doctor today' }, { type: 'emergency', label: 'This feels serious' }],
    state: 'concerned',
    sources: ['NHS — Fainting', 'MOH Malaysia — MyHEALTH portal'],
  },
  {
    urgency: 'moderate',
    label: 'illness symptoms',
    match: /(sick|fever|cough|sore throat|flu|headache|vomit|diarr|stomach|rash|body ache|unwell|not feeling well)/i,
    reply: () => `Sorry you're not feeling well. I can help. How long has this been going on, and do you have a fever above 38°C? If symptoms are mild, rest and fluids usually help. I can also book you at a MediLink clinic near you and send them a summary so you don't have to repeat yourself.`,
    actions: [{ type: 'book', label: 'Book a clinic' }, { type: 'health', label: 'Show my vitals' }],
    state: 'concerned',
    sources: ['MOH Malaysia — MyHEALTH: Influenza', 'WHO — Fever management'],
  },
  {
    urgency: 'low',
    label: 'appointment request',
    match: /(appointment|book|clinic|see a doctor|checkup|check-up|medilink)/i,
    reply: () => `Sure. There are 3 MediLink clinics within 5 km with slots today. The nearest is Klinik Sejahtera Ayer Keroh, 2.1 km away. Want me to open the booking with your symptom summary attached?`,
    actions: [{ type: 'book', label: 'Open booking' }],
    state: 'appointment',
  },
  {
    urgency: 'none',
    label: 'health information',
    match: /(sleep|water|drink|exercise|steps|blood pressure|diet|eat|vitamin|stress|anxious|anxiety)/i,
    reply: () => `Good question. For most adults: 7–9 hours of sleep, about 2 litres of water a day (more in Malaysian heat), and 150 minutes of moderate activity a week. You're at 6,420 steps today, so a 20-minute walk would get you past 8,000. Want me to set a reminder?`,
    actions: [{ type: 'health', label: 'Open my health' }],
    state: 'happy',
    sources: ['MOH Malaysia — Malaysian Dietary Guidelines 2020', 'WHO — Physical activity guidelines'],
  },
];

const URGENCY_ORDER: Urgency[] = ['critical', 'high', 'moderate', 'low', 'none'];

export function runPipeline(text: string, ctx: Context): Omit<ChatMessage, 'id' | 'role'> & { state: NovaState } {
  const rule = URGENCY_ORDER.map(u => RULES.find(r => r.urgency === u && r.match.test(text))).find(Boolean);

  const pipeline: PipelineStep[] = [
    { name: 'Understand', detail: `“${text.length > 42 ? text.slice(0, 42) + '…' : text}”` },
    { name: 'Safety classifier', detail: rule ? `flagged: ${rule.label}` : 'no risk terms' },
    { name: 'Vitals check', detail: `HR ${ctx.hr} bpm · SpO₂ ${ctx.spo2}%` },
    { name: 'Recent events', detail: ctx.lastIncident ?? 'none in last 24 h' },
    { name: 'Urgency', detail: rule?.urgency ?? 'none' },
    { name: 'Action', detail: rule?.actions.map(a => a.label).join(' · ') || 'answer only' },
  ];

  if (!rule) {
    return {
      text: `I'm here, ${ctx.name}. I can check your symptoms, book a MediLink clinic, explain your vitals, or watch over you with fall and crash detection. What would you like to do?`,
      urgency: 'none',
      pipeline,
      actions: [{ type: 'book', label: 'Book a clinic' }, { type: 'health', label: 'My vitals' }],
      state: 'talking',
    };
  }
  return {
    text: rule.reply(ctx),
    urgency: rule.urgency,
    pipeline,
    actions: rule.actions,
    sources: rule.sources,
    state: rule.state,
  };
}

export const SUGGESTIONS = [
  "Hey Nova, I feel like I'm going to faint",
  'I think I have a fever and sore throat',
  'Book me a clinic appointment',
  'How much water should I drink?',
  'I have chest pain',
];
