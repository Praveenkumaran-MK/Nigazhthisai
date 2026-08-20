import { useCallback, useState } from "react";

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

/**
 * Wraps the browser Notification API. IMPORTANT platform limitation
 * (documented per spec §1.3): true Web Push (background push while the PWA
 * is closed) requires a push subscription + a server-side push sender using
 * VAPID keys, which is out of scope for a static frontend bundle. What is
 * implemented here is a *foreground/local* notification — triggered by the
 * geofence hook while the tab/PWA is open — which satisfies "Have you
 * alighted?" without requiring a push backend. Upgrading to true background
 * Web Push later only requires adding a service-worker push handler +
 * subscription endpoint; this hook's call sites do not need to change.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>(
    "Notification" in window ? (Notification.permission as PushPermissionState) : "unsupported",
  );

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported" as const;
    }
    const result = await Notification.requestPermission();
    setPermission(result as PushPermissionState);
    return result;
  }, []);

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    // The `Notification` constructor is not supported on Android Chrome —
    // it throws `TypeError: Failed to construct 'Notification': Illegal
    // constructor`, since that platform requires notifications to be shown
    // via a ServiceWorkerRegistration instead. This is a mobile-first PWA,
    // so prefer the service-worker path (works everywhere it's available)
    // and fall back to the constructor, guarded with try/catch, only when
    // no service worker is registered.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(title, options))
        .catch(() => {
          try {
            new Notification(title, options);
          } catch {
            /* no usable notification path on this browser; fail silently */
          }
        });
      return;
    }

    try {
      new Notification(title, options);
    } catch {
      /* e.g. Android Chrome without a registered service worker */
    }
  }, []);

  return { permission, requestPermission, notify };
}
