import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { cap, useBusiness } from '../business';
import { Avatar } from '../components/portal';
import { Card, Empty, ErrorBanner, Loading, PageHeader } from '../components/ui';
import { formatDateTime, formatRelative } from '../format';
import type { Message, TeamMember, Thread, UserListItem } from '../types';

export function Messages() {
  const { user } = useAuth();
  const { config } = useBusiness();
  const staff = isStaffRole(user);
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get('client')) || null;
  const threads = useApi<Thread[]>(staff ? '/messages/threads' : null);
  const { data: team } = useApi<TeamMember[]>(staff ? null : '/appointments/providers');
  const { data: clients } = useApi<UserListItem[]>(staff ? '/users?role=client&status=active' : null);

  if (!staff) {
    return (
      <>
        <PageHeader title="Messages" subtitle={`A direct line to the team. ${config.replyTime}`} />
        <div className="grid-2 grid-detail">
          <ThreadView clientId={user!.id} />
          <Card title="Our team">
            <ul className="team-list">
              {team?.map((a) => (
                <li key={a.id} className="person">
                  <Avatar name={a.name} photo={a.photo} size={44} />
                  <div>
                    <strong>{a.name}</strong>
                    <div className="muted small">{a.title}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">For anything urgent on the day, please call us.</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Messages" subtitle={`Conversations with ${config.words.clients}. Anyone on the team can reply.`} />
      <div className="inbox">
        <Card className="inbox-list">
          <select
            aria-label="Start a conversation"
            value=""
            onChange={(e) => e.target.value && setParams({ client: e.target.value })}
          >
            <option value="">New message to…</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {threads.loading && !threads.data ? (
            <Loading />
          ) : !threads.data?.length ? (
            <Empty>No conversations yet.</Empty>
          ) : (
            <ul>
              {threads.data.map((t) => (
                <li key={t.clientId}>
                  <button
                    className={`thread-row ${selected === t.clientId ? 'active' : ''} ${t.unread ? 'unread' : ''}`}
                    onClick={() => setParams({ client: String(t.clientId) })}
                  >
                    <span className="thread-top">
                      <strong>{t.clientName}</strong>
                      <span className="muted small">{formatRelative(t.lastAt)}</span>
                    </span>
                    <span className="thread-preview small">
                      {t.lastFromClient ? '' : `${t.lastSenderName.split(' ')[0]}: `}
                      {t.lastBody}
                    </span>
                    {t.unread > 0 && <span className="nav-count">{t.unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {selected ? (
          <ThreadView key={selected} clientId={selected} onSent={threads.reload} showClientLink />
        ) : (
          <Card><Empty>Choose a conversation.</Empty></Card>
        )}
      </div>
    </>
  );
}

/** One client's conversation with the business, with a reply box. */
export function ThreadView({ clientId, onSent, showClientLink }: { clientId: number; onSent?: () => void; showClientLink?: boolean }) {
  const { user } = useAuth();
  const { config } = useBusiness();
  const staff = isStaffRole(user);
  const { data, error, loading, setData } = useApi<{ clientName: string; messages: Message[] }>(
    `/messages${qs({ clientId: staff ? clientId : undefined })}`,
  );
  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view (scrolls only the message list, not the page).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSendError(null);
    try {
      const m = await api.post<Message>('/messages', { clientId: staff ? clientId : undefined, body });
      setData((d) => d && { ...d, messages: [...d.messages, m] });
      setBody('');
      onSent?.();
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // From the viewer's side: a message is "mine" if it was sent by my side of the conversation.
  const mine = (m: Message) => (staff ? m.senderRole !== 'client' : m.senderId === user!.id);

  return (
    <Card
      className="thread"
      title={staff ? data?.clientName ?? 'Conversation' : `Conversation with ${config.name}`}
      actions={showClientLink && <Link to={`/clients/${clientId}`} className="link-small">Client file →</Link>}
    >
      <ErrorBanner message={error} />
      <div className="thread-body" ref={listRef}>
        {loading && !data ? (
          <Loading />
        ) : !data?.messages.length ? (
          <Empty>No messages yet. Say hello!</Empty>
        ) : (
          data.messages.map((m) => (
            <div key={m.id} className={`bubble-row ${mine(m) ? 'mine' : ''}`}>
              {!mine(m) && <Avatar name={m.senderName} photo={m.senderPhoto} size={32} />}
              <div className="bubble">
                <div className="bubble-meta small">
                  <strong>{m.senderName}</strong>
                  {m.senderTitle && <span className="muted"> · {m.senderTitle}</span>}
                </div>
                <p>{m.body}</p>
                <div className="bubble-meta small muted">{formatDateTime(m.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <form className="composer" onSubmit={send}>
        <ErrorBanner message={sendError} />
        <textarea
          rows={3}
          required
          maxLength={4000}
          placeholder={staff ? `Reply to ${data?.clientName ?? cap(config.words.client)}…` : 'Write a message to the team…'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="composer-foot">
          <span className="muted small">Ctrl + Enter to send</span>
          <button className="btn btn-primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </Card>
  );
}
