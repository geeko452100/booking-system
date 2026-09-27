import { useState, type FormEvent } from 'react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBanner, Field, Loading, Modal, PageHeader } from '../components/ui';
import { formatMoney } from '../format';
import type { Service } from '../types';

export function Services() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data, error, loading, reload } = useApi<Service[]>('/services');
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="What clients can book, how long it takes and what it costs."
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing('new')}>New service</button>}
      />
      <ErrorBanner message={error} />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>No services yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Service</th><th>Duration</th><th className="num">Price</th><th>Status</th>{isAdmin && <th />}</tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className={s.isActive ? '' : 'dim'}>
                    <td>
                      <strong>{s.name}</strong>
                      {s.description && <div className="muted small">{s.description}</div>}
                    </td>
                    <td>{s.durationMin} min</td>
                    <td className="num">{formatMoney(s.priceCents)}</td>
                    <td>{s.isActive ? <Badge tone="green">Bookable</Badge> : <Badge tone="gray">Hidden</Badge>}</td>
                    {isAdmin && (
                      <td className="actions-cell">
                        <button className="btn btn-small" onClick={() => setEditing(s)}>Edit</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <Modal title={editing === 'new' ? 'New service' : 'Edit service'} onClose={() => setEditing(null)}>
          <ServiceForm
            service={editing === 'new' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function ServiceForm({ service, onSaved, onCancel }: { service?: Service; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [duration, setDuration] = useState(String(service?.durationMin ?? 60));
  const [price, setPrice] = useState(service ? (service.priceCents / 100).toFixed(2) : '');
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      description: description || null,
      durationMin: Number(duration),
      priceCents: Math.round(parseFloat(price || '0') * 100),
      isActive,
    };
    try {
      if (service) await api.put(`/services/${service.id}`, body);
      else await api.post('/services', body);
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
      <Field label="Name"><input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="form-row">
        <Field label="Duration (minutes)">
          <input type="number" min={5} step={5} required value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Field label="Price ($)">
          <input type="number" min={0} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Clients can book this service
      </label>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
