/**
 * Nova conversation service.
 * 1. A deterministic safety classifier decides urgency, actions and Nova's state
 *    (never delegated to the LLM, so emergencies are always caught).
 * 2. Groq writes the reply in Nova's voice, grounded on the user's live vitals,
 *    recent incidents and the classifier's decision. If the LLM fails, the
 *    classifier's safe template reply is used.
 */
import type { Env } from './env';
import { llmJson } from './llm';
import { runPipeline } from './nova-rules';

export interface NovaContext { name: string; hr: number; spo2: number; lastIncident: string | null; history: { role: string; text: string }[] }

export async function novaReply(env: Env, text: string, ctx: NovaContext) {
  const base = runPipeline(text, { hr: ctx.hr, spo2: ctx.spo2, lastIncident: ctx.lastIncident, name: ctx.name });
  if (!env.GROQ_API_KEY && env.LLM_PROVIDER !== 'mock') return { ...base, ai: false };
  try {
    const out = await llmJson<{ reply: string }>(env, {
      task: 'nova', input: { text, ctx, base }, temperature: 0.5, maxTokens: 500,
      system: `You are Nova, the warm, calm AI companion inside Pulse, a Malaysian health and personal-safety app. You are not a doctor: never diagnose or prescribe; give practical, evidence-based self-care and clear next steps; mention MOH Malaysia, WHO or NHS guidance when useful. Use short sentences (max 90 words). If urgency is "critical", tell them to call 999 or that Pulse is starting its safety check, and keep them still and safe. Match the user's language (English or Bahasa Melayu).`,
      user: `User's name: ${ctx.name}. Live vitals: heart rate ${ctx.hr} bpm, SpO2 ${ctx.spo2}%. Recent safety event: ${ctx.lastIncident ?? 'none'}.
Safety classifier result: urgency=${base.urgency}; suggested actions: ${base.actions?.map(a => a.label).join(', ') || 'none'}.
Recent conversation:\n${ctx.history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n') || '(none)'}
User says: "${text}"
Reply as Nova. Return {"reply":"..."}`,
    });
    return { ...base, text: out.reply?.trim() || base.text, ai: true };
  } catch {
    return { ...base, ai: false };
  }
}
