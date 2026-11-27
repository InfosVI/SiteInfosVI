/** Vérifie les identifiants de l'API Légifrance (PISTE) sans jamais les afficher. Voir docs/configuration-piste.md */
try { process.loadEnvFile('.env'); } catch { /* configuration fournie par l'environnement */ }

async function main() {
  const id = process.env.PISTE_CLIENT_ID, secret = process.env.PISTE_CLIENT_SECRET;
  if (!id || !secret) { console.log('✗ PISTE_CLIENT_ID ou PISTE_CLIENT_SECRET absent du fichier .env (voir docs/configuration-piste.md)'); process.exit(1); }
  const t = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'openid' }).toString(), signal: AbortSignal.timeout(30_000) });
  if (!t.ok) { console.log(`✗ Jeton refusé (HTTP ${t.status}) : vérifier les identifiants et l'abonnement à l'API Légifrance`); process.exit(1); }
  const { access_token } = await t.json() as { access_token: string };
  console.log('✓ Jeton obtenu');
  const a = await fetch('https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/getArticle', { method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ id: 'LEGIARTI000043238842' }), signal: AbortSignal.timeout(30_000) });
  if (!a.ok) { console.log(`✗ Lecture de l'article refusée (HTTP ${a.status}) : abonnement à l'API Légifrance ou CGU à vérifier`); process.exit(1); }
  const art = (await a.json() as any).article ?? {};
  console.log(`✓ Décret 2000-1159, art. ${art.num} : état ${art.etat}`);
}
main().catch((e) => { console.log(`✗ Erreur réseau : ${e?.message ?? e}`); process.exit(1); });
