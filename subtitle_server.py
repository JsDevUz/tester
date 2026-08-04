#!/usr/bin/env python3
"""
Faster-Whisper Subtitle Microservice (FastAPI)
Yozib olingan dars audio fayllaridan replay subtitrlarini yaratadi.
"""

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
MODEL_NAME = os.environ.get("WHISPER_MODEL", "turbo")

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
    # IPA va diakritikali hallucinationlarni (ʕ, ʔ, tʃ, ì, ĕ...) butunlay
    # rad etamiz. O'zbek lotin yozuvi ASCII harflar + apostrofdan iborat.
    if any(ch.isalpha() and not re.match(r"[A-Za-z\u0400-\u04ff]", ch) for ch in text):
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text if re.search(r"[A-Za-z\u0400-\u04ff]", text) else ""

@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}

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
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
                beam_size=5,
                best_of=5,
                temperature=0.0,
                repetition_penalty=1.15,
                no_repeat_ngram_size=3,
                compression_ratio_threshold=2.4,
                log_prob_threshold=-1.0,
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
