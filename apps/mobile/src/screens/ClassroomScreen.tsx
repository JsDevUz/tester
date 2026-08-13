import React, {useMemo, useState} from 'react';
import {Pressable, StatusBar, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Maximize2, Minimize2, Users, Volume2, WifiOff} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import {isGuestEligible, useClassroomSession} from '../hooks/useClassroomSession';
import {useClassroomVoice} from '../hooks/useClassroomVoice';
import {useAutoHideOverlay} from '../hooks/useAutoHideOverlay';
import {ClassroomBoard} from '../components/classroom/ClassroomBoard';
import {ClassroomRoster} from '../components/classroom/ClassroomRoster';
import {ClassroomParticipantsGrid} from '../components/classroom/ClassroomParticipantsGrid';
import {ClassroomTopParticipantBar} from '../components/classroom/ClassroomTopParticipantBar';
import {ClassroomCallBar} from '../components/classroom/ClassroomCallBar';
import {ClassroomGuestJoinForm} from '../components/classroom/ClassroomGuestJoinForm';
import {RaisedHandsControl} from '../components/classroom/RaisedHandsControl';
import {StickerReactionsOverlay} from '../components/classroom/StickerReactionsOverlay';
import {Loading} from '../components/Ui';
import {useAuthStore} from '../store/authStore';

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: 'Dars topilmadi',
  NOT_ENROLLED: 'Siz bu kursga yozilmagansiz',
  UNAUTHORIZED: "Kirish huquqingiz yo'q",
  GUEST_NAME_REQUIRED: 'Ism kiritish talab qilinadi',
};

type Props = NativeStackScreenProps<RootStackParamList, 'Classroom'>;

