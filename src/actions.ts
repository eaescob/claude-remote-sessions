import { Alert, Icon, Toast, confirmAlert, showToast } from "@raycast/api";
import { archiveSession, type CodeSession } from "./api";

/**
 * Archive ("kill") a session after confirmation, with toast feedback.
 * Shared by the List and Menu Bar commands. Calls `onDone` after a successful
 * archive so the caller can refresh.
 */
export async function killSession(session: CodeSession, onDone?: () => void): Promise<void> {
  const confirmed = await confirmAlert({
    title: `Archive "${session.title}"?`,
    message:
      session.connection === "connected"
        ? "This ends the running session and moves it to Archived."
        : "This moves the session to Archived.",
    icon: Icon.Trash,
    primaryAction: { title: "Archive", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) return;

  const toast = await showToast({ style: Toast.Style.Animated, title: "Archiving session…" });
  try {
    await archiveSession(session.id);
    toast.style = Toast.Style.Success;
    toast.title = "Session archived";
    onDone?.();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Could not archive session";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
