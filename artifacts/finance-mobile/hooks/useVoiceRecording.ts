import { useRef, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { transcribeVoice, MAX_VOICE_BASE64_LENGTH, voiceBlobPayload } from "@workspace/api-client-react";

export type VoiceRecordingState = "idle" | "recording" | "transcribing";

function mimeFromUri(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  return ({ wav: "audio/wav", caf: "audio/x-caf", "3gp": "audio/3gpp", "3gpp": "audio/3gpp", aac: "audio/aac", mp3: "audio/mpeg" } as Record<string, string>)[ext ?? ""] ?? "audio/mp4";
}

export function useVoiceRecording(lang?: string) {
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const [, setErrorState] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [liveText, setLiveText] = useState("");
  const errorRef = useRef<string | null>(null);
  const phaseRef = useRef<VoiceRecordingState | "starting">("idle");
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(audioRecorder);
  recorderRef.current = audioRecorder;
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  function setError(value: string | null) {
    errorRef.current = value;
    if (mountedRef.current) setErrorState(value);
  }
  function transition(value: VoiceRecordingState) {
    phaseRef.current = value;
    if (mountedRef.current) setState(value);
  }
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }
  function stopRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }
  function stopWebResources() {
    stopRecognition();
    if (mediaRef.current?.state === "recording") { try { mediaRef.current.stop(); } catch {} }
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ++generationRef.current;
      stopTimer();
      stopWebResources();
      if (Platform.OS !== "web") {
        void recorderRef.current.stop().catch(() => {}).finally(() => setAudioModeAsync({ allowsRecording: false }).catch(() => {}));
      }
    };
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (phaseRef.current !== "idle") return false;
    phaseRef.current = "starting";
    const generation = ++generationRef.current;
    setError(null);
    setLiveText("");
    try {
      if (Platform.OS === "web") {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("record_failed");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mountedRef.current || generation !== generationRef.current) { stream.getTracks().forEach((t) => t.stop()); return false; }
        streamRef.current = stream;
        chunksRef.current = [];
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
        recorder.onerror = () => {
          if (generation !== generationRef.current) return;
          ++generationRef.current;
          stopTimer(); stopWebResources(); setError("record_failed"); transition("idle");
        };
        mediaRef.current = recorder;
        recorder.start(250);
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SR) {
          try {
            const recognition = new SR();
            recognition.lang = lang === "ar" ? "ar-AE" : "en-US";
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onresult = (event: any) => {
              if (generation !== generationRef.current || !mountedRef.current) return;
              let text = "";
              for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript + " ";
              setLiveText(text.trim());
            };
            recognition.onerror = () => {};
            recognition.start();
            recognitionRef.current = recognition;
          } catch { /* Live captions are optional; actual audio transcription still works. */ }
        }
      } else {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error("permission_denied");
        if (!mountedRef.current || generation !== generationRef.current) return false;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorderRef.current.prepareToRecordAsync();
        if (!mountedRef.current || generation !== generationRef.current) {
          await recorderRef.current.stop().catch(() => {});
          await setAudioModeAsync({ allowsRecording: false });
          return false;
        }
        recorderRef.current.record();
      }
      transition("recording");
      setDuration(0);
      stopTimer();
      timerRef.current = setInterval(() => setDuration((value) => value + 1), 1000);
      return true;
    } catch (err) {
      if (generation !== generationRef.current) return false;
      stopWebResources();
      if (Platform.OS !== "web") await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const name = (err as Error).name;
      setError(name === "NotAllowedError" || (err as Error).message === "permission_denied" ? "permission_denied" : "record_failed");
      transition("idle");
      return false;
    }
  }, [lang]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (phaseRef.current !== "recording") return null;
    const generation = generationRef.current;
    stopTimer(); stopRecognition(); transition("transcribing"); setError(null);
    try {
      let payload: { audioBase64: string; mimeType: string };
      if (Platform.OS === "web") {
        const recorder = mediaRef.current;
        if (!recorder) throw new Error("record_failed");
        await new Promise<void>((resolve, reject) => {
          recorder.onstop = () => resolve();
          recorder.onerror = () => reject(new Error("record_failed"));
          if (recorder.state === "inactive") resolve(); else recorder.stop();
        });
        if (generation !== generationRef.current || !mountedRef.current) return null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRef.current = null;
        payload = await voiceBlobPayload(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        chunksRef.current = [];
      } else {
        const FileSystem = await import("expo-file-system/legacy");
        await recorderRef.current.stop();
        if (generation !== generationRef.current || !mountedRef.current) return null;
        await setAudioModeAsync({ allowsRecording: false });
        const uri = recorderRef.current.uri;
        if (!uri) throw new Error("record_failed");
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.size === 0) throw new Error("record_failed");
        if (Math.ceil(info.size / 3) * 4 > MAX_VOICE_BASE64_LENGTH) throw new Error("recording_too_long");
        const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        payload = { audioBase64, mimeType: mimeFromUri(uri) };
      }
      if (generation !== generationRef.current || !mountedRef.current) return null;
      const result = await transcribeVoice(payload);
      if (generation !== generationRef.current || !mountedRef.current) return null;
      if (!result.success || !result.text?.trim()) throw new Error(result.error || "transcribe_failed");
      return result.text.trim();
    } catch (err) {
      if (generation === generationRef.current && mountedRef.current) {
        const status = (err as { status?: number }).status;
        setError(status === 413 || (err as Error).message === "recording_too_long" ? "recording_too_long" : "transcribe_failed");
      }
      return null;
    } finally {
      if (generation === generationRef.current) {
        stopWebResources();
        if (Platform.OS !== "web") await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        transition("idle");
      }
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    ++generationRef.current;
    stopTimer(); stopWebResources(); setLiveText("");
    if (Platform.OS !== "web") {
      await recorderRef.current.stop().catch(() => {});
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
    transition("idle"); setError(null);
  }, []);

  // A ref-backed getter lets callers read the error immediately after awaiting transcription.
  return { state, get error() { return errorRef.current; }, duration, liveText, startRecording, stopAndTranscribe, cancelRecording };
}
