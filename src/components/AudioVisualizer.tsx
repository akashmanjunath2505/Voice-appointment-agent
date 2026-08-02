import { useEffect, useState } from "react";

interface AudioVisualizerProps {
  state: "idle" | "ringing" | "speaking" | "listening" | "completed";
}

export default function AudioVisualizer({ state }: AudioVisualizerProps) {
  const [bars, setBars] = useState<number[]>(Array(15).fill(10));

  useEffect(() => {
    if (state !== "speaking" && state !== "listening" && state !== "ringing") {
      setBars(Array(15).fill(10));
      return;
    }

    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => {
          if (state === "speaking") {
            // High activity
            return Math.floor(Math.random() * 65) + 15;
          } else if (state === "listening") {
            // Medium activity (background noise / breathing / speaking)
            return Math.floor(Math.random() * 35) + 8;
          } else if (state === "ringing") {
            // Pulsing rhythm
            const time = Date.now() / 150;
            return Math.abs(Math.sin(time)) * 40 + 10;
          }
          return 10;
        })
      );
    }, 80);

    return () => clearInterval(interval);
  }, [state]);

  const getThemeColors = () => {
    switch (state) {
      case "ringing":
        return {
          bar: "bg-amber-400 shadow-amber-300/30",
          ring: "border-amber-200/40 bg-amber-500/5",
          dot: "bg-amber-500 shadow-amber-400/40",
        };
      case "speaking":
        return {
          bar: "bg-emerald-500 shadow-emerald-400/30",
          ring: "border-emerald-200/40 bg-emerald-500/5",
          dot: "bg-emerald-500 shadow-emerald-400/40",
        };
      case "listening":
        return {
          bar: "bg-blue-500 shadow-blue-400/30",
          ring: "border-blue-200/40 bg-blue-500/5",
          dot: "bg-blue-500 shadow-blue-400/40",
        };
      case "completed":
        return {
          bar: "bg-slate-300",
          ring: "border-slate-100 bg-slate-50",
          dot: "bg-slate-400 shadow-slate-300/40",
        };
      default:
        return {
          bar: "bg-slate-200",
          ring: "border-slate-100 bg-slate-50",
          dot: "bg-slate-300 shadow-slate-200/40",
        };
    }
  };

  const colors = getThemeColors();

  return (
    <div className="relative flex flex-col items-center justify-center p-8">
      {/* Outer pulsing rings */}
      <div
        className={`absolute w-44 h-44 rounded-full border-2 transition-all duration-1000 flex items-center justify-center ${
          state === "ringing" || state === "speaking" || state === "listening"
            ? "animate-ping scale-110 opacity-70"
            : ""
        } ${colors.ring}`}
      />
      <div
        className={`absolute w-36 h-36 rounded-full border border-dashed transition-all duration-700 flex items-center justify-center ${
          state === "speaking" || state === "listening" ? "animate-pulse" : ""
        } ${colors.ring}`}
      />

      {/* Main Core Button/Circle */}
      <div
        className={`w-28 h-28 rounded-full flex items-center justify-center z-10 shadow-2xl transition-all duration-500 ${
          state === "ringing"
            ? "bg-amber-50 shadow-amber-200/50"
            : state === "speaking"
            ? "bg-emerald-50 shadow-emerald-200/50"
            : state === "listening"
            ? "bg-blue-50 shadow-blue-200/50"
            : "bg-slate-50 shadow-slate-200/30"
        }`}
      >
        <div className={`w-8 h-8 rounded-full transition-all duration-500 ${colors.dot} flex items-center justify-center`}>
          <div className="w-3.5 h-3.5 rounded-full bg-white animate-pulse" />
        </div>
      </div>

      {/* Real-time reactive audio wave bars */}
      <div className="flex items-center justify-center gap-1.5 h-20 mt-8 z-10 w-full max-w-xs">
        {bars.map((height, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all duration-100 shadow-sm ${colors.bar}`}
            style={{
              height: `${height}%`,
              opacity: state === "idle" ? 0.25 : 0.95 - Math.abs(7 - i) * 0.08,
            }}
          />
        ))}
      </div>

      <div className="text-center mt-4">
        <span
          className={`text-xs font-bold uppercase tracking-widest font-mono ${
            state === "ringing"
              ? "text-amber-500"
              : state === "speaking"
              ? "text-emerald-500"
              : state === "listening"
              ? "text-blue-500"
              : "text-slate-400"
          }`}
        >
          {state === "ringing"
            ? "Incoming Call..."
            : state === "speaking"
            ? "Assistant Speaking"
            : state === "listening"
            ? "Listening..."
            : state === "completed"
            ? "Call Connected"
            : "Assistant Offline"}
        </span>
      </div>
    </div>
  );
}
