import { getAccessToken } from "./auth";

/**
 * Account-wide Claude Code session list, served by an UNDOCUMENTED internal
 * endpoint that the `claude` CLI itself uses. It lives on api.anthropic.com
 * (not the Cloudflare-gated claude.ai), is account-scoped (so it includes
 * sessions hosted on other machines), and returns rich live status.
 *
 * Verified June 2026 against Claude Code v2.1.17x. Parse defensively — this is
 * not a public API and may change without notice.
 */
const SESSIONS_ENDPOINT = "https://api.anthropic.com/v1/code/sessions";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const WEB_BASE_URL = "https://claude.ai/code";

/** Raw shape of one item in the `data` array (only fields we use). */
interface RawSession {
  id?: string;
  title?: string;
  status?: string;
  connection_status?: string;
  worker_status?: string;
  environment_id?: string;
  environment_kind?: string;
  last_event_at?: string;
  unread?: boolean;
  user_message_count?: number;
  tags?: string[];
  config?: {
    model?: string;
    outcomes?: Array<{ git_info?: { repo?: string; branches?: string[] } }>;
  };
  external_metadata?: {
    pending_action?: { action_description?: string; display_tool_name?: string } | null;
    current_branches?: Record<string, string>;
  };
}

interface RawResponse {
  data?: RawSession[];
  resume_token?: string | null;
}

export type Connection = "connected" | "disconnected" | "unknown";
export type Worker = "idle" | "busy" | "requires_action" | "unknown";

export interface CodeSession {
  /** API id, e.g. cse_017E… */
  id: string;
  /** Web URL for the session view (browser must be signed in to claude.ai). */
  url: string;
  title: string;
  archived: boolean;
  connection: Connection;
  worker: Worker;
  environmentId?: string;
  environmentKind?: string;
  model?: string;
  repo?: string;
  branch?: string;
  /** When waiting, a short description of what the agent is asking for. */
  pendingAction?: string;
  lastEventAt?: number;
  unread: boolean;
  tags: string[];
  /** Short human label for the session's origin, derived from tags. */
  kind: string;
  /** True for Remote Control sessions (vs dispatch/cowork/other). */
  isRemoteControl: boolean;
}

function isRemoteControlTags(tags: string[]): boolean {
  return tags.some((t) => t.startsWith("remote-control"));
}

function deriveKind(tags: string[]): string {
  if (tags.includes("remote-control-cli")) return "CLI";
  if (tags.includes("remote-control-repl")) return "Server";
  if (isRemoteControlTags(tags)) return "Remote Control";
  if (tags.some((t) => t.startsWith("cowork-dispatch"))) return "Dispatch";
  if (tags.some((t) => t.startsWith("cowork"))) return "Cowork";
  return tags[0] ?? "Session";
}

function normConnection(value?: string): Connection {
  return value === "connected" || value === "disconnected" ? value : "unknown";
}

function normWorker(value?: string): Worker {
  switch (value) {
    case "idle":
    case "busy":
    case "requires_action":
      return value;
    default:
      return "unknown";
  }
}

/** Build the openable web URL. API ids are `cse_<suffix>`; the URL uses `session_<suffix>`. */
function webUrl(id: string): string {
  const suffix = id.replace(/^cse_/, "");
  return `${WEB_BASE_URL}/session_${suffix}?from=raycast`;
}

function mapSession(raw: RawSession): CodeSession | undefined {
  if (!raw.id) return undefined;
  const git = raw.config?.outcomes?.find((o) => o.git_info?.repo)?.git_info;
  const branches = raw.external_metadata?.current_branches;
  const firstBranch = branches ? Object.values(branches)[0] : git?.branches?.[0];
  const lastEvent = raw.last_event_at ? Date.parse(raw.last_event_at) : undefined;
  const tags = Array.isArray(raw.tags) ? raw.tags : [];

  return {
    id: raw.id,
    url: webUrl(raw.id),
    title: raw.title?.trim() || "Untitled session",
    archived: raw.status === "archived",
    connection: normConnection(raw.connection_status),
    worker: normWorker(raw.worker_status),
    environmentId: raw.environment_id || undefined,
    environmentKind: raw.environment_kind,
    model: raw.config?.model,
    repo: git?.repo,
    branch: firstBranch,
    pendingAction: raw.external_metadata?.pending_action?.action_description || undefined,
    lastEventAt: Number.isNaN(lastEvent) ? undefined : lastEvent,
    unread: Boolean(raw.unread),
    tags,
    kind: deriveKind(tags),
    isRemoteControl: isRemoteControlTags(tags),
  };
}

export interface ListOptions {
  includeArchived?: boolean;
  /** When true, hide dispatch/cowork/other sessions and show only Remote Control ones. */
  onlyRemoteControl?: boolean;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": OAUTH_BETA_HEADER,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };
}

function fetchSessions(token: string): Promise<Response> {
  return fetch(SESSIONS_ENDPOINT, { headers: authHeaders(token) });
}

/** Fetch and map the account's Claude Code sessions. */
export async function listSessions(options: ListOptions = {}): Promise<CodeSession[]> {
  let res = await fetchSessions(await getAccessToken());

  // A cached token can be rejected even if it looked valid; refresh once and retry.
  if (res.status === 401 || res.status === 403) {
    res = await fetchSessions(await getAccessToken(true));
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Claude rejected the login token. Run `claude` and sign in again, then retry.");
  }
  if (!res.ok) {
    throw new Error(`Claude sessions API returned HTTP ${res.status}.`);
  }

  const body = (await res.json()) as RawResponse;
  let sessions = (body.data ?? []).map(mapSession).filter((s): s is CodeSession => Boolean(s));
  if (options.onlyRemoteControl) sessions = sessions.filter((s) => s.isRemoteControl);
  const visible = options.includeArchived ? sessions : sessions.filter((s) => !s.archived);

  // Most actionable first: waiting on you, then connected, then most recent.
  return visible.sort((a, b) => {
    const score = (s: CodeSession) => (s.worker === "requires_action" ? 2 : 0) + (s.connection === "connected" ? 1 : 0);
    const diff = score(b) - score(a);
    return diff !== 0 ? diff : (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0);
  });
}

function postArchive(token: string, id: string): Promise<Response> {
  return fetch(`${SESSIONS_ENDPOINT}/${id}/archive`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
}

/**
 * Archive ("kill") a session: ends it and moves it to the archived list. This is
 * the same operation the CLI uses. HTTP 200 = archived, 409 = already archived.
 */
export async function archiveSession(id: string): Promise<void> {
  let res = await postArchive(await getAccessToken(), id);
  if (res.status === 401 || res.status === 403) {
    res = await postArchive(await getAccessToken(true), id);
  }
  if (res.status === 200 || res.status === 409) return;
  if (res.status === 401 || res.status === 403) {
    throw new Error("Claude rejected the login token. Run `claude` and sign in again, then retry.");
  }
  throw new Error(`Could not archive session (HTTP ${res.status}).`);
}
