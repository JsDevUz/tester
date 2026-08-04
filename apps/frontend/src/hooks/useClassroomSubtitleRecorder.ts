import { useEffect, useRef } from "react";
import { getClassroomSocket } from "../api/classroomSocket";

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

export function useClassroomSubtitleRecorder(
  sessionId: string | undefined,
  isHost: boolean,
  micEnabled: boolean,
  getAudioStream?: () => MediaStream | null,
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkStartMsRef = useRef<number>(0);

  useEffect(() => {
    if (!sessionId || !isHost || !micEnabled) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      mediaRecorderRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let active = true;

    async function startRecording() {
      try {
        let stream: MediaStream | null = getAudioStream?.() ?? null;
        if (!stream || stream.getAudioTracks().length === 0 || !stream.getAudioTracks()[0].enabled) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        if (!active) {
          if (stream) stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunkStartMsRef.current = Date.now();

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && sessionId) {
            const startMs = chunkStartMsRef.current;
            const endMs = Date.now();
            chunkStartMsRef.current = endMs;

            const buffer = await e.data.arrayBuffer();
            const base64 = bufferToBase64(buffer);

            const socket = getClassroomSocket();
            socket.emit("board:subtitle_audio", {
              sessionId,
              audioBase64: base64,
              startMs,
              endMs,
            });
          }
        };

        recorder.start(2500); // 2.5 soniyali oqim bo'laklari
      } catch (err) {
        console.warn("Subtitle audio recorder warning:", err);
      }
    }

    void startRecording();

    return () => {
      active = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      mediaRecorderRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [sessionId, isHost, micEnabled, getAudioStream]);
}
