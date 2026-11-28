import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Base embarquée vide, propre à ce test
process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'propositions-'));

describe('limite des 12 h : par type de valeur, zone et date', () => {
  let P: typeof import('../lib/propositions'), db: any, schema: typeof import('../lib/db').schema;
  const cles = { votant: 'c:aaa', reseau: 'n:bbb' }, autre = { votant: 'c:zzz', reseau: 'n:yyy' };
  beforeAll(async () => {
    await (await import('../lib/db/migrate')).migrate();
    P = await import('../lib/propositions');
    const m = await import('../lib/db'); db = await m.getDb(); schema = m.schema;
    await db.insert(schema.contactLimites).values(P.clesLimite('geo', 'CANADA (AUTRES VILLES)', '2026-10', cles).map(cle => ({ cle })));
  }, 60_000);

  it('la zone proposée est signalée, avec l’heure de la prochaine proposition', async () => {
    const d = await P.dejaProposees(cles);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ type: 'geo', z: 'CANADA (AUTRES VILLES)', eff: '2026-10' });
    expect(new Date(d[0].prochain).getTime() - Date.now()).toBeGreaterThan(11.9 * 3600_000);
  });
  it('les autres zones, les autres dates et la part fixe restent ouvertes', async () => {
    const d = await P.dejaProposees(cles);
    expect(d.some(x => x.z === 'CANADA (AUTRES VILLES)' && x.eff === '2027-01')).toBe(false);
    expect(d.some(x => x.z === 'MONTREAL')).toBe(false);
    expect(d.some(x => x.type === 'fixe')).toBe(false);
  });
  it('le même réseau (autre navigateur) est aussi limité, pas un autre visiteur', async () => {
    expect(await P.dejaProposees({ votant: 'c:nouveau', reseau: cles.reseau })).toHaveLength(1);
    expect(await P.dejaProposees(autre)).toHaveLength(0);
  });
  it('après la part fixe, deux limites distinctes', async () => {
    await db.insert(schema.contactLimites).values(P.clesLimite('fixe', 'TOUTES', '2026-11', cles).map(cle => ({ cle })));
    const d = await P.dejaProposees(cles);
    expect(d.map(x => x.type).sort()).toEqual(['fixe', 'geo']);
  });
});
