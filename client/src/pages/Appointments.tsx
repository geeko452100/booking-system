import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { AppointmentActions, PaymentState } from '../components/AppointmentActions';
import { AppointmentForm } from '../components/forms';
import { Card, Empty, ErrorBanner, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { formatTime, startOfDay } from '../format';
import type { Appointment } from '../types';

const ranges = {
  today: { label: 'Today', from: () => startOfDay(0), to: () => startOfDay(1) },
  week: { label: 'Next 7 days', from: () => startOfDay(0), to: () => startOfDay(7) },
  upcoming: { label: 'Upcoming', from: () => new Date(), to: () => null },
  past: { label: 'Past 30 days', from: () => startOfDay(-30), to: () => new Date() },
  all: { label: 'All', from: () => null, to: () => null },
} as const;
type RangeKey = keyof typeof ranges;

export function Appointments() {
  const { user } = useAuth();
  const staff = isStaffRole(user);
  const [params, setParams] = useSearchParams();
  const [booking, setBooking] = useState(false);
  const range = (params.get('range') as RangeKey) || (staff ? 'week' : 'all');
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const url = useMemo(() => {
    const r = ranges[range] ?? ranges.all;
    return `/appointments${qs({ from: r.from()?.toISOString(), to: r.to()?.toISOString(), status, q })}`;
  }, [range, status, q]);
  const { data, error, loading, reload } = useApi<Appointment[]>(url);

  // Newest first when looking back in time; chronological otherwise.
  const rows = useMemo(() => {
    const list = data ?? [];
    return range === 'past' || (range === 'all' && !staff) ? [...list].reverse() : list;
  }, [data, range, staff]);

  let lastDay = '';

  return (
    <>
      <PageHeader
        title={staff ? 'Appointments' : 'My appointments'}
        subtitle={data ? `${data.length} appointment${data.length === 1 ? '' : 's'}` : undefined}
        actions={<button className="btn btn-primary" onClick={() => setBooking(true)}>{staff ? 'New appointment' : 'Book an appointment'}</button>}
      />
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
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        {staff && (
          <input type="search" className="search" placeholder="Search client or service…" defaultValue={q} onChange={(e) => setParam('q', e.target.value)} />
        )}
      </div>
      <ErrorBanner message={error} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No appointments in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  {staff && <th>Client</th>}
                  <th>Service</th>
                  <th>With</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const day = new Date(a.startAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                  const header = day !== lastDay;
                  lastDay = day;
                  return (
                    <Fragment key={a.id}>
                      {header && (
                        <tr className="group-row">
                          <td colSpan={staff ? 7 : 6}>{day}</td>
                        </tr>
                      )}
                      <tr className={a.status === 'cancelled' ? 'dim' : ''}>
                        <td className="nowrap">{formatTime(a.startAt)} – {formatTime(a.endAt)}</td>
                        {staff && (
                          <td>
                            <Link to={`/clients/${a.clientId}`} className="strong-link">{a.clientName}</Link>
                          </td>
                        )}
                        <td>
                          {a.serviceName}
                          {a.notes && <div className="muted small" title={a.notes}>📝 {a.notes.slice(0, 40)}{a.notes.length > 40 && '…'}</div>}
                        </td>
                        <td>{a.staffName ?? <span className="muted">Any</span>}</td>
                        <td><StatusBadge status={a.status} /></td>
                        <td><PaymentState appt={a} /></td>
                        <td className="actions-cell"><AppointmentActions appt={a} onChanged={reload} /></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {booking && (
        <Modal title={staff ? 'New appointment' : 'Book an appointment'} onClose={() => setBooking(false)}>
          <AppointmentForm onCancel={() => setBooking(false)} onSaved={() => { setBooking(false); reload(); }} />
        </Modal>
      )}
    </>
  );
}
