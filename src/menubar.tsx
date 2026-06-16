import { Color, Icon, MenuBarExtra, getPreferenceValues, open } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { listSessions, type CodeSession } from "./api";
import { killSession } from "./actions";
import { sessionKey, statusVisual } from "./presentation";

interface Preferences {
  onlyRemoteControl?: boolean;
}

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const { data, isLoading, revalidate } = useCachedPromise(
    (onlyRemoteControl: boolean) => listSessions({ includeArchived: false, onlyRemoteControl }),
    [Boolean(prefs.onlyRemoteControl)],
    { initialData: [] as CodeSession[] },
  );

  const waiting = data.filter((s) => s.worker === "requires_action");
  const others = data.filter((s) => s.worker !== "requires_action");

  // Title surfaces the signal tabs can't: how many sessions need you right now.
  const title = waiting.length > 0 ? `${waiting.length}` : undefined;
  const icon =
    waiting.length > 0
      ? { source: Icon.ExclamationMark, tintColor: Color.Orange }
      : { source: Icon.Terminal, tintColor: data.length ? Color.Green : Color.SecondaryText };

  return (
    <MenuBarExtra isLoading={isLoading} icon={icon} title={title} tooltip="Claude Remote Sessions">
      {waiting.length > 0 && (
        <MenuBarExtra.Section title="Waiting on You">
          {waiting.map((session) => (
            <SessionSubmenu key={sessionKey(session)} session={session} onRefresh={revalidate} />
          ))}
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section title="Sessions">
        {others.map((session) => (
          <SessionSubmenu key={sessionKey(session)} session={session} onRefresh={revalidate} />
        ))}
        {others.length === 0 && waiting.length === 0 && <MenuBarExtra.Item title="No active sessions" />}
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={revalidate}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function SessionSubmenu({ session, onRefresh }: { session: CodeSession; onRefresh: () => void }) {
  const visual = statusVisual(session);
  return (
    <MenuBarExtra.Submenu icon={{ source: visual.icon, tintColor: visual.color }} title={session.title}>
      <MenuBarExtra.Item title={session.pendingAction ?? visual.text} />
      <MenuBarExtra.Item icon={Icon.Globe} title="View in Browser" onAction={() => open(session.url)} />
      <MenuBarExtra.Item
        icon={Icon.Trash}
        title="Archive (Kill) Session"
        onAction={() => killSession(session, onRefresh)}
      />
    </MenuBarExtra.Submenu>
  );
}
