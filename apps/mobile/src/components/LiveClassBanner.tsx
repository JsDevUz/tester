import React, {useEffect} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useColorScheme} from 'nativewind';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Radio} from 'lucide-react-native';
import {api} from '../lib/api';
import type {RootStackParamList} from '../navigation/types';
import {useNetwork} from '../providers/NetworkProvider';
import {useLiveNotificationsStore} from '../store/liveNotificationsStore';

export function LiveClassBanner() {
  const sessions = useLiveNotificationsStore(s => s.activeSessions);
  const setSessions = useLiveNotificationsStore(s => s.setSessions);
  const {online} = useNetwork();
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Ilova ochilganda (yoki ekran mount bo'lganda) allaqachon ketayotgan
  // darslarni bir marta yuklaydi — socket faqat SHU PAYTDAN keyingi yangi
  // "boshlandi"/"tugadi" hodisalarini biladi, oldindan ketayotgan darsni
  // bilmaydi. Keyingi real-time yangilanishlar LiveNotificationsProvider
  // (App.tsx darajasida, global) orqali kelib, shu store'ni yangilaydi —
  // bu komponent qayta ochilib-yopilsa ham (masalan tab almashtirilganda)
  // holat yo'qolmaydi.
  useEffect(() => {
    if (!online) return;
    api
      .get('/classroom/sessions/active')
      .then(res => setSessions(res.data))
      .catch(() => undefined);
  }, [online, setSessions]);

  if (sessions.length === 0) return null;

  return (
    <>
      {sessions.map(session => (
        <Pressable
          key={session.id}
          onPress={() =>
            navigation.navigate('Classroom', {sessionId: session.id})
          }
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderRadius: 16,
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.20)',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}>
          <Radio size={20} color="#ef4444" />
          <View style={{flex: 1, minWidth: 0}}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: isDark ? '#f4f4f5' : '#111827',
              }}>
              Jonli dars ketmoqda — {session.courseName}
            </Text>
            <Text
              style={{
                fontSize: 12,
                marginTop: 2,
                color: isDark ? '#a1a1aa' : '#6b7280',
              }}>
              Darsga kirish uchun bosing
            </Text>
          </View>
          <View
            style={{
              borderRadius: 12,
              backgroundColor: '#ef4444',
              paddingHorizontal: 14,
              paddingVertical: 7,
              shadowColor: '#ef4444',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: isDark ? 0.35 : 0.2,
              shadowRadius: 4,
              elevation: 3,
            }}>
            <Text style={{fontSize: 12, fontWeight: '700', color: '#ffffff'}}>Kirish</Text>
          </View>
        </Pressable>
      ))}
    </>
  );
}

