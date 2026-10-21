import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { cap, useBusiness } from '../business';
import { Icon } from '../components/Icon';
import { FilePicker } from '../components/portal';
import { Card, Empty, ErrorBanner, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { formatBytes, formatDate, formatRelative, labels } from '../format';
import type { ClientFile, Project, UserListItem } from '../types';

/** File exchange with clients: quotes and photos, forms and plans, or pet records, depending on the business. */
export function Documents() {
  const { user } = useAuth();
  const { config } = useBusiness();
  const { words } = config;
  const categoryLabel = (key: string) => config.documentCategories.find((c) => c.key === key)?.label ?? 'Other';
  const staff = isStaffRole(user);
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<'upload' | 'request' | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data, error, loading, reload } = useApi<ClientFile[]>(`/documents${qs({ status, q })}`);
  const requested = staff ? [] : (data ?? []).filter((d) => d.status === 'requested');
  const rows = staff ? data ?? [] : (data ?? []).filter((d) => d.status !== 'requested');

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setActionError(null);
    setFlash(null);
    try {
      await fn();
      if (done) setFlash(done);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title={staff ? words.documents : `My ${words.documents.toLowerCase()}`}
        subtitle={staff ? `Files exchanged with ${words.clients}, and uploads waiting for review.` : 'Send us files and find everything we’ve shared with you.'}
        actions={
          staff ? (
            <>
              <button className="btn" onClick={() => setModal('upload')}>Share a file</button>
              <button className="btn btn-primary" onClick={() => setModal('request')}>Request a file</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setModal('upload')}>Upload a file</button>
          )
        }
      />
      {flash && <div className="alert alert-success">{flash}</div>}
      <ErrorBanner message={error || actionError} />

      {!staff && requested.length > 0 && (
        <Card title={`We need these from you (${requested.length})`} className="card-accent">
          <ul className="list">
            {requested.map((d) => (
              <li key={d.id} className="request-item">
                <div className="request-main">
                  <div>
                    <strong>{d.name}</strong>
                    <div className="muted small">
                      {d.projectTitle ?? categoryLabel(d.category)} · asked by {d.createdByName} {formatRelative(d.createdAt).toLowerCase()}
                    </div>
                    {d.note && <div className="small request-note">“{d.note}”</div>}
                  </div>
                  {uploadingFor !== d.id && (
                    <button className="btn btn-small btn-primary" onClick={() => setUploadingFor(d.id)}>Upload</button>
                  )}
                </div>
                {uploadingFor === d.id && (
                  <FilePicker
                    onPick={(f) => {
                      setUploadingFor(null);
                      act(() => api.post('/documents', { requestId: d.id, ...f }), `Thanks! We got “${f.fileName}”.`);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Status">
          {(staff ? ['', 'received', 'requested', 'reviewed', 'shared'] : ['', 'shared', 'received', 'reviewed']).map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setParam('status', s)}>
              {s ? (staff ? labels[s] : { shared: 'From us', received: 'Sent by me', reviewed: 'Reviewed' }[s]) : 'All'}
            </button>
          ))}
        </div>
        <input type="search" className="search" placeholder={staff ? `Search ${words.client} or file…` : 'Search files…'} defaultValue={q} onChange={(e) => setParam('q', e.target.value)} />
      </div>

      <Card>
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No files in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  {staff && <th>{cap(words.client)}</th>}
                  {config.features.projects && <th>{cap(words.project)}</th>}
                  <th>Status</th>
                  <th>Date</th>
                  {staff && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="doc-name">
                        <Icon name="file" className="icon doc-icon" />
                        <div>
                          <strong>{d.name}</strong>
                          <div className="muted small">
                            {d.fileName ? `${d.fileName} · ${formatBytes(d.sizeBytes)}` : categoryLabel(d.category)}
                          </div>
                          {d.note && <div className="small request-note">{d.note}</div>}
                        </div>
                      </div>
                    </td>
                    {staff && <td><Link to={`/clients/${d.clientId}`} className="strong-link">{d.clientName}</Link></td>}
                    {config.features.projects && <td className="muted">{d.projectTitle ?? '—'}</td>}
                    <td><StatusBadge status={d.status} /></td>
                    <td className="nowrap muted">{formatDate(d.uploadedAt ?? d.createdAt)}</td>
                    {staff && (
                      <td className="actions-cell">
                        <div className="row-actions">
                          {d.status === 'received' && (
                            <>
                              <button className="btn btn-small btn-primary" onClick={() => act(() => api.patch(`/documents/${d.id}`, { status: 'reviewed' }))}>
                                Mark reviewed
                              </button>
                              <button
                                className="btn btn-small btn-ghost"
                                onClick={() => {
                                  const note = prompt('Why do you need it again? The client will see this note.', 'The scan is hard to read. Could you upload a clearer copy?');
                                  if (note !== null) act(() => api.patch(`/documents/${d.id}`, { status: 'requested', note }));
                                }}
                              >
                                Ask again
                              </button>
                            </>
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

      {modal && (
        <Modal
          title={modal === 'request' ? 'Request a file' : staff ? `Share a file with a ${words.client}` : 'Upload a file'}
          onClose={() => setModal(null)}
        >
          <DocumentForm
            mode={modal}
            onCancel={() => setModal(null)}
            onSaved={(msg) => {
              setModal(null);
              setFlash(msg);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}

/** Request (staff), share (staff) or upload (client) a file. */
export function DocumentForm({
  mode,
  clientId: presetClientId,
  onSaved,
  onCancel,
}: {
  mode: 'upload' | 'request';
  clientId?: number;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { config } = useBusiness();
  const { words } = config;
  const staff = isStaffRole(user);
  const [clientId, setClientId] = useState(presetClientId ?? (staff ? 0 : user!.id));
  const [projectId, setProjectId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(config.documentCategories[0]?.key ?? 'other');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ fileName: string; sizeBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: clients } = useApi<UserListItem[]>(staff && !presetClientId ? '/users?role=client&status=active' : null);
  const { data: projects } = useApi<Project[]>(
    clientId && config.features.projects ? `/projects${qs({ clientId: staff ? clientId : undefined })}` : null,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'upload' && !file) return setError('Please choose a file');
    setBusy(true);
    setError(null);
    const common = { projectId: projectId === '' ? null : projectId, category, note: note || undefined };
    try {
      if (mode === 'request') {
        await api.post('/documents/requests', { ...common, clientId, name });
        onSaved(`Request sent. The ${words.client} will see “${name}” on their ${words.documents} page.`);
      } else {
        await api.post('/documents', { ...common, clientId: staff ? clientId : undefined, name: name || undefined, ...file! });
        onSaved(staff ? `“${file!.fileName}” is now shared with the ${words.client}.` : `Thanks! We got “${file!.fileName}”.`);
      }
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
          <select required value={clientId || ''} onChange={(e) => { setClientId(Number(e.target.value)); setProjectId(''); }}>
            <option value="" disabled>Select a {words.client}…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
          </select>
        </Field>
      )}
      <Field label={mode === 'request' ? 'What do you need?' : 'Title (optional)'} hint={mode === 'request' ? undefined : 'Defaults to the file name'}>
        <input required={mode === 'request'} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="form-row">
        {config.features.projects && (
          <Field label={cap(words.project)}>
            <select value={projectId} disabled={!clientId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">General / not specific</option>
              {projects?.filter((p) => p.stage !== 'done').map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Type">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {config.documentCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label={mode === 'request' ? `Note to the ${words.client} (optional)` : 'Note (optional)'}>
        <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {mode === 'upload' &&
        (file ? (
          <div className="picked-file">
            <Icon name="file" />
            <span><strong>{file.fileName}</strong> · {formatBytes(file.sizeBytes)}</span>
            <button type="button" className="link-btn small" onClick={() => setFile(null)}>Change</button>
          </div>
        ) : (
          <FilePicker onPick={setFile} />
        ))}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : mode === 'request' ? 'Send request' : staff ? `Share with ${words.client}` : 'Send to us'}
        </button>
      </div>
    </form>
  );
}
