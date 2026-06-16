import { Action, ActionPanel, Color, Icon, List, getPreferenceValues } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { listSessions, RateLimitError, type CodeSession } from "./api";
import { killSession } from "./actions";
import { connectionVisual, relativeTime, sessionKey, statusVisual } from "./presentation";

interface Preferences {
  includeArchived?: boolean;
  onlyRemoteControl?: boolean;
}

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const { data, isLoading, revalidate } = useCachedPromise(
    (includeArchived: boolean, onlyRemoteControl: boolean) => listSessions({ includeArchived, onlyRemoteControl }),
    [Boolean(prefs.includeArchived), Boolean(prefs.onlyRemoteControl)],
    {
      initialData: [] as CodeSession[],
      onError: (error) => {
        const title = error instanceof RateLimitError ? "Claude rate limit" : "Could not load Claude sessions";
        void showFailureToast(error, { title });
      },
    },
  );

  const waiting = data.filter((s) => s.worker === "requires_action");
  const active = data.filter((s) => s.worker !== "requires_action" && !s.archived);
  const archived = data.filter((s) => s.archived);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter sessions by title, repo, or branch…">
      <List.EmptyView
        icon={Icon.Globe}
        title="No Claude Code sessions"
        description="Start one with Remote Control (`claude --remote-control`) on any machine, then refresh."
      />
      <Section title="Waiting on You" sessions={waiting} onRefresh={revalidate} />
      <Section title="Active" sessions={active} onRefresh={revalidate} />
      <Section title="Archived" sessions={archived} onRefresh={revalidate} />
    </List>
  );
}

function Section({ title, sessions, onRefresh }: { title: string; sessions: CodeSession[]; onRefresh: () => void }) {
  if (sessions.length === 0) return null;
  return (
    <List.Section title={title} subtitle={`${sessions.length}`}>
      {sessions.map((session) => (
        <SessionItem key={sessionKey(session)} session={session} onRefresh={onRefresh} />
      ))}
    </List.Section>
  );
}

function SessionItem({ session, onRefresh }: { session: CodeSession; onRefresh: () => void }) {
  const status = statusVisual(session);
  const conn = connectionVisual(session);

  const accessories: List.Item.Accessory[] = [];
  accessories.push({
    tag: { value: session.kind, color: session.isRemoteControl ? Color.SecondaryText : Color.Orange },
    tooltip: session.isRemoteControl ? "Remote Control session" : `${session.kind} session (not Remote Control)`,
  });
  if (session.branch) accessories.push({ tag: session.branch });
  const last = relativeTime(session.lastEventAt);
  if (last) accessories.push({ text: last });
  if (session.unread) accessories.push({ icon: { source: Icon.Dot, tintColor: Color.Blue }, tooltip: "Unread" });
  accessories.push({ icon: { source: conn.icon, tintColor: conn.color }, tooltip: conn.text });
  accessories.push({ icon: { source: status.icon, tintColor: status.color }, tooltip: status.text });

  return (
    <List.Item
      icon={{ source: Icon.Terminal, tintColor: session.archived ? Color.SecondaryText : Color.PrimaryText }}
      title={session.title}
      subtitle={session.repo}
      accessories={accessories}
      keywords={[session.repo ?? "", session.branch ?? "", session.kind, session.id, ...session.tags]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="View Session in Browser" icon={Icon.Globe} url={session.url} />
            <Action.CopyToClipboard title="Copy Session URL" content={session.url} />
          </ActionPanel.Section>
          {!session.archived && (
            <ActionPanel.Section>
              <Action
                title="Archive (kill) Session"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={() => killSession(session, onRefresh)}
              />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section>
            {session.pendingAction && (
              <Action.CopyToClipboard
                title="Copy Pending Question"
                icon={Icon.QuestionMark}
                content={session.pendingAction}
              />
            )}
            {session.repo && <Action.CopyToClipboard title="Copy Repo" content={session.repo} icon={Icon.Folder} />}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={onRefresh}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
