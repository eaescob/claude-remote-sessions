# Claude Remote Sessions

A Raycast extension that inventories your running **Claude Code Remote Control** sessions and opens them in the browser — so you don't have to keep a pile of `claude.ai/code` tabs open just to remember what's running and which session is waiting on you.

## What it does

- **List Remote Sessions** — a searchable list of your Claude Code sessions across all machines, grouped into _Waiting on You_, _Active_, and _Archived_. Shows title, repo/branch, host online state, the pending question, and last activity.
- **Menu Bar** — at-a-glance count of sessions that are **waiting on you**, with one-click open for any session.

## How it works

The extension calls the same account-scoped endpoint the `claude` CLI uses to list your Code sessions:

```
GET https://api.anthropic.com/v1/code/sessions
```

Because the list is **account-scoped, not machine-scoped**, it shows sessions running on _any_ of your machines — including a dedicated agent VM — from a laptop running Raycast elsewhere. For each session it surfaces live `worker_status` (idle / working / **waiting on you**), `connection_status` (host online?), the pending question, repo/branch, and a one-click open URL (`https://claude.ai/code/session_…`).

### Authentication

The extension reads your existing Claude Code login from the macOS Keychain (service `Claude Code-credentials`, written by the `claude` CLI) via Apple's `security` tool — no separate sign-in. The first read triggers a one-time macOS authorization prompt; choose **Always Allow**. Requirements:

- Claude Code installed and signed in (`claude` → `/login`) on the machine running Raycast.
- Opening a session URL relies on your **browser** being signed in to claude.ai.

> **Note:** `/v1/code/sessions` is an internal, undocumented endpoint (verified against Claude Code v2.1.17x). The extension parses defensively, but it may change without notice. It uses your own token for your own data.

## Run it locally

This extension is **not on the Raycast Store** (see [Why not the Store?](#why-not-the-store)), so you install it as a local development extension. It stays installed in Raycast even after the dev server stops.

### Prerequisites

- **macOS** with [Raycast](https://www.raycast.com/) installed.
- **Node.js 18+** and npm.
- **[Claude Code](https://claude.com/claude-code)** installed and signed in on this machine: run `claude`, then `/login` (a claude.ai subscription — the credential it stores is what the extension reads).

### Build and install

```bash
git clone https://github.com/eaescob/claude-remote-sessions.git
cd claude-remote-sessions
npm install
npm run dev        # builds and loads the extension into Raycast (keep running for hot-reload)
```

With the dev server running, open Raycast and run **List Remote Sessions** (or enable the **Remote Sessions Menu Bar** command). The first run triggers a one-time macOS Keychain prompt — choose **Always Allow**. You can stop the dev server afterward; the extension remains installed.

### Other scripts

```bash
npm run build                    # type-check + production build
npm run lint                     # ESLint + Prettier + manifest checks
npm run fix-lint                 # auto-fix formatting
node scripts/generate-icon.mjs   # regenerate assets/command-icon.png
```

## Why not the Store?

It relies on an **undocumented internal Anthropic endpoint** (`/v1/code/sessions`) and reads the Claude Code OAuth token from the Keychain — both of which the Raycast Store review process (rightly) pushes back on, and the endpoint can change without notice. It works great as a personal tool; it's just not a fit for public distribution. A clean, Store-friendly companion that just bookmarks session links lives in [claude-session-bookmarks](https://github.com/eaescob/claude-session-bookmarks).

## Scope

Claude Code only. Codex is intentionally out of scope: it has no comparable on-disk Remote Control bridge with a discoverable session URL, so there's nothing clean to inventory yet.
