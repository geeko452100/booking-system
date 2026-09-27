import { useState, type FormEvent } from 'react';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { formatDateTime, formatMoney, labels, toLocalInput } from '../format';
import type { Appointment, Payment, PaymentMethod, PaymentStatus, Role, Service, User, UserListItem } from '../types';
import { ErrorBanner, Field, TempPasswordNotice } from './ui';

function useSubmit<T>(fn: () => Promise<T>, onDone: (r: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function FormActions({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

export function AppointmentForm({
  appointment,
  clientId: presetClientId,
  onSaved,
  onCancel,
}: {
  appointment?: Appointment;
  clientId?: number;
  onSaved: (a: Appointment) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const staff = isStaffRole(user);
  const { data: services } = useApi<Service[]>('/services');
  const { data: providers } = useApi<{ id: number; name: string }[]>('/appointments/providers');
  const { data: clients } = useApi<UserListItem[]>(staff && !appointment ? '/users?role=client&status=active' : null);

  const [clientId, setClientId] = useState(appointment?.clientId ?? presetClientId ?? 0);
  const [serviceId, setServiceId] = useState(appointment?.serviceId ?? 0);
  const [staffId, setStaffId] = useState<number | ''>(appointment?.staffId ?? '');
  const [start, setStart] = useState(appointment ? toLocalInput(appointment.startAt) : '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');

  const service = services?.find((s) => s.id === serviceId);
  const activeServices = services?.filter((s) => s.isActive || s.id === appointment?.serviceId) ?? [];

  const { busy, error, submit } = useSubmit(() => {
    if (!start) throw new Error('Please choose a date and time');
    const body = {
      serviceId,
      staffId: staffId === '' ? null : staffId,
      startAt: new Date(start).toISOString(),
      notes: notes || undefined,
    };
    return appointment
      ? api.patch<Appointment>(`/appointments/${appointment.id}`, { ...body, notes: notes || null })
      : api.post<Appointment>('/appointments', { ...body, clientId: staff ? clientId : undefined });
  }, onSaved);

  return (
    <form onSubmit={submit} className="form">
      <ErrorBanner message={error} />
      {staff && !appointment && (
        <Field label="Client">
          <select required value={clientId || ''} onChange={(e) => setClientId(Number(e.target.value))}>
            <option value="" disabled>
              Select a client…
            </option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.email}
              </option>
            ))}
          </select>
        </Field>
      )}
      {appointment && (
        <p className="muted">
          Client: <strong>{appointment.clientName}</strong>
        </p>
      )}
      <Field label="Service">
        <select required value={serviceId || ''} onChange={(e) => setServiceId(Number(e.target.value))}>
          <option value="" disabled>
            Select a service…
          </option>
          {activeServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.durationMin} min · {formatMoney(s.priceCents)}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Date & time" hint={service ? `Ends ${service.durationMin} minutes later` : undefined}>
          <input type="datetime-local" required step={900} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="With">
          <select value={staffId} onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Any available</option>
            {providers?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </Field>
      <FormActions busy={busy} label={appointment ? 'Save changes' : 'Book appointment'} onCancel={onCancel} />
    </form>
  );
}

export function PaymentForm({
  clientId: presetClientId,
  appointment,
  onSaved,
  onCancel,
}: {
  clientId?: number;
  appointment?: Appointment;
  onSaved: (p: Payment) => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState(appointment?.clientId ?? presetClientId ?? 0);
  const [appointmentId, setAppointmentId] = useState<number | ''>(appointment?.id ?? '');
  const outstanding = appointment ? Math.max(0, appointment.priceCents - appointment.paidCents) : 0;
  const [amount, setAmount] = useState(outstanding ? (outstanding / 100).toFixed(2) : '');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [status, setStatus] = useState<PaymentStatus>('paid');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(toLocalInput(new Date().toISOString()));

  const { data: clients } = useApi<UserListItem[]>(presetClientId || appointment ? null : '/users?role=client');
  const { data: appts } = useApi<Appointment[]>(clientId && !appointment ? `/appointments${qs({ clientId })}` : null);

  const { busy, error, submit } = useSubmit(() => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) throw new Error('Enter an amount greater than zero');
    return api.post<Payment>('/payments', {
      clientId,
      appointmentId: appointmentId === '' ? null : appointmentId,
      amountCents: cents,
      method,
      status,
      reference: reference || undefined,
      paidAt: new Date(paidAt).toISOString(),
    });
  }, onSaved);

  return (
    <form onSubmit={submit} className="form">
      <ErrorBanner message={error} />
      {clients && (
        <Field label="Client">
          <select
            required
            value={clientId || ''}
            onChange={(e) => {
              setClientId(Number(e.target.value));
              setAppointmentId('');
            }}
          >
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.email}
              </option>
            ))}
          </select>
        </Field>
      )}
      {appointment ? (
        <p className="muted">
          For <strong>{appointment.serviceName}</strong> with {appointment.clientName}, {formatDateTime(appointment.startAt)}.
          {' '}Outstanding: <strong>{formatMoney(outstanding)}</strong>
        </p>
      ) : (
        <Field label="Appointment (optional)">
          <select
            value={appointmentId}
            disabled={!clientId}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : '';
              setAppointmentId(id);
              const a = appts?.find((x) => x.id === id);
              if (a && !amount) setAmount((Math.max(0, a.priceCents - a.paidCents) / 100).toFixed(2));
            }}
          >
            <option value="">Not linked to an appointment</option>
            {appts
              ?.filter((a) => a.status !== 'cancelled')
              .slice()
              .reverse()
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {formatDateTime(a.startAt)} · {a.serviceName}
                  {a.paidCents >= a.priceCents ? ' (paid)' : ` (${formatMoney(a.priceCents - a.paidCents)} due)`}
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="form-row">
        <Field label="Amount ($)">
          <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(['card', 'cash', 'bank_transfer', 'other'] as const).map((m) => (
              <option key={m} value={m}>
                {labels[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="datetime-local" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
      </div>
      <Field label="Reference (optional)" hint="Receipt or transaction ID. Never enter full card numbers.">
        <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <FormActions busy={busy} label="Record payment" onCancel={onCancel} />
    </form>
  );
}

export function UserForm({
  user,
  defaultRole = 'client',
  onSaved,
  onCancel,
}: {
  user?: User;
  defaultRole?: Role;
  onSaved: (u: User) => void;
  onCancel: () => void;
}) {
  const { user: me } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [notes, setNotes] = useState(user?.notes ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? defaultRole);
  const [created, setCreated] = useState<{ user: User; temporaryPassword: string } | null>(null);
  const canSetRole =
    me?.role === 'admin' && user?.id !== me.id && !user?.isDemoAccount && (defaultRole !== 'client' || !!user);

  const { busy, error, submit } = useSubmit(
    async () => {
      const body = { name, email, phone: phone || null, notes: notes || null, ...(canSetRole ? { role } : {}) };
      if (user) return { user: await api.patch<User>(`/users/${user.id}`, body) };
      return api.post<{ user: User; temporaryPassword: string }>('/users', {
        ...body,
        phone: phone || undefined,
        notes: notes || undefined,
        role,
      });
    },
    (r) => ('temporaryPassword' in r ? setCreated(r as { user: User; temporaryPassword: string }) : onSaved(r.user)),
  );

  if (created) {
    return (
      <div className="form">
        <p>
          Account created for <strong>{created.user.name}</strong>.
        </p>
        <TempPasswordNotice password={created.temporaryPassword} email={created.user.email} />
        <div className="form-actions">
          <button className="btn btn-primary" onClick={() => onSaved(created.user)}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="form">
      <ErrorBanner message={error} />
      <Field label="Full name">
        <input required value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Email">
          <input type="email" required value={email} disabled={user?.isDemoAccount} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      {canSetRole && (
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(user ? ['client', 'staff', 'admin'] : ['staff', 'admin']).map((r) => (
              <option key={r} value={r}>
                {labels[r]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Internal notes" hint="Visible to staff only">
        <textarea rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {!user && <p className="muted small">A temporary password will be generated for the first sign-in.</p>}
      <FormActions busy={busy} label={user ? 'Save changes' : 'Create account'} onCancel={onCancel} />
    </form>
  );
}
