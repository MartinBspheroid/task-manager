# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript task manager that spawns and manages child processes with logging and timeout capabilities. It uses Bun as the runtime and is packaged as an ESM module with full type definitions.

### Module Structure

- **Entry Point**: `index.ts` - Main module exports for library consumers
- **Package Configuration**: Configured for ESM with proper type definitions
- **Build Output**: JavaScript and declaration files generated in `dist/` directory

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

# Example: Start a process with tags
bun run src/cli/start.ts --tag web-server --tag production -- nginx
```

## Architecture

### Core Components

1. **ProcessManager** (`src/core/ProcessManager.ts`): Central manager that maintains a collection of ProcessTask instances. Handles task lifecycle and provides APIs for listing and managing tasks. Supports bulk operations and tag-based filtering.

2. **ProcessTask** (`src/core/ProcessTask.ts`): Individual task wrapper around Bun's subprocess API. Features:
   - Automatic stdout/stderr logging to files
   - Idle timeout detection (kills processes with no output)
   - Event-based status updates via EventEmitter
   - UUID-based identification
   - Optional tagging system for process grouping

3. **CLI** (`src/cli/start.ts`): Command-line interface for starting tasks. Creates log directory and spawns processes with specified commands.

### Key Design Patterns

- **Event-Driven Architecture**: ProcessTask extends EventEmitter to notify status changes
- **Process Isolation**: Each task runs in its own subprocess with separate log files
- **Automatic Resource Cleanup**: Idle timeout prevents zombie processes

### Testing Approach

Tests use Bun's built-in test runner (`bun:test`). Test files follow the pattern `*.test.ts` in the `src/tests/` directory. Current test coverage includes:

- **Core functionality**: Process spawning, timeout behavior, logging
- **Task filtering**: `listRunning()` method filtering 
- **Bulk operations**: `killAll()` functionality
- **Tag system**: Tag assignment, persistence, and tag-based killing
- **Edge cases**: Empty states, mixed task statuses, selective operations


### TypeScript Configuration

- Strict mode enabled
- Target: ESNext with latest features
- Module resolution: Node mode for proper ESM output
- Declaration files generated in dist/ directory
- ESM module format with type definitions

## Documentation

Detailed implementation documentation is available in `./claude/ref/`:

- **[Architecture Reference](./claude/ref/architecture.md)**: Comprehensive overview of system design, components, and data flow
- **[API Reference](./claude/ref/api-reference.md)**: Complete API documentation with examples and type definitions  
- **[Implementation Details](./claude/ref/implementation-details.md)**: Deep dive into process management, stream handling, and resource cleanup
- **[Testing Guide](./claude/ref/testing-guide.md)**: Testing strategies, current coverage, and recommendations for expansion