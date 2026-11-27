import { lt } from 'drizzle-orm';
import { getDb, schema } from './db';

export const CONSERVATION_JOURS = 60, DELAI_H = 12, MAX_TEXTE = 1000;

/** Efface les messages de plus de 60 jours et les limites d'envoi de plus de 12 h */
export async function nettoyerContact() {
  const db = await getDb() as any;
  await db.delete(schema.messages).where(lt(schema.messages.at, new Date(Date.now() - CONSERVATION_JOURS * 86400_000)));
  await db.delete(schema.contactLimites).where(lt(schema.contactLimites.at, new Date(Date.now() - DELAI_H * 3600_000)));
}

/**
 * Nettoyage du texte reçu : retire les caractères de contrôle invisibles (sauf retours à la ligne et tabulations),
 * normalise les retours à la ligne. Le texte n'est jamais interprété comme du HTML ni comme une commande :
 * enregistré tel quel par requête paramétrée, et affiché échappé dans l'espace admin.
 */
export const nettoyerTexte = (s: string) =>
  s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
