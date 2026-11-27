import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTable, parseEffet, normZone, TITLE_RX } from '../lib/collect/jo';
import { majoreDe244, traitementDe } from '../lib/collect/legifrance';
import { checkVal, allOk } from '../lib/checks';

describe('Journal officiel : arrêté du 15/09/2026 (fichier réel)', () => {
  const annexe = readFileSync('tests/fixtures/arrete-2026-09-15-annexe.xml', 'utf8');
  const rows = parseTable(annexe);
  it('lit une ligne par zone', () => { expect(rows.length).toBeGreaterThan(200); });
  it('lit les pourcentages exacts', () => {
    const get = (z: string) => rows.find((r) => normZone(r.zone) === z)?.raw;
    expect(get('ALBANIE')).toBe('1.92');
    expect(get('AFRIQUE DU SUD (AUTRES VILLES)')).toBe('-0.55');
    expect(get('AFGHANISTAN')).toBe('0.00');
  });
  it('lit la date d’effet', () => {
    expect(parseEffet(readFileSync('tests/fixtures/arrete-2026-09-15-vigueur.xml', 'utf8'))).toBe('2026-10-01');
  });
  it('reconnaît le titre de l’arrêté trimestriel', () => {
    expect(TITLE_RX.test("Arrêté du 15 septembre 2026 fixant par pays les taux de l'indemnité d'expatriation")).toBe(true);
    expect(TITLE_RX.test("Arrêté du 9 mars 2026 fixant par pays et par groupe les taux de l'indemnité")).toBe(true);
  });
  it('Montréal : 1 860,05 × (1 + 0,88 %) tronqué = 1 876,41', () => {
    expect(Math.floor(Math.round(1860.05 * 1.0088 * 1e6) / 1e4) / 100).toBe(1876.41);
  });
});

describe('Légifrance : calcul de la part fixe', () => {
  it('lit le barème A par paires et le barème B', () => {
    expect(majoreDe244('BARÈME A INDICES BRUTS INDICES MAJORÉS 242 312 243 313 244 314 245 315')).toBe(314);
    expect(traitementDe('INDICES majorés TRAITEMENTS 313 18 489,98 314 18 549,05 315 18 608,13', 314)).toBe(18549.05);
    expect(Math.floor(18549.05 / 24 * 100 + 1e-9) / 100).toBe(772.87);
  });
});

describe('contrôle du type et du format', () => {
  it('refuse 3 décimales pour un montant', () => { expect(allOk(checkVal('geoEur', '1889.735', '2026-10', true))).toBe(false); });
  it('accepte un cours BCE', () => { expect(allOk(checkVal('fx', '1.5707', '2026-11-24', true))).toBe(true); });
  it('refuse un texte', () => { expect(allOk(checkVal('cpi', 'NaN', '2026-10', true))).toBe(false); });
});
