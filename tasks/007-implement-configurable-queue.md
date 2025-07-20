# Task 007: Implement Configurable Queue

## Objective

Implement a properly configurable queue system that provides real value through concurrency control, rate limiting, and other queue features while maintaining backward compatibility.

## Background

The current implementation uses `concurrency: Infinity` which provides no value. This task implements:
- Configurable concurrency limits
- Rate limiting capabilities  
- Queue pause/resume
- Proper integration with ProcessManager
- Performance optimization for the no-queue case

## Implementation Plan

### 1. Create Queue Configuration Types

```typescript
// src/core/types/queue.ts

export interface QueueConfig {
  /** Max concurrent tasks. Infinity = no limit (default) */
  concurrency?: number;
  
  /** Rate limiting: time window in ms */
  interval?: number;
  
  /** Rate limiting: max tasks per interval */
  intervalCap?: number;
  
  /** Auto-start processing (default: true) */
  autoStart?: boolean;
  
  /** Default timeout for tasks in ms */
  timeout?: number;
  
  /** Enable for testing/debugging */
  throwOnTimeout?: boolean;
}

export interface TaskQueueOptions {
  /** Task priority (higher = sooner) */
  priority?: number;
  
  /** Skip queue and run immediately */
  immediate?: boolean;
  
  /** Task-specific timeout */
  timeout?: number;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export const DEFAULT_QUEUE_CONFIG: Required<QueueConfig> = {
  concurrency: Infinity,
  interval: undefined,
  intervalCap: undefined,
  autoStart: true,
  timeout: undefined,
  throwOnTimeout: false
};
```

### 2. Implement ProcessQueue with Real Configuration

```typescript
// src/core/ProcessQueue.ts

import PQueue from 'p-queue';
import { EventEmitter } from 'events';
import type { QueueConfig } from './types/queue';

export class ProcessQueue extends EventEmitter {
  readonly #queue: PQueue;
  readonly #config: Required<QueueConfig>;
  
  constructor(config: QueueConfig = {}) {
    super();
    this.#config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    
    // Only create p-queue if actually needed
    if (this.isEffectivelyDisabled()) {
      // Special fast-path queue for disabled state
      this.#queue = this.createNoOpQueue();
    } else {
      this.#queue = new PQueue({
        concurrency: this.#config.concurrency,
        interval: this.#config.interval,
        intervalCap: this.#config.intervalCap,
        autoStart: this.#config.autoStart,
        timeout: this.#config.timeout,
        throwOnTimeout: this.#config.throwOnTimeout
      });
      
      this.attachQueueListeners();
    }
  }
  
  private isEffectivelyDisabled(): boolean {
    return (
      this.#config.concurrency === Infinity &&
      !this.#config.interval &&
      !this.#config.intervalCap &&
      this.#config.autoStart
    );
  }
  
  private createNoOpQueue(): PQueue {
    // Optimized queue that immediately executes without overhead
    return {
      add: async (fn: () => any) => fn(),
      size: 0,
      pending: 0,
      // ... minimal implementation
    } as any;
  }
  
  private attachQueueListeners(): void {
    this.#queue.on('add', () => {
      this.emit('task:added', { size: this.size, pending: this.pending });
    });
    
    this.#queue.on('active', () => {
      this.emit('task:started', { size: this.size, pending: this.pending });
    });
    
    this.#queue.on('idle', () => {
      this.emit('queue:idle');
    });
    
    this.#queue.on('error', (error) => {
      this.emit('task:error', error);
    });
  }
  
  async add<T>(
    fn: () => Promise<T> | T,
    options?: TaskQueueOptions
  ): Promise<T> {
    // Fast path for immediate execution
    if (options?.immediate && !this.isEffectivelyDisabled()) {
      return fn();
    }
    
    return this.#queue.add(fn, {
      priority: options?.priority,
      signal: options?.signal,
      timeout: options?.timeout
    });
  }
  
  pause(): void {
    if (!this.isEffectivelyDisabled()) {
      this.#queue.pause();
      this.emit('queue:paused');
    }
  }
  
  resume(): void {
    if (!this.isEffectivelyDisabled()) {
      this.#queue.start();
      this.emit('queue:resumed');
    }
  }
  
  clear(): void {
    this.#queue.clear();
    this.emit('queue:cleared');
  }
  
  // Queue state getters
  get size(): number {
    return this.#queue.size;
  }
  
  get pending(): number {
    return this.#queue.pending;
  }
  
  get isPaused(): boolean {
    return this.#queue.isPaused;
  }
  
  get concurrency(): number {
    return this.#config.concurrency;
  }
  
  // Wait helpers
  onEmpty(): Promise<void> {
    return this.#queue.onEmpty();
  }
  
  onIdle(): Promise<void> {
    return this.#queue.onIdle();
  }
  
  onSizeLessThan(limit: number): Promise<void> {
    return this.#queue.onSizeLessThan(limit);
  }
  
  // Configuration updates
  setConcurrency(concurrency: number): void {
    if (concurrency !== this.#config.concurrency) {
      this.#config.concurrency = concurrency;
      this.#queue.concurrency = concurrency;
      this.emit('config:updated', { concurrency });
    }
  }
}
```

