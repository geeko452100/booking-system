import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { useBusiness } from '../business';
import { useDemo } from '../demo';
import { Brand } from '../components/Layout';
import { BusinessPicker } from '../components/portal';
import { ErrorBanner, Field } from '../components/ui';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { type, config, demoMode } = useBusiness();
  return (
    <div className="auth-page">
      <aside className="auth-hero">
        <img src={`/img/${type}/hero.jpg`} alt="" className="auth-hero-img" />
        <div className="auth-hero-text">
          <p className="eyebrow">{config.tagline}</p>
          <h2>{config.hero.headline}</h2>
          <p>{config.hero.copy}</p>
          {demoMode && (
            <div className="auth-hero-picker">
              <p className="auth-hero-note">This is a demo. See the same portal set up for a different kind of business:</p>
              <BusinessPicker />
            </div>
          )}
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <Brand large />
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Login() {
  const { login, notice } = useAuth();
  const { config } = useBusiness();
  const demo = useDemo();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle={`Welcome back. Sign in to manage your ${config.words.bookings}, payments and messages.`}>
      <form className="form" onSubmit={submit}>
        {notice && !error && <div className="alert alert-warn">{notice}</div>}
        <ErrorBanner message={error} />
        <Field label="Email">
          <input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-foot">
        New here? <Link to="/register">Create an account</Link>
      </p>
      {demo?.demoMode && demo.accounts && (
        <div className="demo-hint">
          <p>
            <strong>Try the demo</strong> — pick an account to fill in its details:
          </p>
          <div className="demo-accounts">
            {demo.accounts.map((a) => (
              <button
                key={a.email}
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
              >
                {a.role}
              </button>
            ))}
          </div>
          <p className="small">Data is shared by all visitors and resets every {demo.resetMinutes} minutes.</p>
        </div>
      )}
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const { config } = useBusiness();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    setError(null);
    try {
      await register({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle={`Book ${config.words.bookings} online and keep in touch with us.`}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Full name">
          <input required autoFocus autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone (optional)">
          <input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <div className="form-row">
          <Field label="Password" hint="At least 8 characters">
            <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label="Confirm password">
            <input type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-foot">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
