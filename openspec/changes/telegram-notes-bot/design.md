## Context

This is a greenfield personal-use Telegram bot — "Recipe Book". The user maintains living markdown note files and wants to capture notes from anywhere via Telegram. The bot runs on OpenClaw, a gateway-centric agent framework with built-in Telegram channel integration, voice-to-text, and LLM tool calling.

For the MVP, the bot works with test `.md` files in the project root. No sync, no real notes folder yet. The deployment target is a Termux phoneserver managed by supervisor.

**Current state**: Empty project with openspec config and references.

## Goals / Non-Goals

**Goals:**
- Capture notes via Telegram (text or voice) and append them to the correct file
- Classify which note file a message belongs to using the LLM
- Confirm with the user before writing anything
- Respect each file's existing formatting conventions
- Answer retrieval questions grounded in note file contents
- Deploy via Makefile + supervisor to the existing Termux phoneserver

**Non-Goals:**
- Syncthing/file sync (Phase 2)
- Conflict detection (Phase 2)
- Telegram Mini App / WebView (Phase 3)
- Multi-user support
- Universal note format enforcement
- Reminders / cron features (future)
- Editing existing notes in place (future)

## Decisions

### 1. OpenClaw as the sole framework — no Telegraf

**Decision**: Use OpenClaw's built-in Telegram channel for all Telegram communication. Do not use Telegraf or any other Telegram library directly.

**Rationale**: OpenClaw handles Telegram connection, message routing, voice-to-text transcription, and LLM orchestration out of the box. Adding Telegraf would duplicate functionality and add complexity. The LyAdminBot reference is used for organizational patterns (handler separation, clean code structure), not its Telegraf wiring.

**Important**: "No Telegraf" does NOT mean limited Telegram features. OpenClaw's Telegram channel exposes the full Telegram Bot API — inline keyboards, reply markup, callback queries, message editing, all of it. We get buttons, formatted messages, and rich interactions without needing a separate library.

**Alternatives considered**: Telegraf + manual LLM integration — rejected because OpenClaw already provides all of this, and the user explicitly stated OpenClaw handles the Telegram connection.

### 2. AgentSkills for note operations

**Decision**: Implement two custom skills following the AgentSkills format:
- **note-capture** skill: lists available note files, reads a target file to learn its formatting, and appends a new entry
- **note-retrieval** skill: reads note files and answers questions

**Rationale**: OpenClaw uses AgentSkills (same format as anthropics/skills repo). Skills provide the tools the LLM calls. This keeps operations modular and testable.

**Alternative considered**: Single monolithic skill — rejected because capture and retrieval have different tool needs and different conversation flows.

### 3. File-format-aware appending via LLM analysis

**Decision**: When appending a note, the agent reads the last ~20 lines of the target file to understand its formatting conventions (dividers, date formats, heading styles), then generates the new entry in that style.

**Rationale**: Each note file has its own style. Rather than maintaining per-file format configs, let the LLM infer the pattern from the file itself. This is more flexible and adapts automatically when the user changes their style.

**Alternative considered**: Per-file format config (e.g., `notes.config.json`) — rejected as over-engineering for a personal tool with few files.

### 4. Conversational confirm-then-write flow

**Decision**: After classifying a message, the bot shows a preview: the formatted note content and the target file, with a single ✅ Confirm button. The user can:
- Tap ✅ → appends immediately
- Type or record a voice message → the agent interprets naturally: "put it in health_notes instead" (redirects), "change the wording to ..." (edits the note content), or "cancel" / "nah" (discards)

No ❌ button — the conversation handles everything else naturally. The LLM reads the user's response in context and acts accordingly.

**Rationale**: The confirm-before-write flow should feel like a conversation, not a rigid button flow. One tap for the happy path (confirm), natural language for everything else (edit, redirect, cancel). This avoids the clunky UX of "❌ → Which file?" menus.

### 5. Notes directory config via environment variable

**Decision**: The notes directory path is set via `NOTES_DIR` in `.env`. For MVP, this points to `./test_notes/` in the project root.

