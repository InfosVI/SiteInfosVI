import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROUTES, PAGES } from '../lib/pages';

describe('pages publiques', () => {
  it('le code du site (public/app.js) utilise exactement les mêmes adresses que le serveur (lib/pages.ts)', () => {
    const js = readFileSync('public/app.js', 'utf8');
    const m = js.match(/const ROUTES=(\{[^;]*\});/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(ROUTES);
  });
  it('adresses uniques, titres et descriptions remplis', () => {
    expect(new Set(PAGES.map(p => p.chemin)).size).toBe(PAGES.length);
    for (const p of PAGES) { expect(p.titre.length).toBeGreaterThan(5); expect(p.description.length).toBeGreaterThan(40); expect(p.description.length).toBeLessThanOrEqual(165); }
  });
});
