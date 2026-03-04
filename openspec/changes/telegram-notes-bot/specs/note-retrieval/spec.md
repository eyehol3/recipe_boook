## ADDED Requirements

### Requirement: Question answering from notes
The system SHALL answer user questions by reading relevant note files and providing answers grounded in the actual file contents.

#### Scenario: Direct match
- **WHEN** the user asks "what was that lentil thing I tried?"
- **THEN** the system SHALL search note files for lentil-related content and return the matching entries with a reference to which file they came from

#### Scenario: No match found
- **WHEN** the user asks about something not in any note file
- **THEN** the system SHALL inform the user that no matching notes were found

#### Scenario: Multiple matches across files
- **WHEN** the user asks a question that matches content in multiple note files
- **THEN** the system SHALL include all relevant matches, citing each source file

### Requirement: Source attribution
The system SHALL always include which file(s) the information came from when answering retrieval questions.

#### Scenario: Single source
- **WHEN** the answer comes from one file
- **THEN** the response SHALL include the file name (e.g., "From recipe_notes.md:")

#### Scenario: Multiple sources
- **WHEN** the answer spans multiple files
- **THEN** the response SHALL attribute each piece of information to its source file

### Requirement: Intent detection
The system SHALL distinguish between note-capture messages and retrieval questions, routing each to the appropriate flow.

#### Scenario: User asks a question
- **WHEN** the user sends "what did I note about sleep tracking?"
- **THEN** the system SHALL route to the retrieval flow (read + answer), not the capture flow (classify + append)

#### Scenario: User sends a note
- **WHEN** the user sends "tried magnesium glycinate 400mg before bed, slept much better"
- **THEN** the system SHALL route to the capture flow (classify + confirm + append)
