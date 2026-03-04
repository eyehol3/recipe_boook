# Capture UX Fixes

## Why

Three UX problems with the current capture flow:

1. **Single pending note gets clobbered.** `ctx.session.pendingNote` holds exactly one note. If the user records a second voice message while the first is still unconfirmed, the first pending note is silently overwritten. Then rejecting (Cancel) the visible preview clears the session — but the user's second note is already gone from session. Attempting to Save the second preview fails with "No pending note."

2. **Keyboard layout is bloated.** The Language button sits alone on a second row, taking full width. The Change-file (🗂️) and Language (🇺🇦) buttons should be compact icons on a shared row between Save and Cancel.

3. **Retranscribe creates extra messages and does redundant work.** When the user picks a new language, `handleLangSelect` sends a *new* reply with the transcription (creating a third message in the chat) instead of editing the existing one. Also, selecting the same language retranscribes needlessly, and selecting the same file during refile re-runs `classifyAndFormat` needlessly.

## What Changes

### Fix 1: Auto-dismiss previous pending note

When a new capture begins (`processCapture`) and `ctx.session.pendingNote` already exists, auto-dismiss the old one: edit the old preview message to say "Superseded by new note" (removing its buttons) before proceeding. This requires storing the preview message ID in session.

**Files:** `handlers/capture.js`

### Fix 2: Single-row keyboard with compact icons

For **voice** messages, restructure from two rows to one:

```
BEFORE:
[ ✓ Save ] [ Change file ] [ ✗ Cancel ]
[           🇺🇦 Language           ]

AFTER:
[ ✓ Save ] [ 🗂️ ] [ 🇺🇦 ] [ ✗ Cancel ]
```

All four buttons on a single row. 🗂️ and 🇺🇦 are compact icon-only buttons between Save and Cancel. The language flag reflects the current Whisper language.

For **text** messages, keep the existing layout unchanged:

```
[ ✓ Save ] [ Change file ] [ ✗ Cancel ]
```

**Files:** `handlers/capture.js` (`captureKeyboard`), `handlers/callbacks.js` (`captureKeyboard`)

### Fix 3a: Edit transcription in-place instead of new message

`handleLangSelect` currently calls `ctx.reply(...)` to show the new transcription, creating a new message. Instead:
- Store the transcription message ID in `ctx.session.transcriptionMsgId` when `handleVoice` first sends it.
- In `handleLangSelect`, use `ctx.telegram.editMessageText(chatId, transcriptionMsgId, ...)` to update the existing transcription message.
- The preview message (with buttons) is already edited in-place via `ctx.editMessageText(...)` — that part is fine.

**Files:** `handlers/capture.js` (`handleVoice`), `handlers/callbacks.js` (`handleLangSelect`)

### Fix 3b: Skip retranscribe when same language selected

In `handleLangSelect`, if `newLang === ctx.session.voiceLang`, just restore the capture keyboard (exit the language picker) without retranscribing or re-classifying.

**Files:** `handlers/callbacks.js` (`handleLangSelect`)

### Fix 3c: Skip reclassify when same file selected

In `handleRefileSelect`, if `newFile === pending.filename`, just restore the capture keyboard without calling `classifyAndFormat` again.

**Files:** `handlers/callbacks.js` (`handleRefileSelect`)

## Detailed Implementation

### 1. Session shape changes

Add two new fields to session state:

```js
ctx.session.pendingNote = {
  filename,
  content,
  originalMessage,
  isVoice,
  previewMsgId,       // NEW — message ID of the preview (with buttons)
}
ctx.session.transcriptionMsgId = null  // NEW — message ID of the italic transcription
```

### 2. Auto-dismiss old pending note (`handlers/capture.js` → `processCapture`)

At the top of `processCapture`, before any LLM work:

```js
// Auto-dismiss previous pending note if exists
const old = ctx.session.pendingNote
if (old && old.previewMsgId) {
  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, old.previewMsgId, undefined,
      '⏭ Superseded by new note.'
    )
  } catch (_) { /* message may already be gone */ }
  ctx.session.pendingNote = null
}
```

At the end of `processCapture`, after `ctx.reply(preview, keyboard)`, store the message ID:

```js
const sent = await ctx.reply(preview, captureKeyboard(isVoice, lang))
ctx.session.pendingNote.previewMsgId = sent.message_id
```

