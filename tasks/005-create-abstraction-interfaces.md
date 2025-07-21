# Task 005: Create Abstraction Interfaces

## Objective

Define clear interfaces and abstractions that separate queue management from process management, enabling flexible implementation and testing.

## Background

Good abstractions will:
- Allow different queue implementations (p-queue, bull, custom)
- Enable unit testing with mock queues
- Separate concerns cleanly
- Support future extensions
- Maintain type safety

## Interface Design

### 1. Core Queue Interface

```typescript
// src/core/interfaces/IQueue.ts

export interface IQueue<T = unknown> {
  /** Add task to queue */
  add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R>;
  
  /** Add multiple tasks */
  addAll<R>(
    fns: Array<(context?: QueueContext) => Promise<R> | R>,
    options?: QueueTaskOptions
  ): Promise<R[]>;
  
  /** Queue control */
  pause(): void;
  resume(): void;
  clear(): void;
  
  /** Queue state */
  readonly size: number;
  readonly pending: number;
  readonly isPaused: boolean;
  
  /** Wait for conditions */
  onEmpty(): Promise<void>;
  onIdle(): Promise<void>;
  onSizeLessThan(limit: number): Promise<void>;
  
  /** Events */
  on(event: 'add', listener: (item: QueueItem<T>) => void): this;
  on(event: 'start', listener: (item: QueueItem<T>) => void): this;
  on(event: 'complete', listener: (item: QueueItem<T>, result: unknown) => void): this;
  on(event: 'error', listener: (error: Error, item: QueueItem<T>) => void): this;
  on(event: 'idle', listener: () => void): this;
  
  /** Lifecycle */
  destroy(): Promise<void>;
}

export interface QueueTaskOptions {
  priority?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface QueueContext {
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface QueueItem<T = unknown> {
  id: string;
  fn: () => Promise<T> | T;
  options?: QueueTaskOptions;
  addedAt: number;
  startedAt?: number;
}
```

### 2. Queue Factory Interface

```typescript
// src/core/interfaces/IQueueFactory.ts

export interface IQueueFactory {
  create(options: QueueOptions): IQueue;
}

export interface QueueOptions {
  concurrency?: number;
  interval?: number;
  intervalCap?: number;
  autoStart?: boolean;
  timeout?: number;
}
```

### 3. Process Runner Interface

```typescript
// src/core/interfaces/IProcessRunner.ts

export interface IProcessRunner {
  /** Start a process immediately */
  run(opts: ProcessRunOptions): ProcessHandle;
  
  /** Queue a process for later execution */
  queue(opts: ProcessRunOptions): Promise<ProcessHandle>;
  
  /** Check if queuing is enabled */
  isQueuingEnabled(): boolean;
}

export interface ProcessRunOptions {
  cmd: string[];
  logDir: string;
  idleTimeoutMs?: number;
  tags?: string[];
  hooks?: HookCallbacks;
  queue?: {
    immediate?: boolean;
    priority?: number;
  };
}

export interface ProcessHandle {
  readonly id: string;
  readonly info: TaskInfo;
  readonly events: EventEmitter;
  
  write(data: string | Uint8Array): void;
  kill(signal?: number): void;
  
  /** Wait for process to complete */
  wait(): Promise<ExitInfo>;
}

export interface ExitInfo {
  exitCode: number | null;
  signal: string | null;
  duration: number;
}
```

### 4. Task Lifecycle Interface

```typescript
// src/core/interfaces/ITaskLifecycle.ts

export interface ITaskLifecycle {
  /** Task state transitions */
  onQueued?(info: TaskInfo): void | Promise<void>;
  onStarting?(info: TaskInfo): void | Promise<void>;
  onRunning?(info: TaskInfo): void | Promise<void>;
  onCompleted?(info: TaskInfo, exit: ExitInfo): void | Promise<void>;
  onFailed?(info: TaskInfo, error: Error): void | Promise<void>;
}
```

