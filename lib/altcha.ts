import { createHmac } from 'node:crypto';
import { create, CappedMap, randomInt } from 'altcha-lib/frameworks/nextjs';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';

/**
 * Captcha ALTCHA, hébergé sur le serveur du site (aucun service tiers, aucun cookie).
 * Le navigateur résout un petit calcul (preuve de travail) ; le serveur vérifie la réponse.
 * Placé sur : propositions de valeurs, votes, formulaire de contact.
 */
const secret = (usage: string) =>
  createHmac('sha256', process.env.SESSION_SECRET || 'dev-uniquement-pas-pour-la-production').update(`altcha:${usage}`).digest('base64url');

const dejaUtilisees = new CappedMap({ maxSize: 10_000 });   // une réponse ne sert qu'une fois

export const altcha = create({
  createChallengeParameters: () => ({
    algorithm: 'PBKDF2/SHA-256',
    cost: 1_000,
    counter: randomInt(1_500, 4_000),
    expiresAt: new Date(Date.now() + 10 * 60_000),   // défi valable 10 minutes
  }),
  deriveKey,
  hmacSignatureSecret: secret('signature'),
  hmacKeySignatureSecret: secret('cle'),
  store: dejaUtilisees,
});

/** Vérifie la réponse au captcha envoyée avec un formulaire (champ « altcha ») */
export async function captchaValide(payload: unknown): Promise<boolean> {
  if (typeof payload !== 'string' || !payload || payload.length > 10_000) return false;
  const r = await altcha.verify(payload, deriveKey, secret('signature'), secret('cle'), dejaUtilisees);
  return !r.error && !!r.verification?.verified;
}
