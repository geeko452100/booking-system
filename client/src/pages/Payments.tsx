import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { CheckoutForm, TestCardBanner } from '../components/checkout';
import { PaymentForm } from '../components/forms';
import { Card, Empty, ErrorBanner, Loading, Modal, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { formatDate, formatDateTime, formatMoney, labels, startOfDay } from '../format';
import type { Appointment, Payment, PaymentStatus } from '../types';

const ranges = {
  month: { label: 'This month', from: () => { const d = startOfDay(0); d.setDate(1); return d; } },
  '30d': { label: 'Last 30 days', from: () => startOfDay(-30) },
  year: { label: 'This year', from: () => new Date(new Date().getFullYear(), 0, 1) },
  all: { label: 'All time', from: () => null },
} as const;
type RangeKey = keyof typeof ranges;

export function Payments() {
  const { user } = useAuth();
  const staff = isStaffRole(user);
  const [params, setParams] = useSearchParams();
  const [recording, setRecording] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paying, setPaying] = useState<Appointment | null>(null);
  const [paidMsg, setPaidMsg] = useState<string | null>(null);
  const range = (params.get('range') as RangeKey) || (staff ? '30d' : 'all');
  const status = params.get('status') ?? '';
  const method = params.get('method') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const query = useMemo(
    () => qs({ from: (ranges[range] ?? ranges.all).from()?.toISOString(), status, method, q }),
    [range, status, method, q],
  );
  const { data, error, loading, reload } = useApi<Payment[]>(`/payments${query}`);
  const appts = useApi<Appointment[]>(staff ? null : '/appointments');

  // Completed visits with a balance, plus upcoming ones the client can pay ahead for.
  const due = useMemo(() => {
    const now = new Date().toISOString();
    return (appts.data ?? []).filter(
      (a) =>
        a.priceCents > a.paidCents &&
        (a.status === 'completed' || (a.status === 'scheduled' && a.startAt > now)),
    );
  }, [appts.data]);

  const totals = useMemo(() => {
    const t = { paid: 0, pending: 0, refunded: 0 };
    for (const p of data ?? []) if (p.status in t) t[p.status as keyof typeof t] += p.amountCents;
    return t;
  }, [data]);

  const setStatus = async (p: Payment, next: PaymentStatus, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setActionError(null);
    try {
      await api.patch(`/payments/${p.id}/status`, { status: next });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title={staff ? 'Payments' : 'My payments'}
        subtitle={staff ? 'Every payment recorded against client accounts.' : 'Your payment history.'}
        actions={
          staff && (
            <>
              <a className="btn" href={`/api/payments/export.csv${query}`}>Export CSV</a>
              <button className="btn btn-primary" onClick={() => setRecording(true)}>Record payment</button>
            </>
          )
        }
      />
      <TestCardBanner />
      {paidMsg && <div className="alert alert-success">{paidMsg}</div>}

      {!staff && (
        <Card title="Pay online">
          {appts.loading && !appts.data ? (
            <Loading />
          ) : due.length === 0 ? (
            <Empty>Nothing to pay right now. You're all paid up.</Empty>
          ) : (
            <ul className="list">
              {due.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.serviceName}</strong>
                    <div className="muted small">
                      {formatDateTime(a.startAt)} · {a.status === 'completed' ? 'Balance due' : 'Upcoming — pay ahead'}
                    </div>
                  </div>
                  <div className="list-side">
                    <strong>{formatMoney(a.priceCents - a.paidCents)}</strong>
                    <button className="btn btn-small btn-primary" onClick={() => { setPaidMsg(null); setPaying(a); }}>
                      Pay now
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Date range">
          {(Object.keys(ranges) as RangeKey[]).map((k) => (
            <button key={k} className={range === k ? 'active' : ''} onClick={() => setParam('range', k)}>
              {ranges[k].label}
            </button>
          ))}
        </div>
        <select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {['paid', 'pending', 'refunded', 'failed'].map((s) => <option key={s} value={s}>{labels[s]}</option>)}
        </select>
        {staff && (
          <>
            <select value={method} onChange={(e) => setParam('method', e.target.value)} aria-label="Method">
              <option value="">Any method</option>
              {['card', 'cash', 'bank_transfer', 'other'].map((m) => <option key={m} value={m}>{labels[m]}</option>)}
            </select>
            <input type="search" className="search" placeholder="Search client or reference…" defaultValue={q} onChange={(e) => setParam('q', e.target.value)} />
          </>
        )}
      </div>

      <div className="stats">
        <StatCard label="Collected" value={formatMoney(totals.paid)} hint={`${data?.filter((p) => p.status === 'paid').length ?? 0} payments`} />
        <StatCard label="Pending" value={formatMoney(totals.pending)} />
        <StatCard label="Refunded" value={formatMoney(totals.refunded)} />
      </div>

      <ErrorBanner message={error || actionError} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>No payments in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {staff && <th>Client</th>}
                  <th>For</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  {staff && <th />}
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className={p.status === 'refunded' || p.status === 'failed' ? 'dim' : ''}>
                    <td className="nowrap">{formatDateTime(p.paidAt)}</td>
                    {staff && <td><Link to={`/clients/${p.clientId}`} className="strong-link">{p.clientName}</Link></td>}
                    <td>
                      {p.serviceName ?? '—'}
                      {p.appointmentStart && <div className="muted small">{formatDate(p.appointmentStart)}</div>}
                    </td>
                    <td>{labels[p.method]}</td>
                    <td className="muted mono">{p.reference ?? '—'}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="num">{formatMoney(p.amountCents)}</td>
                    {staff && (
                      <td className="actions-cell">
                        <div className="row-actions">
                          {p.status === 'pending' && (
                            <button className="btn btn-small" onClick={() => setStatus(p, 'paid')}>Mark paid</button>
                          )}
                          {p.status === 'paid' && user?.role === 'admin' && (
                            <button
                              className="btn btn-small btn-ghost"
                              onClick={() => setStatus(p, 'refunded', `Mark ${formatMoney(p.amountCents)} from ${p.clientName} as refunded?`)}
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {paying && (
        <Modal title="Pay online" onClose={() => setPaying(null)}>
          <CheckoutForm
            appointment={paying}
            onCancel={() => setPaying(null)}
            onPaid={(p) => {
              setPaying(null);
              setPaidMsg(`Payment of ${formatMoney(p.amountCents)} received — thank you! Reference ${p.reference}.`);
              reload();
              appts.reload();
            }}
          />
        </Modal>
      )}
      {recording && (
        <Modal title="Record payment" onClose={() => setRecording(false)}>
          <PaymentForm onCancel={() => setRecording(false)} onSaved={() => { setRecording(false); reload(); }} />
        </Modal>
      )}
    </>
  );
}
