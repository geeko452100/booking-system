import { Hono } from 'hono';
import { z } from 'zod';
import { all, one, run } from '../db.js';
import { audit } from '../lib/audit.js';
import { isStaff, requireRole, type AppEnv } from '../lib/auth.js';
import { HttpError, parseId } from '../lib/http.js';

/**
 * Document exchange between the firm and its clients. This is a demo, so only a file's name and
 * size are recorded — its contents never leave the browser.
 */
export const documentsRouter = new Hono<AppEnv>();

const categorySchema = z.enum(['identification', 'contract', 'evidence', 'court_filing', 'correspondence', 'financial', 'other']);
const statusSchema = z.enum(['requested', 'received', 'reviewed', 'shared']);
const fileSchema = {
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0).max(1e10),
};

export const DOCUMENT_SELECT = `
  SELECT d.id, d.client_id AS clientId, c.name AS clientName, d.matter_id AS matterId, m.title AS matterTitle,
         d.name, d.category, d.status, d.file_name AS fileName, d.size_bytes AS sizeBytes, d.note,
         u.name AS createdByName, d.uploaded_at AS uploadedAt, d.created_at AS createdAt
  FROM documents d
  JOIN users c ON c.id = d.client_id
  LEFT JOIN matters m ON m.id = d.matter_id
  LEFT JOIN users u ON u.id = d.created_by`;

const getDocument = (id: number) => one(`${DOCUMENT_SELECT} WHERE d.id = ?`, id);

documentsRouter.get('/', async (c) => {
  const q = z
    .object({ clientId: z.coerce.number().int().optional(), status: statusSchema.optional(), q: z.string().trim().optional() })
    .parse(c.req.query());
  const where: string[] = [];
  const params: (string | number)[] = [];
  const clientId = isStaff(c) ? q.clientId : c.get('user').id;
  if (clientId) {
    where.push('d.client_id = ?');
    params.push(clientId);
  }
  if (q.status) {
    where.push('d.status = ?');
    params.push(q.status);
  }
  if (q.q) {
    where.push('(c.name LIKE ? OR d.name LIKE ? OR d.file_name LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
  }
  return c.json(
    await all(
      `${DOCUMENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY d.status != 'requested', COALESCE(d.uploaded_at, d.created_at) DESC LIMIT 1000`,
      ...params,
    ),
  );
});

async function assertMatter(matterId: number | null | undefined, clientId: number) {
  if (matterId == null) return;
  const m = await one<{ client_id: number }>('SELECT client_id FROM matters WHERE id = ?', matterId);
  if (!m || m.client_id !== clientId) throw new HttpError(400, 'That matter does not belong to this client');
}

/** Staff ask a client for a document. */
documentsRouter.post('/requests', requireRole('admin', 'staff'), async (c) => {
  const b = z
    .object({
      clientId: z.number().int(),
      matterId: z.number().int().nullable().optional(),
      name: z.string().trim().min(1).max(150),
      category: categorySchema,
      note: z.string().trim().max(500).optional(),
    })
    .parse(await c.req.json());
  if (!(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client'`, b.clientId))) throw new HttpError(400, 'Unknown client');
  await assertMatter(b.matterId, b.clientId);
  const { id } = await run(
    `INSERT INTO documents (client_id, matter_id, name, category, status, note, created_by) VALUES (?, ?, ?, ?, 'requested', ?, ?)`,
    b.clientId, b.matterId ?? null, b.name, b.category, b.note || null, c.get('user').id,
  );
  await audit(c, 'request_document', 'document', id, { clientId: b.clientId, name: b.name });
  return c.json(await getDocument(id), 201);
});

/**
 * Upload a file. Clients upload to the firm (optionally answering a request); staff share a file
 * with a client.
 */
documentsRouter.post('/', async (c) => {
  const b = z
    .object({
      requestId: z.number().int().optional(),
      clientId: z.number().int().optional(),
      matterId: z.number().int().nullable().optional(),
      name: z.string().trim().min(1).max(150).optional(),
      category: categorySchema.default('other'),
      note: z.string().trim().max(500).optional(),
      ...fileSchema,
    })
    .parse(await c.req.json());
  const me = c.get('user');
  const staff = isStaff(c);
  const now = new Date().toISOString();

  if (b.requestId) {
    if (staff) throw new HttpError(400, 'Only the client can answer a document request');
    const { changes } = await run(
      `UPDATE documents SET status = 'received', file_name = ?, size_bytes = ?, uploaded_at = ?
       WHERE id = ? AND client_id = ? AND status = 'requested'`,
      b.fileName, b.sizeBytes, now, b.requestId, me.id,
    );
    if (!changes) throw new HttpError(404, 'That request was not found or has already been answered');
    await audit(c, 'upload_document', 'document', b.requestId, { fileName: b.fileName });
    return c.json(await getDocument(b.requestId), 201);
  }

  const clientId = staff ? b.clientId : me.id;
  if (!clientId) throw new HttpError(400, 'clientId is required');
  if (staff && !(await one(`SELECT 1 FROM users WHERE id = ? AND role = 'client'`, clientId))) {
    throw new HttpError(400, 'Unknown client');
  }
  await assertMatter(b.matterId, clientId);
  const { id } = await run(
    `INSERT INTO documents (client_id, matter_id, name, category, status, file_name, size_bytes, note, created_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    clientId, b.matterId ?? null, b.name || b.fileName, b.category, staff ? 'shared' : 'received',
    b.fileName, b.sizeBytes, b.note || null, me.id, now,
  );
  await audit(c, staff ? 'share_document' : 'upload_document', 'document', id, { clientId, fileName: b.fileName });
  return c.json(await getDocument(id), 201);
});

/** Staff mark an upload as reviewed, or send it back to "requested" to ask for it again. */
documentsRouter.patch('/:id', requireRole('admin', 'staff'), async (c) => {
  const id = parseId(c.req.param('id'));
  const { status, note } = z
    .object({ status: z.enum(['reviewed', 'requested']), note: z.string().trim().max(500).optional() })
    .parse(await c.req.json());
  const doc = await one<{ status: string }>('SELECT status FROM documents WHERE id = ?', id);
  if (!doc) throw new HttpError(404, 'Document not found');
  if (doc.status !== 'received' && doc.status !== 'reviewed') throw new HttpError(400, 'Only client uploads can be reviewed');

  await run(
    `UPDATE documents SET status = ?, note = COALESCE(?, note),
       file_name = CASE WHEN ? = 'requested' THEN NULL ELSE file_name END,
       size_bytes = CASE WHEN ? = 'requested' THEN NULL ELSE size_bytes END,
       uploaded_at = CASE WHEN ? = 'requested' THEN NULL ELSE uploaded_at END
     WHERE id = ?`,
    status, note || null, status, status, status, id,
  );
  await audit(c, status === 'reviewed' ? 'review_document' : 'rerequest_document', 'document', id);
  return c.json(await getDocument(id));
});
