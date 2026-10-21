import { useState, type FormEvent } from 'react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { servicePhoto, useBusiness } from '../business';
import { AppointmentForm } from '../components/forms';
import { Badge, Card, Empty, ErrorBanner, Field, Loading, Modal, PageHeader } from '../components/ui';
import { formatMoney } from '../format';
import type { Service } from '../types';

export function Services() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';
  const { type, config } = useBusiness();
  const { data, error, loading, reload } = useApi<Service[]>('/services');
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [booking, setBooking] = useState<Service | null>(null);

  return (
    <>
      <PageHeader
        title={config.words.services}
        subtitle={isClient ? 'What we offer and what it costs.' : 'What clients can book, how long it takes and what it costs.'}
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing('new')}>New service</button>}
      />
      <ErrorBanner message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Card><Empty>No services yet.</Empty></Card>
      ) : (
        <div className="service-grid">
          {data.map((s) => (
            <article key={s.id} className={`service-card ${s.isActive ? '' : 'dim'}`}>
              <img src={servicePhoto(type, s.image)} alt="" loading="lazy" />
              <div className="service-body">
                <div className="service-title">
                  <h2>{s.name}</h2>
                  {!s.isActive && <Badge tone="gray">Hidden</Badge>}
                </div>
                {s.description && <p className="muted small">{s.description}</p>}
                <div className="service-foot">
                  <span>
                    <strong>{s.priceCents ? formatMoney(s.priceCents) : 'Free'}</strong>
                    <span className="muted small"> · {s.durationMin} min</span>
                  </span>
                  {isAdmin ? (
                    <button className="btn btn-small" onClick={() => setEditing(s)}>Edit</button>
                  ) : (
                    s.isActive && <button className="btn btn-small btn-primary" onClick={() => setBooking(s)}>Book</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
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
      {booking && (
        <Modal title={`Book: ${booking.name}`} onClose={() => setBooking(null)}>
          <AppointmentForm serviceId={booking.id} onCancel={() => setBooking(null)} onSaved={() => setBooking(null)} />
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
  const { type, config } = useBusiness();
  const [image, setImage] = useState(service?.image ?? config.serviceImages[0]);
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
      image,
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
      <fieldset className="image-picker">
        <legend className="field-label">Photo</legend>
        {config.serviceImages.map((img) => (
          <label key={img} className={image === img ? 'selected' : ''}>
            <input type="radio" name="image" value={img} checked={image === img} onChange={() => setImage(img)} />
            <img src={servicePhoto(type, img)} alt={img} />
          </label>
        ))}
      </fieldset>
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
