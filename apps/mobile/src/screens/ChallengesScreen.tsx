import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen, CheckCircle2, FileText, Focus, Languages, Mic, Radio } from 'lucide-react-native';
import { Header, Screen } from '../components/Ui';
import type { RootStackParamList } from '../navigation/types';

export function ChallengesScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  return (
    <Screen>
      <Header title="Jamm" subtitle="Bilim va musobaqalar markazi" />
      <View className="gap-3 p-4">
        <HubCard
          icon={<BookOpen size={22} color="#6366f1" />}
          title="Challenge-lar"
          subtitle="Kitobxonlik va so'z yodlash"
          onPress={() => navigation.navigate('ChallengesList')}
        />
        <HubCard
          icon={<Radio size={22} color="#ef4444" />}
          title="Jonli Musobaqalar"
          subtitle="Real vaqtda musobaqa"
          onPress={() => navigation.navigate('Live')}
        />
        <HubCard
          icon={<FileText size={22} color="#10b981" />}
          title="Mening testlarim"
          subtitle="O'z testlaringizni tuzing"
          onPress={() => navigation.navigate('MyTests')}
        />
        <HubCard
          icon={<Languages size={22} color="#f59e0b" />}
          title="Mening lug'atlarim"
          subtitle="O'z lug'atlaringizni tuzing"
          onPress={() => navigation.navigate('MyDictionaries')}
        />
        <View className="flex-row items-center gap-3 rounded-2xl bg-white p-4 opacity-50 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <CheckCircle2 size={22} color="#64748b" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-ink dark:text-dark-ink">
              ODAT
            </Text>
            <Text className="text-xs text-gray-400">
              Kun tartibingizni rejalashtiring
            </Text>
          </View>
          <Text className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 dark:bg-dark-canvas dark:text-zinc-400">
            Tez kunda
          </Text>
        </View>
        <View className="flex-row items-center gap-3 rounded-2xl bg-white p-4 opacity-50 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <Mic size={22} color="#64748b" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-ink dark:text-dark-ink">
              Ovozli suhbat
            </Text>
            <Text className="text-xs text-gray-400">
              Tez orada ishga tushadi
            </Text>
          </View>
          <Text className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">
            Tez orada
          </Text>
        </View>
        <View className="flex-row items-center gap-3 rounded-2xl bg-white p-4 opacity-50 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <Focus size={22} color="#64748b" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-ink dark:text-dark-ink">
              Diqqat
            </Text>
            <Text className="text-xs text-gray-400">
              Chalg'imasdan dars qiling
            </Text>
          </View>
          <Text className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">
            Tez orada
          </Text>
        </View>
      </View>
    </Screen>
  );
}


function HubCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-white p-4 active:opacity-70 dark:bg-dark-surface"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
        {icon}
      </View>
      <View>
        <Text className="font-bold text-ink dark:text-dark-ink">{title}</Text>
        <Text className="text-xs text-gray-400">{subtitle}</Text>
      </View>
    </Pressable>
  );
}
