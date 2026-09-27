import { useState } from 'react';
import { Link } from 'react-router';
import { qs, useApi } from '../api';
import { Card, Empty, ErrorBanner, Loading, PageHeader } from '../components/ui';
import { actionLabel, formatDateTime, labels } from '../format';
import type { AuditEntry } from '../types';

export function AuditLog() {
  const [q, setQ] = useState('');
  const { data, error, loading } = useApi<AuditEntry[]>(`/audit${qs({ q })}`);

  return (
    <>
      <PageHeader title="Activity log" subtitle="Sign-ins, account changes, bookings and payments — who did what, and when." />
      <div className="toolbar">
        <input type="search" className="search" placeholder="Filter by action or person…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorBanner message={error} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>No matching activity.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>IP</th></tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className={/fail|lock|blocked/.test(e.action) ? 'warn-row' : ''}>
                    <td className="nowrap">{formatDateTime(e.createdAt)}</td>
                    <td>
                      {e.actorName ?? <span className="muted">Unknown</span>}
                      {e.actorRole && <div className="muted small">{labels[e.actorRole]}</div>}
                    </td>
                    <td>{actionLabel(e.action)}</td>
                    <td>
                      {e.entity === 'user' && e.entityId ? (
                        <Link to={`/clients/${e.entityId}`}>{e.subjectName ?? `User #${e.entityId}`}</Link>
                      ) : (
                        <span className="muted">{e.entity}{e.entityId ? ` #${e.entityId}` : ''}</span>
                      )}
                    </td>
                    <td className="muted mono">{e.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
