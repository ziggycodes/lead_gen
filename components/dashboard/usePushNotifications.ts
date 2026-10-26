"use client";

import { useCallback, useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PROMPT_DISMISSED_KEY = "leadscout:push-prompt-dismissed";

export type PushPermission = NotificationPermission | "unsupported";

export interface PushNotifications {
  permission: PushPermission;
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  // True when it's worth offering notifications: supported, not yet decided, not waved off.
  canPrompt: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  dismissPrompt: () => void;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(VAPID_PUBLIC_KEY) &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

async function sendToServer(sub: PushSubscription) {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Couldn't turn on notifications.");
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) };
  try {
    return await reg.pushManager.subscribe(options);
  } catch (err) {
    // An old subscription made with a different VAPID key blocks a new one.
    const existing = await reg.pushManager.getSubscription();
    if (!existing) throw err;
    await existing.unsubscribe();
    return reg.pushManager.subscribe(options);
  }
}

export function usePushNotifications(): PushNotifications {
  const [permission, setPermission] = useState<PushPermission>("unsupported");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!isSupported()) return;
    setPermission(Notification.permission);
    setDismissed(readDismissed());
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;
        setRegistration(reg);
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(sub));
        // Keep the server's copy current; it drops subscriptions the push service expired.
        if (sub && Notification.permission === "granted") await sendToServer(sub);
      } catch (err) {
        console.error("[push] service worker setup failed:", (err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const reg = registration ?? (await navigator.serviceWorker.register("/sw.js"));
      const sub = await subscribe(reg);
      await sendToServer(sub);
      setSubscribed(true);
    } catch (err) {
      setError((err as Error).message || "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }, [registration]);

  const dismissPrompt = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    } catch {
      /* the prompt just comes back next visit */
    }
  }, []);

  const disable = useCallback(async () => {
    if (!registration) return;
    setBusy(true);
    setError(null);
    try {
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      // Turning it off is a decision; don't offer it again on the next search.
      dismissPrompt();
    } catch (err) {
      setError((err as Error).message || "Couldn't turn off notifications.");
    } finally {
      setBusy(false);
    }
  }, [registration, dismissPrompt]);

  const canPrompt = permission !== "unsupported" && permission !== "denied" && !subscribed && !dismissed;

  return { permission, subscribed, busy, error, canPrompt, enable, disable, dismissPrompt };
}
