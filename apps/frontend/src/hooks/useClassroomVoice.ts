import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteTrack, RemoteTrackPublication, RemoteParticipant, Room, RoomEvent, Track } from "livekit-client";
import { apiVoiceToken } from "../api/classroom";
import { getGuestId } from "./useClassroomSession";

interface VoiceState {
  // false — LiveKit sozlanmagan (dars ovozsiz rejimda)
  voiceAvailable: boolean;
  connected: boolean;
  micEnabled: boolean;
  speakingUserIds: Set<string>;
  unmutedUserIds: Set<string>;
  // true — brauzer autoplay siyosati kiruvchi ovozni bloklagan, foydalanuvchi
  // amali (tugma bosish) bilan qo'lda ijro ettirish kerak.
  needsAudioUnlock: boolean;
  // Foydalanuvchi tanlashi mumkin bo'lgan mikrofon (audioinput) qurilmalari
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  // Foydalanuvchi tanlashi mumkin bo'lgan karnay (audiooutput) qurilmalari
  audioOutputs: MediaDeviceInfo[];
  activeAudioOutputId: string | null;
}

function setsAreEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function useClassroomVoice(sessionId: string | undefined, startMuted: boolean, guestName?: string) {
  const roomRef = useRef<Room | null>(null);
  const isTogglingMicRef = useRef(false);
  const [state, setState] = useState<VoiceState>({
    voiceAvailable: true,
    connected: false,
    micEnabled: false,
    speakingUserIds: new Set(),
    unmutedUserIds: new Set(),
    needsAudioUnlock: false,
    audioInputs: [],
    activeAudioInputId: null,
    audioOutputs: [],
    activeAudioOutputId: null,
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
    // Karnay (audiooutput) — setSinkId qo'llab-quvvatlanmasa ro'yxat bo'sh qoladi.
    try {
      const outputs = await Room.getLocalDevices("audiooutput");
      setState((s) => ({ ...s, audioOutputs: outputs }));
      const activeOutId = room.getActiveDevice("audiooutput");
      if (activeOutId) setState((s) => ({ ...s, activeAudioOutputId: activeOutId }));
    } catch (e) {
      console.error("Karnay qurilmalarini olib bo'lmadi:", e);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    roomRef.current = room;

    const updateUnmuted = () => {
      const r = roomRef.current;
      if (!r) return;
      const unmuted = new Set<string>();
      if (r.localParticipant.isMicrophoneEnabled) {
        unmuted.add(r.localParticipant.identity);
        if (r.localParticipant.name) {
          unmuted.add(r.localParticipant.name);
        }
      }
      for (const p of r.remoteParticipants.values()) {
        if (p.isMicrophoneEnabled) {
          unmuted.add(p.identity);
          if (p.name) {
            unmuted.add(p.name);
          }
        }
      }
      setState((s) => {
        if (setsAreEqual(s.unmutedUserIds, unmuted)) return s;
        return { ...s, unmutedUserIds: unmuted };
      });
    };

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const set = new Set<string>();
      for (const speaker of speakers) {
        set.add(speaker.identity);
        if (speaker.name) {
          set.add(speaker.name);
        }
      }
      setState((s) => {
        if (setsAreEqual(s.speakingUserIds, set)) return s;
        return { ...s, speakingUserIds: set };
      });
    });

    room.on(RoomEvent.LocalTrackPublished, () => {
      setState((s) => ({ ...s, micEnabled: room.localParticipant.isMicrophoneEnabled }));
      updateUnmuted();
    });
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      setState((s) => ({ ...s, micEnabled: room.localParticipant.isMicrophoneEnabled }));
      updateUnmuted();
    });
    // Ustoz majburiy mute qilganda yoki track o'zgarganda holat yangilansin
    room.on(RoomEvent.TrackMuted, (_pub, participant) => {
      if (participant === room.localParticipant) {
        setState((s) => ({ ...s, micEnabled: false }));
      }
      updateUnmuted();
    });
    room.on(RoomEvent.TrackUnmuted, (_pub, participant) => {
      if (participant === room.localParticipant) {
        setState((s) => ({ ...s, micEnabled: true }));
      }
      updateUnmuted();
    });
    room.on(RoomEvent.ParticipantConnected, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      updateUnmuted();
    });
    room.on(RoomEvent.Connected, () => {
      setState((s) => ({ ...s, connected: true }));
      updateUnmuted();
    });
    room.on(RoomEvent.Disconnected, () => {
      setState((s) => ({ ...s, connected: false }));
      updateUnmuted();
    });
    // Boshqa ishtirokchilarning ovozi shu orqali eshitiladi — track
    // kelganda audio elementga ulanadi, ketganda tozalanadi.
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      document.querySelectorAll(`audio[data-livekit-participant="${participant.identity}"]`).forEach((existing) => {
        pendingAudioElsRef.current.delete(existing as HTMLMediaElement);
        existing.remove();
      });
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
      updateUnmuted();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => {
        pendingAudioElsRef.current.delete(el);
        el.remove();
      });
      updateUnmuted();
    });

    (async () => {
      try {
        const { token, url } = await apiVoiceToken(sessionId, guestName ? getGuestId() : null, guestName);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { await room.disconnect(); return; }
        let isMicOn = false;
        if (!startMuted) {
          await room.localParticipant.setMicrophoneEnabled(true);
          isMicOn = true;
        }
        setState((s) => {
          const unmuted = new Set(s.unmutedUserIds);
          if (isMicOn) {
            unmuted.add(room.localParticipant.identity);
            if (room.localParticipant.name) {
              unmuted.add(room.localParticipant.name);
            }
          }
          for (const p of room.remoteParticipants.values()) {
            if (p.isMicrophoneEnabled) {
              unmuted.add(p.identity);
              if (p.name) {
                unmuted.add(p.name);
              }
            }
          }
          return { ...s, connected: true, micEnabled: isMicOn, unmutedUserIds: unmuted };
        });
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
  }, [sessionId, startMuted, guestName, refreshAudioInputs]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || isTogglingMicRef.current) return;
    if (room.state !== "connected") {
      console.warn("LiveKit xonasiga hali ulanmagan:", room.state);
      return;
    }
    isTogglingMicRef.current = true;
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      // Optimistic state update for instant UI feedback
      setState((s) => {
        const unmuted = new Set(s.unmutedUserIds);
        if (next) {
          unmuted.add(room.localParticipant.identity);
          if (room.localParticipant.name) {
            unmuted.add(room.localParticipant.name);
          }
        } else {
          unmuted.delete(room.localParticipant.identity);
          if (room.localParticipant.name) {
            unmuted.delete(room.localParticipant.name);
          }
        }
        return { ...s, micEnabled: next, unmutedUserIds: unmuted };
      });

      await room.localParticipant.setMicrophoneEnabled(next);
      if (next) {
        void refreshAudioInputs(room);
      }
    } catch (e) {
      console.error("Mikrofonni almashtirib bo'lmadi:", e);
      // Rollback to actual participant mic state on failure
      setState((s) => ({ ...s, micEnabled: room.localParticipant.isMicrophoneEnabled }));
    } finally {
      isTogglingMicRef.current = false;
    }
  }, [refreshAudioInputs]);

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

  // Foydalanuvchi boshqa karnay qurilmasini tanlaganda — LiveKit barcha
  // remote audio elementlarga setSinkId orqali jonli almashadi.
  const switchAudioOutput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice("audiooutput", deviceId);
      setState((s) => ({ ...s, activeAudioOutputId: deviceId }));
    } catch (e) {
      console.error("Karnay qurilmasini almashtirib bo'lmadi:", e);
    }
  }, []);

  const getLocalAudioStream = useCallback(() => {
    const room = roomRef.current;
    if (!room) return null;
    const pub =
      room.localParticipant.getTrackPublication(Track.Source.Microphone) ||
      Array.from(room.localParticipant.audioTrackPublications.values())[0];
    if (!pub || !pub.track) return null;
    const mediaStreamTrack = pub.track.mediaStreamTrack;
    if (!mediaStreamTrack) return null;
    return new MediaStream([mediaStreamTrack]);
  }, []);

  return { ...state, toggleMic, unlockAudio, switchAudioInput, switchAudioOutput, getLocalAudioStream };
}

