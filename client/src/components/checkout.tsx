import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatDateTime, formatMoney } from '../format';
import type { Appointment, Payment } from '../types';
import { ErrorBanner, Field } from './ui';

/** Payments run in test mode: only these cards are accepted and nothing is charged. */
export const TEST_CARD = '4242 4242 4242 4242';
const DECLINE_CARD = '4000 0000 0000 0002';
const TEST_CARDS = ['4242424242424242', '5555555555554444', '4000000000000002'];

export function TestCardBanner({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="test-banner" role="note">
      <span className="test-pill">Test mode</span>
      <div className="test-banner-text">
        <strong>No real payments are taken.</strong>{' '}
        Pay with the test card <code>{TEST_CARD}</code>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            navigator.clipboard?.writeText(TEST_CARD.replace(/ /g, ''));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {!compact && (
          <span className="test-banner-extra">
            {' '}with any future expiry date (e.g. <code>12/34</code>) and any 3-digit CVC (e.g. <code>123</code>). To see a
            declined payment, use <code>{DECLINE_CARD}</code>. Real card numbers are rejected.
          </span>
        )}
      </div>
    </div>
  );
}

const formatCard = (v: string) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

export function CheckoutForm({
  appointment,
  onPaid,
  onCancel,
}: {
  appointment: Appointment;
  onPaid: (p: Payment) => void;
  onCancel: () => void;
}) {
  const amount = appointment.priceCents - appointment.paidCents;
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // Checked here as well as on the server so a real card number never leaves the browser.
    if (!TEST_CARDS.includes(card.replace(/\s/g, ''))) {
      setError(`Only test cards are accepted on this site. Use ${TEST_CARD}.`);
      return;
    }
    setBusy(true);
    try {
      onPaid(await api.post<Payment>('/payments/checkout', { appointmentId: appointment.id, cardNumber: card, expiry, cvc }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} autoComplete="off">
      <TestCardBanner compact />
      <div className="checkout-summary">
        <div>
          <strong>{appointment.serviceName}</strong>
          <div className="muted small">{formatDateTime(appointment.startAt)}</div>
        </div>
        <div className="checkout-amount">{formatMoney(amount)}</div>
      </div>
      <ErrorBanner message={error} />
      <Field label="Card number">
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder={TEST_CARD}
          required
          value={card}
          onChange={(e) => setCard(formatCard(e.target.value))}
        />
      </Field>
      <div className="form-row">
        <Field label="Expiry (MM/YY)">
          <input
            inputMode="numeric"
            placeholder="12/34"
            required
            pattern="(0[1-9]|1[0-2])/\d{2}"
            value={expiry}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(0, 4);
              setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
            }}
          />
        </Field>
        <Field label="CVC">
          <input inputMode="numeric" placeholder="123" required pattern="\d{3,4}" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </Field>
      </div>
      <button
        type="button"
        className="link-btn small"
        onClick={() => {
          setCard(TEST_CARD);
          setExpiry('12/34');
          setCvc('123');
        }}
      >
        Fill in the test card for me
      </button>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Processing…' : `Pay ${formatMoney(amount)}`}
        </button>
      </div>
    </form>
  );
}
