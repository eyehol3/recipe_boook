## ADDED Requirements

### Requirement: Makefile deploy target
The project SHALL include a Makefile with a `deploy` target that syncs the project to the Termux phoneserver via rsync and restarts the supervisor-managed process.

#### Scenario: Successful deployment
- **WHEN** the developer runs `make deploy`
- **THEN** the system SHALL rsync project files (excluding `node_modules`, `.git`, `.env`) to the phoneserver, run `npm install` remotely, and restart the supervisor process

#### Scenario: Remote server unreachable
- **WHEN** the phoneserver is not reachable via SSH
- **THEN** the deploy SHALL fail with a clear error message from rsync/ssh

### Requirement: Supervisor configuration
The project SHALL include a supervisor config file that runs the bot process with automatic restart on failure.

#### Scenario: Process crash
- **WHEN** the bot process crashes
- **THEN** supervisor SHALL automatically restart it

#### Scenario: Supervisor config format
- **WHEN** deployed to the Termux phoneserver
- **THEN** the supervisor config SHALL follow the same conventions as sibling projects (cron-checker-bot, telegram-youtube-summarizer)

### Requirement: Environment-based configuration
The project SHALL use a `.env` file for all secrets and configuration (Telegram bot token, LLM API keys, notes directory path, allowed chat ID).

#### Scenario: Missing environment variables
- **WHEN** required environment variables are not set
- **THEN** the agent SHALL fail to start with a clear error indicating which variables are missing

### Requirement: Chat ID authorization
The system SHALL only respond to messages from the configured Telegram chat ID, ignoring all others.

#### Scenario: Authorized user
- **WHEN** a message comes from the configured chat ID
- **THEN** the system SHALL process the message normally

#### Scenario: Unauthorized user
- **WHEN** a message comes from an unknown chat ID
- **THEN** the system SHALL ignore the message
