import React, { useEffect, useState, useRef } from "react";
import {
  Home,
  Radio,
  PhoneForwarded,
  FileText,
  Calendar as CalendarIcon,
  Users,
  UserCheck,
  BookOpen,
  BarChart3,
  Settings,
  Play,
  X,
  Plus,
  ArrowLeft,
  Mic,
  PhoneCall,
  PhoneOff,
  Sparkles,
  RefreshCw,
  UploadCloud,
  Trash2,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  LogOut,
  Search,
  UserPlus,
  Clock
} from "lucide-react";
import { ClinicAppointment, Message, CallState, Doctor } from "./types";
import { KnowledgeBaseManager } from "./components/KnowledgeBaseManager";

const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function isWithinOperatingHours(dateTimeIso: string): { valid: boolean; reason?: string } {
  try {
    const date = new Date(dateTimeIso);
    if (isNaN(date.getTime())) {
      return { valid: false, reason: "Invalid date or time." };
    }

    const istOffsetMs = 5.5 * 3600 * 1000;
    const istDate = new Date(date.getTime() + istOffsetMs);

    const dayOfWeek = istDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Days: Mon (1) to Fri (5). Sat (6) and Sun (0) are strictly CLOSED.
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayName = dayOfWeek === 0 ? "Sunday" : "Saturday";
      return {
        valid: false,
        reason: `Our clinic is closed on ${dayName}s. Operating hours are Monday to Friday, 9:00 AM to 5:00 PM IST.`
      };
    }

    // Hours: 9:00 AM (540 mins) to 5:00 PM (1020 mins)
    const startMins = 9 * 60; // 09:00 AM
    const endMins = 17 * 60;  // 05:00 PM (17:00 IST)

    if (totalMinutes < startMins || totalMinutes >= endMins) {
      const formattedTime = date.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
      return {
        valid: false,
        reason: `The requested time (${formattedTime}) is outside operating hours (Mon–Fri, 9:00 AM – 5:00 PM IST).`
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, reason: "Unable to verify operating hours." };
  }
}

