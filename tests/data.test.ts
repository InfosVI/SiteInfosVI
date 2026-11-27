import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../lib/csv';

const read = (f: string) => parseCsv(readFileSync(`data/${f}`, 'utf8'));

describe('lecteur CSV', () => {
  it('gère guillemets, séparateur et BOM', () => {
    const r = parseCsv('﻿"a";"b"\r\n"x;1";"dit ""ok"""\n');
    expect(r).toEqual([{ a: 'x;1', b: 'dit "ok"' }]);
  });
});

describe('données publiques de départ', () => {
  const geo = read('indemnite-part-geo-trimestrielle.csv');
  const at = (zone: string, q: string) => geo.find((r) => r.zone === zone && r.trimestre === q);

  it('Montréal, part géographique au 1er oct. 2026 (arrêté du 15/09/2026)', () => {
    expect(at('CANADA (AUTRES VILLES)', '2026-10-01')?.via_part_geo).toBe('1876.41');
  });
  it('part fixe en vigueur depuis le 1er janv. 2024 = 772,87 € (vérifiée par l’API Légifrance le 25/11/2026)', () => {
    const pf = read('part-fixe.csv').find((r) => r.date_effet === '2024-01-01');
    expect(pf?.part_fixe_tronquee).toBe('772.87');
    expect(pf?.indice_majore).toBe('314');
  });
  it('indice des prix de Montréal, oct. 2026 = 171,6 (Statistique Canada)', () => {
    expect(read('cout-vie-mensuel.csv').find((r) => r.zone === 'CANADA (AUTRES VILLES)' && r.mois === '2026-10')?.indice).toBe('171.6');
  });
  it('aucune valeur inventée : une case « manquant » reste vide', () => {
    for (const r of geo) for (const m of ['vie', 'via']) if (r[`${m}_statut`].startsWith('manquant')) expect(r[`${m}_part_geo`]).toBe('');
  });
  it('toutes les valeurs présentes sont des nombres à 2 décimales au plus', () => {
    for (const r of geo) for (const m of ['vie', 'via']) { const v = r[`${m}_part_geo`]; if (v) expect(v).toMatch(/^\d+(\.\d{1,2})?$/); }
  });
});
