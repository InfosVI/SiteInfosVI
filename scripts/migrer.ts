/** Applique les migrations de la base (lancé avant chaque mise en ligne, après la sauvegarde) */
import { migrate } from '../lib/db/migrate';

try { process.loadEnvFile('.env'); } catch { /* configuration fournie par l'environnement du conteneur */ }
migrate().then(() => { console.log('Migrations appliquées'); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
