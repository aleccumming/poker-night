import { envFromProcess, handlePost } from '../server/handlers.js';
import { neonDb } from '../server/neonDb.js';

// POST /api/action: make one change (or check the host PIN).
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const r = await handlePost(neonDb(), envFromProcess(), body);
    return Response.json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Something went wrong on the server.' }, { status: 500 });
  }
}
