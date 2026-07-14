import { useEffect, useRef, useState } from "react";

const DEFAULT_BACKEND_ORIGIN = "http://127.0.0.1:8000";
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "/api" : DEFAULT_BACKEND_ORIGIN);

type TranslationResponse = {
  original_text: string;
  translated_text: string;
  target_language: string;
  detected_source_language: string | null;
  audio_base64: string;
  audio_mime_type: string;
  translation_engine: string | null;
};

const sourceLanguageOptions = [
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "ja-JP", label: "Japanese" },
  { code: "zh-CN", label: "Chinese" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "ru-RU", label: "Russian" },
];

const targetLanguageOptions = [
  { code: "es", label: "Spanish" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ja", label: "Japanese" },
  { code: "zh-CN", label: "Chinese" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
];

function App() {
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en-US");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [spokenText, setSpokenText] = useState("");
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [translatedAudioObjectUrl, setTranslatedAudioObjectUrl] = useState<string | null>(null);
  const [processingElapsedSec, setProcessingElapsedSec] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);

  // Decode audio base64 on response
  useEffect(() => {
    if (!result?.audio_base64) {
      setTranslatedAudioObjectUrl(null);
      return;
    }
    let binary: Uint8Array;
    try {
      const raw = atob(result.audio_base64);
      binary = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        binary[i] = raw.charCodeAt(i);
      }
    } catch {
      setTranslatedAudioObjectUrl(null);
      setResult(null);
      setError("Translated audio could not be decoded.");
      return;
    }
    const blob = new Blob([binary as BlobPart], { type: result.audio_mime_type || "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    setTranslatedAudioObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [result]);

  // Autoplay translated audio when URL is ready
  useEffect(() => {
    if (translatedAudioObjectUrl && audioRef.current) {
      audioRef.current.play().catch((err) => {
        console.log("Auto-play was prevented by browser policy. Interaction needed.", err);
      });
    }
  }, [translatedAudioObjectUrl]);

  // Processing timer
  useEffect(() => {
    if (!isProcessing) {
      setProcessingElapsedSec(0);
      return;
    }
    setProcessingElapsedSec(0);
    const id = window.setInterval(() => {
      setProcessingElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isProcessing]);

  const stopMicMonitoring = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setMicLevel(0);
  };

  const stopActiveStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    stopMicMonitoring();
  };

  const startMicMonitoring = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;

      const dataArray = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        if (!audioContextRef.current) return;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          const normalized = (dataArray[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setMicLevel(Math.min(1, rms * 6));
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn("Failed to initialize mic visualizer:", e);
    }
  };

  const startRecording = async () => {
    setError(null);
    setResult(null);
    setRecordedAudioBlob(null);

    try {
      // Prompt microphone access & monitor volume
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMicMonitoring(stream);

      // Start MediaRecorder to capture audio for Whisper fallback
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedAudioBlob(blob);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      // Also start browser SpeechRecognition for live preview
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = sourceLanguage;

        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          let interimTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          const combined = (finalTranscript + interimTranscript).trim();
          if (combined) {
            setSpokenText(combined);
          }
        };

        recognition.onerror = (event: any) => {
          // Ignore non-critical errors — MediaRecorder still captures audio
          if (event.error !== "aborted" && event.error !== "no-speech") {
            console.warn("Speech recognition error:", event.error);
          }
        };

        recognition.onend = () => {
          // Speech recognition ended — don't stop recording, MediaRecorder continues
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setIsRecording(true);
    } catch (caughtError) {
      stopActiveStream();
      setError("Microphone access denied or unavailable.");
      console.error(caughtError);
    }
  };

  const stopRecording = () => {
    // Stop browser speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Error stopping recognition:", e);
      }
      recognitionRef.current = null;
    }

    // Stop MediaRecorder (triggers onstop → sets recordedAudioBlob)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Error stopping MediaRecorder:", e);
      }
    }
    mediaRecorderRef.current = null;

    setIsRecording(false);
    stopActiveStream();
  };

  const translateWithAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("target_language", targetLanguage);

      const response = await fetch(`${API_BASE_URL}/translate-audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text();
        let errorMessage = "Audio translation request failed.";
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.detail) {
            errorMessage = parsed.detail;
          }
        } catch {
          if (responseText) {
            errorMessage = responseText;
          }
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as TranslationResponse;
      setSpokenText(payload.original_text);
      setResult(payload);
    } catch (caughtError: any) {
      let message =
        caughtError instanceof Error ? caughtError.message : "Unexpected translation error occurred.";
      setError(message);
      console.error(caughtError);
    } finally {
      setIsProcessing(false);
    }
  };

  const translateText = async () => {
    // If no text was captured by browser speech recognition, use recorded audio as fallback
    if (!spokenText.trim() && recordedAudioBlob) {
      await translateWithAudio(recordedAudioBlob);
      return;
    }

    if (!spokenText.trim()) {
      setError("Please speak or type some text to translate first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    const srcLangCode = sourceLanguage.split("-")[0];

    try {
      const response = await fetch(`${API_BASE_URL}/translate-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: spokenText,
          target_language: targetLanguage,
          source_language: srcLangCode,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        let errorMessage = "Translation request failed.";
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.detail) {
            errorMessage = parsed.detail;
          }
        } catch {
          if (responseText) {
            errorMessage = responseText;
          }
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as TranslationResponse;
      setResult(payload);
    } catch (caughtError: any) {
      let message =
        caughtError instanceof Error ? caughtError.message : "Unexpected translation error occurred.";
      setError(message);
      console.error(caughtError);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="container">
      <header className="header">
        <h1>AI Voice Translator</h1>
        <p className="subtitle">
          Real-time speech recognition & translations powered by Gemini
        </p>
      </header>

      <div className="workspace">
        {/* Left Side: Speech Input Card */}
        <section className="card card-input">
          <div className="card-header">
            <h2>Spoken Speech (Source)</h2>
            <div className="select-wrapper">
              <label htmlFor="source-lang">I am speaking</label>
              <select
                id="source-lang"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                disabled={isRecording || isProcessing}
              >
                {sourceLanguageOptions.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="textarea-container">
            <textarea
              className="text-input"
              value={spokenText}
              onChange={(e) => setSpokenText(e.target.value)}
              placeholder={
                isRecording
                  ? "Listening to you... Speak now."
                  : "Click 'Start Recording' and speak, or type directly here..."
              }
              disabled={isProcessing}
            />
            {isRecording && <div className="recording-glow" />}
          </div>

          <div className="card-footer">
            <div className="mic-indicator">
              <div className="mic-label">
                <span className={`pulse-dot ${isRecording ? "active" : ""}`} />
                <span>{isRecording ? "Recording active" : "Mic idle"}</span>
              </div>
              <div className="mic-meter-track">
                <div
                  className="mic-meter-fill"
                  style={{ width: `${Math.round(micLevel * 100)}%` }}
                />
              </div>
            </div>

            <div className="actions">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="btn btn-record"
                >
                  Start Recording
                </button>
              ) : (
                <button onClick={stopRecording} className="btn btn-stop">
                  Stop Recording
                </button>
              )}

              <button
                onClick={translateText}
                disabled={isRecording || isProcessing || (!spokenText.trim() && !recordedAudioBlob)}
                className="btn btn-translate"
              >
                {isProcessing ? "Translating..." : "Translate & Speak"}
              </button>
            </div>
          </div>
        </section>

        {/* Right Side: Translation Output Card */}
        <section className="card card-output">
          <div className="card-header">
            <h2>Translation (Result)</h2>
            <div className="select-wrapper">
              <label htmlFor="target-lang">Translate to</label>
              <select
                id="target-lang"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={isRecording || isProcessing}
              >
                {targetLanguageOptions.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="translation-result-box">
            {isProcessing ? (
              <div className="spinner-container">
                <div className="spinner" />
                <p className="loading-text">
                  Generating Translation ({processingElapsedSec}s)
                </p>
              </div>
            ) : result ? (
              <div className="result-content animate-fade-in">
                <div className="translation-text">{result.translated_text}</div>
                {translatedAudioObjectUrl && (
                  <div className="audio-player-container">
                    <audio
                      ref={audioRef}
                      controls
                      src={translatedAudioObjectUrl}
                      preload="metadata"
                      className="styled-audio"
                    >
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-placeholder">
                <p>Your translation will appear here after clicking 'Translate & Speak'</p>
              </div>
            )}
          </div>

          <div className="card-footer-info">
            {result && (
              <div className="engine-info">
                <span>
                  <strong>Engine:</strong>{" "}
                  {result.translation_engine === "gemini" ? "✨ Gemini 2.5 Flash" : "🌐 Google Translate"}
                </span>
                <span>
                  <strong>Detected:</strong> {result.detected_source_language?.toUpperCase() ?? "N/A"}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {error && <div className="error-banner">{error}</div>}
    </main>
  );
}

export default App;
