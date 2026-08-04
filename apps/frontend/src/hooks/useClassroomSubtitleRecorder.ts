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
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownsStreamRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !isHost || !micEnabled) {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      mediaRecorderRef.current = null;
      if (streamRef.current) {
        if (ownsStreamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        ownsStreamRef.current = false;
      }
      return;
    }

    let active = true;

    async function startRecording() {
      try {
        let stream: MediaStream | null = null;
        try {
          const livekitStream = getAudioStream?.();
          if (livekitStream && livekitStream.getAudioTracks().length > 0) {
            // Record a cloned track. Stopping the subtitle recorder must never
            // stop the LiveKit microphone track used by the lesson itself.
            stream = new MediaStream(livekitStream.getAudioTracks().map((track) => track.clone()));
            ownsStreamRef.current = true;
          }
        } catch {}

        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          ownsStreamRef.current = true;
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

        const recordChunk = () => {
          if (!active || !stream || stream.getAudioTracks().every((track) => track.readyState === "ended")) return;

          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          const parts: Blob[] = [];
          mediaRecorderRef.current = recorder;
          chunkStartMsRef.current = Date.now();

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) parts.push(event.data);
          };
          recorder.onstop = async () => {
            const startMs = chunkStartMsRef.current;
            const endMs = Date.now();
            const blob = new Blob(parts, { type: mimeType || recorder.mimeType });
            if (blob.size > 300 && sessionId) {
              try {
                const base64 = bufferToBase64(await blob.arrayBuffer());
                getClassroomSocket().emit("board:subtitle_audio", {
                  sessionId,
                  token: useAuthStore.getState().token,
                  audioBase64: base64,
                  startMs,
                  endMs,
                });
              } catch (err) {
                console.warn("Subtitle chunk encode error:", err);
              }
            }
            if (active) recordChunk();
          };

          // stop() finalizes a complete, independently decodable WebM file.
          recorder.start();
          intervalRef.current = setTimeout(() => {
            if (recorder.state === "recording") recorder.stop();
          }, 3000);
        };

        recordChunk();
      } catch (err) {
        console.warn("Subtitle audio recorder warning:", err);
      }
    }

    void startRecording();

    return () => {
      active = false;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      mediaRecorderRef.current = null;
      if (streamRef.current) {
        if (ownsStreamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        ownsStreamRef.current = false;
      }
    };
  }, [sessionId, isHost, micEnabled, getAudioStream]);
}
