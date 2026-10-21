import { useState } from 'react';
import { Link } from 'react-router';
import { qs, useApi } from '../api';
import { useAuth } from '../auth';
import { indefinite, useBusiness } from '../business';
import { AppointmentActions } from '../components/AppointmentActions';
import { AppointmentForm } from '../components/forms';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/portal';
import { Card, Empty, ErrorBanner, Loading, Modal, StatCard } from '../components/ui';
import { formatDate, formatDateTime, formatMoney, formatRelative } from '../format';
import type { Appointment, ClientFile, Message, Project, TeamMember } from '../types';
import { ProjectCard } from './Projects';

export function ClientHome() {
  const { user } = useAuth();
  const { type, config } = useBusiness();
  const { words, features } = config;
  const [booking, setBooking] = useState(false);
  const [from] = useState(() => new Date().toISOString());
  const upcoming = useApi<Appointment[]>(`/appointments${qs({ from, status: 'scheduled' })}`);
  const all = useApi<Appointment[]>('/appointments');
  const projects = useApi<Project[]>(features.projects ? '/projects' : null);
  const files = useApi<ClientFile[]>(features.documents ? '/documents' : null);
  const thread = useApi<{ messages: Message[] }>('/messages?peek=1');
  const { data: team } = useApi<TeamMember[]>('/appointments/providers');

  const balance = (all.data ?? [])
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + Math.max(0, a.priceCents - a.paidCents), 0);
  const next = upcoming.data?.[0];
  const open = projects.data?.filter((p) => p.stage !== 'done') ?? [];
  const requested = files.data?.filter((d) => d.status === 'requested') ?? [];
  const shared = files.data?.filter((d) => d.status === 'shared').slice(0, 4) ?? [];
  const latest = thread.data?.messages.at(-1);
  const reload = () => {
    upcoming.reload();
    all.reload();
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const summary = [
    open.length && `${open.length} open ${open.length === 1 ? words.project : words.projects}`,
    upcoming.data?.length && `${upcoming.data.length} upcoming ${upcoming.data.length === 1 ? words.booking : words.bookings}`,
    requested.length && `${requested.length} file${requested.length === 1 ? '' : 's'} to send us`,
  ].filter(Boolean);

  return (
    <>
      <section className="hero-banner">
        <img src={`/img/${type}/banner.jpg`} alt="" />
        <div className="hero-banner-text">
          <p className="eyebrow">{config.name}</p>
          <h1>{greeting}, {user!.name.split(' ')[0]}</h1>
          <p>{summary.length ? `You have ${summary.join(', ')}.` : 'Welcome to your client portal.'}</p>
        </div>
        <div className="hero-banner-actions">
          <Link to="/messages" className="btn">Message us</Link>
          <button className="btn btn-primary" onClick={() => setBooking(true)}>Book {indefinite(words.booking)}</button>
        </div>
      </section>

      <ErrorBanner message={projects.error || upcoming.error} />
      <div className="stats">
        <StatCard
          label={`Next ${words.booking}`}
          value={next ? formatDateTime(next.startAt) : 'None booked'}
          hint={next ? `${next.serviceName}${next.staffName ? ` with ${next.staffName}` : ''}` : <button className="link-btn" onClick={() => setBooking(true)}>Book now →</button>}
        />
        {features.projects && (
          <StatCard label={`Open ${words.projects}`} value={projects.data ? open.length : '—'} hint={<Link to="/projects">View progress →</Link>} />
        )}
        {features.documents && (
          <StatCard
            label="Files we need"
            value={files.data ? requested.length : '—'}
            tone={requested.length ? 'alert' : undefined}
            hint={requested.length ? <Link to="/documents">Upload now →</Link> : 'Nothing outstanding'}
          />
        )}
        <StatCard label="Balance due" value={formatMoney(balance)} hint={balance ? <Link to="/payments">Pay online →</Link> : 'You’re all paid up'} />
      </div>

      <div className="grid-2 grid-detail">
        <div className="stack">
          {features.projects &&
            (projects.loading && !projects.data ? (
              <Loading />
            ) : open.length ? (
              open.map((p) => <ProjectCard key={p.id} project={p} />)
            ) : (
              <Card title={`Your ${words.projects}`}><Empty>Nothing in progress. <Link to="/projects">See past {words.projects}</Link></Empty></Card>
            ))}

          <Card title={`Upcoming ${words.bookings}`} actions={<Link to="/appointments" className="link-small">All {words.bookings} →</Link>}>
            {upcoming.loading && !upcoming.data ? (
              <Loading />
            ) : upcoming.data?.length ? (
              <ul className="list">
                {upcoming.data.map((a) => (
                  <li key={a.id}>
                    <div className="person">
                      {a.staffName && <Avatar name={a.staffName} photo={a.staffPhoto} size={36} />}
                      <div>
                        <strong>{formatDateTime(a.startAt)}</strong>
                        <div className="muted small">
                          {a.serviceName}
                          {a.staffName && ` with ${a.staffName}`}
                          {a.notes && ` · ${a.notes}`}
                        </div>
                      </div>
                    </div>
                    <AppointmentActions appt={a} onChanged={reload} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                No upcoming {words.bookings}.{' '}
                <button className="link-btn" onClick={() => setBooking(true)}>Book one now</button>
              </Empty>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Latest message" actions={<Link to="/messages" className="link-small">Open →</Link>}>
            {latest ? (
              <div className="message-preview">
                <div className="person">
                  <Avatar name={latest.senderName} photo={latest.senderPhoto} size={36} />
                  <div>
                    <strong>{latest.senderName}</strong>
                    <div className="muted small">{formatRelative(latest.createdAt)}</div>
                  </div>
                </div>
                <p>{latest.body}</p>
                <Link to="/messages" className="btn btn-small">Reply</Link>
              </div>
            ) : (
              <Empty>No messages yet. <Link to="/messages">Send one</Link></Empty>
            )}
          </Card>

          {features.documents && (
            <Card title="Shared with you" actions={<Link to="/documents" className="link-small">All files →</Link>}>
              {shared.length ? (
                <ul className="list">
                  {shared.map((d) => (
                    <li key={d.id}>
                      <div className="doc-name">
                        <Icon name="file" className="icon doc-icon" />
                        <div>
                          <strong>{d.name}</strong>
                          <div className="muted small">{d.createdByName} · {formatDate(d.uploadedAt ?? d.createdAt)}</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nothing shared yet.</Empty>
              )}
            </Card>
          )}

          <Card title="Our team">
            <ul className="team-list">
              {team?.map((t) => (
                <li key={t.id} className="person">
                  <Avatar name={t.name} photo={t.photo} size={48} />
                  <div>
                    <strong>{t.name}</strong>
                    <div className="muted small">{t.title}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {booking && (
        <Modal title={`Book ${indefinite(words.booking)}`} onClose={() => setBooking(false)}>
          <AppointmentForm onCancel={() => setBooking(false)} onSaved={() => { setBooking(false); reload(); }} />
        </Modal>
      )}
    </>
  );
}
