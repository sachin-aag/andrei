"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_AGENT_DONE_PREFS,
  readAgentDonePrefs,
  subscribeAgentDonePrefs,
  writeAgentDonePrefs,
  type AgentDonePrefs,
} from "@/lib/notifications/agent-done-prefs";
import {
  playAgentDoneSound,
  readNotificationPermission,
  requestAgentDoneNotificationPermission,
  unlockAgentDoneAudio,
  type NotificationPermissionState,
} from "@/lib/notifications/notify-agent-done";

function permissionHint(permission: NotificationPermissionState): string {
  switch (permission) {
    case "granted":
      return "Desktop notifications are allowed in this browser. They fire only after a reply takes at least 5 seconds. Closing this tab does not stop the assistant — reopen the report to see the reply. When this tab is in the background, the notice stays silent unless you also turn on sound.";
    case "denied":
      return "This browser blocked desktop notifications. We'll show an in-app notice instead while this tab is open.";
    case "default":
      return "Your browser will ask for permission the first time you turn this on, or when a reply finishes.";
    case "unsupported":
      return "This browser does not support desktop notifications. We'll show an in-app notice instead.";
    default: {
      const exhaustive: never = permission;
      return exhaustive;
    }
  }
}

const subscribePermission = () => () => {};

export function AgentDoneNotificationSettings({
  userId,
}: {
  userId: string;
}) {
  const prefs = useSyncExternalStore(
    subscribeAgentDonePrefs,
    () => readAgentDonePrefs(userId),
    () => DEFAULT_AGENT_DONE_PREFS
  );
  const browserPermission = useSyncExternalStore(
    subscribePermission,
    readNotificationPermission,
    (): NotificationPermissionState => "default"
  );
  const [permissionAfterRequest, setPermissionAfterRequest] =
    useState<NotificationPermissionState | null>(null);
  const permission = permissionAfterRequest ?? browserPermission;

  const persist = (next: AgentDonePrefs) => {
    writeAgentDonePrefs(userId, next);
  };

  const setNotifications = async (enabled: boolean) => {
    persist({ ...prefs, notifications: enabled });
    if (!enabled) return;
    const nextPermission = await requestAgentDoneNotificationPermission();
    setPermissionAfterRequest(nextPermission);
  };

  const setSound = (enabled: boolean) => {
    if (enabled) unlockAgentDoneAudio();
    persist({ ...prefs, sound: enabled });
  };

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={prefs.notifications}
          onCheckedChange={(value) => {
            void setNotifications(value === true);
          }}
          aria-label="Show a notification when the assistant finishes"
          aria-describedby="agent-done-notifications-hint"
        />
        <span>
          <span className="font-medium text-[var(--foreground)]">
            Show a notification when the assistant finishes
          </span>
          <span
            id="agent-done-notifications-hint"
            className="mt-1 block text-[var(--muted-foreground)]"
          >
            {permissionHint(permission)}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={prefs.sound}
            onCheckedChange={(value) => {
              setSound(value === true);
            }}
            aria-label="Play a sound when the assistant finishes"
            aria-describedby="agent-done-sound-hint"
          />
          <span>
            <span className="font-medium text-[var(--foreground)]">
              Play a sound when the assistant finishes
            </span>
            <span
              id="agent-done-sound-hint"
              className="mt-1 block text-[var(--muted-foreground)]"
            >
              Independent of notifications. Off by default so notices stay
              silent. Also waits until a reply takes at least 5 seconds.
            </span>
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            unlockAgentDoneAudio();
            playAgentDoneSound();
          }}
        >
          Play sample
        </Button>
      </div>
    </div>
  );
}