export function ClassroomScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const insets = useSafeAreaInsets();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const overlay = useAutoHideOverlay();

  const needsGuestForm = !token && guestName === null;

  const {state, sendReaction, toggleHandRaise} = useClassroomSession(
    needsGuestForm ? undefined : sessionId,
    guestName ?? undefined,
    user?.name,
  );
  const voiceEligible = isGuestEligible(Boolean(token), guestName);
  const voiceSessionId = state.joined && !state.ended && voiceEligible ? sessionId : undefined;
  const voice = useClassroomVoice(voiceSessionId, token ? undefined : guestName ?? undefined);

  const myUserId = user?.id ?? (guestName ? `guest:${guestName}` : null);
  const myUserName = user?.name ?? guestName ?? "O'quvchi";
  const isHandRaised = state.raisedHands.some(h => h.userId === myUserId || h.userName === myUserName);


  const errorMessage = useMemo(
    () => (state.error ? ERROR_MESSAGES[state.error] ?? 'Xatolik yuz berdi' : null),
    [state.error],
  );

  if (needsGuestForm) {
    return <ClassroomGuestJoinForm onSubmit={setGuestName} />;
  }

  if (state.error) {
    return (
      <View style={{flex: 1, backgroundColor: '#18191c', alignItems: 'center', justifyContent: 'center', padding: 24}}>
        <Text style={{fontSize: 16, fontWeight: '700', textAlign: 'center', color: '#f8fafc'}}>{errorMessage}</Text>
      </View>
    );
  }

  if (state.ended) {
    return (
      <View style={{flex: 1, backgroundColor: '#18191c', alignItems: 'center', justifyContent: 'center', padding: 24}}>
        <Text style={{fontSize: 20, fontWeight: '800', textAlign: 'center', color: '#f8fafc'}}>Dars yakunlandi</Text>
        <Text style={{marginTop: 8, fontSize: 14, color: '#94a3b8', textAlign: 'center'}}>
          Ishtirokingiz uchun rahmat!
        </Text>
      </View>
    );
  }



  if (!state.joined) {
    return <Loading />;
  }

  return (
    // MUHIM: reveal shu yerda global onTouchStart orqali emas — u har
    // qanday touch'da (scroll/pinch boshlanishida ham, chunki RN touch
    // bubbling qiladi) ishga tushib, "zoom/scroll qilsam ham panel qayta
    // ko'rinib ketadi" holatiga sabab bo'lardi. Reveal endi faqat
    // ClassroomBoard'ga uzatiladigan onTapBoard orqali, aniq (drag/pinch
    // BO'LMAGAN) bosishda chaqiriladi — pastga qarang.
    <View style={{flex: 1, backgroundColor: '#18191c'}}>
      <StatusBar barStyle="light-content" backgroundColor="#18191c" hidden={isFullscreen} />

      {/* Floating Top Warning Banners */}
      {!state.hostOnline && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            alignSelf: 'center',
            zIndex: 60,
            backgroundColor: '#fef3c7',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 4,
          }}>
          <WifiOff size={13} color="#92400e" />
          <Text style={{fontSize: 11, color: '#92400e', fontWeight: '600'}}>
            Ustoz bilan aloqa uzildi — qayta ulanish kutilmoqda...
          </Text>
        </View>
      )}

      {voice.needsAudioUnlock && (
        <Pressable
          onPress={voice.unlockAudio}
          style={{
            position: 'absolute',
            top: insets.top + (!state.hostOnline ? 48 : 8),
            alignSelf: 'center',
            zIndex: 60,
            backgroundColor: '#4f46e5',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 5,
          }}>
          <Volume2 size={14} color="white" />
          <Text style={{fontSize: 12, color: 'white', fontWeight: '700'}}>
            Ovozni yoqish uchun bosing
          </Text>
        </Pressable>
      )}

      {/* Floating Top Right Controls (Raised Hands, Roster & Fullscreen toggle) —
          ClassroomBoard ichidagi "x / y" sahifa indikatori (top: 12, chap
          tomonda) bilan BIR XIL balandlikda tursin. Board ochiq va fullscreen
          bo'lmaganda ClassroomTopParticipantBar (78px) board'dan oldin
          chiziladi — shu balandlikni hisobga olmasak, bu qator sahifa
          indikatoridan yuqoriroqda (participant bar ustida) qolib ketardi.
          Board ochiq bo'lganda bitta bosish (overlay.toggle) bilan
          yashirin/ko'rinadi — vaqtga qarab emas. */}
      {(!state.isBoardOpen || overlay.visible) && (
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8 + (state.isBoardOpen && !isFullscreen ? 78 : 0),
          right: 14,
          zIndex: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
        <RaisedHandsControl raisedHands={state.raisedHands} />

        <Pressable
          onPress={() => setRosterOpen(true)}
          style={{
            height: 32,
            paddingHorizontal: 10,
            borderRadius: 16,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.06)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 1},
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 2,
          }}>
          <Users size={14} color="#6b7280" />
          <Text style={{color: '#6b7280', fontSize: 11, fontWeight: '600'}}>{state.participants.length}</Text>
        </Pressable>

        {state.isBoardOpen && (
          <Pressable
            onPress={() => setIsFullscreen(v => !v)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 1},
              shadowOpacity: 0.1,
              shadowRadius: 3,
              elevation: 2,
            }}>
            {isFullscreen ? <Minimize2 size={14} color="#6b7280" /> : <Maximize2 size={14} color="#6b7280" />}
          </Pressable>
        )}
      </View>
      )}


      {/* Main Content (Grid vs Board) */}
      <View style={{flex: 1, paddingTop: insets.top, backgroundColor: '#18191c'}}>
        {!state.isBoardOpen ? (
          // Board hali ochilmagan holatda ham (faqat qatnashuvchilar to'ri
          // ko'rinayotganda) ekranga bosilganda call bar (mikrofon/emoji/
          // qo'l ko'tarish/tugash) qayta ko'rinishi kerak — ClassroomBoard
          // ichidagi onTapBoard'ga o'xshab, lekin bu holatda board umuman
          // render qilinmagani uchun shu yerda alohida qo'yiladi.
          <Pressable style={{flex: 1}} onPress={overlay.toggle}>
            <ClassroomParticipantsGrid
              participants={state.participants}
              speakingUserIds={voice.activeSpeakerIds}
              unmutedUserIds={voice.unmutedUserIds}
              myUserId={myUserId}
              myUserName={myUserName}
              hostOnline={state.hostOnline}
              hostUserId={state.hostUserId}
              hostName={state.hostName}
            />
          </Pressable>
        ) : (
          <View style={{flex: 1, overflow: 'hidden', backgroundColor: '#18191c'}}>
            {!isFullscreen && (
              <ClassroomTopParticipantBar
                participants={state.participants}
                speakingUserIds={voice.activeSpeakerIds}
                unmutedUserIds={voice.unmutedUserIds}
                myUserId={myUserId}
                myUserName={myUserName}
                hostOnline={state.hostOnline}
                hostUserId={state.hostUserId}
                hostName={state.hostName}
                onOpenRoster={() => setRosterOpen(true)}
              />
            )}
            <ClassroomBoard
              state={state}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(v => !v)}
              onTapBoard={overlay.toggle}
              overlayVisible={overlay.visible}
            />
          </View>
        )}
      </View>


      {/* Sticker reactions overlay */}
      <StickerReactionsOverlay reactions={state.reactions} />

      {/* Floating Call Bar with Auto-Hide support */}
      <ClassroomCallBar
        micEnabled={voice.micEnabled}
        voiceAvailable={voice.voiceAvailable}
        onToggleMic={() => void voice.toggleMic()}
        onSendReaction={sendReaction}
        handRaised={isHandRaised}
        onToggleHandRaise={toggleHandRaise}
        onEndCall={() => navigation.goBack()}
        hidden={!overlay.visible}
      />

      {/* Participants Roster Sheet */}
      <ClassroomRoster
        visible={rosterOpen}
        onClose={() => setRosterOpen(false)}
        participants={state.participants}
        speakingUserIds={voice.activeSpeakerIds}
        unmutedUserIds={voice.unmutedUserIds}
        myUserId={myUserId}
        hostOnline={state.hostOnline}
        hostUserId={state.hostUserId}
        hostName={state.hostName}
        userReactions={state.userReactions}
      />
    </View>
  );
}


