import { envFromProcess, handleGet } from '../server/handlers.js';
import { neonDb } from '../server/neonDb.js';

// GET /api/state: everything the app shows, or { same: true } if nothing changed.
export async function GET(request: Request): Promise<Response> {
  try {
    const r = await handleGet(neonDb(), envFromProcess(), new URL(request.url).searchParams);
    return Response.json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Something went wrong on the server.' }, { status: 500 });
  }
}
