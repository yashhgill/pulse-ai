/**
 * Nova — the Pulse AI companion.
 *
 * Asset-first: if you export the 3D renders as transparent PNGs into
 *   public/nova/<state>.png   (idle.png, happy.png, concerned.png, talking.png,
 *                              emergency.png, fall_detected.png, safe.png, ...)
 * Nova uses them automatically, falling back to public/nova/idle.png, and
 * finally to the flat vector Nova below. Animation (float, heartbeat, rings)
 * is applied around whichever art is shown, so the state machine drives both.
 */
import { useEffect, useState } from 'react';
import type { NovaState } from '../lib/types';

/* Probe once per path whether a PNG exists (dev/preview servers answer 404s
   with index.html, so we check that the file actually decodes as an image). */
const probe = new Map<string, Promise<boolean>>();
function hasImage(src: string): Promise<boolean> {
  let p = probe.get(src);
  if (!p) {
    p = new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 1); i.onerror = () => res(false); i.src = src; });
    probe.set(src, p);
  }
  return p;
}

const RING: Record<NovaState, string> = {
  idle: 'var(--teal)', listening: 'var(--teal)', thinking: 'var(--amber)', talking: 'var(--teal)',
  happy: 'var(--teal)', safe: 'var(--green)', appointment: 'var(--teal)', sleeping: 'var(--muted)',
  concerned: 'var(--amber)', fall_detected: 'var(--red)', emergency: 'var(--red)',
};

export function Nova({ state, size = 220, onClick }: { state: NovaState; size?: number; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const own = `/nova/${state}.png`;
      if (await hasImage(own)) { if (live) setSrc(own); return; }
      if (await hasImage('/nova/idle.png')) { if (live) setSrc('/nova/idle.png'); return; }
      if (live) setSrc(null);
    })();
    return () => { live = false; };
  }, [state]);

  const alarm = state === 'emergency' || state === 'fall_detected';

  return (
    <button
      type="button"
      className={`nova nova--${state}`}
      style={{ width: size, height: size * 1.08, ['--ring' as string]: RING[state] }}
      onClick={onClick}
      aria-label={`Nova, state ${state.replace('_', ' ')}`}
    >
      <span className="nova__halo" />
      {alarm && <><span className="nova__pulse" /><span className="nova__pulse nova__pulse--2" /></>}
      <span className="nova__body">
        {src ? (
          <img key={src} src={src} alt="" draggable={false} />
        ) : (
          <NovaVector state={state} />
        )}
      </span>
      <span className="nova__shadow" />
      {state === 'sleeping' && <span className="nova__zzz">z<small>z</small></span>}
      {state === 'thinking' && <span className="nova__dots"><i /><i /><i /></span>}
      {state === 'listening' && <span className="nova__waves"><i /><i /><i /></span>}
    </button>
  );
}

