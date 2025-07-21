# API Reference

## ProcessManager

The main interface for managing process tasks with optional queue support.

### Constructor

```typescript
new ProcessManager(options?: ProcessManagerOptions)
```

**Parameters:**
- `options.defaultLogDir?: string` - Default log directory for tasks
- `options.queue?: QueueOptions` - Queue configuration (if omitted, unlimited concurrency)
- `options.hooks?: HookCallbacks` - Global hooks for all tasks

**Example:**
```typescript
// No queue (backward compatible)
const manager = new ProcessManager();

// With queue enabled
const queuedManager = new ProcessManager({
  queue: { concurrency: 4 },
  defaultLogDir: './logs'
});
```

### Core Methods

#### `start(opts: ProcessTaskOpts): TaskInfo`

Creates and starts a new process task. If queue is enabled and at capacity, task will be queued.

**Parameters:**
- `opts.cmd: string[]` - Command and arguments to execute
- `opts.logDir: string` - Directory for log files
- `opts.idleTimeoutMs?: number` - Idle timeout in milliseconds (default: 300000)
- `opts.tags?: string[]` - Optional tags for grouping and management
- `opts.hooks?: HookCallbacks` - Task-specific hooks
- `opts.queue?: TaskQueueOptions` - Task-specific queue options

**Returns:** `TaskInfo` object with task details

**Example:**
```typescript
const info = manager.start({
  cmd: ['node', 'script.js'],
  logDir: './logs',
  idleTimeoutMs: 60000,
  tags: ['web-server', 'production'],
  queue: { priority: 100 } // Higher priority
});
```

#### `startImmediate(opts: ProcessTaskOpts): TaskInfo`

Starts a task immediately, bypassing any queue restrictions.

**Parameters:** Same as `start()`

**Returns:** `TaskInfo` object with task details

**Example:**
```typescript
// Always runs immediately, even if queue is full
const urgent = manager.startImmediate({
  cmd: ['alert-handler.js'],
  logDir: './logs'
});
```

#### `list(): TaskInfo[]`

Returns information about all tasks (running, queued, and completed).

**Returns:** Array of `TaskInfo` objects

#### `listRunning(): TaskInfo[]`

Returns information about only currently running tasks.

**Returns:** Array of `TaskInfo` objects with status 'running'

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

#### `killByTag(tag: string, signal?: NodeJS.Signals): string[]`

Terminates all running tasks that have the specified tag.

**Parameters:**
- `tag: string` - Tag to match
- `signal?: NodeJS.Signals` - Signal to send (default: 'SIGTERM')

**Returns:** Array of task IDs that were killed

#### `write(id: string, input: string): void`

Sends input to a task's stdin.

**Parameters:**
- `id: string` - Task UUID  
- `input: string` - Data to send

**Throws:** Error if task ID not found

### Queue Management Methods

#### `pauseQueue(): void`

Pauses queue processing. Running tasks continue, but no new tasks start.

#### `resumeQueue(): void`

Resumes queue processing after pause.

#### `clearQueue(): void`

Removes all pending tasks from the queue. Does not affect running tasks.

#### `isQueuePaused(): boolean`

Returns whether the queue is currently paused.

#### `isQueueEmpty(): boolean`

Returns whether the queue has no pending tasks.

#### `isQueueIdle(): boolean`

Returns whether the queue has no pending or running tasks.

#### `getQueueStats(): QueueStats`

Returns detailed queue statistics.

**Returns:**
```typescript
interface QueueStats {
  size: number;               // Pending tasks in queue
  pending: number;            // Running tasks
  paused: boolean;            // Queue pause state
  totalAdded: number;         // Total tasks added
  totalCompleted: number;     // Total tasks completed
  totalFailed: number;        // Total tasks failed
  totalCancelled: number;     // Total tasks cancelled
  averageWaitTime: number;    // Average queue wait time (ms)
  averageRunTime: number;     // Average task run time (ms)
  throughput: number;         // Tasks per second
  utilization: number;        // Queue utilization (0-100)
}
```

#### `setQueueConcurrency(concurrency: number): void`

Dynamically adjusts queue concurrency limit.

**Parameters:**
- `concurrency: number` - New concurrency limit (use Infinity for unlimited)

#### `getQueuedTasks(): TaskInfo[]`

