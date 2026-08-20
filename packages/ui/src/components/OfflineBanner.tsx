import { useEffect, useState } from "react";

export interface OfflineBannerProps {
  message?: string;
}

/** Fixed top banner shown whenever the browser reports it is offline (spec §51). */
export function OfflineBanner({ message = "You're offline — some features are unavailable." }: OfflineBannerProps) {
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div role="status" className="w-full bg-warning-600 px-4 py-1.5 text-center text-xs font-medium text-white">
      {message}
    </div>
  );
}
