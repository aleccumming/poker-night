import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from './db.js';

/** A real Postgres running inside Node, for local development and tests. Never used in production. */
export function pgliteDb(dataDir?: string): Db {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  return {
    async tx(stmts) {
      return pg.transaction(async (t) => {
        const out: Record<string, unknown>[][] = [];
        for (const [text, params] of stmts) out.push((await t.query<Record<string, unknown>>(text, params ?? [])).rows);
        return out;
      });
    },
  };
}
