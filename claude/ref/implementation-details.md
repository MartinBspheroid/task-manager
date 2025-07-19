# Implementation Details

## Process Management

### Subprocess Creation

Uses Bun's `spawn()` API with specific configuration:

```typescript
spawn({
  cmd: opts.cmd,
  stdout: 'pipe',
  stderr: 'pipe', 
  stdin: 'pipe',
})
```

**Key Points:**
- All streams are piped for programmatic access
- PID is captured immediately after spawn
- Process exit handled via Promise-based API

### Stream Handling

Custom pipe implementation with activity monitoring:

```typescript
const pipe = (stream: ReadableStream) =>
  stream.pipeTo(
    new WritableStream({
      write: (chunk) => {
        this.#logStream.write(chunk);
        resetIdle(); // Reset timeout on activity
      },
    }),
  );
```

**Features:**
- Real-time logging to files
- Idle timer reset on any output
- Type-safe stream handling with guards

### Idle Timeout Management

Implements configurable idle detection:

```typescript
const resetIdle = () => {
  clearTimeout(this.#idleTimer);
  this.#idleTimer = setTimeout(() => this.#timeoutKill(), opts.idleTimeoutMs ?? 5 * 60_000);
};
```

**Behavior:**
- Timer resets on any stdout/stderr activity
- Default timeout: 5 minutes
- Timeout kills with SIGKILL (non-graceful)
- Status updated to 'timeout'

## State Management

### Task Status Lifecycle

```
running → exited    (natural exit)
running → killed    (manual termination)
running → timeout   (idle timeout)
```

**State Transitions:**
- All transitions are one-way (no resurrection)
- Status updates are atomic
- Exit information captured (code, timestamp)

### Registry Management

ProcessManager maintains task registry:

```typescript
#tasks = new Map<string, ProcessTask>();
```

**Key Behaviors:**
- Tasks remain in registry after exit (for status queries)
- UUID-based indexing for reliable identification
- Map provides O(1) lookup performance
- Supports filtering operations (by status, by tag)

## File System Operations

### Log File Management

Each task gets dedicated log file:

```typescript
const logFile = `${opts.logDir}/${id}.log`;
this.#logStream = fs.createWriteStream(logFile, { flags: 'a' });
```

**Implementation Notes:**
- Append mode for potential restart scenarios
- Stream closed automatically on process exit
- File creation is eager (before process starts)

### Directory Structure

CLI automatically creates log directory:

```typescript
mkdirSync('logs', { recursive: true });
```

## Type Safety

### Runtime Type Guards

Stream handling includes type guards:

```typescript
if (this.#proc.stdout && typeof this.#proc.stdout !== 'number') {
  void pipe(this.#proc.stdout);
}
```

**Purpose:**
- Handles Bun's union types for streams
- Prevents runtime errors from type mismatches
- Maintains type safety without assertions

### Definite Assignment

Private fields use definite assignment assertion:

```typescript
#idleTimer!: NodeJS.Timeout;
```

**Rationale:**
- Timer is always set in constructor logic
- Avoids unnecessary initialization overhead
- TypeScript compiler satisfied about usage

## Event System

### EventEmitter Integration

ProcessTask extends Node.js EventEmitter:

```typescript
export class ProcessTask extends EventEmitter {
  // ... implementation
  
  // Emit on process exit
  this.emit('exit', this.info);
}
```

**Usage Pattern:**
- Currently only 'exit' event is emitted
- Extensible for future events (start, error, etc.)
- Standard Node.js event pattern

## Memory Management

### Resource Cleanup

Automatic cleanup on process exit:

```typescript
this.#proc.exited.then((code) => {
  clearTimeout(this.#idleTimer);  // Clear timer
  this.#logStream.end();          // Close file stream
  // Update status and emit event
});
```

**Resources Managed:**
- Timeout timers
- File write streams
- Process handles (managed by Bun)

### Task Registry Persistence

Tasks remain in memory for status tracking:
- No automatic cleanup of completed tasks
- Memory usage grows with task count
- Trade-off: memory vs. status history

## Error Handling

### Graceful Degradation

Error handling strategies:

1. **Missing Tasks**: Descriptive errors with task ID
2. **File Operations**: Errors propagate to caller
3. **Process Spawn**: Handled by Bun's subprocess API
4. **Stream Errors**: Caught by pipe error handlers

### Signal Handling

Different signals for different scenarios:

```typescript
terminate(signal: NodeJS.Signals = 'SIGTERM')  // Manual kill
#timeoutKill() { this.#proc.kill('SIGKILL'); } // Timeout kill
```

**Signal Choice:**
- SIGTERM: Graceful shutdown (default)
- SIGKILL: Force kill (timeout scenarios)

## Tag System

### Tag Storage and Management

Tags are stored as optional string arrays in TaskInfo:

```typescript
interface TaskInfo {
  // ... other fields
  tags?: string[];
}
```

**Implementation Details:**
- Tags are immutable after task creation
- Array-based storage for multiple tags per task
- No validation constraints on tag content
- Memory-efficient storage (only allocated when used)

### Tag-Based Operations

Filtering and bulk operations use array iteration:

```typescript
// Filter by tag presence
task.info.tags?.includes(tag)

// Kill all matching processes
for (const task of this.#tasks.values()) {
  if (task.info.status === 'running' && task.info.tags?.includes(tag)) {
    task.terminate(signal);
    killedIds.push(task.info.id);
  }
}
```

**Performance Characteristics:**
- O(n) iteration over all tasks for tag operations
- O(m) tag array search per task (where m = number of tags)
- Efficient for typical workloads (small number of tasks/tags)

### CLI Tag Parsing

Command-line argument parsing supports multiple tag formats:

```typescript
// Supported formats:
--tag web-server
--tag=production
--tag database --tag cache
```

**Parsing Logic:**
- Iterative parsing with early command detection
- Multiple tag accumulation into array
- Graceful handling of empty tag values

## Bulk Operations

### killAll() Implementation

Iterates through all tasks, filtering by status:

```typescript
killAll(signal?: NodeJS.Signals): string[] {
  const killedIds: string[] = [];
  for (const task of this.#tasks.values()) {
    if (task.info.status === 'running') {
      task.terminate(signal);
      killedIds.push(task.info.id);
    }
  }
  return killedIds;
}
```

**Key Features:**
- Only affects running tasks
- Returns array of killed task IDs
- Uses standard termination path (same as individual kill)

### killByTag() Implementation

Combines status and tag filtering:

```typescript
killByTag(tag: string, signal?: NodeJS.Signals): string[] {
  const killedIds: string[] = [];
  for (const task of this.#tasks.values()) {
    if (task.info.status === 'running' && task.info.tags?.includes(tag)) {
      task.terminate(signal);
      killedIds.push(task.info.id);
    }
  }
  return killedIds;
}
```

**Design Decisions:**
- Exact string matching for tags
- No partial or regex matching
- Consistent return value (array of IDs)
- Atomic operation (all or none)