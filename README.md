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

Copy the Firebase web app values from Firebase Console into these variables:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

In Firebase Console, enable **Authentication > Sign-in method > Email/Password**.
Deploy the root `firestore.rules` file to the same Firebase project. It allows each
signed-in user to read, create, and delete only their own `users/{uid}/history` records.
The old top-level `translations` records have no owner and are intentionally not
automatically assigned to any account.



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
- Sign-up and login use Firebase Authentication; Firebase manages password storage.
- New history is stored at `users/{uid}/history` and is protected by Firestore rules.
