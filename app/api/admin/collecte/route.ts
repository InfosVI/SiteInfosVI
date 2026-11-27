import { z } from 'zod';
import { guardAdmin, sameOrigin } from '@/lib/admin-api';
import { avecAuteur } from '@/lib/collect/core';
import { collectBce } from '@/lib/collect/bce';
import { collectStatcan } from '@/lib/collect/statcan';
import { collectJo } from '@/lib/collect/jo';
import { collectLegifrance } from '@/lib/collect/legifrance';
import { resetExportCache } from '@/lib/export';

export const dynamic = 'force-dynamic';

const Body = z.object({ quoi: z.enum(['jo', 'eco']) });
const ETAPES = {
  jo: [['Journal officiel', collectJo], ['Légifrance', collectLegifrance]],
  eco: [['BCE', collectBce], ['Statistique Canada', collectStatcan]],
} as const;
let enCours = false;   // un seul import à la fois

/** Imports lancés à la main depuis l'espace admin : même collecte que celle de 16 h 37 UTC, résultat dans le journal */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'origine refusée' }, { status: 403 });
  const g = await guardAdmin(req); if (g) return g;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'requête invalide' }, { status: 400 });
  if (enCours) return Response.json({ error: 'un import est déjà en cours' }, { status: 409 });
  enCours = true;
  const resultats: { source: string; ok: boolean; erreur?: string }[] = [];
  try {
    await avecAuteur('Import manuel (admin)', async () => {
      for (const [source, fn] of ETAPES[p.data.quoi]) {
        try {
          // Chaque requête est notée dans le journal ; un échec y est marqué « fail » avec sa cause
          const echec = ([await fn()].flat() as { status?: string; err?: string | null }[]).find(x => x?.status === 'fail');
          resultats.push(echec ? { source, ok: false, erreur: echec.err ?? 'échec' } : { source, ok: true });
        } catch (e) { console.error(`Import ${source} :`, e); resultats.push({ source, ok: false, erreur: 'erreur inattendue' }); }
      }
    });
  } finally { enCours = false; resetExportCache(); }
  return Response.json({ resultats });
}
