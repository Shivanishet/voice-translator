from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from deep_translator import GoogleTranslator
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from gtts import gTTS
from gtts.lang import tts_langs
from langdetect import detect
from faster_whisper import WhisperModel
from pydantic import BaseModel
import httpx

load_dotenv()

app = FastAPI(title="AI Voice Translator API")

_default_dev_origins = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:5175,http://127.0.0.1:5175"
)
_cors_raw = os.getenv("CORS_ORIGIN", _default_dev_origins)
cors_allow_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper_model_name = os.getenv("WHISPER_MODEL", "tiny")

whisper_model = WhisperModel(
    whisper_model_name,
    device="cpu",
    compute_type="int8"
)


def transcribe_best_effort(audio_wav_path: Path) -> str:
    segments, info = whisper_model.transcribe(
        str(audio_wav_path),
        beam_size=5
    )

    text = "".join(segment.text for segment in segments).strip()

    return text


supported_tts_languages = set(tts_langs().keys())

# Custom language overrides: maps a custom language code to TTS + translation fallbacks.
# Use this for languages not natively supported by gTTS (e.g. Konkani → Marathi for TTS).
CUSTOM_LANGUAGE_OVERRIDES: dict[str, dict[str, str]] = {
    "kok": {"tts_lang": "mr", "translate_lang": "mr"},   # Konkani → Marathi TTS
}


class TranslationResult(BaseModel):
    original_text: str
    translated_text: str
    target_language: str
    detected_source_language: str | None
    audio_base64: str
    audio_mime_type: str
    translation_engine: str | None = None

class TextTranslationRequest(BaseModel):
    text: str
    target_language: str
    source_language: str | None = None

def translate_with_gemini(text: str, target_lang: str, source_lang: str | None = None) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return ""
    
    prompt = (
        f"You are a professional real-time voice translator.\n"
        f"Translate the following text into the language with code '{target_lang}'.\n"
    )
    if source_lang:
        prompt += f"The source language is '{source_lang}'.\n"
    prompt += (
        f"Provide ONLY the translation, without any extra explanation, quotes, or introduction.\n"
        f"Text to translate:\n{text}"
    )
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    }
    
    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=15.0)
        response.raise_for_status()
        data = response.json()
        translated = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        if translated.startswith('"') and translated.endswith('"'):
            translated = translated[1:-1].strip()
        return translated
    except Exception as e:
        print(f"Gemini API translation error: {e}")
        return ""

