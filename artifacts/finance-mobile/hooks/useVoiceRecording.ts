import { useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { transcribeVoice } from "@workspace/api-client-react";

export type VoiceRecordingState = "idle" | "recording" | "transcribing";

function mimeFromUri(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav": return "audio/wav";
    case "caf": return "audio/x-caf";
    case "3gp":
    case "3gpp": return "audio/3gpp";
    case "aac": return "audio/aac";
    case "mp3": return "audio/mpeg";
    case "m4a":
    case "mp4":
    default: return "audio/mp4";
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecording(lang?: string) {
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [liveText, setLiveText] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nativeRecordingRef = useRef<any>(null);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webRecognitionRef = useRef<any>(null);

  function startTimer() {
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function startSpeechRecognition() {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang === "ar" ? "ar-SA" : "en-US";
      rec.onresult = (event: any) => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        setLiveText(text.trim());
      };
      rec.onerror = () => {};
      rec.onend = () => {};
      rec.start();
      webRecognitionRef.current = rec;
    } catch {
    }
  }

  function stopSpeechRecognition() {
    if (webRecognitionRef.current) {
      try { webRecognitionRef.current.stop(); } catch {}
      webRecognitionRef.current = null;
    }
  }

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    setLiveText("");

    if (Platform.OS === "web") {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("permission_denied");
          return false;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webStreamRef.current = stream;
        webChunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

        const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mr.ondataavailable = (e) => { if (e.data.size > 0) webChunksRef.current.push(e.data); };
        mr.start(100);
        webMediaRecorderRef.current = mr;

        startSpeechRecognition();
        setState("recording");
        startTimer();
        return true;
      } catch {
        setError("permission_denied");
        return false;
      }
    } else {
      try {
        const { Audio } = await import("expo-av");
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) { setError("permission_denied"); return false; }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        nativeRecordingRef.current = recording;
        setState("recording");
        startTimer();
        return true;
      } catch {
        setError("record_failed");
        setState("idle");
        return false;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    stopTimer();
    stopSpeechRecognition();

    if (Platform.OS === "web") {
      const mr = webMediaRecorderRef.current;
      const stream = webStreamRef.current;
      webMediaRecorderRef.current = null;
      webStreamRef.current = null;

      if (!mr) { setState("idle"); return null; }

      try {
        setState("transcribing");
        await new Promise<void>((resolve) => {
          mr.onstop = () => resolve();
          if (mr.state !== "inactive") mr.stop();
          else resolve();
        });
        stream?.getTracks().forEach((t) => t.stop());

        const mimeType = mr.mimeType?.split(";")[0] || "audio/webm";
        const blob = new Blob(webChunksRef.current, { type: mimeType });
        webChunksRef.current = [];

        if (blob.size < 1000) {
          setState("idle");
          setError("record_failed");
          return null;
        }

        const base64 = await blobToBase64(blob);
        if (base64.length > 18_000_000) { setState("idle"); setError("recording_too_long"); return null; }

        const result = await transcribeVoice({ audioBase64: base64, mimeType });
        setState("idle");
        if (result.success && result.text) return result.text;
        setError(result.error ?? "transcribe_failed");
        return null;
      } catch {
        setState("idle");
        setError("transcribe_failed");
        stream?.getTracks().forEach((t) => t.stop());
        return null;
      }
    } else {
      const recording = nativeRecordingRef.current;
      nativeRecordingRef.current = null;
      if (!recording) { setState("idle"); return null; }
      try {
        const { Audio } = await import("expo-av");
        const { FileSystem } = await import("expo-file-system") as any;
        setState("transcribing");
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = recording.getURI();
        if (!uri) { setState("idle"); setError("record_failed"); return null; }
        const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        if (audioBase64.length > 18_000_000) { setState("idle"); setError("recording_too_long"); return null; }
        const result = await transcribeVoice({ audioBase64, mimeType: mimeFromUri(uri) });
        setState("idle");
        if (result.success && result.text) return result.text;
        setError(result.error ?? "transcribe_failed");
        return null;
      } catch {
        setState("idle");
        setError("transcribe_failed");
        return null;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelRecording = useCallback(async () => {
    stopTimer();
    stopSpeechRecognition();
    setLiveText("");

    if (Platform.OS === "web") {
      if (webMediaRecorderRef.current) {
        try { if (webMediaRecorderRef.current.state !== "inactive") webMediaRecorderRef.current.stop(); } catch {}
        webMediaRecorderRef.current = null;
      }
      webStreamRef.current?.getTracks().forEach((t) => t.stop());
      webStreamRef.current = null;
      webChunksRef.current = [];
    } else {
      const recording = nativeRecordingRef.current;
      nativeRecordingRef.current = null;
      if (recording) {
        try {
          const { Audio } = await import("expo-av");
          await recording.stopAndUnloadAsync();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        } catch {}
      }
    }

    setState("idle");
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, error, duration, liveText, startRecording, stopAndTranscribe, cancelRecording };
}
