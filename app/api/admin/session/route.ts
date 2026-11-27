import { blockedUntil, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const until = await blockedUntil(req);
  return Response.json({ admin: !until && isAdmin(req), blockedUntil: until?.toISOString() ?? null });
}
