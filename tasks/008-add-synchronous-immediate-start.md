# Task 008: Add Synchronous Immediate-Start Mode

## Objective

Ensure that tasks can bypass the queue and start immediately when requested, maintaining the synchronous API contract even when queuing is enabled.

## Background

Even with queuing enabled, there are scenarios where immediate execution is required:
- Emergency tasks that must run now
- System-critical operations
- Backward compatibility for specific tasks
- Tasks that manage their own concurrency

This task implements a reliable immediate-start mechanism that:
- Bypasses queue regardless of queue state
- Maintains synchronous execution guarantees
- Works even when queue is paused
- Provides clear API for this behavior

## Design

### 1. Task-Level Immediate Flag

```typescript
interface ProcessTaskOpts {
  // Existing options...
  
  queue?: {
    /** 
     * Force immediate execution, bypassing queue.
     * Task runs synchronously even if queue is full or paused.
     */
    immediate?: boolean;
    
    /** Priority (ignored if immediate=true) */
    priority?: number;
  };
}
```

### 2. Multiple API Entry Points

```typescript
class ProcessManager {
  // Standard API - respects queue unless immediate flag
  start(opts: ProcessTaskOpts): TaskInfo;
  
  // Explicit immediate start - always bypasses queue
  startImmediate(opts: ProcessTaskOpts): TaskInfo;
  
  // Async API - can wait for queued tasks
  startAsync(opts: ProcessTaskOpts): Promise<TaskInfo>;
}
```

## Implementation

### 1. Update ProcessManager

```typescript
// src/core/ProcessManager.ts

export class ProcessManager {
  start(opts: ProcessTaskOpts): TaskInfo {
    const enhancedOpts = this.enhanceOptions(opts);
    const task = new ProcessTask(enhancedOpts);
    this.#tasks.set(task.info.id, task);
    
    // Check if should run immediately
    if (this.shouldRunImmediately(opts)) {
      // Synchronous execution path
      try {
        task.run();
      } catch (error) {
        // Handle synchronous start failures
        task.info.status = 'start-failed';
        task.info.error = error;
      }
      return task.info;
    }
    
    // Queue execution path
    task.info.status = 'queued';
    this.#queue.add(
      () => this.runTaskSafely(task),
      {
        priority: opts.queue?.priority,
        signal: opts.queue?.signal
      }
    ).catch(error => {
      // Queue rejected task (timeout, cancelled, etc)
      this.handleQueueError(task, error);
    });
    
    return task.info;
  }
  
  startImmediate(opts: ProcessTaskOpts): TaskInfo {
    // Force immediate execution
    const immediateOpts = {
      ...opts,
      queue: { ...opts.queue, immediate: true }
    };
    return this.start(immediateOpts);
  }
  
  private shouldRunImmediately(opts: ProcessTaskOpts): boolean {
    // Run immediately if:
    // 1. Queue is effectively disabled (concurrency = Infinity)
    // 2. Explicit immediate flag is set
    // 3. Special bypass conditions (e.g., system tasks)
    
    return (
      this.#queue.concurrency === Infinity ||
      opts.queue?.immediate === true ||
      this.isSystemTask(opts)
    );
  }
  
  private isSystemTask(opts: ProcessTaskOpts): boolean {
    // Optional: auto-immediate for certain task types
    return opts.tags?.includes('system') || 
           opts.tags?.includes('critical');
  }
  
  private async runTaskSafely(task: ProcessTask): Promise<void> {
    try {
      task.run();
    } catch (error) {
      // Ensure errors don't crash the queue
      task.info.status = 'start-failed';
      task.info.error = error;
      this.emit('task:error', task.info, error);
    }
  }
  
  private handleQueueError(task: ProcessTask, error: Error): void {
    // Update task state for queue errors
    if (error.name === 'AbortError') {
      task.info.status = 'cancelled';
    } else if (error.name === 'TimeoutError') {
      task.info.status = 'queue-timeout';
    } else {
      task.info.status = 'queue-error';
    }
    task.info.error = error;
    this.emit('task:queue-error', task.info, error);
  }
}
```

### 2. Ensure ProcessTask Handles Immediate Start

```typescript
// src/core/ProcessTask.ts

export class ProcessTask extends EventEmitter {
  run(): void {
    // Guard against multiple runs
    if (this.#proc) {
      throw new Error('Task already started');
    }
    
    // Update status if transitioning from queued
    if (this.info.status === 'queued') {
      this.info.status = 'running';
      this.emit('dequeued', this.info);
    } else {
      // Direct start
      this.info.status = 'running';
    }
    
    this.info.startedAt = Date.now();
    
    try {
      this.#initializeProcess();
      this.emit('started', this.info);
    } catch (error) {
      this.#handleStartupFailure(error as Error);
      throw error; // Re-throw for caller to handle
    }
  }
}
```

