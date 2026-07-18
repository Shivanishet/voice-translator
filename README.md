# AI Real-Time Voice Translator

This starter project records voice in the browser, sends audio to a Python backend, and returns:

- original text (speech-to-text)
- translated text
- translated speech audio (text-to-speech)

## Tech stack

- Frontend: React + Vite + MediaRecorder API
- Backend: FastAPI
- Speech-to-Text: Whisper
- Translation: Gemini 2.5 Flash (fallback to Google Translate via `deep_translator`)
- Text-to-Speech: gTTS
- Database: Firebase Firestore (for translation history)

## Project structure

- `frontend/` React web app
- `backend/` FastAPI API

## 1) Backend setup

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create env file:

```bash
copy .env.example .env
```

Run backend:

```bash
uvicorn main:app --reload --port 8000
```

## 2) Frontend setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:



Run frontend:

```bash
npm run dev
```

Open the shown Vite URL (usually `http://localhost:5173`).

## Notes

- First Whisper run may be slow because it downloads the model.
- Browser will ask for microphone permission.
- The app automatically saves translation history to a Firebase Firestore database.
- A "History" panel lets you view, restore, and delete past translations.
