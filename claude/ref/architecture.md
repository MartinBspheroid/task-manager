# Architecture Reference

## Overview

The task manager is built with a layered architecture focusing on process lifecycle management, event-driven communication, and resource cleanup.

## Core Components

### ProcessManager (src/core/ProcessManager.ts)

**Purpose**: Central orchestrator for managing multiple process tasks

**Key Responsibilities**:
- Maintains registry of all tasks (active and completed)
- Provides high-level API for task operations
- Delegates operations to appropriate ProcessTask instances
- Supports task filtering by status and tags
- Manages bulk operations (killAll, killByTag)

**Public API**:
```typescript
start(opts: ProcessTaskOpts): TaskInfo
list(): TaskInfo[]
listRunning(): TaskInfo[]
kill(id: string, signal?: NodeJS.Signals): void
killAll(signal?: NodeJS.Signals): string[]
killByTag(tag: string, signal?: NodeJS.Signals): string[]
write(id: string, input: string): void
```

**Implementation Details**:
- Uses private Map with UUID keys for task registry
- Tasks remain in registry after exit for status tracking
- Error handling with descriptive messages for invalid task IDs

### ProcessTask (src/core/ProcessTask.ts)

**Purpose**: Individual process wrapper with lifecycle management

**Key Responsibilities**:
- Process spawning using Bun's subprocess API
- Automatic stdout/stderr logging to files
- Idle timeout detection and termination
- Event emission for status changes

**Key Features**:
- Extends EventEmitter for real-time status updates
- Configurable idle timeout (default: 5 minutes)
- Automatic resource cleanup (streams, timers)
- Status state machine: running → exited/killed/timeout
- Optional tagging system for process grouping and management

**Private Implementation**:
- `#proc`: Bun subprocess instance
- `#logStream`: File write stream for logging
- `#idleTimer`: Timeout handler for inactivity detection

## Design Patterns

### Event-Driven Architecture
- ProcessTask emits 'exit' events with task information
- Enables decoupled communication between components

### Resource Management
- Automatic cleanup of file streams and timers
- Process termination on idle timeout
- Proper signal handling for graceful shutdown

### Encapsulation
- Private fields using # syntax
- Readonly task information exposure
- Type-safe interfaces for all interactions

## Data Flow

1. **Task Creation**: ProcessManager creates ProcessTask with options
2. **Process Spawning**: ProcessTask spawns child process with Bun
3. **Stream Handling**: stdout/stderr piped to log files
4. **Idle Monitoring**: Timer resets on stream activity
5. **Termination**: Process exits naturally or via timeout/signal
6. **Cleanup**: Resources cleaned up, status updated, events emitted

## Type System

All components use strict TypeScript with comprehensive type definitions in `src/core/types.ts`:

- `TaskStatus`: Union type for process states
- `TaskInfo`: Complete task metadata interface with optional tags
- `ProcessTaskOpts`: Configuration options for task creation including tags