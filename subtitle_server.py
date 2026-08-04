#!/usr/bin/env python3
"""
Jonli darslar uchun Whisper Subtitle Microservice
VPS da 8090 portda WebSocket server sifatida ishlaydi.
"""

import asyncio
import json
import os
import sys
import time
import tempfile
import websockets
from faster_whisper import WhisperModel

PORT = int(os.environ.get("PORT", 8090))
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")

print(f"🔄 Faster-Whisper ({MODEL_NAME}) modeli xotiraga yuklanmoqda...")
start_time = time.time()
try:
    model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=4)
    print(f"✅ Model {time.time() - start_time:.2f} soniyada muvaffaqiyatli yuklandi!")
except Exception as e:
    print(f"❌ Modelni yuklashda xatolik: {e}")
    sys.exit(1)

async def handle_client(websocket):
    print(f"🎙 Client ulandi: {websocket.remote_address}")
    audio_buffer = bytearray()
    start_timestamp_ms = int(time.time() * 1000)

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                audio_buffer.extend(message)

                # ~2 soniyalik audio yig'ilganda (16kHz 16-bit PCM = 64000 bytes)
                if len(audio_buffer) >= 64000:
                    current_now = int(time.time() * 1000)
                    chunk = bytes(audio_buffer)
                    audio_buffer.clear()

                    # VAD va transkripsiya
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
                        tmp.write(chunk)
                        tmp.flush()

                        try:
                            segments, info = model.transcribe(
                                tmp.name,
                                language="uz",
                                initial_prompt="Bu onlayn dars ma'ruzasi, o'zbekcha nutq.",
                                beam_size=1,
                            )

                            text_parts = [segment.text.strip() for segment in segments if segment.text.strip()]
                            text_out = " ".join(text_parts).strip()

                            if text_out:
                                cue = {
                                    "text": text_out,
                                    "startMs": start_timestamp_ms,
                                    "endMs": current_now,
                                    "language": info.language,
                                }
                                await websocket.send(json.dumps(cue))
                                print(f"💬 [{info.language}]: {text_out}")
                        except Exception as ex:
                            print(f"⚠️ Transkripsiya xatosi: {ex}")

                    start_timestamp_ms = current_now

            elif isinstance(message, str):
                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send(json.dumps({"type": "pong"}))
                except Exception:
                    pass

    except websockets.exceptions.ConnectionClosed:
        print(f"🔴 Client uzildi: {websocket.remote_address}")
    except Exception as e:
        print(f"⚠️ Kutilmagan xatolik: {e}")

async def main():
    async with websockets.serve(handle_client, "0.0.0.0", PORT):
        print(f"🚀 Subtitle Server ws://0.0.0.0:{PORT} da muvaffaqiyatli ishga tushdi!")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Server to'xtatildi.")
