# Task 004: Design Queue Configuration API

## Objective

Design a flexible, intuitive API for configuring process queue behavior that maintains backward compatibility while enabling powerful queue features.

## Background

The queue configuration must support:
- Opt-in behavior (disabled by default for backward compatibility)
- Multiple configuration levels (global, per-task)
- Various queue strategies (concurrency, rate limiting, priority)
- Runtime adjustments
- Future extensibility

## Design Options Analysis

### Option 1: Constructor Configuration
```typescript
const manager = new ProcessManager({
  queue: {
    enabled: true,
    concurrency: 5,
    interval: 1000,
    intervalCap: 2
  }
});
```

**Pros**: Simple, clear, immutable
**Cons**: Can't change at runtime, all-or-nothing

### Option 2: Separate Queue Manager
```typescript
const queue = new ProcessQueue({ concurrency: 5 });
const manager = new ProcessManager({ queue });
```

**Pros**: Separation of concerns, queue reusable
**Cons**: More complex, requires coordination

### Option 3: Method-Based Configuration (Recommended)
```typescript
const manager = new ProcessManager();
// Default behavior - no queuing

// Enable queuing
manager.setQueueOptions({ 
  concurrency: 5,
  autoStart: true 
});

// Per-task override
manager.start({
  cmd: ['heavy-task'],
  queue: { 
    priority: 10,
    immediate: false 
  }
});
```

**Pros**: Flexible, backward compatible, runtime adjustable
**Cons**: More API surface

## Proposed API Design

### 1. ProcessManager Configuration

```typescript
interface QueueOptions {
  /** Maximum concurrent tasks (default: Infinity = disabled) */
  concurrency?: number;
  
  /** Rate limiting: max tasks per interval */
  interval?: number;
  intervalCap?: number;
  
  /** Auto-start queued tasks (default: true) */
  autoStart?: boolean;
  
  /** Queue implementation (default: built-in) */
  queueClass?: typeof Queue;
  
  /** Emit queue events (default: false) */
  emitQueueEvents?: boolean;
}

class ProcessManager {
  constructor(opts?: {
    queue?: QueueOptions;
    // ... other options
  });
  
  /** Update queue configuration at runtime */
  setQueueOptions(opts: QueueOptions): void;
  
  /** Get current queue configuration */
  getQueueOptions(): QueueOptions;
  
  /** Access queue directly for advanced operations */
  get queue(): QueueInterface | undefined;
}
```

### 2. Per-Task Queue Options

```typescript
interface ProcessTaskOpts {
  // ... existing options
  
  queue?: {
    /** Skip queue and start immediately */
    immediate?: boolean;
    
    /** Task priority (higher runs first) */
    priority?: number;
    
    /** Custom timeout for this task */
    timeout?: number;
    
    /** Task metadata for queue filtering */
    metadata?: Record<string, unknown>;
  };
}
```

### 3. Queue Management API

```typescript
interface QueueInterface {
  /** Pause processing new tasks */
  pause(): void;
  
  /** Resume processing */
  resume(): void;
  
  /** Clear pending tasks */
  clear(): void;
  
  /** Get queue statistics */
  stats(): {
    size: number;      // Waiting tasks
    pending: number;   // Running tasks
    paused: boolean;
  };
  
  /** Wait for queue conditions */
  onEmpty(): Promise<void>;
  onIdle(): Promise<void>;
  onSizeLessThan(size: number): Promise<void>;
}
```

### 4. Queue Events

```typescript
manager.on('queue:add', (task: TaskInfo) => {});
manager.on('queue:start', (task: TaskInfo) => {});
manager.on('queue:complete', (task: TaskInfo) => {});
manager.on('queue:error', (task: TaskInfo, error: Error) => {});
manager.on('queue:idle', () => {});
```

## Usage Examples

### Basic Concurrency Limit
```typescript
const manager = new ProcessManager({
  queue: { concurrency: 3 }
});

// Only 3 tasks run simultaneously
for (let i = 0; i < 10; i++) {
  manager.start({ cmd: ['task', i.toString()] });
}
```

### Rate Limiting
```typescript
manager.setQueueOptions({
  interval: 60000,    // 1 minute
  intervalCap: 10     // Max 10 tasks per minute
});
```

### Priority Tasks
```typescript
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

### Immediate Execution (Skip Queue)
```typescript
// Emergency task bypasses queue
manager.start({
  cmd: ['urgent-fix'],
  queue: { immediate: true }
});
```

## Migration Strategy

1. **Default Behavior**: Queue disabled (concurrency: Infinity)
2. **Explicit Opt-in**: Must set concurrency to enable
3. **Gradual Adoption**: Can enable per-manager instance
4. **Feature Detection**: Can check if queue is available

```typescript
// Backward compatible
const info = manager.start({ cmd: ['task'] }); // Works as before

// Opt into queuing
if (manager.supportsQueue?.()) {
  manager.setQueueOptions({ concurrency: 5 });
}
```

## Dependencies

- Task 003 (understand current behavior)
- Research p-queue API capabilities

## Success Criteria

- API is intuitive and consistent with existing patterns
- Backward compatibility is maintained
- Common use cases are easy
- Advanced use cases are possible
- Migration path is clear