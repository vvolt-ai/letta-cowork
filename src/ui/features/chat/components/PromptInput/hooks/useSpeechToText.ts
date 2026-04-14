/**
 * useSpeechToText — native Web Speech API (Chrome/Electron).
 * Appends recognised text to the current prompt via onTranscript callbacks.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal types for the Web Speech API (not in TS lib by default in some configs)
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] as SpeechRecognitionCtor | undefined)
    ?? (w["webkitSpeechRecognition"] as SpeechRecognitionCtor | undefined)
    ?? null;
}

export const isSpeechSupported = (): boolean => getSpeechRecognition() !== null;

interface UseSpeechToTextOptions {
  /** Called with the final recognised utterance — append to prompt */
  onFinalTranscript: (text: string) => void;
  /** Called with the live interim transcript — show as ghost text */
  onInterimTranscript?: (text: string) => void;
  lang?: string;
}

export function useSpeechToText({
  onFinalTranscript,
  onInterimTranscript,
  lang = "en-US",
}: UseSpeechToTextOptions) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const stoppedManuallyRef = useRef(false);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    // Stop any running instance first
    if (recognitionRef.current) {
      stoppedManuallyRef.current = true;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition: SpeechRecognitionInstance = new Ctor();
    recognitionRef.current = recognition;

    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false; // one utterance, then auto-stops
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      stoppedManuallyRef.current = false;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim && onInterimTranscript) {
        onInterimTranscript(interim);
      }

      if (final) {
        const text = final.trim();
        if (text) onFinalTranscript(text + " ");
        onInterimTranscript?.("");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted" || event.error === "no-speech") {
        // Normal — not a real error
      } else if (event.error === "not-allowed") {
        setError("Microphone permission denied. Allow access in System Settings.");
      } else {
        setError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
      onInterimTranscript?.("");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      onInterimTranscript?.("");
      recognitionRef.current = null;
    };

    recognition.start();
  }, [lang, onFinalTranscript, onInterimTranscript]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      stoppedManuallyRef.current = true;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    onInterimTranscript?.("");
  }, [onInterimTranscript]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { isListening, toggle, start, stop, error, isSupported: isSpeechSupported() };
}
