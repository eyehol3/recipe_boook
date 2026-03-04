## ADDED Requirements

### Requirement: Note file discovery
The system SHALL discover all markdown files in the configured notes directory and present them as available classification targets for incoming messages.

#### Scenario: List available note files
- **WHEN** the agent needs to classify an incoming message
- **THEN** the system SHALL read the notes directory and return a list of all `.md` files with their names

#### Scenario: Notes directory is empty
- **WHEN** the notes directory contains no `.md` files
- **THEN** the system SHALL inform the user that no note files are available

### Requirement: Message classification
The system SHALL classify each incoming message (text or transcribed voice) to determine which note file it belongs to, based on the message content and the names/descriptions of available note files.

#### Scenario: Clear classification
- **WHEN** a user sends "tried a new lentil dal recipe with coconut milk"
- **THEN** the system SHALL classify this as belonging to `recipe_notes.md`

#### Scenario: Ambiguous classification
- **WHEN** a user sends a message that could belong to multiple files
- **THEN** the system SHALL pick the most likely file and present it for confirmation, allowing the user to redirect

### Requirement: Format-aware note generation
The system SHALL read the tail of the target note file to infer its formatting conventions (dividers, date formats, heading styles) and generate the new entry in that same style.

#### Scenario: File uses date dividers
- **WHEN** the target file uses `---` dividers with dates (e.g., `--- 2026-02-25 ---`)
- **THEN** the new entry SHALL follow the same divider + date pattern

#### Scenario: File uses simple bullet lists
- **WHEN** the target file uses plain bullet lists without dividers
- **THEN** the new entry SHALL be formatted as a bullet list item

#### Scenario: Empty file
- **WHEN** the target file is empty or has no established pattern
- **THEN** the system SHALL use a sensible default format (date heading + content)

### Requirement: Confirm before writing
The system SHALL always show the user a preview of the formatted note and the target file, with a single ✅ Confirm button, and wait for the user's response before appending. The user MAY respond via button tap, text, or voice message.

#### Scenario: User confirms via button
- **WHEN** the user taps ✅
- **THEN** the system SHALL append the formatted entry to the target file and confirm success

#### Scenario: User edits the note content
- **WHEN** the user replies with text or voice indicating a content change (e.g., "change it to say X" or "also add that I used coconut milk")
- **THEN** the system SHALL update the note content accordingly and show a new preview with ✅

#### Scenario: User redirects to different file
- **WHEN** the user replies with text or voice specifying a different target file (e.g., "put it in health_notes instead")
- **THEN** the system SHALL re-read the new target file's format, regenerate the entry, and show a new preview with ✅

#### Scenario: User cancels
- **WHEN** the user replies with a cancellation intent (e.g., "cancel", "nah", "forget it")
- **THEN** the system SHALL discard the note and confirm cancellation

### Requirement: Voice message handling
The system SHALL accept voice messages, transcribe them via OpenClaw's built-in voice-to-text, and then process the transcription through the same classification and append flow as text messages.

#### Scenario: Voice message received
- **WHEN** the user sends a voice message
- **THEN** the system SHALL transcribe it and show the transcribed text alongside the formatted note preview for confirmation

### Requirement: Append to file
The system SHALL append the confirmed note entry to the end of the target file, preserving all existing content.

#### Scenario: Successful append
- **WHEN** the user confirms and the file is writable
- **THEN** the system SHALL append the entry and send a confirmation message with the file name

#### Scenario: File write failure
- **WHEN** the file cannot be written (permissions, disk full, etc.)
- **THEN** the system SHALL inform the user of the error and preserve the note content in the chat so it's not lost