## Implementation Strategy

### 1. Adapter Pattern for p-queue

```typescript
// src/core/adapters/PQueueAdapter.ts

import PQueue from 'p-queue';
import { IQueue, QueueOptions } from '../interfaces/IQueue';

export class PQueueAdapter implements IQueue {
  private pqueue: PQueue;
  
  constructor(options: QueueOptions) {
    this.pqueue = new PQueue({
      concurrency: options.concurrency ?? Infinity,
      interval: options.interval,
      intervalCap: options.intervalCap,
      autoStart: options.autoStart ?? true,
      timeout: options.timeout
    });
  }
  
  async add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R> {
    return this.pqueue.add(fn, {
      priority: options?.priority,
      signal: options?.signal
    });
  }
  
  // ... implement other methods
}
```

### 2. Mock Implementation for Testing

```typescript
// src/tests/mocks/MockQueue.ts

export class MockQueue implements IQueue {
  private tasks: QueueItem[] = [];
  private running = new Set<string>();
  
  async add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R> {
    const item: QueueItem = {
      id: randomUUID(),
      fn,
      options,
      addedAt: Date.now()
    };
    
    this.tasks.push(item);
    this.emit('add', item);
    
    // Immediate execution for testing
    this.running.add(item.id);
    this.emit('start', item);
    
    try {
      const result = await fn({ metadata: options?.metadata });
      this.emit('complete', item, result);
      return result;
    } catch (error) {
      this.emit('error', error, item);
      throw error;
    } finally {
      this.running.delete(item.id);
    }
  }
  
  // ... implement other methods
}
```

### 3. Null Queue (No-Op) for Backward Compatibility

```typescript
// src/core/adapters/NullQueue.ts

export class NullQueue implements IQueue {
  async add<R>(
    fn: (context?: QueueContext) => Promise<R> | R,
    options?: QueueTaskOptions
  ): Promise<R> {
    // Immediate execution, no queuing
    return fn({ metadata: options?.metadata });
  }
  
  pause(): void {
    // No-op
  }
  
  get size(): number {
    return 0;
  }
  
  // ... implement other methods as no-ops
}
```

## Usage in ProcessManager

```typescript
class ProcessManager {
  private runner: IProcessRunner;
  private queue?: IQueue;
  
  constructor(opts?: ProcessManagerOptions) {
    // Use null queue by default for backward compatibility
    this.queue = opts?.queue?.enabled 
      ? new PQueueAdapter(opts.queue)
      : new NullQueue();
      
    this.runner = new ProcessRunner(this.queue);
  }
  
  start(opts: ProcessTaskOpts): TaskInfo {
    if (opts.queue?.immediate || !this.queue) {
      // Immediate execution path
      const handle = this.runner.run(opts);
      return handle.info;
    } else {
      // Queued execution path
      const promise = this.runner.queue(opts);
      // Return info with 'queued' status
      return { ...info, status: 'queued' };
    }
  }
}
```

## Testing Benefits

With these interfaces, we can:

1. **Unit test queue logic separately**
   ```typescript
   const queue = new MockQueue();
   await queue.add(() => task());
   expect(queue.size).toBe(0);
   ```

2. **Test ProcessManager with mock queue**
   ```typescript
   const queue = new MockQueue();
   const manager = new ProcessManager({ queue });
   ```

3. **Test different queue implementations**
   ```typescript
   describe.each([
     ['PQueueAdapter', () => new PQueueAdapter({ concurrency: 2 })],
     ['CustomQueue', () => new CustomQueue({ concurrency: 2 })]
   ])('Queue implementation: %s', (name, createQueue) => {
     // Run same tests against different implementations
   });
   ```

## Dependencies

- Task 004 (API design for configuration)

## Success Criteria

- Interfaces are complete and cover all use cases
- Implementations are swappable
- Testing is simplified
- Type safety is maintained
- Future extensions are possible without breaking changes