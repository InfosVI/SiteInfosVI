import { buildExports } from '@/lib/export';
import { blockedUntil, blockedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const until = await blockedUntil(req); if (until) return blockedResponse(until);
  const { data } = await buildExports();
  return Response.json(data, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
