import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = "Claude Code-credentials";
const TOKEN_ENDPOINT = "https://platform.claude.com/v1/oauth/token";
/** Public Claude Code OAuth client id (same one the CLI uses). */
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
/** Refresh a little early to avoid races near the expiry boundary. */
const EXPIRY_SKEW_MS = 60_000;

export class AuthError extends Error {}

interface OAuthBlock {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

interface Credential {
  claudeAiOauth?: OAuthBlock;
  [key: string]: unknown;
}

/** Read the raw credential JSON string from the Keychain. */
async function readCredentialRaw(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { timeout: 10_000 },
    );
    return stdout.trim();
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 44) {
      throw new AuthError(
        "No Claude Code login found in Keychain. Sign in with `claude` (run it and use /login), then try again.",
      );
    }
    throw new AuthError(
      "Could not read the Claude Code credential from Keychain. If macOS asked for permission, choose Always Allow.",
    );
  }
}

function parseCredential(raw: string): Credential {
  try {
    return JSON.parse(raw) as Credential;
  } catch {
    throw new AuthError("Claude Code credential is not in the expected format.");
  }
}

/** The Keychain item's account attribute (login user), needed for write-back. */
async function readAccount(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN_SERVICE], {
      timeout: 10_000,
    });
    const match = stdout.match(/"acct"<blob>="([^"]*)"/);
    if (match?.[1]) return match[1];
  } catch {
    // fall through to default
  }
  return userInfo().username;
}

/**
 * Write the (refreshed) credential back to the same Keychain item so the `claude`
 * CLI and this extension share one source of truth. Claude Code's refresh tokens
 * rotate, so skipping this write would invalidate the CLI's stored token.
 *
 * Note: the JSON is passed as an argv (`-w`), briefly visible to local `ps`.
 * Acceptable for a personal tool; `security` has no stdin path for this.
 */
async function writeCredential(account: string, cred: Credential): Promise<void> {
  await execFileAsync(
    "/usr/bin/security",
    ["add-generic-password", "-U", "-a", account, "-s", KEYCHAIN_SERVICE, "-w", JSON.stringify(cred)],
    { timeout: 10_000 },
  );
}

function isValid(oauth?: OAuthBlock): boolean {
  return Boolean(oauth?.accessToken && oauth.expiresAt && oauth.expiresAt - EXPIRY_SKEW_MS > Date.now());
}

/** Exchange the refresh token for a new access token and persist the new pair. */
async function refresh(cred: Credential): Promise<string> {
  const oauth = cred.claudeAiOauth;
  if (!oauth?.refreshToken) {
    throw new AuthError("Claude Code login has expired. Run `claude` and sign in again, then retry.");
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: oauth.refreshToken,
        client_id: CLIENT_ID,
      }),
    });
  } catch {
    throw new AuthError("Network error refreshing Claude login.");
  }

  if (!res.ok) {
    throw new AuthError("Could not refresh Claude login (token rejected). Run `claude` and sign in again.");
  }

  const tok = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tok.access_token) {
    throw new AuthError("Refresh response did not include an access token.");
  }

  cred.claudeAiOauth = {
    ...oauth,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? oauth.refreshToken,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    scopes: tok.scope ? tok.scope.split(" ") : oauth.scopes,
  };

  // Persist so the CLI stays in sync. If this fails, we still return a usable
  // token for this run, but rotation may force a CLI re-login later.
  try {
    await writeCredential(await readAccount(), cred);
  } catch {
    // non-fatal
  }

  return tok.access_token;
}

/**
 * Return a valid Claude Code access token, refreshing transparently if needed.
 * Pass `forceRefresh` to refresh even when the cached token still looks valid
 * (used after the API rejects a token as a fallback).
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const cred = parseCredential(await readCredentialRaw());
  const oauth = cred.claudeAiOauth;
  if (!oauth?.accessToken && !oauth?.refreshToken) {
    throw new AuthError("Claude Code is not signed in. Run `claude` and use /login, then try again.");
  }
  if (!forceRefresh && isValid(oauth)) {
    return oauth!.accessToken!;
  }
  return refresh(cred);
}
