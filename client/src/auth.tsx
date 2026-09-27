import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { refreshDemo } from './demo';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  /** Why the user was signed out, shown on the sign-in page. */
  notice: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone?: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
    setUnauthorizedHandler((message) => {
      setUser(null);
      setNotice(message);
      refreshDemo();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<User>('/auth/login', { email, password });
    setNotice(null);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (data: { name: string; email: string; phone?: string; password: string }) => {
    const u = await api.post<User>('/auth/register', data);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, notice, login, register, logout, setUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isStaffRole = (u: User | null) => u?.role === 'admin' || u?.role === 'staff';
