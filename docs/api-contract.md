# ProcessManager API Contract

This document establishes the formal API contract for the ProcessManager system. These guarantees MUST be maintained for backward compatibility.

## Core API Methods

### ProcessManager.start(opts: ProcessTaskOpts): TaskInfo

#### Method Signature
```typescript
interface ProcessTaskOpts {
  cmd: string[];                    // Required: command and arguments
  logDir: string;                   // Required: directory for log files  
  idleTimeoutMs?: number;           // Optional: idle timeout (default: 5 minutes)
  tags?: string[];                  // Optional: tags for grouping
  hooks?: HookCallbacks;            // Optional: lifecycle hooks
  hookManager?: HookManager;        // Optional: custom hook manager
}
```

#### Synchronous Guarantees
- **MUST return immediately** - execution time < 100ms under normal conditions
- **MUST spawn process before return** - subprocess created synchronously
- **MUST populate PID** - `info.pid > 0` unless spawn fails
- **MUST set initial status** - either `'running'` or `'start-failed'`
- **MUST set startedAt timestamp** - `Date.now()` when process spawns

#### Return Value Contract
```typescript
interface TaskInfo {
  id: string;          // UUID v4, guaranteed unique
  cmd: string[];       // Exact copy of input command
  pid: number;         // Process ID (> 0) or -1 if spawn failed
  startedAt: number;   // Epoch timestamp of spawn attempt
  status: TaskStatus;  // 'running' or 'start-failed' on return
  logFile: string;     // Absolute path to log file
  tags?: string[];     // Copy of input tags (if provided)
  exitedAt?: number;   // undefined on return (set later)
  exitCode?: number;   // undefined on return (set later) 
  startError?: Error;  // defined only if status='start-failed'
}
```

#### Error Conditions
- **File system errors** - log directory creation may fail silently
- **Invalid commands** - spawn failure results in `start-failed` status, no exception
- **Resource exhaustion** - spawn failure handled gracefully
- **Permission errors** - spawn failure handled gracefully

#### Side Effects
- **Task storage** - task added to internal Map with UUID key
- **Global hook merging** - task hooks merged with global hooks
- **Log file creation** - log file opened for writing
- **Process spawn** - subprocess created with stdio pipes

### ProcessManager.list(): TaskInfo[]

#### Return Value Contract
- **MUST return all tasks** - both running and completed
- **MUST return copies** - TaskInfo objects safe to modify
- **MUST maintain order** - consistent ordering (insertion order)
- **MUST be current** - reflects state at time of call

#### Performance Guarantees
- **O(n) complexity** - where n is total number of tasks created
- **No side effects** - read-only operation
- **Thread safe** - safe to call from any context

### ProcessManager.listRunning(): TaskInfo[]

#### Return Value Contract
- **MUST return only running tasks** - `status === 'running'`
- **MUST return copies** - TaskInfo objects safe to modify
- **MUST be real-time** - reflects current process status

#### Filtering Contract
- **Exact status match** - only `'running'` status included
- **No race conditions** - status updates are synchronous
- **Consistent snapshot** - all tasks from same point in time

### ProcessManager.kill(id: string, signal?: NodeJS.Signals): void

#### Input Contract
- **id parameter** - MUST be valid UUID string
- **signal parameter** - MUST be valid NodeJS signal or undefined

#### Error Conditions
- **MUST throw Error** - if task ID not found
- **Error message format** - `"task ${id} not found"`
- **No-op for terminated tasks** - safe to call on already-dead processes

#### Side Effects
- **Process termination** - sends signal to subprocess
- **Status update** - task status becomes `'killed'`
- **Hook execution** - `onTerminated` hooks fire
- **Event emission** - `'exit'` event emitted

### ProcessManager.write(id: string, input: string): void

#### Input Contract
- **id parameter** - MUST be valid task UUID
- **input parameter** - MUST be string data

#### Error Conditions  
- **MUST throw Error** - if task ID not found
- **Error message format** - `"task ${id} not found"`
- **Silent failure** - if process has no stdin or is terminated

#### Side Effects
- **Data transmission** - input written to process stdin
- **No echo or confirmation** - fire-and-forget operation

### ProcessManager.killAll(signal?: NodeJS.Signals): string[]

#### Return Value Contract
- **MUST return killed task IDs** - array of UUID strings
- **MUST include only running tasks** - terminated tasks ignored
- **MUST be complete** - all running tasks at call time

#### Side Effects
- **Bulk termination** - all running processes receive signal  
- **Status updates** - all killed tasks status becomes `'killed'`
- **Hook execution** - hooks fire for each terminated task

