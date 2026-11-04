"use client";

import { Bell, BellOff } from "lucide-react";
import type { PushNotifications } from "./usePushNotifications";

// Shown while a search runs, so the permission request comes from a click with clear value.
export function PushPrompt({ push }: { push: PushNotifications }) {
  if (!push.canPrompt) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-oat px-3 py-2.5 text-sm">
      <Bell className="h-4 w-4 shrink-0 text-muted" />
      <p className="min-w-0 flex-1">Get a notification when this search is done?</p>
      <button onClick={push.dismissPrompt} className="shrink-0 text-muted hover:text-fg">
        Not now
      </button>
      <button
        onClick={push.enable}
        disabled={push.busy}
        className="shrink-0 rounded-full bg-ink px-3 py-1 font-medium text-white disabled:opacity-60"
      >
        Notify me
      </button>
    </div>
  );
}

export function PushToggle({ push }: { push: PushNotifications }) {
  if (push.permission === "unsupported") return null;
  const blocked = push.permission === "denied";
  const on = push.subscribed && push.permission === "granted";
  return (
    <div className="mb-2">
      <button
        onClick={on ? push.disable : push.enable}
        disabled={push.busy || blocked}
        title={blocked ? "Notifications are blocked. Allow them for this site in your browser settings." : undefined}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-panel disabled:opacity-60 disabled:hover:bg-transparent"
      >
        {on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 text-muted" />}
        <span className="min-w-0 flex-1 truncate">
          {blocked ? "Notifications blocked" : on ? "Notifications on" : "Turn on notifications"}
        </span>
      </button>
      {push.error ? <p className="px-2 text-xs text-danger">{push.error}</p> : null}
    </div>
  );
}
