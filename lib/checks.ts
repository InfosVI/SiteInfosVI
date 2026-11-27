/** Contrôle du type et du format de chaque valeur, avant tout enregistrement (même règles que la maquette) */
export type Check = { c: string; exp: string; got: string; ok: boolean };
const RULE: Record<string, { dec: number; min: number; max: number; per: string }> = {
  fx: { dec: 6, min: 0, max: 1e6, per: 'jour (AAAA-MM-JJ)' },
  cpi: { dec: 1, min: 50, max: 500, per: 'mois (AAAA-MM)' },
  geo: { dec: 2, min: -50, max: 50, per: 'date d’effet (AAAA-MM-01)' },
  geoEur: { dec: 2, min: 0, max: 20000, per: 'mois (AAAA-MM)' },
  fixe: { dec: 2, min: 500, max: 1500, per: 'mois (AAAA-MM)' },
};
const f0 = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export function checkVal(type: keyof typeof RULE, raw: string, perGot: string, perOk: boolean): Check[] {
  const R = RULE[type], s = String(raw), isNum = /^-?\d+(\.\d+)?$/.test(s), dec = (s.split('.')[1] ?? '').length, n = Number(s);
  return [
    { c: 'Type', exp: 'nombre', got: isNum ? 'nombre' : `texte « ${s} »`, ok: isNum },
    { c: 'Format', exp: 'point décimal, ' + (type === 'cpi' ? '1 décimale' : `≤ ${R.dec} décimales`), got: isNum ? `${dec} décimale(s)` : '—', ok: isNum && (type === 'cpi' ? dec === 1 : dec <= R.dec) },
    { c: 'Plage', exp: type === 'fx' ? 'supérieur à 0' : type === 'geo' ? 'entre −50 % et +50 %' : `entre ${f0(R.min)} et ${f0(R.max)}`, got: isNum ? s : '—', ok: isNum && n > R.min && n < R.max },
    { c: 'Date', exp: R.per, got: perGot, ok: perOk },
  ];
}
export const allOk = (c: Check[]) => c.every((x) => x.ok);
