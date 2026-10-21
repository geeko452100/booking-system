import { Hono, type MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { z } from 'zod';
import { run } from '../db.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireRole, type AppEnv } from '../lib/auth.js';
import { BUSINESS_TYPES, setVisitorBusiness, siteBusiness } from '../lib/business.js';
import { demoMode } from '../lib/demo.js';

/** Which kind of business the site is set up as, and changing it. */
export const businessRouter = new Hono<AppEnv>();

businessRouter.get('/', async (c) =>
  c.json({ type: c.get('biz'), siteType: await siteBusiness(), demoMode: demoMode() }),
);

// On the demo, anyone can switch (it only changes their own view); otherwise it's the owner's setting.
const ownerUnlessDemo: MiddlewareHandler<AppEnv> = async (c, next) =>
  demoMode() ? next() : every(requireAuth, requireRole('admin'))(c, next);

businessRouter.put('/', ownerUnlessDemo, async (c) => {
  const { type } = z.object({ type: z.enum(BUSINESS_TYPES) }).parse(await c.req.json());
  if (demoMode()) {
    setVisitorBusiness(c, type);
  } else {
    await run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('business_type', ?)`, type);
    await audit(c, 'change_business_type', 'business', null, { from: c.get('biz'), to: type });
  }
  return c.json({ type, siteType: demoMode() ? await siteBusiness() : type, demoMode: demoMode() });
});
