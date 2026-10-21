import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { Avatar, StageTracker } from '../components/portal';
import { Card, Empty, ErrorBanner, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { formatDate, formatRelative, labels, MATTER_STAGES, toLocalInput } from '../format';
import type { Attorney, Matter, MatterStage, UserListItem } from '../types';

export function Matters() {
  const { user } = useAuth();
  const staff = isStaffRole(user);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const stage = params.get('stage') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data, error, loading, reload } = useApi<Matter[]>(`/matters${qs({ stage, q })}`);

  const update = async (m: Matter, body: { stage?: MatterStage; nextStep?: string | null }) => {
    setActionError(null);
    try {
      await api.patch(`/matters/${m.id}`, body);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const editNextStep = (m: Matter) => {
    const next = prompt('Next step (the client sees this):', m.nextStep ?? '');
    if (next !== null) update(m, { nextStep: next || null });
  };

  if (!staff) {
    return (
      <>
        <PageHeader title="My matters" subtitle="Where each of your legal matters stands, and what happens next." />
        <ErrorBanner message={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Card><Empty>You have no open matters. <Link to="/appointments">Book a consultation</Link> to get started.</Empty></Card>
        ) : (
          <div className="stack">{data.map((m) => <MatterCard key={m.id} matter={m} />)}</div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Matters"
        subtitle="Every open case and where it stands."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>Open a matter</button>}
      />
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Stage">
          {['', ...MATTER_STAGES].map((s) => (
            <button key={s} className={stage === s ? 'active' : ''} onClick={() => setParam('stage', s)}>
              {s ? labels[s] : 'All'}
            </button>
          ))}
        </div>
        <input type="search" className="search" placeholder="Search client, matter or practice…" defaultValue={q} onChange={(e) => setParam('q', e.target.value)} />
      </div>
      <ErrorBanner message={error || actionError} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>No matters in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Matter</th><th>Client</th><th>Attorney</th><th>Stage</th><th>Next step</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className={m.stage === 'closed' ? 'dim' : ''}>
                    <td>
                      <strong>{m.title}</strong>
                      <div className="muted small">{m.practice}{m.openRequests > 0 && ` · ${m.openRequests} document${m.openRequests === 1 ? '' : 's'} requested`}</div>
                    </td>
                    <td><Link to={`/clients/${m.clientId}`} className="strong-link">{m.clientName}</Link></td>
                    <td>
                      {m.staffName ? (
                        <span className="person"><Avatar name={m.staffName} photo={m.staffPhoto} size={26} />{m.staffName}</span>
                      ) : <span className="muted">Unassigned</span>}
                    </td>
                    <td>
                      <select value={m.stage} aria-label={`Stage of ${m.title}`} onChange={(e) => update(m, { stage: e.target.value as MatterStage })}>
                        {MATTER_STAGES.map((s) => <option key={s} value={s}>{labels[s]}</option>)}
                      </select>
                    </td>
                    <td>
                      {m.nextStep ?? <span className="muted">—</span>}
                      {m.nextDate && <div className="muted small">by {formatDate(m.nextDate)}</div>}
                      {m.stage !== 'closed' && (
                        <button className="link-btn small block" onClick={() => editNextStep(m)}>Edit</button>
                      )}
                    </td>
                    <td className="muted nowrap">{formatRelative(m.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <Modal title="Open a matter" onClose={() => setCreating(false)}>
          <MatterForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
        </Modal>
      )}
    </>
  );
}

/** A client's view of one matter: stage tracker, attorney and next step. */
export function MatterCard({ matter: m }: { matter: Matter }) {
  return (
    <Card className="matter-card">
      <div className="matter-head">
        <div>
          <p className="eyebrow">{m.practice}</p>
          <h2>{m.title}</h2>
        </div>
        <StatusBadge status={m.stage} />
      </div>
      <StageTracker stage={m.stage} />
      <div className="matter-foot">
        {m.staffName && (
          <div className="person">
            <Avatar name={m.staffName} photo={m.staffPhoto} size={40} />
            <div>
              <strong>{m.staffName}</strong>
              <div className="muted small">{m.staffTitle ?? 'Your attorney'}</div>
            </div>
          </div>
        )}
        {m.stage !== 'closed' && m.nextStep && (
          <div className="next-step">
            <span className="muted small">Next step</span>
            <strong>{m.nextStep}</strong>
            {m.nextDate && <span className="muted small">Target date {formatDate(m.nextDate)}</span>}
          </div>
        )}
        {m.openRequests > 0 && (
          <Link to="/documents" className="btn btn-small btn-primary">
            {m.openRequests} document{m.openRequests === 1 ? '' : 's'} needed →
          </Link>
        )}
      </div>
    </Card>
  );
}

const PRACTICES = ['Business law', 'Commercial lease dispute', 'Employment law', 'Estate planning', 'Family law', 'Intellectual property', 'Personal injury', 'Real estate'];

export function MatterForm({ clientId: presetClientId, onSaved, onCancel }: { clientId?: number; onSaved: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const { data: clients } = useApi<UserListItem[]>(presetClientId ? null : '/users?role=client&status=active');
  const { data: attorneys } = useApi<Attorney[]>('/appointments/providers');
  const [clientId, setClientId] = useState(presetClientId ?? 0);
  const [title, setTitle] = useState('');
  const [practice, setPractice] = useState(PRACTICES[0]);
  const [staffId, setStaffId] = useState<number>(user!.id);
  const [nextStep, setNextStep] = useState('Sign and return the engagement letter');
  const [nextDate, setNextDate] = useState(toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()).slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/matters', {
        clientId, title, practice, staffId,
        nextStep: nextStep || undefined,
        nextDate: nextDate ? new Date(`${nextDate}T12:00:00`).toISOString() : undefined,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBanner message={error} />
      {clients && (
        <Field label="Client">
          <select required value={clientId || ''} onChange={(e) => setClientId(Number(e.target.value))}>
            <option value="" disabled>Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
          </select>
        </Field>
      )}
      <Field label="Matter name" hint="e.g. Smith v. Acme Corp, or Smith family estate plan">
        <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Practice area">
          <select value={practice} onChange={(e) => setPractice(e.target.value)}>
            {PRACTICES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Lead attorney">
          <select value={staffId} onChange={(e) => setStaffId(Number(e.target.value))}>
            {attorneys?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Next step (shown to the client)">
          <input maxLength={200} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
        </Field>
        <Field label="Target date">
          <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Open matter'}</button>
      </div>
    </form>
  );
}
