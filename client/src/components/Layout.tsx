import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { useDemo } from '../demo';
import { labels } from '../format';
import type { Role } from '../types';
import { Icon } from './Icon';
import { Avatar } from './portal';

export const FIRM = 'Acme Law';

export function Brand({ large }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? 'brand-lg' : ''}`}>
      <span className="brand-mark"><Icon name="scale" /></span>
      <span className="brand-text">
        <span className="brand-name">{FIRM}</span>
        <span className="brand-sub">{large ? 'Attorneys at Law · Client Portal' : 'Client Portal'}</span>
      </span>
    </div>
  );
}

const nav: { to: string; label: string; icon: string; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'staff'] },
  { to: '/', label: 'Home', icon: 'dashboard', roles: ['client'] },
  { to: '/matters', label: 'Matters', icon: 'briefcase', roles: ['admin', 'staff', 'client'] },
  { to: '/messages', label: 'Messages', icon: 'message', roles: ['admin', 'staff', 'client'] },
  { to: '/documents', label: 'Documents', icon: 'folder', roles: ['admin', 'staff', 'client'] },
  { to: '/appointments', label: 'Meetings', icon: 'calendar', roles: ['admin', 'staff', 'client'] },
  { to: '/payments', label: 'Billing', icon: 'card', roles: ['admin', 'staff', 'client'] },
  { to: '/clients', label: 'Clients', icon: 'users', roles: ['admin', 'staff'] },
  { to: '/services', label: 'Practice areas', icon: 'list', roles: ['admin', 'staff', 'client'] },
  { to: '/staff', label: 'Team', icon: 'badge', roles: ['admin'] },
  { to: '/audit', label: 'Activity log', icon: 'shield', roles: ['admin'] },
  { to: '/account', label: 'My account', icon: 'user', roles: ['admin', 'staff', 'client'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const demo = useDemo();
  const { pathname } = useLocation();
  const unread = useApi<{ count: number }>(user ? '/messages/unread' : null);
  const reloadUnread = unread.reload;
  // Re-check on every page change, so the badge clears after reading a thread.
  useEffect(() => {
    reloadUnread();
  }, [pathname, reloadUnread]);
  if (!user) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {nav
            .filter((n) => n.roles.includes(user.role))
            .map((n) => (
              <NavLink key={n.label} to={n.to} end={n.to === '/'} className="nav-link">
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.to === '/messages' && !!unread.data?.count && (
                  <span className="nav-count" aria-label={`${unread.data.count} unread`}>{unread.data.count}</span>
                )}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <Avatar name={user.name} photo={user.photo} size={34} />
            <div className="me-text">
              <div className="me-name">{user.name}</div>
              <div className="me-role">{user.title ?? labels[user.role]}</div>
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
            <strong>Demo site.</strong> {FIRM} is a fictional law firm; no real legal advice is given. Everyone shares this
            data, and it resets every {demo.resetMinutes} minutes
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
