import { useCallback, useEffect, useRef, useState } from 'react';

/* Minimal typing for the Web Speech API (Chrome / Edge / Safari). */
interface SR {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SRCtor = new () => SR;

function getCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Speech-to-text. Browsers only allow the microphone on https:// or localhost,
 * so on a plain-http ECS IP this reports `supported: false` with a reason.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  const Ctor = typeof window !== 'undefined' ? getCtor() : null;
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const supported = !!Ctor && secure;
  const reason = !Ctor ? 'This browser has no speech recognition (use Chrome).' : !secure ? 'Microphone needs https:// or localhost.' : null;

  const start = useCallback(() => {
    if (!Ctor || !secure) { setError(reason); return; }
    const rec = new Ctor();
    rec.lang = 'en-MY';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = e => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      setInterim(text);
      if (final) { cb.current(text.trim()); setInterim(''); }
    };
    rec.onerror = e => setError(e.error === 'not-allowed' ? 'Microphone permission was blocked.' : e.error);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, [Ctor, secure, reason]);

  const stop = useCallback(() => { recRef.current?.stop(); setListening(false); }, []);
  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, reason, listening, interim, error, start, stop };
}
