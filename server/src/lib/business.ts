import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { isBusinessType, type BusinessType } from '../business-types.js';
import { scalar } from '../db.js';
import type { AppEnv } from './auth.js';
import { demoMode } from './demo.js';

export { BUSINESS_TYPES, isBusinessType, type BusinessType } from '../business-types.js';

const COOKIE = 'biz';

/** The business type the owner chose in Settings. */
export async function siteBusiness(): Promise<BusinessType> {
  const v = await scalar<string>(`SELECT value AS v FROM meta WHERE key = 'business_type'`);
  return isBusinessType(v) ? v : 'home';
}

/**
 * Decides which business a request sees: in demo mode a visitor's own pick (so trying the salon
 * doesn't change the site for anyone else), otherwise the owner's setting.
 */
export const resolveBusiness: MiddlewareHandler<AppEnv> = async (c, next) => {
  const picked = demoMode() ? getCookie(c, COOKIE) : undefined;
  c.set('biz', isBusinessType(picked) ? picked : await siteBusiness());
  await next();
};

/** Remembers a demo visitor's pick for 30 days. */
export function setVisitorBusiness(c: Context, type: BusinessType) {
  setCookie(c, COOKIE, type, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: 30 * 86_400,
  });
}