/** Flat vector fallback. Deliberately graphic (icon style), not faux-3D. */
function NovaVector({ state }: { state: NovaState }) {
  const closed = state === 'sleeping';
  const wide = state === 'emergency' || state === 'fall_detected';
  const worried = state === 'concerned' || wide;
  const eyeRy = wide ? 13 : 11;

  return (
    <svg viewBox="0 0 200 200" className="nova-svg">
      <defs>
        <clipPath id="nova-heart">
          <path d="M100 176C44 138 14 102 20 66 25 34 66 20 100 54 134 20 175 34 180 66 186 102 156 138 100 176Z" />
        </clipPath>
        <radialGradient id="nova-fill" cx="36%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FF7D86" />
          <stop offset=".55" stopColor="#F4404E" />
          <stop offset="1" stopColor="#C81F30" />
        </radialGradient>
      </defs>

      {/* heart */}
      <path d="M100 176C44 138 14 102 20 66 25 34 66 20 100 54 134 20 175 34 180 66 186 102 156 138 100 176Z" fill="url(#nova-fill)" />

      {/* coat: white panels either side of a V neckline, clipped to the heart */}
      <g clipPath="url(#nova-heart)">
        <path d="M0 122 L78 118 L100 176 L0 200Z" fill="#F4F7FB" />
        <path d="M200 122 L122 118 L100 176 L200 200Z" fill="#F4F7FB" />
        <path d="M78 118 L92 146 L84 150" fill="none" stroke="#D5DEEA" strokeWidth="3" strokeLinejoin="round" />
        <path d="M122 118 L108 146 L116 150" fill="none" stroke="#D5DEEA" strokeWidth="3" strokeLinejoin="round" />
        <rect x="136" y="140" width="22" height="16" rx="3" fill="#E6ECF4" />
        <path d="M142 140v-8" stroke="#2F7DF6" strokeWidth="4" strokeLinecap="round" />
        <path d="M150 140v-6" stroke="#F4404E" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* stethoscope */}
      <path d="M72 114c0 24 12 36 28 36s28-12 28-36" fill="none" stroke="#3B4A5E" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M100 150v10" stroke="#3B4A5E" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="100" cy="166" r="8" fill="#9FB0C4" stroke="#3B4A5E" strokeWidth="3" />
      <circle cx="98" cy="164" r="2.4" fill="#fff" opacity=".8" />

      {/* brows */}
      {worried ? (
        <g stroke="#6B0F1C" strokeWidth="4" strokeLinecap="round">
          <path d="M64 70 L86 63" /><path d="M136 70 L114 63" />
        </g>
      ) : state === 'happy' || state === 'safe' ? (
        <g stroke="#6B0F1C" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M64 66 q11-8 22 0" /><path d="M114 66 q11-8 22 0" />
        </g>
      ) : null}

      {/* eyes */}
      {closed ? (
        <g stroke="#1B2233" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M66 88 q10 8 20 0" /><path d="M114 88 q10 8 20 0" />
        </g>
      ) : (
        <g className="nova-eyes">
          <ellipse cx="76" cy="88" rx="10" ry={eyeRy} fill="#fff" />
          <ellipse cx="124" cy="88" rx="10" ry={eyeRy} fill="#fff" />
          <g className={state === 'listening' ? 'nova-look-up' : 'nova-look'}>
            <circle cx="77" cy="90" r="6.5" fill="#1B2233" />
            <circle cx="125" cy="90" r="6.5" fill="#1B2233" />
            <circle cx="79.5" cy="87" r="2.2" fill="#fff" />
            <circle cx="127.5" cy="87" r="2.2" fill="#fff" />
          </g>
        </g>
      )}

      {/* cheeks */}
      <ellipse cx="60" cy="106" rx="9" ry="5" fill="#FFB3BA" opacity=".55" />
      <ellipse cx="140" cy="106" rx="9" ry="5" fill="#FFB3BA" opacity=".55" />

      {/* mouth */}
      <Mouth state={state} />
    </svg>
  );
}

function Mouth({ state }: { state: NovaState }) {
  switch (state) {
    case 'happy':
    case 'safe':
    case 'appointment':
      return <path d="M86 104 q14 16 28 0 z" fill="#6B0F1C" stroke="#6B0F1C" strokeWidth="3" strokeLinejoin="round" />;
    case 'talking':
      return <ellipse className="nova-talk" cx="100" cy="109" rx="8" ry="6" fill="#6B0F1C" />;
    case 'concerned':
      return <path d="M90 111 q10 -6 20 0" fill="none" stroke="#6B0F1C" strokeWidth="4" strokeLinecap="round" />;
    case 'emergency':
    case 'fall_detected':
      return <ellipse cx="100" cy="110" rx="6" ry="8" fill="#6B0F1C" />;
    case 'sleeping':
      return <path d="M94 108 q6 4 12 0" fill="none" stroke="#6B0F1C" strokeWidth="3.5" strokeLinecap="round" />;
    default:
      return <path d="M88 104 q12 11 24 0" fill="none" stroke="#6B0F1C" strokeWidth="4" strokeLinecap="round" />;
  }
}
