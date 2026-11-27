/**
 * Lecture des statistiques de visite dans Umami (installé sur le serveur, réseau interne).
 * Le site utilise un compte Umami dédié (UMAMI_SITE_UTILISATEUR), distinct du compte de l'administrateur.
 */
const BASE = () => process.env.UMAMI_URL || 'http://umami:3000';
let jeton: { valeur: string; jusqua: number } | null = null;

async function connexion() {
  if (jeton && jeton.jusqua > Date.now()) return jeton.valeur;
  const r = await fetch(`${BASE()}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ username: process.env.UMAMI_SITE_UTILISATEUR, password: process.env.UMAMI_SITE_MDP }),
  });
  if (!r.ok) throw new Error(`connexion Umami refusée (${r.status})`);
  const { token } = await r.json() as { token: string };
  jeton = { valeur: token, jusqua: Date.now() + 6 * 3600_000 };
  return token;
}

async function lire<T>(chemin: string): Promise<T> {
  const tok = await connexion();
  const r = await fetch(`${BASE()}${chemin}`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 401) { jeton = null; return lire(chemin); }
  if (!r.ok) throw new Error(`Umami ${chemin} : ${r.status}`);
  return r.json() as Promise<T>;
}

export const umamiConfigure = () => !!(process.env.UMAMI_WEBSITE_ID && process.env.UMAMI_SITE_UTILISATEUR && process.env.UMAMI_SITE_MDP);

const PERIODES: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90day': 90, '12month': 365 };
type Ligne = { x: string | null; y: number };

/** Statistiques globales du site pour une période (aujourd'hui, 7, 30, 90 jours ou 12 mois) */
export async function statistiques(periode: string) {
  const id = process.env.UMAMI_WEBSITE_ID!;
  const jours = PERIODES[periode] ?? 30;
  const fin = Date.now();
  const debut = jours === 0 ? new Date(new Date().setUTCHours(0, 0, 0, 0)).getTime() : fin - jours * 86400_000;
  const q = `startAt=${debut}&endAt=${fin}&timezone=UTC`;
  const metrique = (type: string, limit = 12) => lire<Ligne[]>(`/api/websites/${id}/metrics?type=${type}&limit=${limit}&${q}`);
  const [stats, titres, entrees, evenements, pays, appareils, origines, navigateurs] = await Promise.all([
    lire<Record<string, any>>(`/api/websites/${id}/stats?${q}&compare=prev`),
    metrique('title', 50), metrique('entry'), metrique('event'), metrique('country'), metrique('device'), metrique('referrer'), metrique('browser'),
  ]);
  // Module = début du titre de la page (« Pouvoir d’achat VI · Historique » → « Pouvoir d’achat VI »)
  const modules = new Map<string, number>();
  for (const t of titres) { const m = (t.x ?? '').includes(' · ') ? (t.x as string).split(' · ')[0] : 'Pages générales (accueil, confidentialité…)'; modules.set(m, (modules.get(m) ?? 0) + t.y); }
  const nomsPays = new Intl.DisplayNames(['fr'], { type: 'region' });
  const APPAREILS: Record<string, string> = { desktop: 'Ordinateur', laptop: 'Ordinateur portable', mobile: 'Téléphone', tablet: 'Tablette' };
  return {
    periode, stats,
    modules: [...modules].map(([x, y]) => ({ x, y })).sort((a, b) => b.y - a.y),
    pages: titres.slice(0, 15),
    entries: entrees,
    events: evenements,
    countries: pays.map((p) => ({ x: p.x ? (nomsPays.of(p.x) ?? p.x) : null, y: p.y })),
    devices: appareils.map((a) => ({ x: a.x ? (APPAREILS[a.x] ?? a.x) : null, y: a.y })),
    referrers: origines, browsers: navigateurs,
  };
}
