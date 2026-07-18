import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteTrack, RemoteTrackPublication, RemoteParticipant, Room, RoomEvent, Track } from "livekit-client";
import { apiLiveVoiceToken } from "../api/live";

interface VoiceState {
  // false — LiveKit sozlanmagan (musobaqa ovozsiz rejimda)
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

// useClassroomVoice bilan bir xil LiveKit integratsiya patterni — jonli
// musobaqa (pin bo'yicha) uchun. Ikkalasi alohida saqlanadi (klassrum va
// live musobaqa turli backend endpoint/room nomlanishiga ega), lekin
// mantiq bir xil: token olish, xonaga ulanish, mikrofon/ovoz boshqaruvi.
export function useLiveVoice(pin: string | undefined, startMuted: boolean) {
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
    if (!pin) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setState((s) => ({ ...s, speakingUserIds: new Set(speakers.map((p) => p.identity)) }));
    });
    room.on(RoomEvent.LocalTrackPublished, () => {
      setState((s) => ({ ...s, micEnabled: room.localParticipant.isMicrophoneEnabled }));
    });
    room.on(RoomEvent.TrackMuted, (_pub, participant) => {
      if (participant === room.localParticipant) {
        setState((s) => ({ ...s, micEnabled: false }));
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      setState((s) => ({ ...s, connected: false }));
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.dataset.livekitParticipant = participant.identity;
      el.autoplay = true;
      document.body.appendChild(el);
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
        const { token, url } = await apiLiveVoiceToken(pin);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { await room.disconnect(); return; }
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
  }, [pin, startMuted]);

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

  const unlockAudio = useCallback(() => {
    for (const el of pendingAudioElsRef.current) {
      void el.play().catch(() => {});
    }
    pendingAudioElsRef.current.clear();
    setState((s) => ({ ...s, needsAudioUnlock: false }));
  }, []);

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
