import { useEffect, useRef } from "react";
import { getClassroomSocket } from "../api/classroomSocket";

export function useClassroomSubtitleRecorder(
  sessionId: string | undefined,
  isHost: boolean,
  micEnabled: boolean,
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
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
            const base64 = btoa(
              new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
            );

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
  }, [sessionId, isHost, micEnabled]);
}
