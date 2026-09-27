import { useEffect, useRef, type ReactNode } from 'react';
import { labels } from '../format';

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'gray';

const statusTone: Record<string, Tone> = {
  scheduled: 'blue',
  completed: 'green',
  cancelled: 'gray',
  no_show: 'amber',
  paid: 'green',
  pending: 'amber',
  refunded: 'gray',
  failed: 'red',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? 'neutral'}>{labels[status] ?? status}</Badge>;
}

export function AccountBadge({ user }: { user: { isActive: boolean; isLocked: boolean } }) {
  if (!user.isActive) return <Badge tone="gray">Deactivated</Badge>;
  if (user.isLocked) return <Badge tone="red">Locked</Badge>;
  return <Badge tone="green">Active</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'alert' }) {
  return (
    <div className={`stat ${tone === 'alert' ? 'stat-alert' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="loading" role="status">Loading…</div>;
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="alert alert-error" role="alert">{message}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    dlg?.showModal();
    return () => dlg?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars" role="img" aria-label="Bar chart">
      {data.map((d) => (
        <div className="bar-col" key={d.label} title={`${d.label}: ${format(d.value)}`}>
          <div className="bar-track">
            <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Shown once after an account is created or its password is reset. */
export function TempPasswordNotice({ password, email }: { password: string; email: string }) {
  return (
    <div className="alert alert-info">
      <p>
        Temporary password for <strong>{email}</strong>:
      </p>
      <p className="temp-password">
        <code>{password}</code>
        <button type="button" className="btn btn-small" onClick={() => navigator.clipboard?.writeText(password)}>
          Copy
        </button>
      </p>
      <p className="muted small">Share it securely. It won't be shown again, and the user will be asked to change it after signing in.</p>
    </div>
  );
}
