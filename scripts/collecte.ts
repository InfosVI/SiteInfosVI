/**
 * Collecte quotidienne (lancée chaque jour à 16 h 37 UTC par le serveur, conteneur « collecte »).
 * Chaque source est indépendante : une source en panne n'empêche pas les autres.
 */
import { lt } from 'drizzle-orm';
import { migrate } from '../lib/db/migrate';
import { getDb, schema } from '../lib/db';
import { collectBce } from '../lib/collect/bce';
import { collectStatcan } from '../lib/collect/statcan';
import { collectJo } from '../lib/collect/jo';
import { collectLegifrance } from '../lib/collect/legifrance';
import { nettoyerContact } from '../lib/contact';
import { nettoyerPropositions } from '../lib/propositions';

async function main() {
  try { process.loadEnvFile('.env'); } catch { /* sur le serveur, la configuration vient de l'environnement du conteneur */ }
  await migrate();
  const steps: [string, () => Promise<unknown>][] = [['BCE', collectBce], ['Statistique Canada', collectStatcan], ['Journal officiel', collectJo], ['Légifrance', collectLegifrance]];
  for (const [name, fn] of steps) {
    try { await fn(); console.log(`${name} : terminé`); }
    catch (e) { console.error(`${name} : erreur inattendue`, e); }
  }
  // Messages du formulaire de contact : effacés après 60 jours
  await nettoyerContact();
  // Propositions : rejetées depuis plus de 3 mois, en attente depuis plus de 6 mois, 7 au plus par mois + partie + zone
  console.log(`Propositions retirées : ${await nettoyerPropositions()}`);
  // Journal conservé 12 mois
  const db = await getDb() as any;
  await db.delete(schema.journal).where(lt(schema.journal.at, new Date(Date.now() - 365 * 86400_000)));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
