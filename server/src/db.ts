import { env } from 'cloudflare:workers';

type Param = string | number | boolean | null | undefined;

/** D1 rejects `undefined` and booleans; map them to NULL and 0/1. */
const clean = (params: Param[]) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));

export const stmt = (sql: string, ...params: Param[]) => env.DB.prepare(sql).bind(...clean(params));

export const one = <T>(sql: string, ...params: Param[]) => stmt(sql, ...params).first<T>();

export async function all<T>(sql: string, ...params: Param[]) {
  return (await stmt(sql, ...params).all<T>()).results;
}

export async function run(sql: string, ...params: Param[]) {
  const r = await stmt(sql, ...params).run();
  return { id: r.meta.last_row_id, changes: r.meta.changes };
}

/** First column of the first row, e.g. `SELECT COUNT(*) AS v ...`. */
export async function scalar<T = number>(sql: string, ...params: Param[]) {
  return stmt(sql, ...params).first<T>('v');
}
