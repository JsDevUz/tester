import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteTrack, RemoteTrackPublication, RemoteParticipant, Room, RoomEvent, Track } from "livekit-client";
import { apiVoiceToken } from "../api/classroom";

interface VoiceState {
  // false — LiveKit sozlanmagan (dars ovozsiz rejimda)
  voiceAvailable: boolean;
  connected: boolean;
  micEnabled: boolean;
  speakingUserIds: Set<string>;
}

export function useClassroomVoice(sessionId: string | undefined, startMuted: boolean) {
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<VoiceState>({
    voiceAvailable: true,
    connected: false,
    micEnabled: false,
    speakingUserIds: new Set(),
  });

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
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => el.remove());
    });

    (async () => {
      try {
        const { token, url } = await apiVoiceToken(sessionId);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { await room.disconnect(); return; }
        setState((s) => ({ ...s, connected: true }));
        if (!startMuted) {
          await room.localParticipant.setMicrophoneEnabled(true);
          setState((s) => ({ ...s, micEnabled: true }));
        }
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
  }, [sessionId, startMuted]);

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

  return { ...state, toggleMic };
}
