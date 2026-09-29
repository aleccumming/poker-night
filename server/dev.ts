import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from './db.js';
import { envFromProcess, handleGet, handlePost, type Env } from './handlers.js';

// Serves /api/* inside `npm run dev`, the same way Vercel will in production.
// Uses Neon if DATABASE_URL is set, otherwise a local database in the .data folder.

// Kept on globalThis so editing server code (which reloads this module) doesn't open the local database twice.
const g = globalThis as { __pokerDb?: Promise<Db> };
function getDb(): Promise<Db> {
  g.__pokerDb ??= process.env.DATABASE_URL
    ? import('./neonDb.js').then((m) => m.neonDb())
    : import('./pgliteDb.js').then((m) => m.pgliteDb('.data/pglite'));
  return g.__pokerDb;
}

// Without a real database, /g/dev works out of the box. With Neon, GROUP_CODE is required.
function env(): Env {
  if (process.env.DATABASE_URL) return envFromProcess();
  return { groupCode: process.env.GROUP_CODE || 'dev' };
}

export async function devHandle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    let reply;
    if (url.pathname === '/api/manifest') {
      const { manifestFor } = await import('./manifest.js');
      reply = { status: 200, body: manifestFor(url.searchParams.get('g')) };
    } else if (url.pathname === '/api/state' && req.method === 'GET') {
      reply = await handleGet(await getDb(), env(), url.searchParams);
    } else if (url.pathname === '/api/action' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      reply = await handlePost(await getDb(), env(), body);
    } else {
      reply = { status: 404, body: { error: 'Not found' } };
    }
    res.statusCode = reply.status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(reply.body));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Something went wrong on the server.' }));
  }
}
