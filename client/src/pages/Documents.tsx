import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, qs, useApi } from '../api';
import { isStaffRole, useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { FilePicker } from '../components/portal';
import { Card, Empty, ErrorBanner, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { formatBytes, formatDate, formatRelative, labels } from '../format';
import type { DocumentCategory, LegalDocument, Matter, UserListItem } from '../types';

const CATEGORIES: DocumentCategory[] = ['identification', 'contract', 'evidence', 'court_filing', 'correspondence', 'financial', 'other'];

export function Documents() {
  const { user } = useAuth();
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

  const { data, error, loading, reload } = useApi<LegalDocument[]>(`/documents${qs({ status, q })}`);
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
        title={staff ? 'Documents' : 'My documents'}
        subtitle={staff ? 'Files exchanged with clients, and uploads waiting for review.' : 'Send files to your legal team and find everything they have shared with you.'}
        actions={
          staff ? (
            <>
              <button className="btn" onClick={() => setModal('upload')}>Share a document</button>
              <button className="btn btn-primary" onClick={() => setModal('request')}>Request a document</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setModal('upload')}>Upload a document</button>
          )
        }
      />
      {flash && <div className="alert alert-success">{flash}</div>}
      <ErrorBanner message={error || actionError} />

      {!staff && requested.length > 0 && (
        <Card title={`Requested by your legal team (${requested.length})`} className="card-accent">
          <ul className="list">
            {requested.map((d) => (
              <li key={d.id} className="request-item">
                <div className="request-main">
                  <div>
                    <strong>{d.name}</strong>
                    <div className="muted small">
                      {d.matterTitle ?? labels[d.category]} · asked by {d.createdByName} {formatRelative(d.createdAt).toLowerCase()}
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
                      act(() => api.post('/documents', { requestId: d.id, ...f }), `Thanks! “${f.fileName}” was sent to your legal team.`);
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
              {s ? (staff ? labels[s] : { shared: 'From the firm', received: 'Sent by me', reviewed: 'Reviewed' }[s]) : 'All'}
            </button>
          ))}
        </div>
        <input type="search" className="search" placeholder={staff ? 'Search client or document…' : 'Search documents…'} defaultValue={q} onChange={(e) => setParam('q', e.target.value)} />
      </div>

      <Card>
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No documents in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  {staff && <th>Client</th>}
                  <th>Matter</th>
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
                            {d.fileName ? `${d.fileName} · ${formatBytes(d.sizeBytes)}` : labels[d.category]}
                          </div>
                          {d.note && <div className="small request-note">{d.note}</div>}
                        </div>
                      </div>
                    </td>
                    {staff && <td><Link to={`/clients/${d.clientId}`} className="strong-link">{d.clientName}</Link></td>}
                    <td className="muted">{d.matterTitle ?? '—'}</td>
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
          title={modal === 'request' ? 'Request a document' : staff ? 'Share a document with a client' : 'Upload a document'}
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

/** Request (staff), share (staff) or upload (client) a document. */
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
  const staff = isStaffRole(user);
  const [clientId, setClientId] = useState(presetClientId ?? (staff ? 0 : user!.id));
  const [matterId, setMatterId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>(mode === 'request' ? 'financial' : 'other');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ fileName: string; sizeBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: clients } = useApi<UserListItem[]>(staff && !presetClientId ? '/users?role=client&status=active' : null);
  const { data: matters } = useApi<Matter[]>(clientId ? `/matters${qs({ clientId: staff ? clientId : undefined })}` : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'upload' && !file) return setError('Please choose a file');
    setBusy(true);
    setError(null);
    const common = { matterId: matterId === '' ? null : matterId, category, note: note || undefined };
    try {
      if (mode === 'request') {
        await api.post('/documents/requests', { ...common, clientId, name });
        onSaved(`Request sent. The client will see “${name}” on their Documents page.`);
      } else {
        await api.post('/documents', { ...common, clientId: staff ? clientId : undefined, name: name || undefined, ...file! });
        onSaved(staff ? `“${file!.fileName}” is now shared with the client.` : `Thanks! “${file!.fileName}” was sent to your legal team.`);
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
        <Field label="Client">
          <select required value={clientId || ''} onChange={(e) => { setClientId(Number(e.target.value)); setMatterId(''); }}>
            <option value="" disabled>Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
          </select>
        </Field>
      )}
      <Field label={mode === 'request' ? 'What do you need?' : 'Title (optional)'} hint={mode === 'request' ? 'e.g. Pay stubs for the last 3 months' : 'Defaults to the file name'}>
        <input required={mode === 'request'} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="form-row">
        <Field label="Matter">
          <select value={matterId} disabled={!clientId} onChange={(e) => setMatterId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">General / not specific</option>
            {matters?.filter((m) => m.stage !== 'closed').map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{labels[c] ?? 'Other'}</option>)}
          </select>
        </Field>
      </div>
      <Field label={mode === 'request' ? 'Note to the client (optional)' : 'Note (optional)'}>
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
          {busy ? 'Sending…' : mode === 'request' ? 'Send request' : staff ? 'Share with client' : 'Send to my legal team'}
        </button>
      </div>
    </form>
  );
}
