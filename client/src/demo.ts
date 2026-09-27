import { useEffect, useState } from 'react';
import { api } from './api';

export interface DemoStatus {
  demoMode: boolean;
  resetMinutes?: number;
  nextResetAt?: string | null;
  accounts?: { role: string; email: string; password: string }[];
}

let cached: Promise<DemoStatus> | null = null;

export function useDemo() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  useEffect(() => {
    cached ??= api.get<DemoStatus>('/demo').catch(() => ({ demoMode: false }));
    cached.then(setStatus);
  }, []);
  return status;
}

/** Re-fetch after a reset so the "next reset" time stays current. */
export function refreshDemo() {
  cached = null;
}