Returns all tasks currently waiting in queue.

#### `getRunningTasks(): TaskInfo[]`

Returns all tasks currently running.

### Async Queue API

#### `startAndWait(opts: ProcessTaskOpts): Promise<ExitResult>`

Starts a task and waits for completion.

**Returns:**
```typescript
interface ExitResult {
  taskInfo: TaskInfo;
  exitCode: number | null;
  signal: string | null;
  duration: number;
  stdout: string;
  stderr: string;
}
```

#### `startAllAsync(optsList: ProcessTaskOpts[]): Promise<TaskInfo[]>`

Starts multiple tasks and returns when all are at least started.

#### `waitForTask(taskId: string): Promise<ExitResult>`

Waits for a specific task to complete.

#### `waitForAll(taskIds?: string[]): Promise<ExitResult[]>`

Waits for multiple tasks to complete. If no IDs provided, waits for all tasks.

#### `waitForQueueEmpty(): Promise<void>`

Waits until the queue has no pending tasks.

#### `waitForQueueIdle(): Promise<void>`

Waits until the queue has no pending or running tasks.

### Task Handle API

#### `startWithHandle(opts: ProcessTaskOpts): TaskHandle`

Returns a TaskHandle for advanced control.

```typescript
const handle = manager.startWithHandle({
  cmd: ['long-process.js'],
  logDir: './logs'
});

// Wait for task to start if queued
await handle.waitToStart();

// Cancel if still queued
handle.cancel();

// Wait for completion
const result = await handle.onCompleted();
```

### Hook Management

#### `registerGlobalHooks(hooks: HookCallbacks): void`

Registers global hooks that apply to all tasks.

#### `clearGlobalHooks(): void`

Removes all global hooks.

**Hook Types:**
- `onSuccess` - Task exits with code 0
- `onFailure` - Task exits with non-zero code
- `onTimeout` - Task killed due to idle timeout
- `onTerminated` - Task killed manually
- `onTaskStartFail` - Task failed to start
- `onChange` - Task status changes

## Types

### TaskInfo

```typescript
interface TaskInfo {
  id: string;              // UUID
  cmd: string[];           // Command and arguments
  pid: number;             // Process ID (-1 if not started)
  startedAt: number;       // Start timestamp (epoch ms)
  status: TaskStatus;      // Current status
  logFile: string;         // Path to log file
  tags?: string[];         // Optional tags
  exitedAt?: number;       // Exit timestamp
  exitCode?: number | null;// Exit code
  startError?: Error;      // Error if failed to start
  metadata?: Record<string, unknown>; // Task metadata
}
```

### TaskStatus

```typescript
type TaskStatus = 'running' | 'exited' | 'killed' | 'timeout' | 'start-failed' | 'queued';
```

### ProcessManagerOptions

```typescript
interface ProcessManagerOptions {
  defaultLogDir?: string;
  queue?: QueueOptions;
  hooks?: HookCallbacks;
}
```

### QueueOptions

```typescript
interface QueueOptions {
  concurrency?: number;      // Max concurrent tasks (default: Infinity)
  autoStart?: boolean;       // Auto-start queued tasks (default: true)
  interval?: number;         // Rate limit interval in ms
  intervalCap?: number;      // Max tasks per interval
  timeout?: number;          // Default task timeout
  throwOnTimeout?: boolean;  // Throw on timeout (default: true)
}
```

### TaskQueueOptions

```typescript
interface TaskQueueOptions {
  immediate?: boolean;       // Skip queue, start immediately
  priority?: number;         // Task priority (higher = first)
  timeout?: number;          // Task-specific timeout
  signal?: AbortSignal;      // For cancellation
}
```

### Priority Constants

```typescript
const PRIORITY = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BATCH: -1000
};
```

## Error Handling

- **Invalid Task ID**: Throws descriptive error with task ID
- **Queue at Capacity**: Task is queued with status 'queued'
- **Process Spawn Errors**: Captured in TaskInfo.startError
- **Timeout Errors**: Task killed with status 'timeout'

## Backward Compatibility

The default behavior (no queue configuration) maintains v1.x compatibility:
- All tasks start immediately
- No 'queued' status appears
- Unlimited concurrency
- Synchronous start() method
- Sub-100ms latency