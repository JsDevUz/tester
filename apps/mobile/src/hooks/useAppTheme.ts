import { useColorScheme } from 'react-native';
import { getThemeColors } from '../theme/colors';

/**
 * useAppTheme() Hook
 * Foydalanish:
 * const theme = useAppTheme();
 * <View style={[theme.glass, { padding: 16 }]} />
 */
export function useAppTheme(overrideIsDark?: boolean) {
  const systemScheme = useColorScheme();
  const isDark = overrideIsDark ?? systemScheme === 'dark';
  return getThemeColors(isDark);
}
