import { useEffect, useState } from "react";

interface AudioVisualizerProps {
  state?: "idle" | "ringing" | "speaking" | "listening" | "completed";
  isActive?: boolean;
}

export default function AudioVisualizer({ state, isActive }: AudioVisualizerProps) {
  const currentState = state || (isActive ? "speaking" : "idle");
  const [bars, setBars] = useState<number[]>(Array(15).fill(10));

  useEffect(() => {
    if (currentState !== "speaking" && currentState !== "listening" && currentState !== "ringing") {
      setBars(Array(15).fill(10));
      return;
    }

    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => {
          if (currentState === "speaking") {
            return Math.floor(Math.random() * 65) + 15;
          } else if (currentState === "listening") {
            return Math.floor(Math.random() * 35) + 8;
          } else if (currentState === "ringing") {
            const time = Date.now() / 150;
            return Math.abs(Math.sin(time)) * 40 + 10;
          }
          return 10;
        })
      );
    }, 80);

    return () => clearInterval(interval);
  }, [currentState]);

  const getThemeColors = () => {
    switch (currentState) {
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
    <div className="relative flex flex-col items-center justify-center p-6">
      <div
        className={`absolute w-36 h-36 rounded-full border-2 transition-all duration-1000 flex items-center justify-center ${
          currentState === "ringing" || currentState === "speaking" || currentState === "listening"
            ? "animate-ping scale-110 opacity-70"
            : ""
        } ${colors.ring}`}
      />

      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center z-10 shadow-2xl transition-all duration-500 ${
          currentState === "speaking"
            ? "bg-emerald-950/80 shadow-emerald-500/20 border border-emerald-500/40"
            : "bg-slate-900 border border-slate-700"
        }`}
      >
        <div className={`w-6 h-6 rounded-full transition-all duration-500 ${colors.dot} flex items-center justify-center`}>
          <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 h-12 mt-4 z-10 w-full max-w-xs">
        {bars.map((height, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all duration-100 shadow-sm ${colors.bar}`}
            style={{
              height: `${height}%`,
              opacity: currentState === "idle" ? 0.25 : 0.95 - Math.abs(7 - i) * 0.08,
            }}
          />
        ))}
      </div>
    </div>
  );
}
