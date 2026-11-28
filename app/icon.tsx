import { ImageResponse } from 'next/og';

/** Icône du site (onglet du navigateur, résultats de Google) : carré bleu avec « € », en PNG carré de 192 px */
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#2457c5', borderRadius: 42, color: '#fff', fontSize: 128, fontWeight: 700 }}>€</div>,
    size,
  );
}
