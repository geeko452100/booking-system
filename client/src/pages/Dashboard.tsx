import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { qs, useApi } from '../api';
import { useAuth } from '../auth';
import { cap, useBusiness } from '../business';
import { AppointmentActions, PaymentState } from '../components/AppointmentActions';
import { AppointmentForm, PaymentForm } from '../components/forms';
import { BarChart, Card, Empty, ErrorBanner, Loading, Modal, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { formatDateTime, formatMoney, formatRelative, formatTime, labels, startOfDay } from '../format';
import type { DashboardSummary } from '../types';

export function Dashboard() {
  const { user } = useAuth();
  const { config } = useBusiness();
  const { words, features, stages } = config;
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
            <button className="btn btn-primary" onClick={() => setModal('book')}>New {words.booking}</button>
          </>
        }
      />
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="stats">
            <StatCard label={`Today's ${words.bookings}`} value={data.stats.todayCount} hint={`${data.stats.upcoming7d} booked in the next 7 days`} />
            {features.projects && (
              <StatCard label={`Open ${words.projects}`} value={data.stats.openProjects} hint={<Link to="/projects">View all →</Link>} />
            )}
            <StatCard
              label="Unread messages"
              value={data.stats.unreadMessages}
              tone={data.stats.unreadMessages ? 'alert' : undefined}
              hint={<Link to="/messages">Open inbox →</Link>}
            />
            {features.documents && (
              <StatCard
                label="Uploads to review"
                value={data.stats.documentsToReview}
                hint={<Link to="/documents?status=received">{data.stats.documentsRequested} requests outstanding →</Link>}
              />
            )}
            <StatCard label="Revenue · 30 days" value={formatMoney(data.stats.revenue30dCents)} hint={`${formatMoney(data.stats.pendingCents)} pending`} />
            <StatCard label={`Active ${words.clients}`} value={data.stats.activeClients} hint={`+${data.stats.newClients30d} new in 30 days`} />
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
            <div className="stack">
            {features.projects && (
              <Card title={`${cap(words.project)} pipeline`} actions={<Link to="/projects" className="link-small">All {words.projects} →</Link>}>
                <div className="pipeline">
                  {data.projectStages.map((s) => (
                    <Link key={s.stage} to={`/projects?stage=${s.stage}`} className={`pipeline-step stage-${s.stage}`}>
                      <span className="pipeline-count">{s.count}</span>
                      <span className="small">{stages[s.stage]}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
            <Card title="Today's schedule" actions={<Link to="/appointments" className="link-small">All {words.bookings} →</Link>}>
              {data.today.length === 0 ? (
                <Empty>No {words.bookings} today.</Empty>
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
            </div>

            <div className="stack">
              {features.documents && (
              <Card title="Uploads awaiting review" actions={<Link to="/documents?status=received" className="link-small">All →</Link>}>
                {data.toReview.length === 0 ? (
                  <Empty>Nothing waiting for review.</Empty>
                ) : (
                  <ul className="list">
                    {data.toReview.map((d) => (
                      <li key={d.id}>
                        <div>
                          <strong>{d.name}</strong>
                          <div className="muted small">
                            <Link to={`/clients/${d.clientId}`}>{d.clientName}</Link> · {d.fileName} · {formatRelative(d.uploadedAt)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              )}
              <Card title="Revenue · last 14 days">
                <BarChart
                  format={formatMoney}
                  data={data.revenueByDay.map((d) => ({
                    label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }),
                    value: d.cents / 100,
                  }))}
                />
              </Card>
              <Card title="Unpaid invoices">
                {data.unpaid.length === 0 ? (
                  <Empty>Every completed {words.booking} has been paid for. 🎉</Empty>
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

          <Card title="Recent payments" actions={<Link to="/payments" className="link-small">All billing →</Link>}>
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
        <Modal title={`New ${words.booking}`} onClose={() => setModal(null)}>
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
