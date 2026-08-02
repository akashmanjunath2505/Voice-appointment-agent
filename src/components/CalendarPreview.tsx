import { useState } from "react";
import { Calendar as CalendarIcon, Clock, RefreshCw, AlertCircle, ExternalLink, Link2, CheckCircle2, Copy } from "lucide-react";
import { CalendarEvent } from "../types";

interface CalendarPreviewProps {
  events: CalendarEvent[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  userEmail?: string | null;
  calendlyUrl?: string;
  onUpdateCalendlyUrl?: (url: string) => void;
}

export default function CalendarPreview({
  events,
  loading,
  onRefresh,
  calendlyUrl = "https://calendly.com/dr-abhishek/medical-consultation",
  onUpdateCalendlyUrl,
}: CalendarPreviewProps) {
  const [urlInput, setUrlInput] = useState(calendlyUrl);
  const [copied, setCopied] = useState(false);
  const [isEditingUrl, setIsEditingUrl] = useState(false);

  // Generate slots from 9:00 AM to 5:00 PM (17:00) to find doctor availability
  const getDailyAvailability = () => {
    const slots = [];
    const baseDate = new Date();
    baseDate.setHours(9, 0, 0, 0); // Start at 9:00 AM

    // Create 30-minute slots from 9:00 AM to 5:00 PM
    for (let i = 0; i < 16; i++) {
      const slotStart = new Date(baseDate.getTime() + i * 30 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

      // Check if there is an overlapping event
      const isBusy = events.some((event) => {
        if (!event.start?.dateTime || !event.end?.dateTime) return false;
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        return slotStart < eventEnd && slotEnd > eventStart;
      });

      slots.push({
        start: slotStart,
        end: slotEnd,
        isBusy,
        overlappingEvent: events.find((event) => {
          if (!event.start?.dateTime || !event.end?.dateTime) return false;
          const eventStart = new Date(event.start.dateTime);
          const eventEnd = new Date(event.end.dateTime);
          return slotStart < eventEnd && slotEnd > eventStart;
        }),
      });
    }
    return slots;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const slots = getDailyAvailability();
  const busyCount = slots.filter((s) => s.isBusy).length;
  const freeCount = slots.filter((s) => !s.isBusy).length;

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(urlInput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const handleSaveUrl = () => {
    setIsEditingUrl(false);
    if (onUpdateCalendlyUrl) {
      onUpdateCalendlyUrl(urlInput);
    }
  };

  return (
    <div id="calendar-preview" className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xl font-display font-extrabold tracking-tight text-slate-900">
              Calendly Schedule &ndash; Dr. Abhishek
            </h2>
          </div>
          <p className="text-xs text-emerald-600 font-semibold mt-1 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Calendly Instant Sync Active (No Sign-In Required)
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-50 rounded-xl transition duration-200 disabled:opacity-50"
          title="Refresh Schedule"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-500" : ""}`} />
        </button>
      </div>

      {/* Calendly URL Configuration / Quick Access Banner */}
      <div className="mb-5 p-3.5 bg-slate-50/80 border border-slate-200/70 rounded-2xl">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-emerald-600" />
            Calendly Booking Link
          </span>
          <div className="flex items-center gap-1.5">
            {isEditingUrl ? (
              <button
                onClick={handleSaveUrl}
                className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-0.5 rounded-lg transition"
              >
                Save
              </button>
            ) : (
              <button
                onClick={() => setIsEditingUrl(true)}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold px-2 py-0.5 rounded-md hover:bg-slate-200/50 transition"
              >
                Edit URL
              </button>
            )}
          </div>
        </div>

        {isEditingUrl ? (
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-full text-xs font-mono bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="https://calendly.com/dr-abhishek/medical-consultation"
          />
        ) : (
          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80">
            <span className="text-xs font-mono text-slate-700 truncate">{urlInput}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopyLink}
                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                title="Copy Calendly Link"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a
                href={urlInput}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                title="Open Calendly in New Tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Calendar Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/30">
          <p className="text-[10px] uppercase font-display font-extrabold tracking-wider text-emerald-600/80">
            Available Slots
          </p>
          <p className="text-3xl font-display font-black text-emerald-700 mt-1">{freeCount}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <p className="text-[10px] uppercase font-display font-extrabold tracking-wider text-slate-500">
            Booked Slots
          </p>
          <p className="text-3xl font-display font-black text-slate-700 mt-1">{busyCount}</p>
        </div>
      </div>

      {/* Scrollable Slots Timeline */}
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm font-medium">Synchronizing Calendly schedule...</p>
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
            <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm">No availability configured.</p>
          </div>
        ) : (
          slots.map((slot, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-3.5 rounded-2xl border transition duration-200 ${
                slot.isBusy
                  ? "bg-rose-50/20 border-rose-100/40 hover:bg-rose-50/30"
                  : "bg-emerald-50/10 border-emerald-100/10 hover:bg-emerald-50/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    slot.isBusy ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700 font-mono">
                      {formatTime(slot.start)} &ndash; {formatTime(slot.end)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">
                    {slot.isBusy
                      ? `Booked: ${slot.overlappingEvent?.summary || "Patient Consultation"}`
                      : "Available on Calendly"}
                  </p>
                </div>
              </div>

              {!slot.isBusy && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100/40 px-2 py-0.5 rounded-full">
                  Free
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-slate-400 text-[11px]">
        <AlertCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>
          Meetings are booked as 30-minute Calendly slots. Assistant synchronizes appointments automatically during calls.
        </span>
      </div>
    </div>
  );
}
