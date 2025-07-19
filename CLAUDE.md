# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript task manager that spawns and manages child processes with logging and timeout capabilities. It uses Bun as the runtime.

## Key Commands

### Development
```bash
# Install dependencies
bun install

# Run tests
bun test

# Run the CLI tool
bun run src/cli/start.ts -- <command> [args]

# Example: Start a long-running process
bun run src/cli/start.ts -- sleep 60
```

## Architecture

### Core Components

1. **ProcessManager** (`src/core/ProcessManager.ts`): Central manager that maintains a collection of ProcessTask instances. Handles task lifecycle and provides APIs for listing and managing tasks.

2. **ProcessTask** (`src/core/ProcessTask.ts`): Individual task wrapper around Bun's subprocess API. Features:
   - Automatic stdout/stderr logging to files
   - Idle timeout detection (kills processes with no output)
   - Event-based status updates via EventEmitter
   - UUID-based identification

3. **CLI** (`src/cli/start.ts`): Command-line interface for starting tasks. Creates log directory and spawns processes with specified commands.

### Key Design Patterns

- **Event-Driven Architecture**: ProcessTask extends EventEmitter to notify status changes
- **Process Isolation**: Each task runs in its own subprocess with separate log files
- **Automatic Resource Cleanup**: Idle timeout prevents zombie processes

### Testing Approach

Tests use Bun's built-in test runner (`bun:test`). Test files follow the pattern `*.test.ts` in the `src/tests/` directory. Tests verify process spawning, timeout behavior, and logging functionality.

### TypeScript Configuration

- Strict mode enabled
- Target: ESNext with latest features
- Module resolution: Bundler mode
- No emit (Bun executes TypeScript directly)