import {useCallback, useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {Room, RoomEvent, Track} from 'livekit-client';
import {AudioSession, AndroidAudioTypePresets} from '@livekit/react-native';
import {apiVoiceToken, apiVoiceTokenGuest} from '../api/classroom';
import {getGuestId} from './useClassroomSession';

function collectUnmuted(room: Room): Set<string> {
  const unmuted = new Set<string>();
  if (room.localParticipant.isMicrophoneEnabled) {
    unmuted.add(room.localParticipant.identity);
    if (room.localParticipant.name) unmuted.add(room.localParticipant.name);
  }
  for (const p of room.remoteParticipants.values()) {
    if (p.isMicrophoneEnabled) {
      unmuted.add(p.identity);
      if (p.name) unmuted.add(p.name);
    }
  }
  return unmuted;
}

export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Mikrofon ruxsati',
        message: 'Jonli darsda ovozli ishtirok etish uchun mikrofon ruxsati talab qilinadi.',
        buttonPositive: 'Ruxsat berish',
        buttonNegative: 'Bekor qilish',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Mic permission error:', err);
    return false;
  }
}

export function useClassroomVoice(sessionId: string | undefined, guestName?: string) {
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [unmutedUserIds, setUnmutedUserIds] = useState<Set<string>>(new Set());
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(sessionId)) {
      setConnected(false);
      return;
    }
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    const updateUnmuted = () => {
      const r = roomRef.current;
      if (!r) return;
      setUnmutedUserIds(collectUnmuted(r));
    };

    room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
      const set = new Set<string>();
      for (const speaker of speakers) {
        set.add(speaker.identity);
        if (speaker.name) set.add(speaker.name);
      }
      setActiveSpeakerIds(set);
    });
    room.on(RoomEvent.LocalTrackPublished, () => {
      setMicEnabled(true);
      updateUnmuted();
    });
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      setMicEnabled(false);
      updateUnmuted();
    });
    room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (
        participant === room.localParticipant &&
        publication.source === Track.Source.Microphone &&
        publication.trackSid === room.localParticipant.getTrackPublication(Track.Source.Microphone)?.trackSid
      ) {
        setMicEnabled(false);
      }
      updateUnmuted();
    });
    room.on(RoomEvent.TrackUnmuted, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.TrackSubscribed, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.TrackUnsubscribed, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.ParticipantConnected, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.Disconnected, () => {
      setConnected(false);
      setMicEnabled(false);
      setUnmutedUserIds(new Set());
    });

    (async () => {
      try {
        try {
          await AudioSession.configureAudio({
            android: {
              preferredOutputList: ['speaker', 'bluetooth', 'headset', 'earpiece'],
              audioTypeOptions: AndroidAudioTypePresets.communication,
            },
            ios: {
              defaultOutput: 'speaker',
            },
          });
          if (Platform.OS === 'android') {
            await AudioSession.startAudioSession();
          }
        } catch (audioErr) {
          console.warn('AudioSession init warning:', audioErr);
        }

        const voiceRes = guestName
          ? await apiVoiceTokenGuest(sessionId, await getGuestId(), guestName).catch(e => {
              if (e?.response?.status === 503) setVoiceAvailable(false);
              return null;
            })
          : await apiVoiceToken(sessionId).catch(e => {
              if (e?.response?.status === 503) setVoiceAvailable(false);
              return null;
            });

        if (cancelled || !voiceRes?.token || !voiceRes?.url) {
          setConnected(false);
          return;
        }

        const {token, url} = voiceRes;
        await room.connect(url, token);
        if (cancelled) {
          void room.disconnect();
          return;
        }
        setConnected(true);
        updateUnmuted();
      } catch (e: any) {
        if (cancelled) return;
        if (e?.response?.status === 503) {
          setVoiceAvailable(false);
        } else {
          setConnected(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void room.disconnect();
      roomRef.current = null;
      try {
        void AudioSession.stopAudioSession();
      } catch {}
    };
  }, [sessionId, guestName]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    try {
      if (next) {
        const granted = await requestMicPermission();
        if (!granted) return;
        // iOS: setupIOSAudioManagement() (index.js/registerGlobals) buni
        // recording yoqilganda avtomatik boshqaradi — qo'lda chaqirish
        // race condition yaratadi. Android'da avtomatik mexanizm yo'q,
        // shu sabab faqat shu yerda qo'lda chaqiriladi.
        if (Platform.OS === 'android') {
          try {
            await AudioSession.startAudioSession();
          } catch (err) {
            console.warn('AudioSession start on mic toggle:', err);
          }
        }
      }
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
      setUnmutedUserIds(collectUnmuted(room));
    } catch (e) {
      console.warn('toggleMic error:', e);
    }
  }, [micEnabled]);

  const unlockAudio = useCallback(async () => {
    try {
      await AudioSession.startAudioSession();
    } catch {}
    setNeedsAudioUnlock(false);
  }, []);

  return {connected, micEnabled, voiceAvailable, toggleMic, activeSpeakerIds, unmutedUserIds, needsAudioUnlock, unlockAudio};
}