def translate_text_logic(text: str, target_lang: str, source_lang: str | None = None) -> tuple[str, str]:
    # Returns (translated_text, engine_used)
    gemini_translation = translate_with_gemini(text, target_lang, source_lang)
    if gemini_translation:
        return gemini_translation, "gemini"
    
    try:
        translated = GoogleTranslator(source="auto", target=target_lang).translate(text)
        return translated, "google_translate"
    except Exception as e:
        print(f"Fallback translation failed: {e}")
        return text, "none"


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/translate-audio", response_model=TranslationResult)
async def translate_audio(
    file: UploadFile = File(...),
    target_language: str = Form(...),
) -> TranslationResult:
    normalized_target_language = target_language.strip().lower()
    if not normalized_target_language:
        raise HTTPException(status_code=400, detail="Target language is required.")

    # Resolve custom overrides (e.g. Konkani → Marathi for TTS)
    override = CUSTOM_LANGUAGE_OVERRIDES.get(normalized_target_language)
    tts_language = override["tts_lang"] if override else normalized_target_language
    translate_language = override["translate_lang"] if override else normalized_target_language

    if tts_language not in supported_tts_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{normalized_target_language}' is not supported for speech output.",
        )

    # Some browsers send missing/odd content types; reject only when explicitly non-audio.
    if file.content_type and not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Please upload an audio file.")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as input_audio:
        input_audio.write(audio_bytes)
        input_audio_path = Path(input_audio.name)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as normalized_audio:
        normalized_audio_path = Path(normalized_audio.name)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as output_audio:
        output_audio_path = Path(output_audio.name)

    try:
        if shutil.which("ffmpeg") is None:
            raise HTTPException(
                status_code=500,
                detail=(
                    "FFmpeg is not installed or not on PATH. Install FFmpeg and restart backend. "
                    "Windows (winget): winget install Gyan.FFmpeg"
                ),
            )

        ffmpeg_command: list[str] = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_audio_path),
        ]
        _af = os.getenv("WHISPER_FFMPEG_AFILTER", "dynaudnorm=f=150:g=15").strip()
        if _af not in {"", "-", "none"}:
            ffmpeg_command.extend(["-af", _af])
        ffmpeg_command.extend(
            ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(normalized_audio_path)]
        )
        ffmpeg_result = subprocess.run(
            ffmpeg_command,
            capture_output=True,
            text=True,
            check=False,
        )
        if ffmpeg_result.returncode != 0:
            raise HTTPException(
                status_code=422,
                detail="Audio could not be decoded. Please record again and speak clearly.",
            )

        original_text = transcribe_best_effort(normalized_audio_path)
        if not original_text:
            raise HTTPException(status_code=422, detail="No speech detected in the audio.")

        detected_source_language = detect(original_text)
        translated_text, engine = translate_text_logic(original_text, normalized_target_language, detected_source_language)
        if not translated_text:
            raise HTTPException(status_code=422, detail="Translation returned empty text.")

        tts = gTTS(text=translated_text, lang=normalized_target_language)
        tts.save(str(output_audio_path))

        audio_b64 = base64.b64encode(output_audio_path.read_bytes()).decode("utf-8")
        return TranslationResult(
            original_text=original_text,
            translated_text=translated_text,
            target_language=normalized_target_language,
            detected_source_language=detected_source_language,
            audio_base64=audio_b64,
            audio_mime_type="audio/mpeg",
            translation_engine=engine,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Translation pipeline failed: {error}") from error
    finally:
        if input_audio_path.exists():
            input_audio_path.unlink(missing_ok=True)
        if normalized_audio_path.exists():
            normalized_audio_path.unlink(missing_ok=True)
        if output_audio_path.exists():
            output_audio_path.unlink(missing_ok=True)

@app.post("/translate-text", response_model=TranslationResult)
async def translate_text_endpoint(request: TextTranslationRequest) -> TranslationResult:
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text to translate is required.")

    normalized_target_language = request.target_language.strip().lower()
    if not normalized_target_language:
        raise HTTPException(status_code=400, detail="Target language is required.")

    # Resolve custom overrides (e.g. Konkani → Marathi for TTS)
    override = CUSTOM_LANGUAGE_OVERRIDES.get(normalized_target_language)
    tts_language = override["tts_lang"] if override else normalized_target_language
    translate_language = override["translate_lang"] if override else normalized_target_language

    if tts_language not in supported_tts_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{normalized_target_language}' is not supported for speech output.",
        )

    try:
        detected_source_language = request.source_language
        if not detected_source_language:
            try:
                detected_source_language = detect(text)
            except Exception:
                detected_source_language = None

        translated_text, engine = translate_text_logic(text, normalized_target_language, detected_source_language)
        if not translated_text:
            raise HTTPException(status_code=422, detail="Translation returned empty text.")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as output_audio:
            output_audio_path = Path(output_audio.name)

        try:
            tts = gTTS(text=translated_text, lang=normalized_target_language)
            tts.save(str(output_audio_path))
            audio_b64 = base64.b64encode(output_audio_path.read_bytes()).decode("utf-8")
        finally:
            if output_audio_path.exists():
                output_audio_path.unlink(missing_ok=True)

        return TranslationResult(
            original_text=text,
            translated_text=translated_text,
            target_language=normalized_target_language,
            detected_source_language=detected_source_language,
            audio_base64=audio_b64,
            audio_mime_type="audio/mpeg",
            translation_engine=engine,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Translation pipeline failed: {error}") from error
