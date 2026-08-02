import { useEffect, useState, useRef } from "react";
import { 
  Phone, 
  PhoneOff, 
  PhoneCall, 
  Calendar as CalendarIcon, 
  Mic, 
  MicOff, 
  Send, 
  LogOut, 
  Bot, 
  User as UserIcon, 
  AlertCircle, 
  Check, 
  CheckCircle,
  X, 
  Sparkles,
  Volume2,
  VolumeX,
  Plus,
  HelpCircle,
  RefreshCw
} from "lucide-react";
import { CalendarEvent, GoogleCalendarEvent, Message, CallState, AssistantAction } from "./types";
import CalendarPreview from "./components/CalendarPreview";
import AudioVisualizer from "./components/AudioVisualizer";

// Retrieve SpeechRecognition APIs securely
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const getLocalDateTimeString = () => {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "long"
  };
  const localStr = date.toLocaleString("en-US", options);
  const tzOffset = -date.getTimezoneOffset();
  const diff = tzOffset >= 0 ? "+" : "-";
  const pad = (num: number) => String(num).padStart(2, '0');
  const offsetStr = `${diff}${pad(Math.floor(Math.abs(tzOffset) / 60))}:${pad(Math.abs(tzOffset) % 60)}`;
  
  return `${localStr} (Offset: ${offsetStr})`;
};

const getActionKey = (action?: AssistantAction | null) => {
  if (!action || action.type === "none" || !action.details) return null;
  const type = action.type;
  const start = action.details.start ? new Date(action.details.start).getTime() : 0;
  const end = action.details.end ? new Date(action.details.end).getTime() : 0;
  const title = (action.details.title || "").toLowerCase().trim();
  const eventId = action.details.eventId || "";
  return `${type}:${start}:${end}:${title}:${eventId}`;
};

const DEFAULT_CLINIC_EVENTS: GoogleCalendarEvent[] = [
  {
    id: "surgery-conflict",
    summary: "URGENT: Surgery Conflict - Dr. Abhishek",
    description: JSON.stringify({
      patientName: "John Doe",
      phone: "+1 (555) 234-5678",
      patientEmail: "john.doe@example.com",
      reason: "Orthopedic Knee Consultation",
      patientContext: "Emergency surgery on July 20 requires rescheduling to Tuesday or Wednesday."
    }, null, 2),
    start: { dateTime: "2026-07-20T10:00:00-07:00" },
    end: { dateTime: "2026-07-20T10:30:00-07:00" },
    status: "confirmed"
  },
  {
    id: "routine-checkup-1",
    summary: "Cardiology Follow-up - Sarah Jenkins",
    description: JSON.stringify({
      patientName: "Sarah Jenkins",
      phone: "+1 (555) 382-9102",
      patientEmail: "sarah.j@example.com",
      reason: "Post-op Cardiology Review",
      patientContext: "Requires 2-day prior follow-up confirmation call before July 25."
    }, null, 2),
    start: { dateTime: "2026-07-25T14:00:00-07:00" },
    end: { dateTime: "2026-07-25T14:30:00-07:00" },
    status: "confirmed"
  },
  {
    id: "routine-checkup-2",
    summary: "General Health Review - Michael Chang",
    description: JSON.stringify({
      patientName: "Michael Chang",
      phone: "+1 (555) 891-4021",
      patientEmail: "m.chang@example.com",
      reason: "Annual Physical Examination",
      patientContext: "Patient prefers morning slots only (9:00 AM - 12:00 PM)."
    }, null, 2),
    start: { dateTime: "2026-07-27T10:00:00-07:00" },
    end: { dateTime: "2026-07-27T10:30:00-07:00" },
    status: "confirmed"
  }
];

export interface ParsedPatientDetails {
  patientName: string;
  phone: string;
  patientEmail: string;
  reason: string;
  patientContext: string;
}

export const parseEventPatientDetails = (event: GoogleCalendarEvent): ParsedPatientDetails => {
  let details: ParsedPatientDetails = {
    patientName: "Patient",
    phone: "+1 (555) 019-2831",
    patientEmail: "",
    reason: event.summary || "Medical Consultation",
    patientContext: "Scheduled appointment"
  };

  if (event.description) {
    try {
      const json = JSON.parse(event.description);
      if (typeof json === "object" && json !== null) {
        if (json.patientName) details.patientName = json.patientName;
        if (json.phone) details.phone = json.phone;
        if (json.patientEmail) details.patientEmail = json.patientEmail;
        if (json.reason) details.reason = json.reason;
        if (json.patientContext) details.patientContext = json.patientContext;
      }
    } catch (_) {
      details.patientContext = event.description;
      const nameMatch = event.summary?.match(/-\s*([A-Za-z\s]+)$/);
      if (nameMatch) details.patientName = nameMatch[1].trim();
    }
  } else if (event.summary) {
    const nameMatch = event.summary.match(/-\s*([A-Za-z\s]+)$/);
    if (nameMatch) details.patientName = nameMatch[1].trim();
  }

  return details;
};

export const getFollowUpCallDate = (eventStartISO?: string): Date => {
  if (!eventStartISO) return new Date();
  const apptDate = new Date(eventStartISO);
  // Compute 2 days (48 hours) prior
  return new Date(apptDate.getTime() - 2 * 24 * 60 * 60 * 1000);
};

