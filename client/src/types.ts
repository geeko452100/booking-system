import type { Stage } from './business';

export type Role = 'admin' | 'staff' | 'client';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'other';
export type DocumentStatus = 'requested' | 'received' | 'reviewed' | 'shared';

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
  /** Headshot file name in /img/<business>/team (staff only). */
  photo: string | null;
  /** Job title in the current business, e.g. "Lead Groomer" (staff only). */
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
  /** Photo file name in /img/<business>/services. */
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
    openProjects: number;
    documentsToReview: number;
    documentsRequested: number;
    unreadMessages: number;
  };
  projectStages: { stage: Stage; count: number }[];
  toReview: ClientFile[];
  revenueByDay: { day: string; cents: number }[];
  today: Appointment[];
  recentPayments: Payment[];
  unpaid: Appointment[];
}

export interface TeamMember {
  id: number;
  name: string;
  title: string | null;
  photo: string | null;
}

/** A tracked piece of work for a client: a repair job, a training program. */
export interface Project {
  id: number;
  clientId: number;
  clientName: string;
  staffId: number | null;
  staffName: string | null;
  staffTitle: string | null;
  staffPhoto: string | null;
  title: string;
  kind: string;
  stage: Stage;
  nextStep: string | null;
  nextDate: string | null;
  openRequests: number;
  updatedAt: string;
  createdAt: string;
}

/** Named ClientFile to avoid clashing with the DOM's Document. */
export interface ClientFile {
  id: number;
  clientId: number;
  clientName: string;
  projectId: number | null;
  projectTitle: string | null;
  name: string;
  category: string;
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
