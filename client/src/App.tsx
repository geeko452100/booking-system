import { Navigate, Route, Routes } from 'react-router';
import { isStaffRole, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { Account } from './pages/Account';
import { AccountDetail } from './pages/AccountDetail';
import { Accounts } from './pages/Accounts';
import { Appointments } from './pages/Appointments';
import { AuditLog } from './pages/AuditLog';
import { ClientHome } from './pages/ClientHome';
import { Dashboard } from './pages/Dashboard';
import { Documents } from './pages/Documents';
import { Login, Register } from './pages/Login';
import { Matters } from './pages/Matters';
import { Messages } from './pages/Messages';
import { Payments } from './pages/Payments';
import { Services } from './pages/Services';
import type { Role } from './types';

function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={isStaffRole(user) ? <Dashboard /> : <ClientHome />} />
        <Route path="matters" element={<Matters />} />
        <Route path="documents" element={<Documents />} />
        <Route path="messages" element={<Messages />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="payments" element={<Payments />} />
        <Route path="account" element={<Account />} />
        <Route path="clients" element={<Guard roles={['admin', 'staff']}><Accounts kind="clients" /></Guard>} />
        <Route path="clients/:id" element={<Guard roles={['admin', 'staff']}><AccountDetail /></Guard>} />
        <Route path="staff" element={<Guard roles={['admin']}><Accounts kind="staff" /></Guard>} />
        <Route path="services" element={<Services />} />
        <Route path="audit" element={<Guard roles={['admin']}><AuditLog /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
