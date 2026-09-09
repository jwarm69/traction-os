import { headers } from 'next/headers';
import Workspace from './workspace';
import Login from './login';
import { authenticateRequest } from '@/lib/auth';
import { runtime } from '@/lib/runtime';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const requestHeaders = await headers();
  const request = new Request('https://traction.local/', { headers: requestHeaders });
  const user = await authenticateRequest(runtime(), request);
  return user ? <Workspace username={user.username} /> : <Login />;
}
