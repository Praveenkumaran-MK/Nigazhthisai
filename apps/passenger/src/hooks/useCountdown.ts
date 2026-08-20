import { useEffect, useState } from "react";

/** Live-updating remaining time until `targetIso`, ticking once per second. */
export function useCountdown(targetIso: string | null) {
  const [remainingMs, setRemainingMs] = useState(() => (targetIso ? new Date(targetIso).getTime() - Date.now() : 0));

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    setRemainingMs(target - Date.now());
    const interval = setInterval(() => setRemainingMs(target - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [targetIso]);

  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    expired: remainingMs <= 0,
    label: hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`,
  };
}
