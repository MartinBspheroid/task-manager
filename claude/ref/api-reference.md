# API Reference

## ProcessManager

The main interface for managing process tasks.

### Methods

#### `start(opts: ProcessTaskOpts): TaskInfo`

Creates and starts a new process task.

**Parameters:**
- `opts.cmd: string[]` - Command and arguments to execute
- `opts.logDir: string` - Directory for log files
- `opts.idleTimeoutMs?: number` - Idle timeout in milliseconds (default: 300000)
- `opts.tags?: string[]` - Optional tags for grouping and management

**Returns:** `TaskInfo` object with task details

**Example:**
```typescript
const manager = new ProcessManager();
const info = manager.start({
  cmd: ['node', 'script.js'],
  logDir: './logs',
  idleTimeoutMs: 60000,
  tags: ['web-server', 'production']
});
```

#### `list(): TaskInfo[]`

Returns information about all tasks (active and completed).

**Returns:** Array of `TaskInfo` objects

#### `listRunning(): TaskInfo[]`

Returns information about only currently running tasks.

**Returns:** Array of `TaskInfo` objects with status 'running'

**Example:**
```typescript
const manager = new ProcessManager();
const runningTasks = manager.listRunning();
console.log(`${runningTasks.length} tasks currently running`);
```

#### `kill(id: string, signal?: NodeJS.Signals): void`

Terminates a specific task by ID.

**Parameters:**
- `id: string` - Task UUID
- `signal?: NodeJS.Signals` - Signal to send (default: 'SIGTERM')

**Throws:** Error if task ID not found

#### `killAll(signal?: NodeJS.Signals): string[]`

Terminates all currently running tasks.

**Parameters:**
- `signal?: NodeJS.Signals` - Signal to send (default: 'SIGTERM')

**Returns:** Array of task IDs that were killed

**Example:**
```typescript
const manager = new ProcessManager();
const killedIds = manager.killAll();
console.log(`Killed ${killedIds.length} running tasks`);
```

#### `killByTag(tag: string, signal?: NodeJS.Signals): string[]`

Terminates all running tasks that have the specified tag.

**Parameters:**
- `tag: string` - Tag to match
- `signal?: NodeJS.Signals` - Signal to send (default: 'SIGTERM')

**Returns:** Array of task IDs that were killed

**Example:**
```typescript
const manager = new ProcessManager();
const killedIds = manager.killByTag('web-server');
console.log(`Killed ${killedIds.length} web-server tasks`);
```

#### `write(id: string, input: string): void`

Sends input to a task's stdin.

**Parameters:**
- `id: string` - Task UUID  
- `input: string` - Data to send

**Throws:** Error if task ID not found

## ProcessTask

Individual process wrapper (typically not used directly).

### Properties

#### `info: TaskInfo` (readonly)

Current task information including status, timing, and metadata.

### Methods

#### `write(input: string): void`

Sends data to the process stdin.

#### `terminate(signal?: NodeJS.Signals): void`

Manually terminates the process.

### Events

#### `'exit'`

Emitted when the process exits (naturally, killed, or timeout).

**Callback:** `(info: TaskInfo) => void`

## Types

### TaskInfo

```typescript
interface TaskInfo {
  id: string;           // UUID
  cmd: string[];        // Command and arguments
  pid: number;          // Process ID
  startedAt: number;    // Start timestamp (epoch ms)
  status: TaskStatus;   // Current status
  logFile: string;      // Path to log file
  tags?: string[];      // Optional tags for grouping
  exitedAt?: number;    // Exit timestamp (epoch ms)
  exitCode?: number;    // Exit code
}
```

### TaskStatus

```typescript
type TaskStatus = 'running' | 'exited' | 'killed' | 'timeout';
```

### ProcessTaskOpts

```typescript
interface ProcessTaskOpts {
  cmd: string[];
  logDir: string;
  idleTimeoutMs?: number;
  tags?: string[];
}
```

## Error Handling

- **Invalid Task ID**: Throws descriptive error with task ID
- **Missing Command**: CLI shows usage and exits with code 1
- **File System Errors**: Propagated from underlying fs operations
- **Process Spawn Errors**: Handled by Bun subprocess API

## Logging

- Each task gets a unique log file: `{logDir}/{uuid}.log`
- Both stdout and stderr are captured
- Log files are append-only and closed on process exit
- File names use task UUID for easy correlation