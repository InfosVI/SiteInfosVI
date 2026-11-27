import { getDb } from './index';

/** Applique les fichiers de migration (création / évolution des tables) */
export async function migrate() {
  const db = await getDb();
  const folder = { migrationsFolder: 'lib/db/migrations' };
  if (process.env.DATABASE_URL) {
    const { migrate: m } = await import('drizzle-orm/node-postgres/migrator');
    await m(db as never, folder);
  } else {
    const { migrate: m } = await import('drizzle-orm/pglite/migrator');
    await m(db as never, folder);
  }
}
