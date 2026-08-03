import { Calendar as CalendarIcon, Clock, RefreshCw, AlertCircle, PlusCircle } from "lucide-react";
import { GoogleCalendarEvent } from "../types";

interface CalendarPreviewProps {
  events: GoogleCalendarEvent[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  userEmail?: string | null;
  isGoogleSynced?: boolean;
  onSignIn?: () => void;
}

export default function CalendarPreview({ events, loading, error, onRefresh, userEmail, isGoogleSynced, onSignIn }: CalendarPreviewProps) {
  // Generate mock slots from 9:00 AM to 5:00 PM (17:00) to find doctor availability
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
        // Overlap check
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

  return (
    <div id="calendar-preview" className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xl font-display font-extrabold tracking-tight text-slate-900">Doctor's Schedule</h2>
          </div>
          {isGoogleSynced && userEmail ? (
            <p className="text-xs text-emerald-600 font-semibold mt-1 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {userEmail} (Google Calendar Synced)
            </p>
          ) : userEmail ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-amber-600 font-semibold font-mono">{userEmail}</span>
              {onSignIn && (
                <button
                  onClick={onSignIn}
                  className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-md transition"
                >
                  Authorize Google Calendar
                </button>
              )}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium font-mono">Not Connected</span>
              {onSignIn && (
                <button
                  onClick={onSignIn}
                  className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg transition shadow-sm"
                >
                  Sign in with Google
                </button>
              )}
            </div>
          )}
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

      {/* Helper guide for Google unverified screen during testing */}
      {!isGoogleSynced && (
        <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-left space-y-1.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-800">
                Google Sign-In Tip ("Google hasn't verified this app")
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                When signing in during testing, Google may display an unverified app warning because Calendar permissions are sensitive:
              </p>
              <ol className="text-[11px] text-slate-700 font-medium list-decimal list-inside mt-1 space-y-0.5">
                <li>Click <span className="font-bold text-slate-900">Advanced</span> (bottom-left of popup)</li>
                <li>Click <span className="font-bold text-slate-900">Go to Aivana Health (unsafe)</span></li>
                <li>Click <span className="font-bold text-slate-900">Continue / Allow</span></li>
              </ol>
              <p className="text-[10px] text-slate-500 mt-1.5 italic">
                To remove this warning for all public users permanently, submit your app for verification in Google Cloud Console &rarr; Google Auth platform &rarr; Verification.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Error & Re-Authorization Banner */}
      {error && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200/60 rounded-2xl text-left space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-900">Google Calendar Authorization Notice</p>
              <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed font-semibold">
                {error}
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-amber-200/40 flex items-center justify-between gap-2">
            <span className="text-[10px] text-amber-700 font-medium">Local schedule fallback active.</span>
            {onSignIn && (
              <button
                onClick={onSignIn}
                className="text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1 rounded-lg transition shadow-sm cursor-pointer shrink-0"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      )}

      {/* Calendar Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/30">
          <p className="text-[10px] uppercase font-display font-extrabold tracking-wider text-emerald-600/80">Available Slots</p>
          <p className="text-3xl font-display font-black text-emerald-700 mt-1">{freeCount}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <p className="text-[10px] uppercase font-display font-extrabold tracking-wider text-slate-500">Booked Slots</p>
          <p className="text-3xl font-display font-black text-slate-700 mt-1">{busyCount}</p>
        </div>
      </div>

      {/* Scrollable Slots Timeline */}
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm font-medium">Fetching clinical records...</p>
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
                      {formatTime(slot.start)} - {formatTime(slot.end)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">
                    {slot.isBusy ? `Busy: ${slot.overlappingEvent?.summary || "Patient Consultation"}` : "Available for booking"}
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
        <span>Meetings are booked as 30-minute slots. Assistant cross-references this schedule in real time.</span>
      </div>
    </div>
  );
}
