export const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (r: number | null | undefined, d = 2) =>
  r == null || !isFinite(r) ? '—' : (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r * 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';

/** « nov. (11) 2026 » */
export const mlabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTHS_FR[+mm - 1]} (${mm}) ${y}`; };
/** « 01/11/2026 » */
export const d1 = (m: string) => { const [y, mm] = m.split('-'); return `01/${mm}/${y}`; };
/** « 2026-11-25 » → « 25/11/2026 » */
export const fmtDay = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };

export const quarterStart = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${y}-${String(Math.floor((mm - 1) / 3) * 3 + 1).padStart(2, '0')}`; };
export const addMonths = (m: string, k: number) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + (mm - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

export const titleCase = (z: string) => z.toLowerCase().replace(/(^|[\s(,-])([^\s(,-])/g, (_m, a, b) => a + b.toUpperCase());

/** Libellés lisibles pour les zones canadiennes ; sinon mise en forme du nom officiel */
const LABELS: Record<string, string> = {
  'CANADA (AUTRES VILLES)': 'Montréal et villes francophones',
  'CANADA (OTTAWA, MONCTON)': 'Ottawa, Moncton',
  'CANADA (TORONTO)': 'Toronto et villes anglophones',
  'CANADA (VANCOUVER)': 'Vancouver',
};
export const zoneLabel = (z: string) => LABELS[z] ?? titleCase(z);
export const DEFAULT_ZONE = 'CANADA (AUTRES VILLES)';
export const legifrance = (id: string) => id.startsWith('LEGIARTI') ? `https://www.legifrance.gouv.fr/loda/article_lc/${id}` : `https://www.legifrance.gouv.fr/jorf/id/${id}`;

/** Étiquette de fiabilité d'une part géographique */
const FIAB: Record<string, [string, string]> = {
  'base officielle': ['Officiel', 'ok'], derogatoire: ['Officiel', 'ok'], verifie: ['Vérifié', 'ok'], 'bareme VIE annuel': ['Officiel', 'ok'],
  calcule: ['Calculé', ''], 'calcule depuis base 2026': ['Calculé', ''], reconstitue: ['Reconstitué', 'mid'], deduit: ['Déduit', 'mid'],
  'identique VIA': ['Identique VIA', ''], manquant: ['Manquant', 'mid'],
};
export const fiab = (s: string) => FIAB[s.split(' (')[0]] ?? [s, ''];

