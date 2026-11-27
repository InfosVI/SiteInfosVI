import { describe, it, expect } from 'vitest';
import { nettoyerTexte } from '../lib/contact';

describe('formulaire de contact : nettoyage du texte', () => {
  it('retire les caractères de contrôle et invisibles, garde les retours à la ligne', () => {
    expect(nettoyerTexte('  Bonjour\u0000\u0007 ‮test\r\nligne 2​  ')).toBe('Bonjour test\nligne 2');
  });
  it('laisse le texte tel quel (le HTML n’est jamais interprété, il est échappé à l’affichage)', () => {
    expect(nettoyerTexte("<script>alert(1)</script> ' OR 1=1; --")).toBe("<script>alert(1)</script> ' OR 1=1; --");
  });
});
