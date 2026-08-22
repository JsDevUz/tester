import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  MessageCircle,
  UserRound,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useLiveNotificationsStore } from '../store/liveNotificationsStore';
import type { RootStackParamList, TabParamList } from './types';
import { LoginScreen } from '../screens/LoginScreen';
import { SchoolsScreen } from '../screens/SchoolsScreen';
import { CoursesScreen } from '../screens/CoursesScreen';
import { LessonsListScreen } from '../screens/LessonsListScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MessengerScreen, ChatScreen } from '../screens/MessengerScreen';
import { LiveScreen } from '../screens/LiveScreen';
import { CourseScreen } from '../screens/CourseScreen';
import { SubmissionDetailScreen } from '../screens/SubmissionDetailScreen';
import { WebScreen } from '../screens/WebScreen';
import { SchoolInviteScreen } from '../screens/SchoolInviteScreen';
import { TestTakerScreen } from '../screens/TestTakerScreen';
import { TestResultScreen } from '../screens/TestResultScreen';
import { ClassroomScreen } from '../screens/ClassroomScreen';
import { ClassroomReplayScreen } from '../screens/ClassroomReplayScreen';
import { ProfileSheet } from '../components/ProfileSheet';
import { ChallengesScreen } from '../screens/ChallengesScreen';
import { ChallengesListView } from '../screens/ChallengesListView';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { ChallengeWordPracticeScreen } from '../screens/ChallengeWordPracticeScreen';
import { DeckPracticeScreen } from '../screens/DeckPracticeScreen';
import { MyTestsScreen } from '../screens/MyTestsScreen';
import { MyTestFolderScreen } from '../screens/MyTestFolderScreen';
import { MyTestQuestionEditorScreen } from '../screens/MyTestQuestionEditorScreen';
import { MyDictionariesScreen } from '../screens/MyDictionariesScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { WordDeckScreen } from '../screens/WordDeckScreen';
import { CachedImage } from '../components/common/CachedImage';
import { TAB_ICON_SIZE } from './tabBarLayout';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const icons = {
  Schools: GraduationCap,
  History: ClipboardList,
  Messenger: MessageCircle,
  Jamm: BookOpen,
  Profile: UserRound,
};

function EmptyProfileTab() {
  return null;
}

// Telegram-uslub tab ikonkasi: Profile tab'ida doim foydalanuvchi avatari
// (rasm bo'lsa) ko'rsatiladi — aktiv bo'lganda indigo halqa (ring) bilan,
// oddiy monoxrom ikonka o'rniga. Boshqa tablarda oddiy ikonka + rang orqali
// aktivlik ko'rsatiladi (Telegram'ning "Chatlar" tab'i kabi — pill fon
// emas, faqat rang farqi).
function TabIcon({
  routeName,
  color,
  size,
  focused,
}: {
  routeName: keyof typeof icons;
  color: string;
  size: number;
  focused: boolean;
}) {
  const avatarUrl = useAuthStore(s => s.user?.avatarUrl);

  if (routeName === 'Profile') {
    return (
      <View
        style={{
          width: TAB_ICON_SIZE + 6,
          height: TAB_ICON_SIZE + 6,
          borderRadius: (TAB_ICON_SIZE + 6) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: focused ? 2 : 0,
          // Matches tabBarActiveTintColor, which `color` already carries.
          borderColor: color,
        }}>
        {avatarUrl ? (
          <CachedImage
            source={{ uri: avatarUrl }}
            category="avatars"
            style={{ width: TAB_ICON_SIZE, height: TAB_ICON_SIZE, borderRadius: TAB_ICON_SIZE / 2 }}
          />
        ) : (
          <UserRound color={color} size={TAB_ICON_SIZE - 2} />
        )}
      </View>
    );
  }

  const Icon = icons[routeName];
  return <Icon color={color} size={TAB_ICON_SIZE} strokeWidth={focused ? 2.4 : 2} />;
}

