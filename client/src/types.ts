export type Role = 'admin' | 'staff' | 'client';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'other';
export type MatterStage = 'intake' | 'investigation' | 'negotiation' | 'resolution' | 'closed';
export type DocumentStatus = 'requested' | 'received' | 'reviewed' | 'shared';
export type DocumentCategory = 'identification' | 'contract' | 'evidence' | 'court_filing' | 'correspondence' | 'financial' | 'other';

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  failedLogins: number;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  notes: string | null;
  /** Headshot file name in /img/team (staff only). */
  photo: string | null;
  /** Job title, e.g. "Senior Associate" (staff only). */
  title: string | null;
  createdAt: string;
  isDemoAccount: boolean;
}

export interface UserListItem extends User {
  appointmentCount: number;
  nextAppointment: string | null;
  totalPaidCents: number;
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  /** Photo file name in /img/practice. */
  image: string | null;
  isActive: boolean;
}

export interface Appointment {
  id: number;
  clientId: number;
  clientName: string;
  clientEmail: string;
  staffId: number | null;
  staffName: string | null;
  staffPhoto: string | null;
  serviceId: number;
  serviceName: string;
  priceCents: number;
  paidCents: number;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  clientId: number;
  clientName: string;
  appointmentId: number | null;
  serviceName: string | null;
  appointmentStart: string | null;
  amountCents: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  paidAt: string;
  recordedByName: string | null;
  createdAt: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  details: string | null;
  ip: string | null;
  createdAt: string;
  actorName: string | null;
}

export interface AuditEntry extends ActivityEntry {
  entity: string;
  entityId: number | null;
  actorRole: Role | null;
  subjectName: string | null;
}

export interface DashboardSummary {
  stats: {
    todayCount: number;
    upcoming7d: number;
    revenue30dCents: number;
    pendingCents: number;
    activeClients: number;
    newClients30d: number;
    lockedAccounts: number;
    cancelled30d: number;
    total30d: number;
    openMatters: number;
    documentsToReview: number;
    documentsRequested: number;
    unreadMessages: number;
  };
  matterStages: { stage: MatterStage; count: number }[];
  toReview: LegalDocument[];
  revenueByDay: { day: string; cents: number }[];
  today: Appointment[];
  recentPayments: Payment[];
  unpaid: Appointment[];
}

export interface Attorney {
  id: number;
  name: string;
  title: string | null;
  photo: string | null;
}

export interface Matter {
  id: number;
  clientId: number;
  clientName: string;
  staffId: number | null;
  staffName: string | null;
  staffTitle: string | null;
  staffPhoto: string | null;
  title: string;
  practice: string;
  stage: MatterStage;
  nextStep: string | null;
  nextDate: string | null;
  openRequests: number;
  updatedAt: string;
  createdAt: string;
}

/** Named LegalDocument to avoid clashing with the DOM's Document. */
export interface LegalDocument {
  id: number;
  clientId: number;
  clientName: string;
  matterId: number | null;
  matterTitle: string | null;
  name: string;
  category: DocumentCategory;
  status: DocumentStatus;
  fileName: string | null;
  sizeBytes: number | null;
  note: string | null;
  createdByName: string | null;
  uploadedAt: string | null;
  createdAt: string;
}

export interface Message {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: Role;
  senderTitle: string | null;
  senderPhoto: string | null;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Thread {
  clientId: number;
  clientName: string;
  clientEmail: string;
  lastBody: string;
  lastAt: string;
  lastSenderName: string;
  lastFromClient: number;
  unread: number;
}
