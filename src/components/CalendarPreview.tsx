import { useState } from "react";
import { Calendar as CalendarIcon, Clock, RefreshCw, CheckCircle2, User, Phone } from "lucide-react";
import { ClinicAppointment } from "../types";

interface CalendarPreviewProps {
  events: ClinicAppointment[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onSelectAppointment?: (apt: ClinicAppointment) => void;
  selectedAppointmentId?: string | null;
}

export default function CalendarPreview({
  events,
  loading,
  error,
  onRefresh,
  onSelectAppointment,
  selectedAppointmentId
}: CalendarPreviewProps) {
  const [dateOffset, setDateOffset] = useState<number>(0); // 0 = Today, 1 = Tomorrow

  const getTargetDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return d;
  };

  const targetDate = getTargetDate();

  const getDailyAvailability = () => {
    const slots = [];
    const baseDate = new Date(targetDate);
    baseDate.setHours(9, 0, 0, 0);

    for (let i = 0; i < 16; i++) {
      const slotStart = new Date(baseDate.getTime() + i * 30 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

      const overlappingEvent = events.find((event) => {
        if (!event.start?.dateTime) return false;
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(eventStart.getTime() + 30 * 60000);
        return slotStart < eventEnd && slotEnd > eventStart;
      });

      slots.push({
        start: slotStart,
        end: slotEnd,
        isBusy: !!overlappingEvent,
        overlappingEvent
      });
    }
    return slots;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  };

  const slots = getDailyAvailability();
  const busyCount = slots.filter((s) => s.isBusy).length;
  const freeCount = slots.filter((s) => !s.isBusy).length;

  return (
    <div id="calendar-preview" className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-display font-extrabold tracking-tight text-slate-900">Aivana Hospital Clinic Calendar</h2>
          </div>
          <p className="text-xs text-emerald-600 font-semibold mt-1 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Aivana Backend Database Synced
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-slate-50 rounded-xl transition duration-200 disabled:opacity-50"
          title="Refresh Schedule"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-medium">
          {error}
        </div>
      )}

      {/* Stats Header */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50/60 rounded-2xl p-3.5 border border-emerald-100">
          <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-700/80">Available Slots Today</p>
          <p className="text-2xl font-display font-black text-emerald-800 mt-0.5">{freeCount}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Booked Appointments</p>
          <p className="text-2xl font-display font-black text-slate-700 mt-0.5">{busyCount}</p>
        </div>
      </div>

      {/* Booked Appointments List */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
          Backend DB Appointments ({events.length})
        </h3>
        <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
          {events.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No appointments scheduled in database.</p>
          ) : (
            events.map((apt) => {
              const isSelected = selectedAppointmentId === apt.id;
              return (
                <div
                  key={apt.id}
                  onClick={() => onSelectAppointment?.(apt)}
                  className={`p-3 rounded-2xl border transition duration-200 cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20 shadow-sm"
                      : "bg-slate-50/60 hover:bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">{apt.summary}</span>
                      {apt.status && (
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                          apt.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {apt.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" /> {apt.patientName || "Patient"}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" /> {apt.patientPhone || "+918446163990"}
                      </span>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Daily Time Slots */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Working Hours Slots ({targetDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", month: "short", day: "numeric" })})
          </h3>
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setDateOffset(0)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                dateOffset === 0 ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateOffset(1)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                dateOffset === 1 ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Tomorrow
            </button>
          </div>
        </div>
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {slots.map((slot, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-3 rounded-xl border transition ${
                slot.isBusy
                  ? "bg-rose-50/30 border-rose-100 text-slate-700"
                  : "bg-emerald-50/20 border-emerald-100 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${slot.isBusy ? "bg-rose-500" : "bg-emerald-500"}`} />
                <span className="text-xs font-semibold font-mono">
                  {formatTime(slot.start)} - {formatTime(slot.end)}
                </span>
                <span className="text-xs text-slate-400">
                  {slot.isBusy ? slot.overlappingEvent?.summary : "Open Slot"}
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                slot.isBusy ? "text-rose-600 bg-rose-100/50" : "text-emerald-600 bg-emerald-100/50"
              }`}>
                {slot.isBusy ? "Booked" : "Available"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