function TabsWithProfile() {
  const [profileOpen, setProfileOpen] = useState(false);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const hasUnreadMessages = useLiveNotificationsStore(s => s.hasUnreadMessages);
  return (
    <View className="flex-1">
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          // Matches the web nav's active-item color (brand indigo, tailwind.config.js).
          tabBarActiveTintColor: '#6366f1',
          tabBarInactiveTintColor: isDark ? '#a4a7b2' : '#94a3b8',
          // Edge-to-edge bar sitting on the bottom of the screen: square corners, full width,
          // and part of the layout rather than floating above it. Because it reserves its own
          // space again, screens no longer need to pad around it.
          tabBarStyle: {
            // Matches the web nav's own pt-2/pb-[max(12px,...)] split: less air above the
            // icons, more below before the safe area, instead of splitting it evenly.
            height: 60 + insets.bottom,
            paddingTop: 2,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: isDark ? '#2a2b33' : '#e8eaee',
            backgroundColor: isDark ? '#1b1c22' : '#ffffff',
            elevation: 0,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 1 },
          tabBarIconStyle: { marginBottom: -2 },
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon routeName={route.name as keyof typeof icons} color={color} size={size} focused={focused} />
          ),
          // PlatformPressable (@react-navigation/elements) android_ripple
          // rangini "transparent" qilib bersak ham, tugma bosilganda ichki
          // ripple/press vizual effekti to'liq yo'qolmay qolgan edi — Android'da
          // iOS'dan farqli, kulrang to'rtburchak sifatida ko'rinardi. Oddiy
          // Pressable'da android_ripple'ni UMUMAN BERMASLIK (undefined) uni
          // to'liq o'chiradi, {color: 'transparent'} berishdan farqli.
          tabBarButton: ({ ref: _ref, ...props }) => (
            <Pressable
              {...props}
              android_ripple={undefined}
              style={[props.style, { backgroundColor: 'transparent' }]}
            />
          ),
        })}
      >
        <Tab.Screen
          name="Schools"
          component={SchoolsScreen}
          options={{ title: 'Maktablar' }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'Amaliyotlar' }}
        />
        <Tab.Screen
          name="Jamm"
          component={ChallengesScreen}
          options={{ title: 'Jamm' }}
        />
        <Tab.Screen
          name="Messenger"
          component={MessengerScreen}
          options={{
            title: 'Xabarlar',
            // hasUnreadMessages global LiveNotificationsProvider orqali
            // real-time yangilanadi (ekranga hali kirmasdan turib ham) —
            // MessengerScreen ochilganda esa clearUnread() bilan tozalanadi.
            tabBarBadge: hasUnreadMessages ? '' : undefined,
            tabBarBadgeStyle: { minWidth: 8, height: 8, borderRadius: 4, marginTop: 2 },
          }}
        />
        <Tab.Screen
          name="Profile"
          component={EmptyProfileTab}
          options={{ title: 'Profil' }}
          listeners={{
            tabPress: e => {
              e.preventDefault();
              setProfileOpen(true);
            },
          }}
        />
      </Tab.Navigator>
      <ProfileSheet
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </View>
  );
}

export function RootNavigator() {
  const token = useAuthStore(s => s.token);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <Stack.Navigator
      screenOptions={{
        headerBackTitle: 'Ortga',
        headerTintColor: isDark ? '#e8eaed' : '#111827',
        headerStyle: { backgroundColor: isDark ? '#1b1c22' : '#ffffff' },
        headerTitleStyle: {
          color: isDark ? '#e8eaed' : '#111827',
          fontSize: 17,
        },
      }}
    >
      {!token ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={TabsWithProfile}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Courses"
            component={CoursesScreen}
            options={({ route }) => ({ title: route.params.schoolName })}
          />
          <Stack.Screen
            name="LessonsList"
            component={LessonsListScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="Course"
            component={CourseScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SubmissionDetail"
            component={SubmissionDetailScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="Web"
            component={WebScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="SchoolInvite"
            component={SchoolInviteScreen}
            options={{ title: "Maktabga qo'shilish" }}
          />
          <Stack.Screen
            name="TestTaker"
            component={TestTakerScreen}
            options={({ route }) => ({
              title: route.params.title,
              headerBackVisible: false,
            })}
          />
          <Stack.Screen
            name="TestResult"
            component={TestResultScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="Classroom"
            component={ClassroomScreen}
            options={{ title: 'Jonli dars', headerShown: false }}
          />
          <Stack.Screen
            name="ClassroomReplay"
            component={ClassroomReplayScreen}
            options={{ title: 'Dars yozuvi', headerShown: false }}
          />
          <Stack.Screen
            name="Live"
            component={LiveScreen}
            options={{ title: 'Jonli musobaqalar' }}
          />
          <Stack.Screen
            name="ChallengesList"
            component={ChallengesListView}
            options={{ title: 'Challenge-lar' }}
          />
          <Stack.Screen
            name="ChallengeDetail"
            component={ChallengeDetailScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="ChallengeWordPractice"
            component={ChallengeWordPracticeScreen}
            options={({ route }) => ({
              title: route.params.title,
              gestureEnabled: false,
            })}
          />
          <Stack.Screen
            name="MyTests"
            component={MyTestsScreen}
            options={{ title: 'Mening testlarim' }}
          />
          <Stack.Screen
            name="MyTestFolder"
            component={MyTestFolderScreen}
            options={({ route }) => ({ title: route.params.folderName })}
          />
          <Stack.Screen
            name="MyTestQuestionEditor"
            component={MyTestQuestionEditorScreen}
            options={({ route }) => ({ title: route.params.testName })}
          />
          <Stack.Screen
            name="MyDictionaries"
            component={MyDictionariesScreen}
            options={{ title: "Mening lug'atlarim" }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ title: 'Profilni tahrirlash' }}
          />
          <Stack.Screen
            name="WordDeck"
            component={WordDeckScreen}
            options={({ route }) => ({ title: route.params.deckName })}
          />
          <Stack.Screen
            name="DeckPractice"
            component={DeckPracticeScreen}
            options={({ route }) => ({ title: route.params.deckName ?? "Lug'at", gestureEnabled: false })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
