export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  reasoning?: string;
  actionTaken?: {
    type: "schedule" | "reschedule" | "cancel";
    title?: string;
    start?: string;
  };
}

export interface ClinicAppointment {
  id: string;
  summary?: string;
  description?: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  reason?: string;
  patientContext?: string;
  status?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
}

export type GoogleCalendarEvent = ClinicAppointment;

export type CallState = "idle" | "ringing" | "connected" | "completed" | "declined";

export interface AssistantAction {
  type: "none" | "schedule" | "reschedule" | "cancel";
  details?: {
    eventId?: string;
    start?: string;
    end?: string;
    title?: string;
    description?: string;
  };
}

export interface AssistantResponse {
  speech: string;
  reasoning: string;
  action: AssistantAction;
}

export interface KbDocument {
  id: string;
  title: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  chunkCount: number;
  status: "Indexed" | "Processing" | "Error";
  sampleText: string;
  category: "General" | "Insurance" | "Services" | "Doctors" | "Emergency" | "Pricing";
}

export interface KbChunk {
  id: string;
  docId: string;
  docTitle: string;
  chunkIndex: number;
  text: string;
  vectorDimensions?: number;
  tokenCount: number;
}

export interface RagSearchResult {
  chunk: KbChunk;
  similarityScore: number;
}

export interface Doctor {
  id: string;
  name: string;
  title: string;
  dept: string;
  experience: string;
  fee: string;
  days: string;
  next: string;
  color?: string;
  rules?: { days: string; time: string; dur: string; buf: string }[];
}

export interface RagQueryResponse {
  query: string;
  ragAnswer: string;
  topChunks: RagSearchResult[];
}

