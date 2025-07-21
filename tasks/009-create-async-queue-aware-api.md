# Task 009: Create Async Queue-Aware API

## Objective

Provide a proper async API that works naturally with queuing, allowing developers to await task completion and handle queue-related events properly.

## Background

The current synchronous API is great for backward compatibility but doesn't work well with queuing:
- Can't wait for queued tasks to start
- No way to handle queue errors gracefully
- Difficult to coordinate with queue state
- No natural way to wait for task completion

This task adds async variants that provide:
- Promise-based task lifecycle
- Proper error handling
- Queue event integration
- Natural async patterns

## Design

### 1. Async Method Variants

```typescript
interface ProcessManager {
  // Existing sync API (unchanged)
  start(opts: ProcessTaskOpts): TaskInfo;
  
  // New async APIs
  startAsync(opts: ProcessTaskOpts): Promise<TaskInfo>;
  startAndWait(opts: ProcessTaskOpts): Promise<ExitResult>;
  
  // Batch operations
  startAll(optsList: ProcessTaskOpts[]): TaskInfo[];
  startAllAsync(optsList: ProcessTaskOpts[]): Promise<TaskInfo[]>;
  
  // Wait for existing tasks
  waitForTask(taskId: string): Promise<ExitResult>;
  waitForAll(taskIds?: string[]): Promise<ExitResult[]>;
}

interface ExitResult {
  taskInfo: TaskInfo;
  exitCode: number | null;
  signal: string | null;
  duration: number;
  stdout: string;
  stderr: string;
}
```

### 2. Task State Promises

```typescript
interface TaskHandle {
  readonly info: TaskInfo;
  
  // Wait for state transitions
  onQueued(): Promise<void>;
  onStarted(): Promise<void>;
  onCompleted(): Promise<ExitResult>;
  
  // Combined convenience methods
  waitToStart(): Promise<void>;  // queued -> running
  waitToFinish(): Promise<ExitResult>; // running -> exited
  
  // Control
  cancel(): void;  // Remove from queue if queued
  kill(signal?: number): void;
}
```

## Implementation

### 1. Enhanced ProcessManager

```typescript
// src/core/ProcessManager.ts

export class ProcessManager extends EventEmitter {
  async startAsync(opts: ProcessTaskOpts): Promise<TaskInfo> {
    const enhancedOpts = this.enhanceOptions(opts);
    const task = new ProcessTask(enhancedOpts);
    this.#tasks.set(task.info.id, task);
    
    if (this.shouldRunImmediately(opts)) {
      // Immediate start - still sync
      task.run();
      return task.info;
    } else {
      // Queue and wait for start
      task.info.status = 'queued';
      
      // Add to queue with promise tracking
      await this.#queue.add(
        () => this.runTaskSafely(task),
        {
          priority: opts.queue?.priority,
          signal: opts.queue?.signal
        }
      );
      
      // Task should be running now
      return task.info;
    }
  }
  
  async startAndWait(opts: ProcessTaskOpts): Promise<ExitResult> {
    const taskInfo = await this.startAsync(opts);
    return this.waitForTask(taskInfo.id);
  }
  
  async startAll(optsList: ProcessTaskOpts[]): Promise<TaskInfo[]> {
    // Respect queue ordering for multiple tasks
    const results: TaskInfo[] = [];
    
    for (const opts of optsList) {
      if (this.shouldRunImmediately(opts)) {
        // Immediate tasks start in parallel
        results.push(this.start(opts));
      } else {
        // Queue tasks serially to maintain order
        const info = await this.startAsync(opts);
        results.push(info);
      }
    }
    
    return results;
  }
  
  async startAllAsync(optsList: ProcessTaskOpts[]): Promise<TaskInfo[]> {
    // All tasks start async, parallel where possible
    const promises = optsList.map(opts => this.startAsync(opts));
    return Promise.all(promises);
  }
  
  async waitForTask(taskId: string): Promise<ExitResult> {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    return new Promise((resolve, reject) => {
      // If already completed, resolve immediately
      if (task.info.status === 'exited' || 
          task.info.status === 'killed' || 
          task.info.status === 'timeout') {
        resolve(this.createExitResult(task));
        return;
      }
      
      // If failed to start, reject
      if (task.info.status === 'start-failed') {
        reject(task.info.error || new Error('Task failed to start'));
        return;
      }
      
      // Wait for completion
      const onExit = () => {
        task.off('exit', onExit);
        task.off('error', onError);
        resolve(this.createExitResult(task));
      };
      
      const onError = (error: Error) => {
        task.off('exit', onExit);
        task.off('error', onError);
        reject(error);
      };
      
      task.on('exit', onExit);
      task.on('error', onError);
    });
  }
  
  async waitForAll(taskIds?: string[]): Promise<ExitResult[]> {
    const ids = taskIds || Array.from(this.#tasks.keys());
    const promises = ids.map(id => this.waitForTask(id));
    return Promise.all(promises);
  }
  
  private createExitResult(task: ProcessTask): ExitResult {
    return {
      taskInfo: task.info,
      exitCode: task.info.exitCode ?? null,
      signal: task.info.signal ?? null,
      duration: (task.info.exitedAt ?? Date.now()) - task.info.startedAt,
      stdout: this.getTaskOutput(task.info.id, 'stdout'),
      stderr: this.getTaskOutput(task.info.id, 'stderr')
    };
  }
  
  private getTaskOutput(taskId: string, stream: 'stdout' | 'stderr'): string {
    // Read from log file or buffered output
    try {
      const logPath = this.#tasks.get(taskId)?.info.logFile;
      if (logPath && fs.existsSync(logPath)) {
        return fs.readFileSync(logPath, 'utf-8');
      }
    } catch (error) {
      // Log file not available
    }
    return '';
  }
}
```

