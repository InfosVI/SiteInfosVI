import { ImageResponse } from 'next/og';
import { reglagesSite } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const alt = 'Indemnité et pouvoir d’achat des volontaires internationaux';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Image affichée quand un lien du site est partagé (réseaux sociaux, messageries) */
export default function Image() {
  const site = reglagesSite();
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80,
      background: '#0f172a', color: '#f1f5f9', fontSize: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ width: 88, height: 88, borderRadius: 18, background: '#8fb3e8', color: '#0f172a', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 56, fontWeight: 700 }}>€</div>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{site.nom}</div>
      </div>
      <div style={{ marginTop: 40, fontSize: 46, lineHeight: 1.25 }}>Indemnité VIE / VIA et pouvoir d’achat des volontaires internationaux</div>
      <div style={{ marginTop: 28, fontSize: 30, color: '#94a3b8' }}>Montants par pays · évolution · données publiques (Journal officiel, BCE)</div>
    </div>,
    size,
  );
}
