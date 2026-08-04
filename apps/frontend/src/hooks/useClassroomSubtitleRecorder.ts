import { useEffect, useRef } from "react";
import { getClassroomSocket } from "../api/classroomSocket";
import { useAuthStore } from "../stores/authStore";

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const headerBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!sessionId || !isHost || !micEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      mediaRecorderRef.current = null;
      headerBlobRef.current = null;
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
        headerBlobRef.current = null;
        chunkStartMsRef.current = Date.now();

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 50 && sessionId) {
            const startMs = chunkStartMsRef.current;
            const endMs = Date.now();
            chunkStartMsRef.current = endMs;

            let blobToSend: Blob = e.data;
            if (!headerBlobRef.current) {
              // Store WebM header from the first chunk (first 300 bytes)
              headerBlobRef.current = e.data.slice(0, Math.min(300, e.data.size));
            } else {
              // Prepend WebM header to subsequent chunks so FFmpeg can parse standalone chunks
              blobToSend = new Blob([headerBlobRef.current, e.data], {
                type: mimeType || "audio/webm",
              });
            }

            try {
              const buffer = await blobToSend.arrayBuffer();
              const base64 = bufferToBase64(buffer);
              const token = useAuthStore.getState().token;
              const socket = getClassroomSocket();
              socket.emit("board:subtitle_audio", {
                sessionId,
                token,
                audioBase64: base64,
                startMs,
                endMs,
              });
            } catch (err) {
              console.warn("Subtitle chunk encode error:", err);
            }
          }
        };

        // Start recording once
        recorder.start();

        // Flush data every 2.5s using requestData() without stopping recorder
        intervalRef.current = setInterval(() => {
          if (!active) return;
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            try {
              mediaRecorderRef.current.requestData();
            } catch (err) {
              console.warn("requestData error:", err);
            }
          }
        }, 2500);
      } catch (err) {
        console.warn("Subtitle audio recorder warning:", err);
      }
    }

    void startRecording();

    return () => {
      active = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      mediaRecorderRef.current = null;
      headerBlobRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [sessionId, isHost, micEnabled, getAudioStream]);
}
