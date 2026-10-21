const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
export const formatMoney = (cents: number) => money.format(cents / 100);

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(iso);
}

/** ISO string -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Start of a local day, offset by `days`. */
export function startOfDay(days = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

export const labels: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
  failed: 'Failed',
  card: 'Card',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  other: 'Other',
  admin: 'Partner',
  staff: 'Attorney',
  client: 'Client',
  // Matter stages
  intake: 'Intake',
  investigation: 'Fact-finding',
  negotiation: 'Negotiation',
  resolution: 'Resolution',
  closed: 'Closed',
  // Documents
  requested: 'Requested',
  received: 'Awaiting review',
  reviewed: 'Reviewed',
  shared: 'From the firm',
  identification: 'Identification',
  contract: 'Contract',
  evidence: 'Evidence',
  court_filing: 'Court filing',
  correspondence: 'Correspondence',
  financial: 'Financial',
};

export const MATTER_STAGES = ['intake', 'investigation', 'negotiation', 'resolution', 'closed'] as const;

/** What each stage means, in plain words for clients. */
export const stageHelp: Record<string, string> = {
  intake: 'We are opening your file and checking for conflicts.',
  investigation: 'We are gathering documents, facts and evidence.',
  negotiation: 'We are negotiating or drafting on your behalf.',
  resolution: 'We are finalizing the outcome and paperwork.',
  closed: 'This matter is complete.',
};

export function formatBytes(n: number | null | undefined) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export const teamPhoto = (photo: string | null | undefined) => (photo ? `/img/team/${photo}.jpg` : null);
export const practicePhoto = (image: string | null | undefined) => `/img/practice/${image || 'consultation'}.jpg`;

/** Bundled practice-area photos an admin can pick from. */
export const PRACTICE_IMAGES = ['consultation', 'contracts', 'estate', 'litigation', 'drafting', 'disputes'] as const;

export const actionLabel = (action: string) =>
  action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
