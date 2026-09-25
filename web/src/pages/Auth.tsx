import { useState } from 'react';
import { Activity } from 'lucide-react';
import { api, tokenStore } from '../lib/api';
import { Nova } from '../components/Nova';

export function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api<{ token: string }>(`/auth/${mode}`, { body: mode === 'register' ? { name, email, password } : { email, password } });
      tokenStore.set(r.token);
      onAuthed();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth__hero">
        <div className="brand"><span className="brand__mark"><Activity size={18} /></span><span className="brand__name">Pulse<b>AI</b></span></div>
        <Nova state="idle" size={200} />
        <h1>Nova watches over you, and calls for help when you can't.</h1>
        <p className="muted">Fall and crash detection, a health companion you can talk to, and an emergency pipeline that escalates on its own: 10 s check-in, 30 s warning, then dispatch.</p>
      </div>
      <form className="auth__card" onSubmit={submit}>
        <div className="auth__tabs" role="tablist">
          <button type="button" className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>Create account</button>
          <button type="button" className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>Sign in</button>
        </div>
        {mode === 'register' && <label>Name<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></label>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {err && <p className="auth__err">{err}</p>}
        <button className="btn btn--primary btn--wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
        <p className="muted small">Emergency dispatch to MERS 999 is simulated. SMS to your contacts is real only when the operator has enabled Twilio.</p>
      </form>
    </div>
  );
}
