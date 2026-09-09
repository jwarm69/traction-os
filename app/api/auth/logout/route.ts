import { clearSessionCookie, logout } from '@/lib/auth';
import { runtime } from '@/lib/runtime';
export async function POST(req: Request) {
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Request origin mismatch.' }, { status: 403 });
  await logout(runtime(), req);
  return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': clearSessionCookie() } });
}