const getStoredClinicEvents = (): GoogleCalendarEvent[] => {
  try {
    const saved = localStorage.getItem("clinic_calendar_events");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return DEFAULT_CLINIC_EVENTS;
};

const saveStoredClinicEvents = (eventsList: GoogleCalendarEvent[]) => {
  try {
    localStorage.setItem("clinic_calendar_events", JSON.stringify(eventsList));
  } catch (_) {}
};

export default function App() {
  // Calendly connection state - No sign-in required
  const [user, setUser] = useState<any>({
    email: "abhishek@aivanahealth.com",
    displayName: "Dr. Abhishek",
  });
  const [token, setToken] = useState<string | null>("calendly-connected");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Calendar state - Persistent Clinic Calendar
  const [events, setEvents] = useState<GoogleCalendarEvent[]>(getStoredClinicEvents());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Voice Assistant State
  const [callState, setCallState] = useState<CallState>("idle");
  const [callMode] = useState<"live" | "simulated">("live");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAssistantSpeech, setCurrentAssistantSpeech] = useState<string>("");
  const [currentPatientSpeech, setCurrentPatientSpeech] = useState<string>("");
  const [assistantReasoning, setAssistantReasoning] = useState<string>("");
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Action Confirmation State
  const [pendingAction, setPendingAction] = useState<AssistantAction | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{ hasChange: boolean; transcriptSummary: string; action: AssistantAction } | null>(null);

  // Post-Call Auto-Reconciliation states
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [reconcileResult, setReconcileResult] = useState<any>(null);

  // Real-time Live API audio stream refs
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Speech Web APIs Refs
  const executedActionKeysRef = useRef<Set<string>>(new Set());
  const recognitionRef = useRef<any>(null);
  const isSpeechActiveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);

  // Sync messages state to messagesRef
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initial Schedule Load - Calendly instant mode without sign-in
  useEffect(() => {
    setAuthLoading(false);
    setNeedsAuth(false);
    fetchEvents();
  }, []);

  // Load Doctor Calendar Events from Calendly storage instantly
  const fetchEvents = async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const stored = getStoredClinicEvents();
      setEvents(stored);
    } catch (err: any) {
      console.error("Calendly schedule load error:", err);
      setCalendarError(err.message || "Failed to load Calendly schedule.");
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleLogin = async () => {
    setNeedsAuth(false);
    fetchEvents();
  };

  const handleLogout = async () => {
    setNeedsAuth(false);
  };

  // Auto-scroll chat details
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAssistantSpeech, currentPatientSpeech]);

  // Handle Speech Recognition setup
  useEffect(() => {
    if (!SpeechRecognitionAPI) {
      console.warn("SpeechRecognition API is not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognitionAPI();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      isSpeechActiveRef.current = true;
    };

    rec.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        if (callMode === "live") {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "user",
              content: finalTranscript,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
          ]);
          setCurrentPatientSpeech("");
        } else {
          setCurrentPatientSpeech(finalTranscript);
          handlePatientVoiceInput(finalTranscript);
        }
      } else if (interimTranscript) {
        setCurrentPatientSpeech(interimTranscript);
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        setSpeechError("Microphone permission was denied. Iframe environments can block voice capture. Please open the app in a new tab by clicking the icon at the top right of the screen to enable voice input.");
      } else if (e.error === "no-speech") {
        // Safe timeout event
      } else if (e.error === "network") {
        setSpeechError("A network communication error occurred with Google Web Speech. Please check your internet connection.");
      } else {
        console.error("Speech recognition error:", e);
        setSpeechError(`Speech recognition error: "${e.error}". For a seamless voice experience, try opening the application in a new tab.`);
      }
    };

    rec.onend = () => {
      isSpeechActiveRef.current = false;
      // In live mode, we want to keep listening continuously to log patient voice
      const shouldKeepListening = callMode === "live"
        ? (callState === "connected")
        : (callState === "connected" && !isAssistantSpeaking && !isMuted && !pendingAction);

      if (shouldKeepListening) {
        try {
          rec.start();
        } catch (_) {}
      }
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, [callState, isAssistantSpeaking, isMuted, pendingAction, callMode]);

  // Voice engine: speak assistant output
  const speakText = (text: string, onComplete: () => void) => {
    if (!text) return onComplete();

    // Abort active listening during speaking
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Choose voice
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google") && v.name.includes("Female"))
                       || voices.find(v => v.lang.startsWith("en") && v.name.includes("Natural"))
                       || voices.find(v => v.lang.startsWith("en"));
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }
    
    utterance.pitch = 1.05;
    utterance.rate = 1.0;

    utterance.onstart = () => {
      setIsAssistantSpeaking(true);
    };

    utterance.onend = () => {
      setIsAssistantSpeaking(false);
      onComplete();
    };

    utterance.onerror = (e) => {
      console.error("TTS error:", e);
      setIsAssistantSpeaking(false);
      setSpeechError("The browser speech engine failed to speak. This is usually due to audio playback limitations in inside-frame sandboxes. Try opening the application in a new tab.");
      onComplete();
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleInterruption = () => {
    if (callMode === "live") {
      handleLiveInterruption();
    } else {
      window.speechSynthesis.cancel();
      setIsAssistantSpeaking(false);
      // Restart speech recognition immediately
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch (_) {}
        }, 150);
      }
    }
  };

  // Keyboard shortcut to interrupt voice assistant (Spacebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && isAssistantSpeaking) {
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          handleInterruption();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAssistantSpeaking]);

  // Float32 to 16-bit PCM Converter for mic downsampling (rate=16000)
  const floatTo16BitPCM = (input: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToFloat32 = (base64: string): Float32Array => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  };

  const playAudioChunk = (float32Data: Float32Array) => {
    if (!outputAudioCtxRef.current) {
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = outputAudioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    let startTime = nextStartTimeRef.current;
    if (startTime < currentTime) {
      startTime = currentTime + 0.05;
    }

    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    scheduledSourcesRef.current.push(source);
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s !== source);
      if (scheduledSourcesRef.current.length === 0) {
        setIsAssistantSpeaking(false);
        setCurrentAssistantSpeech(current => {
          if (current.trim()) {
            setMessages(prev => [
              ...prev,
              {
                id: Date.now().toString(),
                role: "assistant",
                content: current.trim(),
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
            ]);
          }
          return "";
        });
      }
    };
  };

  const handleLiveInterruption = () => {
    scheduledSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (_) {}
    });
    scheduledSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    setIsAssistantSpeaking(false);
  };

  const initLiveAudioStream = (stream: MediaStream) => {
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    inputAudioCtxRef.current = inputCtx;

    const source = inputCtx.createMediaStreamSource(stream);
    const processor = inputCtx.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;

    source.connect(processor);
    processor.connect(inputCtx.destination);

    processor.onaudioprocess = (e) => {
      if (isMuted) return;
      const channelData = e.inputBuffer.getChannelData(0);
      const pcmBuffer = floatTo16BitPCM(channelData);
      const base64Audio = arrayBufferToBase64(pcmBuffer);
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "audio",
          audio: base64Audio
        }));
      }
    };
  };

  const runPostCallReconciliation = async (historyToUse?: Message[]) => {
    const activeMessages = historyToUse || messages;
    if (activeMessages.length === 0) return;

    setIsReconciling(true);
    setReconcileResult(null);

    try {
      const payload = {
        messages: activeMessages.map(m => ({ role: m.role, content: m.content })),
        doctorCalendarEvents: events,
        currentDateTime: getLocalDateTimeString()
      };

      const res = await fetch("/api/voice-assistant/post-call-reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to post-analyze transcription");
      const data = await res.json();

      const candidateAction = (data.hasChange && data.action && data.action.type !== "none")
        ? data.action
        : (pendingAction && pendingAction.type !== "none" ? pendingAction : null);

      if (candidateAction) {
        setPendingAction(candidateAction);
        setReconcileResult({
          ...data,
          hasChange: true,
          action: candidateAction
        });

        const key = getActionKey(candidateAction);
        if (key && executedActionKeysRef.current.has(key)) {
          console.log("Action was already executed during the live call. Skipping duplicate execution in post-call reconcile:", key);
        } else {
          executeCalendarAction(candidateAction);
        }
      } else {
        setReconcileResult(data);
      }
    } catch (err: any) {
      console.error("Post-call reconcile error:", err);
    } finally {
      setIsReconciling(false);
    }
  };

  const startLiveCall = async (
    purpose: "new" | "reschedule" | "followup" = "new",
    targetEvent?: GoogleCalendarEvent
  ) => {
    try {
      setCallState("ringing");
      setMessages([]);
      setCurrentAssistantSpeech("");
      setCurrentPatientSpeech("");
      setAssistantReasoning("");
      setPendingAction(null);
      setActionSuccessMessage(null);
      setSpeechError(null);
      setReconcileResult(null);

      const details = targetEvent ? parseEventPatientDetails(targetEvent) : {
        patientName: "Abhishek",
        phone: "+1 (555) 019-2831",
        patientEmail: user?.email || "",
        reason: "General Consultation",
        patientContext: "General clinic visit"
      };

      // Request mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/live-stream`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "setup",
          events: events,
          currentDateTime: getLocalDateTimeString(),
          callPurpose: purpose,
          patientName: details.patientName,
          patientEmail: details.patientEmail || user?.email || "",
          patientPhone: details.phone,
          appointmentTitle: targetEvent?.summary || details.reason,
          appointmentStart: targetEvent?.start?.dateTime || targetEvent?.start?.date || "",
          targetEventId: targetEvent?.id || "",
          patientContext: details.patientContext
        }));
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "status" && msg.status === "ready") {
          setCallState("connected");
          initLiveAudioStream(stream);
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (_) {}
          }
        } else if (msg.type === "audio") {
          setIsAssistantSpeaking(true);
          const float32Data = base64ToFloat32(msg.audio);
          playAudioChunk(float32Data);
        } else if (msg.type === "interrupted") {
          handleLiveInterruption();
        } else if (msg.type === "transcription") {
          setIsAssistantSpeaking(true);
          setCurrentAssistantSpeech(prev => {
            const next = prev ? prev + " " + msg.text : msg.text;
            setMessages(current => {
              const last = current[current.length - 1];
              if (last && last.role === "assistant") {
                const updated = [...current];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + " " + msg.text
                };
                return updated;
              } else {
                return [...current, {
                  id: "ast-" + Date.now(),
                  role: "assistant",
                  content: msg.text,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                }];
              }
            });
            return next;
          });
        } else if (msg.type === "patientTranscription") {
          setIsAssistantSpeaking(false);
          setCurrentPatientSpeech(prev => {
            const next = prev ? prev + " " + msg.text : msg.text;
            setMessages(current => {
              const last = current[current.length - 1];
              if (last && last.role === "user") {
                const updated = [...current];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + " " + msg.text
                };
                return updated;
              } else {
                return [...current, {
                  id: "pat-" + Date.now(),
                  role: "user",
                  content: msg.text,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                }];
              }
            });
            return next;
          });
        } else if (msg.type === "action") {
          setPendingAction(msg.action);
          executeCalendarAction(msg.action);
        } else if (msg.type === "error") {
          console.error("Voice Stream Error:", msg.message);
          setSpeechError(`Voice Stream Error: ${msg.message}`);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        setSpeechError("Connection error to live stream server. Try opening the app in a new tab.");
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed.");
        if (callState !== "idle") {
          endLiveCall();
        }
      };

    } catch (err: any) {
      console.error("Failed to start live call:", err);
      setCallState("idle");
      setSpeechError(err.message || "Microphone access denied. If you are inside an iframe, please click the top-right button to open the app in a new tab.");
    }
  };

  const endLiveCall = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (_) {}
      wsRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_) {}
      processorRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      try {
        inputAudioCtxRef.current.close();
      } catch (_) {}
      inputAudioCtxRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    handleLiveInterruption();
    if (outputAudioCtxRef.current) {
      try {
        outputAudioCtxRef.current.close();
      } catch (_) {}
      outputAudioCtxRef.current = null;
    }

    setCallState("completed");

    let latestMessages = [...messagesRef.current];
    if (currentAssistantSpeech.trim()) {
      latestMessages.push({
        id: Date.now().toString(),
        role: "assistant",
        content: currentAssistantSpeech.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
      setCurrentAssistantSpeech("");
    }

    if (latestMessages.length > 0) {
      runPostCallReconciliation(latestMessages);
    } else if (pendingAction) {
      setReconcileResult({
        hasChange: true,
        transcriptSummary: "A scheduling action was successfully requested during the live voice call. Please review the details below to confirm and update the clinic calendar.",
        action: pendingAction
      });
    } else {
      setReconcileResult({
        hasChange: false,
        transcriptSummary: "No active voice dialogue or booking action occurred during this call.",
        action: { type: "none" }
      });
    }
  };

  // Start outbound / scheduled call
  const triggerCall = (type: "new" | "reschedule" | "followup" = "new", targetEvent?: GoogleCalendarEvent) => {
    endCall();

    if (callMode === "live") {
      startLiveCall(type, targetEvent);
    } else {
      setCallState("ringing");
      setMessages([]);
      setCurrentAssistantSpeech("");
      setCurrentPatientSpeech("");
      setAssistantReasoning("");
      setPendingAction(null);
      setActionSuccessMessage(null);

      setTimeout(() => {
        setCallState("connected");
        const details = targetEvent ? parseEventPatientDetails(targetEvent) : { patientName: "Patient" };
        
        let openingPrompt = "";
        if (type === "followup") {
          openingPrompt = `[Assistant triggers automated 2-day prior follow-up call to ${details.patientName}. Introduce yourself as Dr. Abhishek's Clinic Assistant, state you are calling 2 days in advance to confirm their appointment scheduled for ${targetEvent?.start?.dateTime || "the upcoming date"}, and ask if they can attend.]`;
        } else if (type === "reschedule") {
          openingPrompt = "[Assistant triggers outbound call because the doctor has a reschedule conflict on Monday at 10:00 AM. Introduce yourself as Dr. Abhishek's Clinic Assistant, greet the patient, say we noticed a surgical calendar conflict and need to reschedule their Monday appointment to either Tuesday at 2:00 PM or Wednesday at 10:00 AM.]";
        } else {
          openingPrompt = "[Assistant triggers outbound call to book a brand new follow-up appointment with Dr. Abhishek. Greet the patient, state your purpose, and ask when they would like to schedule this.]";
        }

        sendAssistantRequest([{ id: "sys", role: "user", content: openingPrompt, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
      }, 2000);
    }
  };

  // Send conversation history to backend Server API
  const sendAssistantRequest = async (currentMessages: Message[]) => {
    setIsAssistantSpeaking(true);
    try {
      const currentDateTime = getLocalDateTimeString();
      const payload = {
        messages: currentMessages.map(m => ({ role: m.role, content: m.content })),
        doctorCalendarEvents: events,
        currentDateTime,
      };

      const res = await fetch("/api/voice-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Assistant server endpoint failed");
      const data = await res.json();

      setCurrentAssistantSpeech(data.speech);
      setAssistantReasoning(data.reasoning);

      speakText(data.speech, () => {
        const assistantMsg: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: data.speech,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          reasoning: data.reasoning,
        };

        const updatedHistory = [...currentMessages, assistantMsg];
        setMessages(updatedHistory);

        if (data.action && data.action.type !== "none") {
          setPendingAction(data.action);
          executeCalendarAction(data.action);
        } else {
          startListening();
        }
      });

    } catch (err: any) {
      console.error(err);
      setCurrentAssistantSpeech("Sorry, I experienced a brief connection drop. Could you repeat that?");
      speakText("Sorry, I experienced a brief connection drop. Could you repeat that?", () => {
        startListening();
      });
    }
  };

  const startListening = () => {
    if (callMode === "simulated" && recognitionRef.current && !isMuted && !pendingAction) {
      try {
        recognitionRef.current.start();
      } catch (_) {}
    }
  };

  // Handle transcribed patient speech
  const handlePatientVoiceInput = (text: string) => {
    if (!text.trim()) return;

    const patientMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, patientMsg];
    setMessages(newHistory);
    setCurrentPatientSpeech("");

    sendAssistantRequest(newHistory);
  };

  // Direct manual text input support (accessibility + offline fallback)
  const handleManualSend = () => {
    if (!textInput.trim()) return;
    const text = textInput;
    setTextInput("");
    if (callMode === "live") {
      // Direct Live API websocket text input is not required when audio streaming, 
      // but we will keep this as a friendly fallback.
    } else {
      handlePatientVoiceInput(text);
    }
  };

  // End Call
  const endCall = () => {
    if (callMode === "live") {
      endLiveCall();
    } else {
      setCallState("completed");
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
      setIsAssistantSpeaking(false);

      let latestMessages = [...messagesRef.current];
      if (latestMessages.length > 0) {
        runPostCallReconciliation(latestMessages);
      } else if (pendingAction) {
        setReconcileResult({
          hasChange: true,
          transcriptSummary: "A scheduling action was successfully requested during the simulated voice call. Please review the details below to confirm and update the clinic calendar.",
          action: pendingAction
        });
      } else {
        setReconcileResult({
          hasChange: false,
          transcriptSummary: "No active voice dialogue or booking action occurred during this call.",
          action: { type: "none" }
        });
      }
    }
  };

  // Execute Calendar mutations directly with Calendly schedule (Auto-Sync without sign-in)
  const executeCalendarAction = async (actionToExecute?: AssistantAction) => {
    const action = actionToExecute || pendingAction;
    if (!action || action.type === "none") return;
    setPendingAction(action);

    const key = getActionKey(action);
    if (key && executedActionKeysRef.current.has(key)) {
      console.log("Action already executed/synced, skipping duplicate execution:", key);
      return;
    }

    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const details = action.details;
      const type = action.type;

      if (type === "schedule" && details) {
        const title = details.title || "Consultation with Dr. Abhishek";
        const newEvent: GoogleCalendarEvent = {
          id: "calendly-appt-" + Date.now(),
          summary: title,
          description: details.description || "Booked via AI Clinic Voice Assistant (Calendly Sync)",
          start: { dateTime: details.start },
          end: { dateTime: details.end },
          status: "confirmed"
        };
        setEvents(prev => {
          const updated = [newEvent, ...prev.filter(e => e.id !== newEvent.id)];
          saveStoredClinicEvents(updated);
          return updated;
        });

        if (key) executedActionKeysRef.current.add(key);
        setActionSuccessMessage(`✓ Auto-synced to Calendly schedule: "${title}" on ${new Date(details.start!).toLocaleString()}`);
      } 
      
      else if (type === "reschedule" && details) {
        const title = details.title || "Rescheduled Consultation with Dr. Abhishek";
        setEvents(prev => {
          const exists = prev.some(evt => evt.id === details.eventId);
          let updated;
          if (exists) {
            updated = prev.map(evt => evt.id === details.eventId ? {
              ...evt,
              summary: title,
              start: { dateTime: details.start },
              end: { dateTime: details.end }
            } : evt);
          } else {
            const newEvt: GoogleCalendarEvent = {
              id: "calendly-resched-" + Date.now(),
              summary: title,
              description: details.description || "Rescheduled via AI Clinic Voice Assistant (Calendly Sync)",
              start: { dateTime: details.start },
              end: { dateTime: details.end },
              status: "confirmed"
            };
            updated = [newEvt, ...prev.filter(evt => evt.id !== details.eventId)];
          }
          saveStoredClinicEvents(updated);
          return updated;
        });

        if (key) executedActionKeysRef.current.add(key);
        setActionSuccessMessage(`✓ Auto-synced reschedule into Calendly schedule to ${new Date(details.start!).toLocaleString()}`);
      } 
      
      else if (type === "cancel" && details && details.eventId) {
        setEvents(prev => {
          const updated = prev.filter(evt => evt.id !== details.eventId);
          saveStoredClinicEvents(updated);
          return updated;
        });

        if (key) executedActionKeysRef.current.add(key);
        setActionSuccessMessage("✓ Auto-synced cancellation into Calendly schedule.");
      }

      fetchEvents().catch(() => {});

      if (callState === "connected") {
        const closureMessage = `Perfect! I've automatically synchronized your Calendly schedule.`;
        setCurrentAssistantSpeech(closureMessage);
        speakText(closureMessage, () => {
          startListening();
        });
      }

    } catch (err: any) {
      console.error("Calendly schedule auto-sync error:", err);
      setCalendarError(err.message || "Failed to auto-sync with Calendly schedule.");
      setActionSuccessMessage(`Calendly Schedule Notice: ${err.message || "Sync failed"}`);
    } finally {
      setCalendarLoading(false);
    }
  };

  const rejectCalendarAction = () => {
    setPendingAction(null);
    const apology = "No worries, let's look for a different time. When would suit you best instead?";
    setCurrentAssistantSpeech(apology);
    speakText(apology, () => {
      startListening();
    });
  };

  return (
    <div id="app" className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      {/* Top Professional Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-black text-slate-900 tracking-tight leading-none">AI Clinic Voice Assistant</h1>
              <p className="text-xs text-slate-400 font-medium mt-1">Real-time Patient Engagement & Calendar Sync</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-1.5 pr-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-xs">
                Dr
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 leading-none">Dr. Abhishek</p>
                <span className="text-[10px] text-emerald-600 font-mono font-semibold leading-none flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Calendly Auto-Synced
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Panel */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Voice Assistant Dialer/Simulator (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {isReconciling && (
            <div className="w-full bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-100/50 text-center flex flex-col items-center justify-center animate-pulse py-10">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
              <h4 className="text-sm font-bold text-slate-800">Auditing Voice Consultation...</h4>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed font-semibold">
                Analyzing dialogue patterns, tracking clinic constraints, and matching recommended slot modifications...
              </p>
            </div>
          )}

          {reconcileResult && !isReconciling && (
            <div className="w-full bg-gradient-to-br from-slate-900 to-slate-850 text-white rounded-3xl p-6 shadow-xl border border-emerald-500/30 animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 font-mono">Dialogue Audit Resolved</span>
                </div>
                <button 
                  onClick={() => setReconcileResult(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h3 className="text-sm font-bold tracking-tight mt-3 text-slate-100 font-display">Dialogue Summary</h3>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed font-semibold">
                {reconcileResult.transcriptSummary}
              </p>

              {reconcileResult.hasChange && reconcileResult.action && reconcileResult.action.type !== "none" ? (
                <div className="mt-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Auto-Synced to Calendly Schedule</span>
                  </div>
                  <div className="mt-2.5 flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-white">{reconcileResult.action.details?.title || "Doctor Appointment"}</p>
                      {reconcileResult.action.details?.start && (
                        <p className="text-[11px] text-emerald-300 font-semibold font-mono mt-0.5">
                          {new Date(reconcileResult.action.details.start).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-3.5 text-center">
                  <p className="text-xs text-slate-400 font-semibold">
                    No final schedule or calendar modifications were agreed in this call.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 overflow-hidden relative">
            
            {/* Header / Connection State */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-850 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3.5 h-3.5 rounded-full ${callState === "connected" ? "bg-emerald-500 animate-pulse" : callState === "ringing" ? "bg-amber-500 animate-pulse" : "bg-slate-500"}`} />
                <div>
                  <h3 className="text-base font-display font-black tracking-tight">Dr. Abhishek's AI Assistant</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    {callState === "connected" ? "Connected • HD Voice" : callState === "ringing" ? "Ringing Patient..." : "Offline • Ready to dial"}
                  </p>
                </div>
              </div>

              {callState === "connected" && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-2 rounded-xl transition ${isMuted ? "bg-rose-500/20 text-rose-400" : "bg-white/10 hover:bg-white/20 text-white"}`}
                    title={isMuted ? "Unmute Mic" : "Mute Mic"}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            {/* CALL INTERFACE VIEW */}
            <div className="p-6 flex flex-col items-center justify-center min-h-[460px]">
              {speechError && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200/50 rounded-2xl flex gap-3 text-left w-full z-20">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-amber-800 font-display">Voice Capability Info</p>
                    <p className="text-[11px] text-amber-700/95 mt-1 leading-relaxed font-semibold">
                      {speechError}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSpeechError(null)}
                    className="text-amber-500 hover:text-amber-700 p-0.5 rounded-lg self-start transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {callState === "completed" ? (
                <div className="w-full max-w-sm py-6 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4 shadow-sm text-emerald-500 animate-pulse">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-display font-black text-slate-900 tracking-tight">Call Concluded</h3>
                  <p className="text-xs text-slate-400 mt-1">Dr. Abhishek's Clinic Assistant Voice Session</p>

                  {/* Post-Call Reconciliation Status */}
                  <div className="mt-6 w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-sm text-left">
                    <h4 className="text-xs uppercase font-display tracking-wider font-black text-slate-400 mb-3 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-emerald-500" />
                      Post-Call Transcript Audit
                    </h4>

                    {isReconciling ? (
                      <div className="flex flex-col items-center py-6 justify-center gap-3">
                        <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
                        <p className="text-xs font-semibold text-slate-600 animate-pulse text-center">
                          Transcribing and analyzing voice dialog audio...
                        </p>
                        <p className="text-[10px] text-slate-400 text-center">
                          Detecting clinical booking intentions or conflict resolutions
                        </p>
                      </div>
                    ) : reconcileResult ? (
                      <div className="space-y-4">
                        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">AI Transcript Summary</p>
                          <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                            {reconcileResult.transcriptSummary}
                          </p>
                        </div>

                        {actionSuccessMessage ? (
                          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex gap-2.5">
                            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-emerald-800">Clinic Schedule Updated</p>
                              <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed font-semibold">
                                {actionSuccessMessage}
                              </p>
                            </div>
                          </div>
                        ) : reconcileResult.hasChange && pendingAction ? (
                          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 animate-fade-in">
                            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                              Calendly Schedule Auto-Synced
                            </p>
                            
                            <div className="bg-white border border-emerald-100/80 rounded-xl p-3 space-y-1 shadow-sm text-left">
                              <p className="text-xs font-bold text-slate-800">
                                {pendingAction.details?.title || "Doctor Consultation"}
                              </p>
                              {pendingAction.details?.start && (
                                <p className="text-[11px] font-bold text-emerald-600 font-mono">
                                  {new Date(pendingAction.details.start).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : reconcileResult.hasChange ? (
                          <div className="p-3 bg-emerald-50/50 border border-emerald-200/50 rounded-xl">
                            <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-emerald-500" />
                              Auto-Drafted Calendar Modification Found
                            </p>
                            <p className="text-[11px] text-emerald-700 mt-1 font-semibold leading-relaxed">
                              Based on your conversation, a calendar action was agreed. Please review the "Confirm Calendar Action" card above and tap "Confirm Action" to update the clinic schedule.
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-100/50 border border-slate-200/50 rounded-xl">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              No Scheduling Change Detected
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1 font-semibold leading-relaxed">
                              The patient and assistant chatted, but did not finalize a specific appointment change during this call turn.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs text-slate-400">
                        No audio dialogue logged. Make sure the patient speaks clearly.
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setCallState("idle");
                      setMessages([]);
                      setReconcileResult(null);
                      setPendingAction(null);
                    }}
                    className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 px-4 rounded-xl transition shadow flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reset & Start New Session</span>
                  </button>
                </div>
              ) : callState === "idle" || callState === "declined" ? (
                <div className="text-center max-w-sm py-8 flex flex-col items-center">
                  <div className="w-20 h-20 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
                    <PhoneCall className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-display font-black text-slate-900 tracking-tight">Initiate Voice Call</h3>
                  
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold mt-4">
                    Real-Time Direct Voice Mode: Experience ultra-low latency, natural bidirectional conversation, custom voices, and real-time smart scheduling tools.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-4 w-full">
                    <button
                      onClick={() => triggerCall("new")}
                      className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-semibold text-xs py-3.5 px-4 rounded-2xl transition shadow-lg shadow-emerald-500/20 flex flex-col items-center gap-1.5 border border-emerald-400/20 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Book Appointment</span>
                    </button>
                    <button
                      onClick={() => triggerCall("reschedule")}
                      className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-semibold text-xs py-3.5 px-4 rounded-2xl transition shadow-lg shadow-slate-900/10 flex flex-col items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin-slow" />
                      <span>Reschedule Conflict</span>
                    </button>
                  </div>

                  <div className="mt-6 flex items-center justify-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200/60">
                      <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                      <span>Clinic Calendar Live Sync</span>
                    </span>
                  </div>
                </div>
              ) : callState === "ringing" ? (
                <div className="text-center py-8 flex flex-col items-center">
                  <AudioVisualizer state="ringing" />
                  <p className="text-sm text-slate-500 font-medium max-w-xs mt-6">
                    Establishing clinical connection line...
                  </p>
                  <div className="flex gap-4 mt-8">
                    <button
                      onClick={() => setCallState("connected")}
                      className="bg-emerald-500 text-white p-4 rounded-full hover:bg-emerald-600 active:scale-95 transition shadow-lg shadow-emerald-500/20"
                      title="Answer Simulated Call"
                    >
                      <Phone className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => setCallState("declined")}
                      className="bg-rose-500 text-white p-4 rounded-full hover:bg-rose-600 active:scale-95 transition shadow-lg shadow-rose-500/20"
                      title="Decline Call"
                    >
                      <PhoneOff className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              ) : (
                /* ACTIVE CALL LAYOUT */
                <div className="w-full flex flex-col h-full gap-6">
                  {/* Visualizer widget with tap-to-interrupt */}
                  <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-slate-50/30">
                    <AudioVisualizer state={isAssistantSpeaking ? "speaking" : "listening"} />
                    {isAssistantSpeaking && (
                      <button
                        onClick={handleInterruption}
                        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:bg-slate-950/50 z-30 w-full h-full text-center"
                        title="Click to interrupt and speak"
                      >
                        <div className="bg-white hover:bg-slate-50 text-slate-950 font-black px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 transition transform duration-200 hover:scale-105 active:scale-95 animate-bounce border border-slate-200">
                          <VolumeX className="w-4 h-4 text-rose-500 animate-pulse shrink-0" />
                          <span className="text-[10px] uppercase font-display tracking-wider">Tap Screen or Spacebar to Interrupt</span>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Realtime dialogues and speech boxes */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 max-h-[180px] overflow-y-auto">
                    {currentAssistantSpeech && (
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-xs shrink-0 font-bold">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm p-3.5 shadow-sm text-xs font-semibold text-slate-700 leading-relaxed max-w-[85%]">
                          {currentAssistantSpeech}
                        </div>
                      </div>
                    )}

                    {currentPatientSpeech && (
                      <div className="flex items-start gap-3 justify-end">
                        <div className="bg-blue-500 text-white rounded-3xl rounded-tr-sm p-3.5 shadow-sm text-xs font-semibold leading-relaxed max-w-[85%]">
                          {currentPatientSpeech}
                        </div>
                        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs shrink-0 font-bold">
                          <UserIcon className="w-4 h-4" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input options: talk or write manually */}
                  <div className="flex gap-2.5 items-center">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualSend()}
                      placeholder={SpeechRecognitionAPI ? "Press mic and talk, or type your response here..." : "Type your response here..."}
                      className="flex-1 text-xs border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium transition"
                    />
                    <button
                      onClick={handleManualSend}
                      disabled={!textInput.trim()}
                      className="bg-emerald-500 text-white p-3 rounded-xl hover:bg-emerald-600 active:scale-95 disabled:opacity-40 transition shadow-md shadow-emerald-500/10"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex justify-center border-t border-slate-100 pt-4">
                    <button
                      onClick={endCall}
                      className="bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs px-6 py-2.5 rounded-full flex items-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 transition"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>End Conversation</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Reasoning Drawer / Console */}
            {callState === "connected" && assistantReasoning && (
              <div className="bg-slate-50 border-t border-slate-100 p-4 font-mono text-[10px] text-slate-500 max-h-[120px] overflow-y-auto">
                <div className="flex items-center gap-1.5 text-emerald-600 font-bold uppercase tracking-wider mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>Assistant Mind (AI Thought Log)</span>
                </div>
                <p className="leading-relaxed font-semibold">{assistantReasoning}</p>
              </div>
            )}
          </div>

          {/* Active dialogue logs history (under dialer) */}
          {messages.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xl shadow-slate-100/50 space-y-4">
              <h4 className="text-sm font-bold text-slate-800">Dialogue Transcript</h4>
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-3 ${m.role === "assistant" ? "items-start" : "items-start justify-end"}`}>
                    {m.role === "assistant" && (
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`p-3 rounded-2xl text-xs max-w-[80%] ${m.role === "assistant" ? "bg-slate-50 text-slate-700 font-semibold" : "bg-blue-50 text-slate-700 font-semibold"}`}>
                      <p className="leading-relaxed">{m.content}</p>
                      <span className="text-[9px] text-slate-400 block mt-1 font-mono text-right">{m.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Calendly Schedule & Connect Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <CalendarPreview 
            events={events} 
            loading={calendarLoading} 
            error={calendarError}
            onRefresh={() => fetchEvents()} 
            userEmail={user?.email}
          />

          {/* AUTOMATED OUTBOUND FOLLOW-UP CALLS QUEUE */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xl shadow-slate-100/50 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-emerald-500 animate-pulse" />
                  <h3 className="text-base font-display font-extrabold text-slate-900">
                    Automated Follow-Up Call Queue
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Detects Calendly appointments & triggers follow-up calls 2 days prior.
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200/60 font-mono">
                {events.length} Queued
              </span>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No calendar appointments found to queue follow-ups.
                </div>
              ) : (
                events.map((evt) => {
                  const details = parseEventPatientDetails(evt);
                  const apptDateStr = evt.start?.dateTime ? new Date(evt.start.dateTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Scheduled Date";
                  const followUpDate = getFollowUpCallDate(evt.start?.dateTime);
                  const followUpStr = followUpDate.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

                  return (
                    <div 
                      key={evt.id} 
                      className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition duration-200 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{details.patientName}</span>
                            <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">
                              {details.phone}
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                            {evt.summary || details.reason}
                          </p>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                          2-Day Prior Trigger
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-white p-2.5 rounded-xl border border-slate-100 font-mono">
                        <div>
                          <span className="text-slate-400 block font-sans uppercase text-[9px] font-bold">Appointment</span>
                          <span className="font-bold text-slate-700">{apptDateStr}</span>
                        </div>
                        <div>
                          <span className="text-emerald-600 block font-sans uppercase text-[9px] font-bold">Follow-Up Call Date</span>
                          <span className="font-bold text-emerald-600">{followUpStr}</span>
                        </div>
                      </div>

                      {details.patientContext && (
                        <p className="text-[10px] text-slate-500 italic bg-slate-100/60 p-2 rounded-lg leading-relaxed">
                          <strong className="not-italic text-slate-700 font-semibold">Context: </strong>
                          {details.patientContext}
                        </p>
                      )}

                      <button
                        onClick={() => triggerCall("followup", evt)}
                        disabled={callState === "connected" || callState === "ringing"}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs py-2 px-3 rounded-xl transition duration-200 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Launch Follow-Up Call (Browser Demo)</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
              <strong className="text-slate-600">Working Hours Enforcement:</strong> Calls verify doctor schedule & working hours (Mon-Fri, 9am-5pm). Rescheduling automatically cross-references and updates your Calendly schedule.
            </div>
          </div>

          {/* REALTIME ACTION TRIGGER (Workspace Confirmation Requirement) */}
          {pendingAction && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-850 text-white rounded-3xl p-6 border border-emerald-500/30 shadow-2xl animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 font-mono">Approval Required</span>
                  <h3 className="text-sm font-bold tracking-tight mt-0.5">Calendar Mutation Requested</h3>
                </div>
              </div>

              {/* Action breakdown */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-white/5">
                  <span className="text-slate-400">Action Type</span>
                  <span className="font-bold uppercase tracking-wider text-emerald-400 text-[10px] font-mono">
                    {pendingAction.type}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-400">Appointment Description</p>
                  <p className="text-xs font-semibold text-slate-100">
                    {pendingAction.details?.title || "Doctor Consultation"}
                  </p>
                </div>

                {pendingAction.details?.start && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-400">Proposed Slot</p>
                    <p className="text-xs font-bold text-slate-100 font-mono bg-white/5 p-2 rounded-xl border border-white/5">
                      {new Date(pendingAction.details.start).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Control button */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  onClick={executeCalendarAction}
                  disabled={calendarLoading}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-semibold text-xs py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {calendarLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Approve booking</span>
                    </>
                  )}
                </button>
                <button
                  onClick={rejectCalendarAction}
                  className="bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white font-semibold text-xs py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Success Alerts */}
          {actionSuccessMessage && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-emerald-800 flex gap-3 animate-fade-in">
              <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">Action Completed</p>
                <p className="text-[11px] text-emerald-700/90 mt-0.5">{actionSuccessMessage}</p>
              </div>
            </div>
          )}

          {/* Helpful Tips Panel */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xl shadow-slate-100/50 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono">How to Test</h4>
            <div className="space-y-3.5 text-xs text-slate-600">
              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-100">1</div>
                <p className="leading-relaxed font-semibold">
                  The clinic schedule is automatically maintained and synchronized in real-time by the backend app.
                </p>
              </div>
              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-100">2</div>
                <p className="leading-relaxed font-semibold">
                  Click <span className="font-bold text-slate-700">Book Appointment</span> to trigger a live call from Dr. Abhishek's receptionist to book a follow-up.
                </p>
              </div>
              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-100">3</div>
                <p className="leading-relaxed font-semibold">
                  Or click <span className="font-bold text-slate-700">Reschedule Conflict</span> to resolve a conflict where the doctor has a sudden scheduling surgery overlap.
                </p>
              </div>
              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-100">4</div>
                <p className="leading-relaxed font-semibold">
                  Converse smoothly using your voice. Say "Monday doesn't work, what about Tuesday morning?" and check how the assistant automatically selects open slots.
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