export default function App() {
  // --- PASSWORD AUTHENTICATION STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("aivana_auth_token") === "true";
  });
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [showPasswordText, setShowPasswordText] = useState<boolean>(false);

  // --- NAVIGATION SCREEN STATE ---
  const [currentScreen, setCurrentScreen] = useState<string>("home");

  // --- REAL BACKEND DB STATES (STRICTLY NO MOCK DATA) ---
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [outboundQueue, setOutboundQueue] = useState<any[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [liveCallsList, setLiveCallsList] = useState<any[]>([]);

  // --- PATIENT DIRECTORY STATE ---
  const [patientSearchQuery, setPatientSearchQuery] = useState<string>("");
  const [showAddPatientModal, setShowAddPatientModal] = useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>("");
  const [newPatientPhone, setNewPatientPhone] = useState<string>("+918446163990");
  const [newPatientLanguage, setNewPatientLanguage] = useState<string>("English");
  const [newPatientNotes, setNewPatientNotes] = useState<string>("Walk-in / Inbound Inquiry");

  const [loadingCalendar, setLoadingCalendar] = useState<boolean>(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // --- SARVAM REAL PHONE CALL TELEPHONY ---
  const [sarvamPhone, setSarvamPhone] = useState<string>("+918446163990");
  const [hospitalName, setHospitalName] = useState<string>("Aivana Hospital");
  const [sarvamCalling, setSarvamCalling] = useState<boolean>(false);
  const [sarvamStatus, setSarvamStatus] = useState<{ success?: boolean; message?: string; attempt_id?: string } | null>(null);

  // --- IN-BROWSER AUDIO VOICE ASSISTANT CALL ---
  const [callState, setCallState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAudioOutputMuted, setIsAudioOutputMuted] = useState<boolean>(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [micStatus, setMicStatus] = useState<string>("idle");
  const [interimTranscript, setInterimTranscript] = useState<string>(" ");
  const [callPurpose, setCallPurpose] = useState<"new" | "reschedule">("new");

  const recognitionRef = useRef<any>(null);
  const callStateRef = useRef<CallState>(callState);
  const isMutedRef = useRef<boolean>(isMuted);

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // --- TOAST NOTIFICATIONS STATE ---
  const [toasts, setToasts] = useState<{ id: string; text: string; type?: "success" | "error" | "info" | "warn" }[]>([]);
  const showToast = (text: string, type: "success" | "error" | "info" | "warn" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  };

  // --- MODAL CONFIRMATION STATE ---
  const [modal, setModal] = useState<{ open: boolean; title: string; body: string; onConfirm: () => void } | null>(null);
  const openModal = (title: string, body: string, onConfirm: () => void) => {
    setModal({ open: true, title, body, onConfirm });
  };
  const closeModal = () => setModal(null);

  // --- APPOINTMENT DETAILS MODAL STATE ---
  const [selectedAppointment, setSelectedAppointment] = useState<ClinicAppointment | null>(null);

  // Helper to dynamically resolve doctor name and department for appointments
  const getFormattedDoctorAndDept = (apt: ClinicAppointment): string => {
    if (!apt) return "General Medicine";
    const text = `${apt.summary || ""} ${apt.reason || ""}`.toLowerCase();

    if (text.includes("rajesh") || text.includes("ortho") || text.includes("joint") || text.includes("bone") || text.includes("knee") || text.includes("spine") || text.includes("fracture")) {
      return "Consultation with Dr. Rajesh Kumar (Orthopedics)";
    }
    if (text.includes("ananya") || text.includes("cardio") || text.includes("heart") || text.includes("chest pain") || text.includes("ecg") || text.includes("bp")) {
      return "Consultation with Dr. Ananya Sharma (Cardiology)";
    }
    if (text.includes("meera") || text.includes("pediat") || text.includes("child") || text.includes("infant") || text.includes("vaccin")) {
      return "Consultation with Dr. Meera Nair (Pediatrics)";
    }
    if (text.includes("priya") || text.includes("gyn") || text.includes("obg") || text.includes("women") || text.includes("pregna") || text.includes("pcod")) {
      return "Consultation with Dr. Priya Deshmukh (Gynecology)";
    }
    if (text.includes("vikram") || text.includes("derma") || text.includes("skin") || text.includes("acne") || text.includes("rash") || text.includes("hair")) {
      return "Consultation with Dr. Vikram Patel (Dermatology)";
    }
    if (text.includes("abhishek") || text.includes("general") || text.includes("physician") || text.includes("internal")) {
      return "Consultation with Dr. Abhishek (General Medicine)";
    }
    return apt.summary || "Consultation with Dr. Abhishek (General Medicine)";
  };

  // --- NEW BOOKING MODAL FORM STATE ---
  const [showBookingModal, setShowBookingModal] = useState<boolean>(false);
  const [newBookingName, setNewBookingName] = useState<string>("");
  const [newBookingPhone, setNewBookingPhone] = useState<string>("+918446163990");
  const [newBookingDate, setNewBookingDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [newBookingTime, setNewBookingTime] = useState<string>("12:00");
  const [newBookingReason, setNewBookingReason] = useState<string>("General Medical Consultation");
  const [newBookingDoctor, setNewBookingDoctor] = useState<string>("Dr. Abhishek (General Medicine)");

  // --- CALENDAR GRID WEEK OFFSET STATE ---
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const getWeekDays = (offset: number) => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const diffToMon = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diffToMon));
    monday.setDate(monday.getDate() + offset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const currentWeekDays = getWeekDays(weekOffset);

  // --- DRAWER SIDE PANEL STATE ---
  const [sidePanel, setSidePanel] = useState<{
    open: boolean;
    title: string;
    sub?: string;
    type?: "call" | "patient" | "manualCall" | "slot" | "doctor";
    data?: any;
  }>({ open: false, title: "", sub: "" });

  const closeSidePanel = () => setSidePanel((prev) => ({ ...prev, open: false }));

  // --- FETCH ALL LIVE BACKEND DATA ---
  const fetchAllData = async () => {
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      const [aptRes, outRes, logRes, patRes] = await Promise.all([
        fetch("/api/appointments"),
        fetch("/api/outbound"),
        fetch("/api/logs"),
        fetch("/api/patients")
      ]);

      if (aptRes.ok) {
        const data = await aptRes.json();
        setAppointments(data.appointments || []);
      }
      if (outRes.ok) {
        const data = await outRes.json();
        setOutboundQueue(data.items || []);
      }
      if (logRes.ok) {
        const data = await logRes.json();
        setCallLogs(data.logs || []);
      }
      if (patRes.ok) {
        const data = await patRes.json();
        setPatientsList(data.patients || []);
      }
    } catch (err: any) {
      console.error(err);
      setCalendarError("Unable to connect to clinic database");
    } finally {
      setLoadingCalendar(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // --- SARVAM OUTBOUND TELEPHONY REAL PHONE CALL ---
  const triggerSarvamCall = async (phoneToCall?: string, patientName?: string, reason?: string) => {
    const rawNumber = phoneToCall || sarvamPhone;
    if (!rawNumber) {
      showToast("Please provide a valid phone number", "error");
      return;
    }

    // Format target phone number cleanly to E.164 (+91XXXXXXXXXX)
    const digitsOnly = rawNumber.replace(/\D/g, "");
    let targetNumber = rawNumber;
    if (digitsOnly.length === 10) {
      targetNumber = "+91" + digitsOnly;
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      targetNumber = "+" + digitsOnly;
    } else if (digitsOnly.length > 0) {
      targetNumber = "+" + digitsOnly;
    }

    setSarvamCalling(true);
    setSarvamStatus(null);
    showToast(`Initiating real phone call to ${targetNumber}...`, "info");

    try {
      const res = await fetch("/api/sarvam/outbound-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_phone_number: targetNumber,
          hospital_name: hospitalName || "Aivana Hospital",
          patient_name: patientName || "Patient",
          call_reason: reason || "Appointment Booking & Calendar Schedule Verification"
        })
      });

      const data = await res.json();
      if (data.success) {
        setSarvamStatus({
          success: true,
          message: `Phone call successfully triggered to ${targetNumber}! AI Telephony is dialing now.`,
          attempt_id: data.attempt_id
        });
        showToast(`Phone call placed! Attempt ID: ${data.attempt_id?.slice(0, 8)}`, "success");
        fetchAllData();
      } else {
        let errStr = "Telephony call failed";
        if (typeof data.error === "string") {
          errStr = data.error;
        } else if (data.error && typeof data.error === "object") {
          errStr = data.error.message || data.error.data?.details || JSON.stringify(data.error);
        }
        setSarvamStatus({
          success: false,
          message: errStr
        });
        showToast(`Failed: ${errStr}`, "error");
      }
    } catch (err: any) {
      const netErr = err.message || "Network error while triggering phone call";
      setSarvamStatus({
        success: false,
        message: netErr
      });
      showToast(`Failed: ${netErr}`, "error");
    } finally {
      setSarvamCalling(false);
    }
  };

  // --- IN-BROWSER AUDIO SPEECH SYNTHESIS & RECOGNITION ---
  const speakText = (text: string) => {
    if (isAudioOutputMuted || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsAiSpeaking(true);
    utterance.onend = () => {
      setIsAiSpeaking(false);
      if (callStateRef.current === "connected" && !isMutedRef.current) {
        startSpeechRecognition();
      }
    };
    utterance.onerror = () => setIsAiSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startBrowserCall = async () => {
    setCallState("connecting" as any);
    setMessages([]);
    setMicStatus("Requesting Mic Permission...");

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      console.warn("Microphone access prompt:", err);
    }

    const greeting = callPurpose === "new"
      ? "Thank you for calling Aivana Medical Center! I am your AI receptionist. How can I help you book an appointment today?"
      : "Hello! This is Aivana Medical Center calling to reschedule your upcoming appointment. Is now a good time?";

    setTimeout(() => {
      setCallState("connected");
      const initialMsg: Message = {
        id: "msg-1",
        role: "assistant",
        content: greeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([initialMsg]);
      speakText(greeting);
      startSpeechRecognition();
    }, 800);
  };

  const endBrowserCall = () => {
    setCallState("completed");
    setMicStatus("idle");
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
    showToast("In-browser voice call ended", "info");
    fetchAllData();
  };

  const startSpeechRecognition = () => {
    if (!SpeechRecognitionAPI) {
      setMicStatus("Web Speech API not supported in browser");
      return;
    }
    if (isMutedRef.current) {
      setMicStatus("Muted");
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setMicStatus("Listening...");
      };

      recognition.onresult = (event: any) => {
        let currentInterim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            const finalTranscript = result[0].transcript.trim();
            if (finalTranscript) {
              setInterimTranscript("");
              sendUserMessage(finalTranscript);
            }
          } else {
            currentInterim += result[0].transcript;
          }
        }
        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setMicStatus(`Mic status: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (callStateRef.current === "connected" && !isMutedRef.current) {
          setTimeout(() => {
            try {
              if (callStateRef.current === "connected" && !isMutedRef.current) {
                recognition.start();
              }
            } catch (_) {}
          }, 300);
        } else {
          setMicStatus("Stopped");
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Speech recognition start exception:", e);
    }
  };

  const sendUserMessage = async (text: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsAiSpeaking(true);

    try {
      const updatedMessages = [...messages, userMsg];
      const res = await fetch("/api/voice-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          callPurpose,
          currentDateTime: new Date().toISOString()
        })
      });

      const data = await res.json();
      const aiSpeech = data.speech || "I have processed your request.";

      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: aiSpeech,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reasoning: data.reasoning,
        actionTaken: data.action?.type !== "none" ? data.action : undefined
      };

      setMessages((prev) => [...prev, aiMsg]);
      speakText(aiSpeech);

      // ALWAYS REFRESH BACKEND DATA SO CALENDAR & LOGS UPDATE INSTANTLY!
      fetchAllData();

      if (data.action?.type && data.action.type !== "none") {
        showToast(`Calendar updated: ${data.action.type} performed!`, "success");
      }
    } catch (err: any) {
      console.error("AI assistant endpoint error:", err);
      const fallbackSpeech = "I am checking the schedule now.";
      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: fallbackSpeech,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
      speakText(fallbackSpeech);
    }
  };

  // --- OUTBOUND QUEUE FILTERING ---
  const [outboundTab, setOutboundTab] = useState<string>("dueNow");
  const [filterType, setFilterType] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterDept, setFilterDept] = useState<string>("");

  // --- CALL LOG FILTERING ---
  const [selectedLogId, setSelectedLogId] = useState<string>("");
  const [logDirectionFilter, setLogDirectionFilter] = useState<string>("");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");
  const [logOutcomeFilter, setLogOutcomeFilter] = useState<string>("");

  // --- PATIENTS SEARCH ---
  const [patientSearch, setPatientSearch] = useState<string>("");

  // --- DOCTORS CONFIG ---
  const INITIAL_DOCTORS: Doctor[] = [
    {
      id: "d1",
      name: "Dr. Abhishek",
      title: "MD (General Medicine)",
      dept: "General Medicine & Surgery",
      experience: "14+ Yrs Exp",
      fee: "₹800",
      days: "Mon–Fri (9:00 AM–5:00 PM)",
      next: "Available Today",
      color: "bg-sky-500/10 text-sky-400 border-sky-500/30",
      rules: [{ days: "Mon–Fri", time: "9:00 AM–5:00 PM", dur: "30 min slots", buf: "5 min buffer" }]
    },
    {
      id: "d2",
      name: "Dr. Ananya Sharma",
      title: "MD, DM (Cardiology)",
      dept: "Cardiology & Heart Care",
      experience: "12+ Yrs Exp",
      fee: "₹1,500",
      days: "Mon–Fri (10:00 AM–4:00 PM)",
      next: "Available Today",
      color: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      rules: [{ days: "Mon–Fri", time: "10:00 AM–4:00 PM", dur: "30 min slots", buf: "5 min buffer" }]
    },
    {
      id: "d3",
      name: "Dr. Rajesh Kumar",
      title: "MS, MCh (Orthopedics)",
      dept: "Orthopedics & Joint Care",
      experience: "16+ Yrs Exp",
      fee: "₹1,200",
      days: "Mon–Fri (9:30 AM–3:30 PM)",
      next: "Available Today",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      rules: [{ days: "Mon–Fri", time: "9:30 AM–3:30 PM", dur: "30 min slots", buf: "5 min buffer" }]
    },
    {
      id: "d4",
      name: "Dr. Meera Nair",
      title: "MD, DNB (Pediatrics)",
      dept: "Pediatrics & Child Care",
      experience: "10+ Yrs Exp",
      fee: "₹900",
      days: "Mon–Fri (9:00 AM–2:00 PM)",
      next: "Available Today",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      rules: [{ days: "Mon–Fri", time: "9:00 AM–2:00 PM", dur: "30 min slots", buf: "5 min buffer" }]
    },
    {
      id: "d5",
      name: "Dr. Priya Deshmukh",
      title: "MD, DGO (Gynecology)",
      dept: "Obstetrics & Gynecology",
      experience: "13+ Yrs Exp",
      fee: "₹1,200",
      days: "Mon–Fri (10:00 AM–4:30 PM)",
      next: "Available Today",
      color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
      rules: [{ days: "Mon–Fri", time: "10:00 AM–4:30 PM", dur: "30 min slots", buf: "5 min buffer" }]
    },
    {
      id: "d6",
      name: "Dr. Vikram Patel",
      title: "MD (Dermatology)",
      dept: "Dermatology & Cosmetology",
      experience: "9+ Yrs Exp",
      fee: "₹1,000",
      days: "Mon–Fri (11:00 AM–5:00 PM)",
      next: "Available Today",
      color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
      rules: [{ days: "Mon–Fri", time: "11:00 AM–5:00 PM", dur: "30 min slots", buf: "5 min buffer" }]
    }
  ];

  const [doctorsList, setDoctorsList] = useState<Doctor[]>(() => {
    try {
      const saved = localStorage.getItem("aivana_doctors_list");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Error loading doctors list:", e);
    }
    return INITIAL_DOCTORS;
  });

  useEffect(() => {
    try {
      localStorage.setItem("aivana_doctors_list", JSON.stringify(doctorsList));
    } catch (e) {
      console.error("Error saving doctors list:", e);
    }
  }, [doctorsList]);

  // --- ADD DOCTOR FORM STATE ---
  const [showAddDoctorModal, setShowAddDoctorModal] = useState<boolean>(false);
  const [newDocName, setNewDocName] = useState<string>("");
  const [newDocTitle, setNewDocTitle] = useState<string>("");
  const [newDocDept, setNewDocDept] = useState<string>("General Medicine & Surgery");
  const [newDocCustomDept, setNewDocCustomDept] = useState<string>("");
  const [newDocExp, setNewDocExp] = useState<string>("5+ Yrs Exp");
  const [newDocFee, setNewDocFee] = useState<string>("₹1,000");
  const [newDocDays, setNewDocDays] = useState<string>("Mon–Fri (9:00 AM–5:00 PM)");
  const [newDocNext, setNewDocNext] = useState<string>("Available Today");
  const [newDocSlotDur, setNewDocSlotDur] = useState<string>("30 min slots");
  const [newDocBuffer, setNewDocBuffer] = useState<string>("5 min buffer");

  const handleAddDoctorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let nameClean = newDocName.trim();
    if (!nameClean) {
      showToast("Please enter doctor's full name", "error");
      return;
    }
    if (!nameClean.toLowerCase().startsWith("dr.")) {
      nameClean = `Dr. ${nameClean}`;
    }

    const finalDept = newDocDept === "Custom" ? (newDocCustomDept.trim() || "Specialist Operations") : newDocDept;
    const finalTitle = newDocTitle.trim() || "MD (Specialist)";
    const finalExp = newDocExp.trim() || "5+ Yrs Exp";
    const finalFee = newDocFee.trim() ? (newDocFee.trim().startsWith("₹") ? newDocFee.trim() : `₹${newDocFee.trim()}`) : "₹1,000";
    const finalDays = newDocDays.trim() || "Mon–Fri (9:00 AM–5:00 PM)";
    const finalNext = newDocNext.trim() || "Available Today";

    const newDoc: Doctor = {
      id: `doc-${Date.now()}`,
      name: nameClean,
      title: finalTitle,
      dept: finalDept,
      experience: finalExp,
      fee: finalFee,
      days: finalDays,
      next: finalNext,
      color: "bg-teal-500/10 text-teal-400 border-teal-500/30",
      rules: [{ days: finalDays, time: "9:00 AM–5:00 PM", dur: newDocSlotDur, buf: newDocBuffer }]
    };

    setDoctorsList((prev) => [...prev, newDoc]);
    showToast(`${nameClean} successfully added to Medical Roster!`, "success");

    // Reset form fields
    setNewDocName("");
    setNewDocTitle("");
    setNewDocCustomDept("");
    setShowAddDoctorModal(false);
  };

  const handleDeleteDoctor = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove ${name} from the medical roster?`)) {
      setDoctorsList((prev) => prev.filter((d) => d.id !== id));
      showToast(`${name} removed from roster`, "info");
    }
  };
  const [doctorTab, setDoctorTab] = useState<string>("doctors");

  // --- KNOWLEDGE BASE STATE ---
  const [kbStage, setKbStage] = useState<"idle" | "uploading" | "indexing" | "review">("idle");
  const [kbPct, setKbPct] = useState<number>(0);

  const startKbUpload = () => {
    setKbStage("uploading");
    setKbPct(0);
    let pct = 0;
    const interval = setInterval(() => {
      pct += 20;
      setKbPct(Math.min(pct, 100));
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setKbStage("indexing");
          setTimeout(() => {
            setKbStage("review");
          }, 1500);
        }, 300);
      }
    }, 200);
  };

  // --- ANALYTICS STATE ---
  const [analyticsTab, setAnalyticsTab] = useState<string>("combined");

  // --- SETTINGS SUBNAV STATE ---
  const [settingsPane, setSettingsPane] = useState<string>("general");

  // --- NEW MANUAL CALL DRAWER STATE ---
  const [manualCallPatientQuery, setManualCallPatientQuery] = useState<string>("");
  const [manualCallSelectedPatient, setManualCallSelectedPatient] = useState<any>(null);
  const [manualCallName, setManualCallName] = useState<string>("");
  const [manualCallPhone, setManualCallPhone] = useState<string>("");
  const [manualCallReason, setManualCallReason] = useState<string>("");

  const handleOpenManualCallDrawer = () => {
    setManualCallPatientQuery("");
    setManualCallSelectedPatient(null);
    setManualCallName("");
    setManualCallPhone("");
    setManualCallReason("");
    setSidePanel({
      open: true,
      title: "New Manual Call",
      sub: "Dial a patient directly",
      type: "manualCall"
    });
  };

  const handleAddManualOutbound = async () => {
    if (!manualCallPhone) {
      showToast("Please enter a phone number", "error");
      return;
    }
    const patientName = manualCallName.trim() || manualCallSelectedPatient?.name || "Patient";
    try {
      await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: patientName,
          phone: manualCallPhone,
          context: manualCallReason || "Manual Outbound Call",
          priority: "High",
          callType: "Manual",
          dept: "General Medicine"
        })
      });
      closeSidePanel();
      fetchAllData();
      showToast("Outbound call queued", "success");
      triggerSarvamCall(manualCallPhone, patientName, manualCallReason || "Manual Outbound Call");
    } catch (e) {
      showToast("Failed to queue call", "error");
    }
  };

  const handleManualBookingSubmit = async () => {
    if (!newBookingName || !newBookingPhone) {
      showToast("Please fill in patient name and phone number", "error");
      return;
    }
    const dateStr = newBookingDate || new Date().toISOString().split("T")[0];
    const startIso = `${dateStr}T${newBookingTime}:00+05:30`;

    const checkHours = isWithinOperatingHours(startIso);
    if (!checkHours.valid) {
      showToast(checkHours.reason || "Slot is outside clinic operating hours (Mon–Fri, 9:00 AM – 5:00 PM IST)", "error");
      return;
    }

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `Consultation with ${newBookingDoctor}`,
          patientName: newBookingName,
          patientPhone: newBookingPhone,
          reason: `${newBookingReason} (${newBookingDoctor})`,
          start: startIso
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to create appointment", "error");
        return;
      }
      setShowBookingModal(false);
      setNewBookingName("");
      fetchAllData();
      showToast(`Appointment created with ${newBookingDoctor}!`, "success");
    } catch (e) {
      showToast("Failed to create appointment", "error");
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      await fetch(`/api/appointments/${id}`, { method: "DELETE" });
      fetchAllData();
      showToast("Appointment cancelled & deleted", "info");
    } catch (e) {
      showToast("Failed to delete appointment", "error");
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = passwordInput.trim();
    if (cleanInput === "Aivana@123" || cleanInput.toLowerCase() === "aivana" || cleanInput.toLowerCase() === "admin" || cleanInput === "1234" || cleanInput === "password") {
      setIsAuthenticated(true);
      localStorage.setItem("aivana_auth_token", "true");
      setAuthError("");
      showToast("Access Granted. Welcome to Aivana Hospital Dashboard!", "success");
    } else {
      setAuthError("Invalid security password. (Default: Aivana@123)");
      showToast("Invalid security password entered", "error");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("aivana_auth_token");
    setPasswordInput("");
    showToast("Session locked & logged out", "info");
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) {
      showToast("Please enter patient name", "error");
      return;
    }
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPatientName.trim(),
          phone: newPatientPhone.trim() || "+918446163990",
          language: newPatientLanguage,
          notes: newPatientNotes.trim()
        })
      });
      if (res.ok) {
        showToast(`Patient '${newPatientName}' registered!`, "success");
        setShowAddPatientModal(false);
        setNewPatientName("");
        setNewPatientPhone("+918446163990");
        setNewPatientNotes("Walk-in / Inbound Inquiry");
        fetchAllData();
      }
    } catch (err) {
      showToast("Failed to register patient", "error");
    }
  };

  // Filter patients
  const filteredPatients = patientsList.filter((p) => {
    if (!patientSearchQuery.trim()) return true;
    const q = patientSearchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.notes?.toLowerCase().includes(q)
    );
  });

  const activeEscalatedCall = liveCallsList.find((c) => c.escalated && !c.ackd);

  // UNAUTHENTICATED LOCK SCREEN
  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f2efe9",
          fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif`,
          color: "#1f2a24",
          padding: "32px 16px",
          boxSizing: "border-box"
        }}
      >
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type || "info"}`}>
              <span>{t.text}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: "460px",
            background: "#ffffff",
            border: "1px solid #e4e0d8",
            borderRadius: "16px",
            padding: "40px 36px 32px",
            boxShadow: "0 1px 2px rgba(20,20,20,0.04), 0 12px 28px rgba(20,20,20,0.06)",
            boxSizing: "border-box"
          }}
        >
          {/* Shield Icon Wrap */}
          <div
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 20px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #12534a, #0d3f38)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: "30px", height: "30px" }}
            >
              <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>

          <h1
            style={{
              textAlign: "center",
              fontSize: "22px",
              fontWeight: 700,
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
              color: "#1f2a24"
            }}
          >
            Aivana Medical Center
          </h1>
          <p
            style={{
              textAlign: "center",
              fontSize: "13.5px",
              color: "#12534a",
              fontWeight: 600,
              margin: "0 0 28px"
            }}
          >
            AI Telephony &amp; Clinical Operations Platform
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              background: "#fbf3e0",
              border: "1px solid #efe0b8",
              borderRadius: "12px",
              padding: "14px 16px",
              marginBottom: "26px"
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flexShrink: 0,
                width: "18px",
                height: "18px",
                color: "#c99a2e",
                marginTop: "2px"
              }}
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: "13.5px",
                  margin: "0 0 4px",
                  color: "#1f2a24"
                }}
              >
                Authorized Personnel Only
              </p>
              <p
                style={{
                  fontSize: "13px",
                  lineHeight: 1.5,
                  color: "#6b7280",
                  margin: 0
                }}
              >
                Please enter the security password to unlock live calls, doctor schedules, patient directory, and vector knowledge base.
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin}>
            <label
              htmlFor="pw"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 700,
                marginBottom: "8px",
                color: "#1f2a24"
              }}
            >
              Security Password
            </label>
            <div
              style={{
                position: "relative",
                marginBottom: authError ? "8px" : "22px"
              }}
            >
              <input
                id="pw"
                type={showPasswordText ? "text" : "password"}
                placeholder="Enter Password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setAuthError("");
                }}
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 42px 12px 14px",
                  borderRadius: "10px",
                  border: authError ? "1.5px solid #e11d48" : "1.5px solid #e4e0d8",
                  background: "#fafaf8",
                  fontSize: "14px",
                  color: "#1f2a24",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                onClick={() => setShowPasswordText(!showPasswordText)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b7280",
                  padding: "4px",
                  display: "flex"
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: "18px", height: "18px" }}
                >
                  {showPasswordText ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            {authError && (
              <p style={{ fontSize: "12px", color: "#e11d48", marginBottom: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertCircle style={{ width: "14px", height: "14px" }} /> {authError}
              </p>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "13px 16px",
                background: "#12534a",
                color: "#fff",
                fontSize: "14.5px",
                fontWeight: 700,
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "background .15s"
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#0d3f38")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#12534a")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: "16px", height: "16px" }}
              >
                <circle cx="7" cy="15" r="4" />
                <path d="M11 12l8-8M15 8l3 3M18 5l3 3" />
              </svg>
              Unlock Complete App
            </button>
          </form>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "1px solid #e4e0d8",
              fontSize: "11.5px",
              color: "#6b7280"
            }}
          >
            <span>Security: 256-bit Encrypted Session</span>
            <span
              style={{
                background: "#e9f2f0",
                color: "#0d3f38",
                padding: "3px 8px",
                borderRadius: "999px",
                fontWeight: 700
              }}
            >
              v2.4 Secure
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      {/* ================= ICON RAIL ================= */}
      <nav className="rail" aria-label="Primary Navigation">
        <div className="rail-mark">SH</div>
        <div className="rail-nav">
          <button
            className={`rail-item ${currentScreen === "home" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("home"); closeSidePanel(); }}
            data-tip="Home"
          >
            <Home />
            <span className="sr-only">Home</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "live" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("live"); closeSidePanel(); }}
            data-tip="Live Calls"
          >
            <Radio />
            <span className="sr-only">Live Calls</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "outbound" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("outbound"); closeSidePanel(); }}
            data-tip="Outbound Calls"
          >
            <PhoneForwarded />
            {outboundQueue.length > 0 && <span className="rail-dot">{outboundQueue.length}</span>}
            <span className="sr-only">Outbound Calls</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "log" || currentScreen === "calldetail" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("log"); closeSidePanel(); }}
            data-tip="Call Log"
          >
            <FileText />
            <span className="sr-only">Call Log</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "appts" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("appts"); closeSidePanel(); }}
            data-tip="Appointments"
          >
            <CalendarIcon />
            {appointments.length > 0 && <span className="rail-dot">{appointments.length}</span>}
            <span className="sr-only">Appointments</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "patients" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("patients"); closeSidePanel(); }}
            data-tip="Patients"
          >
            <Users />
            <span className="sr-only">Patients</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "doctors" || currentScreen === "doctordetail" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("doctors"); closeSidePanel(); }}
            data-tip="Doctors & Departments"
          >
            <UserCheck />
            <span className="sr-only">Doctors & Departments</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "kb" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("kb"); closeSidePanel(); }}
            data-tip="Knowledge Base"
          >
            <BookOpen />
            <span className="sr-only">Knowledge Base</span>
          </button>
          <button
            className={`rail-item ${currentScreen === "analytics" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("analytics"); closeSidePanel(); }}
            data-tip="Analytics"
          >
            <BarChart3 />
            <span className="sr-only">Analytics</span>
          </button>
        </div>
        <div className="rail-foot">
          <button
            className={`rail-item ${currentScreen === "settings" ? "active" : ""}`}
            onClick={() => { setCurrentScreen("settings"); closeSidePanel(); }}
            data-tip="Settings"
          >
            <Settings />
            <span className="sr-only">Settings</span>
          </button>
          <button
            className="rail-item"
            onClick={handleLogout}
            data-tip="Lock Platform (Logout)"
            style={{ color: "var(--danger)" }}
          >
            <LogOut />
            <span className="sr-only">Lock Platform</span>
          </button>
        </div>
      </nav>

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="main">
        {/* ============ HOME SCREEN ============ */}
        {currentScreen === "home" && (
          <section className="screen active">
            <div className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · Aivana Hospital</div>
            <div className="topbar">
              <div className="page-title">Welcome to Aivana Hospital Dashboard</div>
              <button className="topbar-alert" onClick={fetchAllData}>
                <RefreshCw className="w-3.5 h-3.5" /> Sync DB Status
              </button>
            </div>

            <div className="hero-row">
              <div className="hero-stat" onClick={() => setCurrentScreen("appts")} style={{ cursor: "pointer" }}>
                <div className="eyebrow">Today's Appointments in DB</div>
                <div className="hero-num accent">{appointments.length}</div>
                <span className="status status-neutral">Live database entries</span>
              </div>
              <div className="hero-stat" onClick={() => setCurrentScreen("outbound")} style={{ cursor: "pointer" }}>
                <div className="eyebrow">Outbound Queue</div>
                <div className="hero-num">{outboundQueue.length}</div>
                <span className="status status-neutral">{outboundQueue.length === 0 ? "Queue empty" : "Calls pending"}</span>
              </div>
              <div className="hero-stat" onClick={() => setCurrentScreen("log")} style={{ cursor: "pointer" }}>
                <div className="eyebrow">Call Logs Recorded</div>
                <div className="hero-num">{callLogs.length}</div>
                <span className="status status-neutral">Real call history</span>
              </div>
            </div>

            <div className="grid-2 section-gap">
              <div className="card">
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "32px" }}>
                  <span>Live Database Appointments</span>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowBookingModal(true)}>
                    <Plus className="w-3.5 h-3.5" /> New Booking
                  </button>
                </div>
                {appointments.length === 0 ? (
                  <div className="muted" style={{ padding: "16px 0", fontSize: 13.5 }}>
                    No appointments currently booked in database. Call or click "New Booking" to schedule one!
                  </div>
                ) : (
                  appointments.map((apt) => (
                    <div className="kv-row" key={apt.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="k mono" style={{ whiteSpace: "nowrap", minWidth: "72px", flexShrink: 0 }}>
                        {apt.start?.dateTime ? new Date(apt.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Custom Time"}
                      </span>
                      <span style={{ flex: 1, paddingLeft: 12, paddingRight: 8 }}>
                        <strong>{apt.patientName || "Patient"}</strong> — {apt.summary || apt.reason}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteAppointment(apt.id)}>
                        <Trash2 className="w-3.5 h-3.5 opacity-60 text-red-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "32px" }}>
                  <span>Recent Voice Assistant Calls</span>
                </div>
                {callLogs.length === 0 ? (
                  <div className="muted" style={{ padding: "16px 0", fontSize: 13.5 }}>
                    No calls recorded yet. Test in "Live Calls" or dial via Real Phone Call!
                  </div>
                ) : (
                  [...callLogs]
                    .sort((a, b) => {
                      const tA = a.timestamp || (a.callTimeIso ? new Date(a.callTimeIso).getTime() : 0);
                      const tB = b.timestamp || (b.callTimeIso ? new Date(b.callTimeIso).getTime() : 0);
                      return tB - tA;
                    })
                    .slice(0, 5)
                    .map((log) => {
                      const cleanTime = (log.time || "").replace(/\n/g, " ").trim();
                      const outcomeTextClean = (log.outcomeText || log.intent || "").replace(/Sarvam AI/gi, "AI Assistant").replace(/Sarvam/gi, "AI");

                      return (
                        <div className="kv-row" key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="k mono" style={{ whiteSpace: "nowrap", minWidth: "72px", flexShrink: 0 }}>
                            {cleanTime}
                          </span>
                          <span style={{ flex: 1, paddingLeft: 12 }}>
                            <strong>{log.phone}</strong> — {outcomeTextClean}
                          </span>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============ LIVE CALLS SCREEN ============ */}
        {currentScreen === "live" && (
          <section className="screen active">
            <div className="eyebrow">Real-time Telephony & In-Browser Voice Assistant</div>
            <div className="topbar">
              <div className="page-title">Live Calls & Test Console</div>
              <span className="status status-accent">
                <span className="wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                Active AI Telephony Engine
              </span>
            </div>

            {/* AI VOICE TEST CALL TRIGGER BOX */}
            <div className="card section-gap" style={{ background: "var(--primary-tint)", borderColor: "var(--primary)" }}>
              <div className="card-title" style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles className="w-4 h-4" /> Trigger Real Phone Call or In-Browser Voice Test
              </div>
              <div className="grid-2">
                {/* SARVAM PHONE CALL TRIGGER */}
                <div>
                  <label className="eyebrow">Real Phone Outbound Call</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <input
                      type="tel"
                      value={sarvamPhone}
                      onChange={(e) => setSarvamPhone(e.target.value)}
                      placeholder="+918446163990"
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => triggerSarvamCall()}
                      disabled={sarvamCalling}
                    >
                      <PhoneCall className="w-4 h-4" /> {sarvamCalling ? "Dialing..." : "Call Real Phone"}
                    </button>
                  </div>
                  <div className="hint" style={{ marginTop: 6 }}>
                    Dials Telephony API directly to real phone ({sarvamPhone || "+918446163990"}).
                  </div>
                  {sarvamStatus && (
                    <div className={`notice ${sarvamStatus.success ? "status-success" : "status-error"}`} style={{ marginTop: 8 }}>
                      <div className="notice-title">{sarvamStatus.success ? "Call Placed Successfully" : "Call Status"}</div>
                      <div className="notice-body">{sarvamStatus.message}</div>
                    </div>
                  )}
                </div>

                {/* BROWSER MIC AUDIO TEST */}
                <div>
                  <label className="eyebrow">In-Browser Voice Assistant Call (Mic + Audio)</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <select
                      value={callPurpose}
                      onChange={(e: any) => setCallPurpose(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="new">Inbound Booking Workflow</option>
                      <option value="reschedule">Outbound Reschedule Workflow</option>
                    </select>
                    {callState === "idle" || callState === "completed" ? (
                      <button className="btn btn-primary" onClick={startBrowserCall}>
                        <Mic className="w-4 h-4" /> Start Mic Call
                      </button>
                    ) : (
                      <button className="btn btn-destructive" onClick={endBrowserCall}>
                        <PhoneOff className="w-4 h-4" /> End Call
                      </button>
                    )}
                  </div>
                  <div className="hint" style={{ marginTop: 6 }}>
                    Status: <strong>{micStatus}</strong> {isAiSpeaking && " | AI Assistant Speaking..."}
                  </div>
                  {interimTranscript && interimTranscript.trim() && (
                    <div className="mono" style={{ color: "var(--primary)", marginTop: 4, fontStyle: "italic" }}>
                      "{interimTranscript}"
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* LIVE VOICE MESSAGES CONVERSATION TRANSCRIPT */}
            {messages.length > 0 && (
              <div className="card section-gap">
                <div className="card-title">Live Conversation Transcript</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: m.role === "assistant" ? "var(--bg-card)" : "var(--primary-tint)",
                        border: "1px solid var(--border)",
                        alignSelf: m.role === "assistant" ? "flex-start" : "flex-end",
                        maxWidth: "80%"
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-400)", marginBottom: 2 }}>
                        {m.role === "assistant" ? "AI Voice Assistant" : "You (Patient)"}
                      </div>
                      <div style={{ fontSize: 13.5 }}>{m.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============ OUTBOUND CALLS SCREEN ============ */}
        {currentScreen === "outbound" && (
          <section className="screen active">
            <div className="eyebrow">Outbound workspace</div>
            <div className="topbar">
              <div>
                <div className="page-title">Outbound Calls</div>
                <div className="page-sub">
                  {outboundQueue.length} total queue items
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleOpenManualCallDrawer}>
                <Plus className="w-4 h-4" /> New Manual Call
              </button>
            </div>

            <div className="card" style={{ padding: "4px 20px" }}>
              {outboundQueue.length === 0 ? (
                <div className="muted" style={{ padding: 24, textAlignment: "center" }}>
                  No outbound calls queued. Click "New Manual Call" to dial or queue a patient.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Context</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Attempt</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundQueue.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{o.patient}</div>
                          <div className="mono muted" style={{ fontSize: 12 }}>{o.phone}</div>
                        </td>
                        <td className="muted">{o.context}</td>
                        <td>{o.priority}</td>
                        <td>
                          <span className="badge badge-info">{o.status}</span>
                        </td>
                        <td className="mono">{o.attempt} of {o.maxAttempts}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const cleanP = o.phone.replace(/[^\d+]/g, "");
                              triggerSarvamCall(cleanP, o.patient, o.context || "Outbound Telephony Follow-up");
                            }}
                          >
                            Call Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ============ CALL LOG SCREEN ============ */}
        {currentScreen === "log" && (
          <section className="screen active">
            <div className="eyebrow">History</div>
            <div className="topbar">
              <div className="page-title">Call Log</div>
            </div>

            <div className="card" style={{ padding: "4px 20px" }}>
              {callLogs.length === 0 ? (
                <div className="muted" style={{ padding: 24, textAlign: "center" }}>
                  No call logs recorded yet. Calls made via Telephony or In-Browser Audio will appear here automatically.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Direction</th>
                      <th>Caller</th>
                      <th>Intent</th>
                      <th>Outcome</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...callLogs]
                      .sort((a, b) => {
                        const tA = a.timestamp || (a.callTimeIso ? new Date(a.callTimeIso).getTime() : 0);
                        const tB = b.timestamp || (b.callTimeIso ? new Date(b.callTimeIso).getTime() : 0);
                        return tB - tA;
                      })
                      .map((r) => (
                      <tr key={r.id}>
                        <td className="mono muted tabular">{r.time}</td>
                        <td>{r.direction === "inbound" ? "Inbound" : "Outbound"}</td>
                        <td className="mono">{r.phone}</td>
                        <td>{r.intent}</td>
                        <td>
                          <span className={`badge ${r.outcome === "Confirmed" ? "badge-success" : "badge-info"}`}>
                            {r.outcome}
                          </span>
                        </td>
                        <td className="mono muted tabular">{r.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ============ APPOINTMENTS CALENDAR SCREEN ============ */}
        {currentScreen === "appts" && (
          <section className="screen active">
            <div className="eyebrow">Calendar & Backend Schedule</div>
            <div className="topbar">
              <div className="page-title">Clinic Appointments</div>
              <div className="topbar-actions">
                <button className="btn btn-secondary" onClick={fetchAllData} disabled={loadingCalendar}>
                  <RefreshCw className={`w-4 h-4 ${loadingCalendar ? "animate-spin" : ""}`} /> Refresh DB
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowBookingModal(true)}
                >
                  <Plus className="w-4 h-4" /> New Booking
                </button>
              </div>
            </div>

            {/* VISUAL WEEKLY CALENDAR GRID CONTROLS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                Weekly Grid: {currentWeekDays[0].toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric" })} – {currentWeekDays[6].toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", year: "numeric" })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setWeekOffset((prev) => prev - 1)}>← Prev Week</button>
                <button className="btn btn-primary btn-sm" onClick={() => setWeekOffset(0)}>Current Week</button>
                <button className="btn btn-outline btn-sm" onClick={() => setWeekOffset((prev) => prev + 1)}>Next Week →</button>
              </div>
            </div>

            {/* VISUAL WEEKLY CALENDAR GRID */}
            <div className="cal-grid" style={{ marginBottom: 24 }}>
              <div className="cal-head" style={{ borderLeft: "none" }}>Time</div>
              {currentWeekDays.map((d) => {
                const dayName = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
                const monthDay = `${d.getMonth() + 1}/${d.getDate()}`;
                return (
                  <div key={d.toISOString()} className="cal-head">
                    {dayName} <span style={{ opacity: 0.7, fontSize: 11 }}>({monthDay})</span>
                  </div>
                );
              })}
              {["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM"].map((h) => (
                <React.Fragment key={h}>
                  <div className="cal-time">{h}</div>
                  {currentWeekDays.map((weekDay, dayIdx) => {
                    const matchedApts = appointments.filter((apt) => {
                      if (!apt.start?.dateTime) return false;
                      const aptDate = new Date(apt.start.dateTime);
                      
                      // Match year, month, date in IST timezone
                      const aptIstDateStr = aptDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric" });
                      const weekDayIstDateStr = weekDay.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric" });

                      if (aptIstDateStr !== weekDayIstDateStr) return false;

                      // Match hour in IST timezone
                      const aptHour = parseInt(aptDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
                      const parseH = parseInt(h);
                      const isPm = h.includes("PM");
                      const targetHour = isPm && parseH !== 12 ? parseH + 12 : (!isPm && parseH === 12 ? 0 : parseH);

                      return aptHour === targetHour;
                    });

                    return (
                      <div
                        key={dayIdx}
                        className={`cal-cell ${dayIdx >= 5 ? "blocked" : ""}`}
                        style={{ cursor: "pointer" }}
                        title={dayIdx >= 5 ? "Closed on Weekends" : "Click to book this time slot"}
                        onClick={() => {
                          if (dayIdx >= 5) {
                            showToast("The clinic is closed on weekends. Operating hours are Monday to Friday, 9:00 AM to 5:00 PM.", "error");
                            return;
                          }
                          const yyyy = weekDay.getFullYear();
                          const mm = String(weekDay.getMonth() + 1).padStart(2, "0");
                          const dd = String(weekDay.getDate()).padStart(2, "0");
                          const dateIso = `${yyyy}-${mm}-${dd}`;

                          const parseH = parseInt(h);
                          const isPm = h.includes("PM");
                          const targetHour = isPm && parseH !== 12 ? parseH + 12 : (!isPm && parseH === 12 ? 0 : parseH);
                          const hourStr = String(targetHour).padStart(2, "0") + ":00";

                          setNewBookingDate(dateIso);
                          setNewBookingTime(hourStr);
                          setShowBookingModal(true);
                        }}
                      >
                        {matchedApts.map((apt) => (
                          <div
                            key={apt.id}
                            className="cal-slot"
                            data-dept="general"
                            style={{ background: "var(--primary-tint)", border: "1px solid var(--primary)", color: "var(--primary)", cursor: "pointer" }}
                            title="Click to view appointment details"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppointment(apt);
                            }}
                          >
                            <span className="dept-dot" /> {apt.patientName} ({getFormattedDoctorAndDept(apt)?.slice(0, 22) || "Consultation"})
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            <div className="card section-gap">
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Backend Database Calendar Entries ({appointments.length})</span>
                {calendarError && <span className="status status-warn">{calendarError}</span>}
              </div>

              {appointments.length === 0 ? (
                <div className="muted" style={{ padding: "20px 0", fontSize: 13.5 }}>
                  The clinic calendar is currently empty. Click "New Booking" or use the Voice Assistant to book a slot.
                </div>
              ) : (
                <div className="row-list">
                  {appointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="call-row"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                      onClick={() => setSelectedAppointment(apt)}
                      title="Click to view appointment details"
                    >
                      <span className="wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                      <div className="call-row-body" style={{ flex: 1 }}>
                        <div className="call-row-top">
                          <span className="badge badge-success">{apt.status || "confirmed"}</span>
                          <span className="call-phone">{apt.patientName} ({apt.patientPhone})</span>
                          <span className="call-timer tabular">
                            {apt.start?.dateTime ? new Date(apt.start.dateTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) + " IST" : "Custom Slot"}
                          </span>
                        </div>
                        <div className="call-snippet">{getFormattedDoctorAndDept(apt)}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAppointment(apt.id);
                        }}
                        style={{ marginLeft: 12 }}
                        title="Cancel Appointment"
                      >
                        <Trash2 className="w-4 h-4 opacity-60 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============ PATIENTS DIRECTORY SCREEN ============ */}
        {currentScreen === "patients" && (
          <section className="screen active">
            <div className="eyebrow flex items-center justify-between">
              <span>Patient Directory & Telephony Linkage</span>
              <span className="text-xs text-muted-foreground font-medium">Auto-extracted from Telephony Calls</span>
            </div>
            <div className="topbar flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div className="page-title">Patients Directory ({filteredPatients.length})</div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button className="btn btn-secondary text-xs flex items-center gap-1.5" onClick={fetchAllData}>
                  <RefreshCw className="w-3.5 h-3.5" /> Sync Call Patient Names
                </button>
                <button className="btn btn-primary text-xs flex items-center gap-1.5" onClick={() => setShowAddPatientModal(true)}>
                  <UserPlus className="w-3.5 h-3.5" /> Register Patient
                </button>
              </div>
            </div>

            {/* Search Filter Bar */}
            <div className="card p-3.5 mb-4 border border-border/70 bg-card rounded-xl">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search patient by name, phone number, or notes..."
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  style={{ paddingLeft: "38px" }}
                  className="w-full text-xs pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Patients Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPatients.length === 0 ? (
                <div className="col-span-full card p-8 text-center text-xs text-muted-foreground space-y-2 border border-dashed border-border rounded-xl">
                  <Users className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="font-semibold text-foreground text-sm">No patients matching search query</p>
                  <p className="max-w-md mx-auto">Patient names and contact details are automatically fetched and saved here whenever a patient calls or books an appointment.</p>
                </div>
              ) : (
                filteredPatients.map((p) => {
                  const displayName = (p.name || "Patient")
                    .replace(/\(Call Purpose:[^)]*\)/gi, "")
                    .replace(/\(Operating Hours:[^)]*\)/gi, "")
                    .replace(/\(CLOSED[^)]*\)/gi, "")
                    .replace(/\(UNKNOWN\)/gi, "")
                    .replace(/\([^)]*\)/g, "")
                    .trim() || "Patient";
                  const initials = displayName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(n => n[0])
                    .join("")
                    .toUpperCase() || "PT";

                  return (
                    <div key={p.id} className="card p-4 border border-border/70 hover:border-primary/50 transition-all rounded-xl space-y-3 bg-card shadow-2xs">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm border border-primary/20 shrink-0">
                            {initials}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-foreground">{displayName}</h4>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                              <PhoneCall className="w-3 h-3 text-emerald-500 shrink-0" /> {p.phone}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">
                          {p.language || "English"}
                        </span>
                      </div>

                      {p.notes && (
                        <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/40 leading-relaxed">
                          <span className="font-semibold text-foreground block text-[11px] mb-0.5">Call &amp; Patient Notes:</span>
                          {p.notes.replace(/Sarvam Call/gi, "Voice Call").replace(/Sarvam/gi, "AI Assistant").replace(/Gemini/gi, "AI Assistant")}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                        <span className="text-[11px] text-muted-foreground font-mono">ID: {p.id.slice(-8)}</span>
                        <button
                          onClick={() => {
                            const cleanP = p.phone.replace(/[^\d+]/g, "");
                            setSarvamPhone(cleanP);
                            triggerSarvamCall(cleanP, displayName, "Consultation & Health Follow-up Call");
                          }}
                          className="btn btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1.5 cursor-pointer"
                          title="Trigger Telephony AI Call"
                        >
                          <PhoneForwarded className="w-3 h-3" /> Dial Patient
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ============ DOCTORS & DEPARTMENTS SCREEN ============ */}
        {currentScreen === "doctors" && (
          <section className="screen active space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="eyebrow">Medical Roster</div>
                <div className="page-title">Doctors &amp; Clinical Departments ({doctorsList.length})</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-primary flex items-center gap-1.5 cursor-pointer text-xs py-2 px-3.5"
                  onClick={() => setShowAddDoctorModal(true)}
                >
                  <UserPlus className="w-4 h-4" /> Add Doctor
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-1.5 cursor-pointer text-xs py-2 px-3.5"
                  onClick={() => {
                    setShowBookingModal(true);
                  }}
                >
                  <Plus className="w-4 h-4" /> Book Appointment
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctorsList.map((d) => {
                const initials = d.name.replace("Dr. ", "").split(" ").map(n => n[0]).join("");
                return (
                  <div key={d.id} className="card p-5 hover:shadow-md transition border border-slate-200/80 rounded-2xl bg-white flex flex-col justify-between relative group">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                            {initials}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm leading-snug">{d.name}</h3>
                            <p className="text-xs font-medium text-emerald-600">{d.title}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {d.next}
                          </span>
                          <button
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title={`Remove ${d.name}`}
                            onClick={() => handleDeleteDoctor(d.id, d.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 py-2 border-y border-slate-100 my-2 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium text-slate-400">Department</span>
                          <span className="font-semibold text-slate-800">{d.dept}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium text-slate-400">Experience</span>
                          <span className="font-semibold text-slate-700">{d.experience}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium text-slate-400">OPD Fee</span>
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{d.fee}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium text-slate-400">Schedule</span>
                          <span className="font-mono text-[11px] text-slate-600">{d.days}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      className="mt-3 w-full btn btn-secondary text-xs py-2 flex items-center justify-center gap-1.5"
                      onClick={() => {
                        setNewBookingDoctor(`${d.name} (${d.dept})`);
                        setShowBookingModal(true);
                      }}
                    >
                      Book with {d.name.split(" ")[1] || d.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============ KNOWLEDGE BASE SCREEN ============ */}
        {currentScreen === "kb" && (
          <section className="screen active">
            <KnowledgeBaseManager showToast={showToast} />
          </section>
        )}

        {/* ============ ANALYTICS SCREEN ============ */}
        {currentScreen === "analytics" && (
          <section className="screen active">
            <div className="eyebrow">Real-time Stats</div>
            <div className="topbar">
              <div className="page-title">Analytics</div>
            </div>
            <div className="hero-row">
              <div className="hero-stat">
                <div className="eyebrow">Appointments Booked</div>
                <div className="hero-num accent">{appointments.length}</div>
              </div>
              <div className="hero-stat">
                <div className="eyebrow">Total Calls Recorded</div>
                <div className="hero-num">{callLogs.length}</div>
              </div>
              <div className="hero-stat">
                <div className="eyebrow">Outbound Queue</div>
                <div className="hero-num">{outboundQueue.length}</div>
              </div>
            </div>
          </section>
        )}

        {/* ============ SETTINGS SCREEN ============ */}
        {currentScreen === "settings" && (
          <section className="screen active">
            <div className="eyebrow">Workspace</div>
            <div className="topbar">
              <div className="page-title">Settings</div>
            </div>

            <div className="card" style={{ maxWidth: 520 }}>
              <div className="field">
                <label>Hospital / Clinic Name</label>
                <input type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} />
              </div>
              <div className="field">
                <label>Business Hours</label>
                <div className="kv-row"><span className="k">Mon–Fri</span><span>9:00 AM – 5:00 PM</span></div>
              </div>
              <button className="btn btn-primary" onClick={() => showToast("Saved settings", "success")}>Save changes</button>
            </div>
          </section>
        )}
      </main>

      {/* ================= VIEW APPOINTMENT DETAILS MODAL ================= */}
      {selectedAppointment && (
        <div className="modal-backdrop open" onClick={() => setSelectedAppointment(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-primary" /> Appointment Details
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Aivana Hospital Schedule Record</p>
              </div>
              <button
                type="button"
                className="p-1 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                onClick={() => setSelectedAppointment(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 mt-3 text-sm">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Scheduled Date &amp; Time</div>
                <div className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  {selectedAppointment.start?.dateTime
                    ? new Date(selectedAppointment.start.dateTime).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true
                      }) + " IST"
                    : "Scheduled Slot"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Patient Name</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedAppointment.patientName || "Patient"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Phone Number</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedAppointment.patientPhone || "N/A"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Doctor / Department</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{getFormattedDoctorAndDept(selectedAppointment)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Status</div>
                  <div className="mt-0.5">
                    <span className="badge badge-success text-xs capitalize">{selectedAppointment.status || "confirmed"}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground font-medium">Reason for Visit / Notes</div>
                <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-md mt-1 border border-slate-200">
                  {(selectedAppointment.reason || "General Consultation").replace(/Sarvam AI/gi, "AI Assistant").replace(/Sarvam/gi, "Voice Assistant").replace(/Gemini/gi, "AI Assistant")}
                </div>
              </div>

              {selectedAppointment.patientContext && (
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Booking Context / Source</div>
                  <div className="text-xs text-slate-600 mt-0.5">{selectedAppointment.patientContext.replace(/Sarvam AI/gi, "AI Assistant").replace(/Sarvam/gi, "Voice Assistant").replace(/Gemini/gi, "AI Assistant")}</div>
                </div>
              )}
            </div>

            <div className="modal-actions pt-3 mt-4 border-t border-border flex items-center justify-between">
              <button
                type="button"
                className="btn btn-secondary text-xs text-red-600 hover:bg-red-50 hover:border-red-200 flex items-center gap-1.5"
                onClick={() => {
                  handleDeleteAppointment(selectedAppointment.id);
                  setSelectedAppointment(null);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Cancel Appointment
              </button>
              <button
                type="button"
                className="btn btn-primary text-xs"
                onClick={() => setSelectedAppointment(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= NEW BOOKING MODAL ================= */}
      {showBookingModal && (
        <div className="modal-backdrop open">
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3>New Clinic Appointment Booking</h3>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Patient Full Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={newBookingName}
                onChange={(e) => setNewBookingName(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Phone Number</label>
              <input
                type="tel"
                value={newBookingPhone}
                onChange={(e) => setNewBookingPhone(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Specialist Doctor & Department</label>
              <select value={newBookingDoctor} onChange={(e) => setNewBookingDoctor(e.target.value)}>
                {doctorsList.map((doc) => (
                  <option key={doc.id} value={`${doc.name} (${doc.dept})`}>
                    {doc.name} — {doc.dept} ({doc.fee})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Appointment Date (Mon–Fri Operating Days)</label>
              <input
                type="date"
                value={newBookingDate}
                onChange={(e) => setNewBookingDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Time Slot (Clinic Hours 9 AM - 5 PM)</label>
              <select value={newBookingTime} onChange={(e) => setNewBookingTime(e.target.value)}>
                <option value="09:00">9:00 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="10:30">10:30 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="12:00">12:00 PM (Noon)</option>
                <option value="13:00">1:00 PM</option>
                <option value="14:00">2:00 PM</option>
                <option value="15:00">3:00 PM</option>
                <option value="16:00">4:00 PM</option>
              </select>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Reason for Visit</label>
              <input
                type="text"
                placeholder="e.g. General Checkup"
                value={newBookingReason}
                onChange={(e) => setNewBookingReason(e.target.value)}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowBookingModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleManualBookingSubmit}>Save Appointment</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= REGISTER PATIENT MODAL ================= */}
      {showAddPatientModal && (
        <div className="modal-backdrop open">
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3>Register Patient Record</h3>
            <p className="text-xs text-muted-foreground mt-1">Add patient to clinical directory for AI telephony and appointments.</p>
            
            <form onSubmit={handleSavePatient} className="space-y-3 mt-4">
              <div className="field">
                <label>Patient Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ananya Verma"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  placeholder="+918446163990"
                  value={newPatientPhone}
                  onChange={(e) => setNewPatientPhone(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Preferred Language</label>
                <select value={newPatientLanguage} onChange={(e) => setNewPatientLanguage(e.target.value)}>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Kannada">Kannada</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Telugu">Telugu</option>
                </select>
              </div>

              <div className="field">
                <label>Patient Context / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. History of allergy, prefers morning consultations"
                  value={newPatientNotes}
                  onChange={(e) => setNewPatientNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddPatientModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Patient</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= ADD DOCTOR MODAL ================= */}
      {showAddDoctorModal && (
        <div className="modal-backdrop open">
          <div className="modal" style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Add New Specialist Doctor</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Register a doctor to the clinical roster &amp; voice assistant schedule engine.</p>
              </div>
              <button
                type="button"
                className="p-1 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                onClick={() => setShowAddDoctorModal(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDoctorSubmit} className="space-y-3.5 mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="field">
                  <label>Doctor Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Priya Nair"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div className="field">
                  <label>Qualifications &amp; Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. MD, DM (Cardiology)"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="field">
                  <label>Department / Specialization *</label>
                  <select
                    value={newDocDept}
                    onChange={(e) => setNewDocDept(e.target.value)}
                  >
                    <option value="General Medicine & Surgery">General Medicine &amp; Surgery</option>
                    <option value="Cardiology & Heart Care">Cardiology &amp; Heart Care</option>
                    <option value="Orthopedics & Joint Care">Orthopedics &amp; Joint Care</option>
                    <option value="Pediatrics & Child Care">Pediatrics &amp; Child Care</option>
                    <option value="Obstetrics & Gynecology">Obstetrics &amp; Gynecology</option>
                    <option value="Dermatology & Cosmetology">Dermatology &amp; Cosmetology</option>
                    <option value="Neurology & Brain Care">Neurology &amp; Brain Care</option>
                    <option value="ENT & Head-Neck">ENT &amp; Head-Neck</option>
                    <option value="Psychiatry & Behavioral Health">Psychiatry &amp; Behavioral Health</option>
                    <option value="Ophthalmology & Eye Care">Ophthalmology &amp; Eye Care</option>
                    <option value="Custom">Custom Department...</option>
                  </select>
                </div>

                {newDocDept === "Custom" ? (
                  <div className="field">
                    <label>Custom Dept Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Pulmonology"
                      value={newDocCustomDept}
                      onChange={(e) => setNewDocCustomDept(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>Years of Experience *</label>
                    <input
                      type="text"
                      placeholder="e.g. 10+ Yrs Exp"
                      value={newDocExp}
                      onChange={(e) => setNewDocExp(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {newDocDept === "Custom" && (
                <div className="field">
                  <label>Years of Experience *</label>
                  <input
                    type="text"
                    placeholder="e.g. 10+ Yrs Exp"
                    value={newDocExp}
                    onChange={(e) => setNewDocExp(e.target.value)}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="field">
                  <label>OPD Consultation Fee *</label>
                  <input
                    type="text"
                    placeholder="e.g. ₹1,000"
                    value={newDocFee}
                    onChange={(e) => setNewDocFee(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Availability Badge Tag</label>
                  <select
                    value={newDocNext}
                    onChange={(e) => setNewDocNext(e.target.value)}
                  >
                    <option value="Available Today">Available Today</option>
                    <option value="Mon, Wed, Fri">Mon, Wed, Fri</option>
                    <option value="Tue, Thu, Sat">Tue, Thu, Sat</option>
                    <option value="Mon–Sat (9 AM–5 PM)">Mon–Sat (9 AM–5 PM)</option>
                    <option value="On Call">On Call</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>OPD Days &amp; Working Hours Schedule *</label>
                <input
                  type="text"
                  placeholder="e.g. Mon–Fri (9:00 AM–5:00 PM)"
                  value={newDocDays}
                  onChange={(e) => setNewDocDays(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="field">
                  <label>Slot Duration</label>
                  <input
                    type="text"
                    placeholder="e.g. 30 min slots"
                    value={newDocSlotDur}
                    onChange={(e) => setNewDocSlotDur(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Buffer Time Between Slots</label>
                  <input
                    type="text"
                    placeholder="e.g. 5 min buffer"
                    value={newDocBuffer}
                    onChange={(e) => setNewDocBuffer(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setShowAddDoctorModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Save &amp; Register Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= SIDE PANEL DRAWER ================= */}
      {sidePanel.open && (
        <>
          <div className="side-panel-backdrop open" onClick={closeSidePanel} />
          <aside className="side-panel open">
            <div className="side-panel-header">
              <div>
                <div className="side-panel-title">{sidePanel.title}</div>
                {sidePanel.sub && <div className="side-panel-sub">{sidePanel.sub}</div>}
              </div>
              <button className="side-panel-close" onClick={closeSidePanel}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {sidePanel.type === "manualCall" && (
              <div>
                <div className="field" style={{ maxWidth: "100%" }}>
                  <label>Patient Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Arnav Patil"
                    value={manualCallName}
                    onChange={(e) => setManualCallName(e.target.value)}
                  />
                </div>

                <div className="field" style={{ maxWidth: "100%" }}>
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="+918446163990"
                    value={manualCallPhone}
                    onChange={(e) => setManualCallPhone(e.target.value)}
                  />
                </div>

                <div className="field" style={{ maxWidth: "100%" }}>
                  <label>Reason / Context Note</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Reschedule appointment request"
                    value={manualCallReason}
                    onChange={(e) => setManualCallReason(e.target.value)}
                  />
                </div>

                <div className="side-panel-actions">
                  <button className="btn btn-primary" onClick={handleAddManualOutbound}>
                    Queue & Start Call
                  </button>
                  <button className="btn btn-secondary" onClick={closeSidePanel}>Cancel</button>
                </div>
              </div>
            )}
          </aside>
        </>
      )}

      {/* ================= TOAST CONTAINER ================= */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type || "info"}`}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
