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

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
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

export type GoogleCalendarEvent = CalendarEvent;

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