### ProcessManager.killByTag(tag: string, signal?: NodeJS.Signals): string[]

#### Input Contract
- **tag parameter** - MUST be exact string match

#### Return Value Contract
- **MUST return killed task IDs** - array of UUID strings
- **MUST filter by tag** - only tasks with matching tag
- **MUST filter by status** - only running tasks included

#### Tag Matching Rules
- **Exact string match** - case-sensitive comparison
- **Array inclusion** - `task.tags?.includes(tag)`
- **Undefined handling** - tasks without tags never match

## Hook System Contract

### HookCallbacks Interface
```typescript
interface HookCallbacks {
  onSuccess?: OnSuccessHook[];      // Exit code 0
  onFailure?: OnFailureHook[];      // Exit code ≠ 0  
  onTerminated?: OnTerminatedHook[]; // Killed by signal
  onTimeout?: OnTimeoutHook[];       // Idle timeout
  onTaskStartFail?: OnTaskStartFailHook[]; // Spawn failure
  onChange?: OnChangeHook[];         // Output produced
}
```

### Hook Execution Contract

#### Timing Guarantees
- **onSuccess/onFailure/onTerminated/onTimeout** - fire on process exit
- **onTaskStartFail** - fires immediately on spawn failure
- **onChange** - fires on each output chunk

#### Execution Properties
- **Timeout protection** - 5 second limit per hook
- **Error isolation** - hook failures don't affect process
- **Parallel execution** - multiple hooks run concurrently
- **No return value** - hooks are fire-and-forget

#### Hook Merging Rules
- **Global hooks** - apply to all tasks
- **Local hooks** - specific to individual task
- **Merge behavior** - local hooks appended to global hooks
- **Array concatenation** - `[...global, ...local]`

## Event System Contract

### EventEmitter Interface
ProcessTask extends EventEmitter with these events:

#### 'exit' Event
- **Timing** - fired when process terminates (any reason)
- **Arguments** - `(taskInfo: TaskInfo)`
- **Guarantees** - fired exactly once per task

#### 'start-failed' Event  
- **Timing** - fired immediately on spawn failure
- **Arguments** - `(taskInfo: TaskInfo, error: Error)`
- **Guarantees** - fired only for failed spawns

## Task Lifecycle Contract

### Status State Machine
```
                    ┌─ 'start-failed' (spawn fails)
                    │
[new] ─ spawn() ───┼─ 'running' ──┬─ exit() ─ 'exited'
                    │             ├─ kill() ─ 'killed'  
                    │             └─ timeout() ─ 'timeout'
```

#### Status Transition Rules
- **'running'** - MUST be initial status for successful spawns
- **'start-failed'** - MUST be set immediately on spawn failure
- **Final states** - 'exited', 'killed', 'timeout', 'start-failed'
- **No backwards transitions** - status changes are monotonic

### Timestamp Contract
- **startedAt** - MUST be set to `Date.now()` at spawn attempt
- **exitedAt** - MUST be set when process terminates
- **Duration calculation** - `exitedAt - startedAt` gives total runtime

## Performance Contracts

### Latency Requirements
- **start() method** - MUST complete within 100ms (95th percentile)
- **list() method** - MUST complete within 10ms (95th percentile)  
- **kill() method** - MUST complete within 50ms (95th percentile)

### Memory Guarantees
- **Task storage** - grows O(n) with number of tasks created
- **No automatic cleanup** - tasks persist indefinitely
- **GC-friendly** - completed tasks release subprocess references

### Concurrency Properties
- **No artificial limits** - can spawn unlimited processes
- **OS limits respected** - file descriptor and memory limits apply
- **Thread safety** - all methods safe from main thread

## Error Handling Contract

### Exception Types
- **task not found** - thrown by kill(), write() for invalid IDs
- **No exceptions for spawn failures** - handled via status/hooks
- **No exceptions for terminated processes** - operations are idempotent

### Error Recovery
- **Graceful degradation** - spawn failures don't crash system
- **Isolation** - process failures don't affect other tasks
- **Resource cleanup** - failed spawns don't leak resources

## Backward Compatibility Requirements

These contracts MUST be preserved across versions:

1. **Method signatures** - no breaking changes to public API
2. **Return value formats** - TaskInfo structure maintained
3. **Error behavior** - same exceptions for same conditions  
4. **Event timing** - hooks and events fire at same points
5. **Status values** - no removal of existing status types
6. **Performance characteristics** - no significant regressions
7. **Resource behavior** - same memory/FD usage patterns
8. **Concurrency model** - unlimited spawning preserved
9. **Hook execution** - same lifecycle points and timing
10. **Task persistence** - tasks remain in list indefinitely