#!/usr/bin/env python3
"""
Faster-Whisper Subtitle Microservice (FastAPI)
Jonli darslar va yozib olingan audio fayllar uchun o'zbek tiliga transkripsiya qiladi.
"""

import base64
import os
import re
import sys
import tempfile
import time
import urllib.request
import unicodedata
from fastapi import FastAPI
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

class TranscribeFileRequest(BaseModel):
    audioUrl: str

def clean_transcript(text: str) -> str:
    """Keep normal Uzbek punctuation; reject only clearly wrong scripts/noise."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text).replace("\ufffd", "")
    text = text.replace("ʻ", "'").replace("ʼ", "'").replace("’", "'").replace("‘", "'")
    # Forced Uzbek decoding can still hallucinate CJK/Arabic glyphs on broken
    # or silent audio. Do not discard ordinary punctuation or Cyrillic text.
    if re.search(r"[\u0600-\u06ff\u3040-\u30ff\u3400-\u9fff]", text):
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text if re.search(r"[A-Za-z\u0400-\u04ff]", text) else ""

@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}

@app.post("/transcribe-base64")
async def transcribe_base64(req: TranscribeRequest):
    try:
        if not req.audioBase64:
            return {"text": "", "startMs": req.startMs, "endMs": req.endMs}

        audio_bytes = base64.b64decode(req.audioBase64, validate=True)

        if len(audio_bytes) < 300:
            return {"text": "", "startMs": req.startMs, "endMs": req.endMs}

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()

            segments, info = model.transcribe(
                tmp.name,
                language="uz",
                initial_prompt="Bu o‘zbek tilidagi jonli dars. Matnni o‘zbek lotin yozuvida aniq yozing.",
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
                beam_size=1,
                temperature=0.0,
                repetition_penalty=1.15,
                no_repeat_ngram_size=3,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.6,
            )

            segments = list(segments)
            text_parts = [s.text.strip() for s in segments if s.text.strip()]
            text_out = " ".join(text_parts).strip()

            text_out = clean_transcript(text_out)

            if text_out:
                print(f"💬 Transcribed [{req.startMs}ms - {req.endMs}ms]: '{text_out}'")
            else:
                print(f"🔇 Silent chunk or filtered garbage noise.")

            return {
                "text": text_out,
                "startMs": req.startMs,
                "endMs": req.endMs,
                "language": info.language if info else "uz",
                "cueStartOffsetMs": int(segments[0].start * 1000) if segments else 0,
                "cueEndOffsetMs": int(segments[-1].end * 1000) if segments else 0,
            }
    except Exception as e:
        print(f"⚠️ Transcribe error: {e}")
        return {"text": "", "error": str(e), "startMs": req.startMs, "endMs": req.endMs}

@app.post("/transcribe-file")
async def transcribe_file(req: TranscribeFileRequest):
    try:
        if not req.audioUrl:
            return {"cues": []}

        print(f"📥 Transcribing full audio file for past replay: {req.audioUrl}")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=True) as tmp:
            urllib.request.urlretrieve(req.audioUrl, tmp.name)

            segments, info = model.transcribe(
                tmp.name,
                language="uz",
                initial_prompt="Bu o‘zbek tilidagi dars. Matnni o‘zbek lotin yozuvida aniq yozing.",
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
                beam_size=1,
                temperature=0.0,
                repetition_penalty=1.15,
                no_repeat_ngram_size=3,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.6,
            )

            cues = []
            for idx, s in enumerate(segments):
                txt = clean_transcript(s.text)
                if txt:
                    cues.append({
                        "id": f"cue_{idx}_{int(s.start * 1000)}",
                        "startMs": int(s.start * 1000),
                        "endMs": int(s.end * 1000),
                        "text": txt,
                    })

            print(f"✅ Generated {len(cues)} subtitle cues for replay audio file!")
            return {"cues": cues}
    except Exception as e:
        print(f"⚠️ Transcribe file error: {e}")
        return {"cues": [], "error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
