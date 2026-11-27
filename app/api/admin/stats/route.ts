import { guardAdmin } from '@/lib/admin-api';
import { statistiques, umamiConfigure } from '@/lib/umami';

export const dynamic = 'force-dynamic';

/** Statistiques de visite (module global de l'espace admin) ; lues dans Umami côté serveur */
export async function GET(req: Request) {
  const g = await guardAdmin(req); if (g) return g;
  if (!umamiConfigure()) return Response.json({ error: 'mesure d’audience pas encore installée' }, { status: 503 });
  const periode = new URL(req.url).searchParams.get('period') ?? '30d';
  try { return Response.json(await statistiques(periode)); }
  catch (e) { console.error('Statistiques :', e); return Response.json({ error: 'Umami indisponible' }, { status: 502 }); }
}
