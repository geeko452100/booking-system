import { useState } from 'react';
import { Link } from 'react-router';
import { qs, useApi } from '../api';
import { useAuth } from '../auth';
import { AppointmentActions } from '../components/AppointmentActions';
import { AppointmentForm } from '../components/forms';
import { Card, Empty, ErrorBanner, Loading, Modal, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { formatDate, formatDateTime, formatMoney } from '../format';
import type { Appointment, Payment } from '../types';

export function ClientHome() {
  const { user } = useAuth();
  const [booking, setBooking] = useState(false);
  const [from] = useState(() => new Date().toISOString());
  const upcoming = useApi<Appointment[]>(`/appointments${qs({ from, status: 'scheduled' })}`);
  const all = useApi<Appointment[]>('/appointments');
  const payments = useApi<Payment[]>('/payments');

  const balance = (all.data ?? [])
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + Math.max(0, a.priceCents - a.paidCents), 0);
  const next = upcoming.data?.[0];
  const reload = () => {
    upcoming.reload();
    all.reload();
  };

  return (
    <>
      <PageHeader
        title={`Hi, ${user!.name.split(' ')[0]}`}
        subtitle="Here's what's coming up."
        actions={<button className="btn btn-primary" onClick={() => setBooking(true)}>Book an appointment</button>}
      />
      <ErrorBanner message={upcoming.error || payments.error} />
      <div className="stats">
        <StatCard label="Next appointment" value={next ? formatDateTime(next.startAt) : 'None booked'} hint={next?.serviceName} />
        <StatCard label="Upcoming" value={upcoming.data?.length ?? '—'} hint="appointments booked" />
        <StatCard label="Balance due" value={formatMoney(balance)} hint={balance ? <Link to="/payments">Pay online →</Link> : 'You are all paid up'} />
      </div>

      <div className="grid-2">
        <Card title="Upcoming appointments" actions={<Link to="/appointments" className="link-small">History →</Link>}>
          {upcoming.loading && !upcoming.data ? (
            <Loading />
          ) : upcoming.data?.length ? (
            <ul className="list">
              {upcoming.data.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{formatDateTime(a.startAt)}</strong>
                    <div className="muted small">
                      {a.serviceName}
                      {a.staffName && ` with ${a.staffName}`}
                    </div>
                  </div>
                  <AppointmentActions appt={a} onChanged={reload} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              No upcoming appointments.{' '}
              <button className="link-btn" onClick={() => setBooking(true)}>Book one now</button>
            </Empty>
          )}
        </Card>
        <Card title="Recent payments" actions={<Link to="/payments" className="link-small">All →</Link>}>
          {payments.data?.length ? (
            <ul className="list">
              {payments.data.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{formatMoney(p.amountCents)}</strong>
                    <div className="muted small">{p.serviceName ?? 'Payment'} · {formatDate(p.paidAt)}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No payments yet.</Empty>
          )}
        </Card>
      </div>

      {booking && (
        <Modal title="Book an appointment" onClose={() => setBooking(false)}>
          <AppointmentForm onCancel={() => setBooking(false)} onSaved={() => { setBooking(false); reload(); }} />
        </Modal>
      )}
    </>
  );
}
