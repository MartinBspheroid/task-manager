# Queue Configuration API Design

## Overview

This document specifies the design for the ProcessManager queue configuration API. The design maintains full backward compatibility while enabling powerful queue features through opt-in configuration.

## Design Principles

1. **Backward Compatibility**: Existing code continues to work unchanged
2. **Opt-in Behavior**: Queue features are disabled by default
3. **Progressive Enhancement**: Users can adopt features incrementally
4. **Flexible Configuration**: Multiple configuration levels (global, per-task)
5. **Runtime Adjustability**: Queue behavior can be modified during execution
6. **Intuitive API**: Follows existing ProcessManager patterns

## Core Interfaces

### QueueOptions (Global Configuration)

```typescript
interface QueueOptions {
  /** Maximum concurrent tasks (default: Infinity = disabled) */
  concurrency?: number;
  
  /** Rate limiting: max tasks per interval in milliseconds */
  interval?: number;
  intervalCap?: number;
  
  /** Auto-start queued tasks (default: true) */
  autoStart?: boolean;
  
  /** Queue implementation class (default: built-in p-queue) */
  queueClass?: QueueClass;
  
  /** Emit queue events on ProcessManager (default: false) */
  emitQueueEvents?: boolean;
  
  /** Default task timeout in milliseconds */
  timeout?: number;
  
  /** Throw on timeout (default: true) */
  throwOnTimeout?: boolean;
}
```

### TaskQueueOptions (Per-Task Configuration)

```typescript
interface TaskQueueOptions {
  /** Skip queue and start immediately */
  immediate?: boolean;
  
  /** Task priority (higher runs first) */
  priority?: number;
  
  /** Custom timeout for this specific task */
  timeout?: number;
  
  /** Unique identifier for priority adjustments */
  id?: string;
  
  /** Task metadata for queue filtering and management */
  metadata?: Record<string, unknown>;
  
  /** AbortSignal for task cancellation */
  signal?: AbortSignal;
}
```

### QueueInterface (Queue Management)

```typescript
interface QueueInterface {
  /** Pause processing new tasks */
  pause(): void;
  
  /** Resume processing */
  resume(): void;
  
  /** Clear pending tasks */
  clear(): void;
  
  /** Get queue statistics */
  stats(): QueueStats;
  
  /** Check if queue is idle (no pending tasks) */
  isIdle(): boolean;
  
  /** Check if queue is empty (no waiting tasks) */
  isEmpty(): boolean;
  
  /** Wait for queue to become empty */
  onEmpty(): Promise<void>;
  
  /** Wait for queue to become idle */
  onIdle(): Promise<void>;
  
  /** Wait for queue size to be less than specified */
  onSizeLessThan(size: number): Promise<void>;
  
  /** Get number of tasks with specific criteria */
  sizeBy(options: Partial<TaskQueueOptions>): number;
  
  /** Change priority of a queued task by id */
  setPriority(id: string, priority: number): void;
}
```

## API Usage Patterns

### 1. Default Behavior (No Queue)

```typescript
// Existing code works unchanged
const manager = new ProcessManager();
const info = manager.start({ cmd: ['task'] }); // Immediate execution
```

### 2. Basic Concurrency Limiting

```typescript
const manager = new ProcessManager({
  queue: { concurrency: 3 }
});

// Only 3 tasks run simultaneously
for (let i = 0; i < 10; i++) {
  manager.start({ cmd: ['task', i.toString()] });
}
```

### 3. Runtime Queue Configuration

```typescript
const manager = new ProcessManager();

// Enable queuing later
manager.setQueueOptions({ 
  concurrency: 5,
  emitQueueEvents: true 
});

// Tasks now respect concurrency limit
manager.start({ cmd: ['queued-task'] });
```

### 4. Priority-Based Execution

```typescript
manager.setQueueOptions({ concurrency: 1 });

// Low priority batch job
manager.start({
  cmd: ['batch-process'],
  queue: { priority: 1 }
});

// High priority user request
manager.start({
  cmd: ['user-task'],
  queue: { priority: 100 }
});
```

### 5. Immediate Execution (Skip Queue)

```typescript
// Emergency task bypasses queue
manager.start({
  cmd: ['urgent-fix'],
  queue: { immediate: true }
});
```

### 6. Rate Limiting

```typescript
manager.setQueueOptions({
  interval: 60000,    // 1 minute
  intervalCap: 10     // Max 10 tasks per minute
});
```

### 7. Queue Management

```typescript
const queue = manager.queue;

if (queue) {
  // Monitor queue state
  console.log(queue.stats());
  
  // Pause processing
  queue.pause();
  
  // Wait for completion
  await queue.onIdle();
  
  // Resume processing
  queue.resume();
}
```

### 8. Queue Events

