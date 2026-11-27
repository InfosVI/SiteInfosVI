/** Premier mois du trimestre : « 2026-11 » → « 2026-10 » */
export const quarterStart = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${y}-${String(Math.floor((mm - 1) / 3) * 3 + 1).padStart(2, '0')}`; };

/** Ajoute k mois : addMonths('2026-11', 2) → « 2027-01 » */
export const addMonths = (m: string, k: number) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + (mm - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
