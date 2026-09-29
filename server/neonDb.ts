import { neon } from '@neondatabase/serverless';
import type { Db } from './db.js';

let cached: Db | null = null;

/** Talks to Neon over HTTPS. Uses the DATABASE_URL environment variable. */
export function neonDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const sql = neon(url);
  cached = {
    async tx(stmts, opts = {}) {
      return (await sql.transaction(
        stmts.map(([text, params]) => sql.query(text, params ?? [])),
        { readOnly: !!opts.readOnly },
      )) as Record<string, unknown>[][];
    },
  };
  return cached;
}
