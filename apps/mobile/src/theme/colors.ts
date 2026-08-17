import { DESIGN_TOKENS } from './tokens';

export * from './tokens';

/**
 * Mobile Theme & Glass Helpers
 * Har qanday komponentda theme.glass, theme.bg, theme.card kabi oson ishlatish uchun.
 */
export function getThemeColors(isDark: boolean) {
  const t = isDark ? DESIGN_TOKENS.dark : DESIGN_TOKENS.light;
  return {
    ...DESIGN_TOKENS,
    isDark,
    bg: t.bgApp,
    surface: t.bgSurface,
    card: t.bgCard,
    cardHover: t.bgCardHover,
    border: t.border,
    borderStrong: t.borderStrong,
    text: t.textPrimary,
    textSecondary: t.textSecondary,
    textMuted: t.textMuted,
    primary: DESIGN_TOKENS.brand.primary,
    success: DESIGN_TOKENS.status.success,
    error: DESIGN_TOKENS.status.error,
    warning: DESIGN_TOKENS.status.warning,
    // Easy Glass effect object for React Native Views
    glass: {
      backgroundColor: t.glass,
      borderColor: t.glassBorder,
      borderWidth: 1,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
  };
}
