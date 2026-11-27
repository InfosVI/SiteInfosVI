import { describe, it, expect } from 'vitest';
import { reseauTronque } from '../lib/reseau';

describe('réseau d’origine tronqué', () => {
  it('IPv4 : seuls les 2 premiers nombres sont gardés', () => {
    expect(reseauTronque('52.71.183.24')).toBe('52.71.0.0');
    expect(reseauTronque('52.71.183.24, 10.0.0.1')).toBe('52.71.0.0');
    expect(reseauTronque('::ffff:24.200.13.7')).toBe('24.200.0.0');
  });
  it('IPv6 : seuls les 2 premiers groupes sont gardés', () => {
    expect(reseauTronque('2001:db8:85a3:8d3::7334')).toBe('2001:db8::');
    expect(reseauTronque('2001:db8::1')).toBe('2001:db8::');
  });
  it('adresse absente ou invalide : rien', () => {
    expect(reseauTronque('')).toBeNull();
    expect(reseauTronque('pas-une-ip')).toBeNull();
  });
});
