# Current ProcessManager Behavior

This document establishes the baseline behavior of the ProcessManager system as of the stable implementation (post-Task 001 revert). This serves as the backward compatibility contract for future enhancements.

## System Overview

The ProcessManager provides immediate, synchronous process spawning with no queuing or artificial limits. Each task runs in its own subprocess with automatic logging, idle timeout detection, and event-driven lifecycle management.

## Core Components

### ProcessManager
- **Central orchestrator** managing a collection of ProcessTask instances
- **Immediate execution** - all tasks start synchronously upon request
- **Persistent storage** - retains all tasks in memory even after completion
- **Hook management** - supports global and per-task lifecycle hooks
- **Bulk operations** - provides filtering and bulk termination capabilities

### ProcessTask  
- **Individual process wrapper** around Bun's spawn API
- **Automatic logging** - stdout/stderr captured to individual files
- **Idle timeout** - kills processes with no output after configurable delay
- **Event emission** - EventEmitter-based status notifications
- **UUID identification** - each task has unique identifier

## API Behavior Contracts

### ProcessManager.start(opts: ProcessTaskOpts): TaskInfo

#### Synchronous Guarantees
- **Returns immediately** - method completes before process may finish
- **Process spawned synchronously** - subprocess created before return
- **PID available immediately** - `info.pid` populated (unless spawn fails)  
- **Status is deterministic**:
  - `'running'` - process successfully started
  - `'start-failed'` - process failed to spawn

#### Timing Characteristics
- **Same-tick execution** - process starts within current event loop tick
- **Immediate output possible** - first stdout/stderr can occur immediately
- **Idle timer starts immediately** - timeout begins counting from spawn
- **Hook execution** - lifecycle hooks fire synchronously where possible

#### Resource Management
- **No concurrency limits** - unlimited simultaneous processes
- **No rate limiting** - can spawn processes as fast as OS allows
- **Persistent task storage** - tasks remain in memory indefinitely
- **File handle management** - log files opened/closed per task

### ProcessManager.list(): TaskInfo[]

#### Behavior
- **Returns all tasks** - both running and completed
- **Snapshot consistency** - returns consistent view at call time
- **Memory ordering** - tasks returned in creation order
- **Deep copy semantics** - returned TaskInfo objects are safe to modify

### ProcessManager.listRunning(): TaskInfo[]

#### Behavior  
- **Returns only running tasks** - filters by `status === 'running'`
- **Real-time status** - reflects current process state
- **No race conditions** - status updates are synchronous

### ProcessManager.kill(id: string, signal?: NodeJS.Signals): void

#### Error Handling
- **Throws on unknown ID** - `Error("task ${id} not found")`
- **Idempotent for non-running tasks** - no error if already terminated
- **Signal defaults to SIGTERM** - graceful termination by default

## Task Lifecycle

### Status Transitions

```
[Initial] → 'running' → {'exited' | 'killed' | 'timeout' | 'start-failed'}
                    ↘ 'start-failed' (on spawn failure)
```

#### Status Definitions
- **`'running'`** - Process is actively executing
- **`'exited'`** - Process terminated naturally (any exit code)
- **`'killed'`** - Process terminated by external signal
- **`'timeout'`** - Process killed due to idle timeout
- **`'start-failed'`** - Process failed to spawn

### Event Emission Timing

ProcessTask emits events as EventEmitter:
- **Process spawn** - no specific event (immediate in constructor)
- **Process exit** - `'exit'` event with TaskInfo
- **Start failure** - `'start-failed'` event with TaskInfo and Error

### Hook Execution Points

Hooks execute at these lifecycle points:
- **`onSuccess`** - Process exited with code 0
- **`onFailure`** - Process exited with non-zero code  
- **`onTerminated`** - Process killed by signal
- **`onTimeout`** - Process killed by idle timeout
- **`onTaskStartFail`** - Process failed to spawn
- **`onChange`** - Process produced output (per chunk)

## Resource Usage Patterns

### Memory Profile
- **Per active task**: ~2-5 KB (ProcessTask object + streams + timers)
- **Per completed task**: ~1 KB (TaskInfo object only)
- **Log files**: Unbounded growth (never cleaned up automatically)
- **Global state**: ~1 KB (ProcessManager + HookManager)

### File Descriptor Usage
- **Per task**: 4 FDs (stdin, stdout, stderr, log file)
- **Cleanup timing**: FDs released when process exits
- **OS limits apply**: No artificial limits imposed

### CPU Characteristics
- **Spawn overhead**: ~1-5ms per process (OS dependent)
- **Monitoring overhead**: ~negligible (event-driven)
- **Hook execution**: Blocking (with 5s timeout protection)

## Logging Behavior

### Log File Management
- **Path pattern**: `${logDir}/${taskId}.log`
- **Content**: Combined stdout + stderr streams
- **Buffering**: Write-through (immediate flush)
- **Cleanup**: Never removed (persistent)

### Stream Handling
- **Realtime capture** - output written as produced
- **Idle detection** - monitors stream activity for timeout
- **Encoding**: UTF-8 text streams

## Concurrency Model

### No Built-in Limits
- **Unlimited concurrent processes** - only OS limits apply
- **No throttling** - processes start as fast as requested
- **No backpressure** - no mechanism to pause/queue requests

### OS Resource Limits
- **File descriptors** - typically 1024-4096 per process
- **Memory** - depends on subprocess behavior
- **CPU** - OS scheduler manages process priorities

## Error Handling

### Spawn Failures
**Causes**: Invalid commands, permission errors, resource exhaustion
**Behavior**: 
- TaskInfo status set to `'start-failed'`
- Error stored in `info.startError`
- `onTaskStartFail` hooks executed
- No process spawned, no PID assigned

### Runtime Failures
**Process crashes**: Status becomes `'exited'` with exit code
**Signals**: Status becomes `'killed'`
**Timeouts**: Status becomes `'timeout'`

### API Errors
**Invalid task ID**: Throws `Error` with descriptive message
**File system errors**: Log file creation failures handled gracefully

## Hook System

### Global vs Local Hooks
- **Global hooks** - apply to all tasks started after registration
- **Local hooks** - specific to individual task
- **Merging behavior** - local hooks are appended to global hooks

### Hook Execution
- **Timeout protection** - 5 second limit (configurable)
- **Error isolation** - hook failures don't crash process
- **Parallel execution** - multiple hooks of same type run concurrently
- **No return value handling** - hooks are fire-and-forget

## Performance Characteristics

### Latency
- **start() call**: < 10ms typically
- **Process spawn**: 1-50ms (OS dependent)
- **Status updates**: < 1ms (synchronous)

### Throughput
- **Process creation rate**: Limited by OS spawn performance
- **Monitoring overhead**: O(1) per active process
- **Memory growth**: O(n) with number of total tasks created

### Scalability Limits
- **Task storage**: Unbounded growth (never cleaned)
- **File descriptors**: OS limit (ulimit -n)
- **Memory**: Grows linearly with task count

## Backward Compatibility Constraints

These behaviors MUST be preserved in future versions:

1. **Synchronous API** - `start()` returns immediately
2. **Immediate execution** - no delays or queuing by default
3. **PID availability** - populated before method return
4. **Status consistency** - running/start-failed on return
5. **Task persistence** - tasks remain in list after completion
6. **Hook merging** - global + local hook combination
7. **Error throwing** - invalid IDs throw exceptions
8. **Event timing** - events fire at documented points
9. **Resource patterns** - no automatic cleanup
10. **Unlimited concurrency** - no artificial limits imposed