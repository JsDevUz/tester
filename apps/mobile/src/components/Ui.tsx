import React from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View, type PressableProps, type TextInputProps} from 'react-native';
import {WifiOff} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNetwork} from '../providers/NetworkProvider';

export function Screen({children, className = ''}: {children: React.ReactNode; className?: string}) {
  return <View className={`flex-1 bg-canvas dark:bg-dark-canvas ${className}`}>{children}</View>;
}

export function Header({title, subtitle}: {title: string; subtitle?: string}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{paddingTop: insets.top + 20}} className="bg-white px-5 pb-4 dark:bg-dark-canvas">
      <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm text-slate-400 dark:text-dark-muted">{subtitle}</Text> : null}
    </View>
  );
}

export function OfflineBanner() {
  const {online} = useNetwork();
  if (online) return null;
  return (
    <View className="flex-row items-center justify-center gap-2 bg-amber-100 px-3 py-2">
      <WifiOff size={15} color="#92400e" />
      <Text className="text-xs font-semibold text-amber-800">Offline — saqlangan ma'lumotlar ko'rsatilmoqda</Text>
    </View>
  );
}

export function Button({
  title,
  loading,
  className = '',
  disabled,
  ...props
}: PressableProps & {title: string; loading?: boolean; className?: string}) {
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      className={`min-h-12 items-center justify-center rounded-2xl bg-brand px-5 active:opacity-80 disabled:opacity-40 ${className}`}>
      {loading ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">{title}</Text>}
    </Pressable>
  );
}

export function Empty({text}: {text: string}) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="text-center text-sm text-slate-400 dark:text-dark-muted">{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas py-20 dark:bg-dark-canvas">
      <ActivityIndicator color="#6366f1" />
    </View>
  );
}

export function StaleNote({stale}: {stale: boolean}) {
  return stale ? (
    <Text className="px-5 py-2 text-xs text-amber-700 dark:text-amber-500">Oxirgi online holat ko'rsatilmoqda</Text>
  ) : null;
}

export const Input = React.forwardRef<
  TextInput,
  TextInputProps & {containerClassName?: string; variant?: 'default' | 'surface' | 'slate'}
>(({containerClassName = '', variant = 'default', style, className = '', ...props}, ref) => {
  const bgClass =
    variant === 'surface'
      ? 'bg-slate-50 border-slate-200 dark:bg-dark-surface dark:border-dark-border'
      : variant === 'slate'
      ? 'bg-slate-100 border-transparent dark:bg-dark-surface-2'
      : 'bg-slate-100 border-slate-200/60 dark:bg-dark-surface-2 dark:border-dark-border';

  return (
    <View
      className={`h-12 w-full flex-row items-center rounded-2xl border px-4 ${bgClass} ${containerClassName}`}>
      <TextInput
        ref={ref}
        placeholderTextColor={props.placeholderTextColor ?? '#94a3b8'}
        style={[
          {
            flex: 1,
            height: '100%',
            paddingVertical: 0,
            fontSize: 14,
            includeFontPadding: false,
          },
          style,
        ]}
        className={`text-sm text-ink dark:text-dark-ink ${className}`}
        {...props}
      />
    </View>
  );
});
Input.displayName = 'Input';
