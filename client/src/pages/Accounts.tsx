import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { qs, useApi } from '../api';
import { useAuth } from '../auth';
import { UserForm } from '../components/forms';
import { AccountBadge, Card, Empty, ErrorBanner, Loading, Modal, PageHeader } from '../components/ui';
import { formatDateTime, formatMoney, formatRelative, labels } from '../format';
import type { UserListItem } from '../types';

/** Lists client accounts, or (for admins) staff and admin accounts. */
export function Accounts({ kind }: { kind: 'clients' | 'staff' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const roleFilter = kind === 'clients' ? 'client' : undefined;
  const { data, error, loading, reload } = useApi<UserListItem[]>(`/users${qs({ role: roleFilter, q, status })}`);
  const rows = kind === 'staff' ? data?.filter((u) => u.role !== 'client') : data;
  const isClients = kind === 'clients';

  return (
    <>
      <PageHeader
        title={isClients ? 'Clients' : 'Staff'}
        subtitle={isClients ? 'Client accounts, sign-in status and history.' : 'People who can sign in to manage bookings.'}
        actions={
          (isClients || user?.role === 'admin') && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              {isClients ? 'New client' : 'New staff member'}
            </button>
          )
        }
      />
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search name, email or phone…"
          defaultValue={q}
          onChange={(e) => setParam('q', e.target.value)}
        />
        <div className="segmented" role="group" aria-label="Account status">
          {[
            ['', 'All'],
            ['active', 'Active'],
            ['locked', 'Locked'],
            ['inactive', 'Deactivated'],
          ].map(([v, l]) => (
            <button key={v} className={status === v ? 'active' : ''} onClick={() => setParam('status', v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <ErrorBanner message={error} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !rows?.length ? (
          <Empty>No accounts match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="clickable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  {isClients ? (
                    <>
                      <th>Next appointment</th>
                      <th className="num">Visits</th>
                      <th className="num">Total paid</th>
                    </>
                  ) : (
                    <th>Role</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} onClick={() => navigate(`/clients/${u.id}`)}>
                    <td>
                      <Link to={`/clients/${u.id}`} className="strong-link" onClick={(e) => e.stopPropagation()}>
                        {u.name}
                      </Link>
                      <div className="muted small">{u.email}</div>
                    </td>
                    <td>{u.phone ?? '—'}</td>
                    <td><AccountBadge user={u} /></td>
                    <td className="muted">{formatRelative(u.lastLoginAt)}</td>
                    {isClients ? (
                      <>
                        <td>{u.nextAppointment ? formatDateTime(u.nextAppointment) : <span className="muted">—</span>}</td>
                        <td className="num">{u.appointmentCount}</td>
                        <td className="num">{formatMoney(u.totalPaidCents)}</td>
                      </>
                    ) : (
                      <td>{labels[u.role]}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <Modal title={isClients ? 'New client' : 'New staff member'} onClose={() => setCreating(false)}>
          <UserForm
            defaultRole={isClients ? 'client' : 'staff'}
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
