import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, ErrorBanner, Field, PageHeader } from '../components/ui';
import { formatDateTime, labels } from '../format';
import type { User } from '../types';

export function Account() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user!.name);
  const [phone, setPhone] = useState(user!.phone ?? '');
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setUser(await api.patch<User>('/auth/me', { name, phone: phone || null }));
      setProfileMsg({ ok: true, text: 'Profile saved.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: (err as Error).message });
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirmPw) return setPwMsg({ ok: false, text: 'New passwords do not match' });
    try {
      await api.post('/auth/me/password', { currentPassword: current, newPassword: next });
      setUser({ ...user!, mustChangePassword: false });
      setCurrent('');
      setNext('');
      setConfirmPw('');
      setPwMsg({ ok: true, text: 'Password updated.' });
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message });
    }
  };

  const msg = (m: { ok: boolean; text: string } | null) =>
    m && (m.ok ? <div className="alert alert-success">{m.text}</div> : <ErrorBanner message={m.text} />);

  return (
    <>
      <PageHeader title="My account" subtitle={`${user!.email} · ${labels[user!.role]} · last sign-in ${formatDateTime(user!.lastLoginAt)}`} />
      <div className="grid-2">
        <Card title="Profile">
          <form className="form" onSubmit={saveProfile}>
            {msg(profileMsg)}
            <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Email" hint="Contact staff to change your email address."><input value={user!.email} disabled /></Field>
            <Field label="Phone"><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <div className="form-actions"><button className="btn btn-primary">Save profile</button></div>
          </form>
        </Card>
        <Card title="Change password">
          {user!.isDemoAccount ? (
            <p className="muted">
              This is a shared demo account, so its password can't be changed.{' '}
              Sign out and create your own account to try this.
            </p>
          ) : (
            <form className="form" onSubmit={changePassword}>
              {msg(pwMsg)}
              <Field label="Current password">
                <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
              <Field label="New password" hint="At least 8 characters">
                <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              </Field>
              <Field label="Confirm new password">
                <input type="password" required autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
              </Field>
              <div className="form-actions"><button className="btn btn-primary">Update password</button></div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