### 2. TaskHandle Implementation

```typescript
// src/core/TaskHandle.ts

export class TaskHandle {
  readonly #task: ProcessTask;
  readonly #manager: ProcessManager;
  
  constructor(task: ProcessTask, manager: ProcessManager) {
    this.#task = task;
    this.#manager = manager;
  }
  
  get info(): TaskInfo {
    return { ...this.#task.info }; // Return copy
  }
  
  async onQueued(): Promise<void> {
    if (this.#task.info.status === 'queued') return;
    
    return new Promise((resolve) => {
      const handler = (info: TaskInfo) => {
        if (info.id === this.#task.info.id) {
          this.#task.off('queued', handler);
          resolve();
        }
      };
      this.#task.on('queued', handler);
    });
  }
  
  async onStarted(): Promise<void> {
    if (this.#task.info.status === 'running') return;
    
    return new Promise((resolve, reject) => {
      if (this.#task.info.status === 'start-failed') {
        reject(this.#task.info.error);
        return;
      }
      
      const onStarted = () => {
        this.#task.off('started', onStarted);
        this.#task.off('error', onError);
        resolve();
      };
      
      const onError = (error: Error) => {
        this.#task.off('started', onStarted);
        this.#task.off('error', onError);
        reject(error);
      };
      
      this.#task.on('started', onStarted);
      this.#task.on('error', onError);
    });
  }
  
  async onCompleted(): Promise<ExitResult> {
    return this.#manager.waitForTask(this.#task.info.id);
  }
  
  async waitToStart(): Promise<void> {
    if (this.#task.info.status === 'running') return;
    if (this.#task.info.status === 'queued') {
      await this.onStarted();
    }
  }
  
  async waitToFinish(): Promise<ExitResult> {
    await this.waitToStart();
    return this.onCompleted();
  }
  
  cancel(): void {
    if (this.#task.info.status === 'queued') {
      // Remove from queue
      this.#manager.cancelTask(this.#task.info.id);
    }
  }
  
  kill(signal: number = 15): void {
    this.#manager.kill(this.#task.info.id, signal);
  }
}
```

### 3. Update ProcessManager to Return Handles

```typescript
// src/core/ProcessManager.ts

export class ProcessManager {
  // Enhanced methods that return handles
  startWithHandle(opts: ProcessTaskOpts): TaskHandle {
    const task = this.createTask(opts);
    this.executeTask(task, opts);
    return new TaskHandle(task, this);
  }
  
  async startAsyncWithHandle(opts: ProcessTaskOpts): Promise<TaskHandle> {
    const task = this.createTask(opts);
    await this.executeTaskAsync(task, opts);
    return new TaskHandle(task, this);
  }
  
  getTaskHandle(taskId: string): TaskHandle | undefined {
    const task = this.#tasks.get(taskId);
    return task ? new TaskHandle(task, this) : undefined;
  }
  
  cancelTask(taskId: string): boolean {
    const task = this.#tasks.get(taskId);
    if (!task || task.info.status !== 'queued') {
      return false;
    }
    
    // Remove from queue and mark as cancelled
    this.#queue.remove(taskId);
    task.info.status = 'cancelled';
    task.emit('cancelled', task.info);
    return true;
  }
}
```

## Usage Examples

### 1. Basic Async Usage

```typescript
// Start and wait for completion
const result = await manager.startAndWait({
  cmd: ['webpack', '--mode=production']
});
console.log(`Build completed in ${result.duration}ms`);
console.log(`Exit code: ${result.exitCode}`);
```

### 2. Handle-Based Control

```typescript
// Get more control with handles
const handle = manager.startWithHandle({
  cmd: ['long-running-service'],
  queue: { priority: 10 }
});

// Wait for it to start
await handle.waitToStart();
console.log('Service started, PID:', handle.info.pid);

// Do other work...

// Cancel if needed
if (shouldCancel) {
  handle.cancel();
}

// Or wait for completion
const result = await handle.onCompleted();
```

### 3. Batch Operations

```typescript
// Start multiple related tasks
const buildTasks = [
  { cmd: ['npm', 'run', 'build:frontend'] },
  { cmd: ['npm', 'run', 'build:backend'] },
  { cmd: ['npm', 'run', 'build:docs'] }
];

// Start all and wait for completion
const results = await Promise.all(
  buildTasks.map(opts => manager.startAndWait(opts))
);

console.log('All builds completed');
results.forEach((result, i) => {
  console.log(`Task ${i}: ${result.exitCode === 0 ? 'SUCCESS' : 'FAILED'}`);
});
```

### 4. Queue-Aware Patterns

```typescript
// Wait for queue to have space
await manager.queue.onSizeLessThan(5);

// Start high-priority task
const critical = await manager.startAsync({
  cmd: ['critical-process'],
  queue: { priority: 100 }
});

// Wait for all tasks to complete
await manager.waitForAll();
```

## Error Handling

### 1. Queue Errors

```typescript
try {
  const info = await manager.startAsync({
    cmd: ['task'],
    queue: { timeout: 5000 }
  });
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Task timed out in queue');
  } else if (error.name === 'AbortError') {
    console.log('Task was cancelled');
  }
}
```

### 2. Task Errors

```typescript
try {
  const result = await manager.startAndWait({
    cmd: ['failing-command']
  });
} catch (error) {
  console.log('Task failed:', error.message);
  console.log('Exit code:', error.exitCode);
}
```

## Dependencies

- Task 007 (configurable queue)
- Task 008 (immediate start)

## Success Criteria

- Natural async/await patterns
- Proper promise lifecycle
- Good error handling
- No breaking changes to sync API
- Performance is reasonable
- Clear documentation with examples