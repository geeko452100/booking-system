import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { qs, useApi } from '../api';
import { useAuth } from '../auth';
import { AppointmentActions, PaymentState } from '../components/AppointmentActions';
import { AppointmentForm, PaymentForm } from '../components/forms';
import { BarChart, Card, Empty, ErrorBanner, Loading, Modal, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { formatDateTime, formatMoney, formatTime, labels, startOfDay } from '../format';
import type { DashboardSummary } from '../types';

export function Dashboard() {
  const { user } = useAuth();
  const [modal, setModal] = useState<'book' | 'pay' | null>(null);
  const url = useMemo(
    () => `/dashboard/summary${qs({ dayStart: startOfDay(0).toISOString(), dayEnd: startOfDay(1).toISOString() })}`,
    [],
  );
  const { data, error, loading, reload } = useApi<DashboardSummary>(url);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user!.name.split(' ')[0]}`}
        subtitle={today}
        actions={
          <>
            <button className="btn" onClick={() => setModal('pay')}>Record payment</button>
            <button className="btn btn-primary" onClick={() => setModal('book')}>New appointment</button>
          </>
        }
      />
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="stats">
            <StatCard label="Today's appointments" value={data.stats.todayCount} hint={`${data.stats.upcoming7d} booked in the next 7 days`} />
            <StatCard label="Revenue · last 30 days" value={formatMoney(data.stats.revenue30dCents)} hint={`${formatMoney(data.stats.pendingCents)} pending`} />
            <StatCard label="Active clients" value={data.stats.activeClients} hint={`+${data.stats.newClients30d} new in 30 days`} />
            <StatCard
              label="Cancellation / no-show rate"
              value={data.stats.total30d ? `${Math.round((data.stats.cancelled30d / data.stats.total30d) * 100)}%` : '—'}
              hint="Last 30 days"
            />
            {data.stats.lockedAccounts > 0 && (
              <StatCard
                tone="alert"
                label="Locked accounts"
                value={data.stats.lockedAccounts}
                hint={<Link to="/clients?status=locked">Review →</Link>}
              />
            )}
          </div>

          <div className="grid-2">
            <Card title="Today's schedule" actions={<Link to="/appointments" className="link-small">All appointments →</Link>}>
              {data.today.length === 0 ? (
                <Empty>No appointments today.</Empty>
              ) : (
                <ul className="schedule">
                  {data.today.map((a) => (
                    <li key={a.id} className={`schedule-item status-${a.status}`}>
                      <div className="schedule-time">
                        <strong>{formatTime(a.startAt)}</strong>
                        <span className="muted small">{formatTime(a.endAt)}</span>
                      </div>
                      <div className="schedule-body">
                        <Link to={`/clients/${a.clientId}`} className="strong-link">{a.clientName}</Link>
                        <div className="muted small">
                          {a.serviceName}
                          {a.staffName && ` · ${a.staffName}`} · <PaymentState appt={a} />
                        </div>
                      </div>
                      <div className="schedule-side">
                        {a.status !== 'scheduled' && <StatusBadge status={a.status} />}
                        <AppointmentActions appt={a} onChanged={reload} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="stack">
              <Card title="Revenue · last 14 days">
                <BarChart
                  format={formatMoney}
                  data={data.revenueByDay.map((d) => ({
                    label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }),
                    value: d.cents / 100,
                  }))}
                />
              </Card>
              <Card title="Awaiting payment">
                {data.unpaid.length === 0 ? (
                  <Empty>All completed appointments are paid. 🎉</Empty>
                ) : (
                  <ul className="list">
                    {data.unpaid.map((a) => (
                      <li key={a.id}>
                        <div>
                          <Link to={`/clients/${a.clientId}`} className="strong-link">{a.clientName}</Link>
                          <div className="muted small">{a.serviceName} · {formatDateTime(a.startAt)}</div>
                        </div>
                        <div className="list-side">
                          <span className="text-red">{formatMoney(a.priceCents - a.paidCents)}</span>
                          <AppointmentActions appt={a} onChanged={reload} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          <Card title="Recent payments" actions={<Link to="/payments" className="link-small">All payments →</Link>}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Client</th><th>For</th><th>Method</th><th>Status</th><th className="num">Amount</th></tr>
                </thead>
                <tbody>
                  {data.recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTime(p.paidAt)}</td>
                      <td><Link to={`/clients/${p.clientId}`}>{p.clientName}</Link></td>
                      <td className="muted">{p.serviceName ?? '—'}</td>
                      <td>{labels[p.method]}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="num">{formatMoney(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {modal === 'book' && (
        <Modal title="New appointment" onClose={() => setModal(null)}>
          <AppointmentForm onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
        </Modal>
      )}
      {modal === 'pay' && (
        <Modal title="Record payment" onClose={() => setModal(null)}>
          <PaymentForm onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
        </Modal>
      )}
    </>
  );
}
