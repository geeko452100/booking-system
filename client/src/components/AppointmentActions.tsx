import { useState } from 'react';
import { api } from '../api';
import { isStaffRole, useAuth } from '../auth';
import type { Appointment, AppointmentStatus } from '../types';
import { AppointmentForm, PaymentForm } from './forms';
import { Modal } from './ui';

/** Row-level actions for an appointment, adapted to the viewer's role and the appointment's state. */
export function AppointmentActions({ appt, onChanged }: { appt: Appointment; onChanged: () => void }) {
  const { user } = useAuth();
  const [modal, setModal] = useState<'edit' | 'pay' | null>(null);
  const [busy, setBusy] = useState(false);
  const staff = isStaffRole(user);
  const upcoming = appt.status === 'scheduled' && new Date(appt.startAt) > new Date();
  const owed = appt.status === 'completed' && appt.paidCents < appt.priceCents;

  const setStatus = async (status: AppointmentStatus, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      await api.patch(`/appointments/${appt.id}`, { status });
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!staff) {
    return upcoming ? (
      <button className="btn btn-small" disabled={busy} onClick={() => setStatus('cancelled', 'Cancel this appointment?')}>
        Cancel
      </button>
    ) : null;
  }

  return (
    <div className="row-actions">
      {appt.status === 'scheduled' && (
        <>
          <button className="btn btn-small btn-primary" disabled={busy} onClick={() => setStatus('completed')}>
            Complete
          </button>
          <details className="menu">
            <summary className="btn btn-small" aria-label="More actions">
              More
            </summary>
            <div className="menu-list">
              <button onClick={() => setModal('edit')}>Reschedule / edit</button>
              <button onClick={() => setStatus('no_show')}>Mark no-show</button>
              <button className="danger" onClick={() => setStatus('cancelled', 'Cancel this appointment?')}>
                Cancel appointment
              </button>
            </div>
          </details>
        </>
      )}
      {owed && (
        <button className="btn btn-small" onClick={() => setModal('pay')}>
          Take payment
        </button>
      )}
      {(appt.status === 'cancelled' || appt.status === 'no_show') && (
        <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setStatus('scheduled')}>
          Restore
        </button>
      )}

      {modal === 'edit' && (
        <Modal title="Edit appointment" onClose={() => setModal(null)}>
          <AppointmentForm
            appointment={appt}
            onCancel={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              onChanged();
            }}
          />
        </Modal>
      )}
      {modal === 'pay' && (
        <Modal title="Record payment" onClose={() => setModal(null)}>
          <PaymentForm
            appointment={appt}
            onCancel={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              onChanged();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

export function PaymentState({ appt }: { appt: Appointment }) {
  if (appt.status === 'cancelled' || appt.priceCents === 0) return <span className="muted">—</span>;
  if (appt.paidCents >= appt.priceCents) return <span className="text-green">Paid</span>;
  if (appt.paidCents > 0) return <span className="text-amber">Part-paid</span>;
  return <span className={appt.status === 'completed' ? 'text-red' : 'muted'}>Unpaid</span>;
}
