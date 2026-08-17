export * from './tokens';

/**
 * Utility to get color token by key or theme mode
 */
import { DESIGN_TOKENS } from './tokens';

export function getThemeTokens(isDark: boolean) {
  return isDark ? DESIGN_TOKENS.dark : DESIGN_TOKENS.light;
}
