import { Color, Icon } from "@raycast/api";
import type { CodeSession } from "./api";

export interface StatusVisual {
  icon: Icon;
  color: Color;
  text: string;
}

/** Map a session's worker/connection state to an icon, color, and label. */
export function statusVisual(session: CodeSession): StatusVisual {
  if (session.archived) {
    return { icon: Icon.Tray, color: Color.SecondaryText, text: "Archived" };
  }
  if (session.worker === "requires_action") {
    return {
      icon: Icon.ExclamationMark,
      color: Color.Orange,
      text: session.pendingAction ? `Waiting · ${session.pendingAction}` : "Waiting on you",
    };
  }
  if (session.worker === "busy") {
    return { icon: Icon.CircleProgress, color: Color.Blue, text: "Working" };
  }
  // idle / unknown
  if (session.connection === "connected") {
    return { icon: Icon.CircleFilled, color: Color.Green, text: "Idle" };
  }
  return { icon: Icon.Circle, color: Color.SecondaryText, text: "Idle · host offline" };
}

/** Online/offline indicator for the host machine. */
export function connectionVisual(session: CodeSession): StatusVisual {
  if (session.connection === "connected") {
    return { icon: Icon.Dot, color: Color.Green, text: "Host connected" };
  }
  if (session.connection === "disconnected") {
    return { icon: Icon.Dot, color: Color.SecondaryText, text: "Host offline" };
  }
  return { icon: Icon.Dot, color: Color.SecondaryText, text: "Host status unknown" };
}

export function sessionKey(session: CodeSession): string {
  return session.id;
}

export function relativeTime(ts?: number): string | undefined {
  if (!ts) return undefined;
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
