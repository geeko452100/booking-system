import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { cap, useBusiness, type BusinessConfig } from '../business';
import { useDemo } from '../demo';
import type { Role } from '../types';
import { Icon } from './Icon';
import { Avatar, BusinessPicker } from './portal';

export function Brand({ large }: { large?: boolean }) {
  const { config } = useBusiness();
  return (
    <div className={`brand ${large ? 'brand-lg' : ''}`}>
      <span className="brand-mark"><Icon name={config.icon} /></span>
      <span className="brand-text">
        <span className="brand-name">{config.name}</span>
        <span className="brand-sub">{large ? config.tagline : 'Client portal'}</span>
      </span>
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
}

/** The sidebar, worded for the business and without the features it doesn't use. */
function navFor({ words, features }: BusinessConfig): NavItem[] {
  const everyone: Role[] = ['admin', 'staff', 'client'];
  return [
    { to: '/', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'staff'] },
    { to: '/', label: 'Home', icon: 'dashboard', roles: ['client'] },
    ...(features.projects ? [{ to: '/projects', label: cap(words.projects), icon: 'briefcase', roles: everyone }] : []),
    { to: '/appointments', label: cap(words.bookings), icon: 'calendar', roles: everyone },
    { to: '/messages', label: 'Messages', icon: 'message', roles: everyone },
    ...(features.documents ? [{ to: '/documents', label: words.documents, icon: 'folder', roles: everyone }] : []),
    { to: '/payments', label: 'Billing', icon: 'card', roles: everyone },
    { to: '/clients', label: cap(words.clients), icon: 'users', roles: ['admin', 'staff'] },
    { to: '/services', label: 'Services', icon: 'list', roles: everyone },
    { to: '/staff', label: 'Team', icon: 'badge', roles: ['admin'] },
    { to: '/audit', label: 'Activity log', icon: 'shield', roles: ['admin'] },
    { to: '/account', label: 'My account', icon: 'user', roles: everyone },
  ];
}

export function Layout() {
  const { user, logout } = useAuth();
  const { config } = useBusiness();
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
          {navFor(config)
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
              <div className="me-role">{user.title ?? config.roles[user.role]}</div>
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
            <p>
              <strong>Demo site.</strong> {config.name} is a made-up business. Everyone shares this data, and it resets
              every {demo.resetMinutes} minutes
              {demo.nextResetAt &&
                ` (next reset at ${new Date(demo.nextResetAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })})`}
              . Try it as a different kind of business:
            </p>
            <BusinessPicker compact />
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