```typescript
manager.setQueueOptions({ emitQueueEvents: true });

manager.on('queue:add', (task) => {
  console.log('Task added to queue:', task.id);
});

manager.on('queue:active', (task) => {
  console.log('Task started:', task.id);
});

manager.on('queue:completed', (task) => {
  console.log('Task completed:', task.id);
});

manager.on('queue:idle', () => {
  console.log('Queue is idle');
});
```

### 9. Task Cancellation

```typescript
const controller = new AbortController();

const info = manager.start({
  cmd: ['long-task'],
  queue: { signal: controller.signal }
});

// Cancel the task
setTimeout(() => controller.abort(), 5000);
```

### 10. Priority Adjustment

```typescript
manager.start({
  cmd: ['adjustable-task'],
  queue: { 
    priority: 1,
    id: 'my-task' 
  }
});

// Increase priority later
manager.queue?.setPriority('my-task', 10);
```

## ProcessManager API Extensions

### Constructor Options

```typescript
class ProcessManager {
  constructor(options?: {
    queue?: QueueOptions;
    // ... existing options
  });
}
```

### Queue Configuration Methods

```typescript
class ProcessManager {
  /** Update queue configuration at runtime */
  setQueueOptions(options: QueueOptions): void;
  
  /** Get current queue configuration */
  getQueueOptions(): QueueOptions;
  
  /** Access queue directly for advanced operations */
  get queue(): QueueInterface | undefined;
  
  /** Check if queue functionality is available */
  supportsQueue(): boolean;
}
```

## Migration Strategy

### Phase 1: Backward Compatibility (Default)
- Queue disabled by default (concurrency: Infinity)
- All existing code works unchanged
- No breaking changes to public API

### Phase 2: Explicit Opt-in
```typescript
// Must explicitly enable queue features
manager.setQueueOptions({ concurrency: 5 });
```

### Phase 3: Feature Detection
```typescript
// Code can detect queue support
if (manager.supportsQueue()) {
  manager.setQueueOptions({ concurrency: 5 });
}
```

### Phase 4: Gradual Adoption
- Teams can enable per-manager instance
- No global configuration changes required
- Can test in development first

## Error Handling

### Invalid Configuration
```typescript
// Throws error for invalid options
manager.setQueueOptions({ concurrency: -1 }); // Error
```

### Queue Access Without Enable
```typescript
// Returns undefined if queue not enabled
const queue = manager.queue; // undefined if disabled
```

### Task Errors in Queue
```typescript
// Errors propagate through promise rejection
try {
  await manager.start({ cmd: ['failing-task'] });
} catch (error) {
  console.error('Task failed:', error);
}
```

## Performance Considerations

### Memory Usage
- Queue instances are created only when enabled
- Completed tasks are cleaned up automatically
- Queue statistics track totals without storing task history

### CPU Overhead
- Minimal overhead when queue disabled (default)
- Event emission only when explicitly enabled
- Efficient priority queue implementation

### Concurrency Control
- True concurrency limiting (not just setTimeout)
- Proper backpressure handling
- Immediate execution bypass available

## Advanced Features

### Custom Queue Implementation
```typescript
class PriorityQueue {
  // Custom queue logic
}

manager.setQueueOptions({
  queueClass: PriorityQueue,
  concurrency: 5
});
```

### Task Metadata and Filtering
```typescript
manager.start({
  cmd: ['analytics-task'],
  queue: {
    metadata: { 
      type: 'analytics',
      user: 'admin' 
    }
  }
});

// Count analytics tasks
const count = queue.sizeBy({ 
  metadata: { type: 'analytics' } 
});
```

### Complex Workflows
```typescript
// Sequential processing
manager.setQueueOptions({ concurrency: 1 });

const step1 = manager.start({ cmd: ['step1'], queue: { priority: 3 } });
const step2 = manager.start({ cmd: ['step2'], queue: { priority: 2 } });
const step3 = manager.start({ cmd: ['step3'], queue: { priority: 1 } });

await Promise.all([step1, step2, step3]);
```

## Implementation Timeline

1. **Task 004**: API Design (Current) ✓
2. **Task 005**: Abstraction Interfaces
3. **Task 006**: Backward Compatibility Plan
4. **Task 007**: Core Queue Implementation
5. **Task 008**: Immediate Start Mode
6. **Task 009**: Async Queue-Aware API
7. **Task 010**: Queue Management Methods

## Success Criteria

- ✅ API is intuitive and follows existing patterns
- ✅ Backward compatibility is maintained (default disabled)
- ✅ Common use cases are simple (concurrency limiting)
- ✅ Advanced use cases are possible (custom queues, priority)
- ✅ Migration path is clear (progressive opt-in)
- ✅ Performance overhead is minimal when disabled
- ✅ Runtime configuration is supported
- ✅ Queue management is comprehensive