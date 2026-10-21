import { Hono } from 'hono';
import { z } from 'zod';
import { all, one, run, scalar } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole, type AppEnv } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';

/** Secure messages. Each client has one thread with the business; any team member can reply. */
export const messagesRouter = new Hono<AppEnv>();

const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id AS senderId, s.name AS senderName, s.role AS senderRole, sp.title AS senderTitle,
         sp.photo AS senderPhoto, m.body, m.read_at AS readAt, m.created_at AS createdAt
  FROM messages m
  JOIN users s ON s.id = m.sender_id
  LEFT JOIN staff_profiles sp ON sp.user_id = m.sender_id AND sp.biz = m.biz`;

/** Messages the viewer hasn't read: for a client, replies from the business; for staff, messages from any client. */
messagesRouter.get('/unread', async (c) => {
  const me = c.get('user');
  const biz = c.get('biz');
  const count = isStaff(c)
    ? await scalar(`SELECT COUNT(*) AS v FROM messages WHERE biz = ? AND read_at IS NULL AND sender_id = client_id`, biz)
    : await scalar(
        `SELECT COUNT(*) AS v FROM messages WHERE biz = ? AND read_at IS NULL AND client_id = ? AND sender_id != ?`,
        biz, me.id, me.id,
      );
  return c.json({ count: count ?? 0 });
});

/** Staff inbox: one row per client thread, most recent first. */
messagesRouter.get('/threads', requireRole('admin', 'staff'), async (c) =>
  c.json(
    await all(
      `SELECT m.client_id AS clientId, c.name AS clientName, c.email AS clientEmail,
              m.body AS lastBody, m.created_at AS lastAt, s.name AS lastSenderName, m.sender_id = m.client_id AS lastFromClient,
              (SELECT COUNT(*) FROM messages u
                 WHERE u.biz = m.biz AND u.client_id = m.client_id AND u.read_at IS NULL AND u.sender_id = u.client_id) AS unread
       FROM messages m
       JOIN users c ON c.id = m.client_id
       JOIN users s ON s.id = m.sender_id
       WHERE m.id = (SELECT id FROM messages WHERE biz = m.biz AND client_id = m.client_id ORDER BY created_at DESC, id DESC LIMIT 1)
         AND m.biz = ?
       ORDER BY m.created_at DESC`,
      c.get('biz'),
    ),
  ),
);

/** A thread. Opening it marks the other side's messages as read, unless `peek` is set (e.g. for a preview). */
messagesRouter.get('/', async (c) => {
  const me = c.get('user');
  const biz = c.get('biz');
  const staff = isStaff(c);
  const clientId = staff ? z.coerce.number().int().parse(c.req.query('clientId')) : me.id;
  const client = await one<{ name: string }>(`SELECT name FROM users WHERE id = ? AND role = 'client'`, clientId);
  if (!client) throw new HttpError(404, 'Client not found');

  if (!c.req.query('peek')) await run(
    `UPDATE messages SET read_at = ?
     WHERE biz = ? AND client_id = ? AND read_at IS NULL AND ${staff ? 'sender_id = client_id' : 'sender_id != client_id'}`,
    new Date().toISOString(),
    biz,
    clientId,
  );
  const messages = await all(`${MESSAGE_SELECT} WHERE m.biz = ? AND m.client_id = ? ORDER BY m.id`, biz, clientId);
  return c.json({ clientId, clientName: client.name, messages });
});

messagesRouter.post('/', async (c) => {
  const b = z
    .object({ clientId: z.number().int().optional(), body: z.string().trim().min(1, 'cannot be empty').max(4000) })
    .parse(await c.req.json());
  const me = c.get('user');
  const clientId = isStaff(c) ? b.clientId : me.id;
  if (!clientId || !(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client'`, clientId))) {
    throw new HttpError(400, 'Unknown client');
  }
  const { id } = await run(
    `INSERT INTO messages (biz, client_id, sender_id, body) VALUES (?, ?, ?, ?)`,
    c.get('biz'), clientId, me.id, b.body,
  );
  await audit(c, 'send_message', 'message', id, { clientId });
  return c.json(await one(`${MESSAGE_SELECT} WHERE m.id = ?`, id), 201);
});
