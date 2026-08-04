#!/usr/bin/env python3
"""
Faster-Whisper Subtitle Microservice (FastAPI)
Jonli darslar uchun audio bo'laklarini o'zbek tiliga transkripsiya qiladi.
"""

import base64
import os
import sys
import tempfile
import time
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from faster_whisper import WhisperModel
import uvicorn

PORT = int(os.environ.get("PORT", 8090))
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")

print(f"🔄 Faster-Whisper ({MODEL_NAME}) modeli yuklanmoqda...")
start_time = time.time()
try:
    model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=4)
    print(f"✅ Model {time.time() - start_time:.2f} soniyada yuklandi!")
except Exception as e:
    print(f"❌ Modelni yuklashda xatolik: {e}")
    sys.exit(1)

app = FastAPI(title="Whisper Subtitle Microservice")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranscribeRequest(BaseModel):
    audioBase64: str
    startMs: int = 0
    endMs: int = 0

@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}

@app.post("/transcribe-base64")
async def transcribe_base64(req: TranscribeRequest):
    try:
        if not req.audioBase64:
            return {"text": "", "startMs": req.startMs, "endMs": req.endMs}

        audio_bytes = base64.b64decode(req.audioBase64)
        if len(audio_bytes) < 100:
            return {"text": "", "startMs": req.startMs, "endMs": req.endMs}

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()

            segments, info = model.transcribe(
                tmp.name,
                language="uz",
                initial_prompt="Bu onlayn dars ma'ruzasi, o'zbekcha nutq.",
                beam_size=1,
            )

            text_parts = [s.text.strip() for s in segments if s.text.strip()]
            text_out = " ".join(text_parts).strip()

            if text_out:
                print(f"💬 [{req.startMs}ms - {req.endMs}ms]: {text_out}")

            return {
                "text": text_out,
                "startMs": req.startMs,
                "endMs": req.endMs,
                "language": info.language if info else "uz",
            }
    except Exception as e:
        print(f"⚠️ Transcribe error: {e}")
        return {"text": "", "error": str(e), "startMs": req.startMs, "endMs": req.endMs}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
