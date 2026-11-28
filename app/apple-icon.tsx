import { ImageResponse } from 'next/og';

/** Icône quand le site est ajouté à l'écran d'accueil d'un téléphone */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#2457c5', color: '#fff', fontSize: 120, fontWeight: 700 }}>€</div>,
    size,
  );
}
