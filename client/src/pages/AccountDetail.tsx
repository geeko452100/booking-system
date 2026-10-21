import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { cap, useBusiness } from '../business';
import { StageTracker } from '../components/portal';
import { AppointmentActions, PaymentState } from '../components/AppointmentActions';
import { AppointmentForm, PaymentForm, UserForm } from '../components/forms';
import {
  AccountBadge, Badge, Card, Empty, ErrorBanner, Loading, Modal, PageHeader, StatCard, StatusBadge, TempPasswordNotice,
} from '../components/ui';
import { actionLabel, formatDate, formatDateTime, formatMoney, formatRelative, labels } from '../format';
import type { ActivityEntry, Appointment, ClientFile, Payment, Project, User } from '../types';
import { DocumentForm } from './Documents';
import { ProjectForm } from './Projects';

interface Detail {
  user: User;
  appointments: Appointment[];
  payments: Payment[];
  activity: ActivityEntry[];
  projects: Project[];
  documents: ClientFile[];
}

export function AccountDetail() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi<Detail>(`/users/${id}`);
  const { config } = useBusiness();
  const { words, features } = config;
  const [modal, setModal] = useState<'edit' | 'book' | 'pay' | 'project' | 'request' | null>(null);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner message={error ?? 'Not found'} />;

  const { user, appointments, payments, activity, projects, documents } = data;
  const isClient = user.role === 'client';
  const isAdmin = me?.role === 'admin';
  const isSelf = me?.id === user.id;
  const now = new Date().toISOString();
  const upcoming = appointments.filter((a) => a.status === 'scheduled' && a.startAt >= now).reverse();
  const past = appointments.filter((a) => !(a.status === 'scheduled' && a.startAt >= now));
  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);
  const owed = appointments
    .filter((a) => a.status === 'completed')
    .reduce((s, a) => s + Math.max(0, a.priceCents - a.paidCents), 0);

  const run = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const close = () => setModal(null);
  const saved = () => {
    setModal(null);
    reload();
  };

  return (
    <>
      <p className="breadcrumb">
        <Link to={isClient ? '/clients' : '/staff'}>← {isClient ? 'Clients' : 'Team'}</Link>
      </p>
      <PageHeader
        title={user.name}
        subtitle={
          <span className="inline-badges">
            <AccountBadge user={user} />
            {!isClient && <Badge>{user.title ?? config.roles[user.role]}</Badge>}
            <span>{isClient ? `${cap(words.client)} since` : 'Joined'} {formatDate(user.createdAt)}</span>
          </span>
        }
        actions={
          isClient && (
            <>
              <button className="btn" onClick={() => setModal('pay')}>Record payment</button>
              {features.projects && <button className="btn" onClick={() => setModal('project')}>New {words.project}</button>}
              {features.documents && <button className="btn" onClick={() => setModal('request')}>Request a file</button>}
              <Link className="btn" to={`/messages?client=${user.id}`}>Message</Link>
              <button className="btn btn-primary" onClick={() => setModal('book')} disabled={!user.isActive}>
                New {words.booking}
              </button>
            </>
          )
        }
      />
      <ErrorBanner message={actionError} />
      {tempPw && <TempPasswordNotice password={tempPw} email={user.email} />}

      {isClient && (
        <div className="stats">
          {features.projects && <StatCard label={`Open ${words.projects}`} value={projects.filter((p) => p.stage !== 'done').length} />}
          <StatCard label={`Upcoming ${words.bookings}`} value={upcoming.length} hint={upcoming[0] ? formatDateTime(upcoming[0].startAt) : 'Nothing booked'} />
          <StatCard label="Total paid" value={formatMoney(totalPaid)} />
          <StatCard label="Balance due" value={formatMoney(owed)} tone={owed ? 'alert' : undefined} />
        </div>
      )}

      <div className="grid-2 grid-detail">
        <div className="stack">
          <Card title="Contact" actions={<button className="btn btn-small" onClick={() => setModal('edit')}>Edit</button>}>
            <dl className="details">
              <dt>Email</dt><dd>{user.email}</dd>
              <dt>Phone</dt><dd>{user.phone ?? '—'}</dd>
              {user.title && (<><dt>Title</dt><dd>{user.title}</dd></>)}
              <dt>Notes</dt><dd className="pre">{user.notes ?? <span className="muted">None</span>}</dd>
            </dl>
          </Card>

          <Card title="Sign-in & security">
            <dl className="details">
              <dt>Status</dt><dd><AccountBadge user={user} /></dd>
              <dt>Last sign-in</dt><dd>{user.lastLoginAt ? `${formatDateTime(user.lastLoginAt)} (${formatRelative(user.lastLoginAt)})` : 'Never'}</dd>
              {user.isLocked && (<><dt>Locked until</dt><dd>{formatDateTime(user.lockedUntil)}</dd></>)}
              {user.failedLogins > 0 && (<><dt>Failed attempts</dt><dd>{user.failedLogins}</dd></>)}
              <dt>Password</dt><dd>{user.mustChangePassword ? 'Temporary — must be changed' : 'Set by user'}</dd>
            </dl>
            {user.isDemoAccount && (
              <p className="muted small">
                Shared demo account: its password, email, role and status are protected so other visitors can still sign in.
              </p>
            )}
            <div className="button-row">
              {user.isLocked && (
                <button className="btn btn-small btn-primary" onClick={() => run(() => api.post(`/users/${user.id}/unlock`))}>
                  Unlock account
                </button>
              )}
              {!isSelf && !user.isDemoAccount && (
                <button
                  className="btn btn-small"
                  onClick={() =>
                    run(async () => {
                      const r = await api.post<{ temporaryPassword: string }>(`/users/${user.id}/reset-password`);
                      setTempPw(r.temporaryPassword);
                    }, `Reset the password for ${user.name}? Their current password will stop working.`)
                  }
                >
                  Reset password
                </button>
              )}
              {isAdmin && !isSelf && !user.isDemoAccount && (
                <button
                  className={`btn btn-small ${user.isActive ? 'btn-danger' : ''}`}
                  onClick={() =>
                    run(
                      () => api.patch(`/users/${user.id}`, { isActive: !user.isActive }),
                      user.isActive ? `Deactivate ${user.name}? They will be signed out and unable to sign in.` : undefined,
                    )
                  }
                >
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          </Card>

          <Card title="Account activity">
            {activity.length === 0 ? (
              <Empty>No activity recorded.</Empty>
            ) : (
              <ul className="timeline">
                {activity.map((a) => (
                  <li key={a.id} className={a.action.includes('fail') || a.action.includes('lock') ? 'warn' : ''}>
                    <span>{actionLabel(a.action)}</span>
                    <span className="muted small">
                      {formatRelative(a.createdAt)}
                      {a.actorName && a.actorName !== user.name && ` · by ${a.actorName}`}
                      {a.ip && ` · ${a.ip}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {isClient && (
          <div className="stack">
            {features.projects && (
            <Card title={cap(words.projects)}>
              {projects.length === 0 ? (
                <Empty>No {words.projects} yet.</Empty>
              ) : (
                <ul className="list">
                  {projects.map((p) => (
                    <li key={p.id} className="project-row">
                      <div>
                        <strong>{p.title}</strong>
                        <div className="muted small">{p.kind}{p.staffName && ` · ${p.staffName}`}</div>
                      </div>
                      <StageTracker stage={p.stage} compact />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            )}
            {features.documents && (
            <Card title={words.documents} actions={<Link to={`/documents?q=${encodeURIComponent(user.name)}`} className="link-small">All →</Link>}>
              {documents.length === 0 ? (
                <Empty>No files yet.</Empty>
              ) : (
                <ul className="list">
                  {documents.slice(0, 8).map((d) => (
                    <li key={d.id}>
                      <div>
                        <strong>{d.name}</strong>
                        <div className="muted small">{d.fileName ?? 'Not uploaded yet'} · {formatDate(d.uploadedAt ?? d.createdAt)}</div>
                      </div>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            )}
            <Card title={`Upcoming ${words.bookings}`}>
              {upcoming.length === 0 ? (
                <Empty>Nothing booked.</Empty>
              ) : (
                <AppointmentTable rows={upcoming} onChanged={reload} />
              )}
            </Card>
            <Card title={`${cap(words.booking)} history`}>
              {past.length === 0 ? <Empty>No past {words.bookings}.</Empty> : <AppointmentTable rows={past} onChanged={reload} />}
            </Card>
            <Card title="Payments">
              {payments.length === 0 ? (
                <Empty>No payments recorded.</Empty>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>For</th><th>Method</th><th>Status</th><th className="num">Amount</th></tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.paidAt)}</td>
                          <td>{p.serviceName ?? '—'}</td>
                          <td>{labels[p.method]}</td>
                          <td><StatusBadge status={p.status} /></td>
                          <td className="num">{formatMoney(p.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {modal === 'edit' && (
        <Modal title="Edit account" onClose={close}>
          <UserForm user={user} onCancel={close} onSaved={saved} />
        </Modal>
      )}
      {modal === 'book' && (
        <Modal title={`New ${words.booking} for ${user.name}`} onClose={close}>
          <AppointmentForm clientId={user.id} onCancel={close} onSaved={saved} />
        </Modal>
      )}
      {modal === 'project' && (
        <Modal title={`New ${words.project} for ${user.name}`} onClose={close}>
          <ProjectForm clientId={user.id} onCancel={close} onSaved={saved} />
        </Modal>
      )}
      {modal === 'request' && (
        <Modal title={`Request a file from ${user.name}`} onClose={close}>
          <DocumentForm mode="request" clientId={user.id} onCancel={close} onSaved={saved} />
        </Modal>
      )}
      {modal === 'pay' && (
        <Modal title={`Payment from ${user.name}`} onClose={close}>
          <PaymentForm clientId={user.id} onCancel={close} onSaved={saved} />
        </Modal>
      )}
    </>
  );
}

function AppointmentTable({ rows, onChanged }: { rows: Appointment[]; onChanged: () => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>When</th><th>Service</th><th>Status</th><th>Payment</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{formatDateTime(a.startAt)}</td>
              <td>
                {a.serviceName}
                {a.staffName && <div className="muted small">with {a.staffName}</div>}
              </td>
              <td><StatusBadge status={a.status} /></td>
              <td><PaymentState appt={a} /></td>
              <td className="actions-cell"><AppointmentActions appt={a} onChanged={onChanged} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
