import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { useDemo } from '../demo';
import { labels } from '../format';
import type { Role } from '../types';
import { Icon } from './Icon';

const nav: { to: string; label: string; icon: string; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'staff'] },
  { to: '/', label: 'Home', icon: 'dashboard', roles: ['client'] },
  { to: '/appointments', label: 'Appointments', icon: 'calendar', roles: ['admin', 'staff', 'client'] },
  { to: '/clients', label: 'Clients', icon: 'users', roles: ['admin', 'staff'] },
  { to: '/payments', label: 'Payments', icon: 'card', roles: ['admin', 'staff', 'client'] },
  { to: '/services', label: 'Services', icon: 'list', roles: ['admin', 'staff'] },
  { to: '/staff', label: 'Staff', icon: 'badge', roles: ['admin'] },
  { to: '/audit', label: 'Activity log', icon: 'shield', roles: ['admin'] },
  { to: '/account', label: 'My account', icon: 'user', roles: ['admin', 'staff', 'client'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const demo = useDemo();
  if (!user) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">B</span>
          <span>Bookings</span>
        </div>
        <nav className="nav">
          {nav
            .filter((n) => n.roles.includes(user.role))
            .map((n) => (
              <NavLink key={n.label} to={n.to} end={n.to === '/'} className="nav-link">
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <div className="avatar">{user.name.charAt(0)}</div>
            <div className="me-text">
              <div className="me-name">{user.name}</div>
              <div className="me-role">{labels[user.role]}</div>
            </div>
          </div>
          <button
            className="nav-link logout"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <Icon name="logout" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="main">
        {demo?.demoMode && (
          <div className="demo-bar" role="note">
            <strong>Demo site.</strong> Everyone shares this data, and it resets every {demo.resetMinutes} minutes
            {demo.nextResetAt &&
              ` (next reset at ${new Date(demo.nextResetAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })})`}
            . Feel free to click around and change things.
          </div>
        )}
        {user.mustChangePassword && !user.isDemoAccount && (
          <div className="alert alert-warn">
            You're using a temporary password. <NavLink to="/account">Set a new password</NavLink> to secure your account.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
