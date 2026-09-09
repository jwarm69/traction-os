'use client';
import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState(''), [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e: { preventDefault(): void }) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, pin }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw Error(body.error || 'Could not continue.');
      window.location.assign('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not continue.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card">
    <div className="brand auth-brand"><span className="brand-mark"><Activity size={20}/></span>Traction OS</div>
    <p className="eyebrow">BUSINESS GROWTH WORKSPACE</p>
    <h1>{mode === 'login' ? 'Continue your traction work.' : 'Create your workspace.'}</h1>
    <p className="muted">Research, owner calibration, channel experiments, execution, and memory in one place.</p>
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="username">Username</label><Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your username" required />
      <label htmlFor="pin">4–6 digit PIN</label><Input id="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" required />
      {error && <div className="error">{error}</div>}
      <Button type="submit" disabled={busy}>{busy ? 'Opening…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    <p className="auth-note">Each username has a private workspace. PINs are stored as salted one-way hashes.</p>
  </section></main>;
}
