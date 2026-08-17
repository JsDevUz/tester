/**
 * Global Design Tokens for Mobile App
 * Barcha ranglar yagona markazda #ffffff shaklida boshqariladi.
 */
export const DESIGN_TOKENS = {
  // Brand & Accent (Indigo)
  brand: {
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    primaryActive: '#4338ca',
    primaryLight: '#eef2ff',
    primaryGlow: 'rgba(99, 102, 241, 0.25)',
  },

  // Dark Theme Palette
  dark: {
    bgApp: '#121316',
    bgSurface: '#30313a',
    bgCard: '#30313a',
    bgCardHover: '#3a3c46',
    bgActive: '#454754',
    border: 'transparent',
    borderStrong: 'transparent',
    textPrimary: '#ffffff',
    textSecondary: '#e2e8f0',
    textMuted: '#cbd5e1',
    glass: 'rgba(48, 49, 58, 0.70)',
    glassCard: 'rgba(48, 49, 58, 0.90)',
    glassPanel: 'rgba(48, 49, 58, 0.98)',
    glassBorder: 'transparent',
    glassShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.35)',
  },

  // Light Theme Palette
  light: {
    bgApp: '#f8fafc',
    bgSurface: '#ffffff',
    bgCard: '#f1f5f9',
    bgCardHover: '#e2e8f0',
    bgActive: '#cbd5e1',
    border: 'transparent',
    borderStrong: 'transparent',
    textPrimary: '#000000',
    textSecondary: '#1e293b',
    textMuted: '#475569',
    glass: 'rgba(255, 255, 255, 0.72)',
    glassCard: 'rgba(255, 255, 255, 0.86)',
    glassPanel: 'rgba(255, 255, 255, 0.95)',
    glassBorder: 'transparent',
    glassShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.06)',
  },

  // Semantic Status Colors
  status: {
    success: '#10b981',
    successBg: '#ecfdf5',
    warning: '#f59e0b',
    warningBg: '#fffbeb',
    error: '#ef4444',
    errorBg: '#fef2f2',
    info: '#3b82f6',
    infoBg: '#eff6ff',
  },

  // Grayscale & Neutrals
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },

  // Whiteboard / Annotation Tools
  whiteboard: {
    penBlack: '#000000',
    penWhite: '#ffffff',
    penRed: '#ef4444',
    penBlue: '#3b82f6',
    penGreen: '#10b981',
    penYellow: '#f59e0b',
    penPurple: '#8b5cf6',
    penPink: '#ec4899',
    penCyan: '#06b6d4',
    penOrange: '#f97316',
  },

  // Common Avatar Colors
  avatar: [
    '#e67700',
    '#087f5b',
    '#1971c2',
    '#5f3dc4',
    '#c2255c',
    '#2f9e44',
    '#1864ab',
    '#862e9c',
    '#d9480f',
    '#099268',
    '#1098ad',
    '#ae3ec9',
  ],
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
