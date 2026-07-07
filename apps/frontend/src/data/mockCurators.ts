export interface Curator {
  id: string;
  name: string;
}

const FALLBACK_CURATORS: Curator[] = [
  { id: 'curator-2', name: 'Dilshod Rahimov' },
  { id: 'curator-3', name: 'Zarina Yoldosheva' },
];

// Joriy tizimga kirgan admin + 2 ta o'ylab topilgan namunaviy o'qituvchi.
// Backend ulanganda bu funksiya xodimlar API'siga almashtiriladi.
export function getMockCurators(currentAdminName?: string | null): Curator[] {
  if (!currentAdminName) return FALLBACK_CURATORS;
  return [{ id: 'curator-1', name: currentAdminName }, ...FALLBACK_CURATORS];
}