### 3. Update ProcessManager Integration

```typescript
// src/core/ProcessManager.ts

import { ProcessQueue } from './ProcessQueue';
import type { QueueConfig } from './types/queue';

export interface ProcessManagerOptions {
  defaultLogDir?: string;
  queue?: QueueConfig;
  hooks?: HookCallbacks;
}

export class ProcessManager {
  readonly #tasks = new Map<string, ProcessTask>();
  readonly #queue: ProcessQueue;
  readonly #hookManager = new HookManager();
  
  constructor(options: ProcessManagerOptions = {}) {
    this.#queue = new ProcessQueue(options.queue);
    
    // Listen to queue events if enabled
    if (this.#queue.concurrency !== Infinity) {
      this.setupQueueEventForwarding();
    }
  }
  
  private setupQueueEventForwarding(): void {
    this.#queue.on('queue:idle', () => {
      this.emit('queue:idle');
    });
    
    this.#queue.on('task:error', (error) => {
      this.emit('error', error);
    });
  }
  
  start(opts: ProcessTaskOpts): TaskInfo {
    const enhancedOpts = this.enhanceOptions(opts);
    const task = new ProcessTask(enhancedOpts);
    this.#tasks.set(task.info.id, task);
    
    // Determine execution path
    if (this.shouldRunImmediately(opts)) {
      // Fast path: immediate execution
      task.run();
      return task.info;
    } else {
      // Queue path
      task.info.status = 'queued';
      this.#queue.add(
        () => task.run(),
        opts.queue
      ).catch(error => {
        // Handle queue errors
        task.info.status = 'start-failed';
        task.info.error = error;
      });
      return task.info;
    }
  }
  
  private shouldRunImmediately(opts: ProcessTaskOpts): boolean {
    return (
      this.#queue.concurrency === Infinity ||
      opts.queue?.immediate === true
    );
  }
  
  // New async variant for queue-aware code
  async startAsync(opts: ProcessTaskOpts): Promise<TaskInfo> {
    const enhancedOpts = this.enhanceOptions(opts);
    const task = new ProcessTask(enhancedOpts);
    this.#tasks.set(task.info.id, task);
    
    if (this.shouldRunImmediately(opts)) {
      task.run();
    } else {
      task.info.status = 'queued';
      await this.#queue.add(
        () => task.run(),
        opts.queue
      );
    }
    
    return task.info;
  }
  
  // Queue management methods
  setQueueConcurrency(concurrency: number): void {
    this.#queue.setConcurrency(concurrency);
  }
  
  pauseQueue(): void {
    this.#queue.pause();
  }
  
  resumeQueue(): void {
    this.#queue.resume();
  }
  
  clearQueue(): void {
    this.#queue.clear();
  }
  
  getQueueStats(): QueueStats {
    return {
      size: this.#queue.size,
      pending: this.#queue.pending,
      isPaused: this.#queue.isPaused,
      concurrency: this.#queue.concurrency
    };
  }
  
  // Wait for queue conditions
  async waitForQueueIdle(): Promise<void> {
    return this.#queue.onIdle();
  }
  
  // Feature detection
  get supportsQueue(): boolean {
    return true;
  }
  
  isQueuingEnabled(): boolean {
    return this.#queue.concurrency !== Infinity;
  }
}
```

