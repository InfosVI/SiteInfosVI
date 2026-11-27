import * as schema from './schema';

/**
 * Connexion à la base :
 * - avec DATABASE_URL (serveur, conteneur `base`) : vrai PostgreSQL ;
 * - sans DATABASE_URL (poste de développement) : PostgreSQL embarqué (PGlite) dans le dossier .data/.
 */
async function connect() {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { Pool } = await import('pg');
    return drizzle(new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }), { schema });
  }
  const { drizzle } = await import('drizzle-orm/pglite');
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync } = await import('node:fs');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  mkdirSync(dir, { recursive: true });
  return drizzle(new PGlite(dir), { schema });
}

type DB = Awaited<ReturnType<typeof connect>>;
const g = globalThis as unknown as { __db?: Promise<DB> };
export const getDb = () => (g.__db ??= connect());
export { schema };
