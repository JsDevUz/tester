import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteTrack, RemoteTrackPublication, RemoteParticipant, Room, RoomEvent, Track } from "livekit-client";
import { apiStartClassRecording, apiVoiceToken } from "../api/classroom";

interface VoiceState {
  // false — LiveKit sozlanmagan (dars ovozsiz rejimda)
  voiceAvailable: boolean;
  connected: boolean;
  micEnabled: boolean;
  speakingUserIds: Set<string>;
  // true — brauzer autoplay siyosati kiruvchi ovozni bloklagan, foydalanuvchi
  // amali (tugma bosish) bilan qo'lda ijro ettirish kerak.
  needsAudioUnlock: boolean;
  // Foydalanuvchi tanlashi mumkin bo'lgan mikrofon (audioinput) qurilmalari
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
}

export function useClassroomVoice(sessionId: string | undefined, startMuted: boolean, recordRoom = false) {
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<VoiceState>({
    voiceAvailable: true,
    connected: false,
    micEnabled: false,
    speakingUserIds: new Set(),
    needsAudioUnlock: false,
    audioInputs: [],
    activeAudioInputId: null,
  });
  const pendingAudioElsRef = useRef<Set<HTMLMediaElement>>(new Set());

  // Mikrofon qurilmalar ro'yxatini yangilaydi — LiveKit ruxsat berilgandan
  // keyingina qurilma nomlarini (label) to'liq qaytaradi.
  const refreshAudioInputs = useCallback(async (room: Room) => {
    try {
      const devices = await Room.getLocalDevices("audioinput");
      setState((s) => ({ ...s, audioInputs: devices }));
      const activeId = room.getActiveDevice("audioinput");
      if (activeId) setState((s) => ({ ...s, activeAudioInputId: activeId }));
    } catch (e) {
      console.error("Mikrofon qurilmalarini olib bo'lmadi:", e);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setState((s) => ({ ...s, speakingUserIds: new Set(speakers.map((p) => p.identity)) }));
    });
    room.on(RoomEvent.LocalTrackPublished, () => {
      setState((s) => ({ ...s, micEnabled: room.localParticipant.isMicrophoneEnabled }));
    });
    // Ustoz majburiy mute qilganda ham holat yangilansin
    room.on(RoomEvent.TrackMuted, (_pub, participant) => {
      if (participant === room.localParticipant) {
        setState((s) => ({ ...s, micEnabled: false }));
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      setState((s) => ({ ...s, connected: false }));
    });
    // Boshqa ishtirokchilarning ovozi shu orqali eshitiladi — track
    // kelganda audio elementga ulanadi, ketganda tozalanadi.
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.dataset.livekitParticipant = participant.identity;
      el.autoplay = true;
      document.body.appendChild(el);
      // Brauzer autoplay siyosati user-gesture'siz pleybackni jimgina rad
      // etishi mumkin — shunda foydalanuvchiga "Ovozni yoqish" tugmasi
      // ko'rsatiladi, bosilganda shu elementlar qo'lda play() qilinadi.
      el.play().catch(() => {
        pendingAudioElsRef.current.add(el);
        setState((s) => ({ ...s, needsAudioUnlock: true }));
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => {
        pendingAudioElsRef.current.delete(el);
        el.remove();
      });
    });

    (async () => {
      try {
        const { token, url } = await apiVoiceToken(sessionId);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { await room.disconnect(); return; }
        if (recordRoom) {
          void apiStartClassRecording(sessionId).catch((e) => {
            console.error("Dars ovozini yozib olishni boshlab bo'lmadi:", e);
          });
        }
        setState((s) => ({ ...s, connected: true }));
        if (!startMuted) {
          await room.localParticipant.setMicrophoneEnabled(true);
          setState((s) => ({ ...s, micEnabled: true }));
        }
        void refreshAudioInputs(room);
      } catch (e: any) {
        if (cancelled) return;
        if (e?.response?.status === 503) {
          setState((s) => ({ ...s, voiceAvailable: false }));
        } else {
          console.error("Ovoz xonasiga ulanib bo'lmadi:", e);
          setState((s) => ({ ...s, connected: false }));
        }
      }
    })();

    return () => {
      cancelled = true;
      roomRef.current = null;
      void room.disconnect();
      document.querySelectorAll("audio[data-livekit-participant]").forEach((el) => el.remove());
    };
  }, [sessionId, startMuted, recordRoom]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setState((s) => ({ ...s, micEnabled: next }));
    } catch (e) {
      console.error("Mikrofonni almashtirib bo'lmadi:", e);
    }
  }, []);

  // "Ovozni yoqish" tugmasi bosilganda — user gesture ichida chaqirilgani
  // uchun brauzer endi pleybackka ruxsat beradi.
  const unlockAudio = useCallback(() => {
    for (const el of pendingAudioElsRef.current) {
      void el.play().catch(() => {});
    }
    pendingAudioElsRef.current.clear();
    setState((s) => ({ ...s, needsAudioUnlock: false }));
  }, []);

  // Foydalanuvchi boshqa mikrofon qurilmasini tanlaganda — LiveKit shu
  // qurilmaga jonli almashadi (mikrofonni qayta yoqmasdan).
  const switchAudioInput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice("audioinput", deviceId);
      setState((s) => ({ ...s, activeAudioInputId: deviceId }));
    } catch (e) {
      console.error("Mikrofon qurilmasini almashtirib bo'lmadi:", e);
    }
  }, []);

  return { ...state, toggleMic, unlockAudio, switchAudioInput };
}