### 4. Update ProcessTask for Queue Awareness

```typescript
// src/core/ProcessTask.ts

// Add status transition when moving from queued to running
run(): void {
  if (this.info.status === 'queued') {
    this.info.status = 'running';
    this.info.startedAt = Date.now();
    this.emit('started', this.info);
  }
  
  // ... rest of run implementation
}
```

## Testing Strategy

### Unit Tests for ProcessQueue

```typescript
describe('ProcessQueue', () => {
  test('respects concurrency limit', async () => {
    const queue = new ProcessQueue({ concurrency: 2 });
    const running = new Set<number>();
    let maxConcurrent = 0;
    
    const tasks = Array.from({ length: 10 }, (_, i) => 
      queue.add(async () => {
        running.add(i);
        maxConcurrent = Math.max(maxConcurrent, running.size);
        await new Promise(r => setTimeout(r, 50));
        running.delete(i);
      })
    );
    
    await Promise.all(tasks);
    expect(maxConcurrent).toBe(2);
  });
  
  test('immediate flag bypasses queue', async () => {
    const queue = new ProcessQueue({ concurrency: 1 });
    const order: number[] = [];
    
    // Add slow task
    queue.add(async () => {
      await new Promise(r => setTimeout(r, 100));
      order.push(1);
    });
    
    // Add immediate task
    await queue.add(
      () => { order.push(2); },
      { immediate: true }
    );
    
    expect(order).toEqual([2]); // Immediate ran first
  });
});
```

### Integration Tests

```typescript
describe('ProcessManager with Queue', () => {
  test('queue disabled by default', () => {
    const manager = new ProcessManager();
    const info = manager.start({ cmd: ['echo', 'test'] });
    expect(info.status).toBe('running');
  });
  
  test('queue enabled with concurrency', async () => {
    const manager = new ProcessManager({
      queue: { concurrency: 2 }
    });
    
    const tasks = Array.from({ length: 5 }, (_, i) =>
      manager.start({ cmd: ['sleep', '0.1'] })
    );
    
    // First 2 should be running, rest queued
    const statuses = tasks.map(t => t.status);
    expect(statuses.filter(s => s === 'running').length).toBe(2);
    expect(statuses.filter(s => s === 'queued').length).toBe(3);
  });
});
```

## Performance Considerations

1. **Fast Path Optimization**
   - No queue overhead when disabled
   - Direct function call for immediate tasks
   - Minimal object allocation

2. **Memory Management**
   - Queue items cleaned up after execution
   - Event listeners properly removed
   - No retention of completed tasks in queue

3. **Benchmarks**
   ```typescript
   // Benchmark: No queue overhead when disabled
   const manager = new ProcessManager(); // No queue config
   const start = process.hrtime.bigint();
   for (let i = 0; i < 1000; i++) {
     manager.start({ cmd: ['true'] });
   }
   const end = process.hrtime.bigint();
   // Should be < 1ms overhead per task
   ```

## Dependencies

- Task 001 (clean codebase)
- Task 004 (API design)
- Task 005 (interfaces)
- Task 006 (compatibility plan)

## Success Criteria

- Concurrency limits actually work
- Rate limiting functions properly
- No performance regression when disabled
- All tests pass
- Queue events fire correctly
- Memory usage is reasonable