import { manifestFor } from '../server/manifest.js';

// GET /api/manifest?g=<code>: the install manifest for that group link.
export function GET(request: Request): Response {
  const g = new URL(request.url).searchParams.get('g');
  return new Response(JSON.stringify(manifestFor(g)), {
    headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' },
  });
}
