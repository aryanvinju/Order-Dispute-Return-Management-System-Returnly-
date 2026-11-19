'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ShieldCheck,
  PackageCheck,
  Store,
  UserRound,
  Check,
  Layers3,
} from 'lucide-react';
import type { Role } from '@/lib/types';
const accounts = {
  buyer: 'buyer@demo.returnly.test',
  vendor: 'vendor@demo.returnly.test',
  admin: 'admin@demo.returnly.test',
};
export default function Login() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('admin'),
    [email, setEmail] = useState(accounts.admin),
    [password, setPassword] = useState('DemoPass123!'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      router.push('/app');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-project-name">Order Dispute &amp; Return Management</div>
          <h2>Sign in</h2>
          <p className="muted">Select a demo role or enter your account details.</p>
          <div className="role-picker">
            {(['buyer', 'vendor', 'admin'] as Role[]).map((r) => {
              const Icon = r === 'buyer' ? UserRound : r === 'vendor' ? Store : ShieldCheck;
              return (
                <button
                  type="button"
                  key={r}
                  className={role === r ? 'selected' : ''}
                  onClick={() => {
                    setRole(r);
                    setEmail(accounts[r]);
                    setPassword('DemoPass123!');
                    setError('');
                  }}
                >
                  <Icon size={19} />
                  <span>{r}</span>
                </button>
              );
            })}
          </div>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <button className="button primary login-submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="demo-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Demo accounts</strong>
              <p>Choose a role above to use a demo account. Payments and refunds are simulated.</p>
            </div>
          </div>
        </div>
        <footer>
          RETURNLY <span>Order Dispute & Return Management · Team 34</span>
        </footer>
      </section>
    </div>
  );
}
