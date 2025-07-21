# Task 011: Add Priority Support

## Objective

Implement task priority system that allows high-priority tasks to run before low-priority ones, with dynamic priority adjustment capabilities.

## Background

Priority queuing enables:
- Critical tasks to bypass normal queue order
- Batch jobs to run at low priority
- User-initiated tasks to have higher priority
- System maintenance at lowest priority
- Dynamic priority adjustment based on conditions

## Implementation

### 1. Priority Configuration

```typescript
interface TaskQueueOptions {
  /** Task priority: higher numbers run first (default: 0) */
  priority?: number;
  
  /** Auto-adjust priority over time */
  aging?: {
    enabled: boolean;
    increment: number;  // Priority increase per minute
    maxPriority: number;
  };
}

// Priority constants
export const PRIORITY = {
  CRITICAL: 1000,
  HIGH: 100,
  NORMAL: 0,
  LOW: -100,
  BATCH: -1000
} as const;
```

### 2. Enhanced p-queue Integration

```typescript
// src/core/ProcessQueue.ts

export class ProcessQueue {
  async add<T>(
    fn: () => Promise<T> | T,
    options?: TaskQueueOptions
  ): Promise<T> {
    const priority = this.calculateEffectivePriority(options);
    
    return this.#queue.add(fn, {
      priority,
      id: options?.id,
      signal: options?.signal
    });
  }
  
  private calculateEffectivePriority(options?: TaskQueueOptions): number {
    const base = options?.priority ?? 0;
    
    if (options?.aging?.enabled) {
      const age = Date.now() - (options.queuedAt || Date.now());
      const ageMinutes = age / (60 * 1000);
      const aging = ageMinutes * options.aging.increment;
      const maxPriority = options.aging.maxPriority;
      
      return Math.min(base + aging, maxPriority);
    }
    
    return base;
  }
  
  /** Update task priority by ID */
  setPriority(taskId: string, priority: number): boolean {
    return this.#queue.setPriority(taskId, priority);
  }
  
  /** Get tasks sorted by priority */
  getTasksByPriority(): QueuedTaskInfo[] {
    return this.#queue.sizeBy({ priority: true });
  }
}
```

## Testing

```typescript
test('priority ordering works correctly', async () => {
  const queue = new ProcessQueue({ concurrency: 1 });
  const results: number[] = [];
  
  // Start blocking task
  queue.add(async () => {
    await new Promise(r => setTimeout(r, 100));
    results.push(0);
  });
  
  // Add tasks with different priorities
  queue.add(() => results.push(1), { priority: PRIORITY.LOW });
  queue.add(() => results.push(2), { priority: PRIORITY.HIGH });
  queue.add(() => results.push(3), { priority: PRIORITY.NORMAL });
  
  await queue.onIdle();
  
  // Should run in priority order: 0, 2 (HIGH), 3 (NORMAL), 1 (LOW)
  expect(results).toEqual([0, 2, 3, 1]);
});
```

## Dependencies

- Task 007 (configurable queue)

## Success Criteria

- Tasks execute in priority order
- Priority can be adjusted dynamically
- Performance impact is minimal
- Clear priority constants available