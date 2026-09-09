import { login } from '@/lib/auth';
import { runtime } from '@/lib/runtime';
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Request origin mismatch.' }, { status: 403 });
    const raw = await req.text(); if (raw.length > 1000) throw Error('Request too large.');
    const body = JSON.parse(raw) as { username?: unknown; pin?: unknown };
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': await login(runtime(), req, body.username, body.pin), 'Cache-Control': 'no-store' } });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Could not sign in.' }, { status: 400 }); }
}
