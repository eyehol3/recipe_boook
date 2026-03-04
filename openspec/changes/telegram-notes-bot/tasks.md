## 1. Project Setup

- [x] 1.1 Initialize Node.js project (`package.json`) with project name, entry point, and scripts
- [x] 1.2 Create `.env.example` with all required environment variables (`TELEGRAM_BOT_TOKEN`, `OPENCLAW_GATEWAY_URL`, `NOTES_DIR`, `ALLOWED_CHAT_ID`)
- [x] 1.3 Set up the OpenClaw agent entry point (`agent.js`) with Telegram channel config and basic agent skeleton

## 2. Test Notes

- [x] 2.1 Create `test_notes/` directory with 4 sample files: `recipe_notes.md`, `health_notes.md`, `log_notes.md`, `content_notes.md`, `todos.md`
- [x] 2.2 Populate each test file with realistic content in different formatting styles (date dividers, bullet lists, plain paragraphs, mixed)

## 3. Note Tools

- [x] 3.1 Implement `list-notes` tool — reads `NOTES_DIR`, returns list of `.md` files with names
- [x] 3.2 Implement `read-note` tool — reads a specified note file, supports optional `tail` parameter to return last N lines
- [x] 3.3 Implement `append-note` tool — appends content to a specified note file, returns success/failure

## 4. Note Capture Skill

- [x] 4.1 Create `skills/note-capture/SKILL.md` — instructions for the agent to classify messages, read target file format, generate formatted entries, and confirm before appending
- [x] 4.2 Wire up note-capture skill in the agent config with the three note tools
- [x] 4.3 Test the capture flow end-to-end: send text message → classification → preview → confirm → append

## 5. Note Retrieval Skill

- [x] 5.1 Create `skills/note-retrieval/SKILL.md` — instructions for the agent to read note files and answer questions with source attribution
- [x] 5.2 Wire up note-retrieval skill in the agent config
- [x] 5.3 Test retrieval flow: ask a question → agent reads files → answers with file attribution

## 6. Intent Routing

- [x] 6.1 Configure the agent's system prompt to distinguish between note-capture messages and retrieval questions
- [x] 6.2 Test mixed intent scenarios: notes, questions, and ambiguous messages

## 7. Deployment

- [x] 7.1 Create `Makefile` with `deploy` target (rsync + ssh + npm install + supervisor restart), following sibling project conventions
- [x] 7.2 Create `supervisor.conf` for the phoneserver (auto-restart, log paths, working directory)
- [x] 7.3 Create `.gitignore` (node_modules, .env, test artifacts)
- [x] 7.4 Test deployment to phoneserver with `make deploy`