**Rationale**: Clean separation of config from code. Easy to switch to the real notes folder later (Phase 2) without code changes.

### 6. Test notes in project root

**Decision**: Ship 5 sample `.md` files in `test_notes/` with different formatting styles to exercise the classification and format-matching logic.

**Rationale**: MVP needs realistic test data. Files should mirror the user's actual note structure (recipe_notes, health_notes, log_notes, content_notes, todos) with varied formatting.

### 7. Deployment follows existing sibling pattern

**Decision**: Makefile with `deploy` target using rsync + ssh + supervisor restart. Same pattern as `telegram-youtube-summarizer` and `cron-checker-bot`.

**Rationale**: The user already has this pattern working on their phoneserver. Consistency matters.

## Architecture

```
recipe_book/
├── agent.js              # OpenClaw agent entry point + config
├── skills/
│   ├── note-capture/
│   │   └── SKILL.md      # Note classification + append skill
│   └── note-retrieval/
│       └── SKILL.md      # Note querying skill
├── tools/
│   ├── list-notes.js     # Tool: list available note files
│   ├── read-note.js      # Tool: read a note file's contents
│   └── append-note.js    # Tool: append content to a note file
├── test_notes/           # Test .md files for MVP
│   ├── recipe_notes.md
│   ├── health_notes.md
│   ├── log_notes.md
│   ├── content_notes.md
│   └── todos.md
├── .env                  # Secrets (bot token, API keys, NOTES_DIR)
├── package.json
├── Makefile              # Deploy pipeline
└── supervisor.conf       # Supervisor config for phoneserver
```

### Conversation Flow

**Note capture:**
1. User sends text or voice message
2. OpenClaw transcribes voice (if applicable)
3. Agent calls `list-notes` tool to see available files
4. Agent calls `read-note` on the most likely target file (tail ~20 lines) to learn format
5. Agent generates formatted note entry + classification rationale
6. Bot sends preview message with ✅ button only
7. User taps ✅ → agent calls `append-note` → bot confirms "Added to recipe_notes.md"
8. User replies with text/voice instead → agent interprets naturally:
   - "put it in health_notes" → re-reads health_notes format, regenerates, shows new preview
   - "change it to say X instead" → edits the note content, shows updated preview
   - "cancel" / "nah" / "forget it" → discards and confirms cancellation

**Note retrieval:**
1. User sends a question ("what was that lentil thing I tried?")
2. Agent calls `read-note` on relevant files (or all files if unsure)
3. Agent answers grounded in file contents, citing the source file

## Risks / Trade-offs

**LLM misclassification** → Mitigated by confirm-before-write. User always reviews before append. The preview shows both the content and the target file, so mistakes are caught.

**Format inference from file tail** → Mitigated by reading enough context (last ~20 lines). Trade-off: may not capture format changes within the file. Acceptable for personal use.

**Voice transcription quality** → Mitigated by OpenClaw's built-in voice-to-text. Trade-off: depends on the model configured in OpenClaw. Acceptable — transcription errors become part of the note, user can review.

**Single-user assumption** → Mitigated by Telegram chat ID check in the agent config. Trade-off: no auth system, no multi-user isolation. Acceptable for personal tool.

**Test files don't cover real-world complexity** → Mitigated by making test files realistic (varied formatting, meaningful content). Phase 2 will use real files.

## Notes from PKM Skills Research

Researched ~100 existing note-taking / PKM skills on ClawHub and GitHub (Obsidian, Notion, Apple Notes integrations). Key observations:

- **Semantic search with vector embeddings** is common for retrieval in larger note systems — worth considering in a later phase if note files grow large, but overkill for MVP with a handful of files (the LLM can just read them)
- **Format-aware appending** (inferring a file's style from its content) is unique to our approach — most PKM skills enforce their own format or target a specific app's format
- **Existing skills focus on specific platforms** (Obsidian vaults, Apple Notes API, Notion API) while ours is file-system native — simpler, more portable, no platform lock-in
- **Vault-as-knowledge-base** pattern (Obsidian Direct) is similar to what we're doing — agent queries files as a knowledge base for retrieval
