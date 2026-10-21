import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { cap, STAGES, useBusiness, type Stage } from '../business';
import { Avatar, StageBadge, StageTracker } from '../components/portal';
import { Card, Empty, ErrorBanner, Field, Loading, Modal, PageHeader } from '../components/ui';
import { formatDate, formatRelative, toLocalInput } from '../format';
import type { Project, TeamMember, UserListItem } from '../types';

/** Jobs (home services) or programs (fitness): where each one stands and what happens next. */
export function Projects() {
  const { user } = useAuth();
  const { config } = useBusiness();
  const { words, stages } = config;
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

  const { data, error, loading, reload } = useApi<Project[]>(`/projects${qs({ stage, q })}`);

  const update = async (p: Project, body: { stage?: Stage; nextStep?: string | null }) => {
    setActionError(null);
    try {
      await api.patch(`/projects/${p.id}`, body);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const editNextStep = (p: Project) => {
    const next = prompt(`Next step (the ${words.client} sees this):`, p.nextStep ?? '');
    if (next !== null) update(p, { nextStep: next || null });
  };

  if (!staff) {
    return (
      <>
        <PageHeader title={`My ${words.projects}`} subtitle={`Where each of your ${words.projects} stands, and what happens next.`} />
        <ErrorBanner message={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Card><Empty>Nothing here yet. <Link to="/services">See what we offer</Link> to get started.</Empty></Card>
        ) : (
          <div className="stack">{data.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={cap(words.projects)}
        subtitle={`Every ${words.project} and where it stands.`}
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>New {words.project}</button>}
      />
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Stage">
          {['', ...STAGES].map((s) => (
            <button key={s} className={stage === s ? 'active' : ''} onClick={() => setParam('stage', s)}>
              {s ? stages[s as Stage] : 'All'}
            </button>
          ))}
        </div>
        <input type="search" className="search" placeholder={`Search ${words.client} or ${words.project}…`} defaultValue={q} onChange={(e) => setParam('q', e.target.value)} />
      </div>
      <ErrorBanner message={error || actionError} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>No {words.projects} in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{cap(words.project)}</th>
                  <th>{cap(words.client)}</th>
                  <th>{cap(words.teamMember)}</th>
                  <th>Stage</th>
                  <th>Next step</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className={p.stage === 'done' ? 'dim' : ''}>
                    <td>
                      <strong>{p.title}</strong>
                      <div className="muted small">{p.kind}{p.openRequests > 0 && ` · ${p.openRequests} file${p.openRequests === 1 ? '' : 's'} requested`}</div>
                    </td>
                    <td><Link to={`/clients/${p.clientId}`} className="strong-link">{p.clientName}</Link></td>
                    <td>
                      {p.staffName ? (
                        <span className="person"><Avatar name={p.staffName} photo={p.staffPhoto} size={26} />{p.staffName}</span>
                      ) : <span className="muted">Unassigned</span>}
                    </td>
                    <td>
                      <select value={p.stage} aria-label={`Stage of ${p.title}`} onChange={(e) => update(p, { stage: e.target.value as Stage })}>
                        {STAGES.map((s) => <option key={s} value={s}>{stages[s]}</option>)}
                      </select>
                    </td>
                    <td>
                      {p.nextStep ?? <span className="muted">—</span>}
                      {p.nextDate && <div className="muted small">by {formatDate(p.nextDate)}</div>}
                      {p.stage !== 'done' && (
                        <button className="link-btn small block" onClick={() => editNextStep(p)}>Edit</button>
                      )}
                    </td>
                    <td className="muted nowrap">{formatRelative(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <Modal title={`New ${words.project}`} onClose={() => setCreating(false)}>
          <ProjectForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
        </Modal>
      )}
    </>
  );
}

/** A client's view of one project: stage tracker, who's on it and the next step. */
export function ProjectCard({ project: p }: { project: Project }) {
  const { config } = useBusiness();
  return (
    <Card className="project-card">
      <div className="project-head">
        <div>
          <p className="eyebrow">{p.kind}</p>
          <h2>{p.title}</h2>
        </div>
        <StageBadge stage={p.stage} />
      </div>
      <StageTracker stage={p.stage} />
      <div className="project-foot">
        {p.staffName && (
          <div className="person">
            <Avatar name={p.staffName} photo={p.staffPhoto} size={40} />
            <div>
              <strong>{p.staffName}</strong>
              <div className="muted small">{p.staffTitle ?? `Your ${config.words.teamMember}`}</div>
            </div>
          </div>
        )}
        {p.stage !== 'done' && p.nextStep && (
          <div className="next-step">
            <span className="muted small">Next step</span>
            <strong>{p.nextStep}</strong>
            {p.nextDate && <span className="muted small">Target date {formatDate(p.nextDate)}</span>}
          </div>
        )}
        {p.openRequests > 0 && (
          <Link to="/documents" className="btn btn-small btn-primary">
            {p.openRequests} file{p.openRequests === 1 ? '' : 's'} needed →
          </Link>
        )}
      </div>
    </Card>
  );
}

export function ProjectForm({ clientId: presetClientId, onSaved, onCancel }: { clientId?: number; onSaved: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const { config } = useBusiness();
  const { words } = config;
  const { data: clients } = useApi<UserListItem[]>(presetClientId ? null : '/users?role=client&status=active');
  const { data: team } = useApi<TeamMember[]>('/appointments/providers');
  const [clientId, setClientId] = useState(presetClientId ?? 0);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(config.projectKinds[0]);
  const [staffId, setStaffId] = useState<number>(user!.id);
  const [nextStep, setNextStep] = useState('');
  const [nextDate, setNextDate] = useState(toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()).slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/projects', {
        clientId, title, kind, staffId,
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
        <Field label={cap(words.client)}>
          <select required value={clientId || ''} onChange={(e) => setClientId(Number(e.target.value))}>
            <option value="" disabled>Select a {words.client}…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
          </select>
        </Field>
      )}
      <Field label={`${cap(words.project)} name`}>
        <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {config.projectKinds.map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
        <Field label={`Lead ${words.teamMember}`}>
          <select value={staffId} onChange={(e) => setStaffId(Number(e.target.value))}>
            {team?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label={`Next step (shown to the ${words.client})`}>
          <input maxLength={200} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
        </Field>
        <Field label="Target date">
          <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : `Create ${words.project}`}</button>
      </div>
    </form>
  );
}