### 3. Store transcription message ID (`handlers/capture.js` → `handleVoice`)

Replace the fire-and-forget `ctx.reply` with:

```js
let transcriptionMsg
try {
  transcriptionMsg = await ctx.reply(`_${text}_`, { parse_mode: 'Markdown' })
} catch (_) {
  transcriptionMsg = await ctx.reply(text)
}
ctx.session.transcriptionMsgId = transcriptionMsg.message_id
```

### 4. Compact keyboard (`handlers/capture.js` + `handlers/callbacks.js` → `captureKeyboard`)

Both files have a duplicate `captureKeyboard` function. Update both identically:

```js
function captureKeyboard(isVoice = false, currentLang = DEFAULT_LANG) {
  if (!isVoice) {
    return { inline_keyboard: [[
      { text: '✓ Save', callback_data: 'note:confirm', style: 'success' },
      { text: 'Change file', callback_data: 'note:refile' },
      { text: '✗ Cancel', callback_data: 'note:cancel', style: 'danger' },
    ]] }
  }

  const langFlag = LANG_LABELS[currentLang] || '🌐'
  return { inline_keyboard: [[
    { text: '✓ Save', callback_data: 'note:confirm', style: 'success' },
    { text: '🗂️', callback_data: 'note:refile' },
    { text: langFlag, callback_data: 'note:lang' },
    { text: '✗ Cancel', callback_data: 'note:cancel', style: 'danger' },
  ]] }
}
```

Text messages: `[ ✓ Save ] [ Change file ] [ ✗ Cancel ]` — unchanged.
Voice messages: `[ ✓ Save ] [ 🗂️ ] [ 🇺🇦 ] [ ✗ Cancel ]` — single row, compact icons.

Both copies return `{ inline_keyboard: [...] }`. Callers pass `{ reply_markup: captureKeyboard(...) }`.

### 5. Edit transcription in-place (`handlers/callbacks.js` → `handleLangSelect`)

Replace:
```js
try {
  await ctx.reply(`_${text}_`, { parse_mode: 'Markdown' })
} catch (_) {
  await ctx.reply(text)
}
```

With:
```js
const chatId = ctx.chat.id
const transcMsgId = ctx.session.transcriptionMsgId
if (transcMsgId) {
  try {
    await ctx.telegram.editMessageText(chatId, transcMsgId, undefined, `_${text}_`, { parse_mode: 'Markdown' })
  } catch (_) {
    try {
      await ctx.telegram.editMessageText(chatId, transcMsgId, undefined, text)
    } catch (_2) { /* best effort */ }
  }
} else {
  // fallback: no tracked message, send new
  try { await ctx.reply(`_${text}_`, { parse_mode: 'Markdown' }) }
  catch (_) { await ctx.reply(text) }
}
```

### 6. Same-language guard (`handlers/callbacks.js` → `handleLangSelect`)

At the top, after extracting `newLang`:

```js
if (newLang === ctx.session.voiceLang) {
  // same language — just restore the capture keyboard
  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup(captureKeyboard(true, newLang))
  return
}
```

### 7. Same-file guard (`handlers/callbacks.js` → `handleRefileSelect`)

At the top, after extracting `newFile`:

```js
if (newFile === pending.filename) {
  // same file — just restore the capture keyboard
  await ctx.answerCbQuery()
  const isVoice = pending.isVoice || false
  const lang = ctx.session.voiceLang || 'uk'
  await ctx.editMessageReplyMarkup(captureKeyboard(isVoice, lang))
  return
}
```

## Impact

- **Session**: Two new fields (`previewMsgId`, `transcriptionMsgId`). Backward-compatible — old sessions without them gracefully degrade (guards check for existence).
- **Message count**: Retranscribe goes from 3 visible messages to 1 edited message. Auto-dismiss replaces silent clobbering with a visible "Superseded" tombstone.
- **LLM calls**: Same-language and same-file guards eliminate redundant `classifyAndFormat` and `transcribe` calls.
- **Keyboard**: Buttons are more compact. Change-file moves from row 1 to row 2 as an icon.

## Risks

- `editMessageText` on the transcription message can fail if Telegram has already garbage-collected it (rare, but possible after long delays). Mitigated by try/catch fallback.
- The "Superseded" auto-dismiss edits the old preview, which works unless the old message is too old for Telegram's edit window (48h). Acceptable for real-time usage patterns.
