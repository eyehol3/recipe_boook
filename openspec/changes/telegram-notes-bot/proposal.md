## Why

I keep "ongoing" note files — living markdown documents like `recipe_notes.md`, `health_notes.md`, `log_notes.md`, `content_notes.md`. They're personal knowledge bases, not diary entries. The problem: I often don't take notes because I'm not at my MacBook. The moment passes, the thought is lost.

A Telegram bot solves this — I always have my phone. Voice or text, the note is captured. What makes this different from a generic notes app: the bot doesn't just dump text into a file. It reads the note, figures out which file it belongs to, respects that file's existing formatting conventions, confirms with me, and appends. I can also ask questions about my notes and get answers grounded in the actual files.

## What Changes

Phase 1 (MVP) — the scope of this proposal:

- **OpenClaw agent with Telegram channel** — the bot runs as an OpenClaw agent, using its built-in Telegram integration, voice-to-text, and LLM tool calling
- **Note classification and appending** — send a text or voice message → LLM classifies which note file → confirms with user → appends in the file's existing style
- **Note retrieval** — ask questions about notes ("what was that lentil thing I tried?") and get answers grounded in the actual files
- **Test files in project root** — MVP uses local test `.md` files, no sync with real notes yet
- **Deployment** — Makefile + supervisor deploy to Termux phoneserver, following the existing rsync + supervisor pattern from sibling projects

## Capabilities

### New Capabilities
- `note-capture`: Classifying incoming messages to the correct note file, confirming with the user, and appending in the file's existing format style. Includes voice transcription handling (via OpenClaw built-in)
- `note-retrieval`: Answering questions about notes by reading all note files and returning grounded answers with references to which file the information came from
- `deploy-pipeline`: Makefile-based rsync + supervisor deployment to Termux phoneserver, `.env` for secrets, supervisor config

### Modified Capabilities
_(none — this is a greenfield project)_

## Impact

- **New project** — no existing code affected
- **Dependencies**: OpenClaw framework (agent runtime, Telegram channel, voice-to-text, tool calling), Node.js
- **Infrastructure**: Termux phoneserver (already running other bots), supervisor process manager
- **Secrets**: Telegram bot token, LLM API keys (via `.env`)
- **File system**: test `.md` files in project root for MVP; real notes folder sync deferred to Phase 2
