export type Role = 'admin' | 'staff' | 'client';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'other';

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
  isActive: boolean;
}

export interface Appointment {
  id: number;
  clientId: number;
  clientName: string;
  clientEmail: string;
  staffId: number | null;
  staffName: string | null;
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
  };
  revenueByDay: { day: string; cents: number }[];
  today: Appointment[];
  recentPayments: Payment[];
  unpaid: Appointment[];
}