### 3. CLI Support for Immediate Flag

```typescript
// src/cli/start.ts

// Add --immediate flag support
const args = process.argv.slice(2);
let immediate = false;
const tags: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--immediate') {
    immediate = true;
  } else if (args[i] === '--tag') {
    // existing tag parsing...
  }
  // ...
}

const taskInfo = manager.start({
  cmd: command,
  logDir: 'logs',
  tags,
  queue: immediate ? { immediate: true } : undefined
});
```

## Edge Cases

### 1. Queue is Paused

```typescript
test('immediate tasks run even when queue is paused', async () => {
  const manager = new ProcessManager({
    queue: { concurrency: 1, autoStart: false }
  });
  
  // Queue is paused
  manager.pauseQueue();
  
  // Normal task should be queued
  const queued = manager.start({ cmd: ['echo', 'queued'] });
  expect(queued.status).toBe('queued');
  
  // Immediate task should run
  const immediate = manager.start({
    cmd: ['echo', 'immediate'],
    queue: { immediate: true }
  });
  expect(immediate.status).toBe('running');
});
```

### 2. Queue is Full

```typescript
test('immediate tasks run even when queue is full', async () => {
  const manager = new ProcessManager({
    queue: { concurrency: 1 }
  });
  
  // Fill queue
  const slow = manager.start({ cmd: ['sleep', '1'] });
  const queued = manager.start({ cmd: ['echo', 'queued'] });
  
  expect(slow.status).toBe('running');
  expect(queued.status).toBe('queued');
  
  // Immediate task should still run
  const immediate = manager.start({
    cmd: ['echo', 'immediate'],
    queue: { immediate: true }
  });
  expect(immediate.status).toBe('running');
});
```

### 3. Resource Limits

```typescript
// Document that immediate tasks can exceed configured limits
test('immediate tasks can exceed concurrency limits', async () => {
  const manager = new ProcessManager({
    queue: { concurrency: 2 }
  });
  
  // Start 2 normal tasks (at limit)
  manager.start({ cmd: ['sleep', '1'] });
  manager.start({ cmd: ['sleep', '1'] });
  
  // Start 3 immediate tasks (exceed limit)
  const immediate1 = manager.start({
    cmd: ['echo', '1'],
    queue: { immediate: true }
  });
  const immediate2 = manager.start({
    cmd: ['echo', '2'],
    queue: { immediate: true }
  });
  const immediate3 = manager.start({
    cmd: ['echo', '3'],
    queue: { immediate: true }
  });
  
  // All immediate tasks should be running
  expect(immediate1.status).toBe('running');
  expect(immediate2.status).toBe('running');
  expect(immediate3.status).toBe('running');
  
  // Total running = 5 (exceeds limit of 2)
  const running = manager.listRunning();
  expect(running.length).toBe(5);
});
```

## Performance Considerations

1. **Fast Path for Immediate**
   - Skip queue entirely
   - No promise allocation
   - No event listener overhead

2. **Benchmarks**
   ```typescript
   // Immediate flag should have minimal overhead
   const start = process.hrtime.bigint();
   manager.startImmediate({ cmd: ['true'] });
   const end = process.hrtime.bigint();
   // Should be < 0.1ms
   ```

## Documentation

### API Examples

```typescript
// Example 1: Emergency task
manager.start({
  cmd: ['systemctl', 'restart', 'critical-service'],
  queue: { immediate: true },
  tags: ['emergency', 'system']
});

// Example 2: Using dedicated method
manager.startImmediate({
  cmd: ['kill', '-9', problematicPid]
});

// Example 3: Conditional immediate
const isUrgent = errorCount > threshold;
manager.start({
  cmd: ['process-logs'],
  queue: { 
    immediate: isUrgent,
    priority: isUrgent ? 100 : 10
  }
});
```

### Warning Documentation

```markdown
## Important: Immediate Tasks

When using `immediate: true`:
- Task bypasses ALL queue limits
- Runs even if queue is paused
- Can exceed concurrency settings
- No rate limiting applies

Use sparingly for truly urgent tasks. Overuse defeats
the purpose of queue management.
```

## Dependencies

- Task 007 (configurable queue implementation)

## Success Criteria

- Immediate tasks always start synchronously
- Queue state doesn't affect immediate tasks
- Performance overhead is minimal
- Clear documentation of behavior
- No breaking changes to existing API