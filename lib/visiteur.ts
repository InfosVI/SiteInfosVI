import { clientKeys, clesLimite, idCookie } from './auth';

/** Empreintes du visiteur (cookie et réseau hachés) ; pose le cookie technique s'il n'existe pas encore */
export function visiteur(req: Request) {
  const k = clientKeys(req), [votant, reseau] = clesLimite(req, k.cookieId), headers = new Headers();
  if (k.isNew) headers.append('Set-Cookie', idCookie(k.cookieId));
  return { cles: { votant, reseau }, headers };
}
